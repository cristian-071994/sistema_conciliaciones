import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../services/api";
import type { ServicioAdjunto, Viaje } from "../../types";

// Solo para mostrar en pantalla y ayudar al usuario; el servidor valida de verdad
// (cantidad, tipo real del archivo y tamaño) y es quien manda.
export const MAX_ADJUNTOS = 3;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

function mensajeDeError(error: unknown): string {
  const message = (error as Error)?.message || "";
  if (!message) return "Ocurrió un error inesperado. Intenta de nuevo.";
  try {
    const parsed = JSON.parse(message) as { detail?: string };
    if (parsed.detail) return parsed.detail;
  } catch {
    // Mensaje plano
  }
  return message;
}

function formatearTamano(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ---------------------------------------------------------------------------
// Tarjeta con vista previa
// ---------------------------------------------------------------------------

interface TarjetaProps {
  nombre: string;
  esPdf: boolean;
  tamano: number;
  /** Devuelve el contenido para la vista previa: un File local o un Blob descargado del servidor. */
  obtenerBlob: () => Promise<Blob>;
  onAbrir: () => void;
  onQuitar?: () => void;
}

/**
 * Tarjeta mediana de un archivo: de fondo se ve la primera página del PDF (visor
 * nativo del navegador, sin dependencias) o la imagen, con el nombre y las
 * acciones encima. Si el navegador no puede mostrar la vista previa, queda una
 * tarjeta limpia con el icono del tipo de archivo.
 */
export function AdjuntoTarjeta({ nombre, esPdf, tamano, obtenerBlob, onAbrir, onQuitar }: TarjetaProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    let creada: string | null = null;
    obtenerBlob()
      .then((blob) => {
        if (cancelado) return;
        creada = URL.createObjectURL(blob);
        setUrl(creada);
      })
      .catch(() => {
        if (!cancelado) setFallo(true);
      });
    return () => {
      cancelado = true;
      if (creada) URL.revokeObjectURL(creada);
    };
    // La tarjeta se vuelve a montar (key) cuando cambia el archivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="group relative h-60 w-full overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-200 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-xl">
      {/* Vista previa de fondo */}
      <div className="absolute inset-0">
        {url && !esPdf && <img src={url} alt={nombre} className="h-full w-full object-cover" />}
        {url && esPdf && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden bg-white">
            <iframe
              title={`Vista previa de ${nombre}`}
              src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
              className="absolute left-0 top-0 h-[170%] w-full origin-top-left border-0"
              tabIndex={-1}
            />
          </div>
        )}
        {!url && !fallo && <div className="h-full w-full animate-pulse bg-slate-200" />}
        {(fallo || (!url && fallo)) && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
            <span className="text-5xl">{esPdf ? "📄" : "🖼️"}</span>
            <span className="text-xs font-semibold">Sin vista previa</span>
          </div>
        )}
      </div>

      {/* Capa clicable para abrir el archivo */}
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Abrir ${nombre}`}
        className="absolute inset-0 z-10 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      />

      {/* Quitar */}
      {onQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar ${nombre}`}
          title="Quitar archivo"
          className="absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-sm font-bold text-rose-600 shadow transition hover:bg-rose-600 hover:text-white"
        >
          ×
        </button>
      )}

      {/* Pie con nombre y tamaño */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-slate-900/85 via-slate-900/55 to-transparent px-3 pb-3 pt-10">
        <p className="truncate text-sm font-semibold text-white" title={nombre}>
          {nombre}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-200">
          <span
            className={`rounded-full px-2 py-px text-[9px] font-bold uppercase tracking-wide text-white ${
              esPdf ? "bg-rose-500" : "bg-sky-500"
            }`}
          >
            {esPdf ? "PDF" : "Imagen"}
          </span>
          {formatearTamano(tamano)} · <span className="font-medium">Clic para abrir</span>
        </p>
      </div>
    </div>
  );
}

function esPdfArchivo(archivo: File): boolean {
  return archivo.type === "application/pdf" || archivo.name.toLowerCase().endsWith(".pdf");
}

// ---------------------------------------------------------------------------
// Selector del formulario de carga
// ---------------------------------------------------------------------------

interface SelectorProps {
  archivos: File[];
  onChange: (archivos: File[]) => void;
}

