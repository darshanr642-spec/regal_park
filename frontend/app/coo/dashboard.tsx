import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Watermark } from "@/src/components/Watermark";
import { api } from "@/src/lib/api";

/* ── Executive palette ────────────────────────────────────────────── */
const E = {
  bg: "#0F1117",
  card: "#1A1D28",
  cardAlt: "#222638",
  accent: "#C5A059",
  accentLight: "#D4AF37",
  accentMuted: "#8A7A55",
  white: "#F0ECE3",
  muted: "#6B6B7B",
  green: "#34D399",
  amber: "#FBBF24",
  red: "#F87171",
  blue: "#60A5FA",
  border: "#2A2D3A",
};

function formatINR(n: number) {
  if (n == null || isNaN(n)) return "₹ —";
  if (Math.abs(n) >= 1e7) return `₹ ${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹ ${(n / 1e5).toFixed(2)} L`;
  return `₹ ${n.toLocaleString("en-IN")}`;
}

const HEALTH_STYLE: Record<string, { bg: string; txt: string }> = {
  GREEN: { bg: E.green + "22", txt: E.green },
  AMBER: { bg: E.amber + "22", txt: E.amber },
  RED: { bg: E.red + "22", txt: E.red },
};

const SEV_STYLE: Record<string, { bg: string; txt: string; icon: any }> = {
  CRITICAL: { bg: E.red + "22", txt: E.red, icon: "alert-octagon" },
  HIGH: { bg: E.amber + "22", txt: E.amber, icon: "alert-triangle" },
  MEDIUM: { bg: E.blue + "22", txt: E.blue, icon: "info" },
};

