// Client API wrapper for the longevity / biological-age summary
import { apiGet } from "./client";

export type Longevity = { biologicalAge: number | null; paceOfAging: number | null };

export async function getLongevity(date: string): Promise<Longevity> {
  return apiGet<Longevity>(`/longevity?date=${date}`);
}
