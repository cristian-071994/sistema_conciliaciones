from pydantic import BaseModel

from app.schemas.common import ORMModel


class TipoVehiculoCreate(BaseModel):
    nombre: str


class TipoVehiculoOut(ORMModel):
    id: int
    nombre: str
    activo: bool


class VehiculoCreate(BaseModel):
    placa: str
    tipo_vehiculo_id: int
    propietario: str | None = None


class VehiculoOut(ORMModel):
    id: int
    placa: str
    tipo_vehiculo_id: int
    propietario: str | None
    activo: bool
    created_by: int

