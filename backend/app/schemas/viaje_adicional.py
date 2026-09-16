from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field

from app.models.enums import ItemEstado
from app.schemas.common import ORMModel


class EstadoGestionViajeAdicional(str, Enum):
    """Estado REAL del viaje adicional dentro del proceso de conciliación —
    fuente de verdad: Viaje.conciliacion_id / Conciliacion.estado (ver
    _compute_estado_gestion en api/routes/viajes_adicionales.py). No confundir
    con `estado` (ItemEstado), que es un campo manual independiente."""

    PENDIENTE_TARIFA = "PENDIENTE_TARIFA"  # el tercero aún no ingresa tarifa_tercero
    PENDIENTE_MANIFIESTO = "PENDIENTE_MANIFIESTO"  # ya hay tarifa, falta que Cointra adjunte el manifiesto
    SIN_CONCILIAR = "SIN_CONCILIAR"  # el viaje ya existe pero aún no se incluyó en ninguna conciliación
    EN_BORRADOR = "EN_BORRADOR"  # incluido en una conciliación que Cointra aún está armando
    EN_REVISION = "EN_REVISION"  # la conciliación está en revisión del cliente
    APROBADA = "APROBADA"  # cliente y Cointra ya aprobaron la conciliación
    CONCILIADO = "CONCILIADO"  # conciliación cerrada — proceso terminado


class VehiculoDisponibleOut(ORMModel):
    id: int
    placa: str
    tipo_vehiculo_id: int
    tipo_vehiculo_nombre: str


class SolicitudViajeAdicionalCreate(BaseModel):
    operacion_id: int
    vehiculo_id: int
    titulo: str = Field(min_length=1, max_length=255)
    fecha_viaje: date
    origen: str = Field(min_length=1, max_length=255)
    destino: str = Field(min_length=1, max_length=255)
    producto: str = Field(min_length=1, max_length=255)
    observaciones: str | None = None


class ManifiestoViajeAdicionalOut(ORMModel):
    id: int
    numero_manifiesto: str | None
    filename: str
    created_at: datetime


class SolicitudViajeAdicionalOut(ORMModel):
    id: int
    operacion_id: int
    operacion_nombre: str
    cliente_id: int
    cliente_nombre: str
    vehiculo_id: int
    vehiculo_placa: str
    vehiculo_tipo_nombre: str
    titulo: str
    fecha_viaje: date
    origen: str
    destino: str
    producto: str
    observaciones: str | None
    # Visibilidad financiera por rol (misma regla que ConciliacionItem, ver
    # sanitize_item_for_role): CLIENTE solo tarifa_cliente, TERCERO solo
    # tarifa_tercero, COINTRA ve todo. Se aplica antes de retornar.
    tarifa_tercero: float | None
    tarifa_cliente: float | None
    rentabilidad: float | None
    estado: ItemEstado
    # Estado real dentro del proceso de conciliación — ver EstadoGestionViajeAdicional.
    estado_gestion: EstadoGestionViajeAdicional
    created_by: int
    creador_nombre: str
    created_at: datetime
    activo: bool
    manifiesto: ManifiestoViajeAdicionalOut | None = None
    # Se llena al subir el manifiesto — desde ahí el registro facturable vive
    # en viajes/conciliacion_items (ver services/viaje_adicional_conversion.py).
    viaje_id: int | None = None


class SolicitudViajeAdicionalEstadoUpdate(BaseModel):
    estado: ItemEstado


class SolicitudViajeAdicionalTarifaUpdate(BaseModel):
    tarifa_tercero: float = Field(gt=0)


class ManifiestoNumeroUpdate(BaseModel):
    numero_manifiesto: str = Field(min_length=1, max_length=100)
