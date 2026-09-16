import { Redirect, Tabs, useRouter } from "expo-router";
import { Text, TouchableOpacity } from "react-native";
import { useAuth } from "../../src/auth";
import { colors } from "../../src/theme";

export default function TabsLayout() {
  const router = useRouter();
  const { user, logout } = useAuth();
  // Salir cierra sesión y debe dejar al usuario en la bienvenida, no en el
  // login (ver app/(auth)/bienvenida.tsx) — por eso el guard también apunta
  // ahí en vez de a /(auth)/login.
  if (!user) return <Redirect href="/(auth)/bienvenida" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.neutral,
        headerStyle: { backgroundColor: colors.white },
        headerTitleStyle: { color: colors.text },
        // Flecha de volver a Inicio a la izquierda (en vez del texto "Inicio"
        // que antes iba a la derecha) — misma acción, más fácil de ubicar.
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => router.push("/inicio")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ marginLeft: 16, flexDirection: "row", alignItems: "center" }}
          >
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 22, marginRight: 2 }}>‹</Text>
          </TouchableOpacity>
        ),
        headerRight: () => (
          <TouchableOpacity
            onPress={() => void logout()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ marginRight: 16 }}
          >
            <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>Salir</Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="nueva-solicitud"
        options={{
          title: "Nueva solicitud",
          // Símbolo de texto en vez de @expo/vector-icons: evita sumar otra
          // dependencia solo para dos íconos de la barra de pestañas.
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>＋</Text>,
        }}
      />
      <Tabs.Screen
        name="solicitudes"
        options={{
          title: "Mis solicitudes",
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>☰</Text>,
        }}
      />
    </Tabs>
  );
}
