import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { api, ApiError } from "../../src/api";
import { colors } from "../../src/theme";
import type { Operacion, RutaTarifa, VehiculoDisponible } from "../../src/types";
import { formatCOP } from "../../src/format";

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
    <>
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
      <Text style={styles.heading}>Solicitar viaje adicional</Text>
      <Text style={styles.helper}>
        Completa la información del viaje. Cointra revisará tu solicitud y adjuntará el manifiesto.
      </Text>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.label}>Operación</Text>
      <View style={styles.pickerWrap}>
        <Picker selectedValue={operacionId ?? ""} onValueChange={(v) => setOperacionId(v ? Number(v) : null)}>
          <Picker.Item label="Seleccione..." value="" />
          {operaciones.map((op) => (
            <Picker.Item key={op.id} label={op.nombre} value={op.id} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Vehículo</Text>
      <View style={styles.pickerWrap}>
        <Picker
          selectedValue={vehiculoId ?? ""}
          enabled={!!operacionId && !loadingVehiculos}
          onValueChange={(v) => setVehiculoId(v ? Number(v) : null)}
        >
          <Picker.Item label={loadingVehiculos ? "Cargando..." : "Seleccione..."} value="" />
          {vehiculos.map((v) => (
            <Picker.Item key={v.id} label={`${v.placa} (${v.tipo_vehiculo_nombre})`} value={v.id} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Solicitud</Text>
      <TextInput
        value={form.titulo}
        onChangeText={(v) => setField("titulo", v)}
        placeholder="Ej. Viaje adicional urgente a Medellín"
        style={styles.input}
      />

      <Text style={styles.label}>Fecha de viaje</Text>
      {Platform.OS === "web" ? (
        // El módulo nativo del selector no corre en el export web (solo
        // sirve para previsualizar en el navegador) — ahí se mantiene el
        // campo de texto. En Android/iOS siempre se usa el calendario nativo.
        <TextInput
          value={form.fecha_viaje}
          onChangeText={(v) => setField("fecha_viaje", v)}
          placeholder="2026-09-30 (AAAA-MM-DD)"
          style={styles.input}
        />
      ) : (
        <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
          <Text style={{ fontSize: 14, color: fechaViajeDate ? colors.text : "#94A3B8" }}>
            {fechaViajeDate ? formatDateForDisplay(fechaViajeDate) : "Toca para elegir la fecha"}
          </Text>
        </TouchableOpacity>
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

      <Text style={styles.label}>Producto</Text>
      <TextInput value={form.producto} onChangeText={(v) => setField("producto", v)} style={styles.input} />

      <Text style={styles.label}>Origen</Text>
      <View style={styles.pickerWrap}>
        <Picker
          selectedValue={origen}
          onValueChange={(v) => { setOrigen(String(v)); setDestino(""); }}
        >
          <Picker.Item label="Seleccione..." value="" />
          {origenes.map((o) => (
            <Picker.Item key={o} label={o} value={o} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Destino</Text>
      <View style={styles.pickerWrap}>
        <Picker selectedValue={destino} enabled={!!origen} onValueChange={(v) => setDestino(String(v))}>
          <Picker.Item label="Seleccione..." value="" />
          {destinos.map((d) => (
            <Picker.Item key={d} label={d} value={d} />
          ))}
        </Picker>
      </View>

      <View style={styles.tarifaBox}>
        {buscandoTarifa ? (
          <Text style={styles.tarifaHelper}>Consultando tarifa...</Text>
        ) : tarifaCliente !== null ? (
          <Text style={styles.tarifaOk}>Tarifa cliente: {formatCOP(tarifaCliente)}</Text>
        ) : tarifaError ? (
          <Text style={styles.tarifaError}>{tarifaError}</Text>
        ) : (
          <Text style={styles.tarifaHelper}>Selecciona vehículo, origen y destino para ver la tarifa.</Text>
        )}
      </View>

      <Text style={styles.label}>Observaciones</Text>
      <TextInput
        value={form.observaciones}
        onChangeText={(v) => setField("observaciones", v)}
        multiline
        numberOfLines={3}
        style={[styles.input, styles.textarea]}
      />

      <TouchableOpacity style={[styles.button, !puedeEnviar && styles.buttonDisabled]} onPress={onSubmit} disabled={!puedeEnviar}>
        {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Enviar solicitud</Text>}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
    <ConfirmacionSolicitudModal
      solicitud={solicitudCreada}
      onClose={() => setSolicitudCreada(null)}
      onVerSolicitudes={() => {
        setSolicitudCreada(null);
        router.push("/(tabs)/solicitudes");
      }}
    />
    </>
  );
}

function ConfirmacionSolicitudModal({
  solicitud,
  onClose,
  onVerSolicitudes,
}: {
  solicitud: { id: number } | null;
  onClose: () => void;
  onVerSolicitudes: () => void;
}) {
  return (
    <Modal visible={!!solicitud} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.card}>
          <Text style={modalStyles.icon}>✓</Text>
          <Text style={modalStyles.title}>Solicitud enviada</Text>
          <Text style={modalStyles.message}>
            Tu solicitud quedó registrada con el número{" "}
            <Text style={modalStyles.messageBold}>#{solicitud?.id}</Text>. Ya tiene tarifa asignada — Cointra
            adjuntará el manifiesto en cuanto la revise.
          </Text>
          <TouchableOpacity style={modalStyles.primaryButton} onPress={onVerSolicitudes}>
            <Text style={modalStyles.primaryButtonText}>Ver mis solicitudes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={modalStyles.secondaryButton} onPress={onClose}>
            <Text style={modalStyles.secondaryButtonText}>Seguir solicitando</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  heading: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 4 },
  helper: { fontSize: 13, color: colors.neutral, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: "600", color: colors.neutral, marginBottom: 4, marginTop: 12, textTransform: "uppercase" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.white,
  },
  textarea: { minHeight: 80, textAlignVertical: "top" },
  pickerWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.white,
    overflow: "hidden",
  },
  error: { color: colors.danger, fontSize: 13, marginBottom: 8, fontWeight: "500" },
  tarifaBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tarifaHelper: { fontSize: 13, color: colors.neutral },
  tarifaOk: { fontSize: 13, color: colors.success, fontWeight: "700" },
  tarifaError: { fontSize: 13, color: colors.danger, fontWeight: "600" },
  button: {
    marginTop: 24,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.white, fontWeight: "600", fontSize: 14 },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  icon: {
    fontSize: 32,
    color: colors.success,
    fontWeight: "700",
    marginBottom: 8,
  },
  title: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 8, textAlign: "center" },
  message: { fontSize: 13, color: colors.neutral, textAlign: "center", lineHeight: 19, marginBottom: 20 },
  messageBold: { fontWeight: "700", color: colors.text },
  primaryButton: {
    width: "100%",
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  primaryButtonText: { color: colors.white, fontWeight: "600", fontSize: 14 },
  secondaryButton: { paddingVertical: 8, alignItems: "center" },
  secondaryButtonText: { color: colors.neutral, fontWeight: "600", fontSize: 13 },
});
