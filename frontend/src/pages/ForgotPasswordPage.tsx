import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const response = await api.forgotPassword(email);
      setMessage(response.message);
    } catch (err) {
      setError((err as Error).message || "No se pudo procesar la solicitud");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Recuperar contraseña</h1>
        <p className="text-sm text-neutral">Ingresa tu correo para enviarte un enlace de recuperación.</p>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral">
          Email
        </label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-primary/10 placeholder:text-slate-400 focus:border-primary focus:ring-2"
        />
      </div>

      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      {message && <p className="text-sm font-medium text-emerald-700">{message}</p>}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? "Enviando..." : "Enviar enlace"}
      </button>

      <p className="text-sm text-neutral">
        <Link to="/login" className="font-medium text-emerald-700 hover:text-emerald-800">
          Volver al login
        </Link>
      </p>
    </form>
  );
}
