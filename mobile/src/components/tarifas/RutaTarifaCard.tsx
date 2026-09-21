import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { formatCOP } from "../../format";
import { brand } from "../../theme";
import type { RutaTarifa } from "../../types";

export function RutaTarifaCard({ ruta }: { ruta: RutaTarifa }) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name="map-marker-path" size={22} color={brand.orange} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.route} numberOfLines={2}>
          {ruta.origen} <Text style={styles.arrow}>→</Text> {ruta.destino}
        </Text>
        <View style={styles.tipo}>
          <MaterialCommunityIcons name="truck-outline" size={14} color={brand.textSecondary} />
          <Text style={styles.tipoText}>{ruta.tipo_vehiculo_nombre}</Text>
        </View>
      </View>
      {ruta.tarifa_cliente != null && <Text style={styles.valor}>{formatCOP(ruta.tarifa_cliente)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: brand.bg,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: brand.orangeLight,
    alignItems: "center",
    justifyContent: "center",
  },
  route: { fontSize: 14.5, fontWeight: "800", color: brand.navy },
  arrow: { color: brand.orange },
  tipo: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  tipoText: { fontSize: 12.5, color: brand.textSecondary },
  valor: { fontSize: 15, fontWeight: "800", color: brand.green, marginLeft: 6 },
});
