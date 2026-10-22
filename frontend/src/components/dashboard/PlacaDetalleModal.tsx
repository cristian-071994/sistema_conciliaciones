import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { api } from "../../services/api";
import type { DashboardPlacaDetalleItem, DashboardPlacaGrupo } from "../../types";
import { formatCOP } from "../../utils/formatters";

export interface PlacaDetalleSeleccion {
  placa: string;
  grupo: DashboardPlacaGrupo;
}

export interface PlacaDetallePeriodo {
  mode: "current_month" | "year_to_date" | "month_year";
  year?: number;
  month?: number;
}

const TITULO_GRUPO: Record<DashboardPlacaGrupo, string> = {
  viajes: "Viajes",
  adicionales: "Viajes adicionales",
  disponibilidad: "Disponibilidad",
  total: "Viajes, adicionales y disponibilidad",
};

const ESTADO_CLASE: Record<string, string> = {
  BORRADOR: "bg-slate-100 text-slate-600",
  EN_REVISION: "bg-amber-100 text-amber-800",
  ENVIADA: "bg-amber-100 text-amber-800",
  DEVUELTA: "bg-rose-100 text-rose-700",
  APROBADA: "bg-emerald-100 text-emerald-700",
  CERRADA: "bg-emerald-100 text-emerald-700",
};

function formatFecha(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function ruta(item: DashboardPlacaDetalleItem) {
  if (item.origen && item.destino) return `${item.origen} → ${item.destino}`;
  return item.origen || item.destino || "—";
}

interface Props {
  seleccion: PlacaDetalleSeleccion;
  periodo: PlacaDetallePeriodo;
  // El Cliente ve la tarifa cliente; Cointra y el Tercero ven el costo del tercero.
  useCliente: boolean;
  onClose: () => void;
}

export function PlacaDetalleModal({ seleccion, periodo, useCliente, onClose }: Props) {
  const [items, setItems] = useState<DashboardPlacaDetalleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError("");
    api
      .dashboardPlacaDetalle({ placa: seleccion.placa, grupo: seleccion.grupo, ...periodo })
      .then((res) => {
        if (!cancelado) setItems(res.items);
      })
      .catch((e) => {
        if (!cancelado) setError((e as Error)?.message || "No fue posible cargar el detalle. Intenta de nuevo.");
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [seleccion.placa, seleccion.grupo, periodo.mode, periodo.year, periodo.month]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const valorDe = (item: DashboardPlacaDetalleItem) => (useCliente ? item.tarifa_cliente : item.tarifa_tercero) ?? 0;
  const total = useMemo(() => items.reduce((acc, it) => acc + valorDe(it), 0), [items, useCliente]);
  const mostrarServicio = seleccion.grupo === "total";

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-2xl border border-border bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${TITULO_GRUPO[seleccion.grupo]} de la placa ${seleccion.placa}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Detalle por placa</p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">
              {seleccion.placa} · {TITULO_GRUPO[seleccion.grupo]}
            </h3>
            {!loading && !error && (
              <p className="mt-0.5 text-xs text-slate-500">
                {items.length} {items.length === 1 ? "servicio" : "servicios"} · {formatCOP(total)}
                {useCliente ? " (tarifa cliente)" : " (costo tercero)"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading && (
            <div className="space-y-2 p-5">
              <div className="h-3 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-3/5 animate-pulse rounded bg-slate-200" />
            </div>
          )}
          {!loading && error && <p className="p-5 text-sm text-rose-600">{error}</p>}
          {!loading && !error && items.length === 0 && (
            <p className="p-5 text-sm text-slate-500">No hay servicios para esta placa en el período seleccionado.</p>
          )}
          {!loading && !error && items.length > 0 && (
            <table className="w-full whitespace-nowrap text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Fecha</th>
                  {mostrarServicio && <th className="px-4 py-2 text-left">Servicio</th>}
                  <th className="px-4 py-2 text-left">Ruta</th>
                  <th className="px-4 py-2 text-left">Conductor</th>
                  <th className="px-4 py-2 text-left">Manifiesto</th>
                  <th className="px-4 py-2 text-left">Conciliación</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr key={item.item_id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2 text-slate-700">{formatFecha(item.fecha_servicio)}</td>
                    {mostrarServicio && <td className="px-4 py-2 text-slate-700">{item.servicio ?? "—"}</td>}
                    <td className="px-4 py-2 text-slate-700">{ruta(item)}</td>
                    <td className="px-4 py-2 text-slate-700">{item.conductor || "—"}</td>
                    <td className="px-4 py-2 text-slate-700">{item.manifiesto_numero || "—"}</td>
                    <td className="px-4 py-2">
                      <span className="text-slate-700">{item.conciliacion_nombre}</span>{" "}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ESTADO_CLASE[item.conciliacion_estado] ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {item.conciliacion_estado.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-900">{formatCOP(valorDe(item))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-slate-50 font-semibold text-slate-900">
                  <td className="px-4 py-2" colSpan={mostrarServicio ? 6 : 5}>
                    Total
                  </td>
                  <td className="px-4 py-2 text-right">{formatCOP(total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
