import { FormEvent, useState } from "react";

import { api } from "../services/api";
import { AvansatLookup, User } from "../types";

interface Props {
  user: User;
}

function toSpanishError(error: unknown): string {
  const message = (error as Error)?.message || "";
  if (!message) return "Ocurrio un error inesperado";
  try {
    const parsed = JSON.parse(message) as { detail?: string };
    if (parsed.detail) return parsed.detail;
  } catch {
    // Mensaje ya plano
  }
  if (message.toLowerCase().includes("failed to fetch")) {
    return "No fue posible conectar con el servidor";
  }
  return message;
}

export function AvansatPage({ user }: Props) {
  const [manifiesto, setManifiesto] = useState("");
  const [result, setResult] = useState<AvansatLookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = manifiesto.trim();
    if (!value) {
      setError("Debes ingresar un manifiesto");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const data = await api.consultarAvansat(value);
      setResult(data);
    } catch (e) {
      setResult(null);
      setError(toSpanishError(e));
    } finally {
      setLoading(false);
    }
  }

  if (user.rol !== "COINTRA") {
    return (
      <section className="rounded-xl border border-border bg-white/90 p-5 shadow-sm">
        <p className="text-sm font-semibold text-danger">No tienes permisos para este modulo.</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Avansat</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">Consulta por manifiesto</h2>
        <p className="mt-2 text-sm text-neutral">
          Ingresa el manifiesto para ver los datos que retorna la API de Avansat.
        </p>

        <form className="mt-4 grid gap-3 md:grid-cols-[minmax(260px,1fr),auto]" onSubmit={onSubmit}>
          <input
            value={manifiesto}
            onChange={(e) => setManifiesto(e.target.value)}
            placeholder="Ej: 012345"
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition enabled:hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loading ? "Consultando..." : "Consultar"}
          </button>
        </form>

        {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
      </section>

      {result && (
        <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-900">Resultado: manifiesto {result.manifiesto}</h3>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                result.encontrado
                  ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                  : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
              }`}
            >
              {result.encontrado ? "Encontrado" : "Sin datos en Avansat"}
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                  <th className="border-b border-border px-3 py-2 text-left">Campo</th>
                  <th className="border-b border-border px-3 py-2 text-left">Valor</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Fecha emisión", result.fecha_emision],
                  ["Producto", result.producto],
                  ["Placa vehículo", result.placa_vehiculo],
                  ["Trayler", result.trayler],
                  ["Remesa", result.remesa],
                  ["Ciudad origen", result.ciudad_origen],
                  ["Ciudad destino", result.ciudad_destino],
                ].map(([label, value]) => (
                  <tr key={label} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-semibold text-slate-800">{label}</td>
                    <td className="px-3 py-2 text-slate-700">{value || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
