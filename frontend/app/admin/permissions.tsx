import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

const C = {
  bg: "#0B0D14",
  surface: "#12141E",
  card: "#1A1D2A",
  gold: "#C5A059",
  white: "#F0ECE3",
  muted: "#6B6B7B",
  green: "#10B981",
  red: "#F87171",
  amber: "#F59E0B",
  blue: "#6366F1",
  border: "#2A2D3A",
};

const ACTION_ICONS: Record<string, string> = {
  view: "eye",
  edit: "edit-2",
  create: "plus-circle",
  delete: "trash-2",
};

const ACTION_COLORS: Record<string, string> = {
  view: C.blue,
  edit: C.gold,
  create: C.green,
  delete: C.red,
};

export default function PermissionsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [matrix, setMatrix] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [localPerms, setLocalPerms] = useState<any>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    api.getPermissionMatrix().then((data: any) => {
      setMatrix(data);
      if (data.roles?.length > 0 && !selectedRole) {
        // Select first non-ADMIN role
        const first = data.roles.find((r: any) => r.role !== "ADMIN");
        if (first) {
          setSelectedRole(first.role);
          setLocalPerms(JSON.parse(JSON.stringify(first.permissions)));
        }
      }
    }).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  if (user?.role !== "ADMIN") {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <View style={s.center}>
          <Text style={s.denied}>Access Denied — ADMIN only</Text>
        </View>
      </SafeAreaView>
    );
  }

  const selectRole = (role: string) => {
    if (dirty) {
      Alert.alert("Unsaved Changes", "Save before switching?", [
        { text: "Discard", style: "destructive", onPress: () => doSwitch(role) },
        { text: "Cancel" },
      ]);
    } else {
      doSwitch(role);
    }
  };

  const doSwitch = (role: string) => {
    setSelectedRole(role);
    const roleDoc = matrix?.roles?.find((r: any) => r.role === role);
    setLocalPerms(roleDoc ? JSON.parse(JSON.stringify(roleDoc.permissions)) : {});
    setDirty(false);
    setMsg("");
  };

  const toggle = (module: string, action: string) => {
    if (selectedRole === "ADMIN") return;
    const cur = localPerms[module]?.[action] ?? false;
    setLocalPerms({
      ...localPerms,
      [module]: { ...localPerms[module], [action]: !cur },
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg("");
    try {
      await api.patchRolePermissions(selectedRole, localPerms);
      setMsg("✅ Saved");
      setDirty(false);
      load();
    } catch (e: any) {
      setMsg("❌ " + (e.message || "Save failed"));
    }
    setSaving(false);
  };

  const handleReset = () => {
    Alert.alert(
      "Reset All Permissions",
      "Reset ALL roles to factory defaults? This cannot be undone.",
      [
        { text: "Cancel" },
        {
          text: "Reset All",
          style: "destructive",
          onPress: async () => {
            try {
              await api.resetPermissions();
              setMsg("✅ All permissions reset");
              setDirty(false);
              load();
            } catch (e: any) {
              setMsg("❌ " + e.message);
            }
          },
        },
      ]
    );
  };

  const modules = matrix?.modules || [];
  const actions = matrix?.actions || [];
  const roles = matrix?.roles || [];

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={C.white} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Permission Manager</Text>
          <Text style={s.subtitle}>ROLE PERMISSION MATRIX</Text>
        </View>
        <Pressable onPress={handleReset} style={s.resetBtn}>
          <Feather name="refresh-cw" size={14} color={C.amber} />
          <Text style={s.resetTxt}>Reset All</Text>
        </Pressable>
      </View>

      {/* Role selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.roleBar}
      >
        {roles.map((r: any) => (
          <Pressable
            key={r.role}
            style={[
              s.roleChip,
              selectedRole === r.role && s.roleChipActive,
              r.role === "ADMIN" && s.roleChipAdmin,
            ]}
            onPress={() => selectRole(r.role)}
          >
            <Text
              style={[
                s.roleChipTxt,
                selectedRole === r.role && s.roleChipTxtActive,
              ]}
            >
              {r.role.replace(/_/g, " ")}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Permission matrix */}
      <ScrollView contentContainerStyle={s.content}>
        {selectedRole === "ADMIN" && (
          <View style={s.adminBanner}>
            <Feather name="shield" size={16} color={C.gold} />
            <Text style={s.adminBannerTxt}>
              ADMIN has full access to all modules. Permissions cannot be modified.
            </Text>
          </View>
        )}

        {/* Action legend */}
        <View style={s.legend}>
          {actions.map((a: string) => (
            <View key={a} style={s.legendItem}>
              <Feather
                name={ACTION_ICONS[a] as any}
                size={12}
                color={ACTION_COLORS[a]}
              />
              <Text style={s.legendTxt}>{a.toUpperCase()}</Text>
            </View>
          ))}
        </View>

        {modules.map((mod: string) => (
          <View key={mod} style={s.moduleRow}>
            <Text style={s.moduleName}>{mod.toUpperCase()}</Text>
            <View style={s.actionRow}>
              {actions.map((act: string) => {
                const on = localPerms[mod]?.[act] ?? false;
                const isAdmin = selectedRole === "ADMIN";
                return (
                  <Pressable
                    key={act}
                    style={[
                      s.permToggle,
                      on && s.permToggleOn,
                      isAdmin && s.permToggleAdmin,
                    ]}
                    onPress={() => toggle(mod, act)}
                    disabled={isAdmin}
                  >
                    <Feather
                      name={ACTION_ICONS[act] as any}
                      size={14}
                      color={on ? (isAdmin ? C.gold : ACTION_COLORS[act]) : C.muted}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {msg ? <Text style={s.msg}>{msg}</Text> : null}

        {dirty && selectedRole !== "ADMIN" && (
          <Pressable
            style={s.saveBtn}
            onPress={handleSave}
            disabled={saving}
          >
            <Feather name="save" size={14} color={C.bg} />
            <Text style={s.saveBtnTxt}>
              {saving ? "Saving…" : `Save ${selectedRole}`}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  denied: { color: C.red, fontSize: 16, fontWeight: "600" },

  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 20,
    paddingTop: 8, paddingBottom: 12,
  },
  backBtn: { padding: 8, marginRight: 8 },
  title: { fontSize: 22, fontWeight: "700", color: C.white, letterSpacing: 0.5 },
  subtitle: { color: C.muted, fontSize: 10, letterSpacing: 2, marginTop: 2 },

  resetBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8,
    borderWidth: 1, borderColor: C.amber + "40",
  },
  resetTxt: { color: C.amber, fontSize: 11, fontWeight: "600" },

  roleBar: { paddingHorizontal: 16, gap: 6, paddingBottom: 12 },
  roleChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  roleChipActive: { backgroundColor: C.gold, borderColor: C.gold },
  roleChipAdmin: { borderColor: C.gold + "60" },
  roleChipTxt: { fontSize: 10, fontWeight: "700", color: C.muted, letterSpacing: 0.5 },
  roleChipTxtActive: { color: C.bg },

  content: { padding: 16, paddingBottom: 80 },

  adminBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.gold + "15", borderRadius: 10, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: C.gold + "30",
  },
  adminBannerTxt: { color: C.gold, fontSize: 12, flex: 1 },

  legend: { flexDirection: "row", gap: 16, marginBottom: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendTxt: { fontSize: 9, fontWeight: "700", color: C.muted, letterSpacing: 0.5 },

  moduleRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: C.card, borderRadius: 10, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: C.border,
  },
  moduleName: { fontSize: 11, fontWeight: "700", color: C.white, letterSpacing: 1, width: 100 },
  actionRow: { flexDirection: "row", gap: 8 },
  permToggle: {
    width: 36, height: 36, borderRadius: 8, alignItems: "center",
    justifyContent: "center", borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface,
  },
  permToggleOn: { borderColor: C.green + "60", backgroundColor: C.green + "15" },
  permToggleAdmin: { borderColor: C.gold + "40", backgroundColor: C.gold + "10" },

  msg: { color: C.amber, fontSize: 12, textAlign: "center", marginVertical: 12 },

  saveBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.gold, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 24,
    alignSelf: "center", marginTop: 16,
  },
  saveBtnTxt: { color: C.bg, fontWeight: "700", fontSize: 14 },
});
