from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permission
from app.db.session import get_db
from app.models.usuario import Usuario
from app.schemas.presence import UsuarioPresenceOut
from app.services.presence_service import calcular_estado

router = APIRouter(prefix="/presence", tags=["presence"])


@router.post("/heartbeat", status_code=204)
def heartbeat(db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    user.ultimo_heartbeat = datetime.now(timezone.utc)
    db.commit()


@router.post("/logout", status_code=204)
def logout(db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    user.sesion_cerrada_en = datetime.now(timezone.utc)
    db.commit()


@router.get("/online", response_model=list[UsuarioPresenceOut])
def online(
    db: Session = Depends(get_db),
    user: Usuario = Depends(require_permission("presencia.ver")),
):
    usuarios = db.query(Usuario).filter(Usuario.activo.is_(True)).order_by(Usuario.nombre.asc()).all()
    return [
        UsuarioPresenceOut(
            id=usuario.id,
            nombre=usuario.nombre,
            email=usuario.email,
            rol=usuario.rol,
            activo=usuario.activo,
            ultimo_heartbeat=usuario.ultimo_heartbeat,
            estado_conexion=calcular_estado(usuario.ultimo_heartbeat, usuario.sesion_cerrada_en).value,
        )
        for usuario in usuarios
    ]
