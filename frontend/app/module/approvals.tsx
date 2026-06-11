import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useProject } from "@/src/lib/project";
import { Watermark } from "@/src/components/Watermark";
import { colors, font, radii, shadow, spacing, statusColor } from "@/src/lib/theme";

const CATEGORIES = ["DESIGN", "MATERIAL", "BUDGET", "STAGE_SIGNOFF", "CLIENT_SELECTION", "OTHER"];
const ASSIGNEES = ["CLIENT", "PROJECT_DIRECTOR", "PROJECT_MANAGER", "ADMIN", "ARCHITECT"];

const EMPTY_FORM = { title: "", description: "", category: "OTHER", assignee_role: "PROJECT_MANAGER" };

export default function Approvals() {
  const router = useRouter();
  const { user } = useAuth();
  const { current: project, projects, setCurrent } = useProject();
  const [requests, setRequests] = useState<any[]>([]);
  const [statutory, setStatutory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const role = user?.role || "";
  const isClient = role === "CLIENT";

  const load = useCallback(async () => {
    if (!project) { setLoading(false); return; }
    try {
      const [reqs, stat] = await Promise.all([
        api.approvalRequests(project.id).catch(() => []),
        api.approvals(project.id).catch(() => []),
      ]);
      setRequests(reqs);
      setStatutory(stat);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [project]);

  useEffect(() => { load(); }, [load]);

  const myPending = requests.filter(
    (r) => r.status === "PENDING" && (r.assignee_role === role || role === "ADMIN"),
  );
  const others = requests.filter((r) => !myPending.includes(r));

  const decide = async (req: any, decision: "APPROVED" | "REJECTED") => {
    setBusyId(req.id);
    try {
      const updated = await api.decideApprovalRequest(req.id, decision);
      setRequests(requests.map((r) => (r.id === req.id ? updated : r)));
    } catch {}
    finally { setBusyId(null); }
  };

  const submitRequest = async () => {
    if (!project) return;
    setErr(null);
    if (!form.title || !form.description) {
      setErr("Title and description are required.");
      return;
    }
    try {
      const created = await api.createApprovalRequest({ project_id: project.id, ...form });
      setRequests([created, ...requests]);
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
    } catch (e: any) {
      setErr(e.message || "Failed to create request");
    }
  };

  const renderRequest = (r: any, withActions: boolean) => (
    <View key={r.id} style={styles.card} testID={`approval-request-${r.id}`}>
      <View style={styles.cardHead}>
        <Text style={styles.itemDesc}>{r.title}</Text>
        <View style={[styles.statusPill, { borderColor: statusColor(r.status) }]}>
          <Text style={[styles.statusPillText, { color: statusColor(r.status) }]}>{r.status}</Text>
        </View>
      </View>
      <Text style={styles.cardMeta}>{r.category.replace(/_/g, " ")} · by {r.requested_by} · for {r.assignee_role.replace(/_/g, " ")}</Text>
      <Text style={styles.bodyTxt}>{r.description}</Text>
      {r.decision_by && (
        <Text style={styles.decisionTxt}>
          {r.status === "APPROVED" ? "Approved" : "Rejected"} by {r.decision_by}{r.decision_note ? ` — ${r.decision_note}` : ""}
        </Text>
      )}
      {withActions && (
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <Pressable
            testID={`approve-${r.id}`}
            onPress={() => decide(r, "APPROVED")}
            disabled={busyId === r.id}
            style={[styles.actionBtn, { borderColor: colors.success }]}
          >
            {busyId === r.id ? <ActivityIndicator size="small" color={colors.success} /> : (
              <>
                <Feather name="check" size={12} color={colors.success} />
                <Text style={[styles.actionTxt, { color: colors.success }]}>APPROVE</Text>
              </>
            )}
          </Pressable>
          <Pressable
            testID={`reject-${r.id}`}
            onPress={() => decide(r, "REJECTED")}
            disabled={busyId === r.id}
            style={[styles.actionBtn, { borderColor: colors.error }]}
          >
            <Feather name="x" size={12} color={colors.error} />
            <Text style={[styles.actionTxt, { color: colors.error }]}>REJECT</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Pressable testID="back-button" onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Approvals</Text>
          {project && <Text style={styles.sub}>{project.name}</Text>}
        </View>
      </View>

      {projects.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {projects.map((p) => (
            <Pressable
              key={p.id}
              testID={`approvals-project-chip-${p.id}`}
              style={[styles.chip, project?.id === p.id && styles.chipActive]}
              onPress={() => setCurrent(p)}
            >
              <Text style={[styles.chipText, project?.id === p.id && styles.chipTextActive]}>{p.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {myPending.length > 0 && (
          <>
            <Text style={styles.sectionHead} testID="awaiting-decision-section">AWAITING YOUR DECISION</Text>
            {myPending.map((r) => renderRequest(r, true))}
          </>
        )}

        {!isClient && !showForm && (
          <Pressable testID="new-approval-request" style={styles.cta} onPress={() => setShowForm(true)}>
            <Feather name="plus-circle" size={16} color={colors.brandSecondary} />
            <Text style={styles.ctaText}>NEW APPROVAL REQUEST</Text>
          </Pressable>
        )}

        {showForm && (
          <View style={styles.formCard} testID="approval-form">
            <Text style={styles.formTitle}>New Approval Request</Text>
            <View style={{ marginTop: spacing.md }}>
              <Text style={styles.label}>Title</Text>
              <TextInput testID="approval-input-title" style={styles.input} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholderTextColor={colors.muted} />
            </View>
            <View style={{ marginTop: spacing.md }}>
              <Text style={styles.label}>Description</Text>
              <TextInput testID="approval-input-description" style={[styles.input, { minHeight: 60 }]} multiline value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholderTextColor={colors.muted} />
            </View>
            <Text style={[styles.label, { marginTop: spacing.md }]}>Category</Text>
            <View style={styles.optionRow}>
              {CATEGORIES.map((c) => (
                <Pressable key={c} testID={`category-${c}`} style={[styles.option, form.category === c && styles.optionActive]} onPress={() => setForm({ ...form, category: c })}>
                  <Text style={[styles.optionTxt, form.category === c && styles.optionTxtActive]}>{c.replace(/_/g, " ")}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.label, { marginTop: spacing.md }]}>Route to</Text>
            <View style={styles.optionRow}>
              {ASSIGNEES.map((a) => (
                <Pressable key={a} testID={`assignee-${a}`} style={[styles.option, form.assignee_role === a && styles.optionActive]} onPress={() => setForm({ ...form, assignee_role: a })}>
                  <Text style={[styles.optionTxt, form.assignee_role === a && styles.optionTxtActive]}>{a.replace(/_/g, " ")}</Text>
                </Pressable>
              ))}
            </View>
            {err ? <Text style={styles.errTxt}>{err}</Text> : null}
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
              <Pressable style={[styles.cta, { flex: 1, backgroundColor: colors.surfaceTertiary, marginBottom: 0 }]} onPress={() => { setShowForm(false); setErr(null); }}>
                <Text style={[styles.ctaText, { color: colors.onSurface }]}>CANCEL</Text>
              </Pressable>
              <Pressable testID="approval-submit" style={[styles.cta, { flex: 1, marginBottom: 0 }]} onPress={submitRequest}>
                <Text style={styles.ctaText}>SUBMIT</Text>
              </Pressable>
            </View>
          </View>
        )}

        {others.length > 0 && (
          <>
            <Text style={styles.sectionHead}>WORKFLOW REQUESTS</Text>
            {others.map((r) => renderRequest(r, false))}
          </>
        )}
        {requests.length === 0 && (
          <Text style={styles.emptyTxt}>No approval requests yet.</Text>
        )}

        {statutory.length > 0 && (
          <>
            <Text style={styles.sectionHead}>STATUTORY & AUTHORITY APPROVALS</Text>
            {statutory.map((a) => (
              <View key={a.id} style={styles.card} testID={`approval-${a.id}`}>
                <View style={styles.cardHead}>
                  <Text style={styles.itemDesc}>{a.name}</Text>
                  <View style={[styles.statusPill, { borderColor: statusColor(a.status) }]}>
                    <Text style={[styles.statusPillText, { color: statusColor(a.status) }]}>{a.status}</Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>{a.authority}{a.date ? ` · ${a.date}` : ""}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, paddingBottom: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: spacing.sm, backgroundColor: colors.surfaceTertiary },
  title: { fontFamily: font.display, fontSize: 22, color: colors.onSurface },
  sub: { color: colors.muted, fontSize: 12 },
  chipRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm, flexDirection: "row" },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, flexShrink: 0 },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontSize: 11, color: colors.muted },
  chipTextActive: { color: colors.brandSecondary },

  sectionHead: { color: colors.muted, fontSize: 10, letterSpacing: 2, marginBottom: spacing.sm, marginTop: spacing.md },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  itemDesc: { fontSize: 14, color: colors.onSurface, fontWeight: "600", flex: 1, paddingRight: spacing.sm },
  cardMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  bodyTxt: { fontSize: 12, color: colors.onSurface, marginTop: spacing.sm, lineHeight: 18 },
  decisionTxt: { fontSize: 11, color: colors.brand, marginTop: spacing.sm, fontStyle: "italic" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, borderWidth: 1 },
  statusPillText: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },

  cta: { flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceInverse, padding: spacing.lg, borderRadius: radii.md, marginBottom: spacing.lg },
  ctaText: { color: colors.brandSecondary, letterSpacing: 2, fontSize: 12, fontWeight: "600" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: spacing.lg, borderWidth: 1, borderRadius: radii.pill },
  actionTxt: { fontSize: 10, letterSpacing: 1.2, fontWeight: "700" },

  formCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  formTitle: { fontFamily: font.display, fontSize: 18, color: colors.onSurface, marginBottom: spacing.sm },
  label: { fontSize: 10, color: colors.muted, letterSpacing: 1.5, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, padding: spacing.md, fontSize: 14, color: colors.onSurface, backgroundColor: colors.surface },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  option: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  optionActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  optionTxt: { fontSize: 10, color: colors.muted, letterSpacing: 0.5 },
  optionTxtActive: { color: colors.brandSecondary },
  errTxt: { color: colors.error, fontSize: 12, marginTop: spacing.md },
  emptyTxt: { color: colors.muted, fontSize: 13, textAlign: "center", paddingVertical: spacing.xl, fontStyle: "italic" },
});
