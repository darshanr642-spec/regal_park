import React from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, font, formatINR, radii, shadow, spacing } from "@/src/lib/theme";
import { Watermark } from "@/src/components/Watermark";
import { api } from "@/src/lib/api";

export default function CrmQuotation() {
  const router = useRouter();
  const [leads, setLeads] = React.useState<any[]>([]);
  const [plots, setPlots] = React.useState<any[]>([]);
  const [pricing, setPricing] = React.useState<any[]>([]);
  const [quotations, setQuotations] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState<"create" | "history">("create");

  const [selectedLead, setSelectedLead] = React.useState("");
  const [selectedPlots, setSelectedPlots] = React.useState<number[]>([]);
  const [validUntil, setValidUntil] = React.useState("2026-08-01");
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [l, p, pr, q] = await Promise.all([
        api.crmLeads(), api.plots(), api.crmPricing(), api.crmQuotations(),
      ]);
      setLeads(l); setPlots(p); setPricing(pr); setQuotations(q);
    } catch { }
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const getPrice = (plotNo: number) => {
    const plot = plots.find((p) => p.plot_no === plotNo);
    if (!plot) return null;
    const elev = plot.elevation_type || plot.villa_type || "Elora";
    const pr = pricing.find((p) => p.elevation_type === elev);
    if (!pr) return null;
    const dim = plot.dimension_ft || "40 x 50";
    const parts = dim.split("x").map((s: string) => parseFloat(s.trim()));
    const sqft = parts.length === 2 ? parts[0] * parts[1] : 2000;
    let premium = plot.premium_pct || 0;
    for (const zone of pr.premium_zones || []) {
      if (plotNo >= zone.plot_range_start && plotNo <= zone.plot_range_end) {
        premium = Math.max(premium, zone.premium_pct);
      }
    }
    const base = pr.base_price_per_sqft_inr * sqft;
    const quoted = base * (1 + premium / 100);
    return { elevation: elev, base_price_inr: Math.round(base), premium_pct: premium, quoted_price_inr: Math.round(quoted) };
  };

  const togglePlot = (plotNo: number) => {
    setSelectedPlots((prev) =>
      prev.includes(plotNo) ? prev.filter((n) => n !== plotNo) : [...prev, plotNo],
    );
  };

  const quotationPlots = selectedPlots.map((no) => {
    const p = getPrice(no);
    return p ? { plot_no: no, ...p } : null;
  }).filter(Boolean) as any[];

  const total = quotationPlots.reduce((sum: number, p: any) => sum + p.quoted_price_inr, 0);

  const handleSubmit = async () => {
    if (!selectedLead || quotationPlots.length === 0) {
      Alert.alert("Required", "Select a lead and at least one plot");
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.crmCreateQuotation({
        lead_id: selectedLead,
        plots: quotationPlots,
        valid_until: validUntil,
      });
      Alert.alert("Quotation Created", `Total: ${formatINR(total)}\nPDF ready for download.`);
      setSelectedLead("");
      setSelectedPlots([]);
      load(); // Refresh quotation list
      setTab("history");
    } catch (e: any) { Alert.alert("Error", e.message); }
    setSubmitting(false);
  };

  const handleDownloadPdf = async (quoteId: string) => {
    try {
      const url = await api.crmQuotationPdfUrl(quoteId);
      Linking.openURL(url);
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const availablePlots = plots.filter((p) => {
    const ss = p.sales_status || p.status;
    return ss === "AVAILABLE" || ss === "RESERVED";
  });

  const getLeadName = (leadId: string) => leads.find((l) => l.id === leadId)?.full_name || "Unknown";

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Quotations</Text>
          <Text style={styles.subtitle}>Generate & download</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <Pressable style={[styles.tabBtn, tab === "create" && styles.tabActive]} onPress={() => setTab("create")}>
          <Feather name="edit-2" size={14} color={tab === "create" ? colors.brand : colors.muted} />
          <Text style={[styles.tabTxt, tab === "create" && styles.tabTxtActive]}>New</Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, tab === "history" && styles.tabActive]} onPress={() => setTab("history")}>
          <Feather name="clock" size={14} color={tab === "history" ? colors.brand : colors.muted} />
          <Text style={[styles.tabTxt, tab === "history" && styles.tabTxtActive]}>History ({quotations.length})</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {loading && <Text style={styles.muted}>Loading…</Text>}

        {tab === "create" && !loading && (
          <>
            {/* Lead selector */}
            <Text style={styles.sectionHead}>SELECT LEAD</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs, marginBottom: spacing.lg }}>
              {leads.filter((l) => l.status !== "BOOKING" && l.status !== "LOST").map((l) => (
                <Pressable
                  key={l.id}
                  style={[styles.chip, selectedLead === l.id && styles.chipActive]}
                  onPress={() => setSelectedLead(l.id)}
                >
                  <Text style={[styles.chipTxt, selectedLead === l.id && { color: colors.onBrandPrimary }]}>
                    {l.full_name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Plot grid */}
            <Text style={styles.sectionHead}>SELECT PLOTS ({selectedPlots.length} selected)</Text>
            <View style={styles.plotGrid}>
              {availablePlots.slice(0, 60).map((p) => {
                const selected = selectedPlots.includes(p.plot_no);
                return (
                  <Pressable
                    key={p.plot_no}
                    style={[styles.plotCell, selected && styles.plotCellSelected]}
                    onPress={() => togglePlot(p.plot_no)}
                  >
                    <Text style={[styles.plotNo, selected && { color: colors.onBrandPrimary }]}>
                      {p.plot_no}
                    </Text>
                    <Text style={[styles.plotElev, selected && { color: colors.onBrandPrimary }]}>
                      {(p.elevation_type || p.villa_type || "—")[0]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Summary */}
            {quotationPlots.length > 0 && (
              <>
                <Text style={styles.sectionHead}>QUOTATION SUMMARY</Text>
                <View style={styles.card}>
                  {quotationPlots.map((qp: any) => (
                    <View key={qp.plot_no} style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Plot #{qp.plot_no} ({qp.elevation})</Text>
                      <Text style={styles.summaryValue}>{formatINR(qp.quoted_price_inr)}</Text>
                    </View>
                  ))}
                  <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.sm }]}>
                    <Text style={[styles.summaryLabel, { fontWeight: "700", fontSize: 15 }]}>Total</Text>
                    <Text style={[styles.summaryValue, { fontWeight: "700", fontSize: 18, color: colors.brand }]}>{formatINR(total)}</Text>
                  </View>
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Valid until (YYYY-MM-DD)"
                  placeholderTextColor={colors.muted}
                  value={validUntil}
                  onChangeText={setValidUntil}
                />

                <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
                  <Feather name="file-text" size={18} color={colors.onBrandPrimary} />
                  <Text style={styles.submitTxt}>{submitting ? "Creating…" : "Generate Quotation + PDF"}</Text>
                </Pressable>
              </>
            )}
          </>
        )}

        {tab === "history" && !loading && (
          <>
            {quotations.length === 0 && <Text style={styles.muted}>No quotations yet</Text>}
            {quotations.map((q) => (
              <View key={q.id} style={styles.historyCard}>
                <View style={styles.historyTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyName}>{getLeadName(q.lead_id)}</Text>
                    <Text style={styles.historyMeta}>
                      {q.plots?.length || 0} plot(s) · Valid until {q.valid_until}
                    </Text>
                    <Text style={styles.historyMeta}>By {q.generated_by} · {q.created_at?.slice(0, 10)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.historyTotal}>{formatINR(q.total_value_inr)}</Text>
                  </View>
                </View>

                {/* Plot details */}
                {q.plots?.map((p: any) => (
                  <View key={p.plot_no} style={styles.historyPlotRow}>
                    <Text style={styles.historyPlotTxt}>Plot #{p.plot_no} · {p.elevation}</Text>
                    <Text style={styles.historyPlotPrice}>{formatINR(p.quoted_price_inr)}</Text>
                  </View>
                ))}

                {/* PDF download */}
                <Pressable style={styles.pdfBtn} onPress={() => handleDownloadPdf(q.id)}>
                  <Feather name="download" size={16} color={colors.onBrandPrimary} />
                  <Text style={styles.pdfBtnTxt}>Download PDF</Text>
                </Pressable>
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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  backBtn: { padding: spacing.sm, marginRight: spacing.sm },
  title: { fontFamily: font.display, fontSize: 22, fontWeight: "700", color: colors.onSurface },
  subtitle: { color: colors.muted, fontSize: 12, letterSpacing: 1 },
  muted: { color: colors.muted, fontSize: 14, textAlign: "center", marginTop: spacing.xl },

  tabRow: { flexDirection: "row", paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  tabBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  tabActive: { borderColor: colors.brand, backgroundColor: colors.brand + "11" },
  tabTxt: { fontSize: 12, fontWeight: "600", color: colors.muted },
  tabTxtActive: { color: colors.brand },

  sectionHead: { fontSize: 11, fontWeight: "700", letterSpacing: 2, color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  plotGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  plotCell: {
    width: 56, height: 56, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary,
  },
  plotCellSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  plotNo: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  plotElev: { fontSize: 9, color: colors.muted, marginTop: 1 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: spacing.lg, ...shadow.card },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  summaryLabel: { fontSize: 13, color: colors.onSurface },
  summaryValue: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14, color: colors.onSurface, marginTop: spacing.md, marginBottom: spacing.md },
  submitBtn: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.brand, borderRadius: radii.md, padding: spacing.lg, alignItems: "center", justifyContent: "center" },
  submitTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },

  // History
  historyCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  historyTop: { flexDirection: "row", marginBottom: spacing.sm },
  historyName: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  historyMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  historyTotal: { fontSize: 18, fontWeight: "700", color: colors.brand },
  historyPlotRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  historyPlotTxt: { fontSize: 12, color: colors.onSurface },
  historyPlotPrice: { fontSize: 12, fontWeight: "600", color: colors.onSurface },
  pdfBtn: { flexDirection: "row", gap: 6, backgroundColor: colors.brand, borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  pdfBtnTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 13 },
});
