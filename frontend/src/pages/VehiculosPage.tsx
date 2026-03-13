import { FormEvent, useEffect, useState } from "react";
import { api } from "../services/api";
import type { CointraSubRol, TipoVehiculo, User, Vehiculo } from "../types";

interface Props {
  user: User;
}

export function VehiculosPage({ user }: Props) {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [tipos, setTipos] = useState<TipoVehiculo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isCointraAdmin = user.rol === "COINTRA" && (user.sub_rol as CointraSubRol | null) === "COINTRA_ADMIN";

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [vs, ts] = await Promise.all([api.vehiculos(), api.tiposVehiculo()]);
      setVehiculos(vs);
      setTipos(ts);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleCreateVehiculo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const placa = String(form.get("placa") || "").toUpperCase();
    const tipo_vehiculo_id = Number(form.get("tipo_vehiculo_id"));
    const propietario = String(form.get("propietario") || "") || undefined;

    await api.crearVehiculo({ placa, tipo_vehiculo_id, propietario });
    e.currentTarget.reset();
    await loadData();
  }

  async function handleDeleteVehiculo(id: number) {
    if (!isCointraAdmin) return;
    // Confirmación mínima en el cliente
    // eslint-disable-next-line no-alert
    const ok = window.confirm("¿Eliminar este vehículo? Esta acción no puede deshacerse.");
    if (!ok) return;
    await api.eliminarVehiculo(id);
    await loadData();
  }

  const tipoNombreById = new Map(tipos.map((t) => [t.id, t.nombre]));

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Gestión de vehículos</h2>
        <p className="mb-4 text-sm text-neutral">
          Registra las placas y tipos de vehículo para utilizarlos al cargar viajes.
        </p>

        <form
          onSubmit={handleCreateVehiculo}
          className="grid grid-cols-1 gap-3 md:grid-cols-[1.2fr,1fr,1.2fr,auto]"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
              Placa
            </label>
            <input
              name="placa"
              required
              placeholder="ABC123"
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
              Tipo de vehículo
            </label>
            <select
              name="tipo_vehiculo_id"
              required
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            >
              <option value="">Seleccione...</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
              Propietario (opcional)
            </label>
            <input
              name="propietario"
              placeholder="Nombre del propietario"
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
            >
              Registrar vehículo
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Vehículos registrados</h3>
        {loading ? (
          <p className="text-sm text-neutral">Cargando vehículos...</p>
        ) : error ? (
          <p className="text-sm font-medium text-danger">{error}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                  <th className="border-b border-border px-3 py-2 text-left">Placa</th>
                  <th className="border-b border-border px-3 py-2 text-left">Tipo</th>
                  <th className="border-b border-border px-3 py-2 text-left">Propietario</th>
                  <th className="border-b border-border px-3 py-2 text-left">Estado</th>
                  {isCointraAdmin && (
                    <th className="border-b border-border px-3 py-2 text-left">Acción</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {vehiculos.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{v.placa}</td>
                    <td className="px-3 py-2">{tipoNombreById.get(v.tipo_vehiculo_id) || "-"}</td>
                    <td className="px-3 py-2">{v.propietario || "-"}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                        {v.activo ? "ACTIVO" : "INACTIVO"}
                      </span>
                    </td>
                    {isCointraAdmin && (
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => void handleDeleteVehiculo(v.id)}
                          className="inline-flex items-center rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                        >
                          Eliminar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

