import React from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";

/**
 * Subtle Sterlitee logo watermark rendered behind every screen's content.
 * pointerEvents="none" keeps it fully non-interactive.
 */
export function Watermark() {
  return (
    <View pointerEvents="none" style={styles.wrap} testID="brand-watermark">
      <Image
        source={require("@/assets/brand/regalpark-mark.png")}
        style={styles.img}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  img: { width: 320, height: 172, opacity: 0.06 },
});
