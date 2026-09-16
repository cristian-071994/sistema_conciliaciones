import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { formatCOP } from "../utils/formatters";
import type { Operacion, RutaTarifa, SolicitudViajeAdicional, User, VehiculoDisponible } from "../types";

interface Props {
  user: User;
}

function toSpanishError(error: unknown): string {
  const message = (error as Error)?.message || "";
  return message || "Ocurrio un error inesperado";
}

// Estado REAL dentro del proceso de conciliación (calculado en el backend —
// ver EstadoGestionViajeAdicional / _compute_estado_gestion). No confundir
// con SolicitudViajeAdicional.estado, que es un campo manual sin usar aquí.
const ESTADO_GESTION_LABEL: Record<SolicitudViajeAdicional["estado_gestion"], string> = {
  PENDIENTE_TARIFA: "Pendiente tarifa",
  PENDIENTE_MANIFIESTO: "Pendiente manifiesto",
  SIN_CONCILIAR: "Sin conciliar",
  EN_BORRADOR: "En borrador",
  EN_REVISION: "En revisión del cliente",
  APROBADA: "Aprobada",
  CONCILIADO: "Conciliado",
};

const ESTADO_GESTION_BADGE: Record<SolicitudViajeAdicional["estado_gestion"], string> = {
  PENDIENTE_TARIFA: "bg-slate-100 text-slate-600",
  PENDIENTE_MANIFIESTO: "bg-warning/10 text-warning",
  SIN_CONCILIAR: "bg-sky-100 text-sky-700",
  EN_BORRADOR: "bg-indigo-100 text-indigo-700",
  EN_REVISION: "bg-amber-100 text-amber-700",
  APROBADA: "bg-emerald-100 text-emerald-700",
  CONCILIADO: "bg-success/10 text-success",
};

function verManifiesto(id: number) {
  // Se abre la pestaña de forma SÍNCRONA dentro del gesto de clic (no en el
  // .then()) porque los navegadores bloquean popups abiertos después de un
  // await/fetch asíncrono, aunque el usuario sí haya hecho clic. Importante:
  // SIN "noopener"/"noreferrer" aquí — cualquiera de las dos hace que
  // window.open() devuelva null (aunque la pestaña sí se abra), lo que
  // rompía el "if (ventana)" de abajo y terminaba abriendo una SEGUNDA
  // pestaña con el PDF, dejando la primera en about:blank huérfana.
  const ventana = window.open("", "_blank");
  void api
    .verManifiestoViajeAdicional(id)
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      if (ventana) {
        ventana.location.href = url;
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    })
    .catch(() => {
      ventana?.close();
      window.alert("No se pudo cargar el manifiesto");
    });
}

