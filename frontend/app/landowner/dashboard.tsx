import React, { useCallback, useMemo, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/lib/api";
import { Watermark } from "@/src/components/Watermark";
import { LogoutButton } from "@/src/components/LogoutButton";

/* ── Landowner palette: deep midnight + emerald + gold ────────────── */
const L = {
  bg: "#080A10",
  surface: "#10131C",
  card: "#181C28",
  cardAlt: "#1E2233",
  gold: "#C5A059",
  goldLight: "#D4AF37",
  goldMuted: "#8A7A55",
  emerald: "#10B981",
  emeraldLight: "#34D399",
  emeraldDark: "#059669",
  white: "#F0ECE3",
  muted: "#6B6B7B",
  mutedLight: "#8E8E9E",
  amber: "#FBBF24",
  red: "#F87171",
  blue: "#60A5FA",
  purple: "#A78BFA",
  cyan: "#22D3EE",
  border: "#252838",
  borderLight: "#353848",
};

const STATUS_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  AVAILABLE: { color: L.emerald, bg: "#10B98118", label: "Available" },
  RESERVED: { color: L.amber, bg: "#FBBF2418", label: "Reserved" },
  BOOKED: { color: L.blue, bg: "#60A5FA18", label: "Booked" },
  SOLD: { color: L.goldLight, bg: "#D4AF3718", label: "Sold" },
  UNDER_CONSTRUCTION: { color: L.purple, bg: "#A78BFA18", label: "Under Const." },
  COMPLETED: { color: L.emeraldDark, bg: "#05966918", label: "Completed" },
};

const fmtINR = (n: number) => {
  if (n == null || isNaN(n)) return "₹ —";
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
};

const { width: SCREEN_W } = Dimensions.get("window");
const PLOT_COLS = SCREEN_W > 700 ? 15 : SCREEN_W > 500 ? 10 : 7;
const PLOT_SZ = Math.floor((SCREEN_W - 48) / PLOT_COLS) - 4;

type Tab = "overview" | "inventory" | "revenue" | "customers";

