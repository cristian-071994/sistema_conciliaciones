import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api } from "../../src/api";
import { formatCOP } from "../../src/format";
import { colors } from "../../src/theme";
import type { SolicitudViajeAdicional } from "../../src/types";

// Estado real dentro del proceso de conciliación (ver
// EstadoGestionViajeAdicional en el backend) — no el campo manual `estado`.
const ESTADO_GESTION_LABEL: Record<SolicitudViajeAdicional["estado_gestion"], string> = {
  PENDIENTE_TARIFA: "Pendiente tarifa",
  PENDIENTE_MANIFIESTO: "Pendiente manifiesto",
  SIN_CONCILIAR: "Sin conciliar",
  EN_BORRADOR: "En borrador",
  EN_REVISION: "En revisión",
  APROBADA: "Aprobada",
  CONCILIADO: "Conciliado",
};

const ESTADO_GESTION_COLOR: Record<SolicitudViajeAdicional["estado_gestion"], string> = {
  PENDIENTE_TARIFA: colors.neutral,
  PENDIENTE_MANIFIESTO: colors.warning,
  SIN_CONCILIAR: colors.primary,
  EN_BORRADOR: colors.primary,
  EN_REVISION: colors.warning,
  APROBADA: colors.success,
  CONCILIADO: colors.success,
};

export default function SolicitudesScreen() {
  const router = useRouter();
  const [solicitudes, setSolicitudes] = useState<SolicitudViajeAdicional[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function loadData() {
    setError("");
    try {
      setSolicitudes(await api.misSolicitudes());
    } catch {
      setError("No se pudieron cargar tus solicitudes");
    }
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadData().finally(() => setLoading(false));
    }, [])
  );

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={solicitudes}
      keyExtractor={(item) => String(item.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      ListEmptyComponent={
        <Text style={styles.empty}>{error || "No tienes solicitudes registradas todavía."}</Text>
      }
      renderItem={({ item }) => (
        <View style={[styles.card, !item.manifiesto && styles.cardSinManifiesto]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{item.titulo}</Text>
            <View style={[styles.badge, { backgroundColor: `${ESTADO_GESTION_COLOR[item.estado_gestion]}22` }]}>
              <Text style={[styles.badgeText, { color: ESTADO_GESTION_COLOR[item.estado_gestion] }]}>
                {ESTADO_GESTION_LABEL[item.estado_gestion]}
              </Text>
            </View>
          </View>
          <Text style={styles.cardLine}>{item.operacion_nombre}</Text>
          <Text style={styles.cardLine}>{item.origen} → {item.destino}</Text>
          <Text style={styles.cardLine}>{item.vehiculo_placa} ({item.vehiculo_tipo_nombre}) · {item.producto}</Text>
          <Text style={styles.cardDate}>Fecha de viaje: {item.fecha_viaje}</Text>
          <Text style={styles.cardLine}>
            Tarifa: {item.tarifa_cliente != null ? formatCOP(item.tarifa_cliente) : "Pendiente de definir"}
          </Text>

          {item.manifiesto ? (
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => router.push({ pathname: "/manifiesto/[id]", params: { id: String(item.id) } })}
            >
              <Text style={styles.linkButtonText}>Ver manifiesto</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.sinManifiesto}>Sin manifiesto adjunto todavía</Text>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  empty: { textAlign: "center", color: colors.neutral, marginTop: 40, fontSize: 14 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  cardSinManifiesto: { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text, flexShrink: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  cardLine: { fontSize: 13, color: colors.text, marginBottom: 2 },
  cardDate: { fontSize: 12, color: colors.neutral, marginTop: 4, marginBottom: 8 },
  linkButton: {
    alignSelf: "flex-start",
    backgroundColor: `${colors.success}1A`,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  linkButtonText: { color: colors.success, fontWeight: "600", fontSize: 12 },
  sinManifiesto: { color: colors.danger, fontSize: 12, fontWeight: "600" },
});
