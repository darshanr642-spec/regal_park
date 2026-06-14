import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, font, formatINR, radii, shadow, spacing } from "@/src/lib/theme";
import { Watermark } from "@/src/components/Watermark";
import { api } from "@/src/lib/api";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#F59E0B",
  APPROVED: "#22C55E",
  REJECTED: "#EF4444",
};

export default function BookingApprovals() {
  const router = useRouter();
  const [approvals, setApprovals] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setApprovals(await api.bookingApprovals(filter || undefined)); } catch { }
    setLoading(false);
  }, [filter]);

  React.useEffect(() => { load(); }, [load]);

  const counts = React.useMemo(() => {
    const c = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const a of approvals) {
      const s = a.overall_status as keyof typeof c;
      if (c[s] !== undefined) c[s]++;
    }
    return c;
  }, [approvals]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Booking Approvals</Text>
          <Text style={styles.subtitle}>{approvals.length} total</Text>
        </View>
      </View>

      {/* Summary */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryStrip}>
        {Object.entries(counts).map(([s, c]) => (
          <View key={s} style={[styles.summaryChip, { borderColor: STATUS_COLORS[s] }]}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLORS[s] }]} />
            <Text style={styles.summaryCount}>{c}</Text>
            <Text style={styles.summaryLabel}>{s}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.xs }}>
        {[null, "PENDING", "APPROVED", "REJECTED"].map((s) => (
          <Pressable
            key={s || "all"}
            style={[styles.chip, filter === s && styles.chipActive]}
            onPress={() => setFilter(s)}
          >
            <Text style={[styles.chipTxt, filter === s && { color: colors.onBrandPrimary }]}>
              {s || "All"}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {loading && <Text style={styles.muted}>Loading…</Text>}
        {!loading && approvals.length === 0 && <Text style={styles.muted}>No approvals found</Text>}
        {approvals.map((a) => {
          const clr = STATUS_COLORS[a.overall_status] || colors.muted;
          return (
            <Pressable
              key={a.id}
              style={styles.card}
              onPress={() => router.push(`/approvals/booking/${a.id}` as any)}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardClient}>{a.client_name}</Text>
                  <Text style={styles.cardMeta}>Plot #{a.plot_no} · {a.elevation_type}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: clr + "22" }]}>
                  <Text style={[styles.statusTxt, { color: clr }]}>{a.overall_status}</Text>
                </View>
              </View>

              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Sale Value</Text>
                <Text style={styles.priceValue}>{formatINR(a.sale_value_inr)}</Text>
              </View>

              {/* Approval chain */}
              <View style={styles.chainRow}>
                {a.levels?.map((lvl: any) => {
                  const lc = STATUS_COLORS[lvl.status] || colors.muted;
                  const isCurrent = lvl.level === a.current_level && a.overall_status === "PENDING";
                  return (
                    <View key={lvl.level} style={[styles.levelChip, { borderColor: lc }, isCurrent && styles.levelCurrent]}>
                      <Text style={[styles.levelTxt, { color: lc }]}>
                        L{lvl.level}: {lvl.required_role.replace(/_/g, " ")}
                      </Text>
                      {lvl.status !== "PENDING" && (
                        <Feather name={lvl.status === "APPROVED" ? "check" : "x"} size={10} color={lc} />
                      )}
                    </View>
                  );
                })}
              </View>

              <Text style={styles.cardDate}>{a.created_at?.slice(0, 10)}</Text>

              {a.overall_status === "PENDING" && (
                <View style={styles.actionHint}>
                  <Feather name="chevron-right" size={14} color={colors.brand} />
                  <Text style={styles.actionHintTxt}>Tap to review</Text>
                </View>
              )}
            </Pressable>
          );
        })}
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

  chips: { maxHeight: 44, marginBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontSize: 11, letterSpacing: 1, color: colors.muted, fontWeight: "600" },

  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadow.card },
  cardTop: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  cardClient: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  cardMeta: { fontSize: 12, color: colors.muted },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.pill },
  statusTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  priceLabel: { fontSize: 12, color: colors.muted },
  priceValue: { fontSize: 15, fontWeight: "700", color: colors.brand },

  chainRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  levelChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, borderWidth: 1 },
  levelCurrent: { backgroundColor: "#F59E0B11", borderWidth: 2 },
  levelTxt: { fontSize: 9, fontWeight: "600" },
  cardDate: { fontSize: 10, color: colors.muted, marginTop: spacing.sm },
  actionHint: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  actionHintTxt: { fontSize: 11, fontWeight: "600", color: colors.brand },
});
