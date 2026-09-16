import { FormEvent, useEffect, useState } from "react";
import { api } from "../services/api";
import type { Permiso, Rol, User } from "../types";
import { hasPermiso } from "../utils/permisos";

interface Props {
  user: User;
}

function toSpanishError(error: unknown): string {
  const message = (error as Error)?.message || "";
  return message || "Ocurrio un error inesperado";
}

export function RolesPage({ user }: Props) {
  const puedeCrearRol = hasPermiso(user, "roles.crear");
  const puedeEditarRol = hasPermiso(user, "roles.editar");
  const puedeDesactivarRol = hasPermiso(user, "roles.desactivar");

  const [roles, setRoles] = useState<Rol[]>([]);
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingRolId, setSavingRolId] = useState<number | null>(null);
  // Claves marcadas en pantalla por rol, sin guardar todavía. Solo existe una
  // entrada para un rol mientras tiene cambios pendientes de "Guardar cambios".
  const [pendientesPorRol, setPendientesPorRol] = useState<Record<number, string[]>>({});

  const [mostrarFormNuevoRol, setMostrarFormNuevoRol] = useState(false);
  const [nuevoRolNombre, setNuevoRolNombre] = useState("");
  const [nuevoRolDescripcion, setNuevoRolDescripcion] = useState("");
  const [creandoRol, setCreandoRol] = useState(false);

  const [editandoRolId, setEditandoRolId] = useState<number | null>(null);
  const [editRolNombre, setEditRolNombre] = useState("");
  const [editRolDescripcion, setEditRolDescripcion] = useState("");
  const [guardandoEdicionRol, setGuardandoEdicionRol] = useState(false);

  const [cambiandoEstadoRolId, setCambiandoEstadoRolId] = useState<number | null>(null);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [rolesData, permisosData] = await Promise.all([api.roles(), api.permisosCatalogo()]);
      setRoles(rolesData);
      setPermisos(permisosData);
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function clavesVisibles(rol: Rol): string[] {
    return pendientesPorRol[rol.id] ?? rol.permiso_claves;
  }

  function tieneCambios(rol: Rol): boolean {
    const pendiente = pendientesPorRol[rol.id];
    if (!pendiente) return false;
    const a = [...pendiente].sort();
    const b = [...rol.permiso_claves].sort();
    return a.length !== b.length || a.some((clave, i) => clave !== b[i]);
  }

  function togglePermiso(rol: Rol, clave: string, checked: boolean) {
    const actuales = clavesVisibles(rol);
    const nuevaLista = checked ? [...actuales, clave] : actuales.filter((c) => c !== clave);
    setPendientesPorRol((prev) => ({ ...prev, [rol.id]: nuevaLista }));
  }

  function descartarCambios(rol: Rol) {
    setPendientesPorRol((prev) => {
      const next = { ...prev };
      delete next[rol.id];
      return next;
    });
  }

  async function guardarCambios(rol: Rol) {
    const nuevaLista = pendientesPorRol[rol.id];
    if (!nuevaLista) return;

    setSavingRolId(rol.id);
    setError("");
    try {
      const actualizado = await api.actualizarPermisosRol(rol.id, nuevaLista);
      setRoles((prev) => prev.map((r) => (r.id === rol.id ? actualizado : r)));
      descartarCambios(rol);
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setSavingRolId(null);
    }
  }

  async function crearRol(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nombre = nuevoRolNombre.trim();
    if (!nombre) return;
    setCreandoRol(true);
    setError("");
    try {
      const creado = await api.crearRol({ nombre, descripcion: nuevoRolDescripcion.trim() || undefined });
      setRoles((prev) => [...prev, creado]);
      setNuevoRolNombre("");
      setNuevoRolDescripcion("");
      setMostrarFormNuevoRol(false);
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setCreandoRol(false);
    }
  }

  function iniciarEdicionRol(rol: Rol) {
    setEditandoRolId(rol.id);
    setEditRolNombre(rol.nombre);
    setEditRolDescripcion(rol.descripcion ?? "");
  }

  async function guardarEdicionRol(rolId: number) {
    const nombre = editRolNombre.trim();
    if (!nombre) return;
    setGuardandoEdicionRol(true);
    setError("");
    try {
      const actualizado = await api.editarRol(rolId, { nombre, descripcion: editRolDescripcion.trim() || undefined });
      setRoles((prev) => prev.map((r) => (r.id === rolId ? actualizado : r)));
      setEditandoRolId(null);
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setGuardandoEdicionRol(false);
    }
  }

  async function alternarEstadoRol(rol: Rol) {
    setCambiandoEstadoRolId(rol.id);
    setError("");
    try {
      const actualizado = rol.activo ? await api.desactivarRol(rol.id) : await api.activarRol(rol.id);
      setRoles((prev) => prev.map((r) => (r.id === rol.id ? actualizado : r)));
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setCambiandoEstadoRolId(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
        <p className="text-sm text-neutral">Cargando roles...</p>
      </section>
    );
  }

  if (error && roles.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
        <p className="text-sm text-danger">{error}</p>
      </section>
    );
  }

  const categorias = Array.from(new Set(permisos.map((p) => p.categoria)));

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Roles y permisos</h2>
          {puedeCrearRol && !mostrarFormNuevoRol && (
            <button
              type="button"
              onClick={() => setMostrarFormNuevoRol(true)}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary/90"
            >
              + Nuevo rol
            </button>
          )}
        </div>
        <p className="text-sm text-neutral">
          Controla qué acciones administrativas puede realizar cada rol (usuarios, roles, operaciones, clientes,
          terceros, vehículos, servicios, catálogo de tarifas, viajes y Avansat). Marca o desmarca los permisos y
          usa "Guardar cambios" para aplicarlos — la clasificación de negocio de cada usuario (Cointra / Cliente /
          Tercero) no se edita aquí. Puedes crear roles adicionales para perfiles de permisos más finos (ej. un
          supervisor con acceso a solo algunos módulos) y asignarlos manualmente a un usuario desde el módulo
          Usuarios.
        </p>

        {mostrarFormNuevoRol && (
          <form onSubmit={crearRol} className="mt-4 grid gap-2 rounded-xl border border-border bg-slate-50/70 p-4 md:grid-cols-[1fr,1fr,auto,auto]">
            <input
              value={nuevoRolNombre}
              onChange={(e) => setNuevoRolNombre(e.target.value)}
              placeholder="Nombre del rol (ej. Supervisor Facturación)"
              required
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <input
              value={nuevoRolDescripcion}
              onChange={(e) => setNuevoRolDescripcion(e.target.value)}
              placeholder="Descripción (opcional)"
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <button
              type="submit"
              disabled={creandoRol}
              className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
            >
              {creandoRol ? "Creando..." : "Crear"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMostrarFormNuevoRol(false);
                setNuevoRolNombre("");
                setNuevoRolDescripcion("");
              }}
              className="rounded-lg px-3 py-2 text-xs font-medium text-neutral transition hover:bg-slate-100"
            >
              Cancelar
            </button>
          </form>
        )}
      </section>

      {!!error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {roles.map((rol) => (
          <section
            key={rol.id}
            className={`rounded-2xl border p-5 shadow-sm ${rol.activo ? "border-border bg-white/90" : "border-border bg-slate-50/70 opacity-75"}`}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{rol.nombre}</h3>
                {!rol.es_sistema && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      rol.activo ? "bg-success/10 text-success" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {rol.activo ? "Activo" : "Inactivo"}
                  </span>
                )}
              </div>
              <span className="text-xs text-neutral">{rol.usuarios_count} usuario(s)</span>
            </div>

            {editandoRolId === rol.id ? (
              <div className="mb-3 space-y-2 rounded-lg border border-border bg-slate-50/70 p-3">
                <input
                  value={editRolNombre}
                  onChange={(e) => setEditRolNombre(e.target.value)}
                  className="w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
                <input
                  value={editRolDescripcion}
                  onChange={(e) => setEditRolDescripcion(e.target.value)}
                  placeholder="Descripción"
                  className="w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void guardarEdicionRol(rol.id)}
                    disabled={guardandoEdicionRol}
                    className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {guardandoEdicionRol ? "Guardando..." : "Guardar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoRolId(null)}
                    className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-neutral transition hover:bg-slate-100"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                {rol.descripcion && <p className="mb-1 text-xs text-neutral">{rol.descripcion}</p>}
                {!rol.es_sistema && (puedeEditarRol || puedeDesactivarRol) && (
                  <div className="mb-3 flex gap-2">
                    {puedeEditarRol && (
                      <button
                        type="button"
                        onClick={() => iniciarEdicionRol(rol)}
                        className="rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Editar
                      </button>
                    )}
                    {puedeDesactivarRol && (
                      <button
                        type="button"
                        onClick={() => void alternarEstadoRol(rol)}
                        disabled={cambiandoEstadoRolId === rol.id}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium disabled:opacity-60 ${
                          rol.activo
                            ? "border-danger/40 bg-danger/5 text-danger hover:bg-danger/10"
                            : "border-success/40 bg-success/10 text-success hover:bg-success/20"
                        }`}
                      >
                        {rol.activo ? "Desactivar" : "Activar"}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {rol.es_superadmin ? (
              <p className="rounded-lg bg-success/10 px-3 py-2 text-xs font-medium text-success">
                Acceso total — este rol no usa permisos explícitos.
              </p>
            ) : (
              <div className="space-y-3">
                {categorias.map((categoria) => (
                  <div key={categoria}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral">
                      {categoria}
                    </p>
                    <div className="space-y-1">
                      {permisos
                        .filter((p) => p.categoria === categoria)
                        .map((permiso) => (
                          <label key={permiso.id} className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={clavesVisibles(rol).includes(permiso.clave)}
                              disabled={savingRolId === rol.id}
                              onChange={(e) => togglePermiso(rol, permiso.clave, e.target.checked)}
                              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                            />
                            {permiso.descripcion}
                          </label>
                        ))}
                    </div>
                  </div>
                ))}

                {tieneCambios(rol) && (
                  <div className="flex items-center gap-2 border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => void guardarCambios(rol)}
                      disabled={savingRolId === rol.id}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                    >
                      {savingRolId === rol.id ? "Guardando..." : "Guardar cambios"}
                    </button>
                    <button
                      type="button"
                      onClick={() => descartarCambios(rol)}
                      disabled={savingRolId === rol.id}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral transition hover:bg-slate-100 disabled:opacity-60"
                    >
                      Descartar
                    </button>
                    <span className="text-xs text-amber-600">Cambios sin guardar</span>
                  </div>
                )}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
