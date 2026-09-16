import { useRouter } from "expo-router";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "../../src/theme";

// Misma portada que la web (frontend/src/pages/LandingPage.tsx): logo,
// nombre del módulo y botón que lleva al login. Se muestra siempre que se
// abre la app sin sesión activa — igual que "/" en la web antes de "/login".
export default function BienvenidaScreen() {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />

      <View style={styles.content}>
        <Image
          source={require("../../assets/logo-cointra.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.moduleName}>REFRIGERADOS</Text>

        <Text style={styles.title}>Sistema de conciliación de servicios de transporte</Text>
        <Text style={styles.subtitle}>
          Solicita tus viajes adicionales y consulta el estado de tus manifiestos desde el celular.
        </Text>

        <TouchableOpacity style={styles.button} onPress={() => router.push("/(auth)/login")}>
          <Text style={styles.buttonText}>Ingresar</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>Módulo de conciliación · Cointra S.A.S.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    overflow: "hidden",
  },
  blobTop: {
    position: "absolute",
    top: -80,
    left: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: `${colors.primary}1A`,
  },
  blobBottom: {
    position: "absolute",
    bottom: -80,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: `${colors.primary}1A`,
  },
  content: { alignItems: "center", maxWidth: 380 },
  logo: { width: 220, height: 47, marginBottom: 8 },
  moduleName: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.neutral,
    letterSpacing: 1,
    marginBottom: 24,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center" },
  subtitle: { fontSize: 13, color: colors.neutral, textAlign: "center", marginTop: 10, lineHeight: 19 },
  button: {
    marginTop: 28,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  buttonText: { color: colors.white, fontWeight: "700", fontSize: 14 },
  footer: { position: "absolute", bottom: 24, fontSize: 11, color: colors.neutral },
});
