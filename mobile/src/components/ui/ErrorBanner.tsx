import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { brand } from "../../theme";

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <View style={styles.box} accessibilityRole="alert">
      <MaterialCommunityIcons name="alert-circle-outline" size={20} color={brand.danger} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: brand.dangerLight,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  text: { flex: 1, color: brand.danger, fontSize: 13.5, fontWeight: "600", lineHeight: 19 },
});
