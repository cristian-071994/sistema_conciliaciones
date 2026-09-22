import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import type { User } from "../../types";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface LayoutProps {
  user: User;
  onLogout: () => void;
  onChangePassword: () => void;
  alertCount?: number;
  onOpenAlerts?: () => void;
  children: ReactNode;
}

export function Layout({ user, onLogout, onChangePassword, alertCount = 0, onOpenAlerts, children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Si el usuario navega por otro medio (botón atrás, link directo) mientras
  // el panel mobile quedó abierto, ciérralo para no taparle la pantalla.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="h-screen overflow-hidden bg-bg">
      <Sidebar user={user} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex h-screen flex-1 flex-col md:ml-64">
        <Topbar
          user={user}
          onLogout={onLogout}
          onChangePassword={onChangePassword}
          alertCount={alertCount}
          onOpenAlerts={onOpenAlerts}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="mt-16 h-[calc(100vh-4rem)] overflow-y-auto bg-bg px-4 py-6 md:px-6">
          <div className="w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}

