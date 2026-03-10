import { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { LoginForm } from "./components/LoginForm";
import { DashboardPage } from "./pages/DashboardPage";
import { api } from "./services/api";
import { Conciliacion, Operacion, User } from "./types";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);
  const [conciliaciones, setConciliaciones] = useState<Conciliacion[]>([]);

  async function loadInitialData() {
    const [ops, con] = await Promise.all([api.operaciones(), api.conciliaciones()]);
    setOperaciones(ops);
    setConciliaciones(con);
  }

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    api
      .me()
      .then(async (me) => {
        setUser(me);
        await loadInitialData();
      })
      .catch(() => {
        localStorage.removeItem("token");
      });
  }, []);

  async function handleLogin(email: string, password: string) {
    const token = await api.login(email, password);
    localStorage.setItem("token", token.access_token);
    const me = await api.me();
    setUser(me);
    await loadInitialData();
  }

  function handleLogout() {
    localStorage.removeItem("token");
    setUser(null);
    setOperaciones([]);
    setConciliaciones([]);
  }

  if (!user) {
    return (
      <main className="container login-bg">
        <LoginForm onLogin={handleLogin} />
      </main>
    );
  }

  return (
    <main className="container">
      <Header user={user} onLogout={handleLogout} />
      <DashboardPage
        user={user}
        operaciones={operaciones}
        conciliaciones={conciliaciones}
        onRefreshConciliaciones={async () => {
          const con = await api.conciliaciones();
          setConciliaciones(con);
        }}
      />
    </main>
  );
}
