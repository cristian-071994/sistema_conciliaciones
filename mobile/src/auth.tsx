import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { storage, REFRESH_TOKEN_STORAGE_KEY, TOKEN_STORAGE_KEY } from "./storage";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  authChecked: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await storage.getItem(TOKEN_STORAGE_KEY);
      if (!token) {
        setAuthChecked(true);
        return;
      }
      try {
        // Si el access token ya venció (dura 8h), api.me() lo renueva sola
        // con el refresh token (dura 30 días) antes de fallar — ver
        // refreshAccessToken() en api.ts. Solo llega aquí al catch si
        // tampoco hay refresh token válido, y ahí sí hay que pedir login.
        setUser(await api.me());
      } catch {
        await storage.removeItem(TOKEN_STORAGE_KEY);
        await storage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const me = await api.login(email, password);
    if (me.rol !== "CLIENTE") {
      // Esta app es solo para clientes solicitando viajes adicionales — el
      // backend no tiene endpoints exclusivos de móvil, pero la app sí
      // restringe quién puede entrar.
      await api.logout();
      throw new Error("Esta aplicación es solo para usuarios Cliente");
    }
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, authChecked, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
