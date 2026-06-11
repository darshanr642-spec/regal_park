import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { api, fileUri } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useProject } from "@/src/lib/project";
import { pickImage } from "@/src/lib/uploads";
import { PhotoLightbox } from "@/src/components/PhotoLightbox";
import { Watermark } from "@/src/components/Watermark";
import { colors, font, radii, shadow, spacing, statusColor } from "@/src/lib/theme";

type Tab = "LOGS" | "QUALITY" | "SNAGS";

const QUALITY_EDIT_ROLES = ["ADMIN", "PROJECT_MANAGER", "SITE_ENGINEER", "QUANTITY_SURVEYOR", "SAFETY_OFFICER"];
const SIGNOFF_ROLES = ["ADMIN", "PROJECT_MANAGER", "QUANTITY_SURVEYOR"];

export default function Site() {
  const [tab, setTab] = useState<Tab>("LOGS");
  const { user } = useAuth();
  const { current: project, projects, setCurrent } = useProject();
  const [reports, setReports] = useState<any[]>([]);
  const [quality, setQuality] = useState<any[]>([]);
  const [snags, setSnags] = useState<any[]>([]);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ work_completed: "", labour_count: "", weather: "Sunny, 32°C", tomorrow_plan: "", materials_received: "", machinery_used: "", safety_observations: "", issues: "", photos: [] as string[] });
  const [lightbox, setLightbox] = useState<{ uris: string[]; idx: number } | null>(null);
  const [showAddChecklist, setShowAddChecklist] = useState(false);

  const role = user?.role || "";
  const canEditQuality = QUALITY_EDIT_ROLES.includes(role);
  const canSignOff = SIGNOFF_ROLES.includes(role);
  const isClient = role === "CLIENT";

  const load = useCallback(async () => {
    if (!project) { setLoading(false); return; }
    try {
      const [r, q, s, cl, tpl] = await Promise.all([
        api.reports(project.id),
        api.quality(project.id),
        api.snags(project.id),
        api.stageChecklists(project.id).catch(() => []),
        isClient ? Promise.resolve([]) : api.checklistTemplates().catch(() => []),
      ]);
      setReports(r);
      setQuality(q);
      setSnags(s);
      setChecklists(cl);
      setTemplates(tpl);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [project, isClient]);

  useEffect(() => { load(); }, [load]);

  const addPhoto = async () => {
    setUploading(true);
    try {
      const url = await pickImage();
      if (url) setForm((f) => ({ ...f, photos: [...f.photos, url] }));
    } catch {}
    finally { setUploading(false); }
  };
  const removePhoto = (idx: number) => setForm({ ...form, photos: form.photos.filter((_, i) => i !== idx) });

  const submitReport = async () => {
    if (!project) return;
    try {
      const body = {
        project_id: project.id,
        date: new Date().toISOString().slice(0, 10),
        labour_count: parseInt(form.labour_count || "0", 10),
        work_completed: form.work_completed,
        materials_received: form.materials_received,
        machinery_used: form.machinery_used,
        issues: form.issues,
        tomorrow_plan: form.tomorrow_plan,
        weather: form.weather,
        safety_observations: form.safety_observations,
        photos: form.photos,
      };
      const rec = await api.createReport(body);
      setReports([rec, ...reports]);
      setShowForm(false);
      setForm({ ...form, work_completed: "", labour_count: "", tomorrow_plan: "", photos: [] });
    } catch (e) { /* */ }
  };

  const toggleQuality = async (q: any) => {
    if (!canEditQuality) return;
    const next = q.result === "PASS" ? "FAIL" : q.result === "FAIL" ? "PENDING" : "PASS";
    try {
      const updated = await api.patchQuality(q.id, { result: next });
      setQuality(quality.map((x) => (x.id === q.id ? updated : x)));
    } catch {}
  };

  const toggleSnag = async (s: any) => {
    if (isClient) return;
    const order = ["OPEN", "IN_PROGRESS", "RESOLVED"];
    const next = order[(order.indexOf(s.status) + 1) % order.length];
    try {
      const updated = await api.patchSnag(s.id, { status: next });
      setSnags(snags.map((x) => (x.id === s.id ? updated : x)));
    } catch {}
  };

  const attachSnagPhoto = async (s: any) => {
    try {
      const url = await pickImage();
      if (!url) return;
      const updated = await api.patchSnag(s.id, { photos: [...(s.photos || []), url] });
      setSnags(snags.map((x) => (x.id === s.id ? updated : x)));
    } catch {}
  };

  // ---- Stage checklist actions ----
  const toggleChecklistItem = async (cl: any, item: any) => {
    if (!canEditQuality || cl.signed_off) return;
    const next = item.status === "PENDING" ? "PASS" : item.status === "PASS" ? "FAIL" : "PENDING";
    try {
      const updated = await api.patchChecklistItem(cl.id, item.id, { status: next });
      setChecklists(checklists.map((c) => (c.id === cl.id ? updated : c)));
    } catch {}
  };

  const signOff = async (cl: any) => {
    try {
      const updated = await api.signOffChecklist(cl.id);
      setChecklists(checklists.map((c) => (c.id === cl.id ? updated : c)));
    } catch {}
  };

  const addChecklist = async (stageName: string) => {
    if (!project) return;
    try {
      const created = await api.createStageChecklist({ project_id: project.id, stage_name: stageName });
      setChecklists([...checklists, created]);
      setShowAddChecklist(false);
    } catch {}
  };

  const availableTemplates = templates.filter(
    (t) => !checklists.some((c) => c.stage_name === t.stage_name),
  );

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <View style={styles.header}>
        <Text style={styles.title}>Site Operations</Text>
        <Text style={styles.sub}>{project?.name} · {project?.plot_number}</Text>
      </View>

      {projects.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {projects.map((p) => (
            <Pressable
              key={p.id}
              testID={`site-project-chip-${p.id}`}
              style={[styles.chip, project?.id === p.id && styles.chipActive]}
              onPress={() => setCurrent(p)}
            >
              <Text style={[styles.chipText, project?.id === p.id && styles.chipTextActive]}>{p.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.segment}>
        {(["LOGS", "QUALITY", "SNAGS"] as Tab[]).map((t) => (
          <Pressable
            key={t}
            testID={`site-tab-${t.toLowerCase()}`}
            style={[styles.segItem, tab === t && styles.segActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.segText, tab === t && styles.segTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {tab === "LOGS" && (
          <>
            {!showForm && !isClient && (
              <Pressable testID="add-site-report" style={styles.cta} onPress={() => setShowForm(true)}>
                <Feather name="plus-circle" size={16} color={colors.brandSecondary} />
                <Text style={styles.ctaText}>NEW DAILY REPORT</Text>
              </Pressable>
            )}
            {showForm && (
              <View style={styles.formCard} testID="report-form">
                <Text style={styles.formTitle}>New Daily Site Report</Text>
                {([
                  ["Labour count", "labour_count", "number"],
                  ["Work completed today", "work_completed", "multi"],
                  ["Materials received", "materials_received", "multi"],
                  ["Machinery used", "machinery_used", "single"],
                  ["Weather", "weather", "single"],
                  ["Issues / Blockers", "issues", "multi"],
                  ["Safety observations", "safety_observations", "multi"],
                  ["Tomorrow's plan", "tomorrow_plan", "multi"],
                ] as const).map(([label, key, mode]) => (
                  <View key={key} style={{ marginTop: spacing.md }}>
                    <Text style={styles.label}>{label}</Text>
                    <TextInput
                      style={[styles.input, mode === "multi" && { minHeight: 60 }]}
                      multiline={mode === "multi"}
                      keyboardType={mode === "number" ? "number-pad" : "default"}
                      value={(form as any)[key]}
                      onChangeText={(v) => setForm({ ...form, [key]: v })}
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                ))}

                {/* Photo grid */}
                <View style={{ marginTop: spacing.md }}>
                  <Text style={styles.label}>Site photos ({form.photos.length})</Text>
                  <View style={styles.photoGrid}>
                    {form.photos.map((p, i) => (
                      <Pressable key={i} onPress={() => removePhoto(i)} style={styles.photoTile} testID={`form-photo-${i}`}>
                        <Image source={fileUri(p)} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                        <View style={styles.photoX}><Feather name="x" size={12} color="#fff" /></View>
                      </Pressable>
                    ))}
                    <Pressable testID="add-photo-button" onPress={addPhoto} style={[styles.photoTile, styles.photoAdd]} disabled={uploading}>
                      {uploading ? <ActivityIndicator size="small" color={colors.brand} /> : (
                        <>
                          <Feather name="camera" size={20} color={colors.brand} />
                          <Text style={styles.photoAddTxt}>Add</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
                  <Pressable style={[styles.cta, { flex: 1, backgroundColor: colors.surfaceTertiary }]} onPress={() => setShowForm(false)}>
                    <Text style={[styles.ctaText, { color: colors.onSurface }]}>CANCEL</Text>
                  </Pressable>
                  <Pressable testID="submit-report" style={[styles.cta, { flex: 1 }]} onPress={submitReport}>
                    <Text style={styles.ctaText}>SUBMIT</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {reports.map((r) => (
              <View key={r.id} style={styles.card} testID={`report-${r.id}`}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardDate}>{r.date}</Text>
                  <Text style={styles.cardChip}>{r.labour_count} workers</Text>
                </View>
                <Text style={styles.cardBody}>{r.work_completed}</Text>
                {r.photos && r.photos.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
                    {r.photos.map((p: string, i: number) => (
                      <Pressable key={i} onPress={() => setLightbox({ uris: r.photos.map(fileUri), idx: i })} testID={`report-photo-${r.id}-${i}`}>
                        <Image source={fileUri(p)} style={styles.reportPhoto} contentFit="cover" />
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
                <View style={styles.cardFooter}>
                  <Text style={styles.metaTxt}>{r.weather}</Text>
                  <Text style={styles.metaTxt}>{r.submitted_by}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {tab === "QUALITY" && (
          <>
            {/* Stage checklists */}
            <Text style={styles.sectionHead} testID="stage-checklists-section">STAGE CHECKLISTS</Text>
            {checklists.length === 0 && (
              <Text style={styles.emptyTxt}>No stage checklists yet.</Text>
            )}
            {checklists.map((cl) => {
              const passCount = cl.items.filter((i: any) => i.status === "PASS").length;
              const allPass = passCount === cl.items.length;
              return (
                <View key={cl.id} style={styles.card} testID={`checklist-${cl.id}`}>
                  <View style={styles.cardHead}>
                    <Text style={styles.checklistTitle}>{cl.stage_name}</Text>
                    {cl.signed_off ? (
                      <View style={[styles.statusPill, { borderColor: colors.success, backgroundColor: "#EAF3ED" }]}>
                        <Text style={[styles.statusPillText, { color: colors.success }]}>SIGNED OFF</Text>
                      </View>
                    ) : (
                      <Text style={styles.checklistProgress}>{passCount}/{cl.items.length} PASS</Text>
                    )}
                  </View>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${(passCount / cl.items.length) * 100}%` }]} />
                  </View>
                  {cl.items.map((item: any) => (
                    <Pressable
                      key={item.id}
                      testID={`checklist-item-${item.id}`}
                      style={styles.checkItem}
                      onPress={() => toggleChecklistItem(cl, item)}
                      disabled={!canEditQuality || cl.signed_off}
                    >
                      <Feather
                        name={item.status === "PASS" ? "check-circle" : item.status === "FAIL" ? "x-circle" : "circle"}
                        size={16}
                        color={statusColor(item.status)}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.checkItemTxt}>{item.text}</Text>
                        {item.checked_by && (
                          <Text style={styles.checkItemMeta}>
                            {item.status} · {item.checked_by}{item.remarks ? ` — ${item.remarks}` : ""}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  ))}
                  {!cl.signed_off && canSignOff && (
                    <Pressable
                      testID={`signoff-${cl.id}`}
                      onPress={() => signOff(cl)}
                      disabled={!allPass}
                      style={[styles.signOffBtn, !allPass && { opacity: 0.4 }]}
                    >
                      <Feather name="award" size={14} color={colors.brandSecondary} />
                      <Text style={styles.signOffTxt}>{allPass ? "SIGN OFF STAGE" : "ALL ITEMS MUST PASS"}</Text>
                    </Pressable>
                  )}
                  {cl.signed_off && (
                    <Text style={styles.metaTxt}>Signed off by {cl.signed_off_by} · {cl.signed_off_at?.slice(0, 10)}</Text>
                  )}
                </View>
              );
            })}

            {canEditQuality && availableTemplates.length > 0 && (
              <>
                {!showAddChecklist ? (
                  <Pressable testID="add-checklist-button" style={styles.cta} onPress={() => setShowAddChecklist(true)}>
                    <Feather name="plus-circle" size={16} color={colors.brandSecondary} />
                    <Text style={styles.ctaText}>NEW STAGE CHECKLIST</Text>
                  </Pressable>
                ) : (
                  <View style={styles.formCard}>
                    <Text style={styles.label}>Choose a stage template</Text>
                    <View style={styles.templateRow}>
                      {availableTemplates.map((t) => (
                        <Pressable key={t.id} testID={`template-${t.stage_name.replace(/\s/g, "-").toLowerCase()}`} style={styles.templateChip} onPress={() => addChecklist(t.stage_name)}>
                          <Text style={styles.templateChipTxt}>{t.stage_name}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Pressable onPress={() => setShowAddChecklist(false)} style={{ marginTop: spacing.md, alignSelf: "center" }}>
                      <Text style={{ color: colors.muted, fontSize: 11, letterSpacing: 1 }}>CANCEL</Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}

            {/* Ad-hoc quality checks */}
            <Text style={styles.sectionHead}>AD-HOC QUALITY CHECKS</Text>
            {quality.map((q) => (
              <Pressable key={q.id} testID={`quality-${q.id}`} style={styles.card} onPress={() => toggleQuality(q)}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardChip}>{q.checklist_type}</Text>
                  <View style={[styles.statusPill, { borderColor: statusColor(q.result) }]}>
                    <Text style={[styles.statusPillText, { color: statusColor(q.result) }]}>{q.result}</Text>
                  </View>
                </View>
                <Text style={styles.cardBody}>{q.item}</Text>
                <Text style={styles.metaTxt}>{q.remarks} · {q.responsible}</Text>
              </Pressable>
            ))}
          </>
        )}

        {tab === "SNAGS" && snags.map((s) => (
          <View key={s.id} style={styles.card} testID={`snag-${s.id}`}>
            <Pressable onPress={() => toggleSnag(s)}>
              <View style={styles.cardHead}>
                <Text style={styles.cardChip}>{s.room}</Text>
                <View style={[styles.statusPill, { borderColor: statusColor(s.status) }]}>
                  <Text style={[styles.statusPillText, { color: statusColor(s.status) }]}>{s.status.replace("_", " ")}</Text>
                </View>
              </View>
              <Text style={styles.cardBody}>{s.issue}</Text>
              <Text style={styles.metaTxt}>{s.category} · {s.assigned_contractor} · by {s.deadline}</Text>
            </Pressable>
            {s.photos && s.photos.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
                {s.photos.map((p: string, i: number) => (
                  <Pressable key={i} onPress={() => setLightbox({ uris: s.photos.map(fileUri), idx: i })} testID={`snag-photo-${s.id}-${i}`}>
                    <Image source={fileUri(p)} style={styles.reportPhoto} contentFit="cover" />
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {!isClient && (
              <Pressable testID={`snag-add-photo-${s.id}`} onPress={() => attachSnagPhoto(s)} style={styles.snagAddBtn}>
                <Feather name="camera" size={14} color={colors.brand} />
                <Text style={styles.snagAddTxt}>ATTACH PHOTO</Text>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>
      <PhotoLightbox
        visible={!!lightbox}
        uris={lightbox?.uris || []}
        initialIndex={lightbox?.idx || 0}
        onClose={() => setLightbox(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontFamily: font.display, fontSize: 24, color: colors.onSurface },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
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
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  cardDate: { color: colors.onSurface, fontFamily: font.display, fontSize: 16 },
  cardChip: { fontSize: 10, letterSpacing: 1.5, color: colors.brand, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.sm, overflow: "hidden", fontWeight: "700" },
  cardBody: { color: colors.onSurface, fontSize: 14, lineHeight: 20 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  metaTxt: { color: colors.muted, fontSize: 11, marginTop: spacing.xs },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, borderWidth: 1 },
  statusPillText: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  cta: { flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceInverse, padding: spacing.lg, borderRadius: radii.md, marginBottom: spacing.lg },
  ctaText: { color: colors.brandSecondary, letterSpacing: 2, fontSize: 12, fontWeight: "600" },
  formCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  formTitle: { fontFamily: font.display, fontSize: 18, color: colors.onSurface, marginBottom: spacing.sm },
  label: { fontSize: 10, color: colors.muted, letterSpacing: 1.5, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, padding: spacing.md, fontSize: 14, color: colors.onSurface, backgroundColor: colors.surface },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photoTile: { width: 72, height: 72, borderRadius: radii.sm, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  photoAdd: { alignItems: "center", justifyContent: "center", borderStyle: "dashed", gap: 4 },
  photoAddTxt: { color: colors.brand, fontSize: 9, letterSpacing: 1 },
  photoX: { position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  reportPhoto: { width: 100, height: 100, borderRadius: radii.sm, marginRight: spacing.sm },
  snagAddBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radii.pill },
  snagAddTxt: { color: colors.brand, fontSize: 10, letterSpacing: 1.2, fontWeight: "600" },

  // Stage checklists
  sectionHead: { color: colors.muted, fontSize: 10, letterSpacing: 2, marginBottom: spacing.sm, marginTop: spacing.md },
  checklistTitle: { fontFamily: font.display, fontSize: 17, color: colors.onSurface },
  checklistProgress: { color: colors.brand, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
  barFill: { height: 4, borderRadius: 2, backgroundColor: colors.brandSecondary },
  checkItem: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  checkItemTxt: { color: colors.onSurface, fontSize: 13, lineHeight: 18 },
  checkItemMeta: { color: colors.muted, fontSize: 10, marginTop: 2 },
  signOffBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md, backgroundColor: colors.surfaceInverse, paddingVertical: spacing.md, borderRadius: radii.md },
  signOffTxt: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 1.5, fontWeight: "700" },
  templateRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  templateChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: "#FFF8E1" },
  templateChipTxt: { color: colors.brand, fontSize: 12, fontWeight: "500" },
  emptyTxt: { color: colors.muted, fontSize: 13, textAlign: "center", paddingVertical: spacing.md, fontStyle: "italic" },
});
