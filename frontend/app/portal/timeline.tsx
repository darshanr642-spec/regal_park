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
  border: "#3A3530",
};

const STATUS_CONFIG: Record<string, { color: string; icon: any }> = {
  COMPLETED: { color: P.success, icon: "check-circle" },
  IN_PROGRESS: { color: P.gold, icon: "loader" },
  DELAYED: { color: "#F87171", icon: "alert-circle" },
  NOT_STARTED: { color: P.muted, icon: "circle" },
};

export default function PortalTimeline() {
  const router = useRouter();
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try { setData(await api.portalTimeline()); } catch { }
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

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={P.white} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Construction Timeline</Text>
          <Text style={styles.subtitle}>{data.villa_name}</Text>
        </View>
        <View style={styles.progressBadge}>
          <Text style={styles.progressTxt}>{data.overall_progress?.toFixed(0)}%</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 80 }}>
        {data.stages?.map((stage: any, i: number) => {
          const cfg = STATUS_CONFIG[stage.status] || STATUS_CONFIG.NOT_STARTED;
          const isLast = i === data.stages.length - 1;
          return (
            <View key={stage.id || i} style={styles.timelineItem}>
              {/* Connector line */}
              <View style={styles.connector}>
                <View style={[styles.dot, { backgroundColor: cfg.color, borderColor: cfg.color }]} />
                {!isLast && <View style={[styles.line, { backgroundColor: cfg.color + "44" }]} />}
              </View>

              {/* Card */}
              <View style={[styles.stageCard, stage.status === "IN_PROGRESS" && styles.stageCardActive]}>
                <View style={styles.stageHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stageOrder}>STAGE {stage.order}</Text>
                    <Text style={styles.stageName}>{stage.name}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: cfg.color + "22" }]}>
                    <Feather name={cfg.icon} size={10} color={cfg.color} />
                    <Text style={[styles.statusTxt, { color: cfg.color }]}>
                      {stage.status?.replace(/_/g, " ")}
                    </Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${stage.progress_pct}%`, backgroundColor: cfg.color }]} />
                </View>

                <View style={styles.stageFooter}>
                  <Text style={styles.stagePct}>{stage.progress_pct}%</Text>
                  <Text style={styles.stageDates}>
                    {stage.planned_start} → {stage.planned_end}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        <View style={styles.footer}>
          <Feather name="flag" size={16} color={P.goldMuted} />
          <Text style={styles.footerTxt}>Handover</Text>
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
  progressBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 2, borderColor: P.gold },
  progressTxt: { fontSize: 14, fontWeight: "700", color: P.gold },

  timelineItem: { flexDirection: "row", marginBottom: 0 },
  connector: { width: 28, alignItems: "center" },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginTop: 20 },
  line: { flex: 1, width: 2, marginTop: 4 },

  stageCard: { flex: 1, backgroundColor: P.card, borderRadius: 16, padding: 20, marginLeft: 12, marginBottom: 16, borderWidth: 1, borderColor: P.border },
  stageCardActive: { borderColor: P.gold + "55", backgroundColor: P.card + "ff" },
  stageHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  stageOrder: { fontSize: 9, letterSpacing: 2, color: P.muted, fontWeight: "700" },
  stageName: { fontSize: 15, fontWeight: "700", color: P.white, marginTop: 2 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusTxt: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },

  barTrack: { height: 5, borderRadius: 3, backgroundColor: P.cardAlt },
  barFill: { height: 5, borderRadius: 3 },
  stageFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  stagePct: { fontSize: 11, fontWeight: "700", color: P.goldMuted },
  stageDates: { fontSize: 10, color: P.muted },

  footer: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", marginTop: 12 },
  footerTxt: { fontSize: 12, color: P.goldMuted, fontWeight: "600" },
});
