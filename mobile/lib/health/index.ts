import { healthKitAdapter } from "./healthkit-adapter";

// Single swap point for the platform data source — a different adapter could
// plug in here without touching sync logic or the backend.
export const healthAdapter = healthKitAdapter;

export * from "./types";
