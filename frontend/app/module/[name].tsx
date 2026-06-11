import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, downloadReportPdf, API_BASE, getToken, fileUri } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useProject } from "@/src/lib/project";
import { pickDocument } from "@/src/lib/uploads";
import { Watermark } from "@/src/components/Watermark";
import { colors, font, formatINR, radii, shadow, spacing, statusColor } from "@/src/lib/theme";

// NOTE: procurement & approvals have dedicated screens (procurement.tsx / approvals.tsx)
const TITLES: Record<string, string> = {
  boq: "BOQ & Cost Control",
  billing: "Contractor Billing",
  team: "Team & Responsibility",
  documents: "Documents & Drawings",
  reports: "PDF Reports",
  client: "Client Portal View",
};

const REPORT_KINDS = [
  { kind: "progress", label: "Project Progress Report", desc: "Stage-by-stage progress with planned dates", icon: "trending-up" },
  { kind: "cost", label: "Cost Report", desc: "Budget vs actual spend by line item", icon: "pie-chart" },
  { kind: "delay", label: "Delay Report", desc: "Delayed and in-progress stages with reasons", icon: "alert-triangle" },
  { kind: "safety", label: "Safety & Quality Report", desc: "Daily safety + open quality failures", icon: "shield" },
];

export default function Module() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { current: project, projects, setCurrent } = useProject();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [docTotal, setDocTotal] = useState(0);
  const [docHasMore, setDocHasMore] = useState(false);
  const [docLoadingMore, setDocLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const title = TITLES[name as string] || "Module";
  const isClient = user?.role === "CLIENT";

  useEffect(() => {
    if (!project) { setLoading(false); return; }
    setLoading(true);
    if (name === "documents") {
      api.documents(project.id, 20, 0)
        .then((res) => { setRows(res.items); setDocTotal(res.total); setDocHasMore(res.has_more); })
        .catch(() => { setRows([]); setDocHasMore(false); })
        .finally(() => { setLoading(false); setRefreshing(false); });
      return;
    }
    const fn =
      name === "boq" ? () => api.boq(project.id) :
      name === "billing" ? () => api.billing(project.id) :
      name === "team" ? () => api.team(project.id) :
      name === "reports" ? () => Promise.resolve([]) :
      name === "client" ? () => api.stages(project.id) :
      () => api.stages(project.id);
    fn().then(setRows).catch(() => setRows([])).finally(() => { setLoading(false); setRefreshing(false); });
  }, [name, project, refreshKey]);

  const loadMoreDocs = async () => {
    if (!project || docLoadingMore || !docHasMore) return;
    setDocLoadingMore(true);
    try {
      const res = await api.documents(project.id, 20, rows.length);
      setRows([...rows, ...res.items]);
      setDocHasMore(res.has_more);
    } finally {
      setDocLoadingMore(false);
    }
  };

  const totals = useMemo(() => {
    if (name === "boq") {
      const budget = rows.reduce((a, r) => a + (r.approved_budget_inr || 0), 0);
      const spent = rows.reduce((a, r) => a + (r.actual_spent_inr || 0), 0);
      return { budget, spent };
    }
    return null;
  }, [rows, name]);

  const openReport = async (kind: string) => {
    if (!project) return;
    setBusyKind(kind);
    try {
      if (Platform.OS === "web") {
        const blob = await downloadReportPdf(kind, project.id);
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
      } else {
        const tok = await getToken();
        const fileUri = `${FileSystem.cacheDirectory}rpv-${kind}-${Date.now()}.pdf`;
        const dl = await FileSystem.downloadAsync(
          `${API_BASE}/api/reports/${kind}?project_id=${project.id}`,
          fileUri,
          { headers: { Authorization: `Bearer ${tok}` } },
        );
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(dl.uri, { mimeType: "application/pdf" });
        } else {
          await Linking.openURL(dl.uri);
        }
      }
    } catch (e) { /* surface as toast in future */ }
    finally { setBusyKind(null); }
  };

  const uploadDoc = async () => {
    if (!project) return;
    try {
      const picked = await pickDocument();
      if (!picked) return;
      const created = await api.createDocument({
        project_id: project.id,
        title: picked.name,
        category: "OTHER",
        file_url: picked.url,
        file_name: picked.name,
      });
      setRows([created, ...rows]);
    } catch {}
  };

  const openDoc = async (d: any) => {
    const url = fileUri(d.file_url);
    if (!url) return;
    if (Platform.OS === "web") {
      window.open(url, "_blank");
      return;
    }
    try {
      const target = `${FileSystem.cacheDirectory}${d.file_name || "document"}`;
      const dl = await FileSystem.downloadAsync(url, target);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dl.uri);
      } else {
        await Linking.openURL(dl.uri);
      }
    } catch {}
  };

  const removeDoc = async (id: string) => {
    try {
      await api.deleteDocument(id);
      setRows(rows.filter((r) => r.id !== id));
    } catch {}
  };

  if (loading && !refreshing) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Pressable testID="back-button" onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {project && <Text style={styles.sub}>{project.name}</Text>}
        </View>
      </View>

      {projects.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {projects.map((p) => (
            <Pressable
              key={p.id}
              testID={`module-project-chip-${p.id}`}
              style={[styles.chip, project?.id === p.id && styles.chipActive]}
              onPress={() => setCurrent(p)}
            >
              <Text style={[styles.chipText, project?.id === p.id && styles.chipTextActive]}>{p.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {name === "boq" && totals && (
        <View style={styles.summary}>
          <View style={styles.summaryBlock}><Text style={styles.sumLbl}>BUDGET</Text><Text style={styles.sumVal}>{formatINR(totals.budget)}</Text></View>
          <View style={styles.summaryBlock}><Text style={styles.sumLbl}>SPENT</Text><Text style={[styles.sumVal, totals.spent > totals.budget && { color: colors.error }]}>{formatINR(totals.spent)}</Text></View>
          <View style={styles.summaryBlock}><Text style={styles.sumLbl}>USED</Text><Text style={styles.sumVal}>{totals.budget ? Math.round((totals.spent / totals.budget) * 100) : 0}%</Text></View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setRefreshKey((k) => k + 1); }} />}
      >
        {/* PDF Reports module */}
        {name === "reports" && REPORT_KINDS.map((r) => (
          <Pressable key={r.kind} testID={`report-${r.kind}`} style={styles.card} onPress={() => openReport(r.kind)} disabled={busyKind !== null}>
            <View style={styles.reportRow}>
              <View style={styles.reportIcon}><Feather name={r.icon as any} size={20} color={colors.brand} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemDesc}>{r.label}</Text>
                <Text style={styles.cardMeta}>{r.desc}</Text>
              </View>
              {busyKind === r.kind ? (
                <ActivityIndicator color={colors.brand} />
              ) : (
                <Feather name="download" size={18} color={colors.brand} />
              )}
            </View>
          </Pressable>
        ))}

        {/* Documents module */}
        {name === "documents" && (
          <>
            {!isClient && (
              <Pressable testID="upload-document" style={styles.uploadBtn} onPress={uploadDoc}>
                <Feather name="upload" size={16} color={colors.brandSecondary} />
                <Text style={styles.uploadTxt}>UPLOAD DRAWING / DOCUMENT</Text>
              </Pressable>
            )}
            {docTotal > 0 && (
              <Text style={styles.paginationCount} testID="documents-count">
                Showing {rows.length} of {docTotal}
              </Text>
            )}
            {rows.length === 0 && (
              <Text style={styles.emptyTxt}>No documents yet for this project.</Text>
            )}
            {rows.map((d) => (
              <View key={d.id} style={styles.card} testID={`doc-${d.id}`}>
                <View style={styles.cardHead}>
                  <Text style={styles.itemDesc}>{d.title}</Text>
                  <View style={[styles.statusPill, { borderColor: colors.brand }]}>
                    <Text style={[styles.statusPillText, { color: colors.brand }]}>{d.revision}</Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>{d.category}{d.drawing_number ? ` · ${d.drawing_number}` : ""}</Text>
                <Text style={styles.metaTxt}>By {d.uploaded_by} · {d.uploaded_at?.slice(0, 10)}</Text>
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                  <Pressable testID={`doc-open-${d.id}`} onPress={() => openDoc(d)} style={styles.docBtn}>
                    <Feather name="external-link" size={12} color={colors.brand} />
                    <Text style={styles.docBtnTxt}>OPEN</Text>
                  </Pressable>
                  {!isClient && (
                    <Pressable testID={`doc-delete-${d.id}`} onPress={() => removeDoc(d.id)} style={[styles.docBtn, { borderColor: colors.error }]}>
                      <Feather name="trash-2" size={12} color={colors.error} />
                      <Text style={[styles.docBtnTxt, { color: colors.error }]}>REMOVE</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
            {docHasMore && (
              <Pressable testID="load-more-docs" onPress={loadMoreDocs} style={styles.loadMoreBtn} disabled={docLoadingMore}>
                {docLoadingMore ? (
                  <ActivityIndicator color={colors.brand} />
                ) : (
                  <Text style={styles.loadMoreTxt}>LOAD MORE</Text>
                )}
              </Pressable>
            )}
          </>
        )}

        {/* BOQ */}
        {name === "boq" && rows.map((b) => (
          <View key={b.id} style={styles.card} testID={`boq-${b.id}`}>
            <View style={styles.cardHead}>
              <Text style={styles.itemDesc}>{b.description}</Text>
              <View style={[styles.statusPill, { borderColor: statusColor(b.payment_status) }]}>
                <Text style={[styles.statusPillText, { color: statusColor(b.payment_status) }]}>{b.payment_status}</Text>
              </View>
            </View>
            <Text style={styles.cardMeta}>{b.category} · {b.vendor}</Text>
            <View style={styles.cardKvs}>
              <View style={styles.kv}><Text style={styles.kvLbl}>QTY</Text><Text style={styles.kvVal}>{b.quantity} {b.unit}</Text></View>
              <View style={styles.kv}><Text style={styles.kvLbl}>RATE</Text><Text style={styles.kvVal}>{formatINR(b.rate_inr)}</Text></View>
              <View style={styles.kv}><Text style={styles.kvLbl}>BUDGET</Text><Text style={styles.kvVal}>{formatINR(b.approved_budget_inr)}</Text></View>
              <View style={styles.kv}><Text style={styles.kvLbl}>SPENT</Text><Text style={[styles.kvVal, b.actual_spent_inr > b.approved_budget_inr && { color: colors.error, fontWeight: "700" }]}>{formatINR(b.actual_spent_inr)}</Text></View>
            </View>
          </View>
        ))}

        {/* Billing */}
        {name === "billing" && rows.map((b) => (
          <View key={b.id} style={styles.card} testID={`bill-${b.id}`}>
            <View style={styles.cardHead}>
              <Text style={styles.itemDesc}>{b.contractor_name}</Text>
              <View style={[styles.statusPill, { borderColor: statusColor(b.payment_status) }]}>
                <Text style={[styles.statusPillText, { color: statusColor(b.payment_status) }]}>{b.payment_status}</Text>
              </View>
            </View>
            <Text style={styles.cardMeta}>{b.work_package} · {b.work_completed_pct}% done</Text>
            <View style={styles.cardKvs}>
              <View style={styles.kv}><Text style={styles.kvLbl}>BOQ VALUE</Text><Text style={styles.kvVal}>{formatINR(b.boq_value_inr)}</Text></View>
              <View style={styles.kv}><Text style={styles.kvLbl}>RA BILL</Text><Text style={styles.kvVal}>{formatINR(b.ra_bill_amount_inr)}</Text></View>
              <View style={styles.kv}><Text style={styles.kvLbl}>RETENTION</Text><Text style={styles.kvVal}>{formatINR(b.retention_inr)}</Text></View>
              <View style={styles.kv}><Text style={styles.kvLbl}>NET PAYABLE</Text><Text style={[styles.kvVal, { color: b.net_payable_inr < 0 ? colors.warning : colors.success, fontWeight: "700" }]}>{formatINR(b.net_payable_inr)}</Text></View>
            </View>
          </View>
        ))}

        {/* Team */}
        {name === "team" && rows.map((m) => (
          <View key={m.id} style={styles.card} testID={`team-${m.id}`}>
            <View style={styles.cardHead}>
              <Text style={styles.itemDesc}>{m.name}</Text>
              <View style={[styles.statusPill, { borderColor: statusColor(m.status) }]}>
                <Text style={[styles.statusPillText, { color: statusColor(m.status) }]}>{m.status}</Text>
              </View>
            </View>
            <Text style={styles.cardMeta}>{m.role} · {m.company}</Text>
            <Text style={styles.bodyTxt}>{m.scope_of_work}</Text>
            <View style={styles.cardKvs}>
              <View style={styles.kv}><Text style={styles.kvLbl}>PHONE</Text><Text style={styles.kvVal}>{m.phone}</Text></View>
              <View style={styles.kv}><Text style={styles.kvLbl}>EMAIL</Text><Text style={[styles.kvVal, { fontSize: 11 }]}>{m.email}</Text></View>
            </View>
          </View>
        ))}

        {/* Approvals */}
        {name === "approvals" && rows.map((a) => (
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

        {/* Client portal */}
        {name === "client" && rows.map((s) => (
          <View key={s.id} style={styles.card} testID={`client-stage-${s.id}`}>
            <View style={styles.cardHead}>
              <Text style={styles.itemDesc}>{s.order}. {s.name}</Text>
              <View style={[styles.statusPill, { borderColor: statusColor(s.status) }]}>
                <Text style={[styles.statusPillText, { color: statusColor(s.status) }]}>{s.status.replace("_", " ")}</Text>
              </View>
            </View>
            <Text style={styles.cardMeta}>{s.planned_start} → {s.planned_end}</Text>
            <View style={styles.bar}><View style={[styles.barFill, { width: `${s.progress_pct}%` }]} /></View>
          </View>
        ))}
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

  summary: { flexDirection: "row", marginHorizontal: spacing.lg, backgroundColor: colors.surfaceInverse, padding: spacing.lg, borderRadius: radii.md, marginBottom: spacing.sm },
  summaryBlock: { flex: 1, alignItems: "center" },
  sumLbl: { color: colors.brandTertiary, fontSize: 9, letterSpacing: 1.5 },
  sumVal: { fontFamily: font.display, color: colors.brandSecondary, fontSize: 16, marginTop: 4 },

  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  itemDesc: { fontSize: 14, color: colors.onSurface, fontWeight: "600", flex: 1, paddingRight: spacing.sm },
  cardMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  bodyTxt: { fontSize: 12, color: colors.onSurface, marginTop: spacing.sm, fontStyle: "italic" },
  cardKvs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  kv: { flexBasis: "45%", flexGrow: 1 },
  kvLbl: { color: colors.muted, fontSize: 9, letterSpacing: 1.2 },
  kvVal: { color: colors.onSurface, fontSize: 13, marginTop: 2 },
  bar: { marginTop: spacing.sm, height: 4, borderRadius: 2, backgroundColor: colors.border },
  barFill: { height: 4, borderRadius: 2, backgroundColor: colors.brandSecondary },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, borderWidth: 1 },
  statusPillText: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  metaTxt: { color: colors.muted, fontSize: 11, marginTop: 2 },

  reportRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  reportIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },

  uploadBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.surfaceInverse, borderRadius: radii.md, marginBottom: spacing.lg },
  uploadTxt: { color: colors.brandSecondary, letterSpacing: 1.5, fontSize: 12, fontWeight: "600" },
  docBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radii.pill },
  docBtnTxt: { color: colors.brand, fontSize: 10, letterSpacing: 1.2, fontWeight: "600" },
  emptyTxt: { color: colors.muted, fontSize: 13, textAlign: "center", paddingVertical: spacing.xl, fontStyle: "italic" },
});
