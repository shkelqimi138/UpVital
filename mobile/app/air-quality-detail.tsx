// Air quality detail sheet with the index band and pollutant breakdown
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LoadError } from "../components/ui/LoadError";
import { BottomSheetScreen } from "../components/ui/BottomSheetScreen";
import { Icon } from "../components/ui/Icon";
import { SheetSkeleton } from "../components/ui/SheetSkeleton";
import { ThresholdBar } from "../components/ui/ThresholdBar";
import { friendlyMessage } from "../lib/api/client";
import { AirQuality, getAirQuality, getCurrentLocation } from "../lib/api/air-quality";
import { useTheme, type ColorTokens } from "../lib/theme";

// The server's 1-5 index (bucketed from the European AQI): 1=Good, 2=Fair, 3=Moderate, 4=Poor, 5=Very Poor.
function aqiColor(aqiIndex: number, colors: ColorTokens): string {
  if (aqiIndex <= 1) return colors.accent.green;
  if (aqiIndex === 2) return colors.accent.yellow;
  if (aqiIndex === 3) return colors.accent.orange;
  if (aqiIndex === 4) return colors.accent.red;
  return colors.accent.indigo;
}

export default function AirQualityDetailScreen() {
  const { colors, textColor, subtleColor } = useTheme();
  const [aqi, setAqi] = useState<AirQuality | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    setError(null);
    setLoaded(false);
    void (async () => {
      try {
        const location = await getCurrentLocation();
        setCity(location.city);
        const data = await getAirQuality(location.latitude, location.longitude);
        setAqi(data);
      } catch (err) {
        setError(friendlyMessage(err));
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <BottomSheetScreen
      title="Air quality"
      leadingIcon={<Icon name="wind" size={20} color={colors.accent.blue} />}
    >
      {!loaded ? (
        <SheetSkeleton />
      ) : error ? (
        <LoadError what="air quality" message={error} onRetry={reload} />
      ) : aqi ? (
        <>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.value, { color: textColor }]}>{Math.round(aqi.pm2_5)}</Text>
              <Text style={{ color: subtleColor, fontSize: 13 }}>PM2.5 (µg/m³)</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: aqiColor(aqi.aqiIndex, colors), fontWeight: "700" }}>{aqi.aqiLabel}</Text>
              <Text style={{ color: subtleColor, fontSize: 13 }}>Air index</Text>
            </View>
          </View>
          {city && <Text style={{ color: subtleColor }}>{city}</Text>}
          <ThresholdBar
            position={(aqi.aqiIndex - 1) / 4}
            colors={[
              colors.accent.green,
              colors.accent.yellow,
              colors.accent.orange,
              colors.accent.red,
              colors.accent.indigo,
            ]}
          />
          <Text style={{ color: subtleColor, fontSize: 13, lineHeight: 19 }}>
            PM10: {Math.round(aqi.pm10)} µg/m³. Refreshed each time you open this screen — not a continuous
            feed.
          </Text>
          {/* Credit required by the data licences (Open-Meteo CC BY 4.0, Copernicus). */}
          <Text style={{ color: subtleColor, fontSize: 12, lineHeight: 17 }}>
            Data: Open-Meteo, using Copernicus Atmosphere Monitoring Service information.
          </Text>
        </>
      ) : null}
    </BottomSheetScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  value: { fontSize: 44, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
