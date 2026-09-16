import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
// La API "clásica" (cacheDirectory/downloadAsync/getContentUriAsync) se
// movió a este subpath en SDK 57; la raíz "expo-file-system" ahora expone
// la API nueva basada en clases File/Directory/Paths.
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { WebView } from "react-native-webview";
import { api } from "../../src/api";
import { colors } from "../../src/theme";
import { BackHeader } from "../../src/components/BackHeader";

// Android WebView no renderiza PDF de forma nativa — se descarga el archivo
// y se abre con el visor de PDF del sistema vía Intent (ACTION_VIEW).
// iOS sí puede mostrarlo embebido en un WebView (WKWebView soporta PDF).
// Web abre el blob en una pestaña nueva, igual que la versión de escritorio.
export default function ManifiestoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"cargando" | "error" | "listo">("cargando");
  const [localUri, setLocalUri] = useState<string | null>(null);

  function volverAMisSolicitudes() {
    router.replace("/(tabs)/solicitudes");
  }

  useEffect(() => {
    let cancelled = false;

    async function cargar() {
      setStatus("cargando");
      try {
        const solicitudId = Number(id);
        const { url, headers } = await api.manifiestoDownloadInfo(solicitudId);

        if (Platform.OS === "web") {
          const response = await fetch(url, { headers });
          if (!response.ok) throw new Error("No se pudo descargar el manifiesto");
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          window.open(objectUrl, "_blank", "noopener,noreferrer");
          // El PDF se ve en la pestaña nueva, no en esta pantalla — no hay
          // nada más que revisar aquí, así que se vuelve directo al listado.
          if (!cancelled) router.replace("/(tabs)/solicitudes");
          return;
        }

        const destino = `${FileSystem.cacheDirectory}manifiesto-${solicitudId}.pdf`;
        const { uri } = await FileSystem.downloadAsync(url, destino, { headers });
        if (cancelled) return;

        if (Platform.OS === "android") {
          const contentUri = await FileSystem.getContentUriAsync(uri);
          await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
            data: contentUri,
            flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
            type: "application/pdf",
          });
          // Igual que en web: el visor de PDF del sistema es una app aparte,
          // así que esta pantalla vuelve sola al listado en vez de quedar
          // esperando ahí.
          if (!cancelled) router.replace("/(tabs)/solicitudes");
        } else {
          setLocalUri(uri);
          setStatus("listo");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void cargar();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (status === "cargando") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <BackHeader label="Mis solicitudes" onPress={volverAMisSolicitudes} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.helper}>Cargando manifiesto...</Text>
        </View>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <BackHeader label="Mis solicitudes" onPress={volverAMisSolicitudes} />
        <View style={styles.center}>
          <Text style={styles.error}>No se pudo cargar el manifiesto.</Text>
          <TouchableOpacity style={styles.volverButton} onPress={volverAMisSolicitudes}>
            <Text style={styles.volverButtonText}>Volver a mis solicitudes</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Solo llega aquí iOS con el WebView embebido — ahí sí se está revisando
  // el PDF en esta misma pantalla, por eso lleva su propia barra para volver.
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <BackHeader label="Mis solicitudes" onPress={volverAMisSolicitudes} />
      {localUri && <WebView source={{ uri: localUri }} style={{ flex: 1 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: 24 },
  helper: { marginTop: 12, color: colors.neutral, fontSize: 13, textAlign: "center" },
  error: { color: colors.danger, fontSize: 14, fontWeight: "600", textAlign: "center" },
  volverButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  volverButtonText: { color: colors.white, fontWeight: "600", fontSize: 13 },
});
