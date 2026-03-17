import { FormEvent, useEffect, useState } from "react";

import { ActionModal } from "../components/common/ActionModal";
import { api } from "../services/api";
import type { Tercero, User } from "../types";

interface Props {
  user: User;
}

export function TercerosPage({ user }: Props) {
  const soloCointra = user.rol === "COINTRA";
  const soloCointraAdmin = user.rol === "COINTRA" && user.sub_rol === "COINTRA_ADMIN";
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editModal, setEditModal] = useState<{ id: number; nombre: string; nit: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ id: number; action: "inactivar" | "reactivar" } | null>(null);

  async function loadTerceros() {
    try {
      const data = await api.terceros();
      setTerceros(data);
      setError("");
    } catch (e) {
      setError((e as Error).message || "No se pudo cargar terceros");
    }
  }

  useEffect(() => {
    if (soloCointra) {
      void loadTerceros();
    }
  }, [soloCointra]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setError("");
    setSuccess("");
    try {
      await api.crearTercero({
        nombre: String(form.get("nombre") || "").trim(),
        nit: String(form.get("nit") || "").trim(),
      });
      formEl.reset();
      await loadTerceros();
      setSuccess("Tercero creado exitosamente.");
    } catch (err) {
      setSuccess("");
      setError((err as Error).message || "No se pudo crear el tercero");
    }
  }

  async function onEditConfirm() {
    if (!editModal) return;
    setError("");
    setSuccess("");
    try {
      await api.editarTercero(editModal.id, {
        nombre: editModal.nombre.trim(),
        nit: editModal.nit.trim(),
      });
      await loadTerceros();
      setSuccess("Tercero actualizado exitosamente.");
      setEditModal(null);
    } catch (err) {
      setError((err as Error).message || "No se pudo actualizar el tercero");
    }
  }

  async function onConfirmAction() {
    if (!confirmModal) return;
    setError("");
    setSuccess("");
    try {
      if (confirmModal.action === "inactivar") {
        await api.inactivarTercero(confirmModal.id);
        setSuccess("Tercero inactivado exitosamente.");
      } else {
        await api.reactivarTercero(confirmModal.id);
        setSuccess("Tercero reactivado exitosamente.");
      }
      await loadTerceros();
      setConfirmModal(null);
    } catch (err) {
      setError(
        (err as Error).message ||
          (confirmModal.action === "inactivar"
            ? "No se pudo inactivar el tercero"
            : "No se pudo reactivar el tercero")
      );
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-white/90 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Terceros</h2>
      {!soloCointra ? (
        <p className="text-sm text-danger">
          Solo los usuarios con rol COINTRA pueden acceder a esta sección.
        </p>
      ) : (
        <>
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
          {success && <p className="text-sm font-medium text-success">{success}</p>}

          <form className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-slate-50/70 p-4 md:grid-cols-3" onSubmit={onCreate}>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Nombre</label>
              <input
                name="nombre"
                required
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">NIT</label>
              <input
                name="nit"
                required
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <div className="md:col-span-3">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
              >
                Crear tercero
              </button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                  <th className="border-b border-border px-3 py-2 text-left">ID</th>
                  <th className="border-b border-border px-3 py-2 text-left">Nombre</th>
                  <th className="border-b border-border px-3 py-2 text-left">NIT</th>
                  <th className="border-b border-border px-3 py-2 text-left">Activo</th>
                  {soloCointraAdmin && <th className="border-b border-border px-3 py-2 text-left">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {terceros.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{t.id}</td>
                    <td className="px-3 py-2">{t.nombre}</td>
                    <td className="px-3 py-2">{t.nit}</td>
                    <td className="px-3 py-2">{t.activo ? "Sí" : "No"}</td>
                    {soloCointraAdmin && (
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditModal({ id: t.id, nombre: t.nombre, nit: t.nit })}
                            className="rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Editar
                          </button>
                          {t.activo && (
                            <button
                              type="button"
                              onClick={() => setConfirmModal({ id: t.id, action: "inactivar" })}
                              className="rounded-full border border-danger/40 bg-danger/5 px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                            >
                              Inactivar
                            </button>
                          )}
                          {!t.activo && (
                            <button
                              type="button"
                              onClick={() => setConfirmModal({ id: t.id, action: "reactivar" })}
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
        </>
      )}

      <ActionModal
        open={!!editModal}
        title={editModal ? `Editar tercero #${editModal.id}` : "Editar tercero"}
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
          value={editModal?.nit ?? ""}
          onChange={(e) =>
            setEditModal((prev) => (prev ? { ...prev, nit: e.target.value } : prev))
          }
          placeholder="NIT"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
      </ActionModal>

      <ActionModal
        open={!!confirmModal}
        title={
          confirmModal?.action === "inactivar"
            ? `¿Inactivar tercero #${confirmModal.id}?`
            : `¿Reactivar tercero #${confirmModal?.id}?`
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

