/** HORA_EXTRA es el código histórico; la migración lo renombra a STAND_BY. */
const CODIGOS_STANDBY = ["STAND_BY", "HORA_EXTRA"];

/** Solo para decidir qué campos mostrar: la regla de negocio vive en el backend. */
export function esCodigoStandBy(codigo: string | null | undefined): boolean {
  return codigo !== null && codigo !== undefined && CODIGOS_STANDBY.includes(codigo);
}
