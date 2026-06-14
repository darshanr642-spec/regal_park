import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/lib/auth";
import { LogoutButton } from "@/src/components/LogoutButton";
import { Watermark } from "@/src/components/Watermark";
import { colors, font, radii, shadow, spacing } from "@/src/lib/theme";

const MENU = [
  { label: "BOQ & Cost Control", icon: "list", route: "/module/boq", internal: true },
  { label: "Procurement", icon: "truck", route: "/module/procurement", internal: true },
  { label: "Contractor Billing", icon: "credit-card", route: "/module/billing", internal: true },
  { label: "Team & Responsibility", icon: "users", route: "/module/team", internal: false },
  { label: "Approvals", icon: "check-square", route: "/module/approvals", internal: false },
  { label: "Documents & Drawings", icon: "folder", route: "/module/documents", internal: false },
  { label: "PDF Reports", icon: "file-text", route: "/module/reports", internal: true },
  { label: "Client Portal View", icon: "key", route: "/module/client", internal: false },
];

const CRM_MENU = [
  { label: "Sales Dashboard", icon: "bar-chart-2", route: "/crm/dashboard" },
  { label: "Leads", icon: "user-plus", route: "/crm/leads" },
  { label: "Inventory", icon: "grid", route: "/crm/inventory" },
  { label: "Site Visits", icon: "calendar", route: "/crm/visits" },
  { label: "Quotations", icon: "file-text", route: "/crm/quotation" },
  { label: "Bookings", icon: "check-circle", route: "/crm/bookings" },
  { label: "Booking Approvals", icon: "shield", route: "/approvals/bookings" },
  { label: "Discount Approvals", icon: "percent", route: "/approvals/discounts" },
  { label: "Pricing", icon: "dollar-sign", route: "/crm/pricing" },
];

const PORTAL_MENU = [
  { label: "My Villa", icon: "home", route: "/portal/home" },
  { label: "Timeline", icon: "clock", route: "/portal/timeline" },
  { label: "Payments", icon: "credit-card", route: "/portal/payments" },
];

export default function Profile() {
  const { user } = useAuth();
  const router = useRouter();
  const initials = (user?.full_name || "RP").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const menu = user?.role === "CLIENT" ? MENU.filter((m) => !m.internal) : MENU;
  const showCrm = user?.role !== "CLIENT";
  const isClient = user?.role === "CLIENT";

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Watermark />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <View style={styles.profileCard} testID="profile-card">
          <View style={styles.avatar}><Text style={styles.avatarTxt}>{initials}</Text></View>
          <Text style={styles.name}>{user?.full_name}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.roleTxt}>{user?.role.replace(/_/g, " ")}</Text>
          </View>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <Text style={styles.sectionHead}>MODULES</Text>
        {menu.map((m) => (
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

        {showCrm && (
          <>
            <Text style={styles.sectionHead}>CRM & SALES</Text>
            {CRM_MENU.map((m) => (
              <Pressable
                key={m.label}
                testID={`crm-${m.label.replace(/[\s&]+/g, "-").toLowerCase()}`}
                style={styles.row}
                onPress={() => router.push(m.route as any)}
              >
                <View style={styles.rowIcon}><Feather name={m.icon as any} size={18} color={colors.success} /></View>
                <Text style={styles.rowLabel}>{m.label}</Text>
                <Feather name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </>
        )}

        {(isClient || user?.role === "ADMIN") && (
          <>
            <Text style={styles.sectionHead}>MY VILLA PORTAL</Text>
            {PORTAL_MENU.map((m) => (
              <Pressable
                key={m.label}
                testID={`portal-${m.label.replace(/[\s&]+/g, "-").toLowerCase()}`}
                style={styles.row}
                onPress={() => router.push(m.route as any)}
              >
                <View style={styles.rowIcon}><Feather name={m.icon as any} size={18} color={colors.brand} /></View>
                <Text style={styles.rowLabel}>{m.label}</Text>
                <Feather name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </>
        )}
        {(user?.role === "COO" || user?.role === "ADMIN") && (
          <>
            <Text style={styles.sectionHead}>EXECUTIVE</Text>
            <Pressable
              testID="coo-command-centre"
              style={styles.row}
              onPress={() => router.push("/coo/dashboard" as any)}
            >
              <View style={styles.rowIcon}><Feather name="activity" size={18} color={colors.error} /></View>
              <Text style={styles.rowLabel}>COO Command Centre</Text>
              <Feather name="chevron-right" size={18} color={colors.muted} />
            </Pressable>
          </>
        )}

        {user?.role === "ADMIN" && (
          <>
            <Text style={styles.sectionHead}>ADMINISTRATION</Text>
            <Pressable
              testID="admin-edit-center"
              style={styles.row}
              onPress={() => router.push("/admin/edit-center" as any)}
            >
              <View style={styles.rowIcon}><Feather name="sliders" size={18} color="#C5A059" /></View>
              <Text style={styles.rowLabel}>Admin Edit Center</Text>
              <Feather name="chevron-right" size={18} color={colors.muted} />
            </Pressable>
          </>
        )}

        <Text style={styles.sectionHead}>ACCOUNT</Text>
        <LogoutButton />

        <View style={styles.footer} testID="brand-footer">
          <Text style={styles.footerBrand}>STERLITEE DEVELOPERS LLP</Text>
          <Text style={styles.footerApp}>Regal Park Villas · v1.2</Text>
        </View>
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
  sectionHead: { marginTop: spacing.xxl, marginBottom: spacing.sm, color: colors.muted, fontSize: 10, letterSpacing: 2 },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  rowIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary, marginRight: spacing.md },
  rowLabel: { flex: 1, color: colors.onSurface, fontSize: 14, fontWeight: "500" },
  logout: { borderColor: "#F1D6D6", backgroundColor: "#FBF3F3" },
  footer: { alignItems: "center", marginTop: spacing.xxl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider },
  footerBrand: { fontFamily: font.display, fontSize: 13, color: colors.brand, letterSpacing: 3 },
  footerApp: { color: colors.muted, fontSize: 11, marginTop: 4, letterSpacing: 1 },
});
