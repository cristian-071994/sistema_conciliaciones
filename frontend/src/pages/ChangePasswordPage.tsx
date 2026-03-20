import { FormEvent, useState } from "react";
import { ActionModal } from "../components/common/ActionModal";
import { api } from "../services/api";

interface Props {
  onPasswordChanged: () => void;
}

export function ChangePasswordPage({ onPasswordChanged }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const response = await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setMessage(response.message);
      setShowSuccessModal(true);
    } catch (err) {
      setError((err as Error).message || "No se pudo cambiar la contraseña");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="mx-auto w-full max-w-xl rounded-2xl border border-emerald-100 bg-white p-6 shadow-lg shadow-emerald-900/10">
        <h2 className="text-xl font-bold text-slate-900">Cambiar contraseña</h2>
        <p className="mt-1 text-sm text-neutral">Por seguridad, se cerrará tu sesión al guardar la nueva contraseña.</p>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral">
              Contraseña actual
            </label>
            <div className="relative">
              <input
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                type={showCurrentPassword ? "text" : "password"}
                required
                className="w-full rounded-lg border border-border bg-white px-3 py-2.5 pr-14 text-sm text-slate-900 shadow-sm outline-none ring-primary/10 focus:border-primary focus:ring-2"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                aria-label={showCurrentPassword ? "Ocultar contraseña" : "Ver contraseña"}
              >
                {showCurrentPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral">
              Nueva contraseña
            </label>
            <div className="relative">
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                type={showNewPassword ? "text" : "password"}
                required
                minLength={8}
                className="w-full rounded-lg border border-border bg-white px-3 py-2.5 pr-14 text-sm text-slate-900 shadow-sm outline-none ring-primary/10 focus:border-primary focus:ring-2"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                aria-label={showNewPassword ? "Ocultar contraseña" : "Ver contraseña"}
              >
                {showNewPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral">
              Confirmar nueva contraseña
            </label>
            <div className="relative">
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type={showConfirmPassword ? "text" : "password"}
                required
                minLength={8}
                className="w-full rounded-lg border border-border bg-white px-3 py-2.5 pr-14 text-sm text-slate-900 shadow-sm outline-none ring-primary/10 focus:border-primary focus:ring-2"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                aria-label={showConfirmPassword ? "Ocultar contraseña" : "Ver contraseña"}
              >
                {showConfirmPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-sm font-medium text-danger">{error}</p>}
          {message && <p className="text-sm font-medium text-emerald-700">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Guardando..." : "Actualizar contraseña"}
          </button>
        </form>
      </section>

      <ActionModal
        open={showSuccessModal}
        title="Cambio exitoso"
        description="La contraseña se actualizo correctamente. Debes iniciar sesion nuevamente."
        confirmText="Aceptar"
        cancelText="Cerrar"
        confirmTone="success"
        onClose={() => {
          setShowSuccessModal(false);
          onPasswordChanged();
        }}
        onConfirm={() => {
          setShowSuccessModal(false);
          onPasswordChanged();
        }}
      />
    </>
  );
}
