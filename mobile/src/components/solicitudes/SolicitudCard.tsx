import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatCOP } from "../../format";
import { brand } from "../../theme";
import type { SolicitudViajeAdicional } from "../../types";
import { SoftButton } from "../ui/Buttons";
import { ESTADO_GESTION_COLOR, ESTADO_GESTION_LABEL } from "./estado";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function SolicitudCard({
  item,
  onVerManifiesto,
}: {
  item: SolicitudViajeAdicional;
  onVerManifiesto: () => void;
}) {
  const color = ESTADO_GESTION_COLOR[item.estado_gestion];
  return (
    <View style={styles.card}>
      <View style={[styles.stripe, { backgroundColor: color }]} />
      <View style={styles.body}>
        <View style={styles.header}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.id}>Viaje #{item.id}</Text>
            <Text style={styles.title}>{item.titulo}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: `${color}1F` }]}>
            <Text style={[styles.badgeText, { color }]}>{ESTADO_GESTION_LABEL[item.estado_gestion]}</Text>
          </View>
        </View>

        <View style={styles.route}>
          <MaterialCommunityIcons name="map-marker-outline" size={18} color={brand.green} />
          <Text style={styles.routeText} numberOfLines={2}>
            {item.origen}
          </Text>
          <MaterialCommunityIcons name="arrow-right" size={16} color={brand.orange} />
          <Text style={styles.routeText} numberOfLines={2}>
            {item.destino}
          </Text>
        </View>

        <Line icon="domain" text={item.operacion_nombre} />
        <Line icon="truck-outline" text={`${item.vehiculo_placa} (${item.vehiculo_tipo_nombre}) · ${item.producto}`} />
        <Line icon="calendar-month-outline" text={`Fecha de viaje: ${item.fecha_viaje}`} />

        <View style={styles.footer}>
          <View>
            <Text style={styles.tarifaLabel}>Tarifa</Text>
            <Text style={styles.tarifaValue}>
              {item.tarifa_cliente != null ? formatCOP(item.tarifa_cliente) : "Pendiente"}
            </Text>
          </View>
          {item.manifiesto ? (
            <SoftButton
              label="Ver manifiesto"
              icon="file-pdf-box"
              color={brand.green}
              background={brand.greenLight}
              onPress={onVerManifiesto}
            />
          ) : (
            <View style={styles.sinManifiesto}>
              <MaterialCommunityIcons name="clock-outline" size={15} color={brand.orange} />
              <Text style={styles.sinManifiestoText}>Sin manifiesto</Text>
            </View>
          )}
        </View>
        {item.manifiesto && (
          <Text style={styles.manifiestoNum}>
            Manifiesto: {item.manifiesto.numero_manifiesto || "(sin número registrado)"}
          </Text>
        )}
      </View>
    </View>
  );
}

function Line({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.line}>
      <MaterialCommunityIcons name={icon} size={16} color={brand.textSecondary} />
      <Text style={styles.lineText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: brand.white,
    borderRadius: 20,
    marginBottom: 14,
    overflow: "hidden",
    shadowColor: brand.navy,
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  stripe: { width: 5 },
  body: { flex: 1, padding: 16 },
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  id: { fontSize: 12, fontWeight: "800", color: brand.green, marginBottom: 2 },
  title: { fontSize: 16, fontWeight: "800", color: brand.navy },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeText: { fontSize: 11.5, fontWeight: "800" },
  route: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: brand.bg,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  routeText: { flexShrink: 1, fontSize: 14, fontWeight: "700", color: brand.textPrimary },
  line: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 },
  lineText: { flex: 1, fontSize: 13.5, color: brand.textPrimary },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: brand.border,
  },
  tarifaLabel: { fontSize: 11.5, fontWeight: "700", color: brand.textSecondary },
  tarifaValue: { fontSize: 17, fontWeight: "800", color: brand.navy },
  sinManifiesto: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: brand.orangeLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sinManifiestoText: { color: brand.orange, fontWeight: "800", fontSize: 12.5 },
  manifiestoNum: { marginTop: 8, fontSize: 12, color: brand.textSecondary },
});
