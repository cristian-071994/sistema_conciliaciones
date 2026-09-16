import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../src/auth";

export default function AuthLayout() {
  const { user } = useAuth();
  if (user) return <Redirect href="/inicio" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
