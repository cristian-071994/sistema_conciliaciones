import { useEffect, useMemo, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth";
import { api, ApiError } from "../src/api";
import { brand } from "../src/theme";
import { formatCOP } from "../src/format";
import type { RutaTarifa, TipoVehiculo } from "../src/types";
import { ScreenHeader } from "../src/components/brand/ScreenHeader";
import { SelectField, TextField } from "../src/components/ui/Fields";
import { PrimaryButton, SoftButton } from "../src/components/ui/Buttons";
import { SectionCard } from "../src/components/ui/SectionCard";
import { ErrorBanner } from "../src/components/ui/ErrorBanner";
import { Bold, ResultModal } from "../src/components/ui/ResultModal";
import { RutaTarifaCard } from "../src/components/tarifas/RutaTarifaCard";

// Formulario para crear una tarifa de ruta (Viaje Adicional) desde la app:
// origen + destino + tipo de vehículo + tarifa cliente. El backend calcula
// tarifa tercero y rentabilidad (10% por defecto) — ver
// backend/app/api/routes/tarifas.py::upsert_catalogo_tarifa. Sirve para que
// el cliente resuelva en el momento una tarifa faltante, sin depender de
// que Cointra esté disponible (p.ej. de madrugada).
export default function TarifasScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [tipos, setTipos] = useState<TipoVehiculo[]>([]);
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [tipoVehiculoId, setTipoVehiculoId] = useState<number | null>(null);
  const [tarifaCliente, setTarifaCliente] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tarifaCreada, setTarifaCreada] = useState<{ origen: string; destino: string } | null>(null);

  const [rutas, setRutas] = useState<RutaTarifa[]>([]);
  const [loadingRutas, setLoadingRutas] = useState(true);
  const [filtroOrigen, setFiltroOrigen] = useState("");
  const [filtroDestino, setFiltroDestino] = useState("");
  const [filtroTipoVehiculoId, setFiltroTipoVehiculoId] = useState<number | null>(null);

  function cargarRutas() {
    setLoadingRutas(true);
    api
      .rutasTarifa()
      .then(setRutas)
      .catch(() => setRutas([]))
      .finally(() => setLoadingRutas(false));
  }

  useEffect(() => {
    void api.tiposVehiculo().then(setTipos).catch(() => setTipos([]));
    cargarRutas();
  }, []);

  const origenesDisponibles = useMemo(
    () => Array.from(new Set(rutas.map((r) => r.origen))).sort(),
    [rutas]
  );
  const destinosDisponibles = useMemo(
    () => Array.from(new Set(rutas.map((r) => r.destino))).sort(),
    [rutas]
  );
  const rutasFiltradas = useMemo(
    () =>
      rutas.filter(
        (r) =>
          (!filtroOrigen || r.origen === filtroOrigen) &&
          (!filtroDestino || r.destino === filtroDestino) &&
          (!filtroTipoVehiculoId || r.tipo_vehiculo_id === filtroTipoVehiculoId)
      ),
    [rutas, filtroOrigen, filtroDestino, filtroTipoVehiculoId]
  );
  const hayFiltrosActivos = !!filtroOrigen || !!filtroDestino || !!filtroTipoVehiculoId;

  if (!user) return <Redirect href="/(auth)/bienvenida" />;

  // Solo dígitos: evita pegar "$ 500.000" o letras. La validación definitiva
  // (monto > 0, límites) la sigue haciendo el backend.
  function onTarifaChange(v: string) {
    setTarifaCliente(v.replace(/\D/g, "").slice(0, 12));
  }
  const tarifaPreview = Number(tarifaCliente) > 0 ? formatCOP(Number(tarifaCliente)) : "";

  async function onSubmit() {
    setError("");
    if (!origen.trim() || !destino.trim()) return setError("Completa origen y destino");
    if (!tipoVehiculoId) return setError("Selecciona el tipo de vehículo");
    const valor = Number(tarifaCliente);
    if (!valor || valor <= 0) return setError("Ingresa una tarifa cliente válida");

    setSubmitting(true);
    try {
      await api.crearTarifaRuta({
        origen: origen.trim(),
        destino: destino.trim(),
        tipo_vehiculo_id: tipoVehiculoId,
        tarifa_cliente: valor,
      });
      setTarifaCreada({ origen: origen.trim(), destino: destino.trim() });
      setOrigen("");
      setDestino("");
      setTipoVehiculoId(null);
      setTarifaCliente("");
      cargarRutas();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear la tarifa");
    } finally {
      setSubmitting(false);
    }
  }

  const tiposItems = tipos.map((t) => ({ label: t.nombre, value: t.id }));

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Tarifas"
        subtitle="Crea la tarifa de una ruta nueva"
        icon="cash-multiple"
        accent={brand.orange}
        accentLight={brand.orangeLight}
        onBack={() => router.push("/inicio")}
        onLogout={() => void logout()}
      />
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <ErrorBanner message={error} />

          <SectionCard
            title="Nueva tarifa"
            helper="Registra la tarifa cliente. El sistema calcula la tarifa tercero y la rentabilidad."
            accent={brand.orange}
          >
            <TextField
              label="Origen"
              icon="map-marker-outline"
              value={origen}
              onChangeText={setOrigen}
              placeholder="Ej. Bogotá"
              maxLength={80}
            />
            <TextField
              label="Destino"
              icon="map-marker-check-outline"
              value={destino}
              onChangeText={setDestino}
              placeholder="Ej. Medellín"
              maxLength={80}
            />
            <SelectField
              label="Tipo de vehículo"
              selectedValue={tipoVehiculoId ?? ""}
              onValueChange={(v) => setTipoVehiculoId(v ? Number(v) : null)}
              items={tiposItems}
            />
            <TextField
              label="Tarifa cliente"
              prefix="$"
              value={tarifaCliente}
              onChangeText={onTarifaChange}
              keyboardType="number-pad"
              placeholder="500000"
            />
            {!!tarifaPreview && <Text style={styles.preview}>{tarifaPreview}</Text>}

            <PrimaryButton label="Guardar tarifa" icon="content-save-outline" onPress={onSubmit} loading={submitting} />
          </SectionCard>

          <SectionCard
            title="Tarifas existentes"
            helper="Filtra por origen, destino o tipo de vehículo."
            accent={brand.green}
          >
            <SelectField
              label="Origen"
              selectedValue={filtroOrigen}
              onValueChange={(v) => setFiltroOrigen(String(v))}
              placeholder="Todos"
              items={origenesDisponibles.map((o) => ({ label: o, value: o }))}
            />
            <SelectField
              label="Destino"
              selectedValue={filtroDestino}
              onValueChange={(v) => setFiltroDestino(String(v))}
              placeholder="Todos"
              items={destinosDisponibles.map((d) => ({ label: d, value: d }))}
            />
            <SelectField
              label="Tipo de vehículo"
              selectedValue={filtroTipoVehiculoId ?? ""}
              onValueChange={(v) => setFiltroTipoVehiculoId(v ? Number(v) : null)}
              placeholder="Todos"
              items={tiposItems}
            />

            <View style={styles.resultRow}>
              <Text style={styles.resultCount}>
                {loadingRutas ? "Cargando..." : `${rutasFiltradas.length} tarifa${rutasFiltradas.length === 1 ? "" : "s"}`}
              </Text>
              {hayFiltrosActivos && (
                <SoftButton
                  label="Limpiar filtros"
                  icon="filter-remove-outline"
                  onPress={() => {
                    setFiltroOrigen("");
                    setFiltroDestino("");
                    setFiltroTipoVehiculoId(null);
                  }}
                />
              )}
            </View>

            {loadingRutas ? (
              <ActivityIndicator color={brand.navy} style={{ marginTop: 16 }} />
            ) : rutasFiltradas.length === 0 ? (
              <Text style={styles.emptyText}>
                {rutas.length === 0 ? "Todavía no hay tarifas registradas." : "No hay tarifas que coincidan con el filtro."}
              </Text>
            ) : (
              <View style={styles.list}>
                {rutasFiltradas.map((r) => (
                  <RutaTarifaCard key={`${r.origen}-${r.destino}-${r.tipo_vehiculo_id}`} ruta={r} />
                ))}
              </View>
            )}
          </SectionCard>
        </ScrollView>
      </KeyboardAvoidingView>

      <ResultModal
        visible={!!tarifaCreada}
        title="Tarifa creada"
        primaryLabel="Aceptar"
        onPrimary={() => setTarifaCreada(null)}
        onRequestClose={() => setTarifaCreada(null)}
      >
        Se creó la tarifa para la ruta{" "}
        <Bold>
          {tarifaCreada?.origen} → {tarifaCreada?.destino}
        </Bold>
        . Ya está disponible para solicitar viajes adicionales en esa ruta.
      </ResultModal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingTop: 4, paddingBottom: 40 },
  preview: { marginTop: 6, marginLeft: 4, fontSize: 13, fontWeight: "700", color: brand.green },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 4,
    minHeight: 36,
  },
  resultCount: { fontSize: 13, fontWeight: "700", color: brand.textSecondary },
  emptyText: { marginTop: 16, fontSize: 14, color: brand.textSecondary, textAlign: "center" },
  list: { marginTop: 8, gap: 10 },
});
