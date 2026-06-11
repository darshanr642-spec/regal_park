import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/lib/api";
import { Watermark } from "@/src/components/Watermark";
import { colors, font, radii, shadow, spacing, statusColor } from "@/src/lib/theme";

const ELEVATION_COLORS: Record<string, string> = {
  Elora: "#B8860B",
  Selora: "#2F6B4F",
  Avira: "#34548A",
  Riora: "#8A4B34",
};

export default function PlotDetail() {
  const { no } = useLocalSearchParams<{ no: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!no) return;
    api.plot(parseInt(no, 10)).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [no]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  if (!data) return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.center}><Text style={{ color: colors.muted }}>Plot not found.</Text></View>
    </SafeAreaView>
  );

  const { plot, project, phases } = data;
  const accent = ELEVATION_COLORS[plot.villa_type] || colors.brand;
  const completed = phases.filter((p: any) => p.status === "COMPLETED").length;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Pressable testID="back-button" onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Plot {plot.plot_no}</Text>
          <Text style={styles.sub}>Regal Park · 22-Acre Layout</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {/* Villa model card */}
        <View style={[styles.modelCard, { borderLeftColor: accent }]} testID="villa-model-card">
          <View style={styles.modelHead}>
            <View>
              <Text style={styles.modelLabel}>ELEVATION MODEL</Text>
              <Text style={styles.modelName}>{plot.villa_type}</Text>
            </View>
            <View style={[styles.statusPill, { borderColor: statusColor(plot.status === "AVAILABLE" ? "PENDING" : plot.status === "SOLD" ? "SUBMITTED" : "IN_PROGRESS") }]}>
              <Text style={[styles.statusPillText, { color: statusColor(plot.status === "AVAILABLE" ? "PENDING" : plot.status === "SOLD" ? "SUBMITTED" : "IN_PROGRESS") }]}>
                {plot.status.replace(/_/g, " ")}
              </Text>
            </View>
          </View>
          <View style={styles.modelKvs}>
            <View style={styles.kv}><Text style={styles.kvLbl}>DIMENSION</Text><Text style={styles.kvVal}>{plot.dimension_ft} FT</Text></View>
            <View style={styles.kv}><Text style={styles.kvLbl}>PLOT NO</Text><Text style={styles.kvVal}>{plot.plot_no}</Text></View>
            {project && (
              <View style={styles.kv}><Text style={styles.kvLbl}>VILLA</Text><Text style={styles.kvVal}>{project.name}</Text></View>
            )}
            {project && (
              <View style={styles.kv}><Text style={styles.kvLbl}>HANDOVER</Text><Text style={styles.kvVal}>{project.target_handover_date}</Text></View>
            )}
          </View>
          {project && (
            <>
              <View style={styles.bar}><View style={[styles.barFill, { width: `${project.progress_pct}%` }]} /></View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={styles.metaTxt}>{project.progress_pct}% complete</Text>
                <Pressable testID="open-project-button" onPress={() => router.push(`/project/${project.id}` as any)}>
                  <Text style={styles.linkTxt}>OPEN PROJECT →</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>

        {/* Construction phases */}
        <View style={styles.phaseHeadRow}>
          <Text style={styles.sectionHead}>CONSTRUCTION PHASES</Text>
          <Text style={styles.phaseCount}>{completed}/{phases.length} done</Text>
        </View>
        {!project && (
          <Text style={styles.noticeTxt}>Construction has not started on this plot — standard phase plan shown.</Text>
        )}
        {phases.map((s: any, i: number) => (
          <View key={`${s.order}-${i}`} style={styles.phaseRow} testID={`phase-${s.order}`}>
            <View style={styles.phaseLeft}>
              <View style={[
                styles.phaseDot,
                s.status === "COMPLETED" && { backgroundColor: colors.success, borderColor: colors.success },
                s.status === "IN_PROGRESS" && { backgroundColor: colors.brandSecondary, borderColor: colors.brandSecondary },
                s.status === "DELAYED" && { backgroundColor: colors.error, borderColor: colors.error },
              ]} />
              {i < phases.length - 1 && <View style={styles.phaseLine} />}
            </View>
            <View style={styles.phaseBody}>
              <View style={styles.phaseTop}>
                <Text style={styles.phaseName}>{s.order}. {s.name}</Text>
                <Text style={[styles.phaseStatus, { color: statusColor(s.status) }]}>{s.status.replace(/_/g, " ")}</Text>
              </View>
              {s.planned_start && (
                <Text style={styles.phaseDates}>{s.planned_start} → {s.planned_end}{s.progress_pct ? ` · ${Math.round(s.progress_pct)}%` : ""}</Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, paddingBottom: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: spacing.sm, backgroundColor: colors.surfaceTertiary },
  title: { fontFamily: font.display, fontSize: 22, color: colors.onSurface },
  sub: { color: colors.muted, fontSize: 11, marginTop: 2 },

  modelCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderRadius: radii.md, padding: spacing.lg, ...shadow.card },
  modelHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  modelLabel: { color: colors.muted, fontSize: 9, letterSpacing: 2 },
  modelName: { fontFamily: font.display, fontSize: 28, color: colors.onSurface, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, borderWidth: 1 },
  statusPillText: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  modelKvs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  kv: { flexBasis: "45%", flexGrow: 1 },
  kvLbl: { color: colors.muted, fontSize: 9, letterSpacing: 1.2 },
  kvVal: { color: colors.onSurface, fontSize: 14, marginTop: 2, fontWeight: "600" },
  bar: { marginTop: spacing.md, height: 5, borderRadius: 3, backgroundColor: colors.border },
  barFill: { height: 5, borderRadius: 3, backgroundColor: colors.brandSecondary },
  metaTxt: { color: colors.muted, fontSize: 11 },
  linkTxt: { color: colors.brand, fontSize: 10, fontWeight: "700", letterSpacing: 1 },

  phaseHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionHead: { color: colors.muted, fontSize: 10, letterSpacing: 2 },
  phaseCount: { color: colors.brand, fontSize: 11, fontWeight: "700" },
  noticeTxt: { color: colors.muted, fontSize: 12, fontStyle: "italic", marginBottom: spacing.md },
  phaseRow: { flexDirection: "row" },
  phaseLeft: { width: 24, alignItems: "center" },
  phaseDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, marginTop: 4 },
  phaseLine: { flex: 1, width: 2, backgroundColor: colors.divider },
  phaseBody: { flex: 1, paddingBottom: spacing.lg, paddingLeft: spacing.sm },
  phaseTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  phaseName: { color: colors.onSurface, fontSize: 13, fontWeight: "600", flex: 1, paddingRight: spacing.sm },
  phaseStatus: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  phaseDates: { color: colors.muted, fontSize: 11, marginTop: 2 },
});
