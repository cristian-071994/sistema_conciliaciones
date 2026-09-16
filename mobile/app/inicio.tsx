import { Redirect, useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
import { colors } from "../src/theme";

// Pantalla de aterrizaje tras el login: una tarjeta "Solicitudes" que lleva
// al formulario de nueva solicitud. El botón "Inicio" en (tabs)/_layout.tsx
// trae de vuelta aquí; "Salir" cierra sesión y deja al usuario en la
// bienvenida (app/(auth)/bienvenida.tsx), no en el login.
export default function InicioScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();

  if (!user) return <Redirect href="/(auth)/bienvenida" />;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { marginTop: insets.top + 24 }]}>
        <View>
          <Text style={styles.saludo}>Hola, {user.nombre}</Text>
          <Text style={styles.subtitulo}>¿Qué necesitas hacer hoy?</Text>
        </View>
        <TouchableOpacity
          style={styles.salirButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => {
            void logout();
          }}
        >
          <Text style={styles.salirText}>Salir</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cardsRow}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => router.push("/(tabs)/nueva-solicitud")}
        >
          <Text style={styles.cardIcon}>＋</Text>
          <Text style={styles.cardTitle}>Solicitudes</Text>
          <Text style={styles.cardHelper}>Solicita un viaje adicional y consulta el estado de tus manifiestos.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => router.push("/tarifas")}>
          <Text style={styles.cardIcon}>$</Text>
          <Text style={styles.cardTitle}>Tarifas</Text>
          <Text style={styles.cardHelper}>Crea la tarifa de una ruta cuando el catálogo aún no la tenga.</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  saludo: { fontSize: 18, fontWeight: "700", color: colors.text },
  subtitulo: { fontSize: 13, color: colors.neutral, marginTop: 2 },
  salirButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: `${colors.primary}14`,
  },
  salirText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  cardsRow: { gap: 16 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardIcon: {
    fontSize: 28,
    color: colors.primary,
    fontWeight: "700",
    marginBottom: 8,
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 6 },
  cardHelper: { fontSize: 13, color: colors.neutral, textAlign: "center", lineHeight: 19 },
});
