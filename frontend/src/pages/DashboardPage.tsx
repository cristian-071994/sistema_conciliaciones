import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { Conciliacion, Item, Operacion, User, Viaje } from "../types";

interface Props {
  user: User;
  operaciones: Operacion[];
  conciliaciones: Conciliacion[];
  onRefreshConciliaciones: () => Promise<void>;
}

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" });

export function DashboardPage({ user, operaciones, conciliaciones, onRefreshConciliaciones }: Props) {
  const [activeModule, setActiveModule] = useState<"viajes" | "conciliaciones">("viajes");
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [selectedConciliacion, setSelectedConciliacion] = useState<number | null>(null);
  const [pendingViajes, setPendingViajes] = useState<Viaje[]>([]);
  const [selectedViajeIds, setSelectedViajeIds] = useState<number[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState("");

  const selected = conciliaciones.find((c) => c.id === selectedConciliacion) || null;

  const totals = useMemo(() => {
    return items.reduce<{ tarifaTercero: number; tarifaCliente: number }>(
      (acc: { tarifaTercero: number; tarifaCliente: number }, item: Item) => {
        acc.tarifaTercero += item.tarifa_tercero ?? 0;
        acc.tarifaCliente += item.tarifa_cliente ?? 0;
        return acc;
      },
      { tarifaTercero: 0, tarifaCliente: 0 }
    );
  }, [items]);

  async function loadViajes() {
    try {
      const data = await api.viajes(undefined, false);
      setViajes(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadItems(conciliacionId: number) {
    setSelectedConciliacion(conciliacionId);
    setLoadingItems(true);
    setError("");
    try {
      const [itemData, pending] = await Promise.all([
        api.items(conciliacionId),
        api.viajesPendientesConciliacion(conciliacionId),
      ]);
      setItems(itemData);
      setPendingViajes(pending);
      setSelectedViajeIds([]);
    } catch (e) {
      setError((e as Error).message);
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
  }

  async function createViaje(formData: FormData) {
    const payload = {
      operacion_id: Number(formData.get("operacion_id")),
      fecha_servicio: String(formData.get("fecha_servicio")),
      origen: String(formData.get("origen") || ""),
      destino: String(formData.get("destino") || ""),
      placa: String(formData.get("placa") || ""),
      conductor: String(formData.get("conductor") || ""),
      tarifa_tercero: Number(formData.get("tarifa_tercero") || 0),
      tarifa_cliente: Number(formData.get("tarifa_cliente") || 0),
      descripcion: String(formData.get("descripcion") || ""),
      manifiesto_numero: String(formData.get("manifiesto_numero") || ""),
    };

    await api.crearViaje(payload);
    await loadViajes();
  }

  async function attachPendingViajes() {
    if (!selected || selectedViajeIds.length === 0) return;
    await api.adjuntarViajesConciliacion(selected.id, selectedViajeIds);
    await loadItems(selected.id);
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

  useEffect(() => {
    if (activeModule === "viajes") {
      void loadViajes();
    }
  }, [activeModule]);

  return (
    <div className="grid">
      <section className="module-switch card">
        <button
          className={activeModule === "viajes" ? "active" : ""}
          onClick={() => {
            setActiveModule("viajes");
            void loadViajes();
          }}
        >
          Modulo Viajes
        </button>
        <button className={activeModule === "conciliaciones" ? "active" : ""} onClick={() => setActiveModule("conciliaciones")}>
          Modulo Conciliaciones
        </button>
      </section>

      {activeModule === "viajes" && (
        <>
          <div className="split-layout">
            <section className="card">
              <h3>Cargar viaje</h3>
              <form
                onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  await createViaje(new FormData(e.currentTarget));
                  e.currentTarget.reset();
                }}
              >
                <div className="form-grid">
                  <div className="field span-2">
                    <label>Operacion</label>
                    <select name="operacion_id" required>
                      <option value="">Seleccione...</option>
                      {operaciones.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label>Fecha</label>
                    <input name="fecha_servicio" type="date" required />
                  </div>
                  <div className="field">
                    <label>Manifiesto</label>
                    <input name="manifiesto_numero" placeholder="AV-12345" />
                  </div>

                  <div className="field">
                    <label>Origen</label>
                    <input name="origen" required />
                  </div>
                  <div className="field">
                    <label>Destino</label>
                    <input name="destino" required />
                  </div>

                  <div className="field">
                    <label>Placa</label>
                    <input name="placa" required />
                  </div>
                  <div className="field">
                    <label>Conductor</label>
                    <input name="conductor" required />
                  </div>

                  <div className="field">
                    <label>Tarifa Tercero</label>
                    <input name="tarifa_tercero" type="number" required />
                  </div>
                  {user.rol !== "TERCERO" && (
                    <div className="field">
                      <label>Tarifa Cliente (opcional)</label>
                      <input name="tarifa_cliente" type="number" />
                    </div>
                  )}

                  <div className="field span-2">
                    <label>Descripcion</label>
                    <input name="descripcion" placeholder="Observaciones del viaje" />
                  </div>
                </div>
                <button type="submit">Guardar viaje</button>
              </form>
            </section>

            <section className="card wide">
              <h3>Viajes cargados</h3>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Fecha</th>
                    <th>Ruta</th>
                    <th>Placa</th>
                    <th>Estado</th>
                    {user.rol !== "CLIENTE" && <th>Tarifa Tercero</th>}
                    {user.rol !== "TERCERO" && <th>Tarifa Cliente</th>}
                  </tr>
                </thead>
                <tbody>
                  {viajes.map((v) => (
                    <tr key={v.id}>
                      <td>{v.id}</td>
                      <td>{v.fecha_servicio}</td>
                      <td>
                        {v.origen} - {v.destino}
                      </td>
                      <td>{v.placa}</td>
                      <td>{v.conciliado ? "CONCILIADO" : "PENDIENTE"}</td>
                      {user.rol !== "CLIENTE" && <td>{v.tarifa_tercero ? money.format(v.tarifa_tercero) : "-"}</td>}
                      {user.rol !== "TERCERO" && <td>{v.tarifa_cliente ? money.format(v.tarifa_cliente) : "-"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}

      {activeModule === "conciliaciones" && (
        <>
          <div className="split-layout">
            <section className="card">
              <h3>Nueva conciliacion</h3>
              <form
                onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  await createConciliacion(new FormData(e.currentTarget));
                  e.currentTarget.reset();
                }}
              >
                <div className="form-grid">
                  <div className="field span-2">
                    <label>Operacion</label>
                    <select name="operacion_id" required>
                      <option value="">Seleccione...</option>
                      {operaciones.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field span-2">
                    <label>Nombre</label>
                    <input name="nombre" required placeholder="Segunda quincena febrero" />
                  </div>
                  <div className="field">
                    <label>Fecha inicio</label>
                    <input name="fecha_inicio" type="date" required />
                  </div>
                  <div className="field">
                    <label>Fecha fin</label>
                    <input name="fecha_fin" type="date" required />
                  </div>
                </div>
                <button type="submit">Crear</button>
              </form>
            </section>

            <section className="card wide">
              <h3>Conciliaciones</h3>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nombre</th>
                    <th>Estado</th>
                    <th>Periodo</th>
                    <th>Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {conciliaciones.map((c) => (
                    <tr key={c.id}>
                      <td>{c.id}</td>
                      <td>{c.nombre}</td>
                      <td>{c.estado}</td>
                      <td>
                        {c.fecha_inicio} - {c.fecha_fin}
                      </td>
                      <td>
                        <button onClick={() => loadItems(c.id)}>Ver items</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

      {selected && (
        <section className="card wide">
          <h3>Viajes pendientes por conciliar</h3>
          <div className="pending-toolbar">
            <span>{pendingViajes.length} viajes pendientes en la operacion</span>
            <button onClick={attachPendingViajes} disabled={selectedViajeIds.length === 0}>
              Adjuntar seleccionados ({selectedViajeIds.length})
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>ID</th>
                <th>Fecha</th>
                <th>Ruta</th>
                <th>Placa</th>
              </tr>
            </thead>
            <tbody>
              {pendingViajes.map((v) => (
                <tr key={v.id}>
                  <td>
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
                    />
                  </td>
                  <td>{v.id}</td>
                  <td>{v.fecha_servicio}</td>
                  <td>
                    {v.origen} - {v.destino}
                  </td>
                  <td>{v.placa}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Items de conciliacion #{selected.id}</h3>
          <form
            className="inline-form"
            onSubmit={async (e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              await createItem(new FormData(e.currentTarget));
              e.currentTarget.reset();
            }}
          >
            <select name="tipo" defaultValue="VIAJE">
              <option value="VIAJE">VIAJE</option>
              <option value="PEAJE">PEAJE</option>
              <option value="HORA_EXTRA">HORA_EXTRA</option>
              <option value="VIAJE_EXTRA">VIAJE_EXTRA</option>
              <option value="ESTIBADA">ESTIBADA</option>
              <option value="CONDUCTOR_RELEVO">CONDUCTOR_RELEVO</option>
              <option value="OTRO">OTRO</option>
            </select>
            <input name="fecha_servicio" type="date" required />
            <input name="origen" placeholder="Origen" />
            <input name="destino" placeholder="Destino" />
            <input name="placa" placeholder="Placa" />
            <input name="conductor" placeholder="Conductor" />
            {user.rol !== "CLIENTE" && <input name="tarifa_tercero" type="number" placeholder="Tarifa tercero" />}
            {user.rol !== "TERCERO" && <input name="tarifa_cliente" type="number" placeholder="Tarifa cliente" />}
            <input name="descripcion" placeholder="Descripcion" />
            <button type="submit">Agregar item</button>
          </form>

          {loadingItems ? (
            <p>Cargando items...</p>
          ) : (
            <>
              {error && <p className="error">{error}</p>}
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                    <th>Origen</th>
                    <th>Destino</th>
                    {user.rol !== "CLIENTE" && <th>Tarifa Tercero</th>}
                    {user.rol !== "TERCERO" && <th>Tarifa Cliente</th>}
                    {user.rol === "COINTRA" && <th>Rentabilidad %</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.tipo}</td>
                      <td>{item.estado}</td>
                      <td>{item.fecha_servicio}</td>
                      <td>{item.origen || "-"}</td>
                      <td>{item.destino || "-"}</td>
                      {user.rol !== "CLIENTE" && <td>{item.tarifa_tercero ? money.format(item.tarifa_tercero) : "-"}</td>}
                      {user.rol !== "TERCERO" && <td>{item.tarifa_cliente ? money.format(item.tarifa_cliente) : "-"}</td>}
                      {user.rol === "COINTRA" && <td>{item.rentabilidad ?? "-"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="totals">
                {user.rol !== "CLIENTE" && <span>Total Tercero: {money.format(totals.tarifaTercero)}</span>}
                {user.rol !== "TERCERO" && <span>Total Cliente: {money.format(totals.tarifaCliente)}</span>}
              </div>
            </>
          )}
        </section>
      )}
      </>
      )}
    </div>
  );
}
