import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand } from "../../theme";
import { BrandCurve } from "../brand/BrandCurve";

// Header del inicio (solo UI): fondo azul principal + curva "cinta" al pie.
//
// Estructura:
//  1) El azul es un rectángulo simple que llena TODO el alto del header.
//  2) Un Svg superpuesto en la franja inferior dibuja, de atrás hacia adelante:
//     - el "corte" en color de fondo (revela el gris claro bajo la curva),
//     - una cuña verde que se ensancha hacia la derecha,
//     - un trazo con degradado amarillo → naranja sobre la misma curva.
//  3) El botón "Salir" flota sobre la zona clara, abajo a la derecha.
//
// Se usan números (no "%") en el Svg: react-native-svg queda en tamaño 0 en
// Android con porcentajes dentro de contenedores flex.
const CURVE_H = 110;
// Cuánto de la altura del Svg se superpone con el contenido del header. El
// resto (CURVE_H - OVERLAP) se reserva como padding para que logo y tagline
// nunca queden bajo la curva.
const CURVE_OVERLAP = 30;

export function HomeHeader({ onLogout }: { onLogout: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  return (
    <View style={[styles.header, { paddingTop: insets.top + 22 }]}>
      <View style={styles.brand}>
        <Image source={require("../../../assets/logo-cointra-light.png")} style={styles.logo} resizeMode="contain" />
        <Text style={styles.tagline}>TRANSPORTE DE CARGA</Text>
      </View>

      <BrandCurve width={width} height={CURVE_H} style={styles.curve} />

      <TouchableOpacity
        style={styles.salir}
        activeOpacity={0.8}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={onLogout}
        accessibilityRole="button"
        accessibilityLabel="Cerrar sesión"
      >
        <MaterialCommunityIcons name="logout" size={18} color={brand.navy} />
        <Text style={styles.salirText}>Salir</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: brand.navy,
    paddingHorizontal: 24,
    paddingBottom: CURVE_H - CURVE_OVERLAP,
    overflow: "hidden",
  },
  brand: { alignSelf: "flex-start" },
  logo: { width: 250, height: 54 },
  tagline: {
    color: "#C6D4E3",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 2.4,
    marginTop: 3,
    // Alinea con el inicio de la palabra "cointra" (el swirl ocupa ~21% del logo).
    marginLeft: 53,
  },
  curve: { position: "absolute", bottom: 0, left: 0 },
  salir: {
    position: "absolute",
    right: 20,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: brand.pill,
    borderWidth: 1,
    borderColor: brand.pillBorder,
    shadowColor: brand.navyDark,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  salirText: { color: brand.navy, fontWeight: "700", fontSize: 14 },
});
