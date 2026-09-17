import { useCallback, useMemo, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api } from "../../src/api";
import { formatCOP } from "../../src/format";
import { colors } from "../../src/theme";
import type { EstadoGestionSolicitud, SolicitudViajeAdicional } from "../../src/types";

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

// Orden fijo de despliegue del desglose por estado en el panel de
// estadísticas (mismo orden en el que avanza una solicitud en la práctica).
const ESTADOS_GESTION_ORDEN: EstadoGestionSolicitud[] = [
  "PENDIENTE_TARIFA",
  "PENDIENTE_MANIFIESTO",
  "SIN_CONCILIAR",
  "EN_BORRADOR",
  "EN_REVISION",
  "APROBADA",
  "CONCILIADO",
];

const MESES_LABEL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function parseFechaViaje(fecha: string): { anio: number; mes: number } | null {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(fecha);
  if (!match) return null;
  return { anio: Number(match[1]), mes: Number(match[2]) };
}

export default function SolicitudesScreen() {
  const router = useRouter();
  const [solicitudes, setSolicitudes] = useState<SolicitudViajeAdicional[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const hoy = new Date();
  const [modoFiltro, setModoFiltro] = useState<"mes" | "año">("mes");
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);

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

  const solicitudesFiltradas = useMemo(() => {
    return solicitudes.filter((s) => {
      const fecha = parseFechaViaje(s.fecha_viaje);
      if (!fecha) return false;
      if (fecha.anio !== anio) return false;
      if (modoFiltro === "mes" && fecha.mes !== mes) return false;
      return true;
    });
  }, [solicitudes, modoFiltro, anio, mes]);

  function irPeriodoAnterior() {
    if (modoFiltro === "año") {
      setAnio((a) => a - 1);
      return;
    }
    if (mes === 1) {
      setMes(12);
      setAnio((a) => a - 1);
    } else {
      setMes((m) => m - 1);
    }
  }

  function irPeriodoSiguiente() {
    if (modoFiltro === "año") {
      setAnio((a) => a + 1);
      return;
    }
    if (mes === 12) {
      setMes(1);
      setAnio((a) => a + 1);
    } else {
      setMes((m) => m + 1);
    }
  }

  const stats = useMemo(() => {
    const porEstado = ESTADOS_GESTION_ORDEN.reduce(
      (acc, estado) => ({ ...acc, [estado]: 0 }),
      {} as Record<EstadoGestionSolicitud, number>
    );
    let conManifiesto = 0;
    for (const s of solicitudesFiltradas) {
      porEstado[s.estado_gestion] += 1;
      if (s.manifiesto) conManifiesto += 1;
    }
    return {
      total: solicitudesFiltradas.length,
      conManifiesto,
      sinManifiesto: solicitudesFiltradas.length - conManifiesto,
      porEstado,
    };
  }, [solicitudesFiltradas]);

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
      data={solicitudesFiltradas}
      keyExtractor={(item) => String(item.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      ListHeaderComponent={
        <>
          <SelectorPeriodo
            modo={modoFiltro}
            setModo={setModoFiltro}
            anio={anio}
            mes={mes}
            onAnterior={irPeriodoAnterior}
            onSiguiente={irPeriodoSiguiente}
          />
          {solicitudesFiltradas.length > 0 && <EstadisticasPanel stats={stats} />}
        </>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          {error ||
            (solicitudes.length === 0
              ? "No tienes solicitudes registradas todavía."
              : "No tienes solicitudes en este período.")}
        </Text>
      }
      renderItem={({ item }) => (
        <View style={[styles.card, !item.manifiesto && styles.cardSinManifiesto]}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.cardId}>Viaje #{item.id}</Text>
              <Text style={styles.cardTitle}>{item.titulo}</Text>
            </View>
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
            <>
              <Text style={styles.cardManifiesto}>
                Manifiesto: {item.manifiesto.numero_manifiesto || "(sin número registrado)"}
              </Text>
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => router.push({ pathname: "/manifiesto/[id]", params: { id: String(item.id) } })}
              >
                <Text style={styles.linkButtonText}>Ver manifiesto</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.sinManifiesto}>Sin manifiesto adjunto todavía</Text>
          )}
        </View>
      )}
    />
  );
}

