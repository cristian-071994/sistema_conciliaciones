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


class UserCreate(BaseModel):
    nombre: str
    email: EmailStr
    password: str
    rol: UserRole
    sub_rol: CointraSubRol | None = None
    cliente_id: int | None = None
    tercero_id: int | None = None


class UserUpdate(BaseModel):
    nombre: str | None = None
    email: EmailStr | None = None
    rol: UserRole | None = None
    sub_rol: CointraSubRol | None = None
    cliente_id: int | None = None
    tercero_id: int | None = None
