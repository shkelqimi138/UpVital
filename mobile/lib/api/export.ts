// Client helper for fetching the full user-data export JSON from the backend
import { apiGet } from "./client";

export async function fetchExportJson(): Promise<string> {
  // Never cached: an export the user shares must be live data, not a stale snapshot.
  const body = await apiGet<unknown>("/export", { cache: false });
  return JSON.stringify(body, null, 2);
}
