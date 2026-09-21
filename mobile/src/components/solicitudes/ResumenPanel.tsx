import { StyleSheet, Text, View } from "react-native";
import { brand } from "../../theme";
import { ESTADO_GESTION_COLOR, ESTADO_GESTION_LABEL, ESTADOS_GESTION_ORDEN, ResumenStats } from "./estado";

export function ResumenPanel({ stats }: { stats: ResumenStats }) {
  return (
    <View style={styles.panel}>
      <View style={styles.titleRow}>
        <View style={[styles.accent, { backgroundColor: brand.green }]} />
        <Text style={styles.heading}>Resumen de tus viajes</Text>
      </View>

      <View style={styles.tilesRow}>
        <Tile value={stats.total} label="Total" color={brand.white} bg={brand.navy} labelColor="#C6D4E3" />
        <Tile value={stats.conManifiesto} label="Con manifiesto" color={brand.green} bg={brand.greenLight} />
        <Tile value={stats.sinManifiesto} label="Sin manifiesto" color={brand.orange} bg={brand.orangeLight} />
      </View>

      <View style={styles.chipsWrap}>
        {ESTADOS_GESTION_ORDEN.map((estado) => (
          <View key={estado} style={styles.chip}>
            <View style={[styles.dot, { backgroundColor: ESTADO_GESTION_COLOR[estado] }]} />
            <Text style={styles.chipLabel} numberOfLines={2}>
              {ESTADO_GESTION_LABEL[estado]}
            </Text>
            <Text style={[styles.chipNumber, { color: ESTADO_GESTION_COLOR[estado] }]}>{stats.porEstado[estado]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Tile({
  value,
  label,
  color,
  bg,
  labelColor = brand.textSecondary,
}: {
  value: number;
  label: string;
  color: string;
  bg: string;
  labelColor?: string;
}) {
  return (
    <View style={[styles.tile, { backgroundColor: bg }]}>
      <Text style={[styles.tileNumber, { color }]}>{value}</Text>
      <Text style={[styles.tileLabel, { color: labelColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: brand.white,
    borderRadius: 20,
    padding: 16,
    marginBottom: 18,
    shadowColor: brand.navy,
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  accent: { width: 4, height: 20, borderRadius: 2 },
  heading: { fontSize: 17, fontWeight: "800", color: brand.navy },
  tilesRow: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, borderRadius: 16, paddingVertical: 12, alignItems: "center" },
  tileNumber: { fontSize: 24, fontWeight: "800" },
  tileLabel: { fontSize: 11, fontWeight: "700", marginTop: 2, textAlign: "center" },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  chip: {
    flexBasis: "48%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: brand.bg,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  chipLabel: { flex: 1, fontSize: 12, color: brand.textPrimary, marginRight: 6, lineHeight: 15 },
  chipNumber: { fontSize: 14, fontWeight: "800" },
});
