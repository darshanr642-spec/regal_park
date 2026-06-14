import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, font, formatINR, radii, shadow, spacing, statusColor } from "@/src/lib/theme";
import { Watermark } from "@/src/components/Watermark";
import { api } from "@/src/lib/api";

export default function CrmBookings() {
  const router = useRouter();
  const [bookings, setBookings] = React.useState<any[]>([]);
  const [leads, setLeads] = React.useState<any[]>([]);
  const [plots, setPlots] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showAdd, setShowAdd] = React.useState(false);
  const [filter, setFilter] = React.useState<string | null>(null);

  // Form state
  const [form, setForm] = React.useState({
    lead_id: "", plot_no: "", elevation_type: "Elora",
    sale_value_inr: "", discount_pct: "0", booking_amount_inr: "",
  });
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [b, l, p] = await Promise.all([
        api.crmBookings(filter || undefined),
        api.crmLeads(),
        api.plots(),
      ]);
      setBookings(b);
      setLeads(l);
      setPlots(p);
    } catch { }
    setLoading(false);
  }, [filter]);

  React.useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.lead_id || !form.plot_no || !form.sale_value_inr || !form.booking_amount_inr) {
      Alert.alert("Required", "Lead, plot, sale value, and booking amount are required");
      return;
    }
    setSubmitting(true);
    try {
      const lead = leads.find((l) => l.id === form.lead_id);
      await api.crmCreateBooking({
        lead_id: form.lead_id,
        plot_no: parseInt(form.plot_no),
        client_name: lead?.full_name || "Unknown",
        elevation_type: form.elevation_type,
        sale_value_inr: parseFloat(form.sale_value_inr),
        discount_pct: parseFloat(form.discount_pct) || 0,
        booking_amount_inr: parseFloat(form.booking_amount_inr),
      });
      setShowAdd(false);
      setForm({ lead_id: "", plot_no: "", elevation_type: "Elora", sale_value_inr: "", discount_pct: "0", booking_amount_inr: "" });
      load();
    } catch (e: any) { Alert.alert("Error", e.message); }
    setSubmitting(false);
  };

  const confirmBooking = async (id: string) => {
    try {
      await api.crmUpdateBooking(id, { status: "CONFIRMED", agreement_date: new Date().toISOString().slice(0, 10) });
      load();
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const cancelBooking = async (id: string) => {
    Alert.alert("Cancel Booking", "Are you sure?", [
      { text: "No" },
      {
        text: "Yes, Cancel", style: "destructive",
        onPress: async () => {
          try {
            await api.crmUpdateBooking(id, { status: "CANCELLED", cancelled_reason: "Cancelled by management" });
            load();
          } catch (e: any) { Alert.alert("Error", e.message); }
        },
      },
    ]);
  };

  const availablePlots = plots.filter((p) => {
    const ss = p.sales_status || p.status;
    return ss === "AVAILABLE" || ss === "RESERVED";
  });

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Bookings</Text>
          <Text style={styles.subtitle}>{bookings.length} total</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => setShowAdd(!showAdd)}>
          <Feather name={showAdd ? "x" : "plus"} size={20} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      {/* Status filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.xs }}>
        {[null, "PROVISIONAL", "APPROVED", "CONFIRMED", "CANCELLED"].map((s) => (
          <Pressable
            key={s || "all"}
            style={[styles.chip, filter === s && styles.chipActive]}
            onPress={() => setFilter(s)}
          >
            <Text style={[styles.chipTxt, filter === s && styles.chipTxtActive]}>
              {s || "All"}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Add form */}
      {showAdd && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>New Booking</Text>

          <Text style={styles.label}>Lead</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs, marginBottom: spacing.sm }}>
            {leads.filter((l) => l.status !== "BOOKING" && l.status !== "LOST").map((l) => (
              <Pressable
                key={l.id}
                style={[styles.leadChip, form.lead_id === l.id && styles.leadChipActive]}
                onPress={() => setForm({ ...form, lead_id: l.id })}
              >
                <Text style={[styles.leadChipTxt, form.lead_id === l.id && { color: colors.onBrandPrimary }]}>{l.full_name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.label}>Plot</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs, marginBottom: spacing.sm }}>
            {availablePlots.slice(0, 30).map((p) => (
              <Pressable
                key={p.plot_no}
                style={[styles.leadChip, form.plot_no === String(p.plot_no) && styles.leadChipActive]}
                onPress={() => setForm({ ...form, plot_no: String(p.plot_no), elevation_type: p.elevation_type || p.villa_type || "Elora" })}
              >
                <Text style={[styles.leadChipTxt, form.plot_no === String(p.plot_no) && { color: colors.onBrandPrimary }]}>#{p.plot_no}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <TextInput
            style={styles.input} placeholder="Sale Value (₹)" placeholderTextColor={colors.muted}
            keyboardType="numeric"
            value={form.sale_value_inr} onChangeText={(v) => setForm({ ...form, sale_value_inr: v })}
          />
          <TextInput
            style={styles.input} placeholder="Discount %" placeholderTextColor={colors.muted}
            keyboardType="numeric"
            value={form.discount_pct} onChangeText={(v) => setForm({ ...form, discount_pct: v })}
          />
          <TextInput
            style={styles.input} placeholder="Booking Amount (₹)" placeholderTextColor={colors.muted}
            keyboardType="numeric"
            value={form.booking_amount_inr} onChangeText={(v) => setForm({ ...form, booking_amount_inr: v })}
          />
          <Pressable style={styles.submitBtn} onPress={handleCreate} disabled={submitting}>
            <Text style={styles.submitTxt}>{submitting ? "Creating…" : "Create Booking"}</Text>
          </Pressable>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {loading && <Text style={styles.muted}>Loading…</Text>}
        {!loading && bookings.length === 0 && <Text style={styles.muted}>No bookings found</Text>}
        {bookings.map((b) => (
          <View key={b.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardPlot}>Plot #{b.plot_no}</Text>
              <View style={[styles.statusPill, { backgroundColor: statusColor(b.status) + "22" }]}>
                <Text style={[styles.statusTxt, { color: statusColor(b.status) }]}>{b.status}</Text>
              </View>
            </View>
            <Text style={styles.cardName}>{b.client_name}</Text>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Value</Text>
              <Text style={styles.cardValue}>{formatINR(b.sale_value_inr)}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Booking Amt</Text>
              <Text style={styles.cardValue}>{formatINR(b.booking_amount_inr)}</Text>
            </View>
            {b.discount_pct > 0 && (
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>Discount</Text>
                <Text style={[styles.cardValue, { color: colors.error }]}>{b.discount_pct}%</Text>
              </View>
            )}
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Elevation</Text>
              <Text style={styles.cardValue}>{b.elevation_type}</Text>
            </View>
            <Text style={styles.cardMeta}>{b.booking_date} · by {b.created_by}</Text>

            {/* Actions */}
            {b.status === "PROVISIONAL" && (
              <View style={styles.actions}>
                <Pressable style={[styles.actionBtn, { backgroundColor: colors.success }]} onPress={() => confirmBooking(b.id)}>
                  <Feather name="check" size={14} color="#fff" />
                  <Text style={styles.actionTxt}>Confirm</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, { backgroundColor: colors.error }]} onPress={() => cancelBooking(b.id)}>
                  <Feather name="x" size={14} color="#fff" />
                  <Text style={styles.actionTxt}>Cancel</Text>
                </Pressable>
              </View>
            )}
          </View>
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
  formCard: { backgroundColor: colors.surfaceSecondary, margin: spacing.lg, borderRadius: radii.lg, padding: spacing.lg, ...shadow.card },
  formTitle: { fontWeight: "700", fontSize: 16, color: colors.onSurface, marginBottom: spacing.md },
  label: { fontSize: 11, color: colors.muted, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  leadChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  leadChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  leadChipTxt: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14, color: colors.onSurface, marginBottom: spacing.sm },
  submitBtn: { backgroundColor: colors.brand, borderRadius: radii.md, padding: spacing.md, alignItems: "center", marginTop: spacing.xs },
  submitTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 14 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadow.card },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  cardPlot: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.pill },
  statusTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  cardName: { fontSize: 14, fontWeight: "600", color: colors.onSurface, marginBottom: spacing.sm },
  cardRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  cardLabel: { fontSize: 12, color: colors.muted },
  cardValue: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  cardMeta: { fontSize: 11, color: colors.muted, marginTop: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md },
  actionTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
