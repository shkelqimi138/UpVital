// Small line chart for trends, with an optional gradient fill
import { Canvas, LinearGradient, Path, Skia, vec } from "@shopify/react-native-skia";
import { View } from "react-native";

type SparklineProps = {
  points: number[];
  width: number;
  height: number;
  color: string;
  strokeWidth?: number;
  /** Fills the area under the line with a `color` -> transparent gradient. */
  fill?: boolean;
  /** Opacity at the top of the area fill. */
  fillOpacity?: number;
};

/** Converts a 0-1 alpha to the two-digit hex suffix Skia colour strings expect. */
function alphaHex(opacity: number): string {
  return Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
}

// Small trend line used by the metric tiles/rows and the Daily Score hero. Takes a plain
// number[] and renders with Skia (the app's existing drawing layer) rather than pulling in
// a chart dependency for something this simple.
export function Sparkline({
  points,
  width,
  height,
  color,
  strokeWidth = 2,
  fill = false,
  fillOpacity = 0.26,
}: SparklineProps) {
  if (points.length < 2 || width <= 0 || height <= 0) {
    return <View style={{ width, height }} />;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  // Inset by the stroke so the line's cap isn't clipped at the top/bottom edge.
  const pad = strokeWidth / 2;
  const usableHeight = Math.max(1, height - strokeWidth);

  const coords = points.map((p, i) => ({
    x: (i / (points.length - 1)) * width,
    y: pad + (1 - (p - min) / span) * usableHeight,
  }));

  const line = Skia.PathBuilder.Make();
  line.moveTo(coords[0].x, coords[0].y);
  for (let i = 1; i < coords.length; i++) line.lineTo(coords[i].x, coords[i].y);
  const linePath = line.build();

  const area = Skia.PathBuilder.Make();
  area.moveTo(coords[0].x, height);
  for (const c of coords) area.lineTo(c.x, c.y);
  area.lineTo(coords[coords.length - 1].x, height);
  area.close();
  const areaPath = area.build();

  return (
    <Canvas style={{ width, height }}>
      {fill && (
        <Path path={areaPath} style="fill">
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={[`${color}${alphaHex(fillOpacity)}`, `${color}00`]}
          />
        </Path>
      )}
      <Path
        path={linePath}
        style="stroke"
        strokeWidth={strokeWidth}
        strokeCap="round"
        strokeJoin="round"
        color={color}
      />
    </Canvas>
  );
}
