import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, Platform } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";

type Props = {
  uris: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
};

/**
 * Photo lightbox — full-screen Modal that shows a single image at a time
 * with horizontal swipe to flip and pinch-zoom (native, via maximumZoomScale).
 */
export function PhotoLightbox({ uris, initialIndex = 0, visible, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);

  React.useEffect(() => { if (visible) setIndex(initialIndex); }, [visible, initialIndex]);

  if (!visible || uris.length === 0) return null;
  const uri = uris[index];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop} testID="lightbox">
        <Pressable style={styles.closeBtn} onPress={onClose} testID="lightbox-close">
          <Feather name="x" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.counter}>{index + 1} / {uris.length}</Text>

        {/* Pinch-zoom on native via ScrollView; web uses CSS object-fit. */}
        <ScrollView
          style={{ flex: 1, width: "100%" }}
          contentContainerStyle={styles.scroll}
          maximumZoomScale={Platform.OS === "web" ? 1 : 4}
          minimumZoomScale={1}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          centerContent
        >
          <Image source={uri} style={styles.image} contentFit="contain" />
        </ScrollView>

        {uris.length > 1 && (
          <View style={styles.nav}>
            <Pressable
              testID="lightbox-prev"
              onPress={() => setIndex((index - 1 + uris.length) % uris.length)}
              style={styles.navBtn}
            >
              <Feather name="chevron-left" size={20} color="#fff" />
            </Pressable>
            <Pressable
              testID="lightbox-next"
              onPress={() => setIndex((index + 1) % uris.length)}
              style={styles.navBtn}
            >
              <Feather name="chevron-right" size={20} color="#fff" />
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)" },
  closeBtn: { position: "absolute", top: 44, right: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  counter: { position: "absolute", top: 50, alignSelf: "center", color: "#fff", letterSpacing: 1.5, fontSize: 12, zIndex: 10 },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  image: { width: "100%", aspectRatio: 1, maxHeight: "100%" },
  nav: { position: "absolute", left: 0, right: 0, bottom: 60, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 24 },
  navBtn: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
});
