import { useEffect, useRef } from "react";
import { api } from "../services/api";

const INTERVALO_MINIMO_ENTRE_ENVIOS_MS = 30_000;
const EVENTOS_INTERACCION = ["click", "keydown", "mousemove", "scroll"] as const;

/** Envía un heartbeat al backend por interacción real del usuario, como
 * máximo cada 30s (medido desde el último envío, no desde la última
 * interacción). Se monta una sola vez en App.tsx, no por página. */
export function useHeartbeat(activo: boolean) {
  const ultimoEnvioRef = useRef(0);

  useEffect(() => {
    if (!activo) return;

    function enviarHeartbeat() {
      const ahora = Date.now();
      if (ahora - ultimoEnvioRef.current < INTERVALO_MINIMO_ENTRE_ENVIOS_MS) return;
      ultimoEnvioRef.current = ahora;
      void api.presenceHeartbeat().catch(() => null);
    }

    enviarHeartbeat();
    for (const evento of EVENTOS_INTERACCION) {
      window.addEventListener(evento, enviarHeartbeat, { passive: true });
    }

    return () => {
      for (const evento of EVENTOS_INTERACCION) {
        window.removeEventListener(evento, enviarHeartbeat);
      }
    };
  }, [activo]);
}
