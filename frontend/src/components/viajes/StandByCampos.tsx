import { formatCOP, formatFechaHora } from "../../utils/formatters";

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10";
const LABEL_CLASS = "mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral";

interface StandByCamposProps {
  inicio: string;
  fin: string;
  onChange: (campo: "fecha_hora_inicio" | "fecha_hora_fin", valor: string) => void;
  /** Duración solo informativa para el usuario; el valor real lo calcula el servidor al guardar. */
  horasEstimadas: number;
  tarifaHoraTercero: number;
  tarifaHoraCliente: number;
  mostrarTercero: boolean;
  mostrarCliente: boolean;
}

/** Campos de fecha+hora inicial y final de un Stand By (puede abarcar varios días). */
export function StandByCampos({
  inicio,
  fin,
  onChange,
  horasEstimadas,
  tarifaHoraTercero,
  tarifaHoraCliente,
  mostrarTercero,
  mostrarCliente,
}: StandByCamposProps) {
  const hayRangoInvalido = Boolean(inicio && fin && horasEstimadas <= 0);
  const hayTarifa = tarifaHoraTercero > 0 || tarifaHoraCliente > 0;

  return (
    <>
      <div>
        <label className={LABEL_CLASS}>Fecha y hora inicial</label>
        <input
          name="fecha_hora_inicio"
          type="datetime-local"
          required
          value={inicio}
          onChange={(e) => onChange("fecha_hora_inicio", e.target.value)}
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label className={LABEL_CLASS}>Fecha y hora final</label>
        <input
          name="fecha_hora_fin"
          type="datetime-local"
          required
          min={inicio || undefined}
          value={fin}
          onChange={(e) => onChange("fecha_hora_fin", e.target.value)}
          className={INPUT_CLASS}
        />
      </div>
      <div className="md:col-span-2 rounded-lg border border-sky-200 bg-sky-50/70 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">Resumen Stand By</p>
        {hayRangoInvalido ? (
          <p className="mt-1 text-sm text-danger">La fecha y hora final debe ser posterior a la inicial.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-sky-900">
              Horas a cobrar: <span className="font-semibold">{horasEstimadas > 0 ? horasEstimadas.toFixed(2) : "0.00"}</span>
            </p>
            {horasEstimadas > 0 && hayTarifa && (
              <p className="mt-1 text-sm text-sky-900">
                {mostrarTercero && (
                  <>
                    Total tercero estimado:{" "}
                    <span className="font-semibold">{formatCOP(Number((horasEstimadas * tarifaHoraTercero).toFixed(2)))}</span>
                    {mostrarCliente ? " · " : ""}
                  </>
                )}
                {mostrarCliente && (
                  <>
                    Total cliente estimado:{" "}
                    <span className="font-semibold">{formatCOP(Number((horasEstimadas * tarifaHoraCliente).toFixed(2)))}</span>
                  </>
                )}
              </p>
            )}
            <p className="mt-1 text-[11px] text-sky-800">Valor estimado: el sistema calcula el valor final al guardar.</p>
          </>
        )}
      </div>
    </>
  );
}

interface StandByDetalleProps {
  horas?: number | null;
  inicio?: string | null;
  fin?: string | null;
  /** Valor de la hora y total: el backend solo manda los que el rol puede ver. */
  valorHoraTercero?: number | null;
  valorHoraCliente?: number | null;
  totalTercero?: number | null;
  totalCliente?: number | null;
  /** Versión de dos líneas para columnas estrechas (el rango queda en el tooltip). */
  compacto?: boolean;
  className?: string;
}

/** Detalle de un Stand By: horas registradas, valor de la hora, total y el rango de fechas. */
export function StandByDetalle({
  horas,
  inicio,
  fin,
  valorHoraTercero,
  valorHoraCliente,
  totalTercero,
  totalCliente,
  compacto = false,
  className = "text-[11px] text-slate-500",
}: StandByDetalleProps) {
  if (horas === null || horas === undefined) {
    return null;
  }
  if (compacto) {
    const valores = [valorHoraCliente, valorHoraTercero].filter((v): v is number => v !== null && v !== undefined);
    const rango = inicio && fin ? `${formatFechaHora(inicio)} → ${formatFechaHora(fin)}` : undefined;
    return (
      <div className={`mt-0.5 ${className}`} title={rango}>
        <p className="font-semibold text-sky-800">{horas.toFixed(2)} horas</p>
        {valores.length > 0 && <p>{valores.map((v) => formatCOP(v)).join(" · ")} /h</p>}
      </div>
    );
  }
  const hayValores = [valorHoraTercero, valorHoraCliente, totalTercero, totalCliente].some(
    (valor) => valor !== null && valor !== undefined
  );
  return (
    <div className={`mt-1 min-w-[210px] space-y-0.5 ${className}`}>
      <p>
        <span className="font-semibold">{horas.toFixed(2)} horas</span>
        {inicio && fin ? ` · ${formatFechaHora(inicio)} → ${formatFechaHora(fin)}` : ""}
      </p>
      {hayValores && (
        <div className="rounded-md bg-sky-50 px-2 py-1 text-sky-900">
          {valorHoraCliente != null && (
            <p>
              Valor hora cliente: <span className="font-semibold">{formatCOP(valorHoraCliente)}</span>
            </p>
          )}
          {valorHoraTercero != null && (
            <p>
              Valor hora tercero: <span className="font-semibold">{formatCOP(valorHoraTercero)}</span>
            </p>
          )}
          {totalCliente != null && (
            <p>
              Total cliente: <span className="font-semibold">{formatCOP(totalCliente)}</span>
            </p>
          )}
          {totalTercero != null && (
            <p>
              Total tercero: <span className="font-semibold">{formatCOP(totalTercero)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
