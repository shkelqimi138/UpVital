// Turns Supabase Auth failures into copy a person can act on.
//
// supabase-js surfaces backend strings verbatim: "missing email or phone",
// "Invalid login credentials", "Anonymous sign-ins are disabled". Those are written for
// whoever is reading the API docs, not for someone standing at a login screen — and
// "missing email or phone" is actively confusing in an app that has no phone login.
// Everything the auth screens show goes through here first.
import { friendlyMessage, isOfflineError, OFFLINE_MESSAGE } from "../net-errors";
import { normalizeEmail } from "./disposable-emails";

export const MIN_PASSWORD_LENGTH = 8;

// One-line hint shown next to password fields. Keep in sync with validatePasswordStrength.
export const PASSWORD_RULE_HINT = `At least ${MIN_PASSWORD_LENGTH} characters, with a letter and a number`;

/** The password policy: min length + at least one letter + at least one digit. Returns the
 *  message to show, or null if the password is strong enough. Mirrors the Supabase dashboard
 *  password policy ("Letters and digits", ASCII letters) so the server agrees. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(password)) return "Add at least one letter to your password.";
  if (!/[0-9]/.test(password)) return "Add at least one number to your password.";
  return null;
}

// Shown when Supabase explicitly answers "already registered" (only happens with its email
// enumeration protection off). With it on, an existing email gets a decoy success instead, and
// signup.tsx shows the neutral "check your email" screen — so the form doesn't reveal accounts.
export const EMAIL_ALREADY_REGISTERED = "That email is already registered. Try logging in instead.";

// Deliberately permissive — the real check is the confirmation email. This only catches
// the obvious typo ("alex@", "alex.com") before we spend a round-trip on it.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Validates the email + password pair. Returns the message to show, or null if it's fine. */
export function validateCredentials(
  email: string,
  password: string,
  mode: "login" | "signup",
): string | null {
  if (!email.trim()) return "Enter your email address.";
  if (!EMAIL_RE.test(email.trim())) return "That doesn't look like a valid email address.";
  if (!password) return "Enter your password.";
  // Login must NOT enforce the policy — an older/short password still needs to work. New
  // accounts (signup) get the full strength check.
  if (mode === "signup") {
    const weak = validatePasswordStrength(password);
    if (weak) return weak;
  }
  return null;
}

const PASSWORDS_DONT_MATCH = "The new passwords don't match.";

/** Validates the password-reset form (from the emailed link): a strong new password, typed twice. */
export function validatePasswordReset(newPassword: string, confirmPassword: string): string | null {
  const weak = validatePasswordStrength(newPassword);
  if (weak) return weak;
  if (newPassword !== confirmPassword) return PASSWORDS_DONT_MATCH;
  return null;
}

/** Validates the "change password" form: current password entered; new one strong, different and
 *  confirmed. (Whether the current password is right, Supabase checks when saving.) */
export function validatePasswordChange(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): string | null {
  if (!currentPassword) return "Enter your current password.";
  const weak = validatePasswordStrength(newPassword);
  if (weak) return weak;
  if (newPassword === currentPassword) return "That's already your current password. Choose a different one.";
  if (newPassword !== confirmPassword) return PASSWORDS_DONT_MATCH;
  return null;
}

/** Validates the "change email" form: the typed current email must match the account, the new
 *  one must be valid, different, and confirmed. Emails are compared canonically (Gmail dots/+tags
 *  folded), matching how the app stores them. Returns a message or null. */
export function validateEmailChange(
  accountEmail: string,
  currentEmailTyped: string,
  newEmail: string,
  confirmEmail: string,
): string | null {
  if (normalizeEmail(currentEmailTyped) !== normalizeEmail(accountEmail)) {
    return "The current email you entered doesn't match this account.";
  }
  const invalid = validateEmail(newEmail);
  if (invalid) return invalid;
  if (normalizeEmail(newEmail) === normalizeEmail(accountEmail)) {
    return "That's already your email address.";
  }
  if (normalizeEmail(newEmail) !== normalizeEmail(confirmEmail)) {
    return "The new email addresses don't match.";
  }
  return null;
}

/** Validates just the email — for the forgot-password and resend flows. */
export function validateEmail(email: string): string | null {
  if (!email.trim()) return "Enter your email address.";
  if (!EMAIL_RE.test(email.trim())) return "That doesn't look like a valid email address.";
  return null;
}

type SupabaseishError = { message?: string; code?: string; status?: number };

/**
 * Maps a Supabase auth error onto human copy. Matches on `code` where supabase-js
 * provides one and falls back to the message text, since older error shapes only carry that.
 */
export function authErrorMessage(err: unknown): string {
  if (isOfflineError(err)) return OFFLINE_MESSAGE;

  const e = (err ?? {}) as SupabaseishError;
  const code = typeof e.code === "string" ? e.code : "";
  const message = typeof e.message === "string" ? e.message : "";
  const text = `${code} ${message}`.toLowerCase();

  if (text.includes("invalid_credentials") || text.includes("invalid login credentials")) {
    return "Email or password is incorrect.";
  }
  // Profile → Password ("Require current password when updating" is ON in Supabase).
  if (text.includes("current_password_invalid")) return "Your current password is incorrect.";
  if (text.includes("current_password_required")) return "Enter your current password.";
  if (text.includes("email_not_confirmed") || text.includes("not confirmed")) {
    return "Please confirm your email first — check your inbox for the link.";
  }
  if (
    text.includes("user_already_exists") ||
    text.includes("already registered") ||
    text.includes("already been registered")
  ) {
    return EMAIL_ALREADY_REGISTERED;
  }
  if (text.includes("weak_password") || text.includes("password should be")) {
    return `Choose a stronger password — at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (text.includes("same_password")) {
    return "That's already your current password. Choose a different one.";
  }
  if (text.includes("over_email_send_rate_limit") || text.includes("only request this after")) {
    return "You've tried that a few times. Please wait a minute and try again.";
  }
  if (text.includes("over_request_rate_limit") || text.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (text.includes("captcha")) {
    return "We couldn't verify you're human. Please try again.";
  }
  if (text.includes("email_address_invalid") || text.includes("unable to validate email")) {
    return "That doesn't look like a valid email address.";
  }
  if (text.includes("email_address_not_authorized")) {
    return "That email address isn't allowed. Please use a different one.";
  }
  // "missing email or phone", "anonymous sign-ins are disabled", "validation_failed" — all
  // mean the same thing from the user's side: the form wasn't filled in.
  if (
    text.includes("missing email or phone") ||
    text.includes("anonymous sign-ins") ||
    text.includes("validation_failed")
  ) {
    return "Enter your email address and password to continue.";
  }
  if (text.includes("user_not_found") || text.includes("user not found")) {
    return "We couldn't find an account with that email.";
  }
  if (typeof e.status === "number" && e.status >= 500) {
    return "Something went wrong on our end. Please try again in a moment.";
  }

  return friendlyMessage(err, "We couldn't complete that. Please try again.");
}
