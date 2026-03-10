from app.models.enums import UserRole
from app.schemas.common import ORMModel


class UserOut(ORMModel):
    id: int
    nombre: str
    email: str
    rol: UserRole
    cliente_id: int | None = None
    tercero_id: int | None = None
    activo: bool
