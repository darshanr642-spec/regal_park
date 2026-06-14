import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Watermark } from "@/src/components/Watermark";
import { api } from "@/src/lib/api";

/* ── Executive palette ────────────────────────────────────────────── */
const E = {
  bg: "#0B0D14",
  surface: "#12141E",
  card: "#1A1D2A",
  cardAlt: "#222638",
  gold: "#C5A059",
  goldLight: "#D4AF37",
  goldMuted: "#8A7A55",
  white: "#F0ECE3",
  muted: "#6B6B7B",
  mutedLight: "#8B8B9B",
  green: "#34D399",
  greenDark: "#059669",
  amber: "#FBBF24",
  red: "#F87171",
  blue: "#60A5FA",
  purple: "#A78BFA",
  cyan: "#22D3EE",
  border: "#2A2D3A",
  borderLight: "#3A3D4A",
};

const fmtINR = (n: number) => {
  if (n == null || isNaN(n)) return "₹ —";
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
};

type Tab = "overview" | "construction" | "finance" | "actions";

/* ════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════════ */
export default function CooDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  React.useEffect(() => {
    (async () => {
      try {
        const d = await api.cooCommandCenter();
        setData(d);
      } catch {}
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <Watermark />
        <View style={s.loadingWrap}>
          <Text style={s.loadingTxt}>Loading Command Centre…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const rev = data?.revenue || {};
  const inv = data?.inventory || {};
  const bk = data?.bookings || {};
  const con = data?.construction || {};
  const dl = data?.delayed || {};
  const ap = data?.approvals || {};
  const sn = data?.snags || {};
  const pr = data?.procurement || {};
  const cash = data?.cash || {};
  const upcoming = data?.upcoming_milestones || [];
  const actions = data?.actions || [];
  const leads = data?.leads || {};

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <Watermark />

      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={E.white} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerLabel}>STERLITEE DEVELOPERS</Text>
          <Text style={s.headerTitle}>Command Centre</Text>
        </View>
        <View style={s.liveBadge}>
          <View style={s.liveDot} />
          <Text style={s.liveTxt}>LIVE</Text>
        </View>
      </View>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <View style={s.tabs}>
        {(["overview", "construction", "finance", "actions"] as Tab[]).map((t) => (
          <Pressable key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Feather
              name={t === "overview" ? "grid" : t === "construction" ? "tool" : t === "finance" ? "dollar-sign" : "zap"}
              size={12}
              color={tab === t ? E.gold : E.muted}
            />
            <Text style={[s.tabTxt, tab === t && s.tabTxtActive]}>
              {t === "overview" ? "OVERVIEW" : t === "construction" ? "BUILD" : t === "finance" ? "FINANCE" : "ACTIONS"}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {/* ════════════════════════════════════════════════════════
            OVERVIEW TAB
           ════════════════════════════════════════════════════════ */}
        {tab === "overview" && (
          <>
            {/* ── Hero KPIs ──────────────────────────────────── */}
            <View style={s.heroRow}>
              <HeroKpi
                icon="trending-up" label="Total Revenue"
                value={fmtINR(rev.total_sales_inr)} color={E.gold}
                sub={`${fmtINR(rev.confirmed_inr)} confirmed`}
              />
              <HeroKpi
                icon="check-circle" label="Collection"
                value={`${rev.collection_rate_pct || 0}%`} color={E.green}
                sub={fmtINR(rev.total_collected_inr)}
              />
            </View>

            {/* ── Inventory Status Bar ──────────────────────── */}
            <SectionHeader title="LAND INVENTORY" icon="grid" />
            <View style={s.kpiRow}>
              <MiniKpi label="Total" value={inv.total} color={E.white} />
              <MiniKpi label="Available" value={inv.available} color={E.green} />
              <MiniKpi label="Booked" value={inv.booked} color={E.blue} />
              <MiniKpi label="Sold" value={inv.sold} color={E.goldLight} />
              <MiniKpi label="Under Const." value={inv.under_construction} color={E.purple} />
            </View>

            {/* Absorption bar */}
            <View style={s.barSection}>
              <View style={s.barHeader}>
                <Text style={s.barLabel}>Absorption Rate</Text>
                <Text style={[s.barPct, { color: E.goldLight }]}>{inv.absorption_rate_pct}%</Text>
              </View>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${inv.absorption_rate_pct || 0}%`, backgroundColor: E.goldLight }]} />
              </View>
            </View>

            {/* ── Bookings ─────────────────────────────────── */}
            <SectionHeader title="BOOKINGS" icon="bookmark" />
            <View style={s.kpiRow}>
              <MiniKpi label="Total" value={bk.total} color={E.white} />
              <MiniKpi label="Provisional" value={bk.provisional} color={E.amber} />
              <MiniKpi label="Approved" value={bk.approved} color={E.blue} />
              <MiniKpi label="Confirmed" value={bk.confirmed} color={E.green} />
            </View>
            {bk.recent?.length > 0 && (
              <View style={s.listCard}>
                {bk.recent.map((r: any, i: number) => (
                  <View key={i} style={s.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.listTitle}>{r.client}</Text>
                      <Text style={s.listSub}>Plot #{r.plot_no}</Text>
                    </View>
                    <Text style={s.listValue}>{fmtINR(r.value_inr)}</Text>
                    <StatusBadge status={r.status} />
                  </View>
                ))}
              </View>
            )}

            {/* ── Leads ──────────────────────────────────────── */}
            <SectionHeader title="SALES PIPELINE" icon="users" />
            <View style={s.kpiRow}>
              <MiniKpi label="Total Leads" value={leads.total} color={E.white} />
              <MiniKpi label="Active" value={leads.active} color={E.green} />
              <MiniKpi label="Avg Discount" value={`${rev.avg_discount_pct}%`} color={E.amber} />
            </View>

            {/* ── Quick Ops ──────────────────────────────────── */}
            <SectionHeader title="OPERATIONS PULSE" icon="activity" />
            <View style={s.opsGrid}>
              <OpsCard icon="clock" label="Pending Approvals" value={ap.total} color={ap.total > 0 ? E.amber : E.green} />
              <OpsCard icon="alert-triangle" label="Delayed Stages" value={dl.total_delayed_stages} color={dl.total_delayed_stages > 0 ? E.red : E.green} />
              <OpsCard icon="alert-circle" label="Open Snags" value={sn.total} color={sn.total > 0 ? E.amber : E.green} />
              <OpsCard icon="package" label="PO Pending" value={pr.pending_approvals} color={pr.pending_approvals > 0 ? E.amber : E.green} />
            </View>
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            CONSTRUCTION TAB
           ════════════════════════════════════════════════════════ */}
        {tab === "construction" && (
          <>
            <View style={s.heroRow}>
              <HeroKpi icon="tool" label="Active Projects" value={con.in_progress} color={E.blue} sub={`${con.total_projects} total`} />
              <HeroKpi icon="bar-chart-2" label="Avg Progress" value={`${con.avg_progress_pct}%`} color={E.green} sub={`${dl.total_delayed_stages} delayed stages`} />
            </View>

            <SectionHeader title="PROJECT HEALTH MATRIX" icon="heart" />
            {con.projects?.map((p: any) => (
              <ProjectHealthCard key={p.id} project={p} />
            ))}
            {con.projects?.length === 0 && <EmptyState icon="check-circle" text="No active projects" />}

            {/* Delayed detail */}
            {dl.details?.length > 0 && (
              <>
                <SectionHeader title="DELAY REGISTER" icon="alert-triangle" />
                {dl.details.map((d: any, i: number) => (
                  <View key={i} style={s.delayCard}>
                    <Text style={s.delayProject}>{d.project}</Text>
                    <Text style={s.delaySub}>{d.client}</Text>
                    {d.stages?.map((st: any, j: number) => (
                      <View key={j} style={s.delayStage}>
                        <Feather name="alert-triangle" size={10} color={E.red} />
                        <Text style={s.delayName}>{st.name}</Text>
                        <Text style={s.delayReason}>{st.reason || "No reason"}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </>
            )}

            {/* Snags */}
            <SectionHeader title="OPEN SNAGS" icon="alert-circle" />
            <View style={s.kpiRow}>
              <MiniKpi label="Total" value={sn.total} color={E.white} />
              <MiniKpi label="Critical" value={sn.critical} color={E.red} />
              <MiniKpi label="High" value={sn.high} color={E.amber} />
              <MiniKpi label="Medium" value={sn.medium} color={E.blue} />
            </View>
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            FINANCE TAB
           ════════════════════════════════════════════════════════ */}
        {tab === "finance" && (
          <>
            {/* Revenue */}
            <SectionHeader title="REVENUE OVERVIEW" icon="trending-up" />
            <View style={s.kpiRow}>
              <KpiCard label="Total Sales" value={fmtINR(rev.total_sales_inr)} color={E.gold} />
              <KpiCard label="Confirmed" value={fmtINR(rev.confirmed_inr)} color={E.green} />
            </View>
            <View style={s.kpiRow}>
              <KpiCard label="Pipeline" value={fmtINR(rev.pipeline_inr)} color={E.amber} />
              <KpiCard label="Avg Discount" value={`${rev.avg_discount_pct}%`} color={E.red} />
            </View>

            {/* Cash collection */}
            <SectionHeader title="CASH COLLECTION" icon="dollar-sign" />
            <View style={s.cashCard}>
              <View style={s.cashRow}>
                <CashStat label="Collectible" value={fmtINR(cash.total_collectible_inr)} color={E.white} />
                <CashStat label="Collected" value={fmtINR(cash.collected_inr)} color={E.green} />
                <CashStat label="Pending" value={fmtINR(cash.pending_inr)} color={E.amber} />
              </View>
              <View style={s.barSection}>
                <View style={s.barHeader}>
                  <Text style={s.barLabel}>Collection Rate</Text>
                  <Text style={[s.barPct, { color: E.green }]}>{cash.collection_rate_pct}%</Text>
                </View>
                <View style={s.barTrack}>
                  <View style={[s.barFill, { width: `${cash.collection_rate_pct || 0}%`, backgroundColor: E.green }]} />
                </View>
              </View>
              {cash.overdue_count > 0 && (
                <View style={s.overdueAlert}>
                  <Feather name="alert-triangle" size={14} color={E.red} />
                  <Text style={s.overdueTxt}>{cash.overdue_count} overdue · {fmtINR(cash.overdue_inr)}</Text>
                </View>
              )}
            </View>

            {/* Available Inventory Value */}
            <SectionHeader title="INVENTORY VALUE" icon="layers" />
            <View style={s.kpiRow}>
              <KpiCard label="Available Value" value={fmtINR(inv.available_value_inr)} color={E.green} />
              <KpiCard label="Sold Value" value={fmtINR(rev.total_sales_inr)} color={E.goldLight} />
            </View>

            {/* Upcoming milestones */}
            <SectionHeader title="UPCOMING MILESTONES" icon="calendar" />
            {upcoming.length > 0 ? (
              <View style={s.listCard}>
                {upcoming.map((m: any, i: number) => (
                  <View key={i} style={s.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.listTitle}>{m.milestone}</Text>
                      <Text style={s.listSub}>{m.client} · Plot #{m.plot_no}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[s.listValue, { color: E.amber }]}>{fmtINR(m.amount_inr)}</Text>
                      {m.due_date && <Text style={s.listDate}>{m.due_date}</Text>}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState icon="check-circle" text="No pending milestones" />
            )}

            {/* Procurement */}
            <SectionHeader title="PROCUREMENT" icon="package" />
            <View style={s.kpiRow}>
              <KpiCard label="Pending POs" value={pr.pending_approvals} color={E.amber} />
              <KpiCard label="Pending Value" value={fmtINR(pr.total_pending_value)} color={E.red} />
            </View>
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            ACTIONS TAB
           ════════════════════════════════════════════════════════ */}
        {tab === "actions" && (
          <>
            <SectionHeader title="ACTION CENTRE" icon="zap" />
            {actions.length > 0 ? (
              actions.map((a: any, i: number) => <ActionCard key={i} action={a} />)
            ) : (
              <EmptyState icon="check-circle" text="No pending actions — all clear" />
            )}

            {/* Approval queue detail */}
            <SectionHeader title="APPROVAL QUEUE" icon="clock" />
            <View style={s.kpiRow}>
              <MiniKpi label="Bookings" value={ap.bookings} color={E.blue} />
              <MiniKpi label="Discounts" value={ap.discounts} color={E.amber} />
              <MiniKpi label="Procurement" value={ap.procurement} color={E.purple} />
            </View>
            {ap.items?.length > 0 && (
              <View style={s.listCard}>
                {ap.items.map((item: any, i: number) => (
                  <View key={i} style={s.listRow}>
                    <View style={[s.typeBadge, { backgroundColor: item.type === "BOOKING" ? E.blue + "20" : item.type === "DISCOUNT" ? E.amber + "20" : E.purple + "20" }]}>
                      <Text style={[s.typeTxt, { color: item.type === "BOOKING" ? E.blue : item.type === "DISCOUNT" ? E.amber : E.purple }]}>
                        {item.type}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={s.listTitle}>{item.client || "—"}</Text>
                      {item.plot_no && <Text style={s.listSub}>Plot #{item.plot_no}</Text>}
                    </View>
                    <Text style={s.listValue}>
                      {item.type === "DISCOUNT" ? `${item.value_inr}%` : fmtINR(item.value_inr)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Risk overview */}
            <SectionHeader title="RISK SUMMARY" icon="shield" />
            <View style={s.riskGrid}>
              <RiskBlock label="Delayed Stages" value={dl.total_delayed_stages} color={dl.total_delayed_stages > 0 ? E.red : E.green} icon="alert-triangle" />
              <RiskBlock label="Affected Projects" value={dl.affected_projects} color={dl.affected_projects > 0 ? E.red : E.green} icon="folder" />
              <RiskBlock label="Open Snags" value={sn.total} color={sn.total > 0 ? E.amber : E.green} icon="alert-circle" />
              <RiskBlock label="Overdue Payments" value={cash.overdue_count} color={cash.overdue_count > 0 ? E.red : E.green} icon="credit-card" />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ════════════════════════════════════════════════════════════════════ */

function SectionHeader({ title, icon }: { title: string; icon: any }) {
  return (
    <View style={s.sectionHeader}>
      <Feather name={icon} size={11} color={E.goldMuted} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function HeroKpi({ icon, label, value, color, sub }: { icon: any; label: string; value: any; color: string; sub: string }) {
  return (
    <View style={s.heroCard}>
      <View style={[s.heroIconWrap, { backgroundColor: color + "15" }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={s.heroLabel}>{label}</Text>
      <Text style={[s.heroValue, { color }]}>{value}</Text>
      <Text style={s.heroSub}>{sub}</Text>
    </View>
  );
}

function KpiCard({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <View style={s.kpiCard}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={[s.kpiValue, { color }]}>{value ?? "—"}</Text>
    </View>
  );
}

function MiniKpi({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <View style={s.miniKpi}>
      <Text style={[s.miniValue, { color }]}>{value ?? 0}</Text>
      <Text style={s.miniLabel}>{label}</Text>
    </View>
  );
}

function OpsCard({ icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <View style={s.opsCard}>
      <View style={[s.opsIconWrap, { backgroundColor: color + "15" }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={[s.opsValue, { color }]}>{value}</Text>
      <Text style={s.opsLabel}>{label}</Text>
    </View>
  );
}

function CashStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={s.cashLabel}>{label}</Text>
      <Text style={[s.cashValue, { color }]}>{value}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PROVISIONAL: E.amber, APPROVED: E.blue, CONFIRMED: E.green, CANCELLED: E.red,
  };
  const c = colors[status] || E.muted;
  return (
    <View style={[s.statusBadge, { backgroundColor: c + "20" }]}>
      <Text style={[s.statusTxt, { color: c }]}>{status}</Text>
    </View>
  );
}

function ProjectHealthCard({ project: p }: { project: any }) {
  const hc: Record<string, { bg: string; color: string }> = {
    GREEN: { bg: E.green + "15", color: E.green },
    AMBER: { bg: E.amber + "15", color: E.amber },
    RED: { bg: E.red + "15", color: E.red },
  };
  const h = hc[p.health] || hc.GREEN;
  return (
    <View style={s.healthCard}>
      <View style={s.healthTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.healthName}>{p.name}</Text>
          <Text style={s.healthSub}>{p.plot} · {p.client}</Text>
        </View>
        <View style={[s.healthBadge, { backgroundColor: h.bg }]}>
          <Text style={[s.healthBadgeTxt, { color: h.color }]}>{p.health}</Text>
        </View>
      </View>
      <View style={s.barSection}>
        <View style={s.barTrack}>
          <View style={[s.barFill, { width: `${p.progress}%`, backgroundColor: h.color }]} />
        </View>
      </View>
      <View style={s.healthStats}>
        <StatPill label="Progress" value={`${p.progress}%`} />
        <StatPill label="Budget" value={`${p.budget_pct}%`} warn={p.budget_pct > 80} />
        <StatPill label="Delayed" value={p.delayed_stages} warn={p.delayed_stages > 0} />
        <StatPill label="Stages" value={`${p.completed_stages}/${p.total_stages}`} />
      </View>
    </View>
  );
}

function StatPill({ label, value, warn }: { label: string; value: any; warn?: boolean }) {
  return (
    <View style={s.statPill}>
      <Text style={s.statPillLabel}>{label}</Text>
      <Text style={[s.statPillValue, warn && { color: E.red }]}>{value}</Text>
    </View>
  );
}

function ActionCard({ action: a }: { action: any }) {
  const colors: Record<string, string> = { CRITICAL: E.red, HIGH: E.amber, MEDIUM: E.blue };
  const icons: Record<string, any> = { APPROVALS: "clock", DELAYS: "alert-triangle", SNAGS: "alert-circle", COLLECTIONS: "credit-card" };
  const c = colors[a.priority] || E.muted;
  return (
    <View style={s.actionCard}>
      <View style={[s.actionIcon, { backgroundColor: c + "15" }]}>
        <Feather name={icons[a.type] || "zap"} size={18} color={c} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={s.actionTop}>
          <Text style={s.actionTitle}>{a.title}</Text>
          <View style={[s.priBadge, { backgroundColor: c + "20" }]}>
            <Text style={[s.priTxt, { color: c }]}>{a.priority}</Text>
          </View>
        </View>
        <Text style={s.actionDetail}>{a.detail}</Text>
      </View>
    </View>
  );
}

function RiskBlock({ label, value, color, icon }: { label: string; value: number; color: string; icon: any }) {
  return (
    <View style={s.riskBlock}>
      <View style={[s.riskIconWrap, { backgroundColor: color + "15" }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={[s.riskValue, { color }]}>{value}</Text>
      <Text style={s.riskLabel}>{label}</Text>
    </View>
  );
}

function EmptyState({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={s.emptyState}>
      <Feather name={icon} size={32} color={E.green} />
      <Text style={s.emptyTxt}>{text}</Text>
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════
   STYLES
   ════════════════════════════════════════════════════════════════════ */
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: E.bg },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingTxt: { color: E.muted, fontSize: 16 },

  // Header
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  backBtn: { padding: 8, marginRight: 12 },
  headerLabel: { fontSize: 8, letterSpacing: 4, color: E.goldMuted, fontWeight: "700" },
  headerTitle: { fontSize: 24, fontWeight: "700", color: E.white },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: E.green + "15", borderWidth: 1, borderColor: E.green + "33" },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: E.green },
  liveTxt: { fontSize: 9, fontWeight: "700", color: E.green, letterSpacing: 1 },

  // Tabs
  tabs: { flexDirection: "row", marginHorizontal: 20, marginBottom: 8, backgroundColor: E.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: E.border },
  tab: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, paddingVertical: 10, borderRadius: 10 },
  tabActive: { backgroundColor: E.gold + "18" },
  tabTxt: { fontSize: 9, fontWeight: "700", letterSpacing: 1.5, color: E.muted },
  tabTxtActive: { color: E.gold },

  // Section headers
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 24, marginBottom: 12 },
  sectionTitle: { fontSize: 9, letterSpacing: 3, color: E.goldMuted, fontWeight: "700" },

  // Hero KPIs
  heroRow: { flexDirection: "row", gap: 12 },
  heroCard: { flex: 1, backgroundColor: E.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: E.border, alignItems: "center" },
  heroIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  heroLabel: { fontSize: 9, letterSpacing: 1, color: E.muted, fontWeight: "600" },
  heroValue: { fontSize: 22, fontWeight: "800", marginTop: 4 },
  heroSub: { fontSize: 10, color: E.mutedLight, marginTop: 4 },

  // KPI row
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  kpiCard: { flex: 1, backgroundColor: E.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: E.border, alignItems: "center" },
  kpiLabel: { fontSize: 9, letterSpacing: 1, color: E.muted, fontWeight: "600" },
  kpiValue: { fontSize: 18, fontWeight: "700", marginTop: 4 },

  // Mini KPI
  miniKpi: { flex: 1, backgroundColor: E.card, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 6, borderWidth: 1, borderColor: E.border, alignItems: "center" },
  miniValue: { fontSize: 16, fontWeight: "700" },
  miniLabel: { fontSize: 7, letterSpacing: 0.5, color: E.muted, fontWeight: "600", marginTop: 2 },

  // Bar (progress bars)
  barSection: { marginVertical: 8 },
  barHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  barLabel: { fontSize: 10, color: E.muted, fontWeight: "600" },
  barPct: { fontSize: 12, fontWeight: "700" },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: E.cardAlt },
  barFill: { height: 6, borderRadius: 3 },

  // Ops grid
  opsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  opsCard: { width: "47%" as any, backgroundColor: E.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: E.border, alignItems: "center" },
  opsIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  opsValue: { fontSize: 22, fontWeight: "800" },
  opsLabel: { fontSize: 9, color: E.muted, fontWeight: "600", marginTop: 4, textAlign: "center" },

  // List card
  listCard: { backgroundColor: E.card, borderRadius: 14, borderWidth: 1, borderColor: E.border, overflow: "hidden" },
  listRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: E.border },
  listTitle: { fontSize: 13, fontWeight: "600", color: E.white },
  listSub: { fontSize: 10, color: E.muted, marginTop: 1 },
  listValue: { fontSize: 12, fontWeight: "700", color: E.goldLight, marginRight: 8 },
  listDate: { fontSize: 9, color: E.muted, marginTop: 2 },

  // Status badge
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusTxt: { fontSize: 8, fontWeight: "700", letterSpacing: 0.5 },

  // Type badge
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  typeTxt: { fontSize: 8, fontWeight: "700", letterSpacing: 0.5 },

  // Cash card
  cashCard: { backgroundColor: E.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: E.border },
  cashRow: { flexDirection: "row", marginBottom: 14 },
  cashLabel: { fontSize: 9, color: E.muted, fontWeight: "600", letterSpacing: 0.5 },
  cashValue: { fontSize: 16, fontWeight: "700", marginTop: 4 },
  overdueAlert: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, backgroundColor: E.red + "12", borderRadius: 10, padding: 10 },
  overdueTxt: { fontSize: 11, color: E.red, fontWeight: "600" },

  // Health card
  healthCard: { backgroundColor: E.card, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: E.border },
  healthTop: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  healthName: { fontSize: 14, fontWeight: "700", color: E.white },
  healthSub: { fontSize: 10, color: E.muted, marginTop: 2 },
  healthBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  healthBadgeTxt: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  healthStats: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },

  // Stat pill
  statPill: { backgroundColor: E.cardAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignItems: "center" },
  statPillLabel: { fontSize: 7, letterSpacing: 0.5, color: E.muted, fontWeight: "600" },
  statPillValue: { fontSize: 11, fontWeight: "700", color: E.white, marginTop: 1 },

  // Delay card
  delayCard: { backgroundColor: E.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: E.red + "30" },
  delayProject: { fontSize: 13, fontWeight: "700", color: E.white },
  delaySub: { fontSize: 10, color: E.muted, marginBottom: 8 },
  delayStage: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  delayName: { fontSize: 11, fontWeight: "600", color: E.red, flex: 1 },
  delayReason: { fontSize: 10, color: E.muted },

  // Action card
  actionCard: { flexDirection: "row", backgroundColor: E.card, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: E.border },
  actionIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", marginRight: 14 },
  actionTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  actionTitle: { fontSize: 13, fontWeight: "700", color: E.white, flex: 1 },
  actionDetail: { fontSize: 11, color: E.muted },
  priBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  priTxt: { fontSize: 8, fontWeight: "700", letterSpacing: 0.5 },

  // Risk grid
  riskGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  riskBlock: { width: "47%" as any, backgroundColor: E.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: E.border, alignItems: "center" },
  riskIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  riskValue: { fontSize: 22, fontWeight: "800" },
  riskLabel: { fontSize: 9, color: E.muted, fontWeight: "600", marginTop: 4, textAlign: "center" },

  // Empty
  emptyState: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyTxt: { color: E.muted, fontSize: 14 },
});
