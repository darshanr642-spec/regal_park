import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { Image } from "expo-image";

const NAVY = "#151547";
const HOLD_MS = 1700;
const FADE_MS = 650;

// Module-level flag: the splash must only ever play once per app session,
// even if the root layout remounts (e.g. after login navigation).
let alreadyShown = false;

/**
 * Branded intro overlay shown once at app start: Sterlitee logo on the
 * signature navy, fading out to reveal the app.
 */
export function BrandSplash() {
  const [gone, setGone] = useState(alreadyShown);
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (alreadyShown) {
      // Root layout remounted (e.g. after login navigation) — never replay.
      setGone(true);
      return;
    }
    alreadyShown = true;
    Animated.timing(scale, { toValue: 1, duration: 900, useNativeDriver: true }).start();
    const t1 = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start();
    }, HOLD_MS);
    // Hard removal guard in case the animation callback is dropped (web)
    const t2 = setTimeout(() => setGone(true), HOLD_MS + FADE_MS + 80);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [opacity, scale]);

  if (gone) return null;

  return (
    <Animated.View style={[styles.wrap, { opacity }]} pointerEvents="none" testID="brand-splash">
      <Animated.View style={{ transform: [{ scale }], alignItems: "center" }}>
        <Image
          source={require("@/assets/brand/sterlitee-mark.png")}
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={styles.sub} testID="splash-developers-llp">DEVELOPERS LLP</Text>
        <Text style={styles.subSecondary} testID="splash-regal-park-villas">REGAL PARK VILLAS</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
  },
  logo: { width: 200, height: 184 },
  sub: { color: "rgba(212,175,55,0.85)", fontSize: 13, letterSpacing: 4, marginTop: 16 },
  subSecondary: { color: "rgba(212,175,55,0.6)", fontSize: 11, letterSpacing: 3, marginTop: 10 },
});
