// Client API wrapper for listing body-weight entries (weight comes from Apple Health)
import { apiGet } from "./client";

export type WeightEntry = {
  value: number;
  unit: string;
  date: string;
  data_source: string;
};

export async function getWeightEntries(): Promise<WeightEntry[]> {
  const body = await apiGet<{ entries: WeightEntry[] }>("/weight");
  return body.entries;
}
