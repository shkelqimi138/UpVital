// Client API wrapper for fetching body-fat / body-composition entries
import { apiGet } from "./client";

export type BodyFatEntry = { value: number; date: string; data_source: string };

export async function getBodyFatEntries(): Promise<BodyFatEntry[]> {
  const body = await apiGet<{ entries: BodyFatEntry[] }>("/body-fat");
  return body.entries;
}
