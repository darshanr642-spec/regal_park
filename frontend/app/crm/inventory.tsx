import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, font, formatINR, radii, shadow, spacing } from "@/src/lib/theme";
import { Watermark } from "@/src/components/Watermark";
import { api } from "@/src/lib/api";

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: "#22C55E",
  RESERVED: "#F59E0B",
  BOOKED: "#6366F1",
  SOLD: "#EF4444",
  UNDER_CONSTRUCTION: "#8B5CF6",
};

const STATUS_LIST = ["ALL", "AVAILABLE", "RESERVED", "BOOKED", "SOLD", "UNDER_CONSTRUCTION"];
const ELEVATIONS = ["ALL", "Elora", "Selora", "Avira", "Riora"];
const FACINGS = ["ALL", "NORTH", "SOUTH", "EAST", "WEST", "NORTH_EAST", "NORTH_WEST", "SOUTH_EAST", "SOUTH_WEST"];

export default function CrmInventory() {
  const router = useRouter();
  const [plots, setPlots] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [elevFilter, setElevFilter] = React.useState("ALL");
  const [facingFilter, setFacingFilter] = React.useState("ALL");
  const [acting, setActing] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== "ALL") params.sales_status = statusFilter;
      if (elevFilter !== "ALL") params.elevation_type = elevFilter;
      if (facingFilter !== "ALL") params.facing = facingFilter;
      setPlots(await api.crmInventory(Object.keys(params).length ? params : undefined));
    } catch { }
    setLoading(false);
  }, [statusFilter, elevFilter, facingFilter]);

  React.useEffect(() => { load(); }, [load]);

  const handleReserve = async (plotNo: number) => {
    setActing(plotNo);
    try {
      await api.crmReservePlot(plotNo);
      load();
    } catch (e: any) { Alert.alert("Error", e.message); }
    setActing(null);
  };

  const handleRelease = async (plotNo: number) => {
    setActing(plotNo);
    try {
      await api.crmReleasePlot(plotNo);
      load();
    } catch (e: any) { Alert.alert("Error", e.message); }
    setActing(null);
  };

  // Summary stats
  const counts = React.useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of STATUS_LIST.slice(1)) c[s] = 0;
    for (const p of plots) c[p.sales_status || p.status] = (c[p.sales_status || p.status] || 0) + 1;
    return c;
  }, [plots]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Inventory</Text>
          <Text style={styles.subtitle}>{plots.length} plots</Text>
        </View>
      </View>

      {/* Summary strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryStrip}>
        {STATUS_LIST.slice(1).map((s) => (
          <View key={s} style={[styles.summaryChip, { borderColor: STATUS_COLORS[s] }]}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLORS[s] }]} />
            <Text style={styles.summaryCount}>{counts[s] || 0}</Text>
            <Text style={styles.summaryLabel}>{s.replace(/_/g, " ")}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Filters */}
      <View style={styles.filterSection}>
        <Text style={styles.filterHead}>STATUS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: spacing.xs }}>
          {STATUS_LIST.map((s) => (
            <Pressable key={s} style={[styles.filterChip, statusFilter === s && styles.filterActive]} onPress={() => setStatusFilter(s)}>
              {s !== "ALL" && <View style={[styles.dot, { backgroundColor: STATUS_COLORS[s], marginRight: 4 }]} />}
              <Text style={[styles.filterTxt, statusFilter === s && { color: colors.onBrandPrimary }]}>{s.replace(/_/g, " ")}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.filterHead}>ELEVATION</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: spacing.xs }}>
          {ELEVATIONS.map((e) => (
            <Pressable key={e} style={[styles.filterChip, elevFilter === e && styles.filterActive]} onPress={() => setElevFilter(e)}>
              <Text style={[styles.filterTxt, elevFilter === e && { color: colors.onBrandPrimary }]}>{e}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.filterHead}>FACING</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {FACINGS.map((f) => (
            <Pressable key={f} style={[styles.filterChip, facingFilter === f && styles.filterActive]} onPress={() => setFacingFilter(f)}>
              <Text style={[styles.filterTxt, facingFilter === f && { color: colors.onBrandPrimary }]}>{f.replace(/_/g, " ")}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Plot grid */}
      <ScrollView contentContainerStyle={styles.gridWrap}>
        {loading && <Text style={styles.muted}>Loading…</Text>}
        {!loading && plots.length === 0 && <Text style={styles.muted}>No plots match filters</Text>}
        <View style={styles.grid}>
          {plots.map((p) => {
            const ss = p.sales_status || p.status;
            const clr = STATUS_COLORS[ss] || colors.muted;
            return (
              <Pressable
                key={p.plot_no}
                style={[styles.plotCell, { borderColor: clr }]}
                onPress={() => {
                  if (ss === "AVAILABLE") handleReserve(p.plot_no);
                  else if (ss === "RESERVED") {
                    Alert.alert(
                      `Plot ${p.plot_no}`,
                      `Reserved by ${p.reserved_by || "—"}\n${formatINR(p.asking_price_inr)}`,
                      [
                        { text: "Release", style: "destructive", onPress: () => handleRelease(p.plot_no) },
                        { text: "Close" },
                      ],
                    );
                  }
                }}
              >
                <View style={[styles.plotBadge, { backgroundColor: clr + "22" }]}>
                  <Text style={[styles.plotNo, { color: clr }]}>{p.plot_no}</Text>
                </View>
                <Text style={styles.plotElev}>{p.elevation_type || p.villa_type}</Text>
                <Text style={styles.plotPrice}>{formatINR(p.asking_price_inr)}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <View style={[styles.statusDot, { backgroundColor: clr }]} />
                  <Text style={[styles.plotStatus, { color: clr }]}>{ss.replace(/_/g, " ")}</Text>
                </View>
                {p.is_corner && <Text style={styles.cornerBadge}>CORNER</Text>}
                {p.facing && <Text style={styles.plotFacing}>{p.facing.replace(/_/g, " ")}</Text>}
                {acting === p.plot_no && <Text style={styles.actingTxt}>…</Text>}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  backBtn: { padding: spacing.sm, marginRight: spacing.sm },
  title: { fontFamily: font.display, fontSize: 22, fontWeight: "700", color: colors.onSurface },
  subtitle: { color: colors.muted, fontSize: 12, letterSpacing: 1 },
  muted: { color: colors.muted, fontSize: 14, textAlign: "center", marginTop: spacing.xl },

  summaryStrip: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  summaryChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill, borderWidth: 1.5, backgroundColor: colors.surfaceSecondary },
  summaryCount: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  summaryLabel: { fontSize: 9, color: colors.muted, letterSpacing: 0.5 },
  dot: { width: 8, height: 8, borderRadius: 4 },

  filterSection: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  filterHead: { fontSize: 9, color: colors.muted, fontWeight: "700", letterSpacing: 1.5, marginBottom: 4 },
  filterChip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center" },
  filterActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterTxt: { fontSize: 10, color: colors.muted, fontWeight: "600" },

  gridWrap: { padding: spacing.md, paddingBottom: spacing.xxxl },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  plotCell: { width: 100, backgroundColor: colors.surfaceSecondary, borderRadius: radii.md, padding: spacing.sm, borderWidth: 1.5, ...shadow.card },
  plotBadge: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  plotNo: { fontSize: 13, fontWeight: "700" },
  plotElev: { fontSize: 10, fontWeight: "600", color: colors.onSurface },
  plotPrice: { fontSize: 10, color: colors.brand, fontWeight: "700", marginTop: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  plotStatus: { fontSize: 8, fontWeight: "600", letterSpacing: 0.5 },
  cornerBadge: { position: "absolute", top: 4, right: 4, fontSize: 7, fontWeight: "700", color: "#F59E0B", backgroundColor: "#F59E0B22", paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  plotFacing: { fontSize: 8, color: colors.muted, marginTop: 2 },
  actingTxt: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, textAlign: "center", textAlignVertical: "center", fontSize: 24, color: colors.brand },
});
