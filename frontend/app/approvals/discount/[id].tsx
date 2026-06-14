import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors, font, formatINR, radii, shadow, spacing } from "@/src/lib/theme";
import { Watermark } from "@/src/components/Watermark";
import { api } from "@/src/lib/api";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#F59E0B",
  APPROVED: "#22C55E",
  REJECTED: "#EF4444",
  COUNTER_OFFERED: "#8B5CF6",
};

export default function DiscountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [req, setReq] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [note, setNote] = React.useState("");
  const [counterPct, setCounterPct] = React.useState("");
  const [deciding, setDeciding] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try { setReq(await api.discountRequest(id)); } catch { }
    setLoading(false);
  }, [id]);

  React.useEffect(() => { load(); }, [load]);

  const handleDecide = async (decision: string) => {
    if (!id) return;
    if (decision === "REJECTED" && !note.trim()) {
      Alert.alert("Required", "Provide a reason for rejection");
      return;
    }
    if (decision === "COUNTER_OFFER") {
      const cp = parseFloat(counterPct);
      if (!cp || cp <= 0 || cp >= (req?.discount_pct || 100)) {
        Alert.alert("Invalid", "Counter % must be > 0 and less than original discount");
        return;
      }
    }
    setDeciding(true);
    try {
      await api.decideDiscountRequest(id, {
        decision,
        note: note.trim() || undefined,
        counter_pct: decision === "COUNTER_OFFER" ? parseFloat(counterPct) : undefined,
      });
      Alert.alert("Done", `Discount ${decision.toLowerCase().replace("_", " ")}`);
      load();
    } catch (e: any) { Alert.alert("Error", e.message); }
    setDeciding(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <Watermark />
        <Text style={styles.muted}>Loading…</Text>
      </SafeAreaView>
    );
  }

  if (!req) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <Watermark />
        <Text style={styles.muted}>Not found</Text>
      </SafeAreaView>
    );
  }

  const clr = STATUS_COLORS[req.status] || colors.muted;
  const isPending = req.status === "PENDING";
  const counterAmt = counterPct ? Math.round(req.sale_value_inr * parseFloat(counterPct) / 100) : 0;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Discount Review</Text>
          <Text style={styles.subtitle}>Plot #{req.plot_no}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: clr + "22" }]}>
          <Text style={[styles.statusTxt, { color: clr }]}>{req.status.replace("_", " ")}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {/* Booking info */}
        <View style={styles.card}>
          <Text style={styles.sectionHead}>BOOKING DETAILS</Text>
          {[
            ["Client", req.client_name],
            ["Plot", `#${req.plot_no}`],
            ["Elevation", req.elevation_type],
            ["Requested by", req.requested_by],
            ["Date", req.created_at?.slice(0, 10)],
          ].map(([label, val]) => (
            <View key={label as string} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{val}</Text>
            </View>
          ))}
        </View>

        {/* Margin impact card */}
        <View style={styles.impactCard}>
          <Text style={styles.sectionHead}>MARGIN IMPACT ANALYSIS</Text>
          <View style={styles.impactGrid}>
            <View style={styles.impactItem}>
              <Text style={styles.impactLabel}>Sale Value</Text>
              <Text style={styles.impactValue}>{formatINR(req.sale_value_inr)}</Text>
            </View>
            <View style={styles.impactItem}>
              <Text style={styles.impactLabel}>Discount %</Text>
              <Text style={[styles.impactValue, { color: "#EF4444" }]}>{req.discount_pct}%</Text>
            </View>
            <View style={styles.impactItem}>
              <Text style={styles.impactLabel}>Discount ₹</Text>
              <Text style={[styles.impactValue, { color: "#EF4444" }]}>-{formatINR(req.discount_amount_inr)}</Text>
            </View>
            <View style={styles.impactItem}>
              <Text style={styles.impactLabel}>Net Value</Text>
              <Text style={[styles.impactValue, { color: "#22C55E" }]}>{formatINR(req.net_value_inr)}</Text>
            </View>
          </View>

          {/* Visual bar */}
          <View style={styles.barContainer}>
            <View style={[styles.barFill, { flex: 100 - req.discount_pct }]} />
            <View style={[styles.barDiscount, { flex: req.discount_pct }]} />
          </View>
          <View style={styles.barLabels}>
            <Text style={styles.barLabel}>Net: {(100 - req.discount_pct).toFixed(1)}%</Text>
            <Text style={[styles.barLabel, { color: "#EF4444" }]}>Discount: {req.discount_pct}%</Text>
          </View>
        </View>

        {/* Approval tier */}
        <View style={styles.tierCard}>
          <Feather name="shield" size={16} color={colors.brand} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.tierTitle}>Required Approval</Text>
            <Text style={styles.tierRole}>{req.required_approver_role.replace(/_/g, " ")}</Text>
          </View>
        </View>

        {/* Decision result */}
        {req.decided_by && (
          <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: clr }]}>
            <Text style={styles.sectionHead}>DECISION</Text>
            <View style={styles.row}>
              <Text style={styles.label}>By</Text>
              <Text style={styles.value}>{req.decided_by}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Date</Text>
              <Text style={styles.value}>{req.decided_at?.slice(0, 10)}</Text>
            </View>
            {req.decision_note && (
              <View style={styles.row}>
                <Text style={styles.label}>Note</Text>
                <Text style={[styles.value, { fontStyle: "italic" }]}>{req.decision_note}</Text>
              </View>
            )}
            {req.counter_pct != null && (
              <View style={styles.row}>
                <Text style={styles.label}>Counter</Text>
                <Text style={[styles.value, { color: "#8B5CF6" }]}>
                  {req.counter_pct}% ({formatINR(req.counter_amount_inr)})
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Decision form */}
        {isPending && (
          <View style={styles.decideCard}>
            <Text style={styles.decideTitle}>Your Decision</Text>

            <TextInput
              style={styles.noteInput}
              placeholder="Note (required for rejection)"
              placeholderTextColor={colors.muted}
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
            />

            {/* Counter offer input */}
            <View style={styles.counterSection}>
              <Text style={styles.counterLabel}>Counter-offer % (optional)</Text>
              <View style={styles.counterInputRow}>
                <TextInput
                  style={styles.counterInput}
                  placeholder={`Less than ${req.discount_pct}%`}
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  value={counterPct}
                  onChangeText={setCounterPct}
                />
                {counterPct ? (
                  <Text style={styles.counterPreview}>
                    = {formatINR(counterAmt)} discount
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.decideActions}>
              <Pressable
                style={[styles.decideBtn, { backgroundColor: "#22C55E" }]}
                onPress={() => handleDecide("APPROVED")}
                disabled={deciding}
              >
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.decideBtnTxt}>Approve</Text>
              </Pressable>
              {counterPct ? (
                <Pressable
                  style={[styles.decideBtn, { backgroundColor: "#8B5CF6" }]}
                  onPress={() => handleDecide("COUNTER_OFFER")}
                  disabled={deciding}
                >
                  <Feather name="repeat" size={16} color="#fff" />
                  <Text style={styles.decideBtnTxt}>Counter</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.decideBtn, { backgroundColor: "#EF4444" }]}
                onPress={() => handleDecide("REJECTED")}
                disabled={deciding}
              >
                <Feather name="x" size={16} color="#fff" />
                <Text style={styles.decideBtnTxt}>Reject</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  backBtn: { padding: spacing.sm, marginRight: spacing.sm },
  title: { fontFamily: font.display, fontSize: 22, fontWeight: "700", color: colors.onSurface },
  subtitle: { color: colors.muted, fontSize: 12, letterSpacing: 1 },
  muted: { color: colors.muted, fontSize: 14, textAlign: "center", marginTop: spacing.xl },
  statusPill: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radii.pill },
  statusTxt: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },

  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  sectionHead: { fontSize: 10, fontWeight: "700", letterSpacing: 2, color: colors.muted, marginBottom: spacing.md },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { fontSize: 13, color: colors.muted },
  value: { fontSize: 13, fontWeight: "600", color: colors.onSurface, maxWidth: "60%" },

  impactCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  impactGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  impactItem: { width: "46%", alignItems: "center", paddingVertical: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.md },
  impactLabel: { fontSize: 9, color: colors.muted, letterSpacing: 0.5 },
  impactValue: { fontSize: 15, fontWeight: "700", color: colors.onSurface, marginTop: 2 },

  barContainer: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", marginBottom: 4 },
  barFill: { backgroundColor: "#22C55E" },
  barDiscount: { backgroundColor: "#EF4444" },
  barLabels: { flexDirection: "row", justifyContent: "space-between" },
  barLabel: { fontSize: 9, color: colors.muted },

  tierCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.brand + "11", borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.brand + "33" },
  tierTitle: { fontSize: 11, color: colors.muted },
  tierRole: { fontSize: 14, fontWeight: "700", color: colors.brand },

  decideCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.md, ...shadow.card },
  decideTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.md },
  noteInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, fontSize: 14, color: colors.onSurface, minHeight: 80, textAlignVertical: "top", marginBottom: spacing.md },

  counterSection: { marginBottom: spacing.md },
  counterLabel: { fontSize: 11, color: colors.muted, fontWeight: "600", marginBottom: 4 },
  counterInputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  counterInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14, color: colors.onSurface },
  counterPreview: { fontSize: 11, color: "#8B5CF6", fontWeight: "600" },

  decideActions: { flexDirection: "row", gap: spacing.sm },
  decideBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.md, borderRadius: radii.md },
  decideBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
