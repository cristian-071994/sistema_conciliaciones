import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { HomeFooter } from "../src/components/home/HomeFooter";
import { HomeHeader } from "../src/components/home/HomeHeader";
import { useAuth } from "../src/auth";
import { brand } from "../src/theme";

// Pantalla de inicio (solo UI, sin lógica de negocio): saluda al usuario y
// ofrece los dos accesos. Header y footer viven en src/components/home/ y la
// paleta en `brand` (src/theme.ts) — exclusiva de esta pantalla.
export default function InicioScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

  if (!user) return <Redirect href="/(auth)/bienvenida" />;

  return (
    <View style={styles.screen}>
      {/* El header es azul: iconos de la barra de estado en claro. */}
      <StatusBar style="light" />
      <HomeHeader
        onLogout={() => {
          void logout();
        }}
      />

      <View style={styles.welcome}>
        <Text style={styles.saludo}>Hola, {user.nombre}</Text>
        <Text style={styles.bienvenida}>¿Qué necesitas hacer hoy?</Text>
      </View>

      <View style={styles.cards}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => router.push("/(tabs)/nueva-solicitud")}
        >
          <View style={[styles.iconWrap, { backgroundColor: brand.greenLight }]}>
            <MaterialCommunityIcons name="text-box-plus-outline" size={32} color={brand.green} />
          </View>
          <View style={[styles.accent, { backgroundColor: brand.green }]} />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Solicitudes</Text>
            <Text style={styles.cardHelper}>Solicita un viaje adicional y consulta el estado de tus manifiestos.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={28} color={brand.navy} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => router.push("/tarifas")}>
          <View style={styles.iconWrap}>
            <TarifasIcon />
          </View>
          <View style={[styles.accent, { backgroundColor: brand.orange }]} />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Tarifas</Text>
            <Text style={styles.cardHelper}>Crea la tarifa de una ruta cuando el catálogo aún no la tenga.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={28} color={brand.navy} />
        </TouchableOpacity>
      </View>

      <HomeFooter />
    </View>
  );
}

// Pin (GPS) + moneda unidos por dos flechas punteadas naranja, sin fondo.
function TarifasIcon() {
  return (
    <View style={styles.tarifasIcon}>
      <Svg width={60} height={60} viewBox="0 0 60 60" style={StyleSheet.absoluteFill}>
        <Path
          d="M33,13 C44,13 48,21 48,31"
          stroke={brand.orange}
          strokeWidth={2}
          strokeDasharray="3 3"
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M12,36 C12,49 22,54 31,52"
          stroke={brand.orange}
          strokeWidth={2}
          strokeDasharray="3 3"
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      <MaterialCommunityIcons name="map-marker-outline" size={34} color={brand.green} style={styles.tarifasPin} />
      <View style={styles.tarifasCoin}>
        <MaterialCommunityIcons name="currency-usd" size={17} color={brand.green} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  welcome: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 16 },
  saludo: { fontSize: 27, fontWeight: "800", color: brand.textPrimary, marginBottom: 4 },
  bienvenida: { fontSize: 17, color: brand.textSecondary },
  cards: { gap: 14, paddingHorizontal: 24, paddingBottom: 18 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: brand.white,
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 18,
    shadowColor: brand.navy,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  // Línea divisoria entre el ícono y el texto (verde en Solicitudes, naranja en Tarifas).
  accent: { width: 3, borderRadius: 2, alignSelf: "stretch", marginHorizontal: 14 },
  cardText: { flex: 1, marginRight: 6 },
  cardTitle: { fontSize: 19, fontWeight: "800", color: brand.navy, marginBottom: 3 },
  cardHelper: { fontSize: 14.5, color: brand.textSecondary, lineHeight: 20 },
  tarifasIcon: { width: 60, height: 60 },
  tarifasPin: { position: "absolute", top: 1, left: 2 },
  tarifasCoin: {
    position: "absolute",
    bottom: 3,
    right: 3,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: brand.white,
    borderWidth: 2,
    borderColor: brand.green,
    alignItems: "center",
    justifyContent: "center",
  },
});
