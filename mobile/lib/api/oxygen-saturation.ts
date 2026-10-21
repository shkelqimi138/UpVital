// Client API wrapper for fetching blood-oxygen (SpO2) entries
import { apiGet } from "./client";

export type OxygenSaturationEntry = { value: number; date: string; data_source: string };

export async function getOxygenSaturationEntries(): Promise<OxygenSaturationEntry[]> {
  const body = await apiGet<{ entries: OxygenSaturationEntry[] }>("/oxygen-saturation");
  return body.entries;
}
