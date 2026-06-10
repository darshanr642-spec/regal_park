import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/lib/auth";
import { colors, font, radii, shadow, spacing } from "@/src/lib/theme";

const MENU = [
  { label: "BOQ & Cost Control", icon: "list", route: "/module/boq" },
  { label: "Procurement", icon: "truck", route: "/module/procurement" },
  { label: "Contractor Billing", icon: "credit-card", route: "/module/billing" },
  { label: "Team & Responsibility", icon: "users", route: "/module/team" },
  { label: "Approvals", icon: "check-square", route: "/module/approvals" },
  { label: "Documents & Drawings", icon: "folder", route: "/module/documents" },
  { label: "PDF Reports", icon: "file-text", route: "/module/reports" },
  { label: "Client Portal View", icon: "key", route: "/module/client" },
];

export default function Profile() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const initials = (user?.full_name || "RP").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <View style={styles.profileCard} testID="profile-card">
          <View style={styles.avatar}><Text style={styles.avatarTxt}>{initials}</Text></View>
          <Text style={styles.name}>{user?.full_name}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.roleTxt}>{user?.role.replace(/_/g, " ")}</Text>
          </View>
          <Text style={styles.email}>{user?.email}</Text>
          {user?.company && <Text style={styles.company}>{user.company}</Text>}
        </View>

        <Text style={styles.sectionHead}>MODULES</Text>
        {MENU.map((m) => (
          <Pressable
            key={m.label}
            testID={`menu-${m.label.replace(/[\s&]+/g, "-").toLowerCase()}`}
            style={styles.row}
            onPress={() => router.push(m.route as any)}
          >
            <View style={styles.rowIcon}><Feather name={m.icon as any} size={18} color={colors.brand} /></View>
            <Text style={styles.rowLabel}>{m.label}</Text>
            <Feather name="chevron-right" size={18} color={colors.muted} />
          </Pressable>
        ))}

        <Text style={styles.sectionHead}>ACCOUNT</Text>
        <Pressable testID="logout-button" style={[styles.row, styles.logout]} onPress={logout}>
          <View style={styles.rowIcon}><Feather name="log-out" size={18} color={colors.error} /></View>
          <Text style={[styles.rowLabel, { color: colors.error }]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  profileCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.xl, borderRadius: radii.lg, alignItems: "center", borderWidth: 1, borderColor: colors.border, ...shadow.card },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontFamily: font.display, fontSize: 34, color: colors.onBrandTertiary, fontWeight: "700" },
  name: { fontFamily: font.display, fontSize: 22, color: colors.onSurface, marginTop: spacing.md },
  rolePill: { marginTop: spacing.sm, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radii.pill },
  roleTxt: { color: colors.onBrandTertiary, fontSize: 10, letterSpacing: 1.5, fontWeight: "700" },
  email: { color: colors.muted, fontSize: 12, marginTop: spacing.sm },
  company: { color: colors.muted, fontSize: 12, marginTop: 2 },
  sectionHead: { marginTop: spacing.xxl, marginBottom: spacing.sm, color: colors.muted, fontSize: 10, letterSpacing: 2 },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  rowIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary, marginRight: spacing.md },
  rowLabel: { flex: 1, color: colors.onSurface, fontSize: 14, fontWeight: "500" },
  logout: { borderColor: "#F1D6D6", backgroundColor: "#FBF3F3" },
});
