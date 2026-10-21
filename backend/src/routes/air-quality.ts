// API route for local air quality (PM2.5 / PM10 index) at the user's approximate location
import { Router } from "express";
import { requireAuth } from "../middleware/auth";

const router = Router();

// A 1-5 index scale with the app's band names (Good, Fair, Moderate, ...).
// Open-Meteo returns a European AQI (0-100+, higher is worse) instead of a 1-5 index, so we
// bucket it into these five bands below and keep the response shape the app already expects.
const AQI_LABELS = ["Good", "Fair", "Moderate", "Poor", "Very Poor"];

// Convert Open-Meteo's European AQI (0 to 100+, higher is worse) to a 1-5 index:
// 0-20 -> 1, 21-40 -> 2, 41-60 -> 3, 61-80 -> 4, above 80 -> 5.
function europeanAqiToIndex(aqi: number): number {
  if (aqi <= 20) return 1;
  if (aqi <= 40) return 2;
  if (aqi <= 60) return 3;
  if (aqi <= 80) return 4;
  return 5;
}

// Proxies Open-Meteo's Air Quality API — free, no API key, no account required.
router.get("/air-quality", requireAuth, async (req, res) => {
  const lat = typeof req.query.lat === "string" && req.query.lat.trim() !== "" ? Number(req.query.lat) : NaN;
  const lon = typeof req.query.lon === "string" && req.query.lon.trim() !== "" ? Number(req.query.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    res.status(400).json({ error: "Provide ?lat=&lon= as coordinates" });
    return;
  }

  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5,pm10,european_aqi`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[air-quality] Open-Meteo request failed: ${response.status}`);
      res.status(502).json({ error: "Upstream service error" });
      return;
    }
    const data = (await response.json()) as {
      current?: { pm2_5?: number; pm10?: number; european_aqi?: number };
    };
    const current = data.current;
    if (
      !current ||
      typeof current.european_aqi !== "number" ||
      typeof current.pm2_5 !== "number" ||
      typeof current.pm10 !== "number"
    ) {
      res.status(502).json({ error: "No air quality data returned" });
      return;
    }

    const aqiIndex = europeanAqiToIndex(current.european_aqi);
    res.json({
      aqiIndex,
      aqiLabel: AQI_LABELS[aqiIndex - 1] ?? "Unknown",
      pm2_5: current.pm2_5,
      pm10: current.pm10,
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Upstream service error" });
  }
});

export default router;
