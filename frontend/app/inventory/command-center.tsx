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

/* ── Executive palette (charcoal + gold) ────────────────────────── */
const C = {
  bg: "#0B0D14",
  surface: "#13151F",
  card: "#1A1D2A",
  cardAlt: "#222638",
  gold: "#C5A059",
  goldLight: "#D4AF37",
  goldMuted: "#8A7A55",
  white: "#F0ECE3",
  muted: "#6B6B7B",
  green: "#34D399",
  greenDark: "#059669",
  amber: "#FBBF24",
  red: "#F87171",
  blue: "#60A5FA",
  purple: "#A78BFA",
  border: "#2A2D3A",
  borderLight: "#3A3D4A",
};

/* ── Status styling ─────────────────────────────────────────────── */
const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; icon: any }> = {
  AVAILABLE:          { color: C.green,     bg: "#34D39920", label: "Available",        icon: "check-circle" },
  RESERVED:           { color: C.amber,     bg: "#FBBF2420", label: "Reserved",         icon: "clock" },
  BOOKED:             { color: C.blue,      bg: "#60A5FA20", label: "Booked",           icon: "bookmark" },
  SOLD:               { color: C.goldLight, bg: "#D4AF3720", label: "Sold",             icon: "award" },
  UNDER_CONSTRUCTION: { color: C.purple,    bg: "#A78BFA20", label: "Under Const.",     icon: "tool" },
  COMPLETED:          { color: C.greenDark, bg: "#05966920", label: "Completed",        icon: "home" },
};

const formatINR = (n: number) => {
  if (n == null || isNaN(n)) return "₹ —";
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
};

const { width: SCREEN_W } = Dimensions.get("window");
const PLOT_COLS = SCREEN_W > 700 ? 15 : SCREEN_W > 500 ? 10 : 7;
const PLOT_SIZE = Math.floor((SCREEN_W - 48) / PLOT_COLS) - 4;

