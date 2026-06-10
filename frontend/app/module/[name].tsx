import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, font, formatINR, radii, shadow, spacing, statusColor } from "@/src/lib/theme";

const TITLES: Record<string, string> = {
  boq: "BOQ & Cost Control",
  procurement: "Procurement",
  billing: "Contractor Billing",
  team: "Team & Responsibility",
  approvals: "Approvals",
  client: "Client Portal",
};

export default function Module() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any>(null);

  const title = TITLES[name as string] || "Module";
  const isClient = user?.role === "CLIENT";

  useEffect(() => {
    const fn =
      name === "boq" ? api.boq :
      name === "procurement" ? api.materials :
      name === "billing" ? api.billing :
      name === "team" ? api.team :
      name === "approvals" ? api.approvals :
      name === "client" ? api.stages :
      api.stages;

    Promise.all([fn(), api.projects()])
      .then(([data, ps]) => { setRows(data); setProject(ps[0]); })
      .finally(() => setLoading(false));
  }, [name]);

  const totals = useMemo(() => {
    if (name === "boq") {
      const budget = rows.reduce((a, r) => a + r.approved_budget_inr, 0);
      const spent = rows.reduce((a, r) => a + r.actual_spent_inr, 0);
      return { budget, spent };
    }
    if (name === "billing") {
      const total = rows.reduce((a, r) => a + r.net_payable_inr, 0);
      return { total };
    }
    return null;
  }, [rows, name]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="back-button" onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {project && <Text style={styles.sub}>{project.name}</Text>}
        </View>
      </View>

      {/* Summary band */}
      {name === "boq" && totals && (
        <View style={styles.summary}>
          <View style={styles.summaryBlock}>
            <Text style={styles.sumLbl}>BUDGET</Text>
            <Text style={styles.sumVal}>{formatINR(totals.budget)}</Text>
          </View>
          <View style={styles.summaryBlock}>
            <Text style={styles.sumLbl}>SPENT</Text>
            <Text style={[styles.sumVal, totals.spent > totals.budget && { color: colors.error }]}>{formatINR(totals.spent)}</Text>
          </View>
          <View style={styles.summaryBlock}>
            <Text style={styles.sumLbl}>USED</Text>
            <Text style={styles.sumVal}>{Math.round((totals.spent / totals.budget) * 100)}%</Text>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
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

        {/* Procurement */}
        {name === "procurement" && rows.map((m) => {
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

        {/* Billing */}
        {name === "billing" && (
          isClient ? (
            <View style={styles.card}>
              <Text style={styles.itemDesc}>Contractor billing details are restricted.</Text>
              <Text style={styles.cardMeta}>Please contact your Project Manager for milestone schedules.</Text>
            </View>
          ) : rows.map((b) => (
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
          ))
        )}

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

        {/* Client portal: read-only stage view, no costs */}
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
});
