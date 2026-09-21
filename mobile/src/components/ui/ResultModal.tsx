import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { brand } from "../../theme";
import { PrimaryButton } from "./Buttons";

// Modal de confirmación con estilo de marca (check verde en círculo).
export function ResultModal({
  visible,
  title,
  children,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  onRequestClose,
}: {
  visible: boolean;
  title: string;
  children: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onRequestClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="check-bold" size={34} color={brand.green} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{children}</Text>
          <PrimaryButton label={primaryLabel} onPress={onPrimary} style={styles.primary} />
          {secondaryLabel && onSecondary && (
            <TouchableOpacity style={styles.secondary} onPress={onSecondary}>
              <Text style={styles.secondaryText}>{secondaryLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

export function Bold({ children }: { children: ReactNode }) {
  return <Text style={styles.bold}>{children}</Text>;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 20, 40, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: brand.white,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: brand.greenLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: { fontSize: 20, fontWeight: "800", color: brand.navy, marginBottom: 8, textAlign: "center" },
  message: { fontSize: 14.5, color: brand.textSecondary, textAlign: "center", lineHeight: 21 },
  bold: { fontWeight: "800", color: brand.textPrimary },
  primary: { alignSelf: "stretch", marginTop: 20 },
  secondary: { paddingVertical: 12, alignItems: "center" },
  secondaryText: { color: brand.textSecondary, fontWeight: "700", fontSize: 14 },
});
