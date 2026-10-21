// Supabase auth-session storage backed by the iOS Keychain (expo-secure-store) instead of
// plaintext AsyncStorage, so the access/refresh tokens are encrypted at rest.
//
// Two wrinkles this handles:
//  1. SecureStore has a per-item size limit (~2 KB) and a Supabase session can exceed it, so the
//     value is split into numbered Keychain items. Only a chunk COUNT (no secret) is kept in
//     AsyncStorage as the index.
//  2. Migration: a session written by an earlier build lives in AsyncStorage. On first read we
//     move it into the Keychain and delete the plaintext copy, so upgrading users stay logged in.
//
// Shaped as a Supabase `storage` adapter: getItem/setItem/removeItem returning Promises.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

// Keep comfortably under SecureStore's byte limit (tokens are ASCII, so chars ≈ bytes).
const CHUNK_SIZE = 1800;
const countKey = (key: string) => `${key}::chunks`;

async function removeItem(key: string): Promise<void> {
  try {
    const countRaw = await AsyncStorage.getItem(countKey(key));
    const count = countRaw ? parseInt(countRaw, 10) : 0;
    for (let i = 0; i < count; i++) {
      await SecureStore.deleteItemAsync(`${key}.${i}`);
    }
    await AsyncStorage.removeItem(countKey(key));
    // Also clear any legacy plaintext copy a previous build may have left.
    await AsyncStorage.removeItem(key);
  } catch {
    // best-effort — never throw out of the storage adapter
  }
}

async function setItem(key: string, value: string): Promise<void> {
  try {
    await removeItem(key); // clear previous chunks first so counts never go stale
    const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await AsyncStorage.setItem(countKey(key), String(count));
  } catch {
    // best-effort
  }
}

async function getItem(key: string): Promise<string | null> {
  try {
    const countRaw = await AsyncStorage.getItem(countKey(key));
    if (countRaw == null) {
      // Nothing in the Keychain yet — one-time migrate a legacy AsyncStorage session, if any.
      const legacy = await AsyncStorage.getItem(key);
      if (legacy != null) {
        await setItem(key, legacy); // setItem also deletes the plaintext copy via removeItem
      }
      return legacy;
    }
    const count = parseInt(countRaw, 10);
    let out = "";
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part == null) return null; // corrupt/partial — treat as no session
      out += part;
    }
    return out;
  } catch {
    return null;
  }
}

export const SecureStorageAdapter = { getItem, setItem, removeItem };
