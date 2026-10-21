// API route for the AI coach chat
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth } from "../middleware/auth";
import { coachConfigured, coachReply, CoachMessage } from "../insights/coach";
import { hasAiConsent } from "../lib/ai-consent";

const router = Router();

/** Max turns accepted in one request — bounds prompt size and cost. */
const MAX_MESSAGES = 40;
/** Per-message and whole-thread length caps, also for cost: the app limits a question to 1,000
 *  characters and a coach reply is at most 500 tokens (~2,500 characters). */
const MAX_MESSAGE_CHARS = 4_000;
const MAX_TOTAL_CHARS = 60_000;

// Every call spends Claude tokens, so this is the one route where abuse costs real money. Keyed by
// the signed-in user (it runs after requireAuth): keyed by IP, users behind the same Cloudflare
// edge address shared one allowance, and one person could use it up for everyone.
const coachLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId!,
  message: { error: "Too many requests — please slow down and try again shortly." },
});

// Stateless coach chat: the client holds the conversation and posts the whole thread each
// turn, along with the date whose scores should ground the reply. No DB table — the design
// shows a single conversation, not persisted history across sessions.
router.post("/coach/chat", requireAuth, coachLimiter, async (req, res) => {
  if (!coachConfigured()) {
    res.status(503).json({ error: "Coach isn't configured yet — missing ANTHROPIC_API_KEY" });
    return;
  }
  // 409, not 403: the app treats 401/403 as an expired session.
  if (!(await hasAiConsent(req.userId!))) {
    res.status(409).json({
      error: "Turn on AI insights & Coach in Profile to chat with the coach.",
      code: "ai_consent_required",
    });
    return;
  }

  const { date, messages } = req.body ?? {};
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "Provide date as YYYY-MM-DD" });
    return;
  }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    res.status(400).json({ error: `Provide 1-${MAX_MESSAGES} messages` });
    return;
  }
  const valid = messages.every(
    (m) =>
      m &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.length > 0 &&
      m.content.length <= MAX_MESSAGE_CHARS,
  );
  if (!valid) {
    res.status(400).json({
      error: `Each message needs role 'user'|'assistant' and 1-${MAX_MESSAGE_CHARS.toLocaleString("en-US")} characters of content`,
    });
    return;
  }
  const totalChars = messages.reduce((sum: number, m: CoachMessage) => sum + m.content.length, 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    res.status(400).json({ error: "This conversation is too long — start a new one." });
    return;
  }
  // The final turn must be from the user — that's what the model replies to.
  if (messages[messages.length - 1].role !== "user") {
    res.status(400).json({ error: "The last message must be from the user" });
    return;
  }

  try {
    const reply = await coachReply(req.userId!, date, messages as CoachMessage[]);
    if (!reply) {
      res.status(200).json({
        reply: "I can't help with that one — try asking about your recovery, sleep, stress, or training.",
      });
      return;
    }
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Upstream service error" });
  }
});

export default router;
