import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, font, formatINR, radii, shadow, spacing } from "@/src/lib/theme";
import { Watermark } from "@/src/components/Watermark";
import { api } from "@/src/lib/api";

export default function CrmPricing() {
  const router = useRouter();
  const [pricing, setPricing] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showAdd, setShowAdd] = React.useState(false);
  const [form, setForm] = React.useState({
    elevation_type: "", base_price_inr: "", base_price_per_sqft_inr: "",
    premium_pct: "0", valid_from: "2026-01-01", status: "ACTIVE",
  });
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setPricing(await api.crmPricing()); } catch { }
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!form.elevation_type || !form.base_price_per_sqft_inr) {
      Alert.alert("Required", "Elevation type and base price per sqft are required");
      return;
    }
    setSubmitting(true);
    try {
      await api.crmUpsertPricing({
        elevation_type: form.elevation_type,
        base_price_inr: parseFloat(form.base_price_inr) || 0,
        base_price_per_sqft_inr: parseFloat(form.base_price_per_sqft_inr),
        premium_pct: parseFloat(form.premium_pct) || 0,
        premium_zones: [],
        valid_from: form.valid_from,
        status: form.status,
      });
      setShowAdd(false);
      setForm({ elevation_type: "", base_price_inr: "", base_price_per_sqft_inr: "", premium_pct: "0", valid_from: "2026-01-01", status: "ACTIVE" });
      load();
    } catch (e: any) { Alert.alert("Error", e.message); }
    setSubmitting(false);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Pricing</Text>
          <Text style={styles.subtitle}>Elevation base rates</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => setShowAdd(!showAdd)}>
          <Feather name={showAdd ? "x" : "edit-2"} size={18} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      {showAdd && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Update Pricing</Text>
          <Text style={styles.label}>Elevation Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs, marginBottom: spacing.sm }}>
            {["Elora", "Selora", "Avira", "Riora"].map((e) => (
              <Pressable
                key={e}
                style={[styles.chip, form.elevation_type === e && styles.chipActive]}
                onPress={() => setForm({ ...form, elevation_type: e })}
              >
                <Text style={[styles.chipTxt, form.elevation_type === e && { color: colors.onBrandPrimary }]}>{e}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput
            style={styles.input} placeholder="Base Price per sqft (₹) *" placeholderTextColor={colors.muted}
            keyboardType="numeric"
            value={form.base_price_per_sqft_inr} onChangeText={(v) => setForm({ ...form, base_price_per_sqft_inr: v })}
          />
          <TextInput
            style={styles.input} placeholder="Base Price Total (₹)" placeholderTextColor={colors.muted}
            keyboardType="numeric"
            value={form.base_price_inr} onChangeText={(v) => setForm({ ...form, base_price_inr: v })}
          />
          <TextInput
            style={styles.input} placeholder="Premium %" placeholderTextColor={colors.muted}
            keyboardType="numeric"
            value={form.premium_pct} onChangeText={(v) => setForm({ ...form, premium_pct: v })}
          />
          <TextInput
            style={styles.input} placeholder="Valid From (YYYY-MM-DD)" placeholderTextColor={colors.muted}
            value={form.valid_from} onChangeText={(v) => setForm({ ...form, valid_from: v })}
          />
          <Text style={styles.label}>Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs, marginBottom: spacing.md }}>
            {["ACTIVE", "DRAFT"].map((s) => (
              <Pressable
                key={s}
                style={[styles.chip, form.status === s && styles.chipActive]}
                onPress={() => setForm({ ...form, status: s })}
              >
                <Text style={[styles.chipTxt, form.status === s && { color: colors.onBrandPrimary }]}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
            <Text style={styles.submitTxt}>{submitting ? "Saving…" : "Save Pricing"}</Text>
          </Pressable>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {loading && <Text style={styles.muted}>Loading…</Text>}
        {!loading && pricing.length === 0 && <Text style={styles.muted}>No pricing configured</Text>}
        {pricing.map((p) => (
          <View key={p.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.elevBadge}>
                <Text style={styles.elevTxt}>{p.elevation_type[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{p.elevation_type}</Text>
                <Text style={styles.cardSub}>Since {p.valid_from}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: p.status === "ACTIVE" ? colors.success + "22" : colors.muted + "22" }]}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: p.status === "ACTIVE" ? colors.success : colors.muted }}>{p.status}</Text>
              </View>
            </View>

            {/* Price details */}
            <View style={styles.priceRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.priceLabel}>Per Sqft</Text>
                <Text style={styles.priceValue}>{formatINR(p.base_price_per_sqft_inr)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.priceLabel}>Base Price</Text>
                <Text style={styles.priceValue}>{p.base_price_inr ? formatINR(p.base_price_inr) : "—"}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.priceLabel}>Premium</Text>
                <Text style={[styles.priceValue, p.premium_pct > 0 && { color: colors.error }]}>
                  {p.premium_pct > 0 ? `+${p.premium_pct}%` : "—"}
                </Text>
              </View>
            </View>

            {p.premium_zones?.length > 0 && (
              <View style={styles.premiumSection}>
                <Text style={styles.premiumHead}>Premium Zones</Text>
                {p.premium_zones.map((z: any, i: number) => (
                  <Text key={i} style={styles.premiumItem}>
                    Plots {z.plot_range_start}–{z.plot_range_end}: +{z.premium_pct}%
                  </Text>
                ))}
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
  formCard: { backgroundColor: colors.surfaceSecondary, margin: spacing.lg, borderRadius: radii.lg, padding: spacing.lg, ...shadow.card },
  formTitle: { fontWeight: "700", fontSize: 16, color: colors.onSurface, marginBottom: spacing.md },
  label: { fontSize: 11, color: colors.muted, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14, color: colors.onSurface, marginBottom: spacing.sm },
  submitBtn: { backgroundColor: colors.brand, borderRadius: radii.md, padding: spacing.md, alignItems: "center" },
  submitTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 14 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadow.card },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  elevBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand + "22", alignItems: "center", justifyContent: "center" },
  elevTxt: { fontSize: 20, fontWeight: "700", color: colors.brand },
  cardName: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  cardSub: { fontSize: 12, color: colors.muted },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.pill },
  priceRow: { flexDirection: "row", marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  priceLabel: { fontSize: 10, color: colors.muted, letterSpacing: 1, marginBottom: 2 },
  priceValue: { fontSize: 15, fontWeight: "700", color: colors.brand },
  premiumSection: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  premiumHead: { fontSize: 11, fontWeight: "700", color: colors.muted, letterSpacing: 1, marginBottom: 4 },
  premiumItem: { fontSize: 12, color: colors.onSurface, paddingVertical: 1 },
});
