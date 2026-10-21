// Full-screen background image with a darkening overlay
import { ReactNode } from "react";
import { ImageBackground, ImageSourcePropType, StyleSheet, View } from "react-native";

type Props = {
  source: ImageSourcePropType;
  children: ReactNode;
  /** Darkening overlay strength: 0 = image as-is, 1 = fully black. Tune for legibility. */
  scrim?: number;
};

/**
 * Full-screen image background with an optional dark scrim on top of it.
 * Children render above the scrim. Used behind the auth screens and dashboard.
 */
export function ScreenBackground({ source, children, scrim = 0.35 }: Props) {
  return (
    <ImageBackground source={source} resizeMode="cover" style={styles.image}>
      {scrim > 0 && (
        <View pointerEvents="none" style={[styles.scrim, { backgroundColor: `rgba(0,0,0,${scrim})` }]} />
      )}
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  image: { flex: 1 },
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
});
