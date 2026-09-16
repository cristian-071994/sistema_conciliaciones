import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Permiso, Rol, User } from "../types";

interface Props {
  user: User;
}

function toSpanishError(error: unknown): string {
  const message = (error as Error)?.message || "";
  return message || "Ocurrio un error inesperado";
}

export function RolesPage({ user: _user }: Props) {
  const [roles, setRoles] = useState<Rol[]>([]);
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingRolId, setSavingRolId] = useState<number | null>(null);
  // Claves marcadas en pantalla por rol, sin guardar todavía. Solo existe una
  // entrada para un rol mientras tiene cambios pendientes de "Guardar cambios".
  const [pendientesPorRol, setPendientesPorRol] = useState<Record<number, string[]>>({});

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
        <h2 className="mb-2 text-base font-semibold text-slate-900">Roles y permisos</h2>
        <p className="text-sm text-neutral">
          Controla qué acciones administrativas puede realizar cada rol (usuarios, roles, operaciones, clientes,
          terceros, vehículos, servicios, catálogo de tarifas, viajes y Avansat). Marca o desmarca los permisos y
          usa "Guardar cambios" para aplicarlos — la clasificación de negocio de cada usuario (Cointra / Cliente /
          Tercero) no se edita aquí.
        </p>
      </section>

      {!!error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {roles.map((rol) => (
          <section key={rol.id} className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">{rol.nombre}</h3>
              <span className="text-xs text-neutral">{rol.usuarios_count} usuario(s)</span>
            </div>
            {rol.descripcion && <p className="mb-3 text-xs text-neutral">{rol.descripcion}</p>}

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
