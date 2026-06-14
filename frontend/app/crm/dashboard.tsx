import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { colors, font, radii, shadow, spacing, formatINR } from "@/src/lib/theme";
import { Watermark } from "@/src/components/Watermark";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

const STATUSES = [
  "NEW", "CONTACTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE",
  "NEGOTIATION", "BOOKING", "LOST",
];

const STATUS_COLORS: Record<string, string> = {
  NEW: "#3498DB",
  CONTACTED: "#9B59B6",
  SITE_VISIT_SCHEDULED: "#E67E22",
  SITE_VISIT_DONE: "#2ECC71",
  NEGOTIATION: colors.brand,
  BOOKING: colors.success,
  LOST: colors.error,
};

export default function CrmDashboard() {
  const { user } = useAuth();
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    api.crmDashboard().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.center}><Text style={styles.muted}>Loading…</Text></View>
      </SafeAreaView>
    );
  }
  if (!data) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.center}><Text style={styles.muted}>Unable to load dashboard</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <Text style={styles.title}>Sales Dashboard</Text>
        <Text style={styles.subtitle}>CRM Revenue Engine</Text>

        {/* KPI row */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Feather name="users" size={20} color={colors.brand} />
            <Text style={styles.kpiValue}>{data.total_leads}</Text>
            <Text style={styles.kpiLabel}>Total Leads</Text>
          </View>
          <View style={styles.kpiCard}>
            <Feather name="check-circle" size={20} color={colors.success} />
            <Text style={styles.kpiValue}>{data.confirmed_bookings}</Text>
            <Text style={styles.kpiLabel}>Confirmed</Text>
          </View>
          <View style={styles.kpiCard}>
            <Feather name="clock" size={20} color={colors.warning} />
            <Text style={styles.kpiValue}>{data.provisional_bookings}</Text>
            <Text style={styles.kpiLabel}>Provisional</Text>
          </View>
        </View>

        {/* Pipeline value */}
        <View style={[styles.card, { backgroundColor: colors.surfaceInverse }]}>
          <Text style={{ color: colors.brandSecondary, fontSize: 12, letterSpacing: 2, fontWeight: "600" }}>
            PIPELINE VALUE
          </Text>
          <Text style={{ color: colors.onSurfaceInverse, fontSize: 28, fontFamily: font.display, fontWeight: "700", marginTop: 4 }}>
            {formatINR(data.pipeline_value_inr)}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
            {data.total_bookings} total bookings · {data.cancelled_bookings} cancelled
          </Text>
        </View>

        {/* Lead funnel */}
        <Text style={styles.sectionHead}>LEAD FUNNEL</Text>
        {data.lead_funnel?.map((stage: any) => (
          <View key={stage.status} style={styles.funnelRow}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLORS[stage.status] || colors.muted }]} />
            <Text style={styles.funnelLabel}>{stage.status.replace(/_/g, " ")}</Text>
            <Text style={styles.funnelCount}>{stage.count}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 14 },
  title: { fontFamily: font.display, fontSize: 26, fontWeight: "700", color: colors.onSurface },
  subtitle: { color: colors.muted, fontSize: 13, letterSpacing: 1, marginBottom: spacing.lg },
  kpiRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  kpiCard: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg,
    padding: spacing.md, alignItems: "center", ...shadow.card,
  },
  kpiValue: { fontSize: 24, fontWeight: "700", color: colors.onSurface, marginTop: 4 },
  kpiLabel: { fontSize: 11, color: colors.muted, letterSpacing: 1, marginTop: 2 },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg,
    padding: spacing.xl, marginBottom: spacing.lg, ...shadow.card,
  },
  sectionHead: {
    fontSize: 11, fontWeight: "700", letterSpacing: 2, color: colors.muted,
    marginTop: spacing.lg, marginBottom: spacing.md,
  },
  funnelRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.md },
  funnelLabel: { flex: 1, fontSize: 13, color: colors.onSurface },
  funnelCount: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
});
