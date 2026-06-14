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
  COUNTER_OFFERED: "#8B5CF6",
};

const TIER_LABELS: Record<string, string> = {
  SALES_MANAGER: "SM (≤3%)",
  PROJECT_DIRECTOR: "PD (3-5%)",
  COO: "COO (5-8%)",
  ADMIN: "Admin (>8%)",
};

export default function DiscountApprovals() {
  const router = useRouter();
  const [requests, setRequests] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setRequests(await api.discountRequests(filter || undefined)); } catch { }
    setLoading(false);
  }, [filter]);

  React.useEffect(() => { load(); }, [load]);

  const totalImpact = React.useMemo(
    () => requests.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.margin_impact_inr, 0),
    [requests],
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Discount Approvals</Text>
          <Text style={styles.subtitle}>{requests.length} requests</Text>
        </View>
      </View>

      {/* Margin impact banner */}
      {totalImpact > 0 && (
        <View style={styles.impactBanner}>
          <Feather name="alert-triangle" size={14} color="#F59E0B" />
          <Text style={styles.impactTxt}>
            Pending margin impact: <Text style={{ fontWeight: "700" }}>{formatINR(totalImpact)}</Text>
          </Text>
        </View>
      )}

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.xs }}>
        {[null, "PENDING", "APPROVED", "REJECTED", "COUNTER_OFFERED"].map((s) => (
          <Pressable
            key={s || "all"}
            style={[styles.chip, filter === s && styles.chipActive]}
            onPress={() => setFilter(s)}
          >
            <Text style={[styles.chipTxt, filter === s && { color: colors.onBrandPrimary }]}>
              {s?.replace("_", " ") || "All"}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {loading && <Text style={styles.muted}>Loading…</Text>}
        {!loading && requests.length === 0 && <Text style={styles.muted}>No discount requests</Text>}
        {requests.map((r) => {
          const clr = STATUS_COLORS[r.status] || colors.muted;
          return (
            <Pressable
              key={r.id}
              style={styles.card}
              onPress={() => router.push(`/approvals/discount/${r.id}` as any)}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardClient}>{r.client_name}</Text>
                  <Text style={styles.cardMeta}>Plot #{r.plot_no} · {r.elevation_type}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: clr + "22" }]}>
                  <Text style={[styles.statusTxt, { color: clr }]}>{r.status.replace("_", " ")}</Text>
                </View>
              </View>

              {/* Discount details */}
              <View style={styles.discountRow}>
                <View style={styles.discountCol}>
                  <Text style={styles.discountLabel}>Discount</Text>
                  <Text style={[styles.discountPct, { color: "#EF4444" }]}>{r.discount_pct}%</Text>
                </View>
                <View style={styles.discountCol}>
                  <Text style={styles.discountLabel}>Impact</Text>
                  <Text style={[styles.discountAmt, { color: "#EF4444" }]}>-{formatINR(r.margin_impact_inr)}</Text>
                </View>
                <View style={styles.discountCol}>
                  <Text style={styles.discountLabel}>Net Value</Text>
                  <Text style={styles.discountAmt}>{formatINR(r.net_value_inr)}</Text>
                </View>
              </View>

              {/* Tier badge */}
              <View style={styles.tierRow}>
                <View style={styles.tierBadge}>
                  <Feather name="shield" size={10} color={colors.brand} />
                  <Text style={styles.tierTxt}>{TIER_LABELS[r.required_approver_role] || r.required_approver_role}</Text>
                </View>
                <Text style={styles.reqBy}>by {r.requested_by} · {r.created_at?.slice(0, 10)}</Text>
              </View>

              {/* Counter offer */}
              {r.status === "COUNTER_OFFERED" && r.counter_pct != null && (
                <View style={styles.counterRow}>
                  <Feather name="repeat" size={12} color="#8B5CF6" />
                  <Text style={styles.counterTxt}>
                    Counter: {r.counter_pct}% ({formatINR(r.counter_amount_inr)})
                  </Text>
                </View>
              )}

              {r.status === "PENDING" && (
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

  impactBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md, backgroundColor: "#F59E0B11", borderWidth: 1, borderColor: "#F59E0B33" },
  impactTxt: { fontSize: 12, color: colors.onSurface },

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

  discountRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  discountCol: { alignItems: "center" },
  discountLabel: { fontSize: 9, color: colors.muted, letterSpacing: 0.5, marginBottom: 2 },
  discountPct: { fontSize: 18, fontWeight: "700" },
  discountAmt: { fontSize: 13, fontWeight: "600", color: colors.onSurface },

  tierRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tierBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: colors.brand + "11", borderWidth: 1, borderColor: colors.brand + "33" },
  tierTxt: { fontSize: 9, fontWeight: "700", color: colors.brand },
  reqBy: { fontSize: 10, color: colors.muted },

  counterRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: "#8B5CF611", borderRadius: radii.sm },
  counterTxt: { fontSize: 11, fontWeight: "600", color: "#8B5CF6" },

  actionHint: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  actionHintTxt: { fontSize: 11, fontWeight: "600", color: colors.brand },
});
