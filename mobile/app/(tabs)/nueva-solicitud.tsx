import { useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { api, ApiError } from "../../src/api";
import { useAuth } from "../../src/auth";
import { brand } from "../../src/theme";
import type { Operacion, RutaTarifa, VehiculoDisponible } from "../../src/types";
import { ScreenHeader } from "../../src/components/brand/ScreenHeader";
import { PressableField, SelectField, TextField } from "../../src/components/ui/Fields";
import { PrimaryButton } from "../../src/components/ui/Buttons";
import { SectionCard } from "../../src/components/ui/SectionCard";
import { ErrorBanner } from "../../src/components/ui/ErrorBanner";
import { Bold, ResultModal } from "../../src/components/ui/ResultModal";
import { TarifaPreview } from "../../src/components/solicitudes/TarifaPreview";

function formatDateForApi(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateForDisplay(d: Date): string {
  return d.toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });
}

const initialForm = {
  titulo: "",
  fecha_viaje: "",
  producto: "",
  observaciones: "",
};

export default function NuevaSolicitudScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);
  const [vehiculos, setVehiculos] = useState<VehiculoDisponible[]>([]);
  const [rutas, setRutas] = useState<RutaTarifa[]>([]);
  const [operacionId, setOperacionId] = useState<number | null>(null);
  const [vehiculoId, setVehiculoId] = useState<number | null>(null);
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [form, setForm] = useState(initialForm);
  const [fechaViajeDate, setFechaViajeDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingVehiculos, setLoadingVehiculos] = useState(false);
  const [tarifaCliente, setTarifaCliente] = useState<number | null>(null);
  const [tarifaError, setTarifaError] = useState("");
  const [buscandoTarifa, setBuscandoTarifa] = useState(false);
  const [solicitudCreada, setSolicitudCreada] = useState<{ id: number } | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    void api.operaciones().then(setOperaciones).catch(() => setOperaciones([]));
    void api.rutasTarifa().then(setRutas).catch(() => setRutas([]));
  }, []);

  // Cuando aparece el teclado, sube el scroll hasta el final del formulario
  // para que el botón "Enviar solicitud" quede visible arriba del teclado
  // en vez de quedar tapado (el paddingBottom extra del contentContainer
  // deja espacio suficiente para que el scroll llegue hasta ahí).
  useEffect(() => {
    const evento = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const sub = Keyboard.addListener(evento, () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!operacionId) {
      setVehiculos([]);
      setVehiculoId(null);
      return;
    }
    setLoadingVehiculos(true);
    void api
      .vehiculosDisponibles(operacionId)
      .then((rows) => {
        setVehiculos(rows);
        setVehiculoId(null);
      })
      .catch(() => setVehiculos([]))
      .finally(() => setLoadingVehiculos(false));
  }, [operacionId]);

  const vehiculoSeleccionado = vehiculos.find((v) => v.id === vehiculoId) ?? null;
  const origenes = Array.from(new Set(rutas.map((r) => r.origen))).sort();
  const destinos = Array.from(new Set(rutas.filter((r) => r.origen === origen).map((r) => r.destino))).sort();

  // Consulta en vivo apenas hay vehículo + origen + destino: si el catálogo
  // no tiene tarifa para esa combinación, se bloquea el envío (ver mensaje
  // más abajo) y se avisa que hay que crearla desde el módulo Tarifas.
  useEffect(() => {
    if (!vehiculoSeleccionado || !origen || !destino) {
      setTarifaCliente(null);
      setTarifaError("");
      return;
    }
    let cancelado = false;
    setBuscandoTarifa(true);
    setTarifaError("");
    void api
      .lookupTarifaRuta(origen, destino, vehiculoSeleccionado.tipo_vehiculo_id)
      .then((res) => {
        if (cancelado) return;
        setTarifaCliente(res.tarifa_cliente);
      })
      .catch(() => {
        if (cancelado) return;
        setTarifaCliente(null);
        setTarifaError(
          `No existe tarifa para ${origen} → ${destino} con vehículo tipo "${vehiculoSeleccionado.tipo_vehiculo_nombre}". Crea la tarifa desde el módulo Tarifas.`
        );
      })
      .finally(() => {
        if (!cancelado) setBuscandoTarifa(false);
      });
    return () => {
      cancelado = true;
    };
  }, [vehiculoSeleccionado, origen, destino]);

  function setField(field: keyof typeof initialForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function isFechaValida(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  const puedeEnviar =
    !!operacionId && !!vehiculoId && !!origen && !!destino && tarifaCliente !== null && !submitting;

  async function onSubmit() {
    setError("");
    if (!operacionId) return setError("Selecciona la operación");
    if (!vehiculoId) return setError("Selecciona el vehículo");
    if (!form.titulo.trim()) return setError("Escribe el título de la solicitud");
    if (!isFechaValida(form.fecha_viaje)) return setError("La fecha de viaje debe tener el formato AAAA-MM-DD");
    if (!origen || !destino) return setError("Selecciona origen y destino");
    if (tarifaCliente === null) return setError("No hay tarifa para esta ruta y vehículo — créala primero");
    if (!form.producto.trim()) return setError("Escribe el producto");

    setSubmitting(true);
    try {
      const creada = await api.crearSolicitud({
        operacion_id: operacionId,
        vehiculo_id: vehiculoId,
        titulo: form.titulo.trim(),
        fecha_viaje: form.fecha_viaje,
        origen,
        destino,
        producto: form.producto.trim(),
        observaciones: form.observaciones.trim() || undefined,
      });
      setForm(initialForm);
      setFechaViajeDate(null);
      setOperacionId(null);
      setOrigen("");
      setDestino("");
      setSolicitudCreada({ id: creada.id });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo enviar la solicitud");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Solicitudes"
        subtitle="Solicita un viaje adicional"
        icon="text-box-plus-outline"
        accent={brand.green}
        accentLight={brand.greenLight}
        onBack={() => router.push("/inicio")}
        onLogout={() => void logout()}
      />
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.screen}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <ErrorBanner message={error} />

          <SectionCard
            title="Datos del viaje"
            helper="Cointra revisará tu solicitud y adjuntará el manifiesto."
            accent={brand.green}
          >
            <SelectField
              label="Operación"
              selectedValue={operacionId ?? ""}
              onValueChange={(v) => setOperacionId(v ? Number(v) : null)}
              items={operaciones.map((op) => ({ label: op.nombre, value: op.id }))}
            />
            <SelectField
              label="Vehículo"
              selectedValue={vehiculoId ?? ""}
              enabled={!!operacionId && !loadingVehiculos}
              onValueChange={(v) => setVehiculoId(v ? Number(v) : null)}
              placeholder={loadingVehiculos ? "Cargando..." : operacionId ? "Seleccione..." : "Primero elige la operación"}
              items={vehiculos.map((v) => ({ label: `${v.placa} (${v.tipo_vehiculo_nombre})`, value: v.id }))}
            />
            <TextField
              label="Solicitud"
              icon="text-short"
              value={form.titulo}
              onChangeText={(v) => setField("titulo", v)}
              placeholder="Ej. Viaje adicional urgente a Medellín"
              maxLength={150}
            />
            {Platform.OS === "web" ? (
              // El selector nativo no corre en el export web (solo preview en
              // navegador): ahí se usa texto. En Android/iOS, calendario nativo.
              <TextField
                label="Fecha de viaje"
                icon="calendar-month-outline"
                value={form.fecha_viaje}
                onChangeText={(v) => setField("fecha_viaje", v)}
                placeholder="2026-09-30 (AAAA-MM-DD)"
              />
            ) : (
              <PressableField
                label="Fecha de viaje"
                icon="calendar-month-outline"
                value={fechaViajeDate ? formatDateForDisplay(fechaViajeDate) : ""}
                placeholder="Toca para elegir la fecha"
                onPress={() => setShowDatePicker(true)}
              />
            )}
            {showDatePicker && Platform.OS !== "web" && (
              <DateTimePicker
                value={fechaViajeDate ?? new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "calendar"}
                minimumDate={new Date()}
                onValueChange={(_event, selectedDate) => {
                  setShowDatePicker(false);
                  if (selectedDate) {
                    setFechaViajeDate(selectedDate);
                    setField("fecha_viaje", formatDateForApi(selectedDate));
                  }
                }}
              />
            )}
            <TextField
              label="Producto"
              icon="package-variant-closed"
              value={form.producto}
              onChangeText={(v) => setField("producto", v)}
              placeholder="Ej. Refrigerados"
              maxLength={120}
            />
          </SectionCard>

          <SectionCard title="Ruta y tarifa" helper="La tarifa se consulta sola al elegir la ruta." accent={brand.orange}>
            <SelectField
              label="Origen"
              selectedValue={origen}
              onValueChange={(v) => {
                setOrigen(String(v));
                setDestino("");
              }}
              items={origenes.map((o) => ({ label: o, value: o }))}
            />
            <SelectField
              label="Destino"
              selectedValue={destino}
              enabled={!!origen}
              onValueChange={(v) => setDestino(String(v))}
              placeholder={origen ? "Seleccione..." : "Primero elige el origen"}
              items={destinos.map((d) => ({ label: d, value: d }))}
            />
            <TarifaPreview
              buscando={buscandoTarifa}
              tarifa={tarifaCliente}
              error={tarifaError}
              onCrearTarifa={() => router.push("/tarifas")}
            />
          </SectionCard>

          <SectionCard title="Observaciones" helper="Opcional: cualquier detalle útil para Cointra." accent={brand.navySecondary}>
            <TextField
              label="Notas"
              value={form.observaciones}
              onChangeText={(v) => setField("observaciones", v)}
              multiline
              numberOfLines={3}
              maxLength={500}
              style={styles.textarea}
            />
          </SectionCard>

          <PrimaryButton
            label="Enviar solicitud"
            icon="send"
            onPress={onSubmit}
            disabled={!puedeEnviar}
            loading={submitting}
            style={styles.submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <ResultModal
        visible={!!solicitudCreada}
        title="Solicitud enviada"
        primaryLabel="Ver mis solicitudes"
        onPrimary={() => {
          setSolicitudCreada(null);
          router.push("/(tabs)/solicitudes");
        }}
        secondaryLabel="Seguir solicitando"
        onSecondary={() => setSolicitudCreada(null)}
        onRequestClose={() => setSolicitudCreada(null)}
      >
        Tu solicitud quedó registrada con el número <Bold>#{solicitudCreada?.id}</Bold>. Ya tiene tarifa asignada:
        Cointra adjuntará el manifiesto en cuanto la revise.
      </ResultModal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingTop: 4, paddingBottom: 220 },
  textarea: { minHeight: 80, textAlignVertical: "top" },
  submit: { marginTop: 4 },
});
