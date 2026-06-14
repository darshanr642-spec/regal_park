import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, font, radii, shadow, spacing } from "@/src/lib/theme";
import { Watermark } from "@/src/components/Watermark";
import { api } from "@/src/lib/api";

const STATUS_COLORS: Record<string, string> = {
  NEW: "#3498DB",
  CONTACTED: "#9B59B6",
  SITE_VISIT_SCHEDULED: "#E67E22",
  SITE_VISIT_DONE: "#2ECC71",
  NEGOTIATION: colors.brand,
  BOOKING: colors.success,
  LOST: colors.error,
};

const SOURCE_ICONS: Record<string, string> = {
  WALK_IN: "map-pin",
  REFERRAL: "users",
  WEBSITE: "globe",
  AD: "target",
  BROKER: "briefcase",
};

export default function CrmLeads() {
  const router = useRouter();
  const [leads, setLeads] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<string | null>(null);
  const [showAdd, setShowAdd] = React.useState(false);
  const [form, setForm] = React.useState({ full_name: "", phone: "", source: "WALK_IN", notes: "" });
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    const params = filter ? { status: filter } : undefined;
    api.crmLeads(params).then(setLeads).catch(() => {}).finally(() => setLoading(false));
  }, [filter]);

  React.useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.full_name.trim() || !form.phone.trim()) {
      Alert.alert("Required", "Name and phone are required");
      return;
    }
    setSubmitting(true);
    try {
      await api.crmCreateLead(form);
      setShowAdd(false);
      setForm({ full_name: "", phone: "", source: "WALK_IN", notes: "" });
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
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
          <Text style={styles.title}>Leads</Text>
          <Text style={styles.subtitle}>{leads.length} total</Text>
        </View>
        <Pressable
          testID="add-lead-btn"
          style={styles.addBtn}
          onPress={() => setShowAdd(!showAdd)}
        >
          <Feather name={showAdd ? "x" : "plus"} size={20} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.xs }}>
        <Pressable
          style={[styles.chip, !filter && styles.chipActive]}
          onPress={() => setFilter(null)}
        >
          <Text style={[styles.chipTxt, !filter && styles.chipTxtActive]}>All</Text>
        </Pressable>
        {Object.keys(STATUS_COLORS).map((s) => (
          <Pressable
            key={s}
            style={[styles.chip, filter === s && styles.chipActive]}
            onPress={() => setFilter(filter === s ? null : s)}
          >
            <Text style={[styles.chipTxt, filter === s && styles.chipTxtActive]}>
              {s.replace(/_/g, " ")}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Add form */}
      {showAdd && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>New Lead</Text>
          <TextInput
            style={styles.input} placeholder="Full Name *" placeholderTextColor={colors.muted}
            value={form.full_name} onChangeText={(v) => setForm({ ...form, full_name: v })}
          />
          <TextInput
            style={styles.input} placeholder="Phone *" placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })}
          />
          <TextInput
            style={styles.input} placeholder="Notes" placeholderTextColor={colors.muted}
            value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })}
          />
          <View style={styles.sourceRow}>
            {["WALK_IN", "REFERRAL", "WEBSITE", "AD", "BROKER"].map((s) => (
              <Pressable
                key={s}
                style={[styles.sourceChip, form.source === s && styles.sourceChipActive]}
                onPress={() => setForm({ ...form, source: s })}
              >
                <Feather name={SOURCE_ICONS[s] as any} size={14} color={form.source === s ? colors.onBrandPrimary : colors.muted} />
                <Text style={[styles.sourceChipTxt, form.source === s && { color: colors.onBrandPrimary }]}>{s.replace(/_/g, " ")}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.submitBtn} onPress={handleCreate} disabled={submitting}>
            <Text style={styles.submitTxt}>{submitting ? "Saving…" : "Create Lead"}</Text>
          </Pressable>
        </View>
      )}

      {/* Lead list */}
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {loading && <Text style={styles.muted}>Loading…</Text>}
        {!loading && leads.length === 0 && <Text style={styles.muted}>No leads found</Text>}
        {leads.map((lead) => (
          <Pressable
            key={lead.id}
            style={styles.card}
            testID={`lead-${lead.id}`}
            onPress={() => router.push(`/crm/lead/${lead.id}` as any)}
          >
            <View style={styles.cardTop}>
              <Feather name={SOURCE_ICONS[lead.source] as any || "user"} size={16} color={colors.brand} />
              <Text style={styles.cardName}>{lead.full_name}</Text>
              <View style={[styles.statusPill, { backgroundColor: (STATUS_COLORS[lead.status] || colors.muted) + "22" }]}>
                <Text style={[styles.statusTxt, { color: STATUS_COLORS[lead.status] || colors.muted }]}>
                  {lead.status.replace(/_/g, " ")}
                </Text>
              </View>
            </View>
            <Text style={styles.cardPhone}>{lead.phone}</Text>
            {lead.interested_elevation && (
              <Text style={styles.cardMeta}>
                {lead.interested_elevation} · {lead.budget_range_inr || "—"}
              </Text>
            )}
          </Pressable>
        ))}
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
  chips: { maxHeight: 44, marginBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontSize: 11, letterSpacing: 1, color: colors.muted, fontWeight: "600" },
  chipTxtActive: { color: colors.onBrandPrimary },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg,
    padding: spacing.lg, marginBottom: spacing.sm, ...shadow.card,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardName: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.onSurface },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.pill },
  statusTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  cardPhone: { color: colors.muted, fontSize: 13, marginTop: 4 },
  cardMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  formCard: {
    backgroundColor: colors.surfaceSecondary, margin: spacing.lg, borderRadius: radii.lg,
    padding: spacing.lg, ...shadow.card,
  },
  formTitle: { fontWeight: "700", fontSize: 16, color: colors.onSurface, marginBottom: spacing.md },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14,
    color: colors.onSurface, marginBottom: spacing.sm,
  },
  sourceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.md },
  sourceChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.border,
  },
  sourceChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  sourceChipTxt: { fontSize: 10, letterSpacing: 0.5, color: colors.muted, fontWeight: "600" },
  submitBtn: { backgroundColor: colors.brand, borderRadius: radii.md, padding: spacing.md, alignItems: "center" },
  submitTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 14 },
});
