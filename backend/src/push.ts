// Sends push notifications straight to Apple (APNs) with the team's Apple key: no third-party push
// service in between. Device tokens are the phone's APNs tokens (hex), registered via POST /push-token.
import { connect, constants, type ClientHttp2Session, type ClientHttp2Stream } from "node:http2";
import { pool } from "./db";
import { appleKey, signAppleJwt } from "./lib/apple-jwt";
import { isApnsDeviceToken } from "./lib/validate";

const TOPIC = process.env.APNS_TOPIC || "com.upvital.app";
// Xcode installs get sandbox tokens; TestFlight and App Store builds get production ones.
const PRODUCTION = "https://api.push.apple.com";
const SANDBOX = "https://api.sandbox.push.apple.com";
const TIMEOUT_MS = 10_000;
// Apple asks providers to keep connections open rather than reconnect per push (rapid reconnects
// look like a denial-of-service attack), so one connection per host is reused, closed when idle.
const IDLE_CLOSE_MS = 60_000;
// APNs wants one provider token reused: refreshed at most every 20 minutes, at least every 60.
const TOKEN_LIFETIME_MS = 40 * 60 * 1000;

let cachedToken: { jwt: string; createdAt: number } | null = null;
const sessions = new Map<string, ClientHttp2Session>();
// Each distinct APNs failure is logged once per server run (e.g. a test install's sandbox token
// when the key is production-only would otherwise log every morning).
const loggedFailures = new Set<string>();

function providerToken(): string | null {
  const key = appleKey();
  if (!key) return null;
  if (cachedToken && Date.now() - cachedToken.createdAt < TOKEN_LIFETIME_MS) return cachedToken.jwt;
  const jwt = signAppleJwt(key.keyId, key.privateKey, {
    iss: key.teamId,
    iat: Math.floor(Date.now() / 1000),
  });
  cachedToken = { jwt, createdAt: Date.now() };
  return jwt;
}

type ApnsResult = { status: number; reason?: string };

/** The open connection to an APNs host, or a new one. */
function sessionFor(host: string): ClientHttp2Session {
  const existing = sessions.get(host);
  if (existing && !existing.closed && !existing.destroyed) return existing;
  const session = connect(host);
  const forget = () => {
    if (sessions.get(host) === session) sessions.delete(host);
  };
  // The error listener also keeps a dropped connection from crashing the server.
  session.on("error", forget);
  session.on("goaway", forget);
  session.on("close", forget);
  // Closed after a minute idle. Not unref'd: a push in flight must keep the process alive (the
  // by-hand run of the hourly job ends with process.exit anyway).
  session.setTimeout(IDLE_CLOSE_MS, () => session.close());
  sessions.set(host, session);
  return session;
}

/** One push over HTTP/2. Never rejects: network failures come back as status 0. */
function sendToApns(host: string, deviceToken: string, payload: string, jwt: string): Promise<ApnsResult> {
  return new Promise((resolve) => {
    let settled = false;
    let status = 0;
    let body = "";
    const finish = (result: ApnsResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let request: ClientHttp2Stream;
    try {
      request = sessionFor(host).request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        authorization: `bearer ${jwt}`,
        "apns-topic": TOPIC,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });
    } catch {
      // The connection was closing as we asked; the next push opens a new one.
      finish({ status: 0 });
      return;
    }
    request.setTimeout(TIMEOUT_MS, () => {
      finish({ status: 0, reason: "Timeout" });
      request.close(constants.NGHTTP2_CANCEL);
    });
    request.setEncoding("utf8");
    request.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      let reason: string | undefined;
      try {
        reason = body ? JSON.parse(body).reason : undefined;
      } catch {
        // APNs always answers errors in JSON; anything else just has no reason.
      }
      finish({ status, reason });
    });
    request.on("error", () => finish({ status: 0 }));
    request.on("close", () => finish({ status }));
    request.end(payload);
  });
}

/** Sends to every logged-in phone of the user and logs one line with the outcome (no user id). */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
): Promise<{ phones: number; delivered: number }> {
  // A token whose login session is gone (logged out, revoked, expired) belongs to a signed-out
  // phone: it's removed, not sent to. This also covers a logout that couldn't remove its token.
  const tokens = await pool.query(
    `select t.token,
            (t.session_id is null or exists (
               select 1 from auth.sessions s
               where s.id = t.session_id and (s.not_after is null or s.not_after > now())
             )) as live
     from push_tokens t where t.user_id = $1`,
    [userId],
  );
  const dead = tokens.rows.filter((r) => !r.live).map((r) => r.token as string);
  if (dead.length) await pool.query(`delete from push_tokens where token = any($1)`, [dead]);
  const live = tokens.rows.filter((r) => r.live);
  if (live.length === 0) {
    console.log("[push] not sent: no logged-in phone");
    return { phones: 0, delivered: 0 };
  }

  const jwt = providerToken();
  if (!jwt) {
    console.warn("[push] Apple key not configured, so no push was sent.");
    return { phones: live.length, delivered: 0 };
  }
  const payload = JSON.stringify({ aps: { alert: { title, body }, sound: "default" } });

  let delivered = 0;
  for (const { token } of live as { token: string }[]) {
    // Left over from the old push service, or otherwise unusable: remove it.
    if (!isApnsDeviceToken(token)) {
      await pool.query(`delete from push_tokens where token = $1`, [token]);
      continue;
    }
    let result = await sendToApns(PRODUCTION, token, payload, jwt);
    if (result.status === 400 && result.reason === "BadDeviceToken") {
      result = await sendToApns(SANDBOX, token, payload, jwt);
    }
    if (result.status === 200) {
      delivered++;
    } else if (result.status === 410 || (result.status === 400 && result.reason === "BadDeviceToken")) {
      // 410: the app was removed from that phone. BadDeviceToken in both places: not a real token.
      await pool.query(`delete from push_tokens where token = $1`, [token]);
    } else {
      const failure = `${result.status}${result.reason ? ` (${result.reason})` : ""}`;
      if (!loggedFailures.has(failure)) {
        loggedFailures.add(failure);
        console.error(`[push] APNs answered ${failure} (repeats of this aren't logged again)`);
      }
    }
  }
  console.log(`[push] delivered to ${delivered} of ${live.length} phone(s)`);
  return { phones: live.length, delivered };
}
