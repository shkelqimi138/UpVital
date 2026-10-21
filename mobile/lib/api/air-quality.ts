// Client helpers for the device location prompt and fetching local air quality (AQI)
import * as Location from "expo-location";
import { UserFacingError, apiGet } from "./client";
import { roundCoordinate } from "../geo";

export type AirQuality = { aqiIndex: number; aqiLabel: string; pm2_5: number; pm10: number };

export async function getCurrentLocation(): Promise<{
  latitude: number;
  longitude: number;
  city: string | null;
}> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new UserFacingError(
      "Location access is off, so we can't check your local air quality. You can turn it on in iOS Settings → Privacy → Location Services.",
    );
  }

  // Low accuracy is plenty: air quality is gridded far coarser than a kilometre, and only a
  // rounded position is sent anyway (below). Faster and lighter on the battery than the default.
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
  const [place] = await Location.reverseGeocodeAsync({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  });
  const city = place ? [place.city, place.country].filter(Boolean).join(", ") : null;

  return { latitude: position.coords.latitude, longitude: position.coords.longitude, city };
}

// Coordinates leave the device rounded to ~1 km, so only an approximate location is ever sent (as
// the privacy policy and App Store privacy details state). The reading itself is unchanged.
export async function getAirQuality(lat: number, lon: number): Promise<AirQuality> {
  // Not cached: the coordinates are part of the path, so every reading would be its own
  // key and the cache would grow without bound. Stale air quality is also worthless.
  return apiGet<AirQuality>(`/air-quality?lat=${roundCoordinate(lat)}&lon=${roundCoordinate(lon)}`, {
    cache: false,
  });
}
