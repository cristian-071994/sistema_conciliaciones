import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// expo-secure-store no funciona en web (usa Keychain/Keystore nativo) — en
// esa plataforma caemos a localStorage. La app real (Android) siempre usa
// SecureStore; web es solo para previsualizar en el navegador/Docker.
export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      return window.localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      window.localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      window.localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const TOKEN_STORAGE_KEY = "cointra_viajes_adicionales_token";
export const REFRESH_TOKEN_STORAGE_KEY = "cointra_viajes_adicionales_refresh_token";
