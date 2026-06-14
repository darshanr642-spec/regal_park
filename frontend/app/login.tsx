import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/lib/auth";
import { colors, font, radii, spacing } from "@/src/lib/theme";

// Demo accounts — only visible in development builds (CRIT-6)
const DEMO_ACCOUNTS = __DEV__
  ? [
      { label: "Admin", email: "admin@regalpark.com", pw: "Admin@123" },
      { label: "COO", email: "coo@regalpark.com", pw: "Coo@123" },
      { label: "Sales Mgr", email: "salesmgr@regalpark.com", pw: "SalesMgr@123" },
      { label: "Project Manager", email: "manager@regalpark.com", pw: "Manager@123" },
      { label: "Site Engineer", email: "siteengineer@regalpark.com", pw: "Site@123" },
      { label: "Client", email: "client@regalpark.com", pw: "Client@123" },
    ]
  : [];

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <Image
        source="https://images.pexels.com/photos/29334668/pexels-photo-29334668.png?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
      />
      <LinearGradient
        colors={["rgba(26,26,26,0.35)", "rgba(26,26,26,0.95)"]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.brandBlock}>
              <Image
                source={require("@/assets/brand/sterlitee-mark.png")}
                style={styles.brandLogo}
                contentFit="contain"
              />
              <Text style={styles.brandName}>REGAL PARK VILLAS</Text>
              <Text style={styles.brandTag}>Turnkey luxury villa management</Text>
              <Text style={styles.brandParent}>BY STERLITEE DEVELOPERS LLP</Text>
            </View>

            <View style={styles.card} testID="login-card">
              <Text style={styles.cardTitle}>Sign in to your portal</Text>
              <Text style={styles.label}>Email</Text>
              <TextInput
                testID="login-email"
                style={styles.input}
                placeholder="you@regalpark.com"
                placeholderTextColor="#9c9182"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <Text style={styles.label}>Password</Text>
              <TextInput
                testID="login-password"
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#9c9182"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <Pressable
                testID="login-submit-button"
                onPress={submit}
                style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <Text style={styles.ctaText}>SIGN IN</Text>
                )}
              </Pressable>

              {DEMO_ACCOUNTS.length > 0 && (
                <>
                  <Text style={styles.demoTitle}>Dev Accounts</Text>
                  <View style={styles.demoRow}>
                    {DEMO_ACCOUNTS.map((a) => (
                      <Pressable
                        key={a.email}
                        testID={`demo-${a.label.replace(/\s/g, "-").toLowerCase()}`}
                        style={styles.demoChip}
                        onPress={() => {
                          setEmail(a.email);
                          setPassword(a.pw);
                        }}
                      >
                        <Text style={styles.demoChipText}>{a.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceInverse },
  scroll: { flexGrow: 1, justifyContent: "space-between", padding: spacing.xl, paddingTop: spacing.xxxl },
  brandBlock: { alignItems: "center", marginTop: spacing.xxl },
  brandLogo: { width: 110, height: 100 },
  brandName: {
    fontFamily: font.display,
    color: "#fff",
    fontSize: 22,
    letterSpacing: 6,
    marginTop: spacing.sm,
  },
  brandTag: { color: colors.brandTertiary, marginTop: spacing.xs, letterSpacing: 1.4, fontSize: 11 },
  brandParent: { color: "rgba(238,221,130,0.7)", marginTop: spacing.md, letterSpacing: 3, fontSize: 9, fontWeight: "600" },
  card: {
    backgroundColor: "rgba(250,250,250,0.96)",
    borderRadius: radii.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginTop: spacing.xxl,
  },
  cardTitle: {
    fontFamily: font.display,
    fontSize: 22,
    color: colors.onSurface,
    marginBottom: spacing.lg,
  },
  label: { fontSize: 11, color: colors.muted, letterSpacing: 1.5, marginTop: spacing.md, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    fontSize: 15,
  },
  err: { color: colors.error, marginTop: spacing.md, fontSize: 13 },
  cta: {
    marginTop: spacing.xl,
    backgroundColor: colors.surfaceInverse,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    alignItems: "center",
  },
  ctaText: { color: colors.brandSecondary, letterSpacing: 3, fontWeight: "600", fontSize: 13 },
  demoTitle: { marginTop: spacing.xl, color: colors.muted, fontSize: 11, letterSpacing: 1.5 },
  demoRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  demoChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    backgroundColor: "#FFF8E1",
  },
  demoChipText: { color: colors.brand, fontSize: 12, fontWeight: "500" },
});
