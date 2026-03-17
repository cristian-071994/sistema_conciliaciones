from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import ALGORITHM
from app.db.session import get_db
from app.models.enums import CointraSubRol, UserRole
from app.models.usuario import Usuario

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> Usuario:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales invalidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    user = db.get(Usuario, int(user_id))
    if user is None or not user.activo:
        raise credentials_exception
    return user


def require_roles(*roles: UserRole):
    def validator(user: Usuario = Depends(get_current_user)) -> Usuario:
        if user.rol not in roles:
            raise HTTPException(status_code=403, detail="No autorizado para esta accion")
        return user

    return validator


def is_cointra_admin(user: Usuario) -> bool:
    return user.rol == UserRole.COINTRA and user.sub_rol == CointraSubRol.COINTRA_ADMIN
