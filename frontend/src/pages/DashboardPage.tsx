import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ActionModal } from "../components/common/ActionModal";
import { api } from "../services/api";
import { Conciliacion, Item, Operacion, TipoVehiculo, User, Vehiculo, Viaje } from "../types";
import { formatCOP } from "../utils/formatters";

function toSpanishError(error: unknown): string {
  const message = (error as Error)?.message || "";
  if (!message) return "Ocurrio un error inesperado";
  try {
    const parsed = JSON.parse(message) as { detail?: string };
    if (parsed.detail) return parsed.detail;
  } catch {
    // No-op: mensaje plano
  }
  if (message.toLowerCase().includes("failed to fetch")) {
    return "No fue posible conectar con el servidor";
  }
  return message;
}

function parseFacturacionError(
  message: string
): { summary: string; viajesPendientes: string[]; viajeIds: number[]; recomendacion: string } | null {
  if (!message) return null;

  const normalized = message.replace(/\r\n/g, "\n").trim();
  const pendingMatch = normalized.match(/Viajes pendientes\s*\(\d+\)\s*:\s*(.+?)(?:\.\s*(?:Completa|Actualiza|Verifica)|\n|$)/i);

  if (!pendingMatch) return null;

  const viajesPendientes = pendingMatch[1]
    .split(/[,;]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (viajesPendientes.length === 0) return null;

  const viajeIds = Array.from(
    new Set(
      viajesPendientes
        .map((entry) => {
          const match = entry.match(/viaje\s*#\s*(\d+)/i);
          return match ? Number(match[1]) : null;
        })
        .filter((id): id is number => typeof id === "number" && Number.isFinite(id))
    )
  );

  const summary = normalized.split("\n")[0]?.trim() || "No se pudo generar la facturacion por datos faltantes.";
  const recommendationMatch = normalized.match(/(Completa[^\n]+|Actualiza[^\n]+|Verifica[^\n]+)$/i);

  return {
    summary,
    viajesPendientes,
    viajeIds,
    recomendacion: recommendationMatch?.[1]?.trim() || "Completa el manifiesto de esos viajes y vuelve a intentar.",
  };
}

interface EditableCellProps {
  initialValue: string;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
  type?: "text" | "number";
  className?: string;
  helperText?: string;
}

function EditableCell({ initialValue, onSave, placeholder, type = "text", className, helperText }: EditableCellProps) {
  const [value, setValue] = useState(initialValue);
  const [tabDirection, setTabDirection] = useState<-1 | 0 | 1>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  function focusSibling(direction: -1 | 1) {
    if (!inputRef.current) return;
    const focusables = Array.from(
      document.querySelectorAll<HTMLInputElement>("input[data-editable-cell='true']")
    ).filter((el) => !el.disabled && el.offsetParent !== null);
    const currentIndex = focusables.indexOf(inputRef.current);
    if (currentIndex === -1) return;
    const next = focusables[currentIndex + direction];
    if (next) next.focus();
  }

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        data-editable-cell="true"
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
            return;
          }
          if (e.key === "Tab") {
            e.preventDefault();
            setTabDirection(e.shiftKey ? -1 : 1);
            e.currentTarget.blur();
          }
        }}
        onBlur={async () => {
          if (value !== initialValue) {
            await onSave(value);
          }
          if (tabDirection !== 0) {
            const dir = tabDirection;
            setTabDirection(0);
            requestAnimationFrame(() => focusSibling(dir));
          }
        }}
        placeholder={placeholder}
        className={className}
      />
      {helperText && <p className="text-[11px] text-neutral">{helperText}</p>}
    </div>
  );
}

interface Props {
  user: User;
  operaciones: Operacion[];
  conciliaciones: Conciliacion[];
  onRefreshConciliaciones: () => Promise<void>;
  openConciliacionId?: number | null;
  onOpenConciliacionHandled?: () => void;
}

