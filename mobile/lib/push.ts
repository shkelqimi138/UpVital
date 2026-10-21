import * as Notifications from "expo-notifications";
import { apiSend } from "./api/client";

/**
 * Requests notification permission and registers the device's APNs push token with the backend,
 * which sends pushes straight to Apple (no third-party push service). No-ops quietly if permission
 * is denied.
 */
export async function registerForPushNotifications(): Promise<void> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let status = existingStatus;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") return;

  const { data: token } = await Notifications.getDevicePushTokenAsync();
  if (typeof token !== "string") return;

  // Registration is background housekeeping — a failure must not interrupt the user.
  await apiSend("POST", "/push-token", { token }).catch(() => {});
}

/** Removes this phone's token from the account on logout, so a signed-out phone gets no more
 *  pushes (they carry the start of a health insight). Callers don't let it hold up the logout. */
export async function unregisterPushToken(): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;
  const { data: token } = await Notifications.getDevicePushTokenAsync();
  if (typeof token !== "string") return;
  await apiSend("DELETE", "/push-token", { token });
}
