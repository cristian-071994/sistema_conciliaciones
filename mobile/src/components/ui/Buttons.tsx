import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle } from "react-native";
import { brand } from "../../theme";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  style?: ViewStyle;
}) {
  const inactive = disabled || loading;
  return (
    <TouchableOpacity
      style={[styles.primary, inactive && styles.inactive, style]}
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
    >
      {loading ? (
        <ActivityIndicator color={brand.white} />
      ) : (
        <>
          {icon && <MaterialCommunityIcons name={icon} size={20} color={brand.white} />}
          <Text style={styles.primaryText}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function SoftButton({
  label,
  onPress,
  color = brand.navy,
  background = brand.pill,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  background?: string;
  icon?: IconName;
  style?: ViewStyle;
}) {
  return (
    <TouchableOpacity
      style={[styles.soft, { backgroundColor: background }, style]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
    >
      {icon && <MaterialCommunityIcons name={icon} size={16} color={color} />}
      <Text style={[styles.softText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  primary: {
    flexDirection: "row",
    gap: 8,
    marginTop: 22,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: brand.navy,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: brand.navy,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  inactive: { opacity: 0.45, elevation: 0, shadowOpacity: 0 },
  primaryText: { color: brand.white, fontWeight: "700", fontSize: 16 },
  soft: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  softText: { fontWeight: "700", fontSize: 13 },
});
