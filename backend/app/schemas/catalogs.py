from app.schemas.common import ORMModel
from pydantic import BaseModel, Field


class ClienteOut(ORMModel):
    id: int
    nombre: str
    nit: str
    activo: bool


class TerceroOut(ORMModel):
    id: int
    nombre: str
    nit: str
    activo: bool


class OperacionOut(ORMModel):
    id: int
    cliente_id: int
    tercero_id: int
    nombre: str
    porcentaje_rentabilidad: float
    activa: bool


class OperacionRentabilidadUpdate(BaseModel):
    porcentaje_rentabilidad: float = Field(ge=0, le=99.99)
