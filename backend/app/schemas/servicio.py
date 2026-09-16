from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class ServicioCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    requiere_origen_destino: bool = False


class ServicioUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    requiere_origen_destino: bool | None = None


class ServicioOut(ORMModel):
    id: int
    nombre: str
    codigo: str
    requiere_origen_destino: bool
    activo: bool
    created_by: int


class CatalogoTarifaUpsert(BaseModel):
    # servicio_id o servicio_codigo — la app móvil (rol CLIENTE) no conoce el
    # id numérico del servicio "Viaje Adicional", así que puede mandar el
    # código en su lugar (ver _resolve_servicio en api/routes/tarifas.py).
    servicio_id: int | None = None
    servicio_codigo: str | None = None
    tipo_vehiculo_id: int
    # Solo obligatorios cuando el servicio resuelto es VIAJE_ADICIONAL.
    origen: str | None = Field(default=None, max_length=255)
    destino: str | None = Field(default=None, max_length=255)
    tarifa_cliente: float = Field(gt=0)
    rentabilidad_pct: float = Field(ge=0, le=99.99)


class CatalogoTarifaUpdate(BaseModel):
    servicio_id: int | None = None
    tipo_vehiculo_id: int | None = None
    origen: str | None = Field(default=None, max_length=255)
    destino: str | None = Field(default=None, max_length=255)
    tarifa_cliente: float | None = Field(default=None, gt=0)
    rentabilidad_pct: float | None = Field(default=None, ge=0, le=99.99)
    activo: bool | None = None


class CatalogoTarifaOut(ORMModel):
    """tarifa_cliente/tarifa_tercero/rentabilidad_pct son opcionales porque el
    backend los oculta (None) según el rol de quien consulta — ver _to_out en
    api/routes/tarifas.py. Regla fija: Cliente solo ve tarifa_cliente, Tercero
    solo ve tarifa_tercero, y rentabilidad_pct es exclusivo de Cointra."""

    id: int
    servicio_id: int
    tipo_vehiculo_id: int
    origen: str | None = None
    destino: str | None = None
    tarifa_cliente: float | None = None
    rentabilidad_pct: float | None = None
    tarifa_tercero: float | None = None
    activo: bool
    updated_by: int
    servicio_nombre: str | None = None
    servicio_codigo: str | None = None
    tipo_vehiculo_nombre: str | None = None


class RutaTarifaOut(BaseModel):
    """Ruta con tarifa activa para VIAJE_ADICIONAL — sin montos, se usa para
    poblar los desplegables de origen/destino en la app móvil (rol CLIENTE)."""

    origen: str
    destino: str
    tipo_vehiculo_id: int
    tipo_vehiculo_nombre: str
