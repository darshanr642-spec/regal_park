import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Watermark } from "@/src/components/Watermark";
import { LogoutButton } from "@/src/components/LogoutButton";
import { api } from "@/src/lib/api";

/* ── Premium Portal palette ─────────────────────────────────────────── */
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
  border: "#3A3530",
};

function formatINR(n: number) {
  if (n == null || isNaN(n)) return "₹ —";
  if (Math.abs(n) >= 1e7) return `₹ ${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹ ${(n / 1e5).toFixed(2)} L`;
  return `₹ ${n.toLocaleString("en-IN")}`;
}

export default function PortalHome() {
  const router = useRouter();
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try { setData(await api.portalDashboard()); } catch { }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <Watermark />
        <Text style={styles.loadingTxt}>Loading your villa…</Text>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <Watermark />
        <Text style={styles.loadingTxt}>No project found</Text>
      </SafeAreaView>
    );
  }

  const progress = data.overall_progress || 0;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Hero banner */}
        <View style={styles.heroBanner}>
          {data.hero_image_url ? (
            <Image source={{ uri: data.hero_image_url }} style={styles.heroImg} />
          ) : (
            <View style={[styles.heroImg, { backgroundColor: P.card }]} />
          )}
          <View style={styles.heroOverlay}>
            <Text style={styles.heroLabel}>STERLITEE DEVELOPERS</Text>
            <Text style={styles.heroTitle}>{data.villa_name}</Text>
            <Text style={styles.heroSubtitle}>{data.plot_number}</Text>
          </View>
        </View>

        {/* Progress ring */}
        <View style={styles.progressSection}>
          <View style={styles.progressRing}>
            <Text style={styles.progressPct}>{progress.toFixed(0)}%</Text>
            <Text style={styles.progressLabel}>COMPLETE</Text>
          </View>
          <View style={styles.progressMeta}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Villa Type</Text>
              <Text style={styles.metaValue}>{data.villa_type}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Built-up Area</Text>
              <Text style={styles.metaValue}>{data.built_up_area_sqft?.toLocaleString()} sq ft</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Status</Text>
              <Text style={[styles.metaValue, { color: P.goldLight }]}>{data.status?.replace(/_/g, " ")}</Text>
            </View>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.barSection}>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.min(progress, 100)}%` }]} />
          </View>
          <View style={styles.barLabels}>
            <Text style={styles.barDate}>Start: {data.start_date}</Text>
            <Text style={styles.barDate}>Target: {data.target_handover_date || "TBD"}</Text>
          </View>
        </View>

        {/* Current Stage */}
        {data.current_stage && (
          <Pressable style={styles.stageCard} onPress={() => router.push("/portal/timeline" as any)}>
            <View style={styles.stageIcon}>
              <Feather name="layers" size={20} color={P.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stageLabel}>CURRENT STAGE</Text>
              <Text style={styles.stageName}>{data.current_stage.name}</Text>
              <View style={styles.stageBarTrack}>
                <View style={[styles.stageBarFill, { width: `${data.current_stage.progress_pct}%` }]} />
              </View>
              <Text style={styles.stagePct}>{data.current_stage.progress_pct}% complete</Text>
            </View>
            <Feather name="chevron-right" size={18} color={P.muted} />
          </Pressable>
        )}

        {/* Next Milestone */}
        {data.next_milestone && (
          <Pressable style={styles.milestoneCard} onPress={() => router.push("/portal/payments" as any)}>
            <View style={styles.milestoneIcon}>
              <Feather name="credit-card" size={20} color={P.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.milestoneLabel}>NEXT PAYMENT</Text>
              <Text style={styles.milestoneName}>{data.next_milestone.milestone_name}</Text>
              <Text style={styles.milestoneAmt}>{formatINR(data.next_milestone.amount_inr)}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={P.muted} />
          </Pressable>
        )}

        {/* Quick links */}
        <View style={styles.quickLinks}>
          <Pressable style={styles.quickLink} onPress={() => router.push("/portal/timeline" as any)}>
            <Feather name="clock" size={24} color={P.gold} />
            <Text style={styles.quickLinkTitle}>Timeline</Text>
            <Text style={styles.quickLinkSub}>{data.stages_count} stages</Text>
          </Pressable>
          <Pressable style={styles.quickLink} onPress={() => router.push("/portal/payments" as any)}>
            <Feather name="dollar-sign" size={24} color={P.gold} />
            <Text style={styles.quickLinkTitle}>Payments</Text>
            <Text style={styles.quickLinkSub}>{data.milestones_paid}/{data.milestones_total} paid</Text>
          </Pressable>
        </View>

        {/* Account */}
        <LogoutButton dark />

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerLogo}>REGAL PARK VILLAS</Text>
          <Text style={styles.footerCo}>Sterlitee Developers LLP</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: P.bg },
  loadingTxt: { color: P.muted, fontSize: 16, textAlign: "center", marginTop: 100 },

  heroBanner: { height: 260, position: "relative" },
  heroImg: { width: "100%", height: 260, resizeMode: "cover" },
  heroOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 24, backgroundColor: "rgba(0,0,0,0.55)" },
  heroLabel: { fontSize: 9, letterSpacing: 4, color: P.goldMuted, fontWeight: "700" },
  heroTitle: { fontSize: 28, fontWeight: "700", color: P.white, fontFamily: "Georgia", marginTop: 4 },
  heroSubtitle: { fontSize: 13, color: P.muted, marginTop: 2 },

  progressSection: { flexDirection: "row", alignItems: "center", padding: 24, gap: 24 },
  progressRing: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: P.gold, alignItems: "center", justifyContent: "center", backgroundColor: P.card },
  progressPct: { fontSize: 24, fontWeight: "700", color: P.gold },
  progressLabel: { fontSize: 8, letterSpacing: 2, color: P.muted, marginTop: -2 },
  progressMeta: { flex: 1, gap: 8 },
  metaItem: {},
  metaLabel: { fontSize: 9, letterSpacing: 1.5, color: P.muted, fontWeight: "600" },
  metaValue: { fontSize: 14, fontWeight: "600", color: P.white },

  barSection: { paddingHorizontal: 24, marginBottom: 24 },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: P.cardAlt },
  barFill: { height: 6, borderRadius: 3, backgroundColor: P.gold },
  barLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  barDate: { fontSize: 10, color: P.muted },

  stageCard: { flexDirection: "row", alignItems: "center", marginHorizontal: 24, marginBottom: 12, padding: 20, backgroundColor: P.card, borderRadius: 16, borderWidth: 1, borderColor: P.border },
  stageIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: P.gold + "15", alignItems: "center", justifyContent: "center", marginRight: 16 },
  stageLabel: { fontSize: 9, letterSpacing: 2, color: P.muted, fontWeight: "700" },
  stageName: { fontSize: 16, fontWeight: "700", color: P.white, marginTop: 2 },
  stageBarTrack: { height: 4, borderRadius: 2, backgroundColor: P.cardAlt, marginTop: 8 },
  stageBarFill: { height: 4, borderRadius: 2, backgroundColor: P.goldLight },
  stagePct: { fontSize: 10, color: P.goldMuted, marginTop: 4 },

  milestoneCard: { flexDirection: "row", alignItems: "center", marginHorizontal: 24, marginBottom: 12, padding: 20, backgroundColor: P.card, borderRadius: 16, borderWidth: 1, borderColor: P.border },
  milestoneIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: P.gold + "15", alignItems: "center", justifyContent: "center", marginRight: 16 },
  milestoneLabel: { fontSize: 9, letterSpacing: 2, color: P.muted, fontWeight: "700" },
  milestoneName: { fontSize: 16, fontWeight: "700", color: P.white, marginTop: 2 },
  milestoneAmt: { fontSize: 14, fontWeight: "700", color: P.gold, marginTop: 4 },

  quickLinks: { flexDirection: "row", gap: 12, paddingHorizontal: 24, marginTop: 12 },
  quickLink: { flex: 1, backgroundColor: P.card, borderRadius: 16, padding: 20, alignItems: "center", borderWidth: 1, borderColor: P.border },
  quickLinkTitle: { fontSize: 14, fontWeight: "700", color: P.white, marginTop: 10 },
  quickLinkSub: { fontSize: 11, color: P.muted, marginTop: 2 },

  footer: { alignItems: "center", marginTop: 40, paddingBottom: 20 },
  footerLogo: { fontSize: 10, letterSpacing: 6, color: P.goldMuted, fontWeight: "700" },
  footerCo: { fontSize: 10, color: P.muted, marginTop: 4 },
});
