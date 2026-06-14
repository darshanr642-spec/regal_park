import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, font, radii, shadow, spacing } from "@/src/lib/theme";
import { Watermark } from "@/src/components/Watermark";
import { EmptyState } from "@/src/components/EmptyStatePremium";
import { api } from "@/src/lib/api";

export default function CrmVisits() {
  const router = useRouter();
  const [visits, setVisits] = React.useState<any[]>([]);
  const [leads, setLeads] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showAdd, setShowAdd] = React.useState(false);
  const [selectedLead, setSelectedLead] = React.useState("");
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [plotsStr, setPlotsStr] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [v, l] = await Promise.all([api.crmSiteVisits(), api.crmLeads()]);
      setVisits(v);
      setLeads(l);
    } catch { }
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!selectedLead || !scheduledAt) {
      Alert.alert("Required", "Select a lead and enter date/time");
      return;
    }
    setSubmitting(true);
    try {
      const plots = plotsStr.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
      await api.crmCreateSiteVisit({
        lead_id: selectedLead,
        scheduled_at: scheduledAt,
        plots_shown: plots,
      });
      setShowAdd(false);
      setSelectedLead("");
      setScheduledAt("");
      setPlotsStr("");
      load();
    } catch (e: any) { Alert.alert("Error", e.message); }
    setSubmitting(false);
  };

  const completeVisit = async (visitId: string, _leadId: string) => {
    const doComplete = async (feedback: string) => {
      try {
        await api.crmUpdateSiteVisit(visitId, {
          actual_at: new Date().toISOString(),
          feedback: feedback || "Completed",
        });
        load();
      } catch (e: any) { Alert.alert("Error", e.message); }
    };

    if (typeof Alert.prompt === "function") {
      Alert.prompt("Feedback", "Enter site visit feedback:", (text) => doComplete(text));
    } else {
      await doComplete("Site visit completed");
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Site Visits</Text>
          <Text style={styles.subtitle}>{visits.length} visits</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => setShowAdd(!showAdd)}>
          <Feather name={showAdd ? "x" : "plus"} size={20} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      {showAdd && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Schedule Visit</Text>
          {/* Lead selector */}
          <Text style={styles.label}>Lead</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }} contentContainerStyle={{ gap: spacing.xs }}>
            {leads.filter((l) => l.status !== "BOOKING" && l.status !== "LOST").map((l) => (
              <Pressable
                key={l.id}
                style={[styles.leadChip, selectedLead === l.id && styles.leadChipActive]}
                onPress={() => setSelectedLead(l.id)}
              >
                <Text style={[styles.leadChipTxt, selectedLead === l.id && { color: colors.onBrandPrimary }]}>
                  {l.full_name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput
            style={styles.input} placeholder="Date/Time (e.g. 2026-07-01T10:00:00Z)" placeholderTextColor={colors.muted}
            value={scheduledAt} onChangeText={setScheduledAt}
          />
          <TextInput
            style={styles.input} placeholder="Plot numbers (comma-separated, e.g. 1,5,10)" placeholderTextColor={colors.muted}
            value={plotsStr} onChangeText={setPlotsStr}
          />
          <Pressable style={styles.submitBtn} onPress={handleCreate} disabled={submitting}>
            <Text style={styles.submitTxt}>{submitting ? "Scheduling…" : "Schedule Visit"}</Text>
          </Pressable>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {loading && <Text style={styles.muted}>Loading…</Text>}
        {!loading && visits.length === 0 && (
          <EmptyState
            icon="calendar"
            title="No site visits scheduled"
            subtitle="Schedule site visits from the lead detail page to track customer engagement."
          />
        )}
        {visits.map((v) => {
          const lead = leads.find((l) => l.id === v.lead_id);
          return (
            <View key={v.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Feather name="calendar" size={16} color={colors.brand} />
                <Text style={styles.cardDate}>{v.scheduled_at?.slice(0, 10)}</Text>
                {v.actual_at ? (
                  <View style={[styles.badge, { backgroundColor: colors.success + "22" }]}>
                    <Text style={[styles.badgeTxt, { color: colors.success }]}>DONE</Text>
                  </View>
                ) : (
                  <Pressable
                    style={[styles.badge, { backgroundColor: colors.warning + "22" }]}
                    onPress={() => completeVisit(v.id, v.lead_id)}
                  >
                    <Text style={[styles.badgeTxt, { color: colors.warning }]}>MARK DONE</Text>
                  </Pressable>
                )}
              </View>
              <Text style={styles.cardName}>{lead?.full_name || v.lead_id}</Text>
              <Text style={styles.cardMeta}>By: {v.conducted_by}</Text>
              {v.plots_shown?.length > 0 && (
                <Text style={styles.cardMeta}>Plots: {v.plots_shown.join(", ")}</Text>
              )}
              {v.feedback && <Text style={styles.cardFeedback}>{v.feedback}</Text>}
            </View>
          );
        })}
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
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 14, textAlign: "center", marginTop: spacing.xl },
  formCard: { backgroundColor: colors.surfaceSecondary, margin: spacing.lg, borderRadius: radii.lg, padding: spacing.lg, ...shadow.card },
  formTitle: { fontWeight: "700", fontSize: 16, color: colors.onSurface, marginBottom: spacing.md },
  label: { fontSize: 11, color: colors.muted, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14, color: colors.onSurface, marginBottom: spacing.sm },
  leadChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  leadChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  leadChipTxt: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  submitBtn: { backgroundColor: colors.brand, borderRadius: radii.md, padding: spacing.md, alignItems: "center" },
  submitTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 14 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadow.card },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardDate: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.onSurface },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.pill },
  badgeTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  cardName: { fontSize: 14, fontWeight: "600", color: colors.onSurface, marginTop: 4 },
  cardMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  cardFeedback: { fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 4, fontStyle: "italic" },
});