export default function CooDashboard() {
  const router = useRouter();
  const [portfolio, setPortfolio] = React.useState<any>(null);
  const [projects, setProjects] = React.useState<any[]>([]);
  const [risks, setRisks] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState<"overview" | "health" | "risks">("overview");

  React.useEffect(() => {
    (async () => {
      try {
        const [p, h, r] = await Promise.all([
          api.cooPortfolio(),
          api.cooProjectsHealth(),
          api.cooRiskRegister(),
        ]);
        setPortfolio(p);
        setProjects(h);
        setRisks(r);
      } catch { }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <Watermark />
        <Text style={styles.loadingTxt}>Loading executive dashboard…</Text>
      </SafeAreaView>
    );
  }

  const ps = portfolio?.plot_summary || {};
  const sales = portfolio?.sales || {};
  const ops = portfolio?.operations || {};
  const leads = portfolio?.leads || {};
  const coll = portfolio?.collections || {};
  const proj = portfolio?.projects || {};

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={E.white} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>STERLITEE DEVELOPERS</Text>
          <Text style={styles.headerTitle}>Command Centre</Text>
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveTxt}>LIVE</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(["overview", "health", "risks"] as const).map((t) => (
          <Pressable key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabTxt, tab === t && styles.tabTxtActive]}>{t.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
        {tab === "overview" && (
          <>
            {/* ── PLOT STATUS ── */}
            <Text style={styles.sectionTitle}>LAND INVENTORY</Text>
            <View style={styles.kpiRow}>
              <KpiCard label="Total Plots" value={ps.total} color={E.white} />
              <KpiCard label="Available" value={ps.available} color={E.green} />
              <KpiCard label="Reserved" value={ps.reserved} color={E.amber} />
            </View>
            <View style={styles.kpiRow}>
              <KpiCard label="Booked" value={ps.booked} color={E.blue} />
              <KpiCard label="Under Const." value={ps.under_construction} color={E.accent} />
              <KpiCard label="Sold" value={ps.sold} color={E.accentLight} />
            </View>

            {/* Plot bar */}
            <View style={styles.plotBar}>
              {ps.total > 0 && (
                <>
                  {ps.sold > 0 && <View style={[styles.plotSeg, { flex: ps.sold, backgroundColor: E.accentLight }]} />}
                  {ps.under_construction > 0 && <View style={[styles.plotSeg, { flex: ps.under_construction, backgroundColor: E.accent }]} />}
                  {ps.booked > 0 && <View style={[styles.plotSeg, { flex: ps.booked, backgroundColor: E.blue }]} />}
                  {ps.reserved > 0 && <View style={[styles.plotSeg, { flex: ps.reserved, backgroundColor: E.amber }]} />}
                  {ps.available > 0 && <View style={[styles.plotSeg, { flex: ps.available, backgroundColor: E.green }]} />}
                </>
              )}
            </View>

            {/* ── SALES ── */}
            <Text style={styles.sectionTitle}>SALES PERFORMANCE</Text>
            <View style={styles.kpiRow}>
              <KpiCard label="Total Sales" value={formatINR(sales.total_sales_value_inr)} color={E.accent} wide />
              <KpiCard label="Confirmed" value={formatINR(sales.confirmed_value_inr)} color={E.green} wide />
            </View>
            <View style={styles.kpiRow}>
              <KpiCard label="Pipeline" value={formatINR(sales.pipeline_value_inr)} color={E.amber} wide />
              <KpiCard label="Avg Discount" value={`${sales.avg_discount_pct || 0}%`} color={E.red} wide />
            </View>

            {/* ── COLLECTIONS ── */}
            <Text style={styles.sectionTitle}>COLLECTIONS</Text>
            <View style={styles.kpiRow}>
              <KpiCard label="Collectible" value={formatINR(coll.total_collectible_inr)} color={E.white} wide />
              <KpiCard label="Collected" value={formatINR(coll.collected_inr)} color={E.green} wide />
            </View>

            {/* ── OPERATIONS ── */}
            <Text style={styles.sectionTitle}>OPERATIONS</Text>
            <View style={styles.kpiRow}>
              <KpiCard label="Projects" value={proj.in_progress} color={E.blue} />
              <KpiCard label="Avg Progress" value={`${proj.avg_progress_pct}%`} color={E.accent} />
              <KpiCard label="Leads" value={leads.active} color={E.green} />
            </View>
            <View style={styles.kpiRow}>
              <KpiCard label="Open Approvals" value={ops.total_open_approvals} color={ops.total_open_approvals > 0 ? E.amber : E.green} />
              <KpiCard label="Delayed Stages" value={ops.delayed_stages} color={ops.delayed_stages > 0 ? E.red : E.green} />
              <KpiCard label="Open Snags" value={ops.open_snags} color={ops.open_snags > 0 ? E.amber : E.green} />
            </View>
          </>
        )}

        {tab === "health" && (
          <>
            <Text style={styles.sectionTitle}>PROJECT HEALTH MATRIX</Text>
            {projects.map((p) => {
              const h = HEALTH_STYLE[p.health] || HEALTH_STYLE.GREEN;
              return (
                <View key={p.id} style={styles.healthCard}>
                  <View style={styles.healthHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.healthName}>{p.name}</Text>
                      <Text style={styles.healthPlot}>{p.plot_number} · {p.client_name}</Text>
                    </View>
                    <View style={[styles.healthBadge, { backgroundColor: h.bg }]}>
                      <Text style={[styles.healthBadgeTxt, { color: h.txt }]}>{p.health}</Text>
                    </View>
                  </View>

                  {/* Progress */}
                  <View style={styles.healthBarTrack}>
                    <View style={[styles.healthBarFill, { width: `${p.progress_pct}%`, backgroundColor: h.txt }]} />
                  </View>

                  <View style={styles.healthStats}>
                    <StatPill label="Progress" value={`${p.progress_pct}%`} />
                    <StatPill label="Budget" value={`${p.budget_used_pct}%`} warn={p.budget_used_pct > 80} />
                    <StatPill label="Delayed" value={p.delayed_stages} warn={p.delayed_stages > 0} />
                    <StatPill label="Snags" value={p.open_snags} warn={p.open_snags > 0} />
                    <StatPill label="Stages" value={`${p.completed_stages}/${p.total_stages}`} />
                  </View>
                </View>
              );
            })}
            {projects.length === 0 && <Text style={styles.emptyTxt}>No projects found</Text>}
          </>
        )}

        {tab === "risks" && (
          <>
            <Text style={styles.sectionTitle}>RISK REGISTER</Text>
            {/* Summary */}
            <View style={styles.kpiRow}>
              <KpiCard label="Total Risks" value={risks?.total_risks || 0} color={E.white} />
              <KpiCard label="Critical" value={risks?.critical || 0} color={E.red} />
              <KpiCard label="High" value={risks?.high || 0} color={E.amber} />
            </View>

            {risks?.risks?.map((r: any, i: number) => {
              const s = SEV_STYLE[r.severity] || SEV_STYLE.MEDIUM;
              return (
                <View key={i} style={styles.riskCard}>
                  <View style={[styles.riskIcon, { backgroundColor: s.bg }]}>
                    <Feather name={s.icon} size={16} color={s.txt} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.riskHeader}>
                      <Text style={styles.riskTitle}>{r.title}</Text>
                      <View style={[styles.sevBadge, { backgroundColor: s.bg }]}>
                        <Text style={[styles.sevTxt, { color: s.txt }]}>{r.severity}</Text>
                      </View>
                    </View>
                    <Text style={styles.riskDetail}>{r.detail}</Text>
                    <View style={styles.riskMeta}>
                      <Text style={styles.riskProject}>{r.project}</Text>
                      {r.due_date && <Text style={styles.riskDue}>{r.due_date}</Text>}
                    </View>
                  </View>
                </View>
              );
            })}
            {(risks?.risks?.length || 0) === 0 && (
              <View style={styles.emptyBlock}>
                <Feather name="check-circle" size={32} color={E.green} />
                <Text style={styles.emptyTxt}>No active risks</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function KpiCard({ label, value, color, wide }: { label: string; value: any; color: string; wide?: boolean }) {
  return (
    <View style={[styles.kpiCard, wide && { flex: 1 }]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]}>{value ?? "—"}</Text>
    </View>
  );
}

function StatPill({ label, value, warn }: { label: string; value: any; warn?: boolean }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, warn && { color: E.red }]}>{value}</Text>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: E.bg },
  loadingTxt: { color: E.muted, fontSize: 16, textAlign: "center", marginTop: 100 },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  backBtn: { padding: 8, marginRight: 12 },
  headerLabel: { fontSize: 8, letterSpacing: 4, color: E.accentMuted, fontWeight: "700" },
  headerTitle: { fontSize: 24, fontWeight: "700", color: E.white, fontFamily: "Georgia" },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: E.green + "15", borderWidth: 1, borderColor: E.green + "33" },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: E.green },
  liveTxt: { fontSize: 9, fontWeight: "700", color: E.green, letterSpacing: 1 },

  tabs: { flexDirection: "row", marginHorizontal: 20, marginBottom: 8, backgroundColor: E.card, borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  tabActive: { backgroundColor: E.accent + "22" },
  tabTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5, color: E.muted },
  tabTxtActive: { color: E.accent },

  sectionTitle: { fontSize: 9, letterSpacing: 3, color: E.accentMuted, fontWeight: "700", marginTop: 20, marginBottom: 12 },

  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  kpiCard: { flex: 1, backgroundColor: E.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: E.border, alignItems: "center" },
  kpiLabel: { fontSize: 9, letterSpacing: 1, color: E.muted, fontWeight: "600" },
  kpiValue: { fontSize: 20, fontWeight: "700", marginTop: 6 },

  plotBar: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: E.cardAlt, marginBottom: 8 },
  plotSeg: { height: 8 },

  healthCard: { backgroundColor: E.card, borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: E.border },
  healthHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  healthName: { fontSize: 15, fontWeight: "700", color: E.white },
  healthPlot: { fontSize: 11, color: E.muted, marginTop: 2 },
  healthBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  healthBadgeTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  healthBarTrack: { height: 5, borderRadius: 3, backgroundColor: E.cardAlt },
  healthBarFill: { height: 5, borderRadius: 3 },
  healthStats: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },

  statPill: { backgroundColor: E.cardAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignItems: "center" },
  statLabel: { fontSize: 8, letterSpacing: 0.5, color: E.muted, fontWeight: "600" },
  statValue: { fontSize: 12, fontWeight: "700", color: E.white, marginTop: 1 },

  riskCard: { flexDirection: "row", backgroundColor: E.card, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: E.border },
  riskIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", marginRight: 14 },
  riskHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  riskTitle: { fontSize: 13, fontWeight: "700", color: E.white, flex: 1 },
  sevBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  sevTxt: { fontSize: 8, fontWeight: "700", letterSpacing: 0.5 },
  riskDetail: { fontSize: 11, color: E.muted, marginBottom: 6 },
  riskMeta: { flexDirection: "row", gap: 12 },
  riskProject: { fontSize: 10, color: E.accentMuted, fontWeight: "600" },
  riskDue: { fontSize: 10, color: E.muted },

  emptyBlock: { alignItems: "center", marginTop: 40, gap: 12 },
  emptyTxt: { color: E.muted, fontSize: 14, textAlign: "center", marginTop: 20 },
});