function SelectorPeriodo({
  modo,
  setModo,
  anio,
  mes,
  onAnterior,
  onSiguiente,
}: {
  modo: "mes" | "año";
  setModo: (m: "mes" | "año") => void;
  anio: number;
  mes: number;
  onAnterior: () => void;
  onSiguiente: () => void;
}) {
  const etiqueta = modo === "mes" ? `${MESES_LABEL[mes - 1]} ${anio}` : String(anio);
  return (
    <View style={styles.periodoPanel}>
      <View style={styles.periodoToggleRow}>
        <TouchableOpacity
          style={[styles.periodoToggleBtn, modo === "mes" && styles.periodoToggleBtnActive]}
          onPress={() => setModo("mes")}
        >
          <Text style={[styles.periodoToggleText, modo === "mes" && styles.periodoToggleTextActive]}>Mes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.periodoToggleBtn, modo === "año" && styles.periodoToggleBtnActive]}
          onPress={() => setModo("año")}
        >
          <Text style={[styles.periodoToggleText, modo === "año" && styles.periodoToggleTextActive]}>
            Año completo
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.periodoNavRow}>
        <TouchableOpacity style={styles.periodoNavBtn} onPress={onAnterior}>
          <Text style={styles.periodoNavBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.periodoLabel}>{etiqueta}</Text>
        <TouchableOpacity style={styles.periodoNavBtn} onPress={onSiguiente}>
          <Text style={styles.periodoNavBtnText}>›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function EstadisticasPanel({
  stats,
}: {
  stats: {
    total: number;
    conManifiesto: number;
    sinManifiesto: number;
    porEstado: Record<EstadoGestionSolicitud, number>;
  };
}) {
  return (
    <View style={styles.statsPanel}>
      <Text style={styles.statsHeading}>Resumen de tus viajes</Text>
      <View style={styles.statsRowMain}>
        <View style={styles.statMainTile}>
          <Text style={styles.statMainNumber}>{stats.total}</Text>
          <Text style={styles.statMainLabel}>Total</Text>
        </View>
        <View style={[styles.statMainTile, { backgroundColor: `${colors.success}14` }]}>
          <Text style={[styles.statMainNumber, { color: colors.success }]}>{stats.conManifiesto}</Text>
          <Text style={styles.statMainLabel}>Con manifiesto</Text>
        </View>
        <View style={[styles.statMainTile, { backgroundColor: `${colors.danger}14` }]}>
          <Text style={[styles.statMainNumber, { color: colors.danger }]}>{stats.sinManifiesto}</Text>
          <Text style={styles.statMainLabel}>Pendiente manifiesto</Text>
        </View>
      </View>

      <View style={styles.statsChipsWrap}>
        {ESTADOS_GESTION_ORDEN.map((estado) => (
          <View key={estado} style={[styles.statChip, { borderColor: `${ESTADO_GESTION_COLOR[estado]}55` }]}>
            <View style={[styles.statChipDot, { backgroundColor: ESTADO_GESTION_COLOR[estado] }]} />
            <Text style={styles.statChipLabel}>{ESTADO_GESTION_LABEL[estado]}</Text>
            <Text style={[styles.statChipNumber, { color: ESTADO_GESTION_COLOR[estado] }]}>
              {stats.porEstado[estado]}
            </Text>
          </View>
        ))}
      </View>
    </View>
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
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  cardId: { fontSize: 11, fontWeight: "700", color: colors.primary, marginBottom: 1 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text, flexShrink: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  cardLine: { fontSize: 13, color: colors.text, marginBottom: 2 },
  cardDate: { fontSize: 12, color: colors.neutral, marginTop: 4, marginBottom: 8 },
  cardManifiesto: { fontSize: 12, color: colors.text, fontWeight: "600", marginBottom: 8 },
  linkButton: {
    alignSelf: "flex-start",
    backgroundColor: `${colors.success}1A`,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  linkButtonText: { color: colors.success, fontWeight: "600", fontSize: 12 },
  sinManifiesto: { color: colors.danger, fontSize: 12, fontWeight: "600" },

  periodoPanel: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
  },
  periodoToggleRow: {
    flexDirection: "row",
    backgroundColor: colors.bg,
    borderRadius: 999,
    padding: 3,
    marginBottom: 10,
  },
  periodoToggleBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 999,
    alignItems: "center",
  },
  periodoToggleBtnActive: { backgroundColor: colors.primary },
  periodoToggleText: { fontSize: 12, fontWeight: "700", color: colors.neutral },
  periodoToggleTextActive: { color: colors.white },
  periodoNavRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  periodoNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  periodoNavBtnText: { fontSize: 18, fontWeight: "700", color: colors.primary },
  periodoLabel: { fontSize: 15, fontWeight: "700", fontStyle: "italic", color: colors.text, textTransform: "capitalize" },

  statsPanel: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 18,
  },
  statsHeading: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 12 },
  statsRowMain: { flexDirection: "row", gap: 8 },
  statMainTile: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  statMainNumber: { fontSize: 20, fontWeight: "800", color: colors.text },
  statMainLabel: { fontSize: 10, fontWeight: "600", color: colors.neutral, marginTop: 2, textAlign: "center" },
  statsChipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.white,
  },
  statChipDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statChipLabel: { fontSize: 11, color: colors.text, marginRight: 6 },
  statChipNumber: { fontSize: 11, fontWeight: "800" },
});
