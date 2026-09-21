import { brand } from "../../theme";
import type { EstadoGestionSolicitud } from "../../types";

// Estado real dentro del proceso de conciliación (EstadoGestionViajeAdicional
// en el backend), no el campo manual `estado`.
export const ESTADO_GESTION_LABEL: Record<EstadoGestionSolicitud, string> = {
  PENDIENTE_TARIFA: "Pendiente tarifa",
  PENDIENTE_MANIFIESTO: "Pendiente manifiesto",
  SIN_CONCILIAR: "Sin conciliar",
  EN_BORRADOR: "En borrador",
  EN_REVISION: "En revisión",
  APROBADA: "Aprobada",
  CONCILIADO: "Conciliado",
};

// Colores de marca: gris = falta algo, naranja = pendiente del lado Cointra,
// azul = en proceso, amarillo = en revisión, verde = terminado.
export const ESTADO_GESTION_COLOR: Record<EstadoGestionSolicitud, string> = {
  PENDIENTE_TARIFA: brand.textSecondary,
  PENDIENTE_MANIFIESTO: brand.orange,
  SIN_CONCILIAR: brand.navySecondary,
  EN_BORRADOR: brand.navySecondary,
  EN_REVISION: brand.yellowDark,
  APROBADA: brand.green,
  CONCILIADO: brand.green,
};

// Orden en el que avanza una solicitud en la práctica.
export const ESTADOS_GESTION_ORDEN: EstadoGestionSolicitud[] = [
  "PENDIENTE_TARIFA",
  "PENDIENTE_MANIFIESTO",
  "SIN_CONCILIAR",
  "EN_BORRADOR",
  "EN_REVISION",
  "APROBADA",
  "CONCILIADO",
];

export const MESES_LABEL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export type ResumenStats = {
  total: number;
  conManifiesto: number;
  sinManifiesto: number;
  porEstado: Record<EstadoGestionSolicitud, number>;
};
