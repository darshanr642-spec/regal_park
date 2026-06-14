import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Watermark } from "@/src/components/Watermark";
import { api } from "@/src/lib/api";

const P = {
  bg: "#1A1A1A",
  card: "#242424",
  cardAlt: "#2C2C2C",
  gold: "#C5A059",
  goldLight: "#D4AF37",
  goldMuted: "#A0884A",
  white: "#F5F0E8",
  muted: "#8A8070",
  success: "#4ADE80",
  warning: "#FBBF24",
  error: "#F87171",
  border: "#3A3530",
};

const STATUS_STYLE: Record<string, { color: string; icon: any }> = {
  PAID: { color: P.success, icon: "check-circle" },
  PENDING: { color: P.muted, icon: "clock" },
  INVOICED: { color: P.warning, icon: "file-text" },
  OVERDUE: { color: P.error, icon: "alert-triangle" },
};

function formatINR(n: number) {
  if (n == null || isNaN(n)) return "₹ —";
  if (Math.abs(n) >= 1e7) return `₹ ${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹ ${(n / 1e5).toFixed(2)} L`;
  return `₹ ${n.toLocaleString("en-IN")}`;
}

export default function PortalPayments() {
  const router = useRouter();
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try { setData(await api.portalPayments()); } catch { }
      setLoading(false);
    })();
  }, []);

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <Watermark />
        <Text style={styles.loadingTxt}>{loading ? "Loading…" : "No data"}</Text>
      </SafeAreaView>
    );
  }

  const paidPct = data.total_inr > 0 ? (data.paid_inr / data.total_inr) * 100 : 0;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={P.white} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Payment Schedule</Text>
          <Text style={styles.subtitle}>{data.villa_name}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 80 }}>
        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { borderColor: P.gold + "55" }]}>
            <Text style={styles.summaryLabel}>TOTAL VALUE</Text>
            <Text style={[styles.summaryValue, { color: P.white }]}>{formatINR(data.total_inr)}</Text>
          </View>
          <View style={[styles.summaryCard, { borderColor: P.success + "55" }]}>
            <Text style={styles.summaryLabel}>PAID</Text>
            <Text style={[styles.summaryValue, { color: P.success }]}>{formatINR(data.paid_inr)}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { borderColor: P.muted + "55" }]}>
            <Text style={styles.summaryLabel}>PENDING</Text>
            <Text style={[styles.summaryValue, { color: P.goldLight }]}>{formatINR(data.pending_inr)}</Text>
          </View>
          <View style={[styles.summaryCard, { borderColor: P.goldMuted + "55" }]}>
            <Text style={styles.summaryLabel}>PROGRESS</Text>
            <Text style={[styles.summaryValue, { color: P.gold }]}>{paidPct.toFixed(0)}%</Text>
          </View>
        </View>

        {/* Overall bar */}
        <View style={styles.overallBar}>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.min(paidPct, 100)}%` }]} />
          </View>
          <View style={styles.barLabels}>
            <Text style={styles.barLabel}>Paid</Text>
            <Text style={styles.barLabel}>Remaining</Text>
          </View>
        </View>

        {/* Milestones */}
        <Text style={styles.sectionTitle}>MILESTONES</Text>
        {data.milestones?.map((m: any) => {
          const cfg = STATUS_STYLE[m.status] || STATUS_STYLE.PENDING;
          const isPaid = m.status === "PAID";
          return (
            <View key={m.id || m.order} style={[styles.milestoneCard, isPaid && styles.milestoneCardPaid]}>
              <View style={styles.milestoneLeft}>
                <View style={[styles.milestoneIcon, { backgroundColor: cfg.color + "15" }]}>
                  <Feather name={cfg.icon} size={16} color={cfg.color} />
                </View>
                <View style={styles.milestoneNum}>
                  <Text style={styles.milestoneNumTxt}>{m.order}</Text>
                </View>
              </View>

              <View style={styles.milestoneBody}>
                <Text style={styles.milestoneName}>{m.milestone_name}</Text>
                <Text style={[styles.milestoneAmt, { color: isPaid ? P.success : P.gold }]}>
                  {formatINR(m.amount_inr)}
                </Text>
                {m.due_date && (
                  <Text style={styles.milestoneDue}>Due: {m.due_date}</Text>
                )}
                {m.paid_date && (
                  <Text style={[styles.milestoneDue, { color: P.success }]}>Paid: {m.paid_date}</Text>
                )}
              </View>

              <View style={[styles.statusBadge, { backgroundColor: cfg.color + "22" }]}>
                <Text style={[styles.statusTxt, { color: cfg.color }]}>{m.status}</Text>
              </View>
            </View>
          );
        })}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerTxt}>All amounts in Indian Rupees (INR)</Text>
          <Text style={styles.footerTxt}>Payment details as per agreement</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: P.bg },
  loadingTxt: { color: P.muted, fontSize: 16, textAlign: "center", marginTop: 100 },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  backBtn: { padding: 8, marginRight: 12 },
  title: { fontSize: 22, fontWeight: "700", color: P.white, fontFamily: "Georgia" },
  subtitle: { fontSize: 12, color: P.muted, letterSpacing: 1 },

  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  summaryCard: { flex: 1, backgroundColor: P.card, borderRadius: 16, padding: 20, borderWidth: 1, alignItems: "center" },
  summaryLabel: { fontSize: 9, letterSpacing: 2, color: P.muted, fontWeight: "700" },
  summaryValue: { fontSize: 18, fontWeight: "700", marginTop: 6 },

  overallBar: { marginBottom: 32 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: P.cardAlt },
  barFill: { height: 8, borderRadius: 4, backgroundColor: P.success },
  barLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  barLabel: { fontSize: 10, color: P.muted },

  sectionTitle: { fontSize: 10, letterSpacing: 3, color: P.goldMuted, fontWeight: "700", marginBottom: 16 },

  milestoneCard: { flexDirection: "row", alignItems: "center", backgroundColor: P.card, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: P.border },
  milestoneCardPaid: { borderColor: P.success + "33", backgroundColor: P.card },
  milestoneLeft: { alignItems: "center", marginRight: 14 },
  milestoneIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  milestoneNum: { marginTop: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: P.cardAlt, alignItems: "center", justifyContent: "center" },
  milestoneNumTxt: { fontSize: 9, fontWeight: "700", color: P.muted },
  milestoneBody: { flex: 1 },
  milestoneName: { fontSize: 14, fontWeight: "700", color: P.white },
  milestoneAmt: { fontSize: 16, fontWeight: "700", marginTop: 4 },
  milestoneDue: { fontSize: 10, color: P.muted, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusTxt: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },

  footer: { alignItems: "center", marginTop: 32 },
  footerTxt: { fontSize: 10, color: P.muted, marginTop: 2 },
});
