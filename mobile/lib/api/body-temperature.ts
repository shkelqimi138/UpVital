// Client API wrapper for fetching body-temperature entries
import { apiGet } from "./client";

export type BodyTemperatureEntry = { value: number; date: string; data_source: string };

export async function getBodyTemperatureEntries(): Promise<BodyTemperatureEntry[]> {
  const body = await apiGet<{ entries: BodyTemperatureEntry[] }>("/body-temperature");
  return body.entries;
}
