import type { ReactNode } from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { brand } from "../../theme";

// Tarjeta blanca de sección con barra de acento a la izquierda del título
// (mismo recurso que las tarjetas de Inicio: verde Solicitudes, naranja Tarifas).
export function SectionCard({
  title,
  helper,
  accent,
  children,
  style,
}: {
  title?: string;
  helper?: string;
  accent: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.card, style]}>
      {!!title && (
        <View style={styles.titleRow}>
          <View style={[styles.accent, { backgroundColor: accent }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {!!helper && <Text style={styles.helper}>{helper}</Text>}
          </View>
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: brand.white,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    shadowColor: brand.navy,
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  titleRow: { flexDirection: "row", gap: 12, marginBottom: 2 },
  accent: { width: 4, borderRadius: 2, alignSelf: "stretch" },
  title: { fontSize: 17, fontWeight: "800", color: brand.navy },
  helper: { fontSize: 13.5, color: brand.textSecondary, marginTop: 3, lineHeight: 19 },
});
