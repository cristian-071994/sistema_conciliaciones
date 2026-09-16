import { storage, TOKEN_STORAGE_KEY } from "./storage";
import type {
  NuevaSolicitudPayload,
  Operacion,
  RutaTarifa,
  SolicitudViajeAdicional,
  TarifaLookupResult,
  TipoVehiculo,
  User,
  VehiculoDisponible,
} from "./types";

const VIAJE_ADICIONAL_SERVICIO_CODIGO = "VIAJE_ADICIONAL";

// EXPO_PUBLIC_* se inyecta en build-time (equivalente a VITE_API_URL en el
// frontend web). Ver .env.example.
const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:8001/api";

class ApiError extends Error {}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await storage.getItem(TOKEN_STORAGE_KEY);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.headers) Object.assign(headers, options.headers as Record<string, string>);
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const raw = await response.text();
    let message = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.detail === "string") message = parsed.detail;
    } catch {
      // texto plano
    }
    throw new ApiError(message || "Error en la solicitud");
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  async login(email: string, password: string): Promise<User> {
    const { access_token } = await request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await storage.setItem(TOKEN_STORAGE_KEY, access_token);
    return request<User>("/auth/me");
  },
  async logout(): Promise<void> {
    await storage.removeItem(TOKEN_STORAGE_KEY);
  },
  me: () => request<User>("/auth/me"),
  operaciones: () => request<Operacion[]>("/catalogs/operaciones"),
  vehiculosDisponibles: (operacionId: number) =>
    request<VehiculoDisponible[]>(`/viajes-adicionales/vehiculos-disponibles?operacion_id=${operacionId}`),
  crearSolicitud: (payload: NuevaSolicitudPayload) =>
    request<SolicitudViajeAdicional>("/viajes-adicionales", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  misSolicitudes: () => request<SolicitudViajeAdicional[]>("/viajes-adicionales"),
  tiposVehiculo: () => request<TipoVehiculo[]>("/vehiculos/tipos-vehiculo"),
  rutasTarifa: () => request<RutaTarifa[]>("/catalogo-tarifas/rutas"),
  /** Consulta en vivo la tarifa cliente para una ruta + tipo de vehículo ya
   * cargada en el catálogo. Lanza ApiError (404) si no existe — el
   * formulario de nueva solicitud usa eso para bloquear el envío y avisar
   * que hay que crear la tarifa primero (módulo Tarifas). */
  lookupTarifaRuta: (origen: string, destino: string, tipoVehiculoId: number) =>
    request<TarifaLookupResult>(
      `/catalogo-tarifas/lookup?servicio_codigo=${VIAJE_ADICIONAL_SERVICIO_CODIGO}` +
        `&tipo_vehiculo_id=${tipoVehiculoId}&origen=${encodeURIComponent(origen)}&destino=${encodeURIComponent(destino)}`
    ),
  crearTarifaRuta: (payload: { origen: string; destino: string; tipo_vehiculo_id: number; tarifa_cliente: number }) =>
    request<{ id: number }>("/catalogo-tarifas", {
      method: "POST",
      body: JSON.stringify({
        servicio_codigo: VIAJE_ADICIONAL_SERVICIO_CODIGO,
        tipo_vehiculo_id: payload.tipo_vehiculo_id,
        origen: payload.origen,
        destino: payload.destino,
        tarifa_cliente: payload.tarifa_cliente,
        rentabilidad_pct: 10,
      }),
    }),
  /** URL + headers para descargar el manifiesto con FileSystem.downloadAsync
   * (deja que el módulo nativo maneje la descarga binaria; evita convertir
   * PDFs a base64 a mano en JS). Usado solo por app/manifiesto/[id].tsx. */
  async manifiestoDownloadInfo(id: number): Promise<{ url: string; headers: Record<string, string> }> {
    const token = await storage.getItem(TOKEN_STORAGE_KEY);
    return {
      url: `${API_URL}/viajes-adicionales/${id}/manifiesto`,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    };
  },
};

export { ApiError };
export { API_URL };
