import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View } from "react-native";
import { brand } from "../../theme";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

// Campos de formulario con el estilo de marca. Solo presentación: el valor y
// la validación los maneja la pantalla (y la validación real, el backend).

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function TextField({
  label,
  icon,
  prefix,
  style,
  ...inputProps
}: TextInputProps & { label: string; icon?: IconName; prefix?: string }) {
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <View style={[styles.box, inputProps.multiline && styles.boxMultiline]}>
        {icon && <MaterialCommunityIcons name={icon} size={20} color={brand.textSecondary} style={styles.icon} />}
        {prefix && <Text style={styles.prefix}>{prefix}</Text>}
        <TextInput placeholderTextColor="#9AA3AF" style={[styles.input, style]} {...inputProps} />
      </View>
    </View>
  );
}

export function PressableField({
  label,
  icon,
  value,
  placeholder,
  onPress,
}: {
  label: string;
  icon: IconName;
  value?: string;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <TouchableOpacity style={styles.box} onPress={onPress} activeOpacity={0.8}>
        <MaterialCommunityIcons name={icon} size={20} color={brand.textSecondary} style={styles.icon} />
        <Text style={[styles.pressText, !value && styles.placeholder]}>{value || placeholder}</Text>
        <MaterialCommunityIcons name="chevron-down" size={20} color={brand.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

export type SelectItem = { label: string; value: string | number };

export function SelectField({
  label,
  selectedValue,
  onValueChange,
  items,
  placeholder = "Seleccione...",
  enabled = true,
}: {
  label: string;
  selectedValue: string | number;
  onValueChange: (value: string | number) => void;
  items: SelectItem[];
  placeholder?: string;
  enabled?: boolean;
}) {
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <View style={[styles.pickerBox, !enabled && styles.disabled]}>
        <Picker
          selectedValue={selectedValue}
          enabled={enabled}
          onValueChange={onValueChange}
          style={{ color: brand.textPrimary }}
          dropdownIconColor={brand.navy}
        >
          <Picker.Item label={placeholder} value="" color="#9AA3AF" />
          {items.map((it) => (
            <Picker.Item key={String(it.value)} label={it.label} value={it.value} color={brand.textPrimary} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: 14 },
  label: { fontSize: 13, fontWeight: "700", color: brand.textPrimary, marginBottom: 6 },
  box: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: brand.white,
  },
  boxMultiline: { alignItems: "flex-start", paddingVertical: 10 },
  icon: { marginRight: 10 },
  prefix: { fontSize: 16, fontWeight: "700", color: brand.textSecondary, marginRight: 6 },
  input: { flex: 1, fontSize: 15, color: brand.textPrimary, paddingVertical: 12 },
  pressText: { flex: 1, fontSize: 15, color: brand.textPrimary },
  placeholder: { color: "#9AA3AF" },
  pickerBox: {
    minHeight: 52,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 14,
    backgroundColor: brand.white,
    overflow: "hidden",
  },
  disabled: { opacity: 0.55 },
});
