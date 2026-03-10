import { User } from "../types";

interface Props {
  user: User;
  onLogout: () => void;
}

export function Header({ user, onLogout }: Props) {
  return (
    <header className="topbar">
      <div>
        <h2>Cointra Conciliaciones</h2>
        <p>
          {user.nombre} | Rol: <strong>{user.rol}</strong>
        </p>
      </div>
      <button onClick={onLogout}>Cerrar sesion</button>
    </header>
  );
}
