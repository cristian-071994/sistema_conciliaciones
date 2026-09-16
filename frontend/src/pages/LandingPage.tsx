import { useNavigate } from "react-router-dom";
import logoCointra from "../assets/logo-cointra.png";

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-teal-100">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mb-8">
          <img src={logoCointra} alt="Cointra S.A.S." className="h-auto w-56 sm:w-64" />
          <p className="mt-2 text-sm font-medium uppercase tracking-wide text-neutral">Refrigerados</p>
        </div>

        <h2 className="max-w-xl text-xl font-semibold text-text sm:text-2xl">
          Sistema de conciliación de servicios de transporte
        </h2>
        <p className="mt-3 max-w-md text-sm text-neutral">
          Gestiona viajes, tarifas y conciliaciones entre clientes y transportadores en un solo lugar.
        </p>

        <button
          type="button"
          onClick={() => navigate("/login")}
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Ingresar
        </button>
      </main>

      <footer className="relative z-10 pb-6 text-center text-xs text-neutral">
        Módulo de conciliación · Cointra S.A.S.
      </footer>
    </div>
  );
}