function ClienteForm({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);
  const [vehiculos, setVehiculos] = useState<VehiculoDisponible[]>([]);
  const [rutas, setRutas] = useState<RutaTarifa[]>([]);
  const [operacionId, setOperacionId] = useState<number | null>(null);
  const [vehiculoId, setVehiculoId] = useState<number | null>(null);
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [titulo, setTitulo] = useState("");
  const [fechaViaje, setFechaViaje] = useState("");
  const [producto, setProducto] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [tarifaCliente, setTarifaCliente] = useState<number | null>(null);
  const [tarifaError, setTarifaError] = useState("");
  const [buscandoTarifa, setBuscandoTarifa] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void api.operaciones().then(setOperaciones).catch(() => null);
    void api.rutasTarifaViajeAdicional().then(setRutas).catch(() => setRutas([]));
  }, []);

  useEffect(() => {
    if (!operacionId) {
      setVehiculos([]);
      setVehiculoId(null);
      return;
    }
    void api
      .vehiculosDisponiblesViajeAdicional(operacionId)
      .then((rows) => {
        setVehiculos(rows);
        setVehiculoId(null);
      })
      .catch(() => setVehiculos([]));
  }, [operacionId]);

  const vehiculoSeleccionado = useMemo(() => vehiculos.find((v) => v.id === vehiculoId), [vehiculos, vehiculoId]);
  const origenes = useMemo(() => Array.from(new Set(rutas.map((r) => r.origen))).sort(), [rutas]);
  const destinos = useMemo(
    () => Array.from(new Set(rutas.filter((r) => r.origen === origen).map((r) => r.destino))).sort(),
    [rutas, origen]
  );

  // Consulta en vivo: en cuanto hay origen + destino + vehículo, revisa si
  // el catálogo tiene tarifa para esa combinación. Si no existe, se bloquea
  // el envío (ver validación del backend en crear_solicitud) y se avisa que
  // hay que crearla primero desde Catálogo de Tarifas.
  useEffect(() => {
    if (!origen || !destino || !vehiculoSeleccionado) {
      setTarifaCliente(null);
      setTarifaError("");
      return;
    }
    let cancelado = false;
    setBuscandoTarifa(true);
    setTarifaError("");
    void api
      .lookupTarifaRutaViajeAdicional(origen, destino, vehiculoSeleccionado.tipo_vehiculo_id)
      .then((res) => {
        if (cancelado) return;
        setTarifaCliente(res.tarifa_cliente ?? res.tarifa);
      })
      .catch(() => {
        if (cancelado) return;
        setTarifaCliente(null);
        setTarifaError(
          `No existe tarifa para ${origen} → ${destino} con vehículo tipo "${vehiculoSeleccionado.tipo_vehiculo_nombre}". Créala desde Catálogo de Tarifas.`
        );
      })
      .finally(() => {
        if (!cancelado) setBuscandoTarifa(false);
      });
    return () => {
      cancelado = true;
    };
  }, [origen, destino, vehiculoSeleccionado]);

  function resetForm() {
    setOperacionId(null);
    setVehiculoId(null);
    setOrigen("");
    setDestino("");
    setTitulo("");
    setFechaViaje("");
    setProducto("");
    setObservaciones("");
    setTarifaCliente(null);
    setTarifaError("");
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!operacionId || !vehiculoId) return setError("Selecciona operación y vehículo");
    if (!origen || !destino) return setError("Selecciona origen y destino");
    if (tarifaCliente === null) return setError("No hay tarifa para esta ruta y vehículo — créala primero");
    setSubmitting(true);
    try {
      await api.crearSolicitudViajeAdicional({
        operacion_id: operacionId,
        vehiculo_id: vehiculoId,
        titulo: titulo.trim(),
        fecha_viaje: fechaViaje,
        origen,
        destino,
        producto: producto.trim(),
        observaciones: observaciones.trim() || undefined,
      });
      setSuccess("Solicitud enviada correctamente.");
      resetForm();
      onCreated();
    } catch (err) {
      setError(toSpanishError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const puedeEnviar = !!operacionId && !!vehiculoId && !!origen && !!destino && tarifaCliente !== null && !submitting;

  return (
    <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Solicitar viaje adicional</h2>
      <p className="mb-4 text-sm text-neutral">
        Completa la información del viaje. La tarifa se toma del catálogo según origen, destino y tipo de vehículo.
      </p>

      {!!error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}
      {!!success && <p className="mb-3 text-sm font-medium text-success">{success}</p>}

      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Operación</label>
          <select
            required
            value={operacionId ?? ""}
            onChange={(e) => setOperacionId(Number(e.target.value) || null)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          >
            <option value="">Seleccione...</option>
            {operaciones.map((op) => (
              <option key={op.id} value={op.id}>{op.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Vehículo</label>
          <select
            required
            disabled={!operacionId}
            value={vehiculoId ?? ""}
            onChange={(e) => setVehiculoId(Number(e.target.value) || null)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-slate-100"
          >
            <option value="">Seleccione...</option>
            {vehiculos.map((v) => (
              <option key={v.id} value={v.id}>{v.placa} ({v.tipo_vehiculo_nombre})</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Solicitud</label>
          <input
            required
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ej. Viaje adicional urgente a Medellín"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Fecha de viaje</label>
          <input
            type="date"
            required
            value={fechaViaje}
            onChange={(e) => setFechaViaje(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Producto</label>
          <input
            required
            value={producto}
            onChange={(e) => setProducto(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Origen</label>
          <select
            required
            value={origen}
            onChange={(e) => { setOrigen(e.target.value); setDestino(""); }}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          >
            <option value="">Seleccione...</option>
            {origenes.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Destino</label>
          <select
            required
            disabled={!origen}
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-slate-100"
          >
            <option value="">Seleccione...</option>
            {destinos.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Observaciones</label>
          <textarea
            rows={3}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>

        <div className="md:col-span-2 rounded-lg border border-border bg-slate-50 px-3 py-2.5 text-sm">
          {buscandoTarifa ? (
            <span className="text-neutral">Consultando tarifa...</span>
          ) : tarifaCliente !== null ? (
            <span className="font-medium text-success">Tarifa cliente: {formatCOP(tarifaCliente)}</span>
          ) : tarifaError ? (
            <span className="font-medium text-danger">{tarifaError}</span>
          ) : (
            <span className="text-neutral">Selecciona vehículo, origen y destino para ver la tarifa.</span>
          )}
        </div>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={!puedeEnviar}
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-60"
          >
            Enviar solicitud
          </button>
        </div>
      </form>
    </section>
  );
}

function TarifaForm({ solicitud, onUpdated }: { solicitud: SolicitudViajeAdicional; onUpdated: () => void }) {
  const [tarifa, setTarifa] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit() {
    const valor = Number(tarifa);
    if (!valor || valor <= 0) {
      setError("Ingresa una tarifa válida");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.actualizarTarifaSolicitudViajeAdicional(solicitud.id, valor);
      setTarifa("");
      onUpdated();
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setSaving(false);
    }
  }

  if (solicitud.tarifa_tercero != null) {
    return <span className="text-sm text-slate-900">{formatCOP(solicitud.tarifa_tercero)}</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        min={1}
        placeholder="Tarifa tercero"
        value={tarifa}
        onChange={(e) => setTarifa(e.target.value)}
        className="w-32 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
      />
      <button
        type="button"
        onClick={() => void onSubmit()}
        disabled={saving}
        className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-60"
      >
        Guardar
      </button>
      {!!error && <span className="text-xs font-medium text-danger">{error}</span>}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

/** Punto de color que resume el estado de carga del PDF: verde si ya se
 * subió, ámbar si falta. Puramente visual, no reemplaza ESTADO_GESTION_BADGE. */
function EstadoCargaDot({ cargado }: { cargado: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${cargado ? "bg-success" : "bg-warning"}`}
      title={cargado ? "Manifiesto cargado" : "Falta cargar el manifiesto"}
    />
  );
}

function ManifiestoManager({
  solicitud,
  onChanged,
  onView,
}: {
  solicitud: SolicitudViajeAdicional;
  onChanged: (updated: SolicitudViajeAdicional) => void;
  onView: (id: number) => void;
}) {
  const [numero, setNumero] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [modo, setModo] = useState<"idle" | "cambiar_pdf" | "editar_numero">("idle");
  const [editDraft, setEditDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (solicitud.tarifa_tercero == null) {
    return <span className="text-xs font-medium text-warning">Falta que el tercero ingrese la tarifa</span>;
  }

  async function subir() {
    const numeroLimpio = numero.trim();
    if (!numeroLimpio) return setError("El número de manifiesto es obligatorio");
    if (!numeroLimpio.startsWith("0")) return setError("El número de manifiesto debe empezar con cero");
    if (!file) return setError("Selecciona el PDF del manifiesto");
    setSaving(true);
    setError("");
    try {
      const updated = await api.subirManifiestoViajeAdicional(solicitud.id, file, numeroLimpio);
      setFile(null);
      setNumero("");
      setModo("idle");
      onChanged(updated);
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setSaving(false);
    }
  }

  async function guardarNumero() {
    const draft = editDraft.trim();
    if (!draft) return setError("El número de manifiesto es obligatorio");
    setSaving(true);
    setError("");
    try {
      const updated = await api.actualizarNumeroManifiestoViajeAdicional(solicitud.id, draft);
      setModo("idle");
      onChanged(updated);
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setSaving(false);
    }
  }

  async function eliminar() {
    setSaving(true);
    try {
      const updated = await api.eliminarManifiestoViajeAdicional(solicitud.id);
      onChanged(updated);
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  }

  // Sin manifiesto todavía: número + archivo + botón "Guardar" explícito.
  if (!solicitud.manifiesto && modo !== "cambiar_pdf") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <EstadoCargaDot cargado={false} />
        <input
          type="text"
          placeholder="N° manifiesto (ej. 0123456)"
          value={numero}
          onChange={(e) => { setNumero(e.target.value); setError(""); }}
          className="w-32 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="max-w-[160px] text-xs"
        />
        <button
          type="button"
          onClick={() => void subir()}
          disabled={saving}
          className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
        {!!error && <span className="text-xs font-medium text-danger">{error}</span>}
      </div>
    );
  }

  // Reemplazar el PDF (con la opción de corregir el número al tiempo).
  if (modo === "cambiar_pdf") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <EstadoCargaDot cargado={!!solicitud.manifiesto} />
        <input
          type="text"
          value={numero}
          onChange={(e) => { setNumero(e.target.value); setError(""); }}
          className="w-32 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="max-w-[160px] text-xs"
        />
        <button
          type="button"
          onClick={() => void subir()}
          disabled={saving}
          className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => { setModo("idle"); setError(""); setFile(null); }}
          className="rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
        {!!error && <span className="text-xs font-medium text-danger">{error}</span>}
      </div>
    );
  }

  // Manifiesto ya cargado: número en verde + editar/eliminar + Ver + Cambiar PDF.
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <EstadoCargaDot cargado={true} />
      {modo === "editar_numero" ? (
        <>
          <input
            type="text"
            value={editDraft}
            onChange={(e) => { setEditDraft(e.target.value); setError(""); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void guardarNumero();
              if (e.key === "Escape") { setModo("idle"); setError(""); }
            }}
            disabled={saving}
            autoFocus
            className="w-28 rounded border border-primary px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/20"
            title={error || ""}
          />
          <button type="button" disabled={saving} onClick={() => void guardarNumero()} className="rounded p-0.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50" title="Guardar">
            <CheckIcon />
          </button>
          <button type="button" onClick={() => { setModo("idle"); setError(""); }} className="rounded p-0.5 text-red-500 hover:bg-red-50" title="Cancelar">
            <XIcon />
          </button>
          {!!error && <span className="text-[10px] text-red-600 max-w-[140px] truncate" title={error}>{error}</span>}
        </>
      ) : (
        <>
          <span className="text-xs font-semibold text-emerald-700">{solicitud.manifiesto?.numero_manifiesto}</span>
          <button
            type="button"
            onClick={() => { setModo("editar_numero"); setEditDraft(solicitud.manifiesto?.numero_manifiesto || ""); setError(""); }}
            className="rounded p-0.5 text-slate-400 hover:text-primary hover:bg-slate-100 transition"
            title="Editar número de manifiesto"
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded p-0.5 text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
            title="Eliminar manifiesto"
          >
            <TrashIcon />
          </button>
          <button
            type="button"
            onClick={() => onView(solicitud.id)}
            className="rounded-full border border-border bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          >
            Ver
          </button>
          <button
            type="button"
            onClick={() => { setModo("cambiar_pdf"); setNumero(solicitud.manifiesto?.numero_manifiesto || ""); setError(""); }}
            className="rounded-full border border-border bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          >
            Cambiar PDF
          </button>
        </>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm" onClick={() => !saving && setConfirmDelete(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-red-200 bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900">Eliminar manifiesto</h3>
            <p className="mt-2 text-sm text-slate-700">
              ¿Estás seguro de que deseas eliminar el manifiesto y el viaje generado? La solicitud volverá a quedar pendiente de manifiesto.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={saving}
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void eliminar()}
                disabled={saving}
                className="rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-white hover:bg-danger/90 disabled:opacity-60"
              >
                {saving ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ViajesAdicionalesPage({ user }: Props) {
  const [solicitudes, setSolicitudes] = useState<SolicitudViajeAdicional[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const isCliente = user.rol === "CLIENTE";
  const isCointra = user.rol === "COINTRA";
  const isTercero = user.rol === "TERCERO";
  // Cointra por defecto solo ve las que ya tienen tarifa (listas para
  // manifiesto); Tercero por defecto solo ve las que le faltan por tarifar.
  const [soloListasParaMi, setSoloListasParaMi] = useState(true);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const conTarifa = isCointra ? soloListasParaMi : isTercero ? !soloListasParaMi : undefined;
      setSolicitudes(await api.solicitudesViajeAdicional({ con_tarifa: conTarifa }));
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setLoading(false);
    }
  }

  // Actualiza la fila en memoria sin recargar toda la lista: el backend deja
  // de devolver la solicitud en el próximo fetch una vez tiene manifiesto
  // (ya se gestionó y pasa al listado de Viajes), pero mientras Cointra sigue
  // en esta pantalla debe seguir viendo el número para poder corregirlo.
  function updateSolicitud(updated: SolicitudViajeAdicional) {
    setSolicitudes((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloListasParaMi]);

  if (!isCliente && !isCointra && !isTercero) {
    return (
      <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
        <p className="text-sm text-danger">No tienes acceso a este módulo.</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {isCliente && <ClienteForm onCreated={() => void loadData()} />}

      <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            {isCliente ? "Mis solicitudes" : "Solicitudes de viajes adicionales"}
          </h3>
          {(isCointra || isTercero) && (
            <label className="flex items-center gap-2 text-xs text-neutral">
              <input
                type="checkbox"
                checked={soloListasParaMi}
                onChange={(e) => setSoloListasParaMi(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
              />
              {isCointra ? "Solo con tarifa (listas para manifiesto)" : "Solo pendientes de tarifa"}
            </label>
          )}
        </div>
        {!!error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}
        {loading ? (
          <p className="text-sm text-neutral">Cargando...</p>
        ) : solicitudes.length === 0 ? (
          <p className="text-sm text-neutral">No hay solicitudes para mostrar.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                  <th className="border-b border-border px-3 py-2 text-left">Fecha viaje</th>
                  <th className="border-b border-border px-3 py-2 text-left">Solicitud</th>
                  {(isCointra || isTercero) && <th className="border-b border-border px-3 py-2 text-left">Cliente</th>}
                  <th className="border-b border-border px-3 py-2 text-left">Operación</th>
                  <th className="border-b border-border px-3 py-2 text-left">Origen → Destino</th>
                  <th className="border-b border-border px-3 py-2 text-left">Vehículo</th>
                  <th className="border-b border-border px-3 py-2 text-left">Producto</th>
                  {isCliente && <th className="border-b border-border px-3 py-2 text-left">Tarifa</th>}
                  {(isCointra || isTercero) && <th className="border-b border-border px-3 py-2 text-left">Tarifa tercero</th>}
                  <th className="border-b border-border px-3 py-2 text-left">Estado</th>
                  <th className="border-b border-border px-3 py-2 text-left">Manifiesto</th>
                </tr>
              </thead>
              <tbody>
                {solicitudes.map((s) => (
                  <tr key={s.id} className={`border-b border-border last:border-0 ${!s.manifiesto ? "bg-danger/5" : ""}`}>
                    <td className="px-3 py-2">{s.fecha_viaje}</td>
                    <td className="px-3 py-2">{s.titulo}</td>
                    {(isCointra || isTercero) && <td className="px-3 py-2">{s.cliente_nombre}</td>}
                    <td className="px-3 py-2">{s.operacion_nombre}</td>
                    <td className="px-3 py-2">{s.origen} → {s.destino}</td>
                    <td className="px-3 py-2">{s.vehiculo_placa} ({s.vehiculo_tipo_nombre})</td>
                    <td className="px-3 py-2">{s.producto}</td>
                    {isCliente && (
                      <td className="px-3 py-2">
                        {s.tarifa_cliente != null ? formatCOP(s.tarifa_cliente) : <span className="text-xs text-neutral">Pendiente</span>}
                      </td>
                    )}
                    {isCointra && (
                      <td className="px-3 py-2">
                        {s.tarifa_tercero != null ? formatCOP(s.tarifa_tercero) : <span className="text-xs text-warning">Pendiente</span>}
                      </td>
                    )}
                    {isTercero && (
                      <td className="px-3 py-2">
                        <TarifaForm solicitud={s} onUpdated={() => void loadData()} />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTADO_GESTION_BADGE[s.estado_gestion]}`}>
                        {ESTADO_GESTION_LABEL[s.estado_gestion]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {isCointra ? (
                        <ManifiestoManager solicitud={s} onChanged={updateSolicitud} onView={verManifiesto} />
                      ) : s.manifiesto ? (
                        <button
                          type="button"
                          onClick={() => verManifiesto(s.id)}
                          className="rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-medium text-success hover:bg-success/20"
                        >
                          Ver manifiesto
                        </button>
                      ) : (
                        <span className="text-xs font-medium text-danger">Sin manifiesto</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
