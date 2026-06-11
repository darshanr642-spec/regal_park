import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useProject } from "@/src/lib/project";
import { Watermark } from "@/src/components/Watermark";
import { colors, font, formatINR, radii, shadow, spacing, statusColor } from "@/src/lib/theme";

type Tab = "ORDERS" | "MATERIALS";

const PO_REQUEST_ROLES = ["ADMIN", "PROJECT_DIRECTOR", "PROJECT_MANAGER", "SITE_ENGINEER", "PROCUREMENT_MANAGER"];

const ACTIONS: Record<string, { action: string; label: string; roles: string[]; danger?: boolean }[]> = {
  REQUESTED: [
    { action: "approve", label: "APPROVE", roles: ["ADMIN", "PROJECT_DIRECTOR", "PROJECT_MANAGER"] },
    { action: "cancel", label: "CANCEL", roles: ["ADMIN", "PROJECT_DIRECTOR"], danger: true },
  ],
  APPROVED: [
    { action: "order", label: "MARK ORDERED", roles: ["ADMIN", "PROCUREMENT_MANAGER"] },
    { action: "cancel", label: "CANCEL", roles: ["ADMIN", "PROJECT_DIRECTOR"], danger: true },
  ],
  ORDERED: [
    { action: "deliver", label: "MARK DELIVERED", roles: ["ADMIN", "PROCUREMENT_MANAGER", "SITE_ENGINEER", "STORE_KEEPER"] },
    { action: "cancel", label: "CANCEL", roles: ["ADMIN", "PROJECT_DIRECTOR"], danger: true },
  ],
};

const STEPS = ["REQUESTED", "APPROVED", "ORDERED", "DELIVERED"];

const EMPTY_FORM = { material_name: "", vendor: "", quantity: "", unit: "nos", rate_inr: "", expected_delivery: "", notes: "" };

