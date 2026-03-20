import type { User } from "../../types";

interface TopbarProps {
  user: User;
  onLogout: () => void;
  onChangePassword: () => void;
  alertCount?: number;
  onOpenAlerts?: () => void;
}

export function Topbar({ user, onLogout, onChangePassword, alertCount = 0, onOpenAlerts }: TopbarProps) {
  return (
    <header className="fixed left-64 right-0 top-0 z-30 flex h-16 items-center justify-between border-b border-emerald-900/10 bg-white/88 px-6 backdrop-blur">
      <div>
        <h1 className="text-base font-semibold text-slate-900">Panel de conciliaciones</h1>
        <p className="text-xs text-neutral">
          Sesión activa como{" "}
          <span className="font-medium text-emerald-800">
            {user.nombre} ({user.rol})
          </span>
          {alertCount > 0 && (
            <button
              type="button"
              onClick={onOpenAlerts}
              className="ml-2 inline-flex animate-pulse items-center rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white"
              title="Tienes conciliaciones/notificaciones pendientes"
            >
              {alertCount}
            </button>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onChangePassword}
          className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
        >
          Cambiar contraseña
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-100"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}

