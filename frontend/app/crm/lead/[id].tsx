import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors, font, radii, shadow, spacing } from "@/src/lib/theme";
import { Watermark } from "@/src/components/Watermark";
import { api } from "@/src/lib/api";

const STATUS_COLORS: Record<string, string> = {
  NEW: "#3498DB", CONTACTED: "#9B59B6", SITE_VISIT_SCHEDULED: "#E67E22",
  SITE_VISIT_DONE: "#2ECC71", NEGOTIATION: colors.brand, BOOKING: colors.success, LOST: colors.error,
};

export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [lead, setLead] = React.useState<any>(null);
  const [timeline, setTimeline] = React.useState<any[]>([]);
  const [visits, setVisits] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editNotes, setEditNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [l, t, v] = await Promise.all([
        api.crmLead(id),
        api.crmLeadTimeline(id),
        api.crmSiteVisits(id),
      ]);
      setLead(l);
      setTimeline(t);
      setVisits(v);
      setEditNotes(l.notes || "");
    } catch { }
    setLoading(false);
  }, [id]);

  React.useEffect(() => { load(); }, [load]);

  const updateStatus = async (status: string) => {
    setSaving(true);
    try {
      await api.crmUpdateLead(id!, { status });
      load();
    } catch (e: any) { Alert.alert("Error", e.message); }
    setSaving(false);
  };

  const saveNotes = async () => {
    setSaving(true);
    try {
      await api.crmUpdateLead(id!, { notes: editNotes });
      load();
    } catch (e: any) { Alert.alert("Error", e.message); }
    setSaving(false);
  };

  if (loading || !lead) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.center}><Text style={styles.muted}>{loading ? "Loading…" : "Lead not found"}</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{lead.full_name}</Text>
          <Text style={styles.subtitle}>{lead.phone}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: (STATUS_COLORS[lead.status] || colors.muted) + "22" }]}>
          <Text style={[styles.statusTxt, { color: STATUS_COLORS[lead.status] || colors.muted }]}>
            {lead.status.replace(/_/g, " ")}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {/* Info card */}
        <View style={styles.card}>
          <Row label="Source" value={lead.source.replace(/_/g, " ")} icon="tag" />
          <Row label="Elevation" value={lead.interested_elevation || "—"} icon="home" />
          <Row label="Budget" value={lead.budget_range_inr || "—"} icon="dollar-sign" />
          <Row label="Assigned" value={lead.assigned_to} icon="user" />
          <Row label="Created" value={lead.created_at?.slice(0, 10) || "—"} icon="calendar" />
        </View>

        {/* Status actions */}
        <Text style={styles.sectionHead}>ADVANCE STATUS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
          {Object.keys(STATUS_COLORS).filter((s) => s !== lead.status).map((s) => (
            <Pressable
              key={s}
              style={[styles.actionChip, { borderColor: STATUS_COLORS[s] }]}
              onPress={() => updateStatus(s)}
              disabled={saving}
            >
              <Text style={{ fontSize: 11, color: STATUS_COLORS[s], fontWeight: "700" }}>
                → {s.replace(/_/g, " ")}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Notes */}
        <Text style={styles.sectionHead}>NOTES</Text>
        <View style={styles.card}>
          <TextInput
            style={styles.notesInput}
            multiline
            value={editNotes}
            onChangeText={setEditNotes}
            placeholder="Add notes…"
            placeholderTextColor={colors.muted}
          />
          <Pressable style={styles.saveBtn} onPress={saveNotes} disabled={saving}>
            <Text style={styles.saveTxt}>{saving ? "Saving…" : "Save Notes"}</Text>
          </Pressable>
        </View>

        {/* Site visits */}
        <Text style={styles.sectionHead}>SITE VISITS ({visits.length})</Text>
        {visits.map((v) => (
          <View key={v.id} style={styles.visitCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Feather name="calendar" size={14} color={colors.brand} />
              <Text style={styles.visitDate}>{v.scheduled_at?.slice(0, 10)}</Text>
              {v.actual_at && <Text style={styles.visitDone}>✓ Completed</Text>}
            </View>
            {v.feedback && <Text style={styles.visitFeedback}>{v.feedback}</Text>}
            {v.plots_shown?.length > 0 && (
              <Text style={styles.visitMeta}>Plots shown: {v.plots_shown.join(", ")}</Text>
            )}
          </View>
        ))}

        {/* Activity timeline */}
        <Text style={styles.sectionHead}>ACTIVITY TIMELINE ({timeline.length})</Text>
        {timeline.map((a) => (
          <View key={a.id} style={styles.timelineItem}>
            <View style={styles.timelineDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.timelineDesc}>{a.description}</Text>
              <Text style={styles.timelineMeta}>
                {a.type} · {a.created_by} · {a.created_at?.slice(0, 16).replace("T", " ")}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={styles.row}>
      <Feather name={icon as any} size={14} color={colors.muted} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 14 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  backBtn: { padding: spacing.sm, marginRight: spacing.sm },
  title: { fontFamily: font.display, fontSize: 22, fontWeight: "700", color: colors.onSurface },
  subtitle: { color: colors.muted, fontSize: 13 },
  statusPill: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radii.pill },
  statusTxt: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  sectionHead: { fontSize: 11, fontWeight: "700", letterSpacing: 2, color: colors.muted, marginTop: spacing.xl, marginBottom: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  rowLabel: { flex: 1, fontSize: 13, color: colors.muted },
  rowValue: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  actionChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.pill, borderWidth: 1.5 },
  notesInput: { fontSize: 14, color: colors.onSurface, minHeight: 80, textAlignVertical: "top" },
  saveBtn: { backgroundColor: colors.brand, borderRadius: radii.md, padding: spacing.sm, alignItems: "center", marginTop: spacing.sm },
  saveTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 13 },
  visitCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xs, ...shadow.card },
  visitDate: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  visitDone: { fontSize: 11, color: colors.success, fontWeight: "700" },
  visitFeedback: { fontSize: 13, color: colors.onSurface, marginTop: 4 },
  visitMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  timelineItem: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm },
  timelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 5 },
  timelineDesc: { fontSize: 13, color: colors.onSurface },
  timelineMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
});
