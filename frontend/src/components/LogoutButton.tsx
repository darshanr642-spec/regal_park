import React from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/lib/auth";

interface LogoutButtonProps {
  /** Use dark theme (for portal, landowner dark backgrounds) */
  dark?: boolean;
  /** Custom label text */
  label?: string;
  /** Compact style (icon only) for headers */
  compact?: boolean;
}

/**
 * Universal logout button that works for EVERY role.
 *
 * Drop into any dashboard/page. Handles:
 * - Calling auth logout (revokes refresh token)
 * - Clearing local tokens even if revoke fails
 * - Redirecting to /login
 */
export function LogoutButton({ dark, label = "Sign Out", compact }: LogoutButtonProps) {
  const { logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Even if the server-side revoke fails, tokens are cleared by auth context
    }
    router.replace("/login");
  };

  if (compact) {
    return (
      <Pressable onPress={handleLogout} style={styles.compact} testID="logout-compact">
        <Feather name="log-out" size={20} color={dark ? "#C5A059" : "#E74C3C"} />
      </Pressable>
    );
  }

  return (
    <Pressable
      testID="logout-button"
      style={[styles.row, dark ? styles.rowDark : styles.rowLight]}
      onPress={handleLogout}
    >
      <View style={[styles.icon, dark ? styles.iconDark : styles.iconLight]}>
        <Feather name="log-out" size={16} color={dark ? "#C5A059" : "#E74C3C"} />
      </View>
      <Text style={[styles.label, dark ? styles.labelDark : styles.labelLight]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  compact: {
    padding: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  rowLight: {
    backgroundColor: "#FBF3F3",
    borderColor: "#F1D6D6",
  },
  rowDark: {
    backgroundColor: "#2A2420",
    borderColor: "#3A3530",
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconLight: {
    backgroundColor: "#FDEAEA",
  },
  iconDark: {
    backgroundColor: "#C5A05915",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  labelLight: {
    color: "#E74C3C",
  },
  labelDark: {
    color: "#C5A059",
  },
});
