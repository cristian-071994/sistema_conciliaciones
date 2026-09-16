from pydantic import BaseModel, EmailStr

from app.models.enums import CointraSubRol, UserRole
from app.schemas.common import ORMModel


class UserOut(ORMModel):
    id: int
    nombre: str
    email: str
    rol: UserRole
    sub_rol: CointraSubRol | None = None
    cliente_id: int | None = None
    tercero_id: int | None = None
    activo: bool
    operacion_ids: list[int] = []
    permisos: list[str] = []
    # Rol de permisos efectivo (FK a `roles`). Normalmente se resincroniza
    # solo según (rol, sub_rol) — ver sync_rol_id() — pero un admin puede
    # sobreescribirlo manualmente a otro rol (ver rol_id en UserUpdate).
    rol_id: int | None = None


class UserCreate(BaseModel):
    nombre: str
    email: EmailStr
    password: str
    rol: UserRole
    sub_rol: CointraSubRol | None = None
    cliente_id: int | None = None
    tercero_id: int | None = None
    operacion_ids: list[int] = []
    # Rol de permisos manual, opcional — si se omite, se asigna
    # automáticamente el rol base según (rol, sub_rol).
    rol_id: int | None = None


class UserUpdate(BaseModel):
    nombre: str | None = None
    email: EmailStr | None = None
    rol: UserRole | None = None
    sub_rol: CointraSubRol | None = None
    cliente_id: int | None = None
    tercero_id: int | None = None
    operacion_ids: list[int] | None = None
    # Igual que en UserCreate: si se envía, sobreescribe el rol de permisos
    # manualmente; si no se envía y cambia rol/sub_rol, se resincroniza solo.
    rol_id: int | None = None
