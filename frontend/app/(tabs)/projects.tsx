import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/lib/api";
import { Watermark } from "@/src/components/Watermark";
import { colors, font, formatINR, radii, shadow, spacing } from "@/src/lib/theme";

export default function Projects() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.projects().then((p) => { setProjects(p); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Text style={styles.title}>Projects</Text>
        <Text style={styles.sub}>{projects.length} active villas</Text>
      </View>
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl }}
        renderItem={({ item }) => (
          <Pressable
            testID={`project-card-${item.id}`}
            style={styles.card}
            onPress={() => router.push(`/project/${item.id}` as any)}
          >
            <Image source={item.hero_image_url} style={styles.cardImg} contentFit="cover" />
            <LinearGradient colors={["transparent", "rgba(26,26,26,0.6)"]} style={StyleSheet.absoluteFillObject} />
            <View style={styles.cardBody}>
              <Text style={styles.cardName}>{item.name}</Text>
              <Text style={styles.cardSub}>{item.plot_number}</Text>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.metaLabel}>CLIENT</Text>
                  <Text style={styles.metaValue}>{item.client_name}</Text>
                </View>
                <View style={styles.ringWrap}>
                  <Text style={styles.ringText}>{Math.round(item.progress_pct)}%</Text>
                </View>
              </View>
              <View style={styles.bar}><View style={[styles.barFill, { width: `${item.progress_pct}%` }]} /></View>
              <View style={[styles.row, { marginTop: spacing.sm }]}>
                <Text style={styles.metaValue}>{formatINR(item.actual_spent_inr)} / {formatINR(item.budget_inr)}</Text>
                <Feather name="arrow-right" size={16} color={colors.brandSecondary} />
              </View>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
  title: { fontFamily: font.display, fontSize: 28, color: colors.onSurface },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  card: {
    height: 320,
    borderRadius: radii.lg,
    overflow: "hidden",
    marginBottom: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    ...shadow.card,
  },
  cardImg: { width: "100%", height: "100%" },
  cardBody: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: "rgba(26,26,26,0.4)" },
  cardName: { fontFamily: font.display, color: "#fff", fontSize: 22 },
  cardSub: { color: colors.brandTertiary, fontSize: 12, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  metaLabel: { color: colors.brandTertiary, fontSize: 9, letterSpacing: 1.5 },
  metaValue: { color: "#fff", fontSize: 13, marginTop: 2 },
  ringWrap: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  ringText: { color: colors.brandSecondary, fontFamily: font.display, fontSize: 16, fontWeight: "600" },
  bar: { marginTop: spacing.sm, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" },
  barFill: { height: 3, borderRadius: 2, backgroundColor: colors.brandSecondary },
});
