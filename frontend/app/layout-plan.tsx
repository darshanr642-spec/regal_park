import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/lib/api";
import { Watermark } from "@/src/components/Watermark";
import { colors, font, radii, shadow, spacing } from "@/src/lib/theme";

const PLAN_FULL = require("@/assets/images/layout-plan.jpg");
const PLAN_PREVIEW = require("@/assets/images/layout-plan-preview.jpg");
const PLAN_ASPECT = 2621 / 3705; // width / height

const ELEVATION_META: Record<string, { dim: string; color: string }> = {
  Elora: { dim: "40 × 50", color: "#B8860B" },
  Selora: { dim: "35 × 55", color: "#2F6B4F" },
  Avira: { dim: "35 × 50", color: "#34548A" },
  Riora: { dim: "30 × 50", color: "#8A4B34" },
};
const TYPES = Object.keys(ELEVATION_META);

export default function LayoutPlan() {
  const router = useRouter();
  const [plots, setPlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [zoom, setZoom] = useState(1.6);

  useEffect(() => {
    api.plots().then(setPlots).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let rows = plots;
    if (typeFilter) rows = rows.filter((p) => p.villa_type === typeFilter);
    const q = search.trim();
    if (q) rows = rows.filter((p) => String(p.plot_no).startsWith(q));
    return rows;
  }, [plots, typeFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    plots.forEach((p) => { c[p.villa_type] = (c[p.villa_type] || 0) + 1; });
    return c;
  }, [plots]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Pressable testID="back-button" onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Layout Plan</Text>
          <Text style={styles.sub}>22-Acre Master Plan · 251 Villas · Hulimangala</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {/* Master plan preview */}
        <Pressable testID="layout-plan-preview" style={styles.planCard} onPress={() => setViewerOpen(true)}>
          <Image source={PLAN_PREVIEW} style={styles.planImg} contentFit="cover" />
          <View style={styles.planOverlay}>
            <Feather name="maximize-2" size={14} color={colors.brandSecondary} />
            <Text style={styles.planOverlayTxt}>TAP TO VIEW FULL PLAN</Text>
          </View>
        </Pressable>

        {/* Elevation legend */}
        <Text style={styles.sectionHead}>ELEVATION MODELS</Text>
        <View style={styles.legendGrid}>
          {TYPES.map((t) => (
            <Pressable
              key={t}
              testID={`elevation-${t.toLowerCase()}`}
              style={[styles.legendCard, typeFilter === t && styles.legendActive]}
              onPress={() => setTypeFilter(typeFilter === t ? null : t)}
            >
              <View style={[styles.legendDot, { backgroundColor: ELEVATION_META[t].color }]} />
              <Text style={styles.legendName}>{t}</Text>
              <Text style={styles.legendDim}>{ELEVATION_META[t].dim} FT</Text>
              <Text style={styles.legendCount}>{counts[t] || 0} plots</Text>
            </Pressable>
          ))}
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Feather name="search" size={16} color={colors.muted} />
          <TextInput
            testID="plot-search-input"
            style={styles.searchInput}
            placeholder="Search plot number…"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            value={search}
            onChangeText={setSearch}
          />
          {search !== "" && (
            <Pressable onPress={() => setSearch("")} testID="plot-search-clear">
              <Feather name="x" size={16} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {/* Plot grid */}
        <Text style={styles.sectionHead}>
          PLOTS {typeFilter ? `· ${typeFilter.toUpperCase()}` : ""} ({filtered.length})
        </Text>
        <View style={styles.plotGrid}>
          {filtered.map((p) => {
            const meta = ELEVATION_META[p.villa_type] || ELEVATION_META.Avira;
            const underConstruction = p.status === "UNDER_CONSTRUCTION";
            return (
              <Pressable
                key={p.plot_no}
                testID={`plot-chip-${p.plot_no}`}
                style={[
                  styles.plotChip,
                  { borderColor: meta.color },
                  p.status === "SOLD" && styles.plotSold,
                  underConstruction && styles.plotActive,
                ]}
                onPress={() => router.push(`/plot/${p.plot_no}` as any)}
              >
                <Text style={[styles.plotNo, underConstruction && { color: colors.brandSecondary }]}>{p.plot_no}</Text>
                {underConstruction && <Feather name="tool" size={9} color={colors.brandSecondary} style={{ marginTop: 1 }} />}
              </Pressable>
            );
          })}
        </View>
        {filtered.length === 0 && <Text style={styles.emptyTxt}>No plots match.</Text>}

        <View style={styles.statusLegend}>
          <View style={styles.statusItem}><View style={[styles.statusSwatch, { backgroundColor: colors.surfaceSecondary }]} /><Text style={styles.statusTxt}>Available</Text></View>
          <View style={styles.statusItem}><View style={[styles.statusSwatch, { backgroundColor: "#E4DED2" }]} /><Text style={styles.statusTxt}>Sold</Text></View>
          <View style={styles.statusItem}><View style={[styles.statusSwatch, { backgroundColor: colors.surfaceInverse }]} /><Text style={styles.statusTxt}>Under construction</Text></View>
        </View>
      </ScrollView>

      {/* Fullscreen zoomable plan viewer */}
      <Modal visible={viewerOpen} animationType="fade" onRequestClose={() => setViewerOpen(false)}>
        <View style={styles.viewerRoot} testID="plan-viewer">
          <Pressable style={styles.viewerClose} onPress={() => setViewerOpen(false)} testID="plan-viewer-close">
            <Feather name="x" size={22} color="#fff" />
          </Pressable>
          <View style={styles.zoomControls}>
            <Pressable testID="plan-zoom-out" style={styles.zoomBtn} onPress={() => setZoom(Math.max(0.8, zoom - 0.4))}>
              <Feather name="zoom-out" size={18} color="#fff" />
            </Pressable>
            <Pressable testID="plan-zoom-in" style={styles.zoomBtn} onPress={() => setZoom(Math.min(5, zoom + 0.4))}>
              <Feather name="zoom-in" size={18} color="#fff" />
            </Pressable>
          </View>
          <ScrollView maximumZoomScale={5} minimumZoomScale={0.5} contentContainerStyle={{ flexGrow: 1 }}>
            <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
              <Image
                source={PLAN_FULL}
                style={{ width: 390 * zoom, height: (390 * zoom) / PLAN_ASPECT }}
                contentFit="contain"
              />
            </ScrollView>
          </ScrollView>
        </View>
      </Modal>
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

  planCard: { borderRadius: radii.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border, ...shadow.card },
  planImg: { width: "100%", height: 320 },
  planOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, backgroundColor: "rgba(26,26,26,0.78)" },
  planOverlayTxt: { color: colors.brandSecondary, fontSize: 10, letterSpacing: 2, fontWeight: "700" },

  sectionHead: { color: colors.muted, fontSize: 10, letterSpacing: 2, marginTop: spacing.xl, marginBottom: spacing.sm },
  legendGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  legendCard: { flexBasis: "47%", flexGrow: 1, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md },
  legendActive: { borderColor: colors.brandPrimary, backgroundColor: "#FFF8E1" },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 6 },
  legendName: { fontFamily: font.display, fontSize: 17, color: colors.onSurface },
  legendDim: { color: colors.brand, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginTop: 2 },
  legendCount: { color: colors.muted, fontSize: 10, marginTop: 2 },

  searchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, paddingVertical: spacing.md, fontSize: 14, color: colors.onSurface },

  plotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  plotChip: { width: 44, height: 40, borderRadius: radii.sm, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  plotSold: { backgroundColor: "#E4DED2", opacity: 0.85 },
  plotActive: { backgroundColor: colors.surfaceInverse },
  plotNo: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  emptyTxt: { color: colors.muted, fontSize: 13, textAlign: "center", paddingVertical: spacing.xl, fontStyle: "italic" },

  statusLegend: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.lg, flexWrap: "wrap" },
  statusItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusSwatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1, borderColor: colors.border },
  statusTxt: { color: colors.muted, fontSize: 11 },

  viewerRoot: { flex: 1, backgroundColor: "#0D0D1F" },
  viewerClose: { position: "absolute", top: 48, right: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
  zoomControls: { position: "absolute", bottom: 40, alignSelf: "center", zIndex: 10, flexDirection: "row", gap: spacing.md },
  zoomBtn: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)" },
});
