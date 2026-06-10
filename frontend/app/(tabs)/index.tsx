import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useProject } from "@/src/lib/project";
import { colors, font, formatINR, radii, shadow, spacing, statusColor } from "@/src/lib/theme";

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { projects, current, setCurrent } = useProject();
  const [data, setData] = useState<any>(null);
  const [stages, setStages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([
        api.dashboard().catch(() => null),
        current ? api.stages(current.id) : Promise.resolve([]),
      ]);
      setData(d);
      setStages(s);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [current]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>;
  }

  const overBudget = data && data.budget_used_pct > data.avg_progress_pct + 8;
  const project = current;

  const kpis: { label: string; value: string; sub?: string; tone?: string; icon: any }[] = data ? [
    { label: "ACTIVE VILLAS", value: String(data.under_construction ?? 0), sub: `of ${data.total_projects} total`, icon: "home" },
    { label: "AVG PROGRESS", value: `${data.avg_progress_pct}%`, sub: "across portfolio", icon: "trending-up" },
    { label: "BUDGET USED", value: `${data.budget_used_pct}%`, sub: formatINR(data.actual_spent_inr), tone: overBudget ? "warn" : undefined, icon: "pie-chart" },
    { label: "DELAYED TASKS", value: String(data.delayed_tasks), sub: "need attention", tone: data.delayed_tasks > 0 ? "warn" : undefined, icon: "alert-triangle" },
    { label: "PENDING BILLS", value: String(data.pending_bills), sub: formatINR(data.pending_bills_amount_inr), icon: "credit-card" },
    { label: "OPEN SNAGS", value: String(data.open_snags), sub: `${data.quality_issues} quality issues`, icon: "tool" },
  ] : [];

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.hello}>Good day,</Text>
            <Text style={styles.userName}>{(user?.full_name || "").split(/[ &]/).filter(Boolean)[0]}</Text>
          </View>
          <View style={styles.avatar} testID="user-avatar">
            <Text style={styles.avatarText}>RP</Text>
          </View>
        </View>

        {/* Project switcher chips */}
        {projects.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {projects.map((p) => (
              <Pressable
                key={p.id}
                testID={`project-chip-${p.id}`}
                onPress={() => setCurrent(p)}
                style={[styles.chip, current?.id === p.id && styles.chipActive]}
              >
                <Text style={[styles.chipText, current?.id === p.id && styles.chipTextActive]}>
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {project && (
          <Pressable
            testID="hero-project-card"
            style={styles.hero}
            onPress={() => router.push(`/project/${project.id}` as any)}
          >
            <Image source={project.hero_image_url} style={styles.heroImg} contentFit="cover" />
            <LinearGradient colors={["transparent", "rgba(26,26,26,0.85)"]} style={StyleSheet.absoluteFillObject} />
            <View style={styles.heroBottom}>
              <View style={styles.heroGlass}>
                <Text style={styles.heroBadge}>{project.id === "villa-aurelia-12" ? "FLAGSHIP" : "ACTIVE"}</Text>
                <Text style={styles.heroName}>{project.name}</Text>
                <Text style={styles.heroPlot}>{project.plot_number} · {project.villa_type}</Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressBar, { width: `${project.progress_pct}%` }]} />
                </View>
                <View style={styles.heroMeta}>
                  <Text style={styles.heroMetaTxt}>{project.progress_pct}% complete</Text>
                  <Text style={styles.heroMetaTxt}>Budget {formatINR(project.budget_inr)}</Text>
                </View>
              </View>
            </View>
          </Pressable>
        )}

        {data && (
          <View style={styles.kpiGrid}>
            {kpis.map((k) => (
              <View key={k.label} style={[styles.kpi, k.tone === "warn" && styles.kpiWarn]} testID={`kpi-${k.label.replace(/\s/g, "-").toLowerCase()}`}>
                <View style={styles.kpiHead}>
                  <Text style={styles.kpiLabel}>{k.label}</Text>
                  <Feather name={k.icon} size={14} color={colors.brand} />
                </View>
                <Text style={styles.kpiValue}>{k.value}</Text>
                {k.sub && <Text style={styles.kpiSub}>{k.sub}</Text>}
              </View>
            ))}
          </View>
        )}

        {!data && user?.role === "CLIENT" && (
          <View style={styles.clientCard}>
            <Feather name="key" size={20} color={colors.brand} />
            <Text style={styles.clientCardText}>
              Welcome to your client portal. Track your villa&apos;s progress below — internal cost data is intentionally hidden.
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Construction Progress</Text>
          <Text style={styles.sectionSub}>{project?.name} · stage updates</Text>
        </View>
        <View style={{ paddingHorizontal: spacing.lg }}>
          {stages.slice(0, 8).map((s: any) => (
            <View key={s.id} style={styles.row} testID={`activity-${s.id}`}>
              <View style={[styles.rowDot, { backgroundColor: statusColor(s.status) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{s.name}</Text>
                <Text style={styles.rowStatus}>{s.status.replace("_", " ")} · {Math.round(s.progress_pct)}%</Text>
              </View>
              <View style={[styles.statusPill, { borderColor: statusColor(s.status) }]}>
                <Text style={[styles.statusPillText, { color: statusColor(s.status) }]}>{s.status === "COMPLETED" ? "DONE" : s.status === "IN_PROGRESS" ? "ACTIVE" : s.status === "DELAYED" ? "DELAY" : "PLAN"}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable
          testID="view-project-button"
          style={styles.linkBtn}
          onPress={() => project && router.push(`/project/${project.id}` as any)}
        >
          <Text style={styles.linkBtnTxt}>VIEW FULL PROJECT</Text>
          <Feather name="arrow-right" size={14} color={colors.brand} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.lg, paddingTop: spacing.md },
  hello: { color: colors.muted, fontSize: 12, letterSpacing: 1.5 },
  userName: { fontFamily: font.display, fontSize: 26, color: colors.onSurface, marginTop: 2 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: font.display, color: colors.onBrandTertiary, fontWeight: "700", letterSpacing: 1 },

  chipRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm, flexDirection: "row" },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, flexShrink: 0 },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontSize: 12, color: colors.muted, fontWeight: "500" },
  chipTextActive: { color: colors.brandSecondary },

  hero: { marginHorizontal: spacing.lg, height: 280, borderRadius: radii.lg, overflow: "hidden", marginBottom: spacing.lg },
  heroImg: { width: "100%", height: "100%" },
  heroBottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg },
  heroGlass: { backgroundColor: "rgba(26,26,26,0.55)", borderRadius: radii.md, padding: spacing.lg, borderWidth: 1, borderColor: "rgba(212,175,55,0.35)" },
  heroBadge: { color: colors.brandSecondary, fontSize: 10, letterSpacing: 2.5, marginBottom: 4 },
  heroName: { fontFamily: font.display, color: "#fff", fontSize: 24 },
  heroPlot: { color: colors.brandTertiary, fontSize: 12, marginTop: 2 },
  progressTrack: { marginTop: spacing.md, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)", overflow: "hidden" },
  progressBar: { height: 4, backgroundColor: colors.brandSecondary },
  heroMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  heroMetaTxt: { color: "#fff", fontSize: 12, opacity: 0.9 },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.lg, gap: spacing.md, marginTop: spacing.sm },
  kpi: { width: "47%", flexGrow: 1, minWidth: 140, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.lg, ...shadow.card },
  kpiWarn: { borderColor: colors.warning, backgroundColor: "#FFF8EE" },
  kpiHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kpiLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1.5 },
  kpiValue: { fontFamily: font.display, fontSize: 26, color: colors.onSurface, marginTop: spacing.sm },
  kpiSub: { color: colors.muted, fontSize: 11, marginTop: 2 },

  clientCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginHorizontal: spacing.lg, padding: spacing.lg, backgroundColor: colors.brandTertiary, borderRadius: radii.md, marginTop: spacing.sm },
  clientCardText: { flex: 1, color: colors.onBrandTertiary, fontSize: 13, lineHeight: 19 },

  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xxl, marginBottom: spacing.md },
  sectionTitle: { fontFamily: font.display, fontSize: 20, color: colors.onSurface },
  sectionSub: { color: colors.muted, fontSize: 12, marginTop: 2 },

  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowDot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.md },
  rowTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "500" },
  rowStatus: { color: colors.muted, fontSize: 11, marginTop: 2, letterSpacing: 0.6 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, borderWidth: 1 },
  statusPillText: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },

  linkBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: spacing.sm, marginTop: spacing.xl, padding: spacing.lg, marginHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radii.md },
  linkBtnTxt: { color: colors.brand, letterSpacing: 2.5, fontSize: 12, fontWeight: "600" },
});
