import type { User } from "../types";

/** true si el usuario tiene esa clave de permiso (superadmin recibe el catálogo completo desde /auth/me). */
export function hasPermiso(user: User, clave: string): boolean {
  return (user.permisos ?? []).includes(clave);
}

/** true si el usuario tiene al menos una de las claves dadas. */
export function hasAlgunPermiso(user: User, claves: string[]): boolean {
  const permisos = user.permisos ?? [];
  return claves.some((clave) => permisos.includes(clave));
}
