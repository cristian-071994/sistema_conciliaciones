import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import type { ComponentProps } from "react";
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand } from "../../theme";
import { BrandCurve } from "./BrandCurve";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

// Header de los módulos (Solicitudes, Tarifas, Manifiesto): mismo azul y
// misma curva de marca que Inicio, en versión compacta. Solo UI.
const CURVE_H = 64;
const CURVE_OVERLAP = 18;

export function ScreenHeader({
  title,
  subtitle,
  icon,
  accent,
  accentLight,
  backLabel = "Inicio",
  onBack,
  onLogout,
}: {
  title: string;
  subtitle?: string;
  icon: IconName;
  accent: string;
  accentLight: string;
  backLabel?: string;
  onBack: () => void;
  onLogout?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <StatusBar style="light" />
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.back}
          onPress={onBack}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Volver a ${backLabel}`}
        >
          <MaterialCommunityIcons name="chevron-left" size={22} color={brand.white} />
          <Text style={styles.backText}>{backLabel}</Text>
        </TouchableOpacity>
        {onLogout && (
          <TouchableOpacity
            style={styles.back}
            onPress={onLogout}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión"
          >
            <MaterialCommunityIcons name="logout" size={16} color={brand.white} />
            <Text style={styles.backText}>Salir</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.titleRow}>
        <View style={[styles.iconBadge, { backgroundColor: accentLight }]}>
          <MaterialCommunityIcons name={icon} size={26} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      </View>

      <BrandCurve width={width} height={CURVE_H} style={styles.curve} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: brand.navy,
    paddingHorizontal: 20,
    paddingBottom: CURVE_H - CURVE_OVERLAP,
    overflow: "hidden",
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  backText: { color: brand.white, fontWeight: "600", fontSize: 13.5 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  iconBadge: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  title: { color: brand.white, fontSize: 24, fontWeight: "800" },
  subtitle: { color: "#C6D4E3", fontSize: 14, marginTop: 2 },
  curve: { position: "absolute", bottom: 0, left: 0 },
});
