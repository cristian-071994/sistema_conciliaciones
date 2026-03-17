import { AvansatLookup, Cliente, Conciliacion, DestinatarioSugerido, Item, LoginResponse, Notificacion, Operacion, Tercero, TipoVehiculo, User, Vehiculo, Viaje } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.headers && !Array.isArray(options.headers) && !(options.headers instanceof Headers)) {
    Object.assign(headers, options.headers as Record<string, string>);
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Error en la solicitud");
  }
  return response.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<User>("/auth/me"),
  usuarios: () => request<User[]>("/catalogs/usuarios"),
  crearUsuario: (payload: {
    nombre: string;
    email: string;
    password: string;
    rol: "COINTRA" | "CLIENTE" | "TERCERO";
    sub_rol?: "COINTRA_ADMIN" | "COINTRA_USER" | null;
    cliente_id?: number | null;
    tercero_id?: number | null;
  }) =>
    request<User>("/catalogs/usuarios", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  clientes: () => request<Cliente[]>("/catalogs/clientes"),
  crearCliente: (payload: { nombre: string; nit: string }) =>
    request<Cliente>("/catalogs/clientes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  editarCliente: (id: number, payload: { nombre?: string; nit?: string }) =>
    request<Cliente>(`/catalogs/clientes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  inactivarCliente: (id: number) =>
    request<{ ok: boolean }>(`/catalogs/clientes/${id}`, {
      method: "DELETE",
    }),
  reactivarCliente: (id: number) =>
    request<{ ok: boolean }>(`/catalogs/clientes/${id}/reactivar`, {
      method: "POST",
    }),
  terceros: () => request<Tercero[]>("/catalogs/terceros"),
  crearTercero: (payload: { nombre: string; nit: string }) =>
    request<Tercero>("/catalogs/terceros", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  editarTercero: (id: number, payload: { nombre?: string; nit?: string }) =>
    request<Tercero>(`/catalogs/terceros/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  inactivarTercero: (id: number) =>
    request<{ ok: boolean }>(`/catalogs/terceros/${id}`, {
      method: "DELETE",
    }),
  reactivarTercero: (id: number) =>
    request<{ ok: boolean }>(`/catalogs/terceros/${id}/reactivar`, {
      method: "POST",
    }),
  operaciones: () => request<Operacion[]>("/catalogs/operaciones"),
  crearOperacion: (payload: {
    cliente_id: number;
    tercero_id: number;
    nombre: string;
    porcentaje_rentabilidad: number;
  }) =>
    request<Operacion>("/catalogs/operaciones", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  editarOperacion: (
    id: number,
    payload: { cliente_id?: number; tercero_id?: number; nombre?: string; porcentaje_rentabilidad?: number }
  ) =>
    request<Operacion>(`/catalogs/operaciones/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  inactivarOperacion: (id: number) =>
    request<{ ok: boolean }>(`/catalogs/operaciones/${id}`, {
      method: "DELETE",
    }),
  reactivarOperacion: (id: number) =>
    request<{ ok: boolean }>(`/catalogs/operaciones/${id}/reactivar`, {
      method: "POST",
    }),
  conciliaciones: () => request<Conciliacion[]>("/conciliaciones"),
  crearConciliacion: (payload: {
    operacion_id: number;
    nombre: string;
    fecha_inicio: string;
    fecha_fin: string;
  }) =>
    request<Conciliacion>("/conciliaciones", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  editarConciliacion: (
    id: number,
    payload: { operacion_id?: number; nombre?: string; fecha_inicio?: string; fecha_fin?: string }
  ) =>
    request<Conciliacion>(`/conciliaciones/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  inactivarConciliacion: (id: number) =>
    request<{ ok: boolean }>(`/conciliaciones/${id}`, {
      method: "DELETE",
    }),
  reactivarConciliacion: (id: number) =>
    request<{ ok: boolean }>(`/conciliaciones/${id}/reactivar`, {
      method: "POST",
    }),
  items: (conciliacionId: number) => request<Item[]>(`/conciliaciones/${conciliacionId}/items`),
  crearItem: (payload: {
    conciliacion_id: number;
    tipo: string;
    fecha_servicio: string;
    origen?: string;
    destino?: string;
    placa?: string;
    conductor?: string;
    tarifa_tercero?: number;
    tarifa_cliente?: number;
    descripcion?: string;
  }) =>
    request<Item>("/conciliaciones/items", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  viajes: (operacionId?: number, onlyPending = false) => {
    const search = new URLSearchParams();
    if (operacionId) search.set("operacion_id", String(operacionId));
    if (onlyPending) search.set("only_pending", "true");
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return request<Viaje[]>(`/viajes${suffix}`);
  },
  crearViaje: (payload: {
    operacion_id: number;
    titulo: string;
    fecha_servicio: string;
    origen: string;
    destino: string;
    placa: string;
    conductor?: string;
    tarifa_tercero: number;
    tarifa_cliente?: number;
    manifiesto_numero?: string;
    descripcion?: string;
  }) =>
    request<Viaje>("/viajes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  editarViaje: (
    id: number,
    payload: {
      titulo?: string;
      fecha_servicio?: string;
      origen?: string;
      destino?: string;
      placa?: string;
      conductor?: string;
      tarifa_tercero?: number;
      tarifa_cliente?: number;
      manifiesto_numero?: string;
      descripcion?: string;
    }
  ) =>
    request<Viaje>(`/viajes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  inactivarViaje: (id: number) =>
    request<{ ok: boolean }>(`/viajes/${id}`, {
      method: "DELETE",
    }),
  reactivarViaje: (id: number) =>
    request<{ ok: boolean }>(`/viajes/${id}/reactivar`, {
      method: "POST",
    }),
  viajesPendientesConciliacion: (conciliacionId: number) =>
    request<Viaje[]>(`/conciliaciones/${conciliacionId}/viajes-pendientes`),
  adjuntarViajesConciliacion: (conciliacionId: number, viajeIds: number[]) =>
    request<Item[]>(`/conciliaciones/${conciliacionId}/adjuntar-viajes`, {
      method: "POST",
      body: JSON.stringify({ viaje_ids: viajeIds }),
    }),
  quitarViajeConciliacion: (conciliacionId: number, viajeId: number) =>
    request<{ ok: boolean }>(`/conciliaciones/${conciliacionId}/viajes/${viajeId}`, {
      method: "DELETE",
    }),
  enviarRevisionConciliacion: (
    conciliacionId: number,
    payload: { observacion?: string; destinatario_email?: string; mensaje?: string }
  ) =>
    request<Conciliacion>(`/conciliaciones/${conciliacionId}/enviar-revision`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  decidirItemCliente: (
    itemId: number,
    payload: { estado: "APROBADO" | "RECHAZADO"; comentario?: string }
  ) =>
    request<Item>(`/conciliaciones/items/${itemId}/decision-cliente`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  aprobarConciliacionCliente: (
    conciliacionId: number,
    payload: { observacion?: string; destinatario_email?: string; mensaje?: string }
  ) =>
    request<Conciliacion>(`/conciliaciones/${conciliacionId}/aprobar-cliente`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  devolverConciliacionCliente: (
    conciliacionId: number,
    payload: { observacion?: string; destinatario_email?: string; mensaje?: string }
  ) =>
    request<Conciliacion>(`/conciliaciones/${conciliacionId}/devolver-cliente`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  enviarFacturacionConciliacion: (
    conciliacionId: number,
    payload: { destinatario_email?: string; mensaje?: string }
  ) =>
    request<Conciliacion>(`/conciliaciones/${conciliacionId}/enviar-facturacion`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  misNotificaciones: (soloNoLeidas = true) =>
    request<Notificacion[]>(`/notificaciones/mis?solo_no_leidas=${soloNoLeidas ? "true" : "false"}`),
  marcarNotificacionLeida: (id: number) =>
    request<Notificacion>(`/notificaciones/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ leida: true }),
    }),
  marcarTodasNotificacionesLeidas: () =>
    request<{ actualizadas: number }>("/notificaciones/leer-todas", {
      method: "POST",
    }),
  destinatariosSugeridos: (
    conciliacionId: number,
    tipo: "cliente_revision" | "respuesta_cliente"
  ) =>
    request<DestinatarioSugerido[]>(
      `/notificaciones/correo/destinatarios-sugeridos/${conciliacionId}?tipo=${tipo}`
    ),
  editarUsuario: (
    id: number,
    payload: {
      nombre?: string;
      email?: string;
      rol?: "COINTRA" | "CLIENTE" | "TERCERO";
      sub_rol?: "COINTRA_ADMIN" | "COINTRA_USER" | null;
      cliente_id?: number | null;
      tercero_id?: number | null;
    }
  ) =>
    request<User>(`/catalogs/usuarios/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  inactivarUsuario: (id: number) =>
    request<{ ok: boolean }>(`/catalogs/usuarios/${id}`, {
      method: "DELETE",
    }),
  reactivarUsuario: (id: number) =>
    request<{ ok: boolean }>(`/catalogs/usuarios/${id}/reactivar`, {
      method: "POST",
    }),
  vehiculos: () => request<Vehiculo[]>("/vehiculos"),
  crearVehiculo: (payload: { placa: string; tipo_vehiculo_id: number; tercero_id: number }) =>
    request<Vehiculo>("/vehiculos", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  patchConciliacionItem: (
    itemId: number,
    payload: {
      manifiesto_numero?: string | null;
      remesa?: string | null;
      tarifa_tercero?: number | null;
      tarifa_cliente?: number | null;
      rentabilidad?: number | null;
    }
  ) =>
    request<Item>(`/conciliaciones/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  eliminarVehiculo: (id: number) =>
    request<{ ok: boolean }>(`/vehiculos/${id}`, {
      method: "DELETE",
    }),
  reactivarVehiculo: (id: number) =>
    request<{ ok: boolean }>(`/vehiculos/${id}/reactivar`, {
      method: "POST",
    }),
  tiposVehiculo: () => request<TipoVehiculo[]>("/vehiculos/tipos-vehiculo"),
  crearTipoVehiculo: (payload: { nombre: string }) =>
    request<TipoVehiculo>("/vehiculos/tipos-vehiculo", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  eliminarTipoVehiculo: (id: number) =>
    request<{ ok: boolean }>(`/vehiculos/tipos-vehiculo/${id}`, {
      method: "DELETE",
    }),
  reactivarTipoVehiculo: (id: number) =>
    request<{ ok: boolean }>(`/vehiculos/tipos-vehiculo/${id}/reactivar`, {
      method: "POST",
    }),
  consultarAvansat: (manifiesto: string) =>
    request<AvansatLookup>(`/avansat/manifiesto/${encodeURIComponent(manifiesto.trim())}`),
};
