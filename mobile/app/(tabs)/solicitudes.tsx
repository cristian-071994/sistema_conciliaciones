import { useCallback, useMemo, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { brand } from "../../src/theme";
import type { EstadoGestionSolicitud, SolicitudViajeAdicional } from "../../src/types";
import { ScreenHeader } from "../../src/components/brand/ScreenHeader";
import { ESTADOS_GESTION_ORDEN } from "../../src/components/solicitudes/estado";
import { ModoPeriodo, PeriodoSelector } from "../../src/components/solicitudes/PeriodoSelector";
import { ResumenPanel } from "../../src/components/solicitudes/ResumenPanel";
import { SolicitudCard } from "../../src/components/solicitudes/SolicitudCard";

function parseFechaViaje(fecha: string): { anio: number; mes: number } | null {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(fecha);
  if (!match) return null;
  return { anio: Number(match[1]), mes: Number(match[2]) };
}

export default function SolicitudesScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const [solicitudes, setSolicitudes] = useState<SolicitudViajeAdicional[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const hoy = new Date();
  const [modoFiltro, setModoFiltro] = useState<ModoPeriodo>("mes");
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

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Mis solicitudes"
        subtitle="Estado de tus viajes y manifiestos"
        icon="format-list-checks"
        accent={brand.green}
        accentLight={brand.greenLight}
        onBack={() => router.push("/inicio")}
        onLogout={() => void logout()}
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={brand.navy} />
        </View>
      ) : (
        <FlatList
          style={styles.screen}
          contentContainerStyle={styles.content}
          data={solicitudesFiltradas}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              colors={[brand.green]}
              tintColor={brand.green}
            />
          }
          ListHeaderComponent={
            <>
              <PeriodoSelector
                modo={modoFiltro}
                setModo={setModoFiltro}
                anio={anio}
                mes={mes}
                onAnterior={irPeriodoAnterior}
                onSiguiente={irPeriodoSiguiente}
              />
              {solicitudesFiltradas.length > 0 && <ResumenPanel stats={stats} />}
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <MaterialCommunityIcons
                  name={error ? "wifi-off" : "truck-outline"}
                  size={34}
                  color={error ? brand.danger : brand.textSecondary}
                />
              </View>
              <Text style={styles.emptyText}>
                {error ||
                  (solicitudes.length === 0
                    ? "No tienes solicitudes registradas todavía."
                    : "No tienes solicitudes en este período.")}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <SolicitudCard
              item={item}
              onVerManifiesto={() => router.push({ pathname: "/manifiesto/[id]", params: { id: String(item.id) } })}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingTop: 4, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", marginTop: 30, paddingHorizontal: 24 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: brand.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyText: { textAlign: "center", color: brand.textSecondary, fontSize: 14.5, lineHeight: 21 },
});
