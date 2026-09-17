import { FormEvent, useEffect, useMemo, useState } from "react";
import { ActionModal } from "../components/common/ActionModal";
import { api } from "../services/api";
import type { CatalogoTarifa, Servicio, TipoVehiculo, User } from "../types";
import { formatCOP } from "../utils/formatters";
import { hasPermiso } from "../utils/permisos";

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
    // Mensaje plano
  }
  return message;
}

export function CatalogoTarifasPage({ user }: Props) {
  const [rows, setRows] = useState<CatalogoTarifa[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [tipos, setTipos] = useState<TipoVehiculo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{ id: number; action: "inactivar" | "reactivar" } | null>(null);
  const [editRow, setEditRow] = useState<{
    id: number;
    servicio_id: string;
    tipo_vehiculo_id: string;
    origen: string;
    destino: string;
    tarifa_cliente: string;
    rentabilidad_pct: string;
    activo: boolean;
  } | null>(null);
  const [saveNotice, setSaveNotice] = useState<string>("");
  const [filtros, setFiltros] = useState({ servicio: "", tipoVehiculo: "", ruta: "" });
  const [form, setForm] = useState({
    servicio_id: "",
    tipo_vehiculo_id: "",
    origen: "",
    destino: "",
    tarifa_cliente: "",
    rentabilidad_pct: "10",
  });

  const puedeVer = hasPermiso(user, "catalogo_tarifas.ver");
  const puedeCrear = hasPermiso(user, "catalogo_tarifas.crear");
  const puedeEditar = hasPermiso(user, "catalogo_tarifas.editar");
  const puedeDesactivar = hasPermiso(user, "catalogo_tarifas.desactivar");
  const puedeGestionar = puedeEditar || puedeDesactivar;

  // Regla de negocio fija (no depende de permisos): Cliente solo ve tarifa
  // cliente, Tercero solo ve tarifa tercero, y la rentabilidad es exclusiva
  // de Cointra. El backend ya oculta estos campos (null) en la respuesta;
  // aquí además ocultamos las columnas/inputs para no mostrar "-" vacíos.
  const veTarifaCliente = user.rol !== "TERCERO";
  const veTarifaTercero = user.rol !== "CLIENTE";
  const veRentabilidad = user.rol === "COINTRA";

  const servicioSeleccionado = useMemo(
    () => servicios.find((s) => String(s.id) === form.servicio_id),
    [servicios, form.servicio_id]
  );
  const esRuta = servicioSeleccionado?.codigo === "VIAJE_ADICIONAL";

  const servicioEditSeleccionado = useMemo(
    () => servicios.find((s) => String(s.id) === editRow?.servicio_id),
    [servicios, editRow?.servicio_id]
  );
  const esRutaEdit = servicioEditSeleccionado?.codigo === "VIAJE_ADICIONAL";

  const tarifaTerceroPreview = useMemo(() => {
    const tarifaCliente = Number(form.tarifa_cliente || 0);
    const pct = Number(form.rentabilidad_pct || 0);
    const factor = 1 - pct / 100;
    if (!tarifaCliente || factor <= 0) return 0;
    return tarifaCliente * factor;
  }, [form.tarifa_cliente, form.rentabilidad_pct]);

  function formatMoney(value: number | null): string {
    return value == null ? "-" : formatCOP(value);
  }

  const rowsFiltradas = useMemo(() => {
    const includes = (value: string | null | undefined, needle: string) =>
      !needle.trim() || (value || "").toLowerCase().includes(needle.trim().toLowerCase());

    return rows.filter((row) => {
      const ruta = row.origen && row.destino ? `${row.origen} ${row.destino}` : "";
      return (
        includes(row.servicio_nombre, filtros.servicio) &&
        includes(row.tipo_vehiculo_nombre, filtros.tipoVehiculo) &&
        includes(ruta, filtros.ruta)
      );
    });
  }, [rows, filtros]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [catalogo, serviciosRows, tiposRows] = await Promise.all([
        puedeVer ? api.catalogoTarifas() : Promise.resolve([]),
        api.servicios(),
        api.tiposVehiculo(),
      ]);
      setRows(catalogo);
      setServicios(serviciosRows.filter((s) => s.activo));
      setTipos(tiposRows.filter((t) => t.activo));
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!form.servicio_id || !form.tipo_vehiculo_id || !form.tarifa_cliente || !form.rentabilidad_pct) {
      setError("Debes completar todos los campos del catalogo.");
      return;
    }
    if (esRuta && (!form.origen.trim() || !form.destino.trim())) {
      setError("Origen y destino son obligatorios para tarifas de Viaje Adicional.");
      return;
    }
    try {
      await api.upsertCatalogoTarifa({
        servicio_id: Number(form.servicio_id),
        tipo_vehiculo_id: Number(form.tipo_vehiculo_id),
        origen: esRuta ? form.origen.trim() : undefined,
        destino: esRuta ? form.destino.trim() : undefined,
        tarifa_cliente: Number(form.tarifa_cliente),
        rentabilidad_pct: Number(form.rentabilidad_pct),
      });
      setForm({ servicio_id: "", tipo_vehiculo_id: "", origen: "", destino: "", tarifa_cliente: "", rentabilidad_pct: "10" });
      await loadData();
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  async function onConfirmAction() {
    if (!confirm) return;
    setError("");
    try {
      if (confirm.action === "inactivar") {
        await api.inactivarCatalogoTarifa(confirm.id);
      } else {
        await api.reactivarCatalogoTarifa(confirm.id);
      }
      setConfirm(null);
      await loadData();
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  async function onConfirmEdit() {
    if (!editRow) return;
    setError("");
    if (
      !editRow.servicio_id ||
      !editRow.tipo_vehiculo_id ||
      !editRow.tarifa_cliente ||
      (veRentabilidad && !editRow.rentabilidad_pct)
    ) {
      setError("Debes completar todos los campos de la tarifa.");
      return;
    }
    if (esRutaEdit && (!editRow.origen.trim() || !editRow.destino.trim())) {
      setError("Origen y destino son obligatorios para tarifas de Viaje Adicional.");
      return;
    }
    try {
      await api.editarCatalogoTarifa(editRow.id, {
        servicio_id: Number(editRow.servicio_id),
        tipo_vehiculo_id: Number(editRow.tipo_vehiculo_id),
        origen: esRutaEdit ? editRow.origen.trim() : "",
        destino: esRutaEdit ? editRow.destino.trim() : "",
        tarifa_cliente: Number(editRow.tarifa_cliente),
        rentabilidad_pct: veRentabilidad ? Number(editRow.rentabilidad_pct) : undefined,
        activo: editRow.activo,
      });
      setEditRow(null);
      await loadData();
      setSaveNotice("La tarifa fue actualizada correctamente.");
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  return (
    <div className="space-y-6">
      {puedeCrear && (
      <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
        <h2 className="mb-2 text-base font-semibold text-slate-900">Catalogo de Tarifas</h2>
        <p className="mb-4 text-sm text-neutral">
          Configura tarifa cliente y rentabilidad Cointra por tipo de vehiculo. El sistema calcula automaticamente la tarifa tercero.
        </p>

        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select
            required
            value={form.servicio_id}
            onChange={(e) => setForm((prev) => ({ ...prev, servicio_id: e.target.value }))}
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          >
            <option value="">Servicio</option>
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>

          <select
            required
            value={form.tipo_vehiculo_id}
            onChange={(e) => setForm((prev) => ({ ...prev, tipo_vehiculo_id: e.target.value }))}
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          >
            <option value="">Tipo de vehiculo</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>

          {esRuta && (
            <>
              <input
                required
                type="text"
                value={form.origen}
                onChange={(e) => setForm((prev) => ({ ...prev, origen: e.target.value }))}
                placeholder="Origen (ej. Bogota)"
                className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
              <input
                required
                type="text"
                value={form.destino}
                onChange={(e) => setForm((prev) => ({ ...prev, destino: e.target.value }))}
                placeholder="Destino (ej. Medellin)"
                className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </>
          )}

          <input
            required
            type="number"
            min={1}
            step="0.01"
            value={form.tarifa_cliente}
            onChange={(e) => setForm((prev) => ({ ...prev, tarifa_cliente: e.target.value }))}
            placeholder="Tarifa cliente"
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />

          {veRentabilidad && (
            <input
              required
              type="number"
              min={0}
              max={99.99}
              step="0.01"
              value={form.rentabilidad_pct}
              onChange={(e) => setForm((prev) => ({ ...prev, rentabilidad_pct: e.target.value }))}
              placeholder="Rentabilidad %"
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          )}

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
          >
            Guardar tarifa
          </button>
        </form>

        {veTarifaTercero && (
          <p className="mt-3 text-xs text-neutral">
            Tarifa tercero estimada: <span className="font-semibold text-slate-900">{formatMoney(tarifaTerceroPreview)}</span>
          </p>
        )}
      </section>
      )}

      {puedeVer && (
      <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Tarifas parametrizadas</h3>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            value={filtros.servicio}
            onChange={(e) => setFiltros((prev) => ({ ...prev, servicio: e.target.value }))}
            placeholder="Filtrar por servicio"
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
          <input
            value={filtros.tipoVehiculo}
            onChange={(e) => setFiltros((prev) => ({ ...prev, tipoVehiculo: e.target.value }))}
            placeholder="Filtrar por tipo de vehículo"
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
          <input
            value={filtros.ruta}
            onChange={(e) => setFiltros((prev) => ({ ...prev, ruta: e.target.value }))}
            placeholder="Filtrar por ruta (origen o destino)"
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
          <button
            type="button"
            onClick={() => setFiltros({ servicio: "", tipoVehiculo: "", ruta: "" })}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Limpiar filtros
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-neutral">Cargando catalogo...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                  <th className="border-b border-border px-3 py-2 text-left">Servicio</th>
                  <th className="border-b border-border px-3 py-2 text-left">Tipo vehículo</th>
                  <th className="border-b border-border px-3 py-2 text-left">Ruta</th>
                  {veTarifaCliente && <th className="border-b border-border px-3 py-2 text-left">Tarifa cliente</th>}
                  {veRentabilidad && <th className="border-b border-border px-3 py-2 text-left">Rentabilidad</th>}
                  {veTarifaTercero && <th className="border-b border-border px-3 py-2 text-left">Tarifa tercero</th>}
                  <th className="border-b border-border px-3 py-2 text-left">Estado</th>
                  {puedeGestionar && <th className="border-b border-border px-3 py-2 text-left">Acción</th>}
                </tr>
              </thead>
              <tbody>
                {rowsFiltradas.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{row.servicio_nombre ?? `#${row.servicio_id}`}</td>
                    <td className="px-3 py-2">{row.tipo_vehiculo_nombre ?? `#${row.tipo_vehiculo_id}`}</td>
                    <td className="px-3 py-2">
                      {row.origen && row.destino ? `${row.origen} → ${row.destino}` : <span className="text-neutral">-</span>}
                    </td>
                    {veTarifaCliente && <td className="px-3 py-2">{formatMoney(row.tarifa_cliente)}</td>}
                    {veRentabilidad && (
                      <td className="px-3 py-2">{row.rentabilidad_pct == null ? "-" : `${row.rentabilidad_pct.toFixed(1)}%`}</td>
                    )}
                    {veTarifaTercero && <td className="px-3 py-2">{formatMoney(row.tarifa_tercero)}</td>}
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          row.activo ? "bg-success/10 text-success" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {row.activo ? "ACTIVO" : "INACTIVO"}
                      </span>
                    </td>
                    {puedeGestionar && (
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {puedeEditar && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditRow({
                                  id: row.id,
                                  servicio_id: String(row.servicio_id),
                                  tipo_vehiculo_id: String(row.tipo_vehiculo_id),
                                  origen: row.origen ?? "",
                                  destino: row.destino ?? "",
                                  tarifa_cliente: row.tarifa_cliente != null ? String(row.tarifa_cliente) : "",
                                  rentabilidad_pct: row.rentabilidad_pct != null ? String(row.rentabilidad_pct) : "",
                                  activo: row.activo,
                                })
                              }
                              className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm hover:bg-emerald-100"
                            >
                              Editar
                            </button>
                          )}
                          {puedeDesactivar && (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirm({ id: row.id, action: row.activo ? "inactivar" : "reactivar" })
                              }
                              className="inline-flex items-center rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                            >
                              {row.activo ? "Inactivar" : "Reactivar"}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {rowsFiltradas.length === 0 && (
              <p className="py-4 text-center text-sm text-neutral">
                {rows.length === 0 ? "No hay tarifas registradas." : "Ningún resultado coincide con los filtros."}
              </p>
            )}
          </div>
        )}
        {!!error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
      </section>
      )}

      <ActionModal
        open={!!confirm}
        title={confirm?.action === "inactivar" ? "Inactivar tarifa" : "Reactivar tarifa"}
        description={
          confirm?.action === "inactivar"
            ? "La tarifa dejara de estar disponible para nuevos registros."
            : "La tarifa volvera a estar disponible para nuevos registros."
        }
        confirmText={confirm?.action === "inactivar" ? "Inactivar" : "Reactivar"}
        onClose={() => setConfirm(null)}
        onConfirm={() => void onConfirmAction()}
      />

      <ActionModal
        open={!!editRow}
        title="Editar tarifa"
        description="Modifica los campos necesarios y confirma para guardar los cambios."
        confirmText="Guardar cambios"
        cancelText="Cancelar"
        onClose={() => setEditRow(null)}
        onConfirm={() => void onConfirmEdit()}
      >
        <div className="grid gap-3">
          <select
            value={editRow?.servicio_id ?? ""}
            onChange={(e) =>
              setEditRow((prev) => (prev ? { ...prev, servicio_id: e.target.value } : prev))
            }
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          >
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>

          <select
            value={editRow?.tipo_vehiculo_id ?? ""}
            onChange={(e) =>
              setEditRow((prev) => (prev ? { ...prev, tipo_vehiculo_id: e.target.value } : prev))
            }
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          >
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>

          {esRutaEdit && (
            <>
              <input
                type="text"
                value={editRow?.origen ?? ""}
                onChange={(e) =>
                  setEditRow((prev) => (prev ? { ...prev, origen: e.target.value } : prev))
                }
                placeholder="Origen"
                className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
              <input
                type="text"
                value={editRow?.destino ?? ""}
                onChange={(e) =>
                  setEditRow((prev) => (prev ? { ...prev, destino: e.target.value } : prev))
                }
                placeholder="Destino"
                className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </>
          )}

          <input
            type="number"
            min={1}
            step="0.01"
            value={editRow?.tarifa_cliente ?? ""}
            onChange={(e) =>
              setEditRow((prev) => (prev ? { ...prev, tarifa_cliente: e.target.value } : prev))
            }
            placeholder="Tarifa cliente"
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />

          {veRentabilidad && (
            <input
              type="number"
              min={0}
              max={99.99}
              step="0.01"
              value={editRow?.rentabilidad_pct ?? ""}
              onChange={(e) =>
                setEditRow((prev) => (prev ? { ...prev, rentabilidad_pct: e.target.value } : prev))
              }
              placeholder="Rentabilidad %"
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          )}

          <select
            value={editRow?.activo ? "true" : "false"}
            onChange={(e) =>
              setEditRow((prev) => (prev ? { ...prev, activo: e.target.value === "true" } : prev))
            }
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          >
            <option value="true">ACTIVO</option>
            <option value="false">INACTIVO</option>
          </select>
        </div>
      </ActionModal>

      <ActionModal
        open={!!saveNotice}
        title="Cambios guardados"
        description={saveNotice}
        confirmText="Aceptar"
        cancelText="Cerrar"
        onClose={() => setSaveNotice("")}
        onConfirm={() => setSaveNotice("")}
      />
    </div>
  );
}
