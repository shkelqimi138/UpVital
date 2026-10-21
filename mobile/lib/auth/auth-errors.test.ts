// Unit tests for the Supabase-auth error/copy mapping (auth-errors.ts).
// Run with `npm test` (mobile) via tsx — only imports net-errors (also pure).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_PASSWORD_LENGTH,
  validateCredentials,
  validateEmail,
  validatePasswordStrength,
  validatePasswordChange,
  validatePasswordReset,
  validateEmailChange,
  authErrorMessage,
} from "./auth-errors";
import { OFFLINE_MESSAGE } from "../net-errors";

describe("validateCredentials", () => {
  it("flags an empty or malformed email first", () => {
    assert.equal(validateCredentials("", "whatever", "login"), "Enter your email address.");
    assert.equal(validateCredentials("   ", "whatever", "login"), "Enter your email address.");
    assert.equal(
      validateCredentials("alex@", "whatever", "login"),
      "That doesn't look like a valid email address.",
    );
    assert.equal(
      validateCredentials("alex.com", "whatever", "login"),
      "That doesn't look like a valid email address.",
    );
  });

  it("flags a missing password", () => {
    assert.equal(validateCredentials("alex@example.com", "", "login"), "Enter your password.");
  });

  it("enforces the password policy only on signup", () => {
    assert.equal(
      validateCredentials("alex@example.com", "short", "signup"),
      `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
    // signup also requires a letter and a number (no symbol needed)
    assert.equal(
      validateCredentials("alex@example.com", "12345678!", "signup"),
      "Add at least one letter to your password.",
    );
    assert.equal(
      validateCredentials("alex@example.com", "longenough", "signup"),
      "Add at least one number to your password.",
    );
    // login must not enforce the policy (an old/weak password still needs to work)
    assert.equal(validateCredentials("alex@example.com", "short", "login"), null);
  });

  it("returns null for a valid pair", () => {
    assert.equal(validateCredentials("alex@example.com", "longenough1", "signup"), null);
  });
});

describe("validatePasswordStrength", () => {
  it("requires length, a letter, and a number", () => {
    assert.equal(
      validatePasswordStrength("short1!"),
      `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
    assert.equal(validatePasswordStrength("12345678!"), "Add at least one letter to your password.");
    assert.equal(validatePasswordStrength("nodigits!!"), "Add at least one number to your password.");
    assert.equal(validatePasswordStrength("nosymbol12"), null);
    assert.equal(validatePasswordStrength("Strong1!pass"), null);
  });
});

describe("validatePasswordChange", () => {
  it("requires the current password, then checks strength, difference and match", () => {
    assert.equal(validatePasswordChange("", "Strong1!pass", "Strong1!pass"), "Enter your current password.");
    assert.equal(
      validatePasswordChange("Old1!pass", "weak", "weak"),
      `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
    assert.equal(
      validatePasswordChange("Strong1!pass", "Strong1!pass", "Strong1!pass"),
      "That's already your current password. Choose a different one.",
    );
    assert.equal(
      validatePasswordChange("Old1!pass", "Strong1!pass", "Strong1!diff"),
      "The new passwords don't match.",
    );
    assert.equal(validatePasswordChange("Old1!pass", "Strong1!pass", "Strong1!pass"), null);
  });
});

describe("validatePasswordReset", () => {
  it("checks strength first, then that both entries match", () => {
    assert.equal(
      validatePasswordReset("weak", "weak"),
      `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
    assert.equal(validatePasswordReset("Sunshine123", "Sunshine124"), "The new passwords don't match.");
    assert.equal(validatePasswordReset("Sunshine123", ""), "The new passwords don't match.");
    assert.equal(validatePasswordReset("Sunshine123", "Sunshine123"), null);
  });
});

describe("validateEmailChange", () => {
  it("matches the account (Gmail dots folded), and requires a valid, different, confirmed new email", () => {
    // dotted vs canonical still counts as the same account
    assert.equal(
      validateEmailChange("janedoe@gmail.com", "jane.doe@gmail.com", "new@example.com", "new@example.com"),
      null,
    );
    assert.equal(
      validateEmailChange("me@example.com", "wrong@example.com", "new@example.com", "new@example.com"),
      "The current email you entered doesn't match this account.",
    );
    assert.equal(
      validateEmailChange("me@example.com", "me@example.com", "me@example.com", "me@example.com"),
      "That's already your email address.",
    );
    assert.equal(
      validateEmailChange("me@example.com", "me@example.com", "new@example.com", "different@example.com"),
      "The new email addresses don't match.",
    );
  });
});

describe("validateEmail", () => {
  it("mirrors the email rules", () => {
    assert.equal(validateEmail(""), "Enter your email address.");
    assert.equal(validateEmail("nope"), "That doesn't look like a valid email address.");
    assert.equal(validateEmail("alex@example.com"), null);
  });
});

describe("authErrorMessage", () => {
  it("short-circuits connectivity failures to the offline copy", () => {
    assert.equal(authErrorMessage(new Error("Network request failed")), OFFLINE_MESSAGE);
  });

  it("humanises the common Supabase strings", () => {
    assert.equal(
      authErrorMessage({ message: "Invalid login credentials" }),
      "Email or password is incorrect.",
    );
    assert.equal(
      authErrorMessage({ code: "user_already_exists" }),
      "That email is already registered. Try logging in instead.",
    );
    assert.equal(
      authErrorMessage({ message: "Email not confirmed" }),
      "Please confirm your email first — check your inbox for the link.",
    );
    assert.equal(
      authErrorMessage({ message: "Password should be at least 6 characters" }),
      `Choose a stronger password — at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  });

  it("maps the current-password errors from Profile → Password", () => {
    // Supabase sends the same message for both — only the code tells them apart.
    const message = "Current password required when setting new password.";
    assert.equal(
      authErrorMessage({ code: "current_password_invalid", message }),
      "Your current password is incorrect.",
    );
    assert.equal(
      authErrorMessage({ code: "current_password_required", message }),
      "Enter your current password.",
    );
  });

  it("turns the confusing 'missing email or phone' into plain guidance", () => {
    assert.equal(
      authErrorMessage({ message: "missing email or phone" }),
      "Enter your email address and password to continue.",
    );
  });

  it("matches on either code or message text", () => {
    assert.equal(authErrorMessage({ code: "invalid_credentials" }), "Email or password is incorrect.");
  });

  it("falls back to a server message for a 5xx and to generic copy otherwise", () => {
    assert.equal(
      authErrorMessage({ status: 503, message: "upstream boom" }),
      "Something went wrong on our end. Please try again in a moment.",
    );
    assert.equal(
      authErrorMessage({ message: "some unmapped thing" }),
      "We couldn't complete that. Please try again.",
    );
  });
});
