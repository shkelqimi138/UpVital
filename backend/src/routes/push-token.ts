// API routes for a device's APNs push token: register (POST) and remove on logout (DELETE /push-token)
import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { isApnsDeviceToken } from "../lib/validate";

const router = Router();

// The iPhone's APNs device token (hex); pushes go straight to Apple (src/push.ts).
router.post("/push-token", requireAuth, async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.toLowerCase() : null;
  if (!isApnsDeviceToken(token)) {
    res.status(400).json({ error: "Expected { token: '<APNs device token, hex>' }" });
    return;
  }

  // The session is stored too: pushes stop once it ends, however it ends (src/push.ts).
  await pool.query(
    `insert into push_tokens (user_id, token, session_id) values ($1, $2, $3)
     on conflict (token) do update set user_id = excluded.user_id, session_id = excluded.session_id`,
    [req.userId, token, req.sessionId ?? null],
  );
  res.json({ ok: true });
});

// Removes this phone's token when the user logs out, so a signed-out phone gets no more pushes.
router.delete("/push-token", requireAuth, async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.toLowerCase() : null;
  if (!isApnsDeviceToken(token)) {
    res.status(400).json({ error: "Expected { token: '<APNs device token, hex>' }" });
    return;
  }
  await pool.query(`delete from push_tokens where user_id = $1 and token = $2`, [req.userId, token]);
  res.json({ ok: true });
});

export default router;
