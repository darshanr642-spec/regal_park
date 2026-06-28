import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { usePermissions } from "@/src/lib/permissions";

/* ── Executive palette ────────────────────────────────────────────── */
const C = {
  bg: "#0B0D14",
  surface: "#12141E",
  card: "#1A1D2A",
  cardAlt: "#222638",
  gold: "#C5A059",
  goldLight: "#D4AF37",
  white: "#F0ECE3",
  muted: "#6B6B7B",
  mutedLight: "#8B8B9B",
  green: "#10B981",
  red: "#F87171",
  amber: "#F59E0B",
  blue: "#6366F1",
  border: "#2A2D3A",
  brand: "#C5A059",
};

const ALL_TABS = [
  { key: "users", label: "Users", icon: "users", module: "users" },
  { key: "projects", label: "Projects", icon: "briefcase", module: "projects" },
  { key: "stages", label: "Stages", icon: "layers", module: "stages" },
  { key: "plots", label: "Plots", icon: "grid", module: "plots" },
  { key: "boq", label: "BOQ", icon: "list", module: "boq" },
  { key: "procurement", label: "Procurement", icon: "truck", module: "procurement" },
  { key: "team", label: "Team", icon: "tool", module: "team" },
  { key: "pricing", label: "Pricing", icon: "dollar-sign", module: "pricing" },
  { key: "settings", label: "Settings", icon: "settings", module: "settings" },
  { key: "audit", label: "Audit Log", icon: "shield", module: "audit" },
] as const;

type TabKey = (typeof ALL_TABS)[number]["key"];

/* ══════════════════════════════════════════════════════════════════════
   MAIN PAGE — role-aware
   ══════════════════════════════════════════════════════════════════════ */

