import { EstadoConexion } from "../../types";

const ESTADO_LABEL: Record<EstadoConexion, string> = {
  en_linea: "En línea",
  inactivo: "Inactivo",
  no_conectado: "No conectado",
};

const ESTADO_DOT_CLASS: Record<EstadoConexion, string> = {
  en_linea: "bg-success animate-pulse",
  inactivo: "bg-warning",
  no_conectado: "bg-slate-300",
};

function formatUltimaInteraccion(ultimoHeartbeat: string | null): string {
  if (!ultimoHeartbeat) return "Nunca se ha conectado";
  const diffMs = Date.now() - new Date(ultimoHeartbeat).getTime();
  const minutos = Math.floor(diffMs / 60000);
  if (minutos < 1) return "Última interacción: justo ahora";
  if (minutos < 60) return `Última interacción: hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Última interacción: hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `Última interacción: hace ${dias} d`;
}

interface Props {
  estado: EstadoConexion;
  ultimoHeartbeat: string | null;
}

/** El estado (en_linea/inactivo/no_conectado) llega ya resuelto desde el
 * backend (services/presence_service.py) — este componente solo lo mapea a
 * un color, nunca calcula el umbral de tiempo por su cuenta. */
export function UserStatusIndicator({ estado, ultimoHeartbeat }: Props) {
  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={formatUltimaInteraccion(ultimoHeartbeat)}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${ESTADO_DOT_CLASS[estado]}`} />
      <span className="text-xs text-neutral">{ESTADO_LABEL[estado]}</span>
    </span>
  );
}
