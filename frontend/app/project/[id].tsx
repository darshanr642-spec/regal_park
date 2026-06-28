import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/lib/api";
import { Watermark } from "@/src/components/Watermark";
import { colors, font, formatINR, radii, shadow, spacing, statusColor } from "@/src/lib/theme";

type Tab = "TIMELINE" | "TEAM" | "BOQ";

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [stages, setStages] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [boq, setBoq] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("TIMELINE");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.allSettled([api.project(id), api.stages(id), api.team(id), api.boq(id).catch(() => [])])
      .then(([p, s, t, b]) => {
        if (p.status === "fulfilled") setProject(p.value);
        if (s.status === "fulfilled") setStages(s.value);
        if (t.status === "fulfilled") setTeam(t.value);
        if (b.status === "fulfilled") setBoq(b.value);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading || !project) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }} stickyHeaderIndices={[1]}>
        {/* Hero */}
        <View style={styles.hero}>
          <Image source={project.hero_image_url} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          <LinearGradient colors={["rgba(26,26,26,0.5)", "rgba(26,26,26,0.95)"]} style={StyleSheet.absoluteFillObject} />
          <Pressable testID="back-button" style={styles.back} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </Pressable>
          <View style={styles.heroBody}>
            <Text style={styles.heroBadge}>FLAGSHIP · {project.villa_type}</Text>
            <Text style={styles.heroName}>{project.name}</Text>
            <Text style={styles.heroPlot}>{project.plot_number}</Text>

            <View style={styles.heroStats}>
              <View style={styles.statBlock}><Text style={styles.statVal}>{project.progress_pct}%</Text><Text style={styles.statLbl}>PROGRESS</Text></View>
              <View style={styles.statDivider} />
              <View style={styles.statBlock}><Text style={styles.statVal}>{formatINR(project.budget_inr)}</Text><Text style={styles.statLbl}>BUDGET</Text></View>
              <View style={styles.statDivider} />
              <View style={styles.statBlock}><Text style={styles.statVal}>{project.built_up_area_sqft.toLocaleString()}</Text><Text style={styles.statLbl}>SQFT</Text></View>
            </View>
          </View>
        </View>

        {/* Sticky tabs */}
        <View style={styles.segmentWrap}>
          <View style={styles.segment}>
            {(["TIMELINE", "TEAM", "BOQ"] as Tab[]).map((t) => (
              <Pressable
                key={t}
                testID={`tab-${t.toLowerCase()}`}
                style={[styles.segItem, tab === t && styles.segActive]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.segText, tab === t && styles.segTextActive]}>{t}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ padding: spacing.lg }}>
          {tab === "TIMELINE" && stages.map((s, i) => {
            const color = statusColor(s.status);
            const isLast = i === stages.length - 1;
            return (
              <View key={s.id} style={styles.stageRow} testID={`stage-${s.id}`}>
                <View style={styles.stageDotCol}>
                  <View style={[styles.stageDot, { borderColor: color, backgroundColor: s.status === "COMPLETED" ? color : colors.surface }]}>
                    <Text style={[styles.stageDotNum, { color: s.status === "COMPLETED" ? "#fff" : color }]}>{s.order}</Text>
                  </View>
                  {!isLast && <View style={[styles.stageLine, { backgroundColor: s.status === "COMPLETED" ? color : colors.border }]} />}
                </View>
                <View style={styles.stageBody}>
                  <View style={styles.stageHead}>
                    <Text style={styles.stageName}>{s.name}</Text>
                    <View style={[styles.statusPill, { borderColor: color }]}>
                      <Text style={[styles.statusPillText, { color }]}>{s.status.replace("_", " ")}</Text>
                    </View>
                  </View>
                  <Text style={styles.stageMeta}>{s.planned_start} → {s.planned_end} · {s.responsible}</Text>
                  <View style={styles.stageBar}>
                    <View style={[styles.stageBarFill, { width: `${s.progress_pct}%`, backgroundColor: color }]} />
                  </View>
                  <Text style={styles.stageRemark}>{s.remarks}{s.delay_reason ? ` · ${s.delay_reason}` : ""}</Text>
                </View>
              </View>
            );
          })}

          {tab === "TEAM" && team.map((m) => (
            <View key={m.id} style={styles.teamCard} testID={`team-${m.id}`}>
              <View style={styles.teamAvatar}>
                <Text style={styles.teamInitials}>{m.name.split(" ").map((s: string) => s[0]).slice(0, 2).join("")}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.teamName}>{m.name}</Text>
                <Text style={styles.teamRole}>{m.role} · {m.company}</Text>
                <Text style={styles.teamScope}>{m.scope_of_work}</Text>
              </View>
            </View>
          ))}

          {tab === "BOQ" && (
            <>
              <View style={styles.boqHeader}>
                <Text style={[styles.boqCell, styles.boqHCell, { flex: 2 }]}>ITEM</Text>
                <Text style={[styles.boqCell, styles.boqHCell, { textAlign: "right" }]}>BUDGET</Text>
                <Text style={[styles.boqCell, styles.boqHCell, { textAlign: "right" }]}>SPENT</Text>
              </View>
              {boq.map((b, idx) => {
                const over = b.actual_spent_inr > b.approved_budget_inr;
                return (
                  <View key={b.id} style={[styles.boqRow, idx % 2 === 1 && { backgroundColor: colors.surfaceTertiary }]} testID={`boq-${b.id}`}>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.boqItem}>{b.description}</Text>
                      <Text style={styles.boqVendor}>{b.category} · {b.vendor}</Text>
                    </View>
                    <Text style={[styles.boqCell, { textAlign: "right" }]}>{formatINR(b.approved_budget_inr)}</Text>
                    <Text style={[styles.boqCell, { textAlign: "right", color: over ? colors.error : colors.onSurface, fontWeight: over ? "700" : "400" }]}>{formatINR(b.actual_spent_inr)}</Text>
                  </View>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  hero: { height: 320, justifyContent: "flex-end" },
  back: { position: "absolute", top: spacing.lg, left: spacing.lg, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  heroBody: { padding: spacing.lg },
  heroBadge: { color: colors.brandSecondary, fontSize: 10, letterSpacing: 2.5 },
  heroName: { fontFamily: font.display, color: "#fff", fontSize: 32, marginTop: 2 },
  heroPlot: { color: colors.brandTertiary, fontSize: 13, marginTop: 4 },
  heroStats: { flexDirection: "row", alignItems: "center", marginTop: spacing.lg, backgroundColor: "rgba(0,0,0,0.35)", padding: spacing.md, borderRadius: radii.md },
  statBlock: { flex: 1, alignItems: "center" },
  statVal: { fontFamily: font.display, color: "#fff", fontSize: 18 },
  statLbl: { color: colors.brandTertiary, fontSize: 9, letterSpacing: 1.5, marginTop: 2 },
  statDivider: { width: 1, height: 24, backgroundColor: "rgba(255,255,255,0.2)" },

  segmentWrap: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  segment: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radii.md, padding: 4 },
  segItem: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", borderRadius: radii.sm },
  segActive: { backgroundColor: colors.surfaceInverse },
  segText: { fontSize: 11, letterSpacing: 1.5, color: colors.muted, fontWeight: "600" },
  segTextActive: { color: colors.brandSecondary },

  stageRow: { flexDirection: "row", marginBottom: spacing.md },
  stageDotCol: { alignItems: "center", marginRight: spacing.md },
  stageDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  stageDotNum: { fontSize: 11, fontWeight: "700" },
  stageLine: { width: 2, flex: 1, marginTop: 2 },
  stageBody: { flex: 1, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, ...shadow.card },
  stageHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stageName: { fontFamily: font.display, fontSize: 16, color: colors.onSurface, flex: 1 },
  stageMeta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  stageBar: { marginTop: spacing.sm, height: 3, borderRadius: 2, backgroundColor: colors.border },
  stageBarFill: { height: 3, borderRadius: 2 },
  stageRemark: { color: colors.muted, fontSize: 11, marginTop: 4, fontStyle: "italic" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, borderWidth: 1 },
  statusPillText: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },

  teamCard: { flexDirection: "row", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, marginBottom: spacing.sm },
  teamAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  teamInitials: { fontFamily: font.display, color: colors.onBrandTertiary, fontWeight: "700" },
  teamName: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  teamRole: { color: colors.brand, fontSize: 11, marginTop: 2, letterSpacing: 0.5 },
  teamScope: { color: colors.muted, fontSize: 11, marginTop: 4 },

  boqHeader: { flexDirection: "row", paddingVertical: spacing.sm, borderBottomWidth: 2, borderBottomColor: colors.brandSecondary },
  boqHCell: { fontSize: 10, letterSpacing: 1.5, color: colors.muted, fontWeight: "700" },
  boqRow: { flexDirection: "row", padding: spacing.sm, alignItems: "center" },
  boqCell: { flex: 1, fontSize: 12, color: colors.onSurface },
  boqItem: { fontSize: 13, color: colors.onSurface, fontWeight: "500" },
  boqVendor: { fontSize: 10, color: colors.muted, marginTop: 2 },
});
