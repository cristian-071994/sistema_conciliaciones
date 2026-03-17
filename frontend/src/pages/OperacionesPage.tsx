import { FormEvent, useEffect, useMemo, useState } from "react";

import { ActionModal } from "../components/common/ActionModal";
import { api } from "../services/api";
import type { Cliente, Operacion, Tercero, User } from "../types";

interface Props {
  user: User;
}

export function OperacionesPage({ user }: Props) {
  const soloCointra = user.rol === "COINTRA";
  const soloCointraAdmin = user.rol === "COINTRA" && user.sub_rol === "COINTRA_ADMIN";
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editModal, setEditModal] = useState<{ id: number; nombre: string; porcentaje: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ id: number; action: "inactivar" | "reactivar" } | null>(null);

  const clienteById = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const terceroById = useMemo(() => new Map(terceros.map((t) => [t.id, t])), [terceros]);
  const operacionesPorCliente = useMemo(() => {
    const grouped = new Map<number, number>();
    for (const op of operaciones) {
      grouped.set(op.cliente_id, (grouped.get(op.cliente_id) ?? 0) + 1);
    }
    return Array.from(grouped.entries())
      .map(([clienteId, total]) => ({
        clienteId,
        total,
        nombre: clienteById.get(clienteId)?.nombre ?? `Cliente #${clienteId}`,
      }))
      .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
  }, [operaciones, clienteById]);
  const operacionesPorTercero = useMemo(() => {
    const grouped = new Map<number, number>();
    for (const op of operaciones) {
      grouped.set(op.tercero_id, (grouped.get(op.tercero_id) ?? 0) + 1);
    }
    return Array.from(grouped.entries())
      .map(([terceroId, total]) => ({
        terceroId,
        total,
        nombre: terceroById.get(terceroId)?.nombre ?? `Tercero #${terceroId}`,
      }))
      .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
  }, [operaciones, terceroById]);

  async function loadData() {
    try {
      const [cs, ts, ops] = await Promise.all([api.clientes(), api.terceros(), api.operaciones()]);
      setClientes(cs);
      setTerceros(ts);
      setOperaciones(ops);
      setError("");
    } catch (e) {
      setError((e as Error).message || "No se pudo cargar la informacion");
    }
  }

  useEffect(() => {
    if (soloCointra) {
      void loadData();
    }
  }, [soloCointra]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setError("");
    setSuccess("");
    try {
      await api.crearOperacion({
        cliente_id: Number(form.get("cliente_id")),
        tercero_id: Number(form.get("tercero_id")),
        nombre: String(form.get("nombre") || "").trim(),
        porcentaje_rentabilidad: Number(form.get("porcentaje_rentabilidad") || 10),
      });
      formEl.reset();
      await loadData();
      setSuccess("Operación creada exitosamente.");
    } catch (err) {
      setSuccess("");
      setError((err as Error).message || "No se pudo crear la operacion");
    }
  }

  async function onEditConfirm() {
    if (!editModal) return;
    setError("");
    setSuccess("");
    try {
      await api.editarOperacion(editModal.id, {
        nombre: editModal.nombre.trim(),
        porcentaje_rentabilidad: Number(editModal.porcentaje),
      });
      await loadData();
      setSuccess("Operación actualizada exitosamente.");
      setEditModal(null);
    } catch (err) {
      setError((err as Error).message || "No se pudo actualizar la operación");
    }
  }

  async function onConfirmAction() {
    if (!confirmModal) return;
    setError("");
    setSuccess("");
    try {
      if (confirmModal.action === "inactivar") {
        await api.inactivarOperacion(confirmModal.id);
        setSuccess("Operación inactivada exitosamente.");
      } else {
        await api.reactivarOperacion(confirmModal.id);
        setSuccess("Operación reactivada exitosamente.");
      }
      await loadData();
      setConfirmModal(null);
    } catch (err) {
      setError(
        (err as Error).message ||
          (confirmModal.action === "inactivar"
            ? "No se pudo inactivar la operación"
            : "No se pudo reactivar la operación")
      );
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-white/90 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Operaciones</h2>
      {!soloCointra ? (
        <p className="text-sm text-danger">
          Solo los usuarios con rol COINTRA pueden acceder a esta sección.
        </p>
      ) : (
        <>
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
          {success && <p className="text-sm font-medium text-success">{success}</p>}
          <p className="text-xs text-neutral">
            Puedes asociar muchas operaciones al mismo cliente y al mismo tercero: cada operación nueva que crees queda vinculada a ambos.
          </p>

          <form
            className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-slate-50/70 p-4 md:grid-cols-2"
            onSubmit={onCreate}
          >
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Nombre de operación</label>
              <input
                name="nombre"
                required
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Cliente</label>
              <select
                name="cliente_id"
                required
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              >
                <option value="">Seleccione...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Tercero</label>
              <select
                name="tercero_id"
                required
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              >
                <option value="">Seleccione...</option>
                {terceros.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Rentabilidad %</label>
              <input
                name="porcentaje_rentabilidad"
                type="number"
                step="0.01"
                min={0}
                max={99.99}
                defaultValue={10}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
              >
                Crear operación
              </button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                  <th className="border-b border-border px-3 py-2 text-left">ID</th>
                  <th className="border-b border-border px-3 py-2 text-left">Nombre</th>
                  <th className="border-b border-border px-3 py-2 text-left">Cliente</th>
                  <th className="border-b border-border px-3 py-2 text-left">Tercero</th>
                  <th className="border-b border-border px-3 py-2 text-left">Rentabilidad %</th>
                  <th className="border-b border-border px-3 py-2 text-left">Activa</th>
                  {soloCointraAdmin && <th className="border-b border-border px-3 py-2 text-left">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {operaciones.map((op) => (
                  <tr key={op.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{op.id}</td>
                    <td className="px-3 py-2">{op.nombre}</td>
                    <td className="px-3 py-2">{clienteById.get(op.cliente_id)?.nombre ?? `Cliente #${op.cliente_id}`}</td>
                    <td className="px-3 py-2">{terceroById.get(op.tercero_id)?.nombre ?? `Tercero #${op.tercero_id}`}</td>
                    <td className="px-3 py-2">{op.porcentaje_rentabilidad}%</td>
                    <td className="px-3 py-2">{op.activa ? "Sí" : "No"}</td>
                    {soloCointraAdmin && (
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setEditModal({
                                id: op.id,
                                nombre: op.nombre,
                                porcentaje: String(op.porcentaje_rentabilidad),
                              })
                            }
                            className="rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Editar
                          </button>
                          {op.activa && (
                            <button
                              type="button"
                              onClick={() => setConfirmModal({ id: op.id, action: "inactivar" })}
                              className="rounded-full border border-danger/40 bg-danger/5 px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                            >
                              Inactivar
                            </button>
                          )}
                          {!op.activa && (
                            <button
                              type="button"
                              onClick={() => setConfirmModal({ id: op.id, action: "reactivar" })}
                              className="rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-medium text-success hover:bg-success/20"
                            >
                              Reactivar
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <section className="rounded-xl border border-border bg-slate-50/70 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral">Operaciones por cliente</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {operacionesPorCliente.map((row) => (
                  <li key={row.clienteId} className="flex items-center justify-between gap-2">
                    <span>{row.nombre}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">{row.total}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-xl border border-border bg-slate-50/70 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral">Operaciones por tercero</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {operacionesPorTercero.map((row) => (
                  <li key={row.terceroId} className="flex items-center justify-between gap-2">
                    <span>{row.nombre}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">{row.total}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}

      <ActionModal
        open={!!editModal}
        title={editModal ? `Editar operación #${editModal.id}` : "Editar operación"}
        confirmText="Guardar cambios"
        onClose={() => setEditModal(null)}
        onConfirm={onEditConfirm}
      >
        <input
          value={editModal?.nombre ?? ""}
          onChange={(e) =>
            setEditModal((prev) => (prev ? { ...prev, nombre: e.target.value } : prev))
          }
          placeholder="Nombre"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
        <input
          value={editModal?.porcentaje ?? ""}
          onChange={(e) =>
            setEditModal((prev) => (prev ? { ...prev, porcentaje: e.target.value } : prev))
          }
          type="number"
          step="0.01"
          min={0}
          max={99.99}
          placeholder="Rentabilidad %"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
      </ActionModal>

      <ActionModal
        open={!!confirmModal}
        title={
          confirmModal?.action === "inactivar"
            ? `¿Inactivar operación #${confirmModal.id}?`
            : `¿Reactivar operación #${confirmModal?.id}?`
        }
        description="Esta acción quedará registrada en el sistema."
        confirmText={confirmModal?.action === "inactivar" ? "Inactivar" : "Reactivar"}
        confirmTone={confirmModal?.action === "inactivar" ? "danger" : "success"}
        onClose={() => setConfirmModal(null)}
        onConfirm={onConfirmAction}
      />
    </div>
  );
}

