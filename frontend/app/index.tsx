import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/src/lib/auth";
import { getHomeForRole } from "@/src/lib/roles";
import { colors } from "@/src/lib/theme";

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  return <Redirect href={getHomeForRole(user.role) as any} />;
}
