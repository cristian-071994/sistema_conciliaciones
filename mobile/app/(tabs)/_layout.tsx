import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useAuth } from "../../src/auth";
import { brand } from "../../src/theme";

// Módulo Solicitudes: dos pestañas. El header lo dibuja cada pantalla
// (ScreenHeader, con la curva de marca), por eso headerShown: false.
export default function TabsLayout() {
  const { user } = useAuth();
  // Salir debe dejar al usuario en la bienvenida, no en el login.
  if (!user) return <Redirect href="/(auth)/bienvenida" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand.navy,
        tabBarInactiveTintColor: brand.textSecondary,
        tabBarActiveBackgroundColor: brand.greenLight,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "700", marginBottom: 4 },
        tabBarItemStyle: { borderRadius: 16, marginHorizontal: 10, marginVertical: 6 },
        tabBarStyle: {
          backgroundColor: brand.white,
          borderTopWidth: 0,
          minHeight: 68,
          shadowColor: brand.navy,
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -2 },
          elevation: 12,
        },
      }}
    >
      <Tabs.Screen
        name="nueva-solicitud"
        options={{
          title: "Nueva solicitud",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="text-box-plus-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="solicitudes"
        options={{
          title: "Mis solicitudes",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="format-list-checks" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
