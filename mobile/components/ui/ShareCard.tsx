// Fixed-size image card of today's scores for sharing
import {
  Canvas,
  CanvasRef,
  LinearGradient,
  matchFont,
  Path,
  Rect,
  Skia,
  Text as SkText,
  vec,
} from "@shopify/react-native-skia";
import { Platform } from "react-native";
import { brand } from "../../lib/theme";

// Rendered and shared at this exact size — no separate scaled-down preview, to avoid the
// transform-origin math of scaling a Skia canvas for display while snapshotting it full-size.
export const SHARE_CARD_WIDTH = 320;
export const SHARE_CARD_HEIGHT = 400;

// Speedometer arc opening at the bottom — same geometry as RingGauge (spec §1.3/§3.2), so a
// shared card reads like the rings in the app.
const START_ANGLE = 135;
const SWEEP_ANGLE = 270;
const RING_SIZE = 196;
const RING_STROKE = 18;
const RING_CY = 198;

type ShareCardProps = {
  canvasRef: React.RefObject<CanvasRef | null>;
  label: string;
  value: string;
  sublabel?: string;
  sublabelColor?: string;
  /** 0-100 score → draws the progress ring. Omit/null (e.g. Biological Age, which isn't a
   *  0-100 score) to render the value on its own with no ring. */
  progress?: number | null;
  /** Ring + sublabel tint. Should be the metric's color, matching the app and the widget. */
  accentColor?: string;
};

// Rendered via Skia (not plain RN Views) specifically so it can be snapshotted to a real
// PNG for sharing — see app/share-insights.tsx. EVERY element must be a Skia node: RN views
// layered over the canvas would not appear in makeImageSnapshot().
//
// The card uses its own fixed colours, not the theme tokens: it's an image that leaves the app
// and lands in someone else's feed, so it's always this dark branded treatment.
//
// matchFont returns null on web (not implemented there per Stage 4's Trends screen), so text
// nodes just don't render on web; harmless since Upvital v1 targets iOS only.
export function ShareCard({
  canvasRef,
  label,
  value,
  sublabel,
  sublabelColor,
  progress = null,
  accentColor,
}: ShareCardProps) {
  const titleFont =
    Platform.OS === "web" ? null : matchFont({ fontFamily: "System", fontSize: 17, fontWeight: "600" });
  const valueFont =
    Platform.OS === "web" ? null : matchFont({ fontFamily: "System", fontSize: 68, fontWeight: "700" });
  const subFont =
    Platform.OS === "web" ? null : matchFont({ fontFamily: "System", fontSize: 15, fontWeight: "600" });
  const brandFont =
    Platform.OS === "web" ? null : matchFont({ fontFamily: "System", fontSize: 13, fontWeight: "700" });

  const accent = accentColor ?? brand.greenBright;

  const cx = SHARE_CARD_WIDTH / 2;
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const rect = Skia.XYWHRect(cx - radius, RING_CY - radius, radius * 2, radius * 2);

  // Immutable PathBuilder API (Skia 2.x) — the mutable Skia.Path.Make()+addArc() pattern is
  // deprecated and will be removed in a future Skia major.
  const clamped = progress == null ? null : Math.max(0, Math.min(100, progress));
  const trackPath =
    clamped === null ? null : Skia.PathBuilder.Make().addArc(rect, START_ANGLE, SWEEP_ANGLE).build();
  const progressPath =
    clamped === null
      ? null
      : Skia.PathBuilder.Make()
          .addArc(rect, START_ANGLE, (clamped / 100) * SWEEP_ANGLE)
          .build();

  // Skia text is positioned by its baseline and has no auto-centering, so every string is
  // measured and offset by hand.
  const centerX = (font: ReturnType<typeof matchFont> | null, text: string) =>
    font ? (SHARE_CARD_WIDTH - font.measureText(text).width) / 2 : 0;

  return (
    <Canvas ref={canvasRef} style={{ width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT }}>
      <Rect x={0} y={0} width={SHARE_CARD_WIDTH} height={SHARE_CARD_HEIGHT}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT)}
          colors={["#18231F", "#080C0B"]}
        />
      </Rect>

      {trackPath && (
        <Path
          path={trackPath}
          style="stroke"
          strokeWidth={RING_STROKE}
          strokeCap="round"
          color="rgba(255,255,255,0.10)"
        />
      )}
      {progressPath && (
        <Path path={progressPath} style="stroke" strokeWidth={RING_STROKE} strokeCap="round" color={accent} />
      )}

      {titleFont && (
        <SkText
          x={centerX(titleFont, label)}
          y={54}
          text={label}
          font={titleFont}
          color="rgba(255,255,255,0.70)"
        />
      )}
      {valueFont && (
        <SkText
          x={centerX(valueFont, value)}
          y={RING_CY + 22}
          text={value}
          font={valueFont}
          color="#FFFFFF"
        />
      )}
      {sublabel && subFont && (
        <SkText
          x={centerX(subFont, sublabel)}
          y={RING_CY + 62}
          text={sublabel}
          font={subFont}
          color={sublabelColor ?? accent}
        />
      )}
      {brandFont && (
        <SkText
          x={centerX(brandFont, "UPVITAL")}
          y={SHARE_CARD_HEIGHT - 28}
          text="UPVITAL"
          font={brandFont}
          color={brand.greenBright}
        />
      )}
    </Canvas>
  );
}
