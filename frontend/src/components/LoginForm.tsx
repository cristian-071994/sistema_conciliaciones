import { FormEvent, useState } from "react";

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
}

export function LoginForm({ onLogin }: Props) {
  const [email, setEmail] = useState("cointra@cointra.com");
  const [password, setPassword] = useState("cointra123");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await onLogin(email, password);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h1>Sistema de Conciliacion</h1>
      <p>Cointra S.A.S.</p>
      <label>Email</label>
      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
      <label>Contrasena</label>
      <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
      {error && <p className="error">{error}</p>}
      <button type="submit">Ingresar</button>
      <small>
        Demo: cointra@cointra.com / cliente@cointra.com / tercero@cointra.com (clave terminada en 123)
      </small>
    </form>
  );
}
