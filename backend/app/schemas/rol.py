from pydantic import BaseModel

from app.schemas.common import ORMModel


class PermisoOut(ORMModel):
    id: int
    clave: str
    categoria: str
    descripcion: str


class RolOut(ORMModel):
    id: int
    nombre: str
    descripcion: str | None = None
    es_superadmin: bool
    es_sistema: bool
    permiso_claves: list[str] = []
    usuarios_count: int = 0


class RolPermisosUpdate(BaseModel):
    permiso_claves: list[str]