/* ════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════════ */
export default function LandownerDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedPlot, setSelectedPlot] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [searchText, setSearchText] = useState("");

  React.useEffect(() => {
    (async () => {
      try { setData(await api.landownerDashboard()); } catch {}
      setLoading(false);
    })();
  }, []);

  const filteredPlots = useMemo(() => {
    if (!data?.plots) return [];
    return data.plots.filter((p: any) => {
      if (filterStatus !== "ALL" && p.sales_status !== filterStatus) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        if (!`plot ${p.plot_no}`.toLowerCase().includes(q) &&
            !(p.client_name || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [data, filterStatus, searchText]);

  const clearFilters = useCallback(() => {
    setFilterStatus("ALL");
    setSearchText("");
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <Watermark />
        <View style={s.loadingWrap}>
          <Text style={s.loadingTxt}>Loading Dashboard…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const k = data?.kpis || {};
  const customers = data?.customers || [];
  const docs = data?.compliance_docs || [];
  const filters = data?.filters || {};

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <Watermark />

      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={L.white} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerLabel}>GOWDA FAMILY TRUST</Text>
          <Text style={s.headerTitle}>Landowner Dashboard</Text>
        </View>
        <View style={s.shareBadge}>
          <Text style={s.shareTxt}>{k.landowner_share_pct || 30}%</Text>
          <Text style={s.shareLabel}>SHARE</Text>
        </View>
      </View>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <View style={s.tabs}>
        {(["overview", "inventory", "revenue", "customers"] as Tab[]).map((t) => (
          <Pressable key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Feather
              name={t === "overview" ? "home" : t === "inventory" ? "grid" : t === "revenue" ? "dollar-sign" : "users"}
              size={12}
              color={tab === t ? L.emerald : L.muted}
            />
            <Text style={[s.tabTxt, tab === t && s.tabTxtActive]}>
              {t.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {/* ════════════════════════════════════════════════════════
            OVERVIEW TAB
           ════════════════════════════════════════════════════════ */}
        {tab === "overview" && (
          <>
            {/* Hero */}
            <View style={s.heroRow}>
              <HeroCard icon="layers" label="My Plots" value={k.total_plots} color={L.white} sub={`${k.available} available`} />
              <HeroCard icon="trending-up" label="My Revenue" value={fmtINR(k.landowner_revenue_inr)} color={L.emerald} sub={`${k.landowner_share_pct}% share`} />
            </View>

            {/* Status strip */}
            <SectionHead title="PLOT STATUS" icon="pie-chart" />
            <View style={s.statusStrip}>
              {Object.entries(STATUS_COLORS).map(([key, cfg]) => {
                const cnt = filters.status_counts?.[key] || 0;
                if (cnt === 0 && key !== "AVAILABLE") return null;
                return (
                  <Pressable
                    key={key}
                    style={[s.statusChip, filterStatus === key && { borderColor: cfg.color, borderWidth: 1.5 }]}
                    onPress={() => setFilterStatus(filterStatus === key ? "ALL" : key)}
                  >
                    <View style={[s.statusDot, { backgroundColor: cfg.color }]} />
                    <Text style={s.statusLbl}>{cfg.label}</Text>
                    <Text style={[s.statusCnt, { color: cfg.color }]}>{cnt}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Financials */}
            <SectionHead title="FINANCIAL SUMMARY" icon="dollar-sign" />
            <View style={s.kpiRow}>
              <KpiCard label="Inventory Value" value={fmtINR(k.total_inventory_value)} color={L.white} />
              <KpiCard label="Sold Value" value={fmtINR(k.total_sold_value)} color={L.goldLight} />
            </View>
            <View style={s.kpiRow}>
              <KpiCard label="Collected" value={fmtINR(k.total_collected)} color={L.emerald} />
              <KpiCard label="Pending" value={fmtINR(k.total_pending)} color={L.amber} />
            </View>

            {/* Landowner share */}
            <View style={s.shareCard}>
              <View style={s.shareCardHeader}>
                <Feather name="briefcase" size={14} color={L.gold} />
                <Text style={s.shareCardTitle}>YOUR SHARE ({k.landowner_share_pct}%)</Text>
              </View>
              <View style={s.shareCardRow}>
                <ShareStat label="Total Revenue" value={fmtINR(k.landowner_revenue_inr)} color={L.emerald} />
                <ShareStat label="Collected" value={fmtINR(k.landowner_collected_inr)} color={L.emeraldLight} />
                <ShareStat label="Pending" value={fmtINR(k.landowner_pending_inr)} color={L.amber} />
              </View>
            </View>

            {/* Absorption */}
            <View style={s.barSection}>
              <View style={s.barHeader}>
                <Text style={s.barLabel}>Absorption Rate</Text>
                <Text style={[s.barPct, { color: L.emerald }]}>{k.absorption_rate}%</Text>
              </View>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${k.absorption_rate || 0}%`, backgroundColor: L.emerald }]} />
              </View>
            </View>

            {/* Compliance */}
            {docs.length > 0 && (
              <>
                <SectionHead title="COMPLIANCE DOCUMENTS" icon="file-text" />
                <View style={s.listCard}>
                  {docs.map((d: any, i: number) => (
                    <View key={i} style={s.listRow}>
                      <View style={s.docIcon}>
                        <Feather name="file" size={14} color={L.emerald} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.listTitle}>{d.file_name}</Text>
                        <Text style={s.listSub}>{d.category} · {d.description || "—"}</Text>
                      </View>
                      <Feather name="download" size={14} color={L.muted} />
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            INVENTORY TAB — Plot Heatmap
           ════════════════════════════════════════════════════════ */}
        {tab === "inventory" && (
          <>
            <View style={s.searchRow}>
              <View style={s.searchBox}>
                <Feather name="search" size={14} color={L.muted} />
                <TextInput
                  style={s.searchInput}
                  placeholder="Search plot or client…"
                  placeholderTextColor={L.muted}
                  value={searchText}
                  onChangeText={setSearchText}
                />
              </View>
              {(filterStatus !== "ALL" || searchText) && (
                <Pressable style={s.clearBtn} onPress={clearFilters}>
                  <Feather name="x" size={12} color={L.red} />
                  <Text style={s.clearTxt}>Clear</Text>
                </Pressable>
              )}
            </View>

            <SectionHead title="PLOT HEATMAP" icon="grid" />
            <Text style={s.plotCount}>{filteredPlots.length} plots</Text>

            <View style={s.heatmapGrid}>
              {filteredPlots.map((p: any) => {
                const cfg = STATUS_COLORS[p.sales_status] || STATUS_COLORS.AVAILABLE;
                return (
                  <Pressable
                    key={p.plot_no}
                    style={[s.plotCell, { backgroundColor: cfg.bg, borderColor: cfg.color + "44" }]}
                    onPress={() => setSelectedPlot(p)}
                  >
                    <Text style={[s.plotNo, { color: cfg.color }]}>{p.plot_no}</Text>
                    {p.is_corner && <View style={[s.cornerDot, { backgroundColor: L.goldLight }]} />}
                  </Pressable>
                );
              })}
            </View>

            {/* Legend */}
            <View style={s.legendRow}>
              {Object.entries(STATUS_COLORS).map(([key, cfg]) => (
                <View key={key} style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: cfg.color }]} />
                  <Text style={s.legendLabel}>{cfg.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            REVENUE TAB
           ════════════════════════════════════════════════════════ */}
        {tab === "revenue" && (
          <>
            <SectionHead title="REVENUE BREAKDOWN" icon="trending-up" />
            <View style={s.heroRow}>
              <HeroCard icon="dollar-sign" label="Total Revenue" value={fmtINR(k.landowner_revenue_inr)} color={L.emerald} sub={`${k.landowner_share_pct}% of ${fmtINR(k.total_sold_value)}`} />
              <HeroCard icon="check-circle" label="Collection" value={fmtINR(k.landowner_collected_inr)} color={L.emeraldLight} sub={`${k.total_collected > 0 ? Math.round(k.landowner_collected_inr / k.landowner_revenue_inr * 100) : 0}% collected`} />
            </View>

            <SectionHead title="BY PLOT" icon="map-pin" />
            <View style={s.listCard}>
              {(data?.plots || [])
                .filter((p: any) => p.revenue_total > 0 || p.sale_value_inr > 0)
                .map((p: any, i: number) => {
                  const share = p.landowner_share_pct || 30;
                  return (
                    <View key={i} style={s.listRow}>
                      <View style={s.plotBadge}>
                        <Text style={s.plotBadgeNo}>{p.plot_no}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={s.listTitle}>{p.client_name || "—"}</Text>
                        <Text style={s.listSub}>{p.elevation_type} · {p.sales_status}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={s.revValue}>{fmtINR((p.sale_value_inr || 0) * share / 100)}</Text>
                        <Text style={s.revSub}>of {fmtINR(p.sale_value_inr)}</Text>
                      </View>
                    </View>
                  );
                })}
            </View>

            {/* Pending callout */}
            {k.landowner_pending_inr > 0 && (
              <View style={s.pendingAlert}>
                <Feather name="clock" size={16} color={L.amber} />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={s.pendingTitle}>Pending Collection</Text>
                  <Text style={s.pendingValue}>{fmtINR(k.landowner_pending_inr)}</Text>
                </View>
              </View>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            CUSTOMERS TAB
           ════════════════════════════════════════════════════════ */}
        {tab === "customers" && (
          <>
            <SectionHead title="CUSTOMER DIRECTORY" icon="users" />
            <Text style={s.plotCount}>{customers.length} customers</Text>

            {customers.length > 0 ? (
              <View style={s.listCard}>
                {customers.map((c: any, i: number) => {
                  const sc = STATUS_COLORS[c.status] || STATUS_COLORS.AVAILABLE;
                  return (
                    <View key={i} style={s.listRow}>
                      <View style={s.avatarCircle}>
                        <Text style={s.avatarTxt}>{(c.name || "?")[0]}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={s.listTitle}>{c.name}</Text>
                        <Text style={s.listSub}>Plot #{c.plot_no} · {c.phone || c.email || "—"}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={s.revValue}>{fmtINR(c.sale_value_inr)}</Text>
                        <View style={[s.miniStatus, { backgroundColor: sc.bg }]}>
                          <Text style={[s.miniStatusTxt, { color: sc.color }]}>{sc.label}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={s.emptyState}>
                <Feather name="users" size={32} color={L.muted} />
                <Text style={s.emptyTxt}>No customers yet</Text>
              </View>
            )}
          </>
        )}

        {/* Account */}
        <LogoutButton dark />
      </ScrollView>

      {/* ── Plot Detail Modal ───────────────────────────────────── */}
      <PlotModal plot={selectedPlot} onClose={() => setSelectedPlot(null)} />
    </SafeAreaView>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ════════════════════════════════════════════════════════════════════ */

function SectionHead({ title, icon }: { title: string; icon: any }) {
  return (
    <View style={s.sectionHeader}>
      <Feather name={icon} size={11} color={L.goldMuted} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function HeroCard({ icon, label, value, color, sub }: any) {
  return (
    <View style={s.heroCard}>
      <View style={[s.heroIcon, { backgroundColor: color + "15" }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={s.heroLabel}>{label}</Text>
      <Text style={[s.heroValue, { color }]}>{value}</Text>
      <Text style={s.heroSub}>{sub}</Text>
    </View>
  );
}

function KpiCard({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <View style={s.kpiCard}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={[s.kpiValue, { color }]}>{value ?? "—"}</Text>
    </View>
  );
}

function ShareStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={s.shareStatLabel}>{label}</Text>
      <Text style={[s.shareStatValue, { color }]}>{value}</Text>
    </View>
  );
}

function PlotModal({ plot, onClose }: { plot: any; onClose: () => void }) {
  if (!plot) return null;
  const cfg = STATUS_COLORS[plot.sales_status] || STATUS_COLORS.AVAILABLE;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalContent}>
          <Pressable style={s.modalClose} onPress={onClose}>
            <Feather name="x" size={20} color={L.muted} />
          </Pressable>

          <View style={s.modalHead}>
            <View style={[s.modalBadge, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
              <Text style={[s.modalBadgeNo, { color: cfg.color }]}>{plot.plot_no}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.modalTitle}>{plot.elevation_type} Villa</Text>
              <Text style={s.modalSub}>
                Plot #{plot.plot_no} · {plot.dimension_ft} · {plot.facing}
                {plot.is_corner ? " · Corner" : ""}
              </Text>
            </View>
            <View style={[s.statusTag, { backgroundColor: cfg.bg }]}>
              <Text style={[s.statusTagTxt, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>

          <ScrollView style={{ maxHeight: 400 }}>
            <DSection title="PLOT DETAILS" icon="map-pin">
              <DRow label="Elevation" value={plot.elevation_type} />
              <DRow label="Dimension" value={plot.dimension_ft} />
              <DRow label="Facing" value={plot.facing} />
              <DRow label="Corner" value={plot.is_corner ? "Yes" : "No"} />
              <DRow label="Asking Price" value={fmtINR(plot.asking_price_inr)} gold />
            </DSection>

            {plot.client_name && (
              <DSection title="CUSTOMER" icon="user">
                <DRow label="Name" value={plot.client_name} gold />
                <DRow label="Sale Value" value={fmtINR(plot.sale_value_inr)} />
                <DRow label="Booking" value={plot.booking_status || "—"} />
              </DSection>
            )}

            {plot.construction_status && (
              <DSection title="CONSTRUCTION" icon="tool">
                <DRow label="Status" value={plot.construction_status} />
                <View style={s.progressRow}>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { width: `${plot.construction_progress}%`, backgroundColor: L.purple }]} />
                  </View>
                  <Text style={s.progressPct}>{plot.construction_progress}%</Text>
                </View>
              </DSection>
            )}

            <DSection title="REVENUE" icon="dollar-sign">
              <DRow label="Total Milestone" value={fmtINR(plot.revenue_total)} />
              <DRow label="Collected" value={fmtINR(plot.revenue_collected)} gold />
              <DRow label="Pending" value={fmtINR(plot.revenue_pending)} />
              <DRow label="Your Share" value={`${plot.landowner_share_pct}%`} />
              <DRow label="Your Revenue" value={fmtINR((plot.sale_value_inr || 0) * (plot.landowner_share_pct || 30) / 100)} gold />
            </DSection>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DSection({ title, icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <View style={s.dSection}>
      <View style={s.dSectionHead}>
        <Feather name={icon} size={11} color={L.goldMuted} />
        <Text style={s.dSectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function DRow({ label, value, gold }: { label: string; value: any; gold?: boolean }) {
  return (
    <View style={s.dRow}>
      <Text style={s.dLabel}>{label}</Text>
      <Text style={[s.dValue, gold && { color: L.goldLight, fontWeight: "700" }]}>{value ?? "—"}</Text>
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════
   STYLES
   ════════════════════════════════════════════════════════════════════ */
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingTxt: { color: L.muted, fontSize: 16 },

  // Header
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  backBtn: { padding: 8, marginRight: 12 },
  headerLabel: { fontSize: 8, letterSpacing: 4, color: L.goldMuted, fontWeight: "700" },
  headerTitle: { fontSize: 22, fontWeight: "700", color: L.white },
  shareBadge: { alignItems: "center", backgroundColor: L.emerald + "15", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: L.emerald + "33" },
  shareTxt: { fontSize: 16, fontWeight: "800", color: L.emerald },
  shareLabel: { fontSize: 7, fontWeight: "700", letterSpacing: 1.5, color: L.emerald, marginTop: 1 },

  // Tabs
  tabs: { flexDirection: "row", marginHorizontal: 20, marginBottom: 8, backgroundColor: L.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: L.border },
  tab: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, paddingVertical: 10, borderRadius: 10 },
  tabActive: { backgroundColor: L.emerald + "18" },
  tabTxt: { fontSize: 9, fontWeight: "700", letterSpacing: 1.5, color: L.muted },
  tabTxtActive: { color: L.emerald },

  // Section
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 24, marginBottom: 12 },
  sectionTitle: { fontSize: 9, letterSpacing: 3, color: L.goldMuted, fontWeight: "700" },

  // Hero
  heroRow: { flexDirection: "row", gap: 12 },
  heroCard: { flex: 1, backgroundColor: L.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: L.border, alignItems: "center" },
  heroIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  heroLabel: { fontSize: 9, letterSpacing: 1, color: L.muted, fontWeight: "600" },
  heroValue: { fontSize: 20, fontWeight: "800", marginTop: 4 },
  heroSub: { fontSize: 10, color: L.mutedLight, marginTop: 4 },

  // Status strip
  statusStrip: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: L.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: L.border },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLbl: { fontSize: 9, color: L.muted, fontWeight: "600" },
  statusCnt: { fontSize: 11, fontWeight: "700" },

  // KPI
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  kpiCard: { flex: 1, backgroundColor: L.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: L.border, alignItems: "center" },
  kpiLabel: { fontSize: 9, letterSpacing: 1, color: L.muted, fontWeight: "600" },
  kpiValue: { fontSize: 18, fontWeight: "700", marginTop: 4 },

  // Share card
  shareCard: { backgroundColor: L.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: L.emerald + "25", marginTop: 8 },
  shareCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  shareCardTitle: { fontSize: 9, letterSpacing: 2, color: L.gold, fontWeight: "700" },
  shareCardRow: { flexDirection: "row" },
  shareStatLabel: { fontSize: 9, color: L.muted, fontWeight: "600", letterSpacing: 0.5 },
  shareStatValue: { fontSize: 16, fontWeight: "700", marginTop: 4 },

  // Bar
  barSection: { marginTop: 16 },
  barHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  barLabel: { fontSize: 10, color: L.muted, fontWeight: "600" },
  barPct: { fontSize: 12, fontWeight: "700" },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: L.cardAlt, flex: 1 },
  barFill: { height: 6, borderRadius: 3 },

  // List
  listCard: { backgroundColor: L.card, borderRadius: 14, borderWidth: 1, borderColor: L.border, overflow: "hidden" },
  listRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border },
  listTitle: { fontSize: 13, fontWeight: "600", color: L.white },
  listSub: { fontSize: 10, color: L.muted, marginTop: 1 },
  docIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: L.emerald + "15", alignItems: "center", justifyContent: "center", marginRight: 10 },

  // Search
  searchRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: L.surface, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: L.border },
  searchInput: { flex: 1, color: L.white, fontSize: 13, paddingVertical: 10 },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: L.red + "15", borderRadius: 10, paddingHorizontal: 12 },
  clearTxt: { fontSize: 11, color: L.red, fontWeight: "600" },

  // Heatmap
  plotCount: { fontSize: 11, color: L.muted, marginBottom: 8 },
  heatmapGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  plotCell: { width: PLOT_SZ, height: PLOT_SZ, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  plotNo: { fontSize: PLOT_SZ > 30 ? 10 : 8, fontWeight: "700" },
  cornerDot: { position: "absolute", top: 2, right: 2, width: 5, height: 5, borderRadius: 3 },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendLabel: { fontSize: 9, color: L.muted },

  // Revenue
  revValue: { fontSize: 12, fontWeight: "700", color: L.emerald },
  revSub: { fontSize: 9, color: L.muted, marginTop: 1 },
  plotBadge: { width: 32, height: 32, borderRadius: 10, backgroundColor: L.emerald + "15", alignItems: "center", justifyContent: "center" },
  plotBadgeNo: { fontSize: 12, fontWeight: "700", color: L.emerald },
  pendingAlert: { flexDirection: "row", alignItems: "center", backgroundColor: L.amber + "12", borderRadius: 14, padding: 16, marginTop: 16, borderWidth: 1, borderColor: L.amber + "25" },
  pendingTitle: { fontSize: 10, color: L.amber, fontWeight: "600" },
  pendingValue: { fontSize: 18, fontWeight: "800", color: L.amber, marginTop: 2 },

  // Customers
  avatarCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: L.emerald + "20", alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontSize: 14, fontWeight: "700", color: L.emerald },
  miniStatus: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, marginTop: 3 },
  miniStatusTxt: { fontSize: 7, fontWeight: "700", letterSpacing: 0.5 },

  // Empty
  emptyState: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyTxt: { color: L.muted, fontSize: 14 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: L.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40, maxHeight: "85%" },
  modalClose: { position: "absolute", top: 16, right: 16, zIndex: 10, padding: 4 },
  modalHead: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  modalBadge: { width: 52, height: 52, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  modalBadgeNo: { fontSize: 18, fontWeight: "800" },
  modalTitle: { fontSize: 18, fontWeight: "700", color: L.white },
  modalSub: { fontSize: 11, color: L.muted, marginTop: 3 },
  statusTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusTagTxt: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },

  // Detail section
  dSection: { marginBottom: 20 },
  dSectionHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  dSectionTitle: { fontSize: 9, letterSpacing: 2, color: L.goldMuted, fontWeight: "700" },
  dRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border },
  dLabel: { fontSize: 12, color: L.muted },
  dValue: { fontSize: 12, color: L.white, fontWeight: "500" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  progressPct: { fontSize: 11, fontWeight: "700", color: L.muted },
});