export default function Procurement() {
  const router = useRouter();
  const { user } = useAuth();
  const { current: project, projects, setCurrent } = useProject();
  const [tab, setTab] = useState<Tab>("ORDERS");
  const [orders, setOrders] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const role = user?.role || "";
  const canRequest = PO_REQUEST_ROLES.includes(role);

  const load = useCallback(async () => {
    if (!project) { setLoading(false); return; }
    try {
      const [po, mats] = await Promise.all([
        api.purchaseOrders(project.id).catch(() => []),
        api.materials(project.id).catch(() => []),
      ]);
      setOrders(po);
      setMaterials(mats);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [project]);

  useEffect(() => { load(); }, [load]);

  const submitPO = async () => {
    if (!project) return;
    setErr(null);
    const qty = parseFloat(form.quantity);
    const rate = parseFloat(form.rate_inr);
    if (!form.material_name || !form.vendor || !qty || !rate) {
      setErr("Material, vendor, quantity and rate are required.");
      return;
    }
    try {
      const created = await api.createPurchaseOrder({
        project_id: project.id,
        material_name: form.material_name,
        vendor: form.vendor,
        quantity: qty,
        unit: form.unit || "nos",
        rate_inr: rate,
        expected_delivery: form.expected_delivery || null,
        notes: form.notes || null,
      });
      setOrders([created, ...orders]);
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
    } catch (e: any) {
      setErr(e.message || "Failed to raise PO");
    }
  };

  const doTransition = async (po: any, action: string) => {
    setBusyId(po.id);
    try {
      const updated = await api.transitionPurchaseOrder(po.id, action);
      setOrders(orders.map((o) => (o.id === po.id ? updated : o)));
    } catch {}
    finally { setBusyId(null); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Pressable testID="back-button" onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Procurement</Text>
          {project && <Text style={styles.sub}>{project.name}</Text>}
        </View>
      </View>

      {projects.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {projects.map((p) => (
            <Pressable
              key={p.id}
              testID={`procurement-project-chip-${p.id}`}
              style={[styles.chip, project?.id === p.id && styles.chipActive]}
              onPress={() => setCurrent(p)}
            >
              <Text style={[styles.chipText, project?.id === p.id && styles.chipTextActive]}>{p.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.segment}>
        {(["ORDERS", "MATERIALS"] as Tab[]).map((t) => (
          <Pressable key={t} testID={`procurement-tab-${t.toLowerCase()}`} style={[styles.segItem, tab === t && styles.segActive]} onPress={() => setTab(t)}>
            <Text style={[styles.segText, tab === t && styles.segTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {tab === "ORDERS" && (
          <>
            {canRequest && !showForm && (
              <Pressable testID="raise-po-button" style={styles.cta} onPress={() => setShowForm(true)}>
                <Feather name="plus-circle" size={16} color={colors.brandSecondary} />
                <Text style={styles.ctaText}>RAISE PURCHASE ORDER</Text>
              </Pressable>
            )}

            {showForm && (
              <View style={styles.formCard} testID="po-form">
                <Text style={styles.formTitle}>New Purchase Order</Text>
                {([
                  ["Material / item", "material_name"],
                  ["Vendor", "vendor"],
                  ["Quantity", "quantity"],
                  ["Unit (nos / sqft / kg…)", "unit"],
                  ["Rate (INR)", "rate_inr"],
                  ["Expected delivery (YYYY-MM-DD)", "expected_delivery"],
                  ["Notes", "notes"],
                ] as const).map(([label, key]) => (
                  <View key={key} style={{ marginTop: spacing.md }}>
                    <Text style={styles.label}>{label}</Text>
                    <TextInput
                      testID={`po-input-${key}`}
                      style={styles.input}
                      keyboardType={key === "quantity" || key === "rate_inr" ? "decimal-pad" : "default"}
                      value={(form as any)[key]}
                      onChangeText={(v) => setForm({ ...form, [key]: v })}
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                ))}
                {err ? <Text style={styles.errTxt}>{err}</Text> : null}
                <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
                  <Pressable style={[styles.cta, { flex: 1, backgroundColor: colors.surfaceTertiary, marginBottom: 0 }]} onPress={() => { setShowForm(false); setErr(null); }}>
                    <Text style={[styles.ctaText, { color: colors.onSurface }]}>CANCEL</Text>
                  </Pressable>
                  <Pressable testID="po-submit" style={[styles.cta, { flex: 1, marginBottom: 0 }]} onPress={submitPO}>
                    <Text style={styles.ctaText}>SUBMIT</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {orders.length === 0 && <Text style={styles.emptyTxt}>No purchase orders yet for this project.</Text>}

            {orders.map((po) => {
              const stepIdx = STEPS.indexOf(po.status);
              const actions = (ACTIONS[po.status] || []).filter((a) => a.roles.includes(role));
              const last = po.history?.[po.history.length - 1];
              return (
                <View key={po.id} style={styles.card} testID={`po-${po.id}`}>
                  <View style={styles.cardHead}>
                    <Text style={styles.poNumber}>{po.po_number}</Text>
                    <View style={[styles.statusPill, { borderColor: statusColor(po.status) }]}>
                      <Text style={[styles.statusPillText, { color: statusColor(po.status) }]}>{po.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.itemDesc}>{po.material_name}</Text>
                  <Text style={styles.cardMeta}>{po.vendor}{po.expected_delivery ? ` · ETA ${po.expected_delivery}` : ""}</Text>

                  {/* Lifecycle stepper */}
                  {po.status !== "CANCELLED" && (
                    <View style={styles.stepper}>
                      {STEPS.map((s, i) => (
                        <React.Fragment key={s}>
                          <View style={[styles.stepDot, i <= stepIdx && { backgroundColor: colors.brandSecondary, borderColor: colors.brandSecondary }]} />
                          {i < STEPS.length - 1 && <View style={[styles.stepLine, i < stepIdx && { backgroundColor: colors.brandSecondary }]} />}
                        </React.Fragment>
                      ))}
                    </View>
                  )}

                  <View style={styles.cardKvs}>
                    <View style={styles.kv}><Text style={styles.kvLbl}>QTY</Text><Text style={styles.kvVal}>{po.quantity} {po.unit}</Text></View>
                    <View style={styles.kv}><Text style={styles.kvLbl}>RATE</Text><Text style={styles.kvVal}>{formatINR(po.rate_inr)}</Text></View>
                    <View style={styles.kv}><Text style={styles.kvLbl}>TOTAL</Text><Text style={[styles.kvVal, { fontWeight: "700" }]}>{formatINR(po.total_inr)}</Text></View>
                    <View style={styles.kv}><Text style={styles.kvLbl}>RAISED BY</Text><Text style={styles.kvVal}>{po.requested_by}</Text></View>
                  </View>

                  {last && (
                    <Text style={styles.metaTxt}>
                      Last: {last.status} by {last.by}{last.note ? ` — ${last.note}` : ""}
                    </Text>
                  )}

                  {actions.length > 0 && (
                    <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                      {actions.map((a) => (
                        <Pressable
                          key={a.action}
                          testID={`po-${a.action}-${po.id}`}
                          onPress={() => doTransition(po, a.action)}
                          disabled={busyId === po.id}
                          style={[styles.actionBtn, a.danger && { borderColor: colors.error }]}
                        >
                          {busyId === po.id ? (
                            <ActivityIndicator size="small" color={colors.brand} />
                          ) : (
                            <Text style={[styles.actionTxt, a.danger && { color: colors.error }]}>{a.label}</Text>
                          )}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        {tab === "MATERIALS" && materials.map((m) => {
          const pct = m.required_qty ? Math.round((m.received_qty / m.required_qty) * 100) : 0;
          return (
            <View key={m.id} style={styles.card} testID={`material-${m.id}`}>
              <View style={styles.cardHead}>
                <Text style={styles.itemDesc}>{m.name}</Text>
                <View style={[styles.statusPill, { borderColor: statusColor(m.payment_status) }]}>
                  <Text style={[styles.statusPillText, { color: statusColor(m.payment_status) }]}>{m.payment_status}</Text>
                </View>
              </View>
              <Text style={styles.cardMeta}>{m.supplier} · PO {m.po_number}</Text>
              <View style={styles.cardKvs}>
                <View style={styles.kv}><Text style={styles.kvLbl}>REQUIRED</Text><Text style={styles.kvVal}>{m.required_qty} {m.unit}</Text></View>
                <View style={styles.kv}><Text style={styles.kvLbl}>RECEIVED</Text><Text style={styles.kvVal}>{m.received_qty} {m.unit}</Text></View>
                <View style={styles.kv}><Text style={styles.kvLbl}>DELIVERY</Text><Text style={styles.kvVal}>{m.delivery_date}</Text></View>
                <View style={styles.kv}><Text style={styles.kvLbl}>FULFILLED</Text><Text style={styles.kvVal}>{pct}%</Text></View>
              </View>
              <View style={styles.bar}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>
            </View>
          );
        })}
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
  segment: { flexDirection: "row", marginHorizontal: spacing.lg, backgroundColor: colors.surfaceTertiary, borderRadius: radii.md, padding: 4, marginBottom: spacing.sm },
  segItem: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", borderRadius: radii.sm },
  segActive: { backgroundColor: colors.surfaceInverse },
  segText: { fontSize: 11, letterSpacing: 1.5, color: colors.muted, fontWeight: "600" },
  segTextActive: { color: colors.brandSecondary },

  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  poNumber: { fontSize: 11, letterSpacing: 1.5, color: colors.brand, fontWeight: "700" },
  itemDesc: { fontSize: 14, color: colors.onSurface, fontWeight: "600", paddingRight: spacing.sm },
  cardMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  metaTxt: { color: colors.muted, fontSize: 11, marginTop: spacing.sm, fontStyle: "italic" },
  cardKvs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  kv: { flexBasis: "45%", flexGrow: 1 },
  kvLbl: { color: colors.muted, fontSize: 9, letterSpacing: 1.2 },
  kvVal: { color: colors.onSurface, fontSize: 13, marginTop: 2 },
  bar: { marginTop: spacing.sm, height: 4, borderRadius: 2, backgroundColor: colors.border },
  barFill: { height: 4, borderRadius: 2, backgroundColor: colors.brandSecondary },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, borderWidth: 1 },
  statusPillText: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },

  stepper: { flexDirection: "row", alignItems: "center", marginTop: spacing.md },
  stepDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  stepLine: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 2 },

  cta: { flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceInverse, padding: spacing.lg, borderRadius: radii.md, marginBottom: spacing.lg },
  ctaText: { color: colors.brandSecondary, letterSpacing: 2, fontSize: 12, fontWeight: "600" },
  actionBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radii.pill },
  actionTxt: { color: colors.brand, fontSize: 10, letterSpacing: 1.2, fontWeight: "700" },

  formCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  formTitle: { fontFamily: font.display, fontSize: 18, color: colors.onSurface, marginBottom: spacing.sm },
  label: { fontSize: 10, color: colors.muted, letterSpacing: 1.5, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, padding: spacing.md, fontSize: 14, color: colors.onSurface, backgroundColor: colors.surface },
  errTxt: { color: colors.error, fontSize: 12, marginTop: spacing.md },
  emptyTxt: { color: colors.muted, fontSize: 13, textAlign: "center", paddingVertical: spacing.xl, fontStyle: "italic" },
});
