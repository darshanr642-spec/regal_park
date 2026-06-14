import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter, usePathname, Redirect } from "expo-router";
import { useAuth } from "@/src/lib/auth";
import { isRoleAllowed, getHomeForRole } from "@/src/lib/roles";
import { Feather } from "@expo/vector-icons";

/**
 * RouteGuard — drop into any layout/page to enforce role-based access.
 *
 * If the current user's role is not allowed for the current path,
 * it shows an "Access Denied" screen with a button back to their home.
 */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (loading) return null;

  // ── Skip guard on unprotected paths (prevents redirect loops) ────
  const unguarded = pathname === "/login" || pathname === "/" || pathname === "";
  if (unguarded) return <>{children}</>;

  // ── Not logged in → send to login (but only from protected pages) ─
  if (!user) return <Redirect href="/login" />;

  if (!isRoleAllowed(user.role, pathname)) {
    const home = getHomeForRole(user.role);
    return (
      <View style={s.root}>
        <View style={s.card}>
          <View style={s.iconWrap}>
            <Feather name="shield-off" size={32} color="#F87171" />
          </View>
          <Text style={s.title}>Access Denied</Text>
          <Text style={s.sub}>
            Your role ({user.role}) does not have permission to access this page.
          </Text>
          <Pressable
            style={s.btn}
            onPress={() => router.replace(home as any)}
          >
            <Feather name="home" size={14} color="#fff" />
            <Text style={s.btnTxt}>Go to Dashboard</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0F1117",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#181C28",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    maxWidth: 360,
    width: "100%",
    borderWidth: 1,
    borderColor: "#F8717125",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F8717115",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    color: "#F0ECE3",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  sub: {
    color: "#6B6B7B",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#10B981",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  btnTxt: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
});
