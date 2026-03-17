import type { ReactNode } from "react";
import type { User } from "../../types";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface LayoutProps {
  user: User;
  onLogout: () => void;
  alertCount?: number;
  onOpenAlerts?: () => void;
  children: ReactNode;
}

export function Layout({ user, onLogout, alertCount = 0, onOpenAlerts, children }: LayoutProps) {
  return (
    <div className="h-screen overflow-hidden bg-bg">
      <Sidebar user={user} />
      <div className="ml-64 flex h-screen flex-1 flex-col">
        <Topbar user={user} onLogout={onLogout} alertCount={alertCount} onOpenAlerts={onOpenAlerts} />
        <main className="mt-16 h-[calc(100vh-4rem)] overflow-y-auto bg-bg px-6 py-6">
          <div className="w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}

