import { useLocation, useNavigate } from "react-router-dom";
import type { User } from "../../types";
import { hasAlgunPermiso } from "../../utils/permisos";

interface SidebarProps {
  user: User;
}

type NavItem = {
  key: string;
  label: string;
  path: string;
};

// Módulos cuya visibilidad en el menú depende del permiso configurado en
// Roles y Permisos (no del rol fijo) — porque el backend ya gatea el propio
// listado (GET) detrás de estas claves, sin importar qué rol lo consulte.
const PERMISSION_NAV_ITEMS: (NavItem & { permisos: string[] })[] = [
  {
    key: "servicios",
    label: "Servicios",
    path: "/servicios",
    permisos: ["servicios.crear", "servicios.editar", "servicios.desactivar"],
  },
  {
    key: "catalogo-tarifas",
    label: "Catálogo de Tarifas",
    path: "/catalogo-tarifas",
    permisos: ["catalogo_tarifas.ver", "catalogo_tarifas.crear", "catalogo_tarifas.editar", "catalogo_tarifas.desactivar"],
  },
  {
    key: "avansat",
    label: "Consulta Avansat",
    path: "/avansat",
    permisos: ["avansat.consultar", "avansat.sincronizar", "avansat.sincronizar_historico"],
  },
  {
    key: "usuarios",
    label: "Usuarios",
    path: "/usuarios",
    permisos: ["usuarios.ver", "usuarios.crear", "usuarios.editar", "usuarios.desactivar"],
  },
  {
    key: "roles",
    label: "Roles y permisos",
    path: "/roles",
    permisos: ["roles.ver", "roles.gestionar"],
  },
];

function getNavItemsForRole(user: User): NavItem[] {
  const { rol } = user;

  // Ítems fijos: reflejan la identidad de negocio del usuario (Cointra /
  // Cliente / Tercero) y páginas cuyo GET es abierto para todo ese rol —
  // no dependen de ningún permiso configurable.
  let items: NavItem[];
  if (rol === "COINTRA") {
    items = [
      { key: "dashboard", label: "Dashboard", path: "/dashboard" },
      { key: "operaciones", label: "Operaciones", path: "/operaciones" },
      { key: "conciliaciones", label: "Conciliaciones", path: "/conciliaciones" },
      { key: "vehiculos", label: "Vehículos", path: "/vehiculos" },
      { key: "clientes", label: "Clientes", path: "/clientes" },
      { key: "terceros", label: "Terceros", path: "/terceros" },
      { key: "viajes-adicionales", label: "Viajes Adicionales", path: "/viajes-adicionales" },
    ];
  } else if (rol === "CLIENTE") {
    items = [
      { key: "dashboard", label: "Dashboard", path: "/dashboard" },
      { key: "mis-conciliaciones", label: "Mis Conciliaciones", path: "/conciliaciones" },
      { key: "viajes-adicionales", label: "Viajes Adicionales", path: "/viajes-adicionales" },
    ];
  } else {
    items = [
      { key: "dashboard", label: "Dashboard", path: "/dashboard" },
      { key: "mis-conciliaciones", label: "Mis Conciliaciones", path: "/conciliaciones" },
      { key: "viajes-adicionales", label: "Viajes Adicionales", path: "/viajes-adicionales" },
      { key: "vehiculos", label: "Vehículos", path: "/vehiculos" },
    ];
  }

  // Ítems configurables: se agregan sin importar el rol si el usuario tiene
  // al menos uno de los permisos de esa categoría (así un Cliente al que se
  // le concede acceso al Catálogo de Tarifas, por ejemplo, ve el módulo).
  for (const item of PERMISSION_NAV_ITEMS) {
    if (items.some((i) => i.path === item.path)) continue;
    if (hasAlgunPermiso(user, item.permisos)) {
      items.push({ key: item.key, label: item.label, path: item.path });
    }
  }

  return items;
}

export function Sidebar({ user }: SidebarProps) {
  const items = getNavItemsForRole(user);
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-emerald-950/20 bg-sidebar text-emerald-50 shadow-2xl shadow-emerald-950/10">
      <div className="flex h-16 items-center px-5">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-300 via-emerald-400 to-teal-500 shadow-lg shadow-emerald-900/20" />
        <div className="ml-3">
          <p className="text-xs uppercase tracking-wide text-emerald-200/80">Cointra</p>
          <p className="text-sm font-semibold text-white">Refrigerados</p>
        </div>
      </div>
      <nav className="mt-4 flex-1 space-y-1 px-3 text-sm">
        {items.map((item) => {
          const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate(item.path)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                active
                  ? "bg-emerald-800/80 text-white shadow-sm"
                  : "text-emerald-50/85 hover:bg-emerald-900/45 hover:text-white"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  active ? "bg-emerald-300" : "bg-emerald-200/50"
                }`}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="border-t border-emerald-950/20 px-4 py-4 text-xs text-emerald-100/60">
        <p className="font-medium text-emerald-50">{user.nombre}</p>
        <p>Rol: {user.rol}</p>
      </div>
    </aside>
  );
}