/* ════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════════ */
export default function InventoryCommandCenter() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlot, setSelectedPlot] = useState<any>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterElevation, setFilterElevation] = useState<string>("ALL");
  const [filterFacing, setFilterFacing] = useState<string>("ALL");
  const [filterCorner, setFilterCorner] = useState<string>("ALL");
  const [searchText, setSearchText] = useState("");

  React.useEffect(() => {
    (async () => {
      try {
        const d = await api.inventoryCommandCenter();
        setData(d);
      } catch {}
      setLoading(false);
    })();
  }, []);

  /* ── Filter logic ──────────────────────────────────────────────── */
  const filteredPlots = useMemo(() => {
    if (!data?.plots) return [];
    return data.plots.filter((p: any) => {
      if (filterStatus !== "ALL" && p.sales_status !== filterStatus) return false;
      if (filterElevation !== "ALL" && p.elevation_type !== filterElevation) return false;
      if (filterFacing !== "ALL" && p.facing !== filterFacing) return false;
      if (filterCorner === "CORNER" && !p.is_corner) return false;
      if (filterCorner === "NON_CORNER" && p.is_corner) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        const plotStr = `plot ${p.plot_no}`.toLowerCase();
        const clientStr = (p.client_name || "").toLowerCase();
        if (!plotStr.includes(q) && !clientStr.includes(q)) return false;
      }
      return true;
    });
  }, [data, filterStatus, filterElevation, filterFacing, filterCorner, searchText]);

  const activeFilters = useMemo(() => {
    let count = 0;
    if (filterStatus !== "ALL") count++;
    if (filterElevation !== "ALL") count++;
    if (filterFacing !== "ALL") count++;
    if (filterCorner !== "ALL") count++;
    if (searchText) count++;
    return count;
  }, [filterStatus, filterElevation, filterFacing, filterCorner, searchText]);

  const clearFilters = useCallback(() => {
    setFilterStatus("ALL");
    setFilterElevation("ALL");
    setFilterFacing("ALL");
    setFilterCorner("ALL");
    setSearchText("");
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <Watermark />
        <Text style={s.loadingTxt}>Loading inventory…</Text>
      </SafeAreaView>
    );
  }

  const kpis = data?.kpis || {};
  const filters = data?.filters || {};

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <Watermark />

      {/* ── Header ────────────────────────────────────────────── */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={C.white} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerLabel}>REGAL PARK VILLAS</Text>
          <Text style={s.headerTitle}>Inventory Command Centre</Text>
        </View>
        <View style={s.liveBadge}>
          <View style={s.liveDot} />
          <Text style={s.liveTxt}>LIVE</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* ── KPI Cards ─────────────────────────────────────────── */}
        <View style={s.kpiSection}>
          <View style={s.kpiRow}>
            <KpiCard label="Total Inventory" value={kpis.total_plots} color={C.white} icon="grid" />
            <KpiCard label="Available" value={kpis.available_count} color={C.green} icon="check-circle" />
            <KpiCard label="Sold / Booked" value={kpis.sold_count} color={C.goldLight} icon="award" />
          </View>
          <View style={s.kpiRow}>
            <KpiCard label="Available Value" value={formatINR(kpis.available_inventory_value)} color={C.green} wide />
            <KpiCard label="Sold Value" value={formatINR(kpis.sold_inventory_value)} color={C.goldLight} wide />
          </View>
          <View style={s.kpiRow}>
            <KpiCard label="Conversion Rate" value={`${kpis.conversion_rate}%`} color={C.amber} icon="trending-up" />
            <KpiCard label="Revenue Realized" value={formatINR(kpis.revenue_realized)} color={C.green} icon="dollar-sign" />
          </View>
        </View>

        {/* ── Status Legend ──────────────────────────────────────── */}
        <View style={s.legendRow}>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const count = filters.status_counts?.[key] || 0;
            return (
              <Pressable
                key={key}
                style={[s.legendItem, filterStatus === key && { borderColor: cfg.color, borderWidth: 1.5 }]}
                onPress={() => setFilterStatus(filterStatus === key ? "ALL" : key)}
              >
                <View style={[s.legendDot, { backgroundColor: cfg.color }]} />
                <Text style={s.legendLabel}>{cfg.label}</Text>
                <Text style={[s.legendCount, { color: cfg.color }]}>{count}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Filters ───────────────────────────────────────────── */}
        <View style={s.filterSection}>
          <View style={s.filterRow}>
            <View style={s.searchBox}>
              <Feather name="search" size={14} color={C.muted} />
              <TextInput
                style={s.searchInput}
                placeholder="Search plot or client..."
                placeholderTextColor={C.muted}
                value={searchText}
                onChangeText={setSearchText}
              />
            </View>
            {activeFilters > 0 && (
              <Pressable style={s.clearBtn} onPress={clearFilters}>
                <Feather name="x" size={12} color={C.red} />
                <Text style={s.clearTxt}>Clear ({activeFilters})</Text>
              </Pressable>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterChips}>
            <FilterChip label="Elevation" value={filterElevation} options={["ALL", ...(filters.elevations || [])]} onChange={setFilterElevation} />
            <FilterChip label="Facing" value={filterFacing} options={["ALL", ...(filters.facings || [])]} onChange={setFilterFacing} />
            <FilterChip label="Corner" value={filterCorner} options={["ALL", "CORNER", "NON_CORNER"]} onChange={setFilterCorner} />
          </ScrollView>
        </View>

        {/* ── Plot Heatmap Grid ─────────────────────────────────── */}
        <View style={s.heatmapSection}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>PLOT HEATMAP</Text>
            <Text style={s.sectionCount}>{filteredPlots.length} plots</Text>
          </View>

          <View style={s.heatmapGrid}>
            {filteredPlots.map((plot: any) => {
              const cfg = STATUS_CONFIG[plot.sales_status] || STATUS_CONFIG.AVAILABLE;
              return (
                <Pressable
                  key={plot.plot_no}
                  style={[s.plotCell, { backgroundColor: cfg.bg, borderColor: cfg.color + "44" }]}
                  onPress={() => setSelectedPlot(plot)}
                >
                  <Text style={[s.plotNo, { color: cfg.color }]}>{plot.plot_no}</Text>
                  {plot.is_corner && <View style={[s.cornerDot, { backgroundColor: C.goldLight }]} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* ── Plot Detail Modal ───────────────────────────────────── */}
      <PlotDetailModal plot={selectedPlot} onClose={() => setSelectedPlot(null)} />
    </SafeAreaView>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ════════════════════════════════════════════════════════════════════ */

function KpiCard({ label, value, color, icon, wide }: {
  label: string; value: any; color: string; icon?: any; wide?: boolean;
}) {
  return (
    <View style={[s.kpiCard, wide && { flex: 1 }]}>
      {icon && (
        <View style={[s.kpiIconWrap, { backgroundColor: color + "15" }]}>
          <Feather name={icon} size={14} color={color} />
        </View>
      )}
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={[s.kpiValue, { color }]}>{value ?? "—"}</Text>
    </View>
  );
}

function FilterChip({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isActive = value !== "ALL";

  return (
    <View>
      <Pressable
        style={[s.chip, isActive && { backgroundColor: C.gold + "22", borderColor: C.gold }]}
        onPress={() => setOpen(!open)}
      >
        <Text style={[s.chipLabel, isActive && { color: C.gold }]}>{label}</Text>
        <Text style={[s.chipValue, isActive && { color: C.goldLight }]}>
          {value === "ALL" ? "All" : value}
        </Text>
        <Feather name="chevron-down" size={12} color={isActive ? C.gold : C.muted} />
      </Pressable>
      {open && (
        <View style={s.chipDropdown}>
          {options.map((opt) => (
            <Pressable
              key={opt}
              style={[s.chipOption, value === opt && { backgroundColor: C.gold + "22" }]}
              onPress={() => { onChange(opt); setOpen(false); }}
            >
              <Text style={[s.chipOptionTxt, value === opt && { color: C.goldLight }]}>
                {opt === "ALL" ? "All" : opt}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function PlotDetailModal({ plot, onClose }: { plot: any; onClose: () => void }) {
  if (!plot) return null;
  const cfg = STATUS_CONFIG[plot.sales_status] || STATUS_CONFIG.AVAILABLE;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalContent}>
          {/* Close */}
          <Pressable style={s.modalClose} onPress={onClose}>
            <Feather name="x" size={20} color={C.muted} />
          </Pressable>

          {/* Header */}
          <View style={s.modalHeader}>
            <View style={[s.modalPlotBadge, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
              <Text style={[s.modalPlotNo, { color: cfg.color }]}>{plot.plot_no}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={s.modalTitle}>{plot.elevation_type} Villa</Text>
              <Text style={s.modalSubtitle}>
                Plot #{plot.plot_no} · {plot.dimension_ft} · {plot.facing}
                {plot.is_corner ? " · Corner" : ""}
              </Text>
            </View>
            <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
              <Feather name={cfg.icon} size={12} color={cfg.color} />
              <Text style={[s.statusTxt, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>

          <ScrollView style={{ maxHeight: 420 }}>
            {/* ── Plot Details ──────────────────────────────────── */}
            <DetailSection title="PLOT DETAILS" icon="map-pin">
              <DetailRow label="Elevation" value={plot.elevation_type} />
              <DetailRow label="Dimension" value={plot.dimension_ft} />
              <DetailRow label="Facing" value={plot.facing} />
              <DetailRow label="Corner Plot" value={plot.is_corner ? "Yes" : "No"} />
              <DetailRow label="Asking Price" value={formatINR(plot.asking_price_inr)} highlight />
              <DetailRow label="Premium" value={`${plot.premium_pct || 0}%`} />
            </DetailSection>

            {/* ── Customer / Booking ───────────────────────────── */}
            {plot.client_name && (
              <DetailSection title="CUSTOMER & BOOKING" icon="user">
                <DetailRow label="Customer" value={plot.client_name} highlight />
                <DetailRow label="Booking Status" value={plot.booking_status || "—"} />
                <DetailRow label="Sale Value" value={formatINR(plot.sale_value_inr)} />
                <DetailRow label="Discount" value={`${plot.discount_pct || 0}%`} />
                <DetailRow label="Booking Amount" value={formatINR(plot.booking_amount_inr)} />
              </DetailSection>
            )}

            {/* ── Construction ────────────────────────────────── */}
            {plot.project_id && (
              <DetailSection title="CONSTRUCTION" icon="tool">
                <DetailRow label="Project" value={plot.project_name || "—"} />
                <DetailRow label="Status" value={plot.construction_status || "—"} />
                <View style={s.progressBarWrap}>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${plot.construction_progress || 0}%` }]} />
                  </View>
                  <Text style={s.progressTxt}>{plot.construction_progress || 0}%</Text>
                </View>
              </DetailSection>
            )}

            {/* ── Revenue ──────────────────────────────────────── */}
            {(plot.revenue_total > 0 || plot.sale_value_inr > 0) && (
              <DetailSection title="REVENUE" icon="dollar-sign">
                <DetailRow label="Total Milestone" value={formatINR(plot.revenue_total)} />
                <DetailRow label="Collected" value={formatINR(plot.revenue_collected)} highlight />
                <DetailRow
                  label="Outstanding"
                  value={formatINR((plot.revenue_total || 0) - (plot.revenue_collected || 0))}
                />
                {plot.revenue_total > 0 && (
                  <View style={s.progressBarWrap}>
                    <View style={s.progressTrack}>
                      <View
                        style={[
                          s.progressFillGreen,
                          { width: `${Math.min(100, ((plot.revenue_collected || 0) / plot.revenue_total) * 100)}%` },
                        ]}
                      />
                    </View>
                    <Text style={s.progressTxt}>
                      {Math.round(((plot.revenue_collected || 0) / plot.revenue_total) * 100)}%
                    </Text>
                  </View>
                )}
              </DetailSection>
            )}

            {/* ── Share Split ──────────────────────────────────── */}
            {(plot.landowner_share_pct > 0 || plot.developer_share_pct > 0) && (
              <DetailSection title="SHARE SPLIT" icon="pie-chart">
                <DetailRow label="Landowner" value={`${plot.landowner_share_pct}%`} />
                <DetailRow label="Developer" value={`${plot.developer_share_pct}%`} />
              </DetailSection>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DetailSection({ title, icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <View style={s.detailSection}>
      <View style={s.detailSectionHeader}>
        <Feather name={icon} size={12} color={C.goldMuted} />
        <Text style={s.detailSectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={[s.detailValue, highlight && { color: C.goldLight, fontWeight: "700" }]}>
        {value ?? "—"}
      </Text>
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════
   STYLES
   ════════════════════════════════════════════════════════════════════ */
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loadingTxt: { color: C.muted, fontSize: 16, textAlign: "center", marginTop: 100 },

  // Header
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  backBtn: { padding: 8, marginRight: 12 },
  headerLabel: { fontSize: 8, letterSpacing: 4, color: C.goldMuted, fontWeight: "700" },
  headerTitle: { fontSize: 22, fontWeight: "700", color: C.white },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: C.green + "15", borderWidth: 1, borderColor: C.green + "33" },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  liveTxt: { fontSize: 9, fontWeight: "700", color: C.green, letterSpacing: 1 },

  // KPIs
  kpiSection: { paddingHorizontal: 20, marginTop: 4 },
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  kpiCard: { flex: 1, backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, alignItems: "center" },
  kpiIconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  kpiLabel: { fontSize: 8, letterSpacing: 1, color: C.muted, fontWeight: "600", textTransform: "uppercase" },
  kpiValue: { fontSize: 18, fontWeight: "700", marginTop: 4 },

  // Legend
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 20, marginTop: 8, marginBottom: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 9, color: C.muted, fontWeight: "600" },
  legendCount: { fontSize: 11, fontWeight: "700" },

  // Filters
  filterSection: { paddingHorizontal: 20, marginTop: 4 },
  filterRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, color: C.white, fontSize: 13, paddingVertical: 10 },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.red + "15", borderRadius: 10, paddingHorizontal: 12 },
  clearTxt: { fontSize: 11, color: C.red, fontWeight: "600" },
  filterChips: { gap: 8, paddingBottom: 8 },

  // Chips
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  chipLabel: { fontSize: 9, color: C.muted, fontWeight: "600", letterSpacing: 0.5 },
  chipValue: { fontSize: 11, color: C.white, fontWeight: "600" },
  chipDropdown: { position: "absolute", top: 42, left: 0, right: 0, minWidth: 140, backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.borderLight, zIndex: 100, padding: 4 },
  chipOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  chipOptionTxt: { fontSize: 11, color: C.white },

  // Heatmap
  heatmapSection: { paddingHorizontal: 20, marginTop: 12 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 9, letterSpacing: 3, color: C.goldMuted, fontWeight: "700" },
  sectionCount: { fontSize: 11, color: C.muted },
  heatmapGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  plotCell: {
    width: PLOT_SIZE,
    height: PLOT_SIZE,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  plotNo: { fontSize: PLOT_SIZE > 30 ? 10 : 8, fontWeight: "700" },
  cornerDot: { position: "absolute", top: 2, right: 2, width: 5, height: 5, borderRadius: 3 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40, maxHeight: "85%" },
  modalClose: { position: "absolute", top: 16, right: 16, zIndex: 10, padding: 4 },
  modalHeader: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  modalPlotBadge: { width: 52, height: 52, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  modalPlotNo: { fontSize: 18, fontWeight: "800" },
  modalTitle: { fontSize: 18, fontWeight: "700", color: C.white },
  modalSubtitle: { fontSize: 11, color: C.muted, marginTop: 3 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusTxt: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },

  // Detail sections
  detailSection: { marginBottom: 20 },
  detailSectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  detailSectionTitle: { fontSize: 9, letterSpacing: 2, color: C.goldMuted, fontWeight: "700" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  detailLabel: { fontSize: 12, color: C.muted },
  detailValue: { fontSize: 12, color: C.white, fontWeight: "500" },

  // Progress bars
  progressBarWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: C.cardAlt },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: C.purple },
  progressFillGreen: { height: 6, borderRadius: 3, backgroundColor: C.green },
  progressTxt: { fontSize: 11, fontWeight: "700", color: C.muted, width: 36, textAlign: "right" },
});
