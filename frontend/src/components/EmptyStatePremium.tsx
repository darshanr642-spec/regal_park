import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** dark theme variant (for portal/landowner) */
  dark?: boolean;
}

/**
 * Premium empty state component for zero-data screens.
 * Shows icon, title, optional subtitle, and optional CTA button.
 */
export function EmptyState({ icon, title, subtitle, actionLabel, onAction, dark }: EmptyStateProps) {
  const bg = dark ? "#242424" : "#F8F7F4";
  const border = dark ? "#3A3530" : "#E8E4DC";
  const iconBg = dark ? "#C5A05915" : "#D4A85515";
  const iconColor = dark ? "#C5A059" : "#D4A855";
  const titleColor = dark ? "#F5F0E8" : "#2C2418";
  const subColor = dark ? "#8A8070" : "#8A8070";
  const btnBg = dark ? "#C5A059" : "#D4A855";
  const btnText = dark ? "#1A1A1A" : "#fff";

  return (
    <View style={[styles.root, { backgroundColor: bg, borderColor: border }]}>
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Feather name={icon as any} size={28} color={iconColor} />
      </View>
      <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
      {subtitle ? <Text style={[styles.sub, { color: subColor }]}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable style={[styles.btn, { backgroundColor: btnBg }]} onPress={onAction}>
          <Text style={[styles.btnTxt, { color: btnText }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
    marginHorizontal: 16,
    marginVertical: 24,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  sub: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
  btn: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  btnTxt: {
    fontWeight: "700",
    fontSize: 13,
  },
});
