import { Fragment } from "react";

import type { DashboardPlacaDesglose, DashboardPlacaGrupo } from "../../types";
import { formatCOP } from "../../utils/formatters";

interface Props {
  rows: DashboardPlacaDesglose[];
  // El Cliente ve tarifa_cliente; Cointra y el Tercero ven el costo del tercero.
  isCliente: boolean;
  onSelect: (placa: string, grupo: DashboardPlacaGrupo) => void;
}

type Row = DashboardPlacaDesglose;

export function PlacaDesgloseTable({ rows, isCliente, onSelect }: Props) {
  if (rows.length === 0) return null;

  const grupos = [
    { key: "viajes", label: "Viajes", tag: "V", texto: "text-sky-700", barra: "bg-sky-400", cant: (r: Row) => r.viajes_cant, valor: (r: Row) => (isCliente ? r.viajes_cliente : r.viajes) },
    { key: "adicionales", label: "Viajes adicionales", tag: "A", texto: "text-amber-700", barra: "bg-amber-400", cant: (r: Row) => r.adicionales_cant, valor: (r: Row) => (isCliente ? r.adicionales_cliente : r.adicionales) },
    { key: "disponibilidad", label: "Disponibilidad", tag: "D", texto: "text-violet-700", barra: "bg-violet-400", cant: (r: Row) => r.disponibilidad_cant, valor: (r: Row) => (isCliente ? r.disponibilidad_cliente : r.disponibilidad) },
  ] as const;
  const totalVal = (row: Row) => (isCliente ? row.total_cliente : row.total);
  const hint = isCliente
    ? "Tarifa cliente · ordenado por mayor total · cada barra es el 100% de su placa · clic en un número para ver el detalle"
    : "Costo tercero · ordenado por mayor total · cada barra es el 100% de su placa · clic en un número para ver el detalle";

  // Un número en 0 no tiene detalle que mostrar, así que no se vuelve clicable.
  function celda(placa: string, grupo: DashboardPlacaGrupo, contenido: string, cantidad: number, clase: string) {
    if (cantidad <= 0) return <span className="text-slate-300">{contenido}</span>;
    return (
      <button
        type="button"
        onClick={() => onSelect(placa, grupo)}
        title="Ver detalle viaje por viaje"
        className={`rounded px-1 underline decoration-dotted underline-offset-2 transition hover:bg-slate-100 hover:decoration-solid ${clase}`}
      >
        {contenido}
      </button>
    );
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-sm font-bold text-slate-800">Viajes, viajes adicionales y disponibilidad por placa</h3>
        <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-xs">
          <thead>
            <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th rowSpan={2} className="px-4 py-2 text-left align-bottom">Placa</th>
              {grupos.map((g) => (
                <th key={g.key} colSpan={2} className={`px-4 pt-2 text-center ${g.texto}`}>{g.label}</th>
              ))}
              <th colSpan={2} className="px-4 pt-2 text-center text-slate-700">Total</th>
              <th rowSpan={2} className="w-36 px-4 py-2 text-left align-bottom">Distribución</th>
            </tr>
            <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {[...grupos.map((g) => g.key), "total"].map((k) => (
                <Fragment key={k}>
                  <th className="px-4 pb-2 text-right">Cant.</th>
                  <th className="px-4 pb-2 text-right">Valor</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const t = totalVal(row);
              const valores = grupos.map((g) => g.valor(row));
              const pcts = valores.map((v) => (t > 0 ? Math.round((v / t) * 100) : 0));
              const titulo = grupos.map((g, i) => `${g.label} ${pcts[i]}%`).join(" · ");
              return (
                <tr key={row.placa} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2 font-semibold text-slate-800">{row.placa}</td>
                  {grupos.map((g, i) => (
                    <Fragment key={g.key}>
                      <td className="px-4 py-2 text-right">{celda(row.placa, g.key, String(g.cant(row)), g.cant(row), "text-slate-700")}</td>
                      <td className="px-4 py-2 text-right">{celda(row.placa, g.key, formatCOP(valores[i]), g.cant(row), g.texto)}</td>
                    </Fragment>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold">{celda(row.placa, "total", String(row.total_cant), row.total_cant, "text-slate-900")}</td>
                  <td className="px-4 py-2 text-right font-semibold">{celda(row.placa, "total", formatCOP(t), row.total_cant, "text-slate-900")}</td>
                  <td className="px-4 py-2">
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100" title={titulo}>
                      {grupos.map((g, i) => (
                        <div key={g.key} className={`h-full ${g.barra}`} style={{ width: `${t > 0 ? (valores[i] / t) * 100 : 0}%` }} />
                      ))}
                    </div>
                    <div className="mt-1 flex gap-2 text-[10px]">
                      {grupos.map((g, i) => (valores[i] > 0 ? <span key={g.key} className={g.texto}>{pcts[i]}% {g.tag}</span> : null))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-4 border-t border-border px-5 py-2 text-[11px] text-slate-500">
        {grupos.map((g) => (
          <span key={g.key} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-3 rounded-sm ${g.barra}`} /> {g.label}
          </span>
        ))}
      </div>
    </article>
  );
}
