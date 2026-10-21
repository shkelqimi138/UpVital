// App preferences (units), kept on this device per account — no server round-trip,
// nothing in the database. A tiny store read with usePreferences(); setPreference() saves and
// notifies. Another account signing in on the same phone starts from its own (or the defaults).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { DEFAULT_PREFERENCES, parsePreferences, type Preferences } from "./preferences-core";

const STORAGE_KEY_PREFIX = "upvital.preferences.v1";

let current: Preferences = DEFAULT_PREFERENCES;
// Storage key of the signed-in user; null while signed out (defaults, nothing saved).
let currentKey: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Loads this user's saved preferences (the defaults when signed out). Called whenever the
 *  session changes. */
export async function loadPreferences(userId: string | null): Promise<void> {
  const key = userId ? `${STORAGE_KEY_PREFIX}:${userId}` : null;
  currentKey = key;
  let next = DEFAULT_PREFERENCES;
  if (key) {
    try {
      next = parsePreferences(await AsyncStorage.getItem(key));
    } catch {
      next = DEFAULT_PREFERENCES;
    }
  }
  if (currentKey !== key) return; // the session changed again while this was loading
  current = next;
  emit();
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  current = { ...current, [key]: value };
  emit();
  if (currentKey) AsyncStorage.setItem(currentKey, JSON.stringify(current)).catch(() => {});
}

/** Removes the signed-in user's saved preferences from this phone (on account deletion). */
export async function forgetPreferences(): Promise<void> {
  if (currentKey) await AsyncStorage.removeItem(currentKey).catch(() => {});
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, () => current);
}
