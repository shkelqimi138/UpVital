// API client for the AI coach chat
import { ApiError, UserFacingError, apiSend } from "./client";

export type CoachMessage = { role: "user" | "assistant"; content: string };

/** Thrown when the backend has no ANTHROPIC_API_KEY (503) — the UI shows a clean
 *  "not configured" state rather than a generic error. */
export class CoachNotConfiguredError extends UserFacingError {
  constructor() {
    super("Coach isn't configured yet.");
    this.name = "CoachNotConfiguredError";
  }
}

/** Thrown when AI insights & Coach is switched off (409): the chat shows the turn-on prompt. */
export class AiConsentRequiredError extends UserFacingError {
  constructor() {
    super("Turn on AI insights & Coach to chat with the coach.");
    this.name = "AiConsentRequiredError";
  }
}

// The server takes at most 40 turns (and caps their length) per request. Send only the latest
// turns, starting with a question, so a long chat keeps working and each call stays cheap.
const MAX_SENT_MESSAGES = 20;

export async function sendCoachMessage(date: string, allMessages: CoachMessage[]): Promise<string> {
  let messages = allMessages.slice(-MAX_SENT_MESSAGES);
  while (messages.length > 0 && messages[0].role !== "user") messages = messages.slice(1);
  try {
    const body = await apiSend<{ reply: string }>("POST", "/coach/chat", { date, messages });
    return body.reply;
  } catch (err) {
    if (err instanceof ApiError && err.status === 503) throw new CoachNotConfiguredError();
    if (err instanceof ApiError && err.status === 409) throw new AiConsentRequiredError();
    throw err;
  }
}