export function DashboardPage({ user, operaciones, conciliaciones, onRefreshConciliaciones, openConciliacionId, onOpenConciliacionHandled }: Props) {
  const [activeModule, setActiveModule] = useState<"viajes" | "conciliaciones">("viajes");
  const isCointraAdmin = user.rol === "COINTRA" && user.sub_rol === "COINTRA_ADMIN";
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [tiposVehiculo, setTiposVehiculo] = useState<TipoVehiculo[]>([]);
  const [viajeForm, setViajeForm] = useState({
    operacion_id: "",
    titulo: "",
    fecha_servicio: "",
    origen: "",
    destino: "",
    placa: "",
    conductor: "",
    tarifa_tercero: "",
    tarifa_cliente: "",
    descripcion: "",
  });
  const [selectedConciliacion, setSelectedConciliacion] = useState<number | null>(null);
  const [pendingViajes, setPendingViajes] = useState<Viaje[]>([]);
  const [selectedViajeIds, setSelectedViajeIds] = useState<number[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState("");
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [reviewRecipient, setReviewRecipient] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [selectedViajeDetalle, setSelectedViajeDetalle] = useState<Item | null>(null);
  const [filtroConciliacionId, setFiltroConciliacionId] = useState("");
  const [filtroConciliacionNombre, setFiltroConciliacionNombre] = useState("");
  const [filtroOperacionId, setFiltroOperacionId] = useState("");
  const [filtroConciliacionCreadaDesde, setFiltroConciliacionCreadaDesde] = useState("");
  const [filtroConciliacionCreadaHasta, setFiltroConciliacionCreadaHasta] = useState("");
  const [filtroEstadoViaje, setFiltroEstadoViaje] = useState<"TODOS" | "PENDIENTE" | "EN_REVISION" | "CONCILIADO">("TODOS");
  const [filtroEstadoConciliacion, setFiltroEstadoConciliacion] = useState<"TODOS" | "BORRADOR" | "EN_REVISION" | "APROBADA" | "ENVIADA_A_FACTURAR">("TODOS");
  const [reviewSuccessMessage, setReviewSuccessMessage] = useState("");
  const [highlightSelectedConciliacion, setHighlightSelectedConciliacion] = useState(false);
  const [clientItemSelections, setClientItemSelections] = useState<Record<number, boolean>>({});
  const [clientDecisionError, setClientDecisionError] = useState("");
  const [clientDecisionModal, setClientDecisionModal] = useState<{
    action: "aprobar" | "devolver";
    observacion: string;
    enviarCorreo: boolean;
    destinatario: string;
    mensaje: string;
  } | null>(null);
  const [facturacionPanelOpen, setFacturacionPanelOpen] = useState(false);
  const [facturacionRecipient, setFacturacionRecipient] = useState("");
  const [facturacionMessage, setFacturacionMessage] = useState("");
  const [facturacionError, setFacturacionError] = useState("");
  const [isSendingReview, setIsSendingReview] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [isSendingFacturacion, setIsSendingFacturacion] = useState(false);
  const [suggestedReviewRecipient, setSuggestedReviewRecipient] = useState("");
  const [suggestedClientReplyRecipient, setSuggestedClientReplyRecipient] = useState("");
  const [viajeEditModal, setViajeEditModal] = useState<
    { id: number; titulo: string; origen: string; destino: string } | null
  >(null);
  const [conciliacionEditModal, setConciliacionEditModal] = useState<
    { id: number; nombre: string; fecha_inicio: string; fecha_fin: string } | null
  >(null);
  const [confirmModal, setConfirmModal] = useState<
    {
      entity: "viaje" | "conciliacion";
      action: "inactivar" | "reactivar";
      id: number;
      clearSelectionOnSuccess?: boolean;
    } | null
  >(null);
  const selectedConciliacionRef = useRef<HTMLElement | null>(null);
  const reviewRecipientDirtyRef = useRef(false);
  const suggestedReviewForConciliacionRef = useRef<number | null>(null);

  const selected = conciliaciones.find((c) => c.id === selectedConciliacion) || null;
  const maxDate = new Date().toISOString().split("T")[0];
  const conciliacionById = useMemo(() => {
    return new Map(conciliaciones.map((c) => [c.id, c]));
  }, [conciliaciones]);
  const operacionById = useMemo(() => {
    return new Map(operaciones.map((op) => [op.id, op]));
  }, [operaciones]);

  const conciliacionesFiltradas = useMemo(() => {
    return conciliaciones.filter((c) => {
      const estadoLabel = getConciliacionEstadoLabel(c);
      if (filtroEstadoConciliacion !== "TODOS" && estadoLabel !== filtroEstadoConciliacion) {
        return false;
      }

      if (filtroConciliacionId && !String(c.id).includes(filtroConciliacionId.trim())) {
        return false;
      }

      if (filtroConciliacionNombre && !c.nombre.toLowerCase().includes(filtroConciliacionNombre.toLowerCase().trim())) {
        return false;
      }

      if (filtroOperacionId && c.operacion_id !== Number(filtroOperacionId)) {
        return false;
      }

      const createdDate = c.created_at ? c.created_at.slice(0, 10) : "";
      if (filtroConciliacionCreadaDesde && createdDate < filtroConciliacionCreadaDesde) {
        return false;
      }
      if (filtroConciliacionCreadaHasta && createdDate > filtroConciliacionCreadaHasta) {
        return false;
      }

      return true;
    });
  }, [
    conciliaciones,
    filtroEstadoConciliacion,
    filtroConciliacionId,
    filtroConciliacionNombre,
    filtroOperacionId,
    filtroConciliacionCreadaDesde,
    filtroConciliacionCreadaHasta,
  ]);

  const viajesFiltrados = useMemo(() => {
    return viajes.filter((v) => {
      if (filtroEstadoViaje === "TODOS") return true;
      const estadoVisible = getEstadoVisibleViaje(v);
      if (filtroEstadoViaje === "EN_REVISION") return estadoVisible === "EN REVISIÓN";
      return estadoVisible === filtroEstadoViaje;
    });
  }, [viajes, filtroEstadoViaje]);

  const viajeStatusCounts = useMemo(() => {
    const counts = {
      TODOS: viajes.length,
      PENDIENTE: 0,
      EN_REVISION: 0,
      CONCILIADO: 0,
    };
    for (const viaje of viajes) {
      const estadoVisible = getEstadoVisibleViaje(viaje);
      if (estadoVisible === "PENDIENTE") counts.PENDIENTE += 1;
      if (estadoVisible === "EN REVISIÓN") counts.EN_REVISION += 1;
      if (estadoVisible === "CONCILIADO") counts.CONCILIADO += 1;
    }
    return counts;
  }, [viajes]);

  const conciliacionStatusCounts = useMemo(() => {
    const counts = {
      TODOS: conciliaciones.length,
      BORRADOR: 0,
      EN_REVISION: 0,
      APROBADA: 0,
      ENVIADA_A_FACTURAR: 0,
    };
    for (const conciliacion of conciliaciones) {
      const estado = getConciliacionEstadoLabel(conciliacion);
      if (estado === "BORRADOR") counts.BORRADOR += 1;
      if (estado === "EN_REVISION") counts.EN_REVISION += 1;
      if (estado === "APROBADA") counts.APROBADA += 1;
      if (estado === "ENVIADA_A_FACTURAR") counts.ENVIADA_A_FACTURAR += 1;
    }
    return counts;
  }, [conciliaciones]);

  useEffect(() => {
    if (!selectedViajeDetalle) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedViajeDetalle(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedViajeDetalle]);

  useEffect(() => {
    if (!openConciliacionId) return;
    setActiveModule("conciliaciones");
    void (async () => {
      const opened = await loadItems(openConciliacionId, true);
      if (opened) {
        onOpenConciliacionHandled?.();
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openConciliacionId]);

  useEffect(() => {
    if (!selected) {
      setSuggestedReviewRecipient("");
      setSuggestedClientReplyRecipient("");
      reviewRecipientDirtyRef.current = false;
      suggestedReviewForConciliacionRef.current = null;
      return;
    }

    const selectedChanged = suggestedReviewForConciliacionRef.current !== selected.id;
    if (selectedChanged) {
      reviewRecipientDirtyRef.current = false;
    }

    if (user.rol === "COINTRA") {
      void api
        .destinatariosSugeridos(selected.id, "cliente_revision")
        .then((rows) => {
          const firstEmail = rows.find((r) => !!r.email)?.email ?? "";
          setSuggestedReviewRecipient(firstEmail);
          if (!reviewRecipientDirtyRef.current) {
            setReviewRecipient(firstEmail);
          }
          suggestedReviewForConciliacionRef.current = selected.id;
        })
        .catch(() => null);
      return;
    }

    if (user.rol === "CLIENTE") {
      void api
        .destinatariosSugeridos(selected.id, "respuesta_cliente")
        .then((rows) => {
          const firstEmail = rows.find((r) => !!r.email)?.email ?? "";
          setSuggestedClientReplyRecipient(firstEmail);
        })
        .catch(() => null);
    }
  }, [selected, user.rol]);

  function getGananciaCointra(tarifaCliente: number | null | undefined, tarifaTercero: number | null | undefined): number | null {
    if (tarifaCliente === null || tarifaCliente === undefined || tarifaTercero === null || tarifaTercero === undefined) {
      return null;
    }
    return tarifaCliente - tarifaTercero;
  }

  const totals = useMemo(() => {
    return items.reduce<{ tarifaTercero: number; tarifaCliente: number; gananciaCointra: number }>(
      (acc: { tarifaTercero: number; tarifaCliente: number; gananciaCointra: number }, item: Item) => {
        acc.tarifaTercero += item.tarifa_tercero ?? 0;
        acc.tarifaCliente += item.tarifa_cliente ?? 0;
        acc.gananciaCointra += (item.tarifa_cliente ?? 0) - (item.tarifa_tercero ?? 0);
        return acc;
      },
      { tarifaTercero: 0, tarifaCliente: 0, gananciaCointra: 0 }
    );
  }, [items]);

  const allClientItemsChecked =
    user.rol === "CLIENTE" && items.length > 0
      ? items.every((item) => clientItemSelections[item.id] === true)
      : false;
  const facturacionErrorParsed = useMemo(() => parseFacturacionError(facturacionError), [facturacionError]);

  function getEstadoVisibleViaje(viaje: Viaje): "PENDIENTE" | "EN REVISIÓN" | "CONCILIADO" {
    const estadoConciliacion = viaje.estado_conciliacion ?? null;

    if (estadoConciliacion === "EN_REVISION") return "EN REVISIÓN";
    if (estadoConciliacion === "APROBADA" || estadoConciliacion === "CERRADA" || viaje.conciliado) {
      return "CONCILIADO";
    }
    return "PENDIENTE";
  }

  function getConciliacionEstadoLabel(conciliacion: Conciliacion): string {
    if (conciliacion.enviada_facturacion && conciliacion.estado === "APROBADA") return "ENVIADA_A_FACTURAR";
    return conciliacion.estado;
  }

  function getConciliacionEstadoClasses(conciliacion: Conciliacion): string {
    const estado = getConciliacionEstadoLabel(conciliacion);
    if (estado === "BORRADOR") return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
    if (estado === "EN_REVISION") return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
    if (estado === "APROBADA") return "bg-teal-50 text-teal-800 ring-1 ring-teal-200";
    if (estado === "ENVIADA_A_FACTURAR") return "bg-sky-50 text-sky-800 ring-1 ring-sky-200";
    return "bg-lime-50 text-lime-800 ring-1 ring-lime-200";
  }

  async function loadViajes() {
    try {
      const data = await api.viajes(undefined, false);
      setViajes(data);
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  async function loadVehiculosData() {
    try {
      const [vs, ts] = await Promise.all([api.vehiculos(), api.tiposVehiculo()]);
      setVehiculos(vs);
      setTiposVehiculo(ts);
    } catch {
      // silencioso en UI de viajes; se puede gestionar mejor en pagina de vehiculos
    }
  }

  async function loadItems(conciliacionId: number, focusOnOpen = false): Promise<boolean> {
    setSelectedConciliacion(conciliacionId);
    setLoadingItems(true);
    setItems([]);
    setError("");
    try {
      const itemData = await api.items(conciliacionId);
      setItems(itemData);
      if (user.rol === "CLIENTE") {
        const initialSelections: Record<number, boolean> = {};
        for (const item of itemData) {
          initialSelections[item.id] = item.estado === "APROBADO";
        }
        setClientItemSelections(initialSelections);
      }

      const conc = conciliacionById.get(conciliacionId);
      if (conc?.estado === "BORRADOR") {
        const pending = await api.viajesPendientesConciliacion(conciliacionId);
        setPendingViajes(pending);
      } else {
        setPendingViajes([]);
      }

      setSelectedViajeIds([]);
      if (focusOnOpen) {
        window.requestAnimationFrame(() => {
          selectedConciliacionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          setHighlightSelectedConciliacion(true);
          window.setTimeout(() => setHighlightSelectedConciliacion(false), 2200);
        });
      }
      return true;
    } catch (e) {
      setError(toSpanishError(e));
      return false;
    } finally {
      setLoadingItems(false);
    }
  }

  async function createConciliacion(formData: FormData) {
    const operacion_id = Number(formData.get("operacion_id"));
    const nombre = String(formData.get("nombre") || "");
    const fecha_inicio = String(formData.get("fecha_inicio") || "");
    const fecha_fin = String(formData.get("fecha_fin") || "");

    await api.crearConciliacion({ operacion_id, nombre, fecha_inicio, fecha_fin });
    await onRefreshConciliaciones();
    setSelectedConciliacion(null);
    setItems([]);
    setPendingViajes([]);
    setSelectedViajeIds([]);
  }

  async function createViaje() {
    setError("");
    if (
      !viajeForm.operacion_id ||
      !viajeForm.titulo.trim() ||
      !viajeForm.fecha_servicio ||
      !viajeForm.origen.trim() ||
      !viajeForm.destino.trim() ||
      !viajeForm.placa ||
      !viajeForm.tarifa_tercero
    ) {
      setError("Debes completar los campos obligatorios del viaje");
      return;
    }

    const payload = {
      operacion_id: Number(viajeForm.operacion_id),
      titulo: viajeForm.titulo,
      fecha_servicio: viajeForm.fecha_servicio,
      origen: viajeForm.origen,
      destino: viajeForm.destino,
      placa: viajeForm.placa,
      conductor: viajeForm.conductor || "",
      tarifa_tercero: Number(viajeForm.tarifa_tercero || 0),
      tarifa_cliente: Number(viajeForm.tarifa_cliente || 0),
      descripcion: viajeForm.descripcion || "",
    };

    try {
      await api.crearViaje(payload);
      setViajeForm({
        operacion_id: "",
        titulo: "",
        fecha_servicio: "",
        origen: "",
        destino: "",
        placa: "",
        conductor: "",
        tarifa_tercero: "",
        tarifa_cliente: "",
        descripcion: "",
      });
      await loadViajes();
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  async function editViaje(v: Viaje) {
    if (!isCointraAdmin) return;
    setViajeEditModal({ id: v.id, titulo: v.titulo, origen: v.origen, destino: v.destino });
  }

  async function onConfirmEditViaje() {
    if (!viajeEditModal) return;
    setError("");
    try {
      await api.editarViaje(viajeEditModal.id, {
        titulo: viajeEditModal.titulo.trim(),
        origen: viajeEditModal.origen.trim(),
        destino: viajeEditModal.destino.trim(),
      });
      await loadViajes();
      setViajeEditModal(null);
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  async function deactivateViaje(v: Viaje) {
    if (!isCointraAdmin) return;
    setConfirmModal({ entity: "viaje", action: "inactivar", id: v.id });
  }

  async function reactivateViaje(v: Viaje) {
    if (!isCointraAdmin) return;
    setConfirmModal({ entity: "viaje", action: "reactivar", id: v.id });
  }

  async function editConciliacion(c: Conciliacion) {
    if (!isCointraAdmin) return;
    setConciliacionEditModal({
      id: c.id,
      nombre: c.nombre,
      fecha_inicio: c.fecha_inicio,
      fecha_fin: c.fecha_fin,
    });
  }

  async function onConfirmEditConciliacion() {
    if (!conciliacionEditModal) return;
    setError("");
    try {
      await api.editarConciliacion(conciliacionEditModal.id, {
        nombre: conciliacionEditModal.nombre.trim(),
        fecha_inicio: conciliacionEditModal.fecha_inicio.trim(),
        fecha_fin: conciliacionEditModal.fecha_fin.trim(),
      });
      await onRefreshConciliaciones();
      if (selectedConciliacion === conciliacionEditModal.id) {
        await loadItems(conciliacionEditModal.id);
      }
      setConciliacionEditModal(null);
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  async function deactivateConciliacion(c: Conciliacion) {
    if (!isCointraAdmin) return;
    setConfirmModal({
      entity: "conciliacion",
      action: "inactivar",
      id: c.id,
      clearSelectionOnSuccess: selectedConciliacion === c.id,
    });
  }

  async function reactivateConciliacion(c: Conciliacion) {
    if (!isCointraAdmin) return;
    setConfirmModal({ entity: "conciliacion", action: "reactivar", id: c.id });
  }

  async function onConfirmAction() {
    if (!confirmModal) return;
    setError("");
    try {
      if (confirmModal.entity === "viaje") {
        if (confirmModal.action === "inactivar") {
          await api.inactivarViaje(confirmModal.id);
        } else {
          await api.reactivarViaje(confirmModal.id);
        }
        await loadViajes();
        if (selected) {
          await loadItems(selected.id);
        }
      } else {
        if (confirmModal.action === "inactivar") {
          await api.inactivarConciliacion(confirmModal.id);
        } else {
          await api.reactivarConciliacion(confirmModal.id);
        }
        await onRefreshConciliaciones();
        if (confirmModal.clearSelectionOnSuccess) {
          setSelectedConciliacion(null);
          setItems([]);
        }
        await loadViajes();
      }
      setConfirmModal(null);
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  async function attachPendingViajes() {
    if (!selected || selectedViajeIds.length === 0) return;

    if (selected.estado !== "BORRADOR") {
      setError("Solo puedes adjuntar viajes cuando la conciliacion esta en BORRADOR");
      return;
    }

    await api.adjuntarViajesConciliacion(selected.id, selectedViajeIds);
    await loadItems(selected.id);
    await loadViajes();
  }

  async function removeViajeFromConciliacion(viajeId: number) {
    if (!selected) return;

    if (selected.estado !== "BORRADOR") {
      setError("Solo puedes quitar viajes cuando la conciliacion esta en BORRADOR");
      return;
    }

    setError("");
    try {
      await api.quitarViajeConciliacion(selected.id, viajeId);
      await loadItems(selected.id);
      await loadViajes();
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  function openViajeDetalle(item: Item) {
    if (item.tipo !== "VIAJE") return;
    setSelectedViajeDetalle(item);
  }

  async function sendToReview() {
    if (!selected || user.rol !== "COINTRA") return;
    setReviewError("");
    setIsSendingReview(true);
    try {
      const observacion = `Destinatario: ${reviewRecipient || "(sin destinatario)"}\nMensaje: ${reviewMessage || "(sin mensaje)"}`;
      await api.enviarRevisionConciliacion(selected.id, {
        observacion,
        destinatario_email: reviewRecipient || undefined,
        mensaje: reviewMessage || undefined,
      });
      await onRefreshConciliaciones();
      await loadItems(selected.id);
      await loadViajes();
      setShowReviewPanel(false);
      setReviewSuccessMessage("Correo enviado correctamente y usuario notificado en el sistema.");
      setReviewRecipient("");
      reviewRecipientDirtyRef.current = false;
      setReviewMessage("");
    } catch (e) {
      setReviewError(toSpanishError(e));
    } finally {
      setIsSendingReview(false);
    }
  }

  async function submitClientDecision() {
    if (!selected || !clientDecisionModal || user.rol !== "CLIENTE") return;

    const shouldApproveAll = clientDecisionModal.action === "aprobar";
    if (shouldApproveAll && !allClientItemsChecked) {
      setClientDecisionError("Para autorizar debes marcar todos los viajes como aprobados.");
      return;
    }

    if (!shouldApproveAll && !clientDecisionModal.observacion.trim()) {
      setClientDecisionError("Debes escribir observaciones para devolver la conciliación.");
      return;
    }

    setClientDecisionError("");
    try {
      for (const item of items) {
        const nextApproved = !!clientItemSelections[item.id];
        const nextEstado = nextApproved ? "APROBADO" : "RECHAZADO";
        if (item.estado !== nextEstado) {
          await api.decidirItemCliente(item.id, {
            estado: nextEstado,
            comentario: !nextApproved ? clientDecisionModal.observacion : undefined,
          });
        }
      }

      const payload = {
        observacion: clientDecisionModal.observacion || undefined,
        destinatario_email:
          clientDecisionModal.enviarCorreo && clientDecisionModal.destinatario.trim()
            ? clientDecisionModal.destinatario.trim()
            : undefined,
        mensaje:
          clientDecisionModal.enviarCorreo && clientDecisionModal.mensaje.trim()
            ? clientDecisionModal.mensaje.trim()
            : undefined,
      };

      if (shouldApproveAll) {
        await api.aprobarConciliacionCliente(selected.id, payload);
        setReviewSuccessMessage("Autorización confirmada y conciliación aprobada.");
      } else {
        await api.devolverConciliacionCliente(selected.id, payload);
        setReviewSuccessMessage("Conciliación devuelta a Cointra con observaciones.");
      }

      await onRefreshConciliaciones();
      await loadItems(selected.id);
      await loadViajes();
      setClientDecisionModal(null);
      setClientDecisionError("");
    } catch (e) {
      setClientDecisionError(toSpanishError(e));
    }
  }

  async function sendToFacturacion() {
    if (!selected || user.rol !== "COINTRA") return;

    setFacturacionError("");
    setIsSendingFacturacion(true);
    try {
      await api.enviarFacturacionConciliacion(selected.id, {
        destinatario_email: facturacionRecipient || undefined,
        mensaje: facturacionMessage || undefined,
      });
      await onRefreshConciliaciones();
      await loadItems(selected.id);
      setFacturacionPanelOpen(false);
      setFacturacionRecipient("");
      setFacturacionMessage("");
      setReviewSuccessMessage("Conciliación enviada a facturación con archivo Excel adjunto por correo.");
    } catch (e) {
      setFacturacionError(toSpanishError(e));
    } finally {
      setIsSendingFacturacion(false);
    }
  }

  async function createItem(formData: FormData) {
    if (!selected) return;
    const payload = {
      conciliacion_id: selected.id,
      tipo: String(formData.get("tipo")),
      fecha_servicio: String(formData.get("fecha_servicio")),
      origen: String(formData.get("origen") || ""),
      destino: String(formData.get("destino") || ""),
      placa: String(formData.get("placa") || ""),
      conductor: String(formData.get("conductor") || ""),
      tarifa_tercero: Number(formData.get("tarifa_tercero") || 0),
      tarifa_cliente: Number(formData.get("tarifa_cliente") || 0),
      descripcion: String(formData.get("descripcion") || ""),
    };
    await api.crearItem(payload);
    await loadItems(selected.id);
  }

  async function patchItemAndSync(
    itemId: number,
    payload: {
      manifiesto_numero?: string | null;
      remesa?: string | null;
      tarifa_tercero?: number | null;
      tarifa_cliente?: number | null;
      rentabilidad?: number | null;
    }
  ) {
    const updated = await api.patchConciliacionItem(itemId, payload);
    setItems((prev) => prev.map((item) => (item.id === itemId ? updated : item)));
  }

  useEffect(() => {
    if (activeModule === "viajes") {
      void loadViajes();
      void loadVehiculosData();
    }
    if (activeModule === "conciliaciones") {
      void loadVehiculosData();
    }
  }, [activeModule]);

  return (
    <div className="space-y-6">
      <section className="flex items-center gap-3 rounded-xl border border-border bg-white/90 p-2 shadow-sm">
        <button
          className={`inline-flex flex-1 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${
            activeModule === "viajes"
              ? "bg-primary text-white shadow-sm"
              : "bg-slate-50 text-slate-700 hover:bg-slate-100"
          }`}
          onClick={() => {
            setActiveModule("viajes");
            void loadViajes();
          }}
        >
          Modulo Viajes
        </button>
        <button
          className={`inline-flex flex-1 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${
            activeModule === "conciliaciones"
              ? "bg-primary text-white shadow-sm"
              : "bg-slate-50 text-slate-700 hover:bg-slate-100"
          }`}
          onClick={() => setActiveModule("conciliaciones")}
        >
          Modulo Conciliaciones
        </button>
      </section>

      {activeModule === "viajes" && (
        <>
          <div className="grid gap-6">
            {user.rol !== "CLIENTE" && (
            <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-slate-900">Cargar viaje</h3>
              <form
                onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  await createViaje();
                }}
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Operación
                    </label>
                    <select
                      name="operacion_id"
                      required
                      value={viajeForm.operacion_id}
                      onChange={(e) =>
                        setViajeForm((prev) => ({ ...prev, operacion_id: e.target.value }))
                      }
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                    >
                      <option value="">Seleccione...</option>
                      {operaciones.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Título del viaje
                    </label>
                    <input
                      name="titulo"
                      required
                      value={viajeForm.titulo}
                      onChange={(e) => setViajeForm((prev) => ({ ...prev, titulo: e.target.value }))}
                      placeholder="Ej. Urbano Montevideo"
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Fecha
                    </label>
                    <input
                      name="fecha_servicio"
                      type="date"
                      required
                      max={maxDate}
                      value={viajeForm.fecha_servicio}
                      onChange={(e) =>
                        setViajeForm((prev) => ({ ...prev, fecha_servicio: e.target.value }))
                      }
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Origen
                    </label>
                    <input
                      name="origen"
                      required
                      value={viajeForm.origen}
                      onChange={(e) => setViajeForm((prev) => ({ ...prev, origen: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Destino
                    </label>
                    <input
                      name="destino"
                      required
                      value={viajeForm.destino}
                      onChange={(e) => setViajeForm((prev) => ({ ...prev, destino: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Placa
                    </label>
                    <select
                      name="placa"
                      required
                      value={viajeForm.placa}
                      onChange={(e) => setViajeForm((prev) => ({ ...prev, placa: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                    >
                      <option value="">Seleccione un vehículo...</option>
                      {vehiculos.map((v) => (
                        <option key={v.id} value={v.placa}>
                          {v.placa}
                        </option>
                      ))}
                    </select>
                    {viajeForm.placa && (
                      <p className="mt-1 text-xs text-neutral">
                        Tipo de vehículo:{" "}
                        <span className="font-medium text-slate-900">
                          {(() => {
                            const vehiculo = vehiculos.find((v) => v.placa === viajeForm.placa);
                            if (!vehiculo) return "Sin información";
                            const tipo = tiposVehiculo.find((t) => t.id === vehiculo.tipo_vehiculo_id);
                            return tipo?.nombre ?? "Sin información";
                          })()}
                        </span>
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Conductor (opcional)
                    </label>
                    <input
                      name="conductor"
                      value={viajeForm.conductor}
                      onChange={(e) => setViajeForm((prev) => ({ ...prev, conductor: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Tarifa Tercero
                    </label>
                    <input
                      name="tarifa_tercero"
                      type="number"
                      required
                      value={viajeForm.tarifa_tercero}
                      onChange={(e) =>
                        setViajeForm((prev) => ({ ...prev, tarifa_tercero: e.target.value }))
                      }
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                  {user.rol !== "TERCERO" && (
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                        Tarifa Cliente (opcional)
                      </label>
                      <input
                        name="tarifa_cliente"
                        type="number"
                        value={viajeForm.tarifa_cliente}
                        onChange={(e) =>
                          setViajeForm((prev) => ({ ...prev, tarifa_cliente: e.target.value }))
                        }
                        className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                  )}

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Descripción
                    </label>
                    <input
                      name="descripcion"
                      value={viajeForm.descripcion}
                      onChange={(e) =>
                        setViajeForm((prev) => ({ ...prev, descripcion: e.target.value }))
                      }
                      placeholder="Observaciones del viaje"
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
                >
                  Guardar viaje
                </button>
              </form>
            </section>
            )}

            <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Viajes cargados</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    ["TODOS", `Todos (${viajeStatusCounts.TODOS})`],
                    ["PENDIENTE", `Pendiente (${viajeStatusCounts.PENDIENTE})`],
                    ["EN_REVISION", `En revisión (${viajeStatusCounts.EN_REVISION})`],
                    ["CONCILIADO", `Conciliado (${viajeStatusCounts.CONCILIADO})`],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFiltroEstadoViaje(value as "TODOS" | "PENDIENTE" | "EN_REVISION" | "CONCILIADO")}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        filtroEstadoViaje === value
                          ? "bg-emerald-600 text-white"
                          : "border border-border bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                      <th className="border-b border-border px-3 py-2 text-left">ID</th>
                      <th className="border-b border-border px-3 py-2 text-left">Fecha</th>
                      <th className="border-b border-border px-3 py-2 text-left">Título</th>
                      <th className="border-b border-border px-3 py-2 text-left">Operación</th>
                      <th className="border-b border-border px-3 py-2 text-left">Ruta</th>
                      <th className="border-b border-border px-3 py-2 text-left">Placa</th>
                      <th className="border-b border-border px-3 py-2 text-left">Estado</th>
                      {isCointraAdmin && (
                        <th className="border-b border-border px-3 py-2 text-left">Activo</th>
                      )}
                      <th className="border-b border-border px-3 py-2 text-left">Conciliación</th>
                      {user.rol !== "CLIENTE" && (
                        <th className="border-b border-border px-3 py-2 text-left">Tarifa Tercero</th>
                      )}
                      {user.rol !== "TERCERO" && (
                        <th className="border-b border-border px-3 py-2 text-left">Tarifa Cliente</th>
                      )}
                      {user.rol === "COINTRA" && (
                        <th className="border-b border-border px-3 py-2 text-left">Ganancia Cointra</th>
                      )}
                      {isCointraAdmin && (
                        <th className="border-b border-border px-3 py-2 text-left">Acciones</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {viajesFiltrados.map((v) => (
                      <tr key={v.id} className="border-b border-border last:border-0">
                        {(() => {
                          const estadoVisible = getEstadoVisibleViaje(v);
                          const conc = v.conciliacion_id ? conciliacionById.get(v.conciliacion_id) : undefined;
                          const estadoClass =
                            estadoVisible === "CONCILIADO"
                              ? "bg-success/10 text-success"
                              : estadoVisible === "EN REVISIÓN"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-600";
                          return (
                            <>
                        <td className="px-3 py-2">{v.id}</td>
                        <td className="px-3 py-2">{v.fecha_servicio}</td>
                        <td className="px-3 py-2">{v.titulo}</td>
                        <td className="px-3 py-2">{operacionById.get(v.operacion_id)?.nombre ?? `Operación #${v.operacion_id}`}</td>
                        <td className="px-3 py-2">
                          {v.origen} - {v.destino}
                        </td>
                        <td className="px-3 py-2">{v.placa}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${estadoClass}`}>
                            {estadoVisible}
                          </span>
                        </td>
                        {isCointraAdmin && (
                          <td className="px-3 py-2">{v.activo ? "Sí" : "No"}</td>
                        )}
                        <td className="px-3 py-2">
                          {v.conciliacion_id ? (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveModule("conciliaciones");
                                void loadItems(v.conciliacion_id as number, true);
                              }}
                              className="text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                            >
                              {conc ? `${conc.nombre} (#${conc.id})` : `Conciliación #${v.conciliacion_id}`}
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        {user.rol !== "CLIENTE" && (
                          <td className="px-3 py-2">
                            {formatCOP(v.tarifa_tercero)}
                          </td>
                        )}
                        {user.rol !== "TERCERO" && (
                          <td className="px-3 py-2">
                            {formatCOP(v.tarifa_cliente)}
                          </td>
                        )}
                        {user.rol === "COINTRA" && (
                          <td className="px-3 py-2">
                            {formatCOP(getGananciaCointra(v.tarifa_cliente, v.tarifa_tercero))}
                          </td>
                        )}
                        {isCointraAdmin && (
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void editViaje(v)}
                                className="rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Editar
                              </button>
                              {v.activo && (
                                <button
                                  type="button"
                                  onClick={() => void deactivateViaje(v)}
                                  className="rounded-full border border-danger/40 bg-danger/5 px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                                >
                                  Inactivar
                                </button>
                              )}
                              {!v.activo && (
                                <button
                                  type="button"
                                  onClick={() => void reactivateViaje(v)}
                                  className="rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-medium text-success hover:bg-success/20"
                                >
                                  Reactivar
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                            </>
                          );
                        })()}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}

      {activeModule === "conciliaciones" && (
        <>
          <div className="grid gap-6">
            {user.rol === "COINTRA" && (
              <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
                <h3 className="mb-4 text-sm font-semibold text-slate-900">Nueva conciliación</h3>
                <form
                  onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    try {
                      setError("");
                      await createConciliacion(new FormData(form));
                      form.reset();
                    } catch (err) {
                      setError(toSpanishError(err));
                    }
                  }}
                >
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                        Operación
                      </label>
                      <select
                        name="operacion_id"
                        required
                        className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                      >
                        <option value="">Seleccione...</option>
                        {operaciones.map((op) => (
                          <option key={op.id} value={op.id}>
                            {op.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                        Nombre
                      </label>
                      <input
                        name="nombre"
                        required
                        placeholder="Segunda quincena febrero"
                        className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                        Fecha inicio
                      </label>
                      <input
                        name="fecha_inicio"
                        type="date"
                        required
                        className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                        Fecha fin
                      </label>
                      <input
                        name="fecha_fin"
                        type="date"
                        required
                        className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
                  >
                    Crear
                  </button>
                </form>
              </section>
            )}

            <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Conciliaciones</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    ["TODOS", `Todos (${conciliacionStatusCounts.TODOS})`],
                    ["BORRADOR", `Borrador (${conciliacionStatusCounts.BORRADOR})`],
                    ["EN_REVISION", `En revisión (${conciliacionStatusCounts.EN_REVISION})`],
                    ["APROBADA", `Aprobada (${conciliacionStatusCounts.APROBADA})`],
                    ["ENVIADA_A_FACTURAR", `Enviada a facturar (${conciliacionStatusCounts.ENVIADA_A_FACTURAR})`],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setFiltroEstadoConciliacion(
                          value as "TODOS" | "BORRADOR" | "EN_REVISION" | "APROBADA" | "ENVIADA_A_FACTURAR"
                        )
                      }
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        filtroEstadoConciliacion === value
                          ? "bg-emerald-600 text-white"
                          : "border border-border bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                <input
                  value={filtroConciliacionId}
                  onChange={(e) => setFiltroConciliacionId(e.target.value)}
                  placeholder="Filtrar por número"
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
                <input
                  value={filtroConciliacionNombre}
                  onChange={(e) => setFiltroConciliacionNombre(e.target.value)}
                  placeholder="Filtrar por nombre"
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
                <select
                  value={filtroOperacionId}
                  onChange={(e) => setFiltroOperacionId(e.target.value)}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                >
                  <option value="">Todas las operaciones</option>
                  {operaciones.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.nombre}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={filtroConciliacionCreadaDesde}
                  onChange={(e) => setFiltroConciliacionCreadaDesde(e.target.value)}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  title="Creada desde"
                />
                <input
                  type="date"
                  value={filtroConciliacionCreadaHasta}
                  onChange={(e) => setFiltroConciliacionCreadaHasta(e.target.value)}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  title="Creada hasta"
                />
                <button
                  type="button"
                  onClick={() => {
                    setFiltroConciliacionId("");
                    setFiltroConciliacionNombre("");
                    setFiltroOperacionId("");
                    setFiltroConciliacionCreadaDesde("");
                    setFiltroConciliacionCreadaHasta("");
                    setFiltroEstadoConciliacion("TODOS");
                  }}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Limpiar filtros
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                      <th className="border-b border-border px-3 py-2 text-left">ID</th>
                      <th className="border-b border-border px-3 py-2 text-left">Nombre</th>
                      <th className="border-b border-border px-3 py-2 text-left">Operación</th>
                      <th className="border-b border-border px-3 py-2 text-left">Cliente</th>
                      <th className="border-b border-border px-3 py-2 text-left">Tercero</th>
                      <th className="border-b border-border px-3 py-2 text-left">Creada por</th>
                      <th className="border-b border-border px-3 py-2 text-left">Estado</th>
                      <th className="border-b border-border px-3 py-2 text-left">Usuario estado</th>
                      <th className="border-b border-border px-3 py-2 text-left">Periodo</th>
                      <th className="border-b border-border px-3 py-2 text-left">Creada</th>
                      {isCointraAdmin && (
                        <th className="border-b border-border px-3 py-2 text-left">Activo</th>
                      )}
                      <th className="border-b border-border px-3 py-2 text-left">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conciliacionesFiltradas.map((c) => (
                      <tr key={c.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">{c.id}</td>
                        <td className="px-3 py-2">{c.nombre}</td>
                        <td className="px-3 py-2">{operacionById.get(c.operacion_id)?.nombre ?? `Operación #${c.operacion_id}`}</td>
                        <td className="px-3 py-2">{c.cliente_nombre ?? "-"}</td>
                        <td className="px-3 py-2">{c.tercero_nombre ?? "-"}</td>
                        <td className="px-3 py-2">{c.creador_nombre ?? `Usuario #${c.created_by}`}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${getConciliacionEstadoClasses(c)}`}>
                            {getConciliacionEstadoLabel(c).toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2">{c.estado_actualizado_por_nombre ?? "-"}</td>
                        <td className="px-3 py-2">
                          {c.fecha_inicio} - {c.fecha_fin}
                        </td>
                        <td className="px-3 py-2">{c.created_at?.slice(0, 10) ?? "-"}</td>
                        {isCointraAdmin && <td className="px-3 py-2">{c.activo ? "Sí" : "No"}</td>}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => loadItems(c.id, true)}
                              className="inline-flex items-center rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                            >
                              Ver items
                            </button>
                            {isCointraAdmin && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void editConciliacion(c)}
                                  className="inline-flex items-center rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                                >
                                  Editar
                                </button>
                                {c.activo && (
                                  <button
                                    type="button"
                                    onClick={() => void deactivateConciliacion(c)}
                                    className="inline-flex items-center rounded-full border border-danger/40 bg-danger/5 px-3 py-1.5 text-xs font-medium text-danger shadow-sm hover:bg-danger/10"
                                  >
                                    Inactivar
                                  </button>
                                )}
                                {!c.activo && (
                                  <button
                                    type="button"
                                    onClick={() => void reactivateConciliacion(c)}
                                    className="inline-flex items-center rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-medium text-success shadow-sm hover:bg-success/20"
                                  >
                                    Reactivar
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

      {selected && (
        <section
          ref={selectedConciliacionRef}
          className={`space-y-6 rounded-2xl border bg-white/90 p-5 shadow-sm transition-all duration-300 ${
            highlightSelectedConciliacion ? "border-emerald-300 ring-4 ring-emerald-100" : "border-border"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-teal-50 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Conciliación</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                {selected.nombre} ({items.filter((item) => item.tipo === "VIAJE").length} viajes)
              </h2>
              <p className="mt-1 text-sm text-neutral">
                #{selected.id} · {selected.fecha_inicio} a {selected.fecha_fin}
              </p>
              <p className="mt-1 text-sm font-semibold text-emerald-800">
                Operación: {operacionById.get(selected.operacion_id)?.nombre ?? `Operación #${selected.operacion_id}`}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Cliente: {selected.cliente_nombre ?? "-"} · Tercero: {selected.tercero_nombre ?? "-"}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Creada por: {selected.creador_nombre ?? `Usuario #${selected.created_by}`}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Estado actualizado por: {selected.estado_actualizado_por_nombre ?? "-"}
              </p>
            </div>
            <span className={`inline-flex rounded-full px-4 py-2 text-sm font-bold uppercase tracking-wide shadow-sm ${getConciliacionEstadoClasses(selected)}`}>
              {getConciliacionEstadoLabel(selected).split("_").join(" ")}
            </span>
          </div>

          {user.rol === "COINTRA" && pendingViajes.length > 0 && (
            <>
              <div>
                <h3 className="mb-1 text-sm font-semibold text-slate-900">
                  Viajes pendientes por conciliar
                </h3>
                <p className="text-xs text-neutral">
                  {pendingViajes.length} viajes pendientes en la operación
                </p>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-neutral">
                  Selecciona los viajes que deseas adjuntar a esta conciliación.
                </span>
                <button
                  type="button"
                  onClick={attachPendingViajes}
                  disabled={selectedViajeIds.length === 0}
                  className="inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition enabled:hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Adjuntar seleccionados ({selectedViajeIds.length})
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                      <th className="border-b border-border px-3 py-2 text-left" />
                      <th className="border-b border-border px-3 py-2 text-left">ID</th>
                      <th className="border-b border-border px-3 py-2 text-left">Fecha</th>
                      <th className="border-b border-border px-3 py-2 text-left">Ruta</th>
                      <th className="border-b border-border px-3 py-2 text-left">Placa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingViajes.map((v) => (
                      <tr key={v.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedViajeIds.includes(v.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedViajeIds((prev) => [...prev, v.id]);
                              } else {
                                setSelectedViajeIds((prev) => prev.filter((id) => id !== v.id));
                              }
                            }}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
                          />
                        </td>
                        <td className="px-3 py-2">{v.id}</td>
                        <td className="px-3 py-2">{v.fecha_servicio}</td>
                        <td className="px-3 py-2">
                          {v.origen} - {v.destino}
                        </td>
                        <td className="px-3 py-2">{v.placa}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">
              Viajes e ítems en esta conciliación
            </h3>
            <p className="text-xs text-neutral">
              Listado de ítems asociados a la conciliación #{selected.id}.
            </p>
          </div>
          {user.rol === "COINTRA" && selected.estado === "BORRADOR" && (
            <div className="rounded-xl border border-border bg-slate-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Flujo de revisión</p>
                  <p className="text-xs text-neutral">
                    Envía la conciliación al cliente para revisión. Los viajes seguirán en estado PENDIENTE hasta aprobación.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReviewPanel((prev) => !prev)}
                  className="inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/90"
                >
                  Enviar a revisión
                </button>
              </div>
              {showReviewPanel && (
                isSendingReview ? (
                  <div className="mt-4 flex flex-col items-center gap-4 rounded-xl border border-border bg-white/70 py-8">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
                    <p className="text-sm font-medium text-slate-700">Enviando correo al cliente, por favor espera…</p>
                    <div className="w-full max-w-xs space-y-2 px-6">
                      <div className="h-3 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-4/5 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-3/5 animate-pulse rounded bg-slate-200" />
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="grid gap-3 md:grid-cols-[minmax(260px,1.1fr),minmax(260px,1.4fr),auto]">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                          Enviar a
                        </label>
                        <input
                          type="text"
                          value={reviewRecipient}
                          onChange={(e) => {
                            reviewRecipientDirtyRef.current = true;
                            setReviewRecipient(e.target.value);
                          }}
                          placeholder="correo1@empresa.com, correo2@empresa.com"
                          className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                        />
                        <p className="mt-1 text-[11px] text-neutral">
                          Puedes escribir varios correos separados por coma o punto y coma.
                        </p>
                        {suggestedReviewRecipient && (
                          <p className="mt-1 text-[11px] text-emerald-700">Sugerido: {suggestedReviewRecipient}</p>
                        )}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                          Mensaje
                        </label>
                        <input
                          value={reviewMessage}
                          onChange={(e) => setReviewMessage(e.target.value)}
                          placeholder="Mensaje para el cliente"
                          className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => void sendToReview()}
                          disabled={isSendingReview}
                          className="w-full rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-success/90 disabled:opacity-60"
                        >
                          Confirmar envío
                        </button>
                      </div>
                    </div>
                    {reviewError && (
                      <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm font-medium text-danger">{reviewError}</p>
                    )}
                  </div>
                )
              )}
            </div>
          )}
          {user.rol === "COINTRA" && selected.estado === "APROBADA" && !selected.enviada_facturacion && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Enviar a facturación</p>
                  <p className="text-xs text-neutral">
                    Envía correo interno con Excel adjunto y marca la conciliación como enviada a facturar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFacturacionPanelOpen((prev) => !prev)}
                  className="inline-flex items-center rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700"
                >
                  Enviar a facturar
                </button>
              </div>
              {facturacionPanelOpen && (
                isSendingFacturacion ? (
                  <div className="mt-4 flex flex-col items-center gap-4 rounded-xl border border-sky-200 bg-white/70 py-8">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
                    <p className="text-sm font-medium text-slate-700">Generando Excel y enviando correo, por favor espera…</p>
                    <div className="w-full max-w-xs space-y-2 px-6">
                      <div className="h-3 animate-pulse rounded bg-sky-100" />
                      <div className="h-3 w-4/5 animate-pulse rounded bg-sky-100" />
                      <div className="h-3 w-3/5 animate-pulse rounded bg-sky-100" />
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="grid gap-3 md:grid-cols-[minmax(260px,1.1fr),minmax(260px,1.4fr),auto]">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                          Correos de destino
                        </label>
                        <input
                          type="text"
                          value={facturacionRecipient}
                          onChange={(e) => setFacturacionRecipient(e.target.value)}
                          placeholder="correo1@empresa.com; correo2@empresa.com"
                          className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                        />
                        <p className="mt-1 text-[11px] text-neutral">
                          Puedes escribir varios correos separados por coma o punto y coma.
                        </p>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                          Mensaje
                        </label>
                        <input
                          value={facturacionMessage}
                          onChange={(e) => setFacturacionMessage(e.target.value)}
                          placeholder="Mensaje interno para facturación"
                          className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => void sendToFacturacion()}
                          disabled={isSendingFacturacion}
                          className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
                        >
                          Confirmar envío
                        </button>
                      </div>
                    </div>
                    {facturacionError && (
                      <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                        {facturacionErrorParsed ? (
                          <>
                            <p className="font-semibold">{facturacionErrorParsed.summary}</p>
                            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-danger/80">Viajes pendientes</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {facturacionErrorParsed.viajesPendientes.map((viaje, index) => (
                                <span
                                  key={`${viaje}-${index}`}
                                  className="inline-flex items-center rounded-full border border-danger/30 bg-white px-2.5 py-1 text-xs font-semibold text-danger shadow-sm"
                                >
                                  {viaje}
                                </span>
                              ))}
                            </div>
                            <p className="mt-2 text-sm">{facturacionErrorParsed.recomendacion}</p>
                            <p className="mt-1 text-xs text-danger/80">
                              Ya puedes corregir el manifiesto en esos viajes y volver a confirmar el envío.
                            </p>
                          </>
                        ) : (
                          <p className="font-medium">{facturacionError}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}
          {user.rol === "COINTRA" && selected.estado === "BORRADOR" && (
            <form
              className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]"
              onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                try {
                  await createItem(new FormData(e.currentTarget));
                  e.currentTarget.reset();
                } catch (err) {
                  setError(toSpanishError(err));
                }
              }}
            >
            <select
              name="tipo"
              defaultValue="VIAJE"
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            >
              <option value="VIAJE">VIAJE</option>
              <option value="PEAJE">PEAJE</option>
              <option value="HORA_EXTRA">HORA_EXTRA</option>
              <option value="VIAJE_EXTRA">VIAJE_EXTRA</option>
              <option value="ESTIBADA">ESTIBADA</option>
              <option value="CONDUCTOR_RELEVO">CONDUCTOR_RELEVO</option>
              <option value="OTRO">OTRO</option>
            </select>
            <input
              name="fecha_servicio"
              type="date"
              required
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <input
              name="origen"
              placeholder="Origen"
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <input
              name="destino"
              placeholder="Destino"
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <select
              name="placa"
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            >
              <option value="">Seleccione placa...</option>
              {vehiculos.map((veh) => (
                <option key={veh.id} value={veh.placa}>
                  {veh.placa}
                </option>
              ))}
            </select>
            <input
              name="conductor"
              placeholder="Conductor"
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <input
              name="tarifa_tercero"
              type="number"
              placeholder="Tarifa tercero"
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <input
              name="tarifa_cliente"
              type="number"
              placeholder="Tarifa cliente"
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <input
              name="descripcion"
              placeholder="Descripcion"
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            {user.rol === "COINTRA" && (
              <button
                type="submit"
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
              >
                Agregar item
              </button>
            )}
            </form>
          )}

          {loadingItems ? (
            <p className="text-sm text-neutral">Cargando items...</p>
          ) : (
            <>
              {error && <p className="text-sm font-medium text-danger">{error}</p>}
              {user.rol === "COINTRA" && selected.estado === "BORRADOR" && (
                <p className="text-xs text-neutral">
                  Puedes editar manualmente el manifiesto para los items de tipo VIAJE.
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                      <th className="border-b border-border px-3 py-2 text-left">ID</th>
                      <th className="border-b border-border px-3 py-2 text-left">Tipo</th>
                      <th className="border-b border-border px-3 py-2 text-left">Estado</th>
                      <th className="border-b border-border px-3 py-2 text-left">Fecha</th>
                      <th className="border-b border-border px-3 py-2 text-left">Origen</th>
                      <th className="border-b border-border px-3 py-2 text-left">Destino</th>
                      <th className="border-b border-border px-3 py-2 text-left">Placa</th>
                      {user.rol === "CLIENTE" && selected.estado === "EN_REVISION" && (
                        <th className="border-b border-border px-3 py-2 text-center">
                          <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={allClientItemsChecked}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                const next: Record<number, boolean> = {};
                                for (const it of items) {
                                  next[it.id] = checked;
                                }
                                setClientItemSelections(next);
                              }}
                              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
                            />
                            Aprobar todos
                          </label>
                        </th>
                      )}
                      {(
                        <>
                          <th className="border-b border-border px-3 py-2 text-left">Manifiesto</th>
                        </>
                      )}
                      {user.rol !== "CLIENTE" && (
                        <th className="border-b border-border px-3 py-2 text-left">Tarifa Tercero</th>
                      )}
                      {user.rol !== "TERCERO" && (
                        <th className="border-b border-border px-3 py-2 text-left">Tarifa Cliente</th>
                      )}
                      {user.rol === "COINTRA" && (
                        <th className="border-b border-border px-3 py-2 text-left">Ganancia Cointra</th>
                      )}
                      {user.rol === "COINTRA" && (
                        <th className="border-b border-border px-3 py-2 text-left">Rentabilidad %</th>
                      )}
                      {user.rol === "COINTRA" && selected.estado === "BORRADOR" && (
                        <th className="border-b border-border px-3 py-2 text-left">Acciones</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          {item.tipo === "VIAJE" && item.viaje_id ? (
                            <button
                              type="button"
                              onClick={() => openViajeDetalle(item)}
                              className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
                            >
                              {item.viaje_id}
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-3 py-2">{item.tipo}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                            {item.estado.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2">{item.fecha_servicio}</td>
                        <td className="px-3 py-2">{item.origen || "-"}</td>
                        <td className="px-3 py-2">{item.destino || "-"}</td>
                        <td className="px-3 py-2">{item.placa || "-"}</td>
                        {user.rol === "CLIENTE" && selected.estado === "EN_REVISION" && (
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={!!clientItemSelections[item.id]}
                              onChange={(e) =>
                                setClientItemSelections((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.checked,
                                }))
                              }
                              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
                            />
                          </td>
                        )}
                        {
                          <>
                            <td className="px-3 py-2">
                              {item.tipo === "VIAJE" &&
                              user.rol === "COINTRA" &&
                              (selected.estado === "BORRADOR" ||
                                (selected.estado === "APROBADA" &&
                                  !!facturacionErrorParsed &&
                                  !!item.viaje_id &&
                                  facturacionErrorParsed.viajeIds.includes(item.viaje_id))) ? (
                                <EditableCell
                                  initialValue={item.manifiesto_numero ?? ""}
                                  onSave={async (val) => {
                                    await patchItemAndSync(item.id, { manifiesto_numero: val });
                                  }}
                                  placeholder="MNF-..."
                                  className="w-32 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                                />
                              ) : (
                                item.manifiesto_numero || "-"
                              )}
                            </td>
                          </>
                        }
                        {user.rol !== "CLIENTE" && (
                          <td className="px-3 py-2">
                            {user.rol === "COINTRA" && selected.estado === "BORRADOR" ? (
                              <EditableCell
                                initialValue={String(item.tarifa_tercero ?? "")}
                                type="number"
                                onSave={async (val) => {
                                  await patchItemAndSync(item.id, { tarifa_tercero: Number(val) });
                                }}
                                placeholder="0"
                                helperText={
                                  item.tarifa_tercero !== null && item.tarifa_tercero !== undefined
                                    ? `Actual: ${formatCOP(item.tarifa_tercero)}`
                                    : "Actual: -"
                                }
                                className="w-28 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                              />
                            ) : (
                              formatCOP(item.tarifa_tercero)
                            )}
                          </td>
                        )}
                        {user.rol !== "TERCERO" && (
                          <td className="px-3 py-2">
                            {user.rol === "COINTRA" && selected.estado === "BORRADOR" ? (
                              <EditableCell
                                initialValue={String(item.tarifa_cliente ?? "")}
                                type="number"
                                onSave={async (val) => {
                                  await patchItemAndSync(item.id, { tarifa_cliente: Number(val) });
                                }}
                                placeholder="0"
                                helperText={
                                  item.tarifa_cliente !== null && item.tarifa_cliente !== undefined
                                    ? `Actual: ${formatCOP(item.tarifa_cliente)}`
                                    : "Actual: -"
                                }
                                className="w-28 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                              />
                            ) : (
                              formatCOP(item.tarifa_cliente)
                            )}
                          </td>
                        )}
                        {user.rol === "COINTRA" && (
                          <td className="px-3 py-2">
                            {formatCOP(getGananciaCointra(item.tarifa_cliente, item.tarifa_tercero))}
                          </td>
                        )}
                        {user.rol === "COINTRA" && (
                          <td className="px-3 py-2">
                            {selected.estado === "BORRADOR" ? (
                              <div className="space-y-1">
                                <EditableCell
                                  initialValue={String(item.rentabilidad ?? "")}
                                  type="number"
                                  onSave={async (val) => {
                                    await patchItemAndSync(item.id, { rentabilidad: Number(val) });
                                  }}
                                  placeholder="%"
                                  className="w-20 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                                />
                                <p className="text-[11px] text-neutral">
                                  Valor: {formatCOP(getGananciaCointra(item.tarifa_cliente, item.tarifa_tercero))}
                                </p>
                              </div>
                            ) : (
                              <>
                                <span>
                                  {item.rentabilidad !== null && item.rentabilidad !== undefined
                                    ? `${formatCOP(item.rentabilidad)} %`
                                    : "-"}
                                </span>
                                <p className="text-[11px] text-neutral">
                                  Valor: {formatCOP(getGananciaCointra(item.tarifa_cliente, item.tarifa_tercero))}
                                </p>
                              </>
                            )}
                          </td>
                        )}
                        {user.rol === "COINTRA" && selected.estado === "BORRADOR" && (
                          <td className="px-3 py-2">
                            {item.tipo === "VIAJE" && item.viaje_id ? (
                              <button
                                type="button"
                                onClick={() => void removeViajeFromConciliacion(item.viaje_id as number)}
                                className="inline-flex items-center rounded-full border border-danger/30 bg-danger/5 px-2.5 py-1 text-xs font-semibold text-danger transition hover:bg-danger/10"
                              >
                                Quitar
                              </button>
                            ) : (
                              "-"
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-slate-900">
                {user.rol === "TERCERO" && (
                  <span>Total a cobrar: {formatCOP(totals.tarifaTercero)}</span>
                )}
                {user.rol === "CLIENTE" && (
                  <span>Total a pagar: {formatCOP(totals.tarifaCliente)}</span>
                )}
                {user.rol === "COINTRA" && (
                  <span>Total Tercero: {formatCOP(totals.tarifaTercero)}</span>
                )}
                {user.rol === "COINTRA" && (
                  <span>Total Cliente: {formatCOP(totals.tarifaCliente)}</span>
                )}
                {user.rol === "COINTRA" && (
                  <span>Total Ganancia Cointra: {formatCOP(totals.gananciaCointra)}</span>
                )}
              </div>
              {user.rol === "CLIENTE" && selected.estado === "EN_REVISION" && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setClientDecisionModal({
                        action: "aprobar",
                        observacion: "",
                        enviarCorreo: false,
                        destinatario: suggestedClientReplyRecipient,
                        mensaje: "",
                      })
                    }
                    onMouseDown={() => setClientDecisionError("")}
                    className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-success/90"
                  >
                    Confirmar autorización
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setClientDecisionModal({
                        action: "devolver",
                        observacion: "",
                        enviarCorreo: true,
                        destinatario: suggestedClientReplyRecipient,
                        mensaje: "",
                      })
                    }
                    onMouseDown={() => setClientDecisionError("")}
                    className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-semibold text-amber-800 shadow-sm transition hover:bg-warning/20"
                  >
                    Devolver a Cointra
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
      </>
      )}

      <ActionModal
        open={!!viajeEditModal}
        title={viajeEditModal ? `Editar viaje #${viajeEditModal.id}` : "Editar viaje"}
        confirmText="Guardar cambios"
        onClose={() => setViajeEditModal(null)}
        onConfirm={onConfirmEditViaje}
      >
        <input
          value={viajeEditModal?.titulo ?? ""}
          onChange={(e) =>
            setViajeEditModal((prev) => (prev ? { ...prev, titulo: e.target.value } : prev))
          }
          placeholder="Título"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
        <input
          value={viajeEditModal?.origen ?? ""}
          onChange={(e) =>
            setViajeEditModal((prev) => (prev ? { ...prev, origen: e.target.value } : prev))
          }
          placeholder="Origen"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
        <input
          value={viajeEditModal?.destino ?? ""}
          onChange={(e) =>
            setViajeEditModal((prev) => (prev ? { ...prev, destino: e.target.value } : prev))
          }
          placeholder="Destino"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
      </ActionModal>

      <ActionModal
        open={!!conciliacionEditModal}
        title={
          conciliacionEditModal
            ? `Editar conciliación #${conciliacionEditModal.id}`
            : "Editar conciliación"
        }
        confirmText="Guardar cambios"
        onClose={() => setConciliacionEditModal(null)}
        onConfirm={onConfirmEditConciliacion}
      >
        <input
          value={conciliacionEditModal?.nombre ?? ""}
          onChange={(e) =>
            setConciliacionEditModal((prev) => (prev ? { ...prev, nombre: e.target.value } : prev))
          }
          placeholder="Nombre"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
        <input
          value={conciliacionEditModal?.fecha_inicio ?? ""}
          onChange={(e) =>
            setConciliacionEditModal((prev) =>
              prev ? { ...prev, fecha_inicio: e.target.value } : prev
            )
          }
          type="date"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
        <input
          value={conciliacionEditModal?.fecha_fin ?? ""}
          onChange={(e) =>
            setConciliacionEditModal((prev) =>
              prev ? { ...prev, fecha_fin: e.target.value } : prev
            )
          }
          type="date"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
      </ActionModal>

      <ActionModal
        open={!!confirmModal}
        title={
          confirmModal
            ? `¿${confirmModal.action === "inactivar" ? "Inactivar" : "Reactivar"} ${
                confirmModal.entity === "viaje" ? "viaje" : "conciliación"
              } #${confirmModal.id}?`
            : "Confirmar acción"
        }
        description="Esta acción quedará registrada en el sistema."
        confirmText={confirmModal?.action === "inactivar" ? "Inactivar" : "Reactivar"}
        confirmTone={confirmModal?.action === "inactivar" ? "danger" : "success"}
        onClose={() => setConfirmModal(null)}
        onConfirm={onConfirmAction}
      />

      <ActionModal
        open={!!clientDecisionModal}
        title={
          clientDecisionModal?.action === "aprobar"
            ? "Confirmar autorización de conciliación"
            : "Devolver conciliación a Cointra"
        }
        description={
          clientDecisionModal?.action === "aprobar"
            ? "Se aprobarán todos los viajes marcados y la conciliación quedará autorizada."
            : "Incluye observaciones para que Cointra ajuste y vuelva a enviar."
        }
        confirmText={clientDecisionModal?.action === "aprobar" ? "Confirmar" : "Devolver"}
        confirmTone={clientDecisionModal?.action === "aprobar" ? "success" : "danger"}
        onClose={() => {
          setClientDecisionModal(null);
          setClientDecisionError("");
        }}
        onConfirm={submitClientDecision}
      >
        {clientDecisionModal?.action === "devolver" && (
          <textarea
            value={clientDecisionModal.observacion}
            onChange={(e) =>
              setClientDecisionModal((prev) =>
                prev ? { ...prev, observacion: e.target.value } : prev
              )
            }
            placeholder="Observaciones de la devolución"
            className="min-h-24 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        )}

        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={!!clientDecisionModal?.enviarCorreo}
            onChange={(e) =>
              setClientDecisionModal((prev) =>
                prev ? { ...prev, enviarCorreo: e.target.checked } : prev
              )
            }
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
          />
          Notificar por correo esta novedad
        </label>

        {clientDecisionModal?.enviarCorreo && (
          <>
            <input
              value={clientDecisionModal.destinatario}
              onChange={(e) =>
                setClientDecisionModal((prev) =>
                  prev ? { ...prev, destinatario: e.target.value } : prev
                )
              }
              placeholder="Correos destinatario (opcional): correo1@empresa.com; correo2@empresa.com"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <input
              value={clientDecisionModal.mensaje}
              onChange={(e) =>
                setClientDecisionModal((prev) =>
                  prev ? { ...prev, mensaje: e.target.value } : prev
                )
              }
              placeholder="Mensaje de correo (opcional)"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <p className="text-[11px] text-neutral">Puedes ingresar múltiples correos separados por coma o punto y coma.</p>
          </>
        )}
        {clientDecisionError && <p className="text-sm font-medium text-danger">{clientDecisionError}</p>}
      </ActionModal>

      {selectedViajeDetalle &&
        createPortal(
          <div
            className="fixed left-0 top-0 z-[120] h-screen w-screen flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[10px]"
            onClick={() => setSelectedViajeDetalle(null)}
          >
            <div
              className="w-full max-w-2xl rounded-2xl border border-emerald-100 bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-700">Detalle del viaje</p>
                <h3 className="mt-1 text-xl font-bold text-slate-900">Viaje #{selectedViajeDetalle.viaje_id ?? "-"}</h3>
                <p className="mt-1 text-sm text-neutral">
                  {selectedViajeDetalle.fecha_servicio} · {selectedViajeDetalle.origen || "-"} - {selectedViajeDetalle.destino || "-"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedViajeDetalle(null)}
                className="rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral">Placa</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedViajeDetalle.placa || "-"}</p>
              </div>
              <div className="rounded-xl border border-border bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral">Conductor</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedViajeDetalle.conductor || "-"}</p>
              </div>
              <div className="rounded-xl border border-border bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral">Tarifa tercero</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatCOP(selectedViajeDetalle.tarifa_tercero)}</p>
              </div>
              <div className="rounded-xl border border-border bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral">Tarifa cliente</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatCOP(selectedViajeDetalle.tarifa_cliente)}</p>
              </div>
              <div className="rounded-xl border border-border bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral">Rentabilidad</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {selectedViajeDetalle.rentabilidad !== null && selectedViajeDetalle.rentabilidad !== undefined
                    ? `${formatCOP(selectedViajeDetalle.rentabilidad)} %`
                    : "-"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral">Ganancia Cointra</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {formatCOP(getGananciaCointra(selectedViajeDetalle.tarifa_cliente, selectedViajeDetalle.tarifa_tercero))}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Observaciones / descripcion</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                {selectedViajeDetalle.descripcion?.trim() || "Sin observaciones registradas para este viaje."}
              </p>
            </div>
            </div>
          </div>,
          document.body
        )}
      {reviewSuccessMessage &&
        createPortal(
          <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
            onClick={() => setReviewSuccessMessage("")}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Envío confirmado</p>
              <h3 className="mt-2 text-xl font-bold text-slate-900">Correo enviado correctamente</h3>
              <p className="mt-3 text-sm text-slate-700">{reviewSuccessMessage}</p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setReviewSuccessMessage("")}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
