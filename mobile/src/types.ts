export interface User {
  id: number;
  nombre: string;
  email: string;
  rol: "COINTRA" | "CLIENTE" | "TERCERO";
  cliente_id: number | null;
  tercero_id: number | null;
  activo: boolean;
}

export interface Operacion {
  id: number;
  nombre: string;
  activa: boolean;
}

export interface VehiculoDisponible {
  id: number;
  placa: string;
  tipo_vehiculo_id: number;
  tipo_vehiculo_nombre: string;
}

export interface TipoVehiculo {
  id: number;
  nombre: string;
  activo: boolean;
}

// Ruta con tarifa activa para Viaje Adicional, sin montos — para poblar los
// desplegables de origen/destino en el formulario de nueva solicitud.
export interface RutaTarifa {
  origen: string;
  destino: string;
  tipo_vehiculo_id: number;
  tipo_vehiculo_nombre: string;
}

export interface TarifaLookupResult {
  tarifa_cliente: number;
}

export interface ManifiestoViajeAdicional {
  id: number;
  numero_manifiesto: string | null;
  filename: string;
  created_at: string;
}

export type EstadoSolicitud = "PENDIENTE" | "EN_REVISION" | "APROBADO" | "RECHAZADO";

// Estado real dentro del proceso de conciliación, calculado en el backend
// (ver EstadoGestionViajeAdicional en el backend) — es lo que se muestra en
// la lista, no el campo `estado` manual de abajo.
export type EstadoGestionSolicitud =
  | "PENDIENTE_TARIFA"
  | "PENDIENTE_MANIFIESTO"
  | "SIN_CONCILIAR"
  | "EN_BORRADOR"
  | "EN_REVISION"
  | "APROBADA"
  | "CONCILIADO";

export interface SolicitudViajeAdicional {
  id: number;
  operacion_id: number;
  operacion_nombre: string;
  vehiculo_id: number;
  vehiculo_placa: string;
  vehiculo_tipo_nombre: string;
  titulo: string;
  fecha_viaje: string;
  origen: string;
  destino: string;
  producto: string;
  observaciones: string | null;
  // El backend ya sanitiza por rol (sanitize_item_for_role): esta app es
  // solo para CLIENTE, así que aquí siempre llega tarifa_cliente y null en
  // tarifa_tercero/rentabilidad — no se recalcula nada en el cliente.
  tarifa_cliente: number | null;
  estado: EstadoSolicitud;
  estado_gestion: EstadoGestionSolicitud;
  created_at: string;
  manifiesto: ManifiestoViajeAdicional | null;
}

export interface NuevaSolicitudPayload {
  operacion_id: number;
  vehiculo_id: number;
  titulo: string;
  fecha_viaje: string;
  origen: string;
  destino: string;
  producto: string;
  observaciones?: string;
}
