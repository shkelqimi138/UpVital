// API client for the user profile (read/update, timezone sync) plus name/initials helpers
import { apiGet, apiSend } from "./client";

export type Profile = {
  birthdate: string | null;
  timezone: string | null;
  stepGoal: number | null;
  sleepGoalHours: number | null;
  activeCalorieGoal: number | null;
  notificationsEnabled: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  heightCm: number | null;
  weightGoalKg: number | null;
  weightGoalTargetDate: string | null;
  /** AI insights & Coach switched on (data may go to Anthropic). Off until the user turns it on. */
  aiConsent: boolean;
  /** Local hour (0-23) the daily insight is written and pushed; 7 until the user picks another. */
  insightHour: number;
};

/** Initials for the avatar chip, e.g. "Alex Martin" -> "AM". Falls back to the email's
 *  first letter, then to a neutral placeholder, so the chip is never empty. */
export function avatarInitials(displayName: string | null, email?: string | null): string {
  const name = displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  const local = email?.trim();
  if (local) return local[0].toUpperCase();
  return "–";
}

/** The name shown in the Home greeting — first name only, per the design's
 *  "Good morning, Alex". Falls back to the email's local part. */
export function greetingName(displayName: string | null, email?: string | null): string | null {
  const name = displayName?.trim();
  if (name) return name.split(/\s+/)[0];
  const local = email?.split("@")[0]?.trim();
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : null;
}

export async function getProfile(): Promise<Profile> {
  return apiGet<Profile>("/profile");
}

export async function updateProfile(patch: Partial<Omit<Profile, "timezone">>): Promise<void> {
  await apiSend("PATCH", "/profile", patch);
}

/** Sends the device's IANA timezone so the backend can time the daily insight/push to the user's local morning. */
export async function syncDeviceTimezone(): Promise<void> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Fire-and-forget housekeeping — never surface a failure here to the user.
  await apiSend("PATCH", "/profile", { timezone }).catch(() => {});
}
