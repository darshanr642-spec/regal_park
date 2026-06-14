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
};

export default function BookingApprovalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [approval, setApproval] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [note, setNote] = React.useState("");
  const [deciding, setDeciding] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try { setApproval(await api.bookingApproval(id)); } catch { }
    setLoading(false);
  }, [id]);

  React.useEffect(() => { load(); }, [load]);

  const handleDecide = async (decision: string) => {
    if (!id) return;
    if (decision === "REJECTED" && !note.trim()) {
      Alert.alert("Note Required", "Please provide a reason for rejection");
      return;
    }
    setDeciding(true);
    try {
      await api.decideBookingApproval(id, { decision, note: note.trim() || undefined });
      Alert.alert("Done", `Booking ${decision.toLowerCase()}`);
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

  if (!approval) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <Watermark />
        <Text style={styles.muted}>Approval not found</Text>
      </SafeAreaView>
    );
  }

  const clr = STATUS_COLORS[approval.overall_status] || colors.muted;
  const isPending = approval.overall_status === "PENDING";

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Approval Detail</Text>
          <Text style={styles.subtitle}>Plot #{approval.plot_no}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: clr + "22" }]}>
          <Text style={[styles.statusTxt, { color: clr }]}>{approval.overall_status}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {/* Booking info */}
        <View style={styles.card}>
          <Text style={styles.sectionHead}>BOOKING DETAILS</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Client</Text>
            <Text style={styles.value}>{approval.client_name}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Plot</Text>
            <Text style={styles.value}>#{approval.plot_no}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Elevation</Text>
            <Text style={styles.value}>{approval.elevation_type}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Sale Value</Text>
            <Text style={[styles.value, { color: colors.brand, fontWeight: "700", fontSize: 16 }]}>
              {formatINR(approval.sale_value_inr)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Created</Text>
            <Text style={styles.value}>{approval.created_at?.slice(0, 10)}</Text>
          </View>
        </View>

        {/* Approval chain */}
        <Text style={styles.sectionHead2}>APPROVAL CHAIN</Text>
        {approval.levels?.map((lvl: any) => {
          const lc = STATUS_COLORS[lvl.status] || colors.muted;
          const isCurrent = lvl.level === approval.current_level && isPending;
          return (
            <View key={lvl.level} style={[styles.levelCard, { borderLeftColor: lc }, isCurrent && styles.levelCardCurrent]}>
              <View style={styles.levelHeader}>
                <View style={[styles.levelBadge, { backgroundColor: lc + "22" }]}>
                  <Text style={[styles.levelNum, { color: lc }]}>L{lvl.level}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.levelRole}>{lvl.required_role.replace(/_/g, " ")}</Text>
                  {isCurrent && <Text style={styles.levelCurrent}>← CURRENT</Text>}
                </View>
                <View style={[styles.levelStatusPill, { backgroundColor: lc + "22" }]}>
                  <Text style={[styles.levelStatusTxt, { color: lc }]}>{lvl.status}</Text>
                </View>
              </View>
              {lvl.decided_by && (
                <View style={styles.levelDecision}>
                  <Text style={styles.levelDecBy}>By {lvl.decided_by} · {lvl.decided_at?.slice(0, 10)}</Text>
                  {lvl.note && <Text style={styles.levelNote}>"{lvl.note}"</Text>}
                </View>
              )}
            </View>
          );
        })}

        {/* Decision form */}
        {isPending && (
          <View style={styles.decideCard}>
            <Text style={styles.decideTitle}>Your Decision</Text>
            <Text style={styles.decideHint}>
              Level {approval.current_level}: Requires{" "}
              {approval.levels?.find((l: any) => l.level === approval.current_level)?.required_role?.replace(/_/g, " ")}
            </Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Add a note (required for rejection)"
              placeholderTextColor={colors.muted}
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
            />
            <View style={styles.decideActions}>
              <Pressable
                style={[styles.decideBtn, { backgroundColor: "#22C55E" }]}
                onPress={() => handleDecide("APPROVED")}
                disabled={deciding}
              >
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.decideBtnTxt}>{deciding ? "…" : "Approve"}</Text>
              </Pressable>
              <Pressable
                style={[styles.decideBtn, { backgroundColor: "#EF4444" }]}
                onPress={() => handleDecide("REJECTED")}
                disabled={deciding}
              >
                <Feather name="x" size={16} color="#fff" />
                <Text style={styles.decideBtnTxt}>{deciding ? "…" : "Reject"}</Text>
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

  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: spacing.lg, ...shadow.card },
  sectionHead: { fontSize: 10, fontWeight: "700", letterSpacing: 2, color: colors.muted, marginBottom: spacing.md },
  sectionHead2: { fontSize: 10, fontWeight: "700", letterSpacing: 2, color: colors.muted, marginTop: spacing.xl, marginBottom: spacing.md },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { fontSize: 13, color: colors.muted },
  value: { fontSize: 13, fontWeight: "600", color: colors.onSurface },

  levelCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm, borderLeftWidth: 4, ...shadow.card },
  levelCardCurrent: { borderLeftWidth: 4, backgroundColor: "#F59E0B08" },
  levelHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  levelBadge: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  levelNum: { fontSize: 14, fontWeight: "700" },
  levelRole: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  levelCurrent: { fontSize: 9, fontWeight: "700", color: "#F59E0B", marginTop: 2 },
  levelStatusPill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.pill },
  levelStatusTxt: { fontSize: 9, fontWeight: "700" },
  levelDecision: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  levelDecBy: { fontSize: 11, color: colors.muted },
  levelNote: { fontSize: 12, color: colors.onSurface, fontStyle: "italic", marginTop: 2 },

  decideCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.xl, ...shadow.card },
  decideTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface, marginBottom: 4 },
  decideHint: { fontSize: 12, color: colors.muted, marginBottom: spacing.md },
  noteInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, fontSize: 14, color: colors.onSurface, minHeight: 80, textAlignVertical: "top", marginBottom: spacing.md },
  decideActions: { flexDirection: "row", gap: spacing.md },
  decideBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.md, borderRadius: radii.md },
  decideBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
