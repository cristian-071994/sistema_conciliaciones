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