/** Selector de hasta 3 archivos (PDF o imagen) para el formulario de carga de un servicio. */
export function AdjuntosSelector({ archivos, onChange }: SelectorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [aviso, setAviso] = useState("");

  function agregar(nuevos: FileList | null) {
    if (!nuevos || nuevos.length === 0) return;
    const combinados = [...archivos, ...Array.from(nuevos)];
    setAviso(
      combinados.length > MAX_ADJUNTOS
        ? `Máximo ${MAX_ADJUNTOS} archivos por servicio. Se conservaron los primeros ${MAX_ADJUNTOS}.`
        : ""
    );
    onChange(combinados.slice(0, MAX_ADJUNTOS));
    if (inputRef.current) inputRef.current.value = "";
  }

  function abrirLocal(archivo: File) {
    const url = URL.createObjectURL(archivo);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral">Soportes (opcional)</p>
          <p className="text-[11px] text-slate-500">
            Hasta {MAX_ADJUNTOS} archivos, PDF o imagen (JPG, PNG, WEBP), máximo 10 MB cada uno.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
          {archivos.length}/{MAX_ADJUNTOS}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {archivos.map((archivo, indice) => (
          <AdjuntoTarjeta
            key={`${archivo.name}-${archivo.size}-${indice}`}
            nombre={archivo.name}
            esPdf={esPdfArchivo(archivo)}
            tamano={archivo.size}
            obtenerBlob={async () => archivo}
            onAbrir={() => abrirLocal(archivo)}
            onQuitar={() => onChange(archivos.filter((_, i) => i !== indice))}
          />
        ))}
        {archivos.length < MAX_ADJUNTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-60 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 text-emerald-700 transition hover:border-emerald-500 hover:bg-emerald-50"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-3xl font-light shadow-sm">+</span>
            <span className="text-sm font-semibold">Adjuntar archivo</span>
            <span className="text-[11px] text-emerald-600/80">PDF o imagen</span>
          </button>
        )}
      </div>

      <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => agregar(e.target.files)} />
      {!!aviso && <p className="mt-2 text-[11px] font-medium text-amber-700">{aviso}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal para ver / agregar / quitar los soportes de un servicio ya cargado
// ---------------------------------------------------------------------------

interface ModalProps {
  viaje: Viaje;
  /** Si el usuario puede agregar/quitar archivos (el servidor igual lo vuelve a validar). */
  puedeEditar: boolean;
  onClose: () => void;
  /** Se llama tras agregar o quitar archivos, para refrescar el contador del listado. */
  onChanged: () => void;
}

/** Datos mínimos para abrir el modal: sirven tanto un Viaje como un ítem de conciliación. */
export type ViajeAdjuntable = Pick<Viaje, "id" | "titulo">;

export function AdjuntosModal({ viaje, puedeEditar, onClose, onChanged }: Omit<ModalProps, "viaje"> & { viaje: ViajeAdjuntable }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [adjuntos, setAdjuntos] = useState<ServicioAdjunto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [porEliminar, setPorEliminar] = useState<ServicioAdjunto | null>(null);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      setAdjuntos(await api.listarAdjuntosServicio(viaje.id));
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viaje.id]);

  async function subir(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    setTrabajando(true);
    setError("");
    try {
      await api.subirAdjuntosServicio(viaje.id, Array.from(archivos));
      await cargar();
      onChanged();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setTrabajando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function abrir(adjunto: ServicioAdjunto) {
    setError("");
    try {
      const blob = await api.descargarAdjuntoServicio(viaje.id, adjunto.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }

  async function eliminar() {
    if (!porEliminar) return;
    setTrabajando(true);
    setError("");
    try {
      await api.eliminarAdjuntoServicio(viaje.id, porEliminar.id);
      setPorEliminar(null);
      await cargar();
      onChanged();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setTrabajando(false);
    }
  }

  const lleno = adjuntos.length >= MAX_ADJUNTOS;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-emerald-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Soportes del servicio</p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">
              #{viaje.id} · {viaje.titulo}
            </h3>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            {adjuntos.length}/{MAX_ADJUNTOS} archivos
          </span>
        </div>

        <div className="mt-5">
          {cargando ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((n) => (
                <div key={n} className="h-60 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : adjuntos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
              <span className="text-4xl">📎</span>
              <p className="text-sm font-medium text-slate-700">Este servicio aún no tiene archivos adjuntos.</p>
              {puedeEditar && <p className="text-xs text-slate-500">Usa «Agregar archivos» para subir PDF o imágenes.</p>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {adjuntos.map((adjunto) => (
                <AdjuntoTarjeta
                  key={adjunto.id}
                  nombre={adjunto.filename}
                  esPdf={adjunto.content_type === "application/pdf"}
                  tamano={adjunto.size_bytes}
                  obtenerBlob={() => api.descargarAdjuntoServicio(viaje.id, adjunto.id)}
                  onAbrir={() => void abrir(adjunto)}
                  onQuitar={puedeEditar ? () => setPorEliminar(adjunto) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        {porEliminar && (
          <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3">
            <p className="text-sm text-slate-800">
              ¿Quitar <span className="font-semibold">{porEliminar.filename}</span>? Esta acción no se puede deshacer.
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPorEliminar(null)}
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={trabajando}
                onClick={() => void eliminar()}
                className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                Sí, quitar
              </button>
            </div>
          </div>
        )}

        {!!error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}

        <div className="mt-6 flex items-center justify-between gap-2">
          {puedeEditar ? (
            <>
              <button
                type="button"
                disabled={lleno || trabajando}
                onClick={() => inputRef.current?.click()}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {trabajando ? "Subiendo..." : lleno ? `Máximo ${MAX_ADJUNTOS} archivos` : "Agregar archivos"}
              </button>
              <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => void subir(e.target.files)} />
            </>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
