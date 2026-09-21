import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { formatCOP } from "../../format";
import { brand } from "../../theme";
import { SoftButton } from "../ui/Buttons";

// Estado de la tarifa de la ruta elegida (la consulta la hace la pantalla).
// Si no existe tarifa, ofrece ir directo a crearla en el módulo Tarifas.
export function TarifaPreview({
  buscando,
  tarifa,
  error,
  onCrearTarifa,
}: {
  buscando: boolean;
  tarifa: number | null;
  error: string;
  onCrearTarifa: () => void;
}) {
  if (buscando) {
    return (
      <View style={[styles.box, styles.neutral]}>
        <ActivityIndicator color={brand.navy} />
        <Text style={styles.helper}>Consultando tarifa...</Text>
      </View>
    );
  }
  if (tarifa !== null) {
    return (
      <View style={[styles.box, { backgroundColor: brand.greenLight }]}>
        <MaterialCommunityIcons name="check-decagram" size={28} color={brand.green} />
        <View style={{ flex: 1 }}>
          <Text style={styles.okLabel}>Tarifa cliente</Text>
          <Text style={styles.okValue}>{formatCOP(tarifa)}</Text>
        </View>
      </View>
    );
  }
  if (error) {
    return (
      <View style={[styles.box, styles.column, { backgroundColor: brand.orangeLight }]}>
        <View style={styles.row}>
          <MaterialCommunityIcons name="alert-outline" size={24} color={brand.orange} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
        <SoftButton
          label="Crear tarifa ahora"
          icon="plus"
          color={brand.white}
          background={brand.orange}
          onPress={onCrearTarifa}
        />
      </View>
    );
  }
  return (
    <View style={[styles.box, styles.neutral]}>
      <MaterialCommunityIcons name="cash-multiple" size={24} color={brand.textSecondary} />
      <Text style={styles.helper}>Selecciona vehículo, origen y destino para ver la tarifa.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16, borderRadius: 16, padding: 14 },
  column: { flexDirection: "column", alignItems: "stretch" },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  neutral: { backgroundColor: brand.pill },
  helper: { flex: 1, fontSize: 13.5, color: brand.textSecondary, lineHeight: 19 },
  okLabel: { fontSize: 12.5, fontWeight: "700", color: brand.green },
  okValue: { fontSize: 22, fontWeight: "800", color: brand.navy },
  errorText: { flex: 1, fontSize: 13.5, color: "#9A3D00", fontWeight: "600", lineHeight: 19 },
});
