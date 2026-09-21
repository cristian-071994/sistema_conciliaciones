import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { brand } from "../../theme";
import { MESES_LABEL } from "./estado";

export type ModoPeriodo = "mes" | "año";

export function PeriodoSelector({
  modo,
  setModo,
  anio,
  mes,
  onAnterior,
  onSiguiente,
}: {
  modo: ModoPeriodo;
  setModo: (m: ModoPeriodo) => void;
  anio: number;
  mes: number;
  onAnterior: () => void;
  onSiguiente: () => void;
}) {
  const etiqueta = modo === "mes" ? `${MESES_LABEL[mes - 1]} ${anio}` : String(anio);
  return (
    <View style={styles.panel}>
      <View style={styles.toggleRow}>
        {(["mes", "año"] as const).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.toggleBtn, modo === m && styles.toggleBtnActive]}
            onPress={() => setModo(m)}
            accessibilityRole="button"
            accessibilityState={{ selected: modo === m }}
          >
            <Text style={[styles.toggleText, modo === m && styles.toggleTextActive]}>
              {m === "mes" ? "Mes" : "Año completo"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navBtn} onPress={onAnterior} accessibilityLabel="Período anterior">
          <MaterialCommunityIcons name="chevron-left" size={24} color={brand.navy} />
        </TouchableOpacity>
        <View style={styles.labelWrap}>
          <MaterialCommunityIcons name="calendar-month-outline" size={18} color={brand.green} />
          <Text style={styles.label}>{etiqueta}</Text>
        </View>
        <TouchableOpacity style={styles.navBtn} onPress={onSiguiente} accessibilityLabel="Período siguiente">
          <MaterialCommunityIcons name="chevron-right" size={24} color={brand.navy} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: brand.white,
    borderRadius: 20,
    padding: 12,
    marginBottom: 14,
    shadowColor: brand.navy,
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  toggleRow: { flexDirection: "row", backgroundColor: brand.pill, borderRadius: 999, padding: 4, marginBottom: 10 },
  toggleBtn: { flex: 1, paddingVertical: 9, borderRadius: 999, alignItems: "center" },
  toggleBtnActive: { backgroundColor: brand.navy },
  toggleText: { fontSize: 13, fontWeight: "700", color: brand.textSecondary },
  toggleTextActive: { color: brand.white },
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: brand.pill,
  },
  labelWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { fontSize: 16, fontWeight: "800", color: brand.navy },
});
