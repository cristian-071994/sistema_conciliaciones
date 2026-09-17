import { useEffect, useState } from "react";
import { Redirect, useRouter } from "expo-router";
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
import { useAuth } from "../src/auth";
import { api, ApiError } from "../src/api";
import { colors } from "../src/theme";
import { BackHeader } from "../src/components/BackHeader";
import type { TipoVehiculo } from "../src/types";

// Formulario para crear una tarifa de ruta (Viaje Adicional) desde la app:
// origen + destino + tipo de vehículo + tarifa cliente. El backend calcula
// tarifa tercero y rentabilidad (10% por defecto) — ver
// backend/app/api/routes/tarifas.py::upsert_catalogo_tarifa. Sirve para que
// el cliente resuelva en el momento una tarifa faltante, sin depender de
// que Cointra esté disponible (p.ej. de madrugada).
export default function TarifasScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [tipos, setTipos] = useState<TipoVehiculo[]>([]);
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [tipoVehiculoId, setTipoVehiculoId] = useState<number | null>(null);
  const [tarifaCliente, setTarifaCliente] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tarifaCreada, setTarifaCreada] = useState<{ origen: string; destino: string } | null>(null);

  useEffect(() => {
    void api.tiposVehiculo().then(setTipos).catch(() => setTipos([]));
  }, []);

  if (!user) return <Redirect href="/(auth)/bienvenida" />;

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
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear la tarifa");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <BackHeader label="Inicio" onPress={() => router.push("/inicio")} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Text style={styles.heading}>Crear tarifa</Text>
        <Text style={styles.helper}>
          Registra la tarifa cliente para una ruta y tipo de vehículo. El sistema calcula internamente la tarifa
          tercero y la rentabilidad.
        </Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.label}>Origen</Text>
        <TextInput value={origen} onChangeText={setOrigen} placeholder="Ej. Bogota" style={styles.input} />

        <Text style={styles.label}>Destino</Text>
        <TextInput value={destino} onChangeText={setDestino} placeholder="Ej. Medellin" style={styles.input} />

        <Text style={styles.label}>Tipo de vehículo</Text>
        <View style={styles.pickerWrap}>
          <Picker
            selectedValue={tipoVehiculoId ?? ""}
            onValueChange={(v) => setTipoVehiculoId(v ? Number(v) : null)}
            style={{ color: colors.text }}
          >
            <Picker.Item label="Seleccione..." value="" />
            {tipos.map((t) => (
              <Picker.Item key={t.id} label={t.nombre} value={t.id} />
            ))}
          </Picker>
        </View>

        <Text style={styles.label}>Tarifa cliente</Text>
        <TextInput
          value={tarifaCliente}
          onChangeText={setTarifaCliente}
          keyboardType="numeric"
          placeholder="Ej. 500000"
          style={styles.input}
        />

        <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Guardar tarifa</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={!!tarifaCreada} transparent animationType="fade" onRequestClose={() => setTarifaCreada(null)}>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.card}>
            <Text style={modalStyles.icon}>✓</Text>
            <Text style={modalStyles.title}>Tarifa creada</Text>
            <Text style={modalStyles.message}>
              Se creó la tarifa para la ruta{" "}
              <Text style={modalStyles.messageBold}>
                {tarifaCreada?.origen} → {tarifaCreada?.destino}
              </Text>
              . Ya está disponible para solicitar viajes adicionales en esa ruta.
            </Text>
            <TouchableOpacity style={modalStyles.primaryButton} onPress={() => setTarifaCreada(null)}>
              <Text style={modalStyles.primaryButtonText}>Aceptar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  heading: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 4 },
  helper: { fontSize: 13, color: colors.neutral, marginBottom: 16, lineHeight: 18 },
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
  pickerWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.white,
    overflow: "hidden",
  },
  error: { color: colors.danger, fontSize: 13, marginBottom: 8, fontWeight: "500" },
  button: {
    marginTop: 24,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
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
  icon: { fontSize: 32, color: colors.success, fontWeight: "700", marginBottom: 8 },
  title: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 8, textAlign: "center" },
  message: { fontSize: 13, color: colors.neutral, textAlign: "center", lineHeight: 19, marginBottom: 20 },
  messageBold: { fontWeight: "700", color: colors.text },
  primaryButton: {
    width: "100%",
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: { color: colors.white, fontWeight: "600", fontSize: 14 },
});
