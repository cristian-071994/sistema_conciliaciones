import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme";

// Flecha de "volver" consistente para pantallas sin header nativo (las que
// viven fuera de (tabs), donde React Navigation no dibuja uno solo). Respeta
// el safe area superior para no quedar pegada al notch/barra de estado.
export function BackHeader({ label, onPress }: { label: string; onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity style={styles.button} onPress={onPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.arrow}>‹</Text>
        <Text style={styles.label}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 8 },
  button: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  arrow: { color: colors.primary, fontWeight: "700", fontSize: 22, marginRight: 4, lineHeight: 22 },
  label: { color: colors.primary, fontWeight: "600", fontSize: 15 },
});