export default function DataEditor() {
  const router = useRouter();
  const { user } = useAuth();
  const { can, loading: permLoading } = usePermissions();
  const [summary, setSummary] = useState<any>(null);

  // Filter tabs to only those the user can view
  const visibleTabs = ALL_TABS.filter((t) => can(t.module, "view"));
  const [tab, setTab] = useState<TabKey | "">("");

  useEffect(() => {
    if (visibleTabs.length > 0 && !tab) {
      setTab(visibleTabs[0].key);
    }
  }, [visibleTabs, tab]);

  useEffect(() => {
    // Try to load summary — will fail silently for non-admin roles
    api.adminSummary().then(setSummary).catch(() => {});
  }, []);

  if (permLoading) return null;

  if (visibleTabs.length === 0) {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <View style={s.center}>
          <Feather name="shield-off" size={32} color={C.red} />
          <Text style={[s.denied, { marginTop: 12 }]}>No edit permissions assigned</Text>
          <Text style={[s.emptyTxt, { marginTop: 4 }]}>Contact your admin for access</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={C.white} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Data Editor</Text>
          <Text style={s.subtitle}>
            {user?.role?.replace(/_/g, " ")} · ROLE-BASED ACCESS
          </Text>
        </View>
      </View>

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabBar}
      >
        {visibleTabs.map((t) => {
          const canEdit = can(t.module, "edit");
          return (
            <Pressable
              key={t.key}
              style={[s.tab, tab === t.key && s.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Feather
                name={t.icon as any}
                size={14}
                color={tab === t.key ? C.bg : C.muted}
              />
              <Text style={[s.tabTxt, tab === t.key && s.tabTxtActive]}>
                {t.label}
              </Text>
              {!canEdit && (
                <Feather name="eye" size={10} color={tab === t.key ? C.bg : C.muted} />
              )}
              {summary && (summary as any)[t.key] !== undefined && (
                <View style={s.badge}>
                  <Text style={s.badgeTxt}>{(summary as any)[t.key]}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Tab content */}
      {tab === "users" && <UsersTab />}
      {tab === "projects" && <ProjectsTab />}
      {tab === "stages" && <StagesTab />}
      {tab === "plots" && <PlotsTab />}
      {tab === "boq" && <BOQTab />}
      {tab === "procurement" && <ProcurementTab />}
      {tab === "team" && <TeamTab />}
      {tab === "pricing" && <PricingTab />}
      {tab === "settings" && <SettingsTab />}
      {tab === "audit" && <AuditTab />}
    </SafeAreaView>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   REUSABLE EDIT MODAL
   ══════════════════════════════════════════════════════════════════════ */

type Field = { key: string; label: string; type?: "text" | "number" | "bool" };

function EditModal({
  visible, title, fields, data, onSave, onClose, readOnly,
}: {
  visible: boolean;
  title: string;
  fields: Field[];
  data: any;
  onSave: (updates: any) => Promise<void>;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (data) setForm({ ...data });
  }, [data]);

  const handleSave = async () => {
    if (readOnly) return;
    setSaving(true);
    setMsg("");
    try {
      const updates: any = {};
      for (const f of fields) {
        if (form[f.key] !== undefined && form[f.key] !== data?.[f.key]) {
          updates[f.key] =
            f.type === "number" ? Number(form[f.key]) : form[f.key];
        }
      }
      if (Object.keys(updates).length === 0) {
        setMsg("No changes");
        setSaving(false);
        return;
      }
      await onSave(updates);
      setMsg("✅ Saved");
      setTimeout(onClose, 600);
    } catch (e: any) {
      setMsg("❌ " + (e.message || "Save failed"));
    }
    setSaving(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={ms.overlay}>
        <View style={ms.modal}>
          <View style={ms.mHeader}>
            <Text style={ms.mTitle}>{title}</Text>
            {readOnly && (
              <View style={[s.pill, { backgroundColor: C.amber + "22", marginRight: 8 }]}>
                <Text style={[s.pillTxt, { color: C.amber }]}>VIEW ONLY</Text>
              </View>
            )}
            <Pressable onPress={onClose}>
              <Feather name="x" size={20} color={C.muted} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 400 }}>
            {fields.map((f) => (
              <View key={f.key} style={ms.field}>
                <Text style={ms.label}>{f.label}</Text>
                {f.type === "bool" ? (
                  <Pressable
                    style={ms.boolBtn}
                    onPress={() => !readOnly && setForm({ ...form, [f.key]: !form[f.key] })}
                    disabled={readOnly}
                  >
                    <Feather
                      name={form[f.key] ? "check-circle" : "circle"}
                      size={18}
                      color={form[f.key] ? C.green : C.muted}
                    />
                    <Text style={ms.boolTxt}>
                      {form[f.key] ? "Active" : "Inactive"}
                    </Text>
                  </Pressable>
                ) : (
                  <TextInput
                    style={[ms.input, readOnly && { opacity: 0.5 }]}
                    value={String(form[f.key] ?? "")}
                    onChangeText={(v) => !readOnly && setForm({ ...form, [f.key]: v })}
                    keyboardType={f.type === "number" ? "numeric" : "default"}
                    placeholderTextColor={C.muted}
                    editable={!readOnly}
                  />
                )}
              </View>
            ))}
            {/* Last Updated info */}
            {data?.last_updated_by && (
              <View style={ms.metaRow}>
                <Feather name="clock" size={10} color={C.muted} />
                <Text style={ms.metaTxt}>
                  Last edited by {data.last_updated_by} · {data.last_updated_at || "—"}
                </Text>
              </View>
            )}
          </ScrollView>
          {msg ? <Text style={ms.msg}>{msg}</Text> : null}
          <View style={ms.mFooter}>
            <Pressable style={ms.cancelBtn} onPress={onClose}>
              <Text style={ms.cancelTxt}>{readOnly ? "Close" : "Cancel"}</Text>
            </Pressable>
            {!readOnly && (
              <Pressable style={ms.saveBtn} onPress={handleSave} disabled={saving}>
                <Text style={ms.saveTxt}>{saving ? "Saving…" : "Save"}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ── Confirm dialog ───────────────────────────────────────────────── */
function confirmAction(title: string, msg: string, onOk: () => void) {
  Alert.alert(title, msg, [
    { text: "Cancel", style: "cancel" },
    { text: "Confirm", style: "destructive", onPress: onOk },
  ]);
}

/* ── Search bar ───────────────────────────────────────────────────── */
function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={s.searchWrap}>
      <Feather name="search" size={14} color={C.muted} />
      <TextInput
        style={s.searchInput}
        placeholder="Search…"
        placeholderTextColor={C.muted}
        value={value}
        onChangeText={onChange}
      />
      {value ? (
        <Pressable onPress={() => onChange("")}>
          <Feather name="x" size={14} color={C.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ── Card row — now permission-aware ──────────────────────────────── */
function CardRow({
  title, subtitle, right, onPress, accent, canEdit,
}: {
  title: string;
  subtitle?: string;
  right?: string;
  onPress: () => void;
  accent?: string;
  canEdit?: boolean;
}) {
  return (
    <Pressable style={s.card} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.cardSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ? (
        <View style={[s.pill, accent ? { backgroundColor: accent + "22" } : null]}>
          <Text style={[s.pillTxt, accent ? { color: accent } : null]}>{right}</Text>
        </View>
      ) : null}
      <Feather
        name={canEdit ? "edit-2" : "eye"}
        size={14}
        color={canEdit ? C.gold : C.muted}
        style={{ marginLeft: 8 }}
      />
    </Pressable>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TAB: USERS
   ══════════════════════════════════════════════════════════════════════ */

const USER_FIELDS: Field[] = [
  { key: "full_name", label: "Full Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "role", label: "Role" },
  { key: "company", label: "Company" },
  { key: "is_active", label: "Active", type: "bool" },
];

function UsersTab() {
  const { can } = usePermissions();
  const canEdit = can("users", "edit");
  const canDelete = can("users", "delete");
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [pwModal, setPwModal] = useState<any>(null);
  const [tempPw, setTempPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  const load = useCallback(() => { api.adminUsers().then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(
    (r) =>
      r.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.email?.toLowerCase().includes(search.toLowerCase()) ||
      r.role?.toLowerCase().includes(search.toLowerCase())
  );

  const handleResetPw = async () => {
    if (tempPw.length < 6) { setPwMsg("Min 6 characters"); return; }
    try {
      await api.adminResetPassword(pwModal.id, { temp_password: tempPw });
      setPwMsg("✅ Password reset");
      setTimeout(() => { setPwModal(null); setTempPw(""); setPwMsg(""); }, 800);
    } catch (e: any) { setPwMsg("❌ " + e.message); }
  };

  return (
    <>
      <ScrollView contentContainerStyle={s.content}>
        <SearchBar value={search} onChange={setSearch} />
        {filtered.map((u) => (
          <View key={u.id}>
            <CardRow
              title={u.full_name}
              subtitle={`${u.email} · ${u.role}`}
              right={u.is_active ? "Active" : "Inactive"}
              accent={u.is_active ? C.green : C.red}
              onPress={() => setEditing(u)}
              canEdit={canEdit}
            />
            {canDelete && (
              <Pressable style={s.resetPwBtn} onPress={() => setPwModal(u)}>
                <Feather name="key" size={11} color={C.amber} />
                <Text style={s.resetPwTxt}>Reset Password</Text>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>

      <EditModal
        visible={!!editing}
        title={canEdit ? "Edit User" : "View User"}
        fields={USER_FIELDS}
        data={editing}
        readOnly={!canEdit}
        onSave={async (upd) => { await api.adminPatchUser(editing.id, upd); load(); }}
        onClose={() => setEditing(null)}
      />

      <Modal visible={!!pwModal} transparent animationType="fade">
        <View style={ms.overlay}>
          <View style={ms.modal}>
            <Text style={ms.mTitle}>Reset Password</Text>
            <Text style={[ms.label, { marginTop: 12 }]}>
              {pwModal?.full_name} ({pwModal?.email})
            </Text>
            <TextInput
              style={[ms.input, { marginTop: 8 }]}
              placeholder="New temporary password"
              placeholderTextColor={C.muted}
              secureTextEntry
              value={tempPw}
              onChangeText={setTempPw}
            />
            {pwMsg ? <Text style={ms.msg}>{pwMsg}</Text> : null}
            <View style={ms.mFooter}>
              <Pressable style={ms.cancelBtn} onPress={() => { setPwModal(null); setTempPw(""); setPwMsg(""); }}>
                <Text style={ms.cancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={ms.saveBtn} onPress={handleResetPw}>
                <Text style={ms.saveTxt}>Reset</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TAB: PROJECTS
   ══════════════════════════════════════════════════════════════════════ */

const PROJECT_FIELDS: Field[] = [
  { key: "name", label: "Project Name" },
  { key: "plot_number", label: "Plot Number" },
  { key: "client_name", label: "Client Name" },
  { key: "villa_type", label: "Villa / Elevation Type" },
  { key: "built_up_area_sqft", label: "Built-up Area (sqft)", type: "number" },
  { key: "start_date", label: "Start Date" },
  { key: "target_handover_date", label: "Target Handover" },
  { key: "budget_inr", label: "Budget (₹)", type: "number" },
  { key: "progress_pct", label: "Progress %", type: "number" },
  { key: "status", label: "Status" },
];

function ProjectsTab() {
  const { can } = usePermissions();
  const canEdit = can("projects", "edit");
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(() => { api.adminProjects().then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(
    (r) => r.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.client_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <ScrollView contentContainerStyle={s.content}>
        <SearchBar value={search} onChange={setSearch} />
        {filtered.map((p) => (
          <CardRow key={p.id} title={p.name}
            subtitle={`${p.client_name} · ${p.villa_type}`}
            right={`${Math.round(p.progress_pct)}%`} accent={C.green}
            onPress={() => setEditing(p)} canEdit={canEdit} />
        ))}
        {filtered.length === 0 && <Text style={s.emptyTxt}>No projects</Text>}
      </ScrollView>
      <EditModal visible={!!editing} title={canEdit ? "Edit Project" : "View Project"}
        fields={PROJECT_FIELDS} data={editing} readOnly={!canEdit}
        onSave={async (upd) => { await api.adminPatchProject(editing.id, upd); load(); }}
        onClose={() => setEditing(null)} />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TAB: STAGES (Works)
   ══════════════════════════════════════════════════════════════════════ */

const STAGE_FIELDS: Field[] = [
  { key: "name", label: "Stage / Work Name" },
  { key: "planned_start", label: "Planned Start" },
  { key: "planned_end", label: "Planned End" },
  { key: "actual_start", label: "Actual Start" },
  { key: "actual_end", label: "Actual End" },
  { key: "responsible", label: "Responsible" },
  { key: "progress_pct", label: "Progress %", type: "number" },
  { key: "status", label: "Status (NOT_STARTED / IN_PROGRESS / DELAYED / COMPLETED)" },
  { key: "remarks", label: "Remarks" },
  { key: "delay_reason", label: "Delay Reason" },
];

const STAGE_CREATE_FIELDS: Field[] = [
  { key: "name", label: "Stage / Work Name" },
  { key: "planned_start", label: "Planned Start (YYYY-MM-DD)" },
  { key: "planned_end", label: "Planned End (YYYY-MM-DD)" },
  { key: "responsible", label: "Responsible Person" },
  { key: "remarks", label: "Remarks (optional)" },
];

function StagesTab() {
  const { can } = usePermissions();
  const canEdit = can("stages", "edit");
  const canCreate = can("stages", "create");
  const canDelete = can("stages", "delete");
  const [rows, setRows] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState<any>({});
  const [newProjectId, setNewProjectId] = useState("");
  const [createMsg, setCreateMsg] = useState("");
  const [createSaving, setCreateSaving] = useState(false);

  const load = useCallback(() => {
    api.adminStages().then(setRows).catch(() => {});
    api.adminProjects().then(setProjects).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const projectMap = Object.fromEntries(projects.map((p: any) => [p.id, p.name]));

  const filtered = rows.filter((r) => {
    const matchSearch =
      r.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.responsible?.toLowerCase().includes(search.toLowerCase()) ||
      r.status?.toLowerCase().includes(search.toLowerCase()) ||
      projectMap[r.project_id]?.toLowerCase().includes(search.toLowerCase());
    const matchProject = !filterProject || r.project_id === filterProject;
    return matchSearch && matchProject;
  });

  const SSC: Record<string, string> = {
    NOT_STARTED: C.muted, IN_PROGRESS: C.blue, DELAYED: C.red, COMPLETED: C.green,
  };

  const handleDelete = (item: any) => {
    confirmAction("Delete Stage", `Delete "${item.name}"? This can\'t be undone.`, async () => {
      try { await api.adminDeleteStage(item.id); load(); }
      catch (e: any) { Alert.alert("Error", e.message); }
    });
  };

  const handleCreate = async () => {
    if (!newProjectId) { setCreateMsg("Select a project"); return; }
    if (!newForm.name?.trim()) { setCreateMsg("Stage name is required"); return; }
    if (!newForm.planned_start?.trim()) { setCreateMsg("Planned start is required"); return; }
    if (!newForm.planned_end?.trim()) { setCreateMsg("Planned end is required"); return; }
    if (!newForm.responsible?.trim()) { setCreateMsg("Responsible person is required"); return; }
    setCreateSaving(true);
    setCreateMsg("");
    try {
      await api.adminCreateStage({ ...newForm, project_id: newProjectId });
      setCreateMsg("✅ Created");
      setTimeout(() => { setCreating(false); setNewForm({}); setNewProjectId(""); setCreateMsg(""); load(); }, 600);
    } catch (e: any) { setCreateMsg("❌ " + (e.message || "Create failed")); }
    setCreateSaving(false);
  };

  return (
    <>
      <ScrollView contentContainerStyle={s.content}>
        <SearchBar value={search} onChange={setSearch} />

        {/* Project filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10, maxHeight: 36 }}>
          <Pressable
            style={[s.tab, !filterProject && s.tabActive, { marginRight: 6 }]}
            onPress={() => setFilterProject("")}
          >
            <Text style={[s.tabTxt, !filterProject && s.tabTxtActive]}>All Projects</Text>
          </Pressable>
          {projects.map((p: any) => (
            <Pressable
              key={p.id}
              style={[s.tab, filterProject === p.id && s.tabActive, { marginRight: 6 }]}
              onPress={() => setFilterProject(filterProject === p.id ? "" : p.id)}
            >
              <Text style={[s.tabTxt, filterProject === p.id && s.tabTxtActive]} numberOfLines={1}>
                {p.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={s.countTxt}>{filtered.length} stages / works</Text>

        {canCreate && (
          <Pressable style={[s.actionBtn, { marginBottom: 12 }]} onPress={() => setCreating(true)}>
            <Feather name="plus" size={14} color={C.bg} />
            <Text style={s.actionBtnTxt}>Add Work / Stage</Text>
          </Pressable>
        )}

        {filtered.map((st) => (
          <View key={st.id} style={s.cardWithActions}>
            <CardRow
              title={st.name}
              subtitle={`${projectMap[st.project_id] || st.project_id} · ${st.responsible} · ${st.planned_start} → ${st.planned_end}`}
              right={`${Math.round(st.progress_pct || 0)}% · ${st.status?.replace("_", " ")}`}
              accent={SSC[st.status] || C.muted}
              onPress={() => setEditing(st)}
              canEdit={canEdit}
            />
            {canDelete && (
              <Pressable style={s.deleteBtn} onPress={() => handleDelete(st)}>
                <Feather name="trash-2" size={12} color={C.red} />
              </Pressable>
            )}
          </View>
        ))}
        {filtered.length === 0 && <Text style={s.emptyTxt}>No stages / works found</Text>}
      </ScrollView>

      <EditModal
        visible={!!editing}
        title={canEdit ? "Edit Stage" : "View Stage"}
        fields={STAGE_FIELDS}
        data={editing}
        readOnly={!canEdit}
        onSave={async (upd) => { await api.adminPatchStage(editing.id, upd); load(); }}
        onClose={() => setEditing(null)}
      />

      {/* Create modal */}
      <Modal visible={creating} transparent animationType="fade">
        <View style={ms.overlay}>
          <View style={ms.modal}>
            <View style={ms.mHeader}>
              <Text style={ms.mTitle}>Add Work / Stage</Text>
              <Pressable onPress={() => { setCreating(false); setCreateMsg(""); }}>
                <Feather name="x" size={20} color={C.muted} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {/* Project selector */}
              <View style={ms.field}>
                <Text style={ms.label}>PROJECT</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {projects.map((p: any) => (
                    <Pressable
                      key={p.id}
                      style={[s.tab, newProjectId === p.id && s.tabActive, { marginRight: 6 }]}
                      onPress={() => setNewProjectId(p.id)}
                    >
                      <Text style={[s.tabTxt, newProjectId === p.id && s.tabTxtActive]}>{p.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              {STAGE_CREATE_FIELDS.map((f) => (
                <View key={f.key} style={ms.field}>
                  <Text style={ms.label}>{f.label}</Text>
                  <TextInput
                    style={ms.input}
                    value={String(newForm[f.key] ?? "")}
                    onChangeText={(v) => setNewForm({ ...newForm, [f.key]: v })}
                    placeholderTextColor={C.muted}
                    placeholder={f.label}
                  />
                </View>
              ))}
            </ScrollView>
            {createMsg ? <Text style={ms.msg}>{createMsg}</Text> : null}
            <View style={ms.mFooter}>
              <Pressable style={ms.cancelBtn} onPress={() => { setCreating(false); setCreateMsg(""); }}>
                <Text style={ms.cancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={ms.saveBtn} onPress={handleCreate} disabled={createSaving}>
                <Text style={ms.saveTxt}>{createSaving ? "Creating…" : "Create"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TAB: PLOTS
   ══════════════════════════════════════════════════════════════════════ */

const PLOT_FIELDS: Field[] = [
  { key: "villa_type", label: "Villa / Elevation Type" },
  { key: "dimension_ft", label: "Dimensions (ft)" },
  { key: "status", label: "Status" },
  { key: "sales_status", label: "Sales Status" },
  { key: "asking_price_inr", label: "Asking Price (₹)", type: "number" },
  { key: "premium_pct", label: "Premium %", type: "number" },
  { key: "facing", label: "Facing" },
  { key: "is_corner", label: "Corner Plot", type: "bool" },
  { key: "elevation_type", label: "Elevation Type" },
  { key: "landowner_id", label: "Landowner ID" },
];

function PlotsTab() {
  const { can } = usePermissions();
  const canEdit = can("plots", "edit");
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(() => { api.adminPlots().then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(
    (r) => String(r.plot_no).includes(search) ||
      r.villa_type?.toLowerCase().includes(search.toLowerCase()) ||
      r.sales_status?.toLowerCase().includes(search.toLowerCase())
  );

  const SC: Record<string, string> = { AVAILABLE: C.green, RESERVED: C.amber, BOOKED: C.blue, SOLD: C.red };

  return (
    <>
      <ScrollView contentContainerStyle={s.content}>
        <SearchBar value={search} onChange={setSearch} />
        <Text style={s.countTxt}>{filtered.length} plots</Text>
        {filtered.map((p) => (
          <CardRow key={p.plot_no} title={`Plot #${p.plot_no}`}
            subtitle={`${p.villa_type || p.elevation_type || "—"} · ${p.dimension_ft || "—"} · ₹${((p.asking_price_inr || 0) / 100000).toFixed(1)}L`}
            right={p.sales_status || p.status} accent={SC[p.sales_status] || C.muted}
            onPress={() => setEditing(p)} canEdit={canEdit} />
        ))}
      </ScrollView>
      <EditModal visible={!!editing} title={canEdit ? `Edit Plot #${editing?.plot_no}` : `View Plot #${editing?.plot_no}`}
        fields={PLOT_FIELDS} data={editing} readOnly={!canEdit}
        onSave={async (upd) => { await api.adminPatchPlot(editing.plot_no, upd); load(); }}
        onClose={() => setEditing(null)} />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TAB: BOQ
   ══════════════════════════════════════════════════════════════════════ */

const BOQ_FIELDS: Field[] = [
  { key: "description", label: "Description" },
  { key: "category", label: "Category" },
  { key: "unit", label: "Unit" },
  { key: "quantity", label: "Quantity", type: "number" },
  { key: "rate_inr", label: "Rate (₹)", type: "number" },
  { key: "vendor", label: "Vendor" },
  { key: "payment_status", label: "Payment Status" },
];

function BOQTab() {
  const { can } = usePermissions();
  const canEdit = can("boq", "edit");
  const canDelete = can("boq", "delete");
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(() => { api.adminBoq().then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(
    (r) => r.description?.toLowerCase().includes(search.toLowerCase()) ||
      r.category?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (item: any) => {
    confirmAction("Delete BOQ Item", `Delete "${item.description}"?`, async () => {
      try { await api.adminDeleteBoq(item.id); load(); }
      catch (e: any) { Alert.alert("Error", e.message); }
    });
  };

  return (
    <>
      <ScrollView contentContainerStyle={s.content}>
        <SearchBar value={search} onChange={setSearch} />
        {filtered.map((b) => (
          <View key={b.id} style={s.cardWithActions}>
            <CardRow title={b.description}
              subtitle={`${b.category} · ${b.quantity} ${b.unit} @ ₹${b.rate_inr}`}
              right={b.payment_status}
              accent={b.payment_status === "PAID" ? C.green : b.payment_status === "PARTIAL" ? C.amber : C.muted}
              onPress={() => setEditing(b)} canEdit={canEdit} />
            {canDelete && (
              <Pressable style={s.deleteBtn} onPress={() => handleDelete(b)}>
                <Feather name="trash-2" size={12} color={C.red} />
              </Pressable>
            )}
          </View>
        ))}
        {filtered.length === 0 && <Text style={s.emptyTxt}>No BOQ items</Text>}
      </ScrollView>
      <EditModal visible={!!editing} title={canEdit ? "Edit BOQ Item" : "View BOQ Item"}
        fields={BOQ_FIELDS} data={editing} readOnly={!canEdit}
        onSave={async (upd) => { await api.adminPatchBoq(editing.id, upd); load(); }}
        onClose={() => setEditing(null)} />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TAB: PROCUREMENT
   ══════════════════════════════════════════════════════════════════════ */

const PO_FIELDS: Field[] = [
  { key: "material_name", label: "Material" },
  { key: "vendor", label: "Vendor" },
  { key: "quantity", label: "Quantity", type: "number" },
  { key: "unit", label: "Unit" },
  { key: "rate_inr", label: "Rate (₹)", type: "number" },
  { key: "status", label: "Status" },
  { key: "expected_delivery", label: "Expected Delivery" },
  { key: "notes", label: "Notes" },
];

function ProcurementTab() {
  const { can } = usePermissions();
  const canEdit = can("procurement", "edit");
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(() => { api.adminProcurement().then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(
    (r) => r.material_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.vendor?.toLowerCase().includes(search.toLowerCase())
  );

  const PSC: Record<string, string> = { REQUESTED: C.amber, APPROVED: C.blue, ORDERED: C.gold, DELIVERED: C.green, CANCELLED: C.red };

  return (
    <>
      <ScrollView contentContainerStyle={s.content}>
        <SearchBar value={search} onChange={setSearch} />
        {filtered.map((po) => (
          <CardRow key={po.id} title={`${po.po_number} — ${po.material_name}`}
            subtitle={`${po.vendor} · ${po.quantity} ${po.unit} @ ₹${po.rate_inr}`}
            right={po.status} accent={PSC[po.status] || C.muted}
            onPress={() => setEditing(po)} canEdit={canEdit} />
        ))}
        {filtered.length === 0 && <Text style={s.emptyTxt}>No purchase orders</Text>}
      </ScrollView>
      <EditModal visible={!!editing} title={canEdit ? "Edit PO" : "View PO"}
        fields={PO_FIELDS} data={editing} readOnly={!canEdit}
        onSave={async (upd) => { await api.adminPatchProcurement(editing.id, upd); load(); }}
        onClose={() => setEditing(null)} />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TAB: TEAM
   ══════════════════════════════════════════════════════════════════════ */

const TEAM_FIELDS: Field[] = [
  { key: "name", label: "Name" },
  { key: "role", label: "Role" },
  { key: "company", label: "Company" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "scope_of_work", label: "Scope of Work" },
  { key: "status", label: "Status" },
];

function TeamTab() {
  const { can } = usePermissions();
  const canEdit = can("team", "edit");
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(() => { api.adminTeam().then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(
    (r) => r.name?.toLowerCase().includes(search.toLowerCase()) || r.company?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <ScrollView contentContainerStyle={s.content}>
        <SearchBar value={search} onChange={setSearch} />
        {filtered.map((t) => (
          <CardRow key={t.id} title={t.name} subtitle={`${t.company} · ${t.role}`}
            right={t.status} accent={t.status === "Active" ? C.green : C.red}
            onPress={() => setEditing(t)} canEdit={canEdit} />
        ))}
        {filtered.length === 0 && <Text style={s.emptyTxt}>No team members</Text>}
      </ScrollView>
      <EditModal visible={!!editing} title={canEdit ? "Edit Team Member" : "View Team Member"}
        fields={TEAM_FIELDS} data={editing} readOnly={!canEdit}
        onSave={async (upd) => { await api.adminPatchTeam(editing.id, upd); load(); }}
        onClose={() => setEditing(null)} />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TAB: PRICING
   ══════════════════════════════════════════════════════════════════════ */

const PRICING_FIELDS: Field[] = [
  { key: "elevation_type", label: "Elevation Type" },
  { key: "base_price_inr", label: "Base Price (₹)", type: "number" },
  { key: "base_price_per_sqft_inr", label: "Price per Sqft (₹)", type: "number" },
  { key: "premium_pct", label: "Premium %", type: "number" },
  { key: "landowner_share_pct", label: "Landowner Share %", type: "number" },
  { key: "developer_share_pct", label: "Developer Share %", type: "number" },
  { key: "valid_from", label: "Valid From" },
  { key: "valid_until", label: "Valid Until" },
  { key: "status", label: "Status" },
];

function PricingTab() {
  const { can } = usePermissions();
  const canEdit = can("pricing", "edit");
  const [rows, setRows] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(() => { api.adminPricing().then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <ScrollView contentContainerStyle={s.content}>
        {rows.map((p) => (
          <CardRow key={p.id} title={p.elevation_type}
            subtitle={`₹${p.base_price_per_sqft_inr}/sqft · LO ${p.landowner_share_pct}% / Dev ${p.developer_share_pct}%`}
            right={p.status} accent={p.status === "ACTIVE" ? C.green : C.muted}
            onPress={() => setEditing(p)} canEdit={canEdit} />
        ))}
        {rows.length === 0 && <Text style={s.emptyTxt}>No pricing records</Text>}
      </ScrollView>
      <EditModal visible={!!editing} title={canEdit ? "Edit Pricing" : "View Pricing"}
        fields={PRICING_FIELDS} data={editing} readOnly={!canEdit}
        onSave={async (upd) => { await api.adminPatchPricing(editing.id, upd); load(); }}
        onClose={() => setEditing(null)} />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TAB: SETTINGS (ADMIN only by default)
   ══════════════════════════════════════════════════════════════════════ */

const SETTINGS_FIELDS: Field[] = [
  { key: "coo_dashboard_title", label: "COO Dashboard Title" },
  { key: "crm_dashboard_title", label: "CRM Dashboard Title" },
  { key: "inventory_dashboard_title", label: "Inventory Dashboard Title" },
  { key: "landowner_dashboard_title", label: "Landowner Dashboard Title" },
  { key: "portal_title", label: "Customer Portal Title" },
];

function SettingsTab() {
  const { can } = usePermissions();
  const canEdit = can("settings", "edit");
  const [data, setData] = useState<any>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => { api.adminSettings().then(setData).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.sectionTitle}>DASHBOARD LABELS</Text>
        {data ? (
          <>
            {SETTINGS_FIELDS.map((f) => (
              <View key={f.key} style={s.settingRow}>
                <Text style={s.settingLabel}>{f.label}</Text>
                <Text style={s.settingValue}>{data[f.key] || "—"}</Text>
              </View>
            ))}
            {canEdit && (
              <Pressable style={[s.actionBtn, { marginTop: 16 }]} onPress={() => setEditing(true)}>
                <Feather name="edit-2" size={14} color={C.bg} />
                <Text style={s.actionBtnTxt}>Edit Settings</Text>
              </Pressable>
            )}
          </>
        ) : <Text style={s.emptyTxt}>Loading settings…</Text>}
      </ScrollView>
      <EditModal visible={editing} title="Edit App Settings"
        fields={SETTINGS_FIELDS} data={data} readOnly={!canEdit}
        onSave={async (upd) => { await api.adminPatchSettings(upd); load(); }}
        onClose={() => setEditing(false)} />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TAB: AUDIT LOG
   ══════════════════════════════════════════════════════════════════════ */

function AuditTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api.adminAuditLog().then(setRows).catch(() => {}); }, []);

  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.sectionTitle}>RECENT CHANGES (LAST 100)</Text>
      {rows.map((r, i) => (
        <View key={r.id || i} style={s.auditCard}>
          <View style={s.auditHeader}>
            <Feather name="edit" size={12} color={C.gold} />
            <Text style={s.auditModule}>{r.module}</Text>
            <Text style={s.auditAction}>{r.action}</Text>
            {r.user_role && (
              <View style={[s.pill, { backgroundColor: C.blue + "22", marginLeft: 4 }]}>
                <Text style={[s.pillTxt, { color: C.blue }]}>{r.user_role}</Text>
              </View>
            )}
          </View>
          <Text style={s.auditUser}>
            by {r.user_name} · {r.timestamp ? new Date(r.timestamp).toLocaleString() : "—"}
          </Text>
          {r.changes && Object.keys(r.changes).length > 0 && (
            <View style={s.auditChanges}>
              {Object.entries(r.changes).map(([k, v]: any) => (
                <Text key={k} style={s.auditChange}>
                  {k}: {JSON.stringify(v.old)} → {JSON.stringify(v.new)}
                </Text>
              ))}
            </View>
          )}
        </View>
      ))}
      {rows.length === 0 && <Text style={s.emptyTxt}>No audit entries yet</Text>}
    </ScrollView>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STYLES
   ══════════════════════════════════════════════════════════════════════ */

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  denied: { color: C.red, fontSize: 16, fontWeight: "600" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  backBtn: { padding: 8, marginRight: 8 },
  title: { fontSize: 24, fontWeight: "700", color: C.white, letterSpacing: 0.5 },
  subtitle: { color: C.muted, fontSize: 11, letterSpacing: 2, marginTop: 2 },
  tabBar: { paddingHorizontal: 16, gap: 6, paddingBottom: 12 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  tabActive: { backgroundColor: C.gold, borderColor: C.gold },
  tabTxt: { fontSize: 12, color: C.muted, fontWeight: "600" },
  tabTxtActive: { color: C.bg },
  badge: { backgroundColor: C.border, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 4 },
  badgeTxt: { fontSize: 9, fontWeight: "700", color: C.mutedLight },
  content: { padding: 16, paddingBottom: 80 },
  countTxt: { color: C.muted, fontSize: 11, marginBottom: 8, letterSpacing: 1 },
  emptyTxt: { color: C.muted, fontSize: 13, textAlign: "center", marginTop: 40 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, color: C.white, fontSize: 13 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  cardTitle: { color: C.white, fontSize: 14, fontWeight: "600" },
  cardSub: { color: C.muted, fontSize: 11, marginTop: 2 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: C.border },
  pillTxt: { fontSize: 9, fontWeight: "700", color: C.mutedLight, letterSpacing: 0.5 },
  cardWithActions: { position: "relative" },
  deleteBtn: { position: "absolute", right: 8, bottom: 14, padding: 6 },
  resetPwBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8, marginLeft: 14, marginTop: -4 },
  resetPwTxt: { fontSize: 10, color: C.amber, fontWeight: "600" },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: C.gold, letterSpacing: 2, marginBottom: 12 },
  settingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.card, borderRadius: 10, padding: 14, marginBottom: 6, borderWidth: 1, borderColor: C.border },
  settingLabel: { color: C.muted, fontSize: 12 },
  settingValue: { color: C.white, fontSize: 13, fontWeight: "600" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.gold, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, alignSelf: "center" },
  actionBtnTxt: { color: C.bg, fontWeight: "700", fontSize: 13 },
  auditCard: { backgroundColor: C.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  auditHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  auditModule: { fontSize: 12, fontWeight: "700", color: C.gold, textTransform: "uppercase" },
  auditAction: { fontSize: 11, color: C.mutedLight },
  auditUser: { fontSize: 10, color: C.muted, marginTop: 4 },
  auditChanges: { marginTop: 6, backgroundColor: C.cardAlt, borderRadius: 6, padding: 8 },
  auditChange: { fontSize: 10, color: C.mutedLight, lineHeight: 16 },
});

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 20 },
  modal: { backgroundColor: C.surface, borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, borderWidth: 1, borderColor: C.border },
  mHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  mTitle: { fontSize: 18, fontWeight: "700", color: C.white },
  field: { marginBottom: 12 },
  label: { fontSize: 11, color: C.muted, fontWeight: "600", letterSpacing: 1, marginBottom: 4 },
  input: { backgroundColor: C.card, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: C.white, fontSize: 13, borderWidth: 1, borderColor: C.border },
  boolBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  boolTxt: { color: C.white, fontSize: 13 },
  msg: { color: C.amber, fontSize: 12, textAlign: "center", marginVertical: 8 },
  mFooter: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 16 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  cancelTxt: { color: C.muted, fontWeight: "600", fontSize: 13 },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, backgroundColor: C.gold },
  saveTxt: { color: C.bg, fontWeight: "700", fontSize: 13 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border },
  metaTxt: { fontSize: 10, color: C.muted },
});
