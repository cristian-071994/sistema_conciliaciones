from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.permiso import Permiso
from app.models.rol import Rol
from app.models.usuario import Usuario
from app.schemas.rol import PermisoOut, RolOut, RolPermisosUpdate

router = APIRouter(prefix="/roles", tags=["roles"])


def _serialize_rol(rol: Rol, usuarios_count: int) -> RolOut:
    return RolOut(
        id=rol.id,
        nombre=rol.nombre,
        descripcion=rol.descripcion,
        es_superadmin=rol.es_superadmin,
        es_sistema=rol.es_sistema,
        permiso_claves=sorted(p.clave for p in rol.permisos),
        usuarios_count=usuarios_count,
    )


@router.get("", response_model=list[RolOut])
def list_roles(
    db: Session = Depends(get_db),
    _user: Usuario = Depends(require_permission("roles.ver")),
):
    conteos = dict(
        db.query(Usuario.rol_id, func.count(Usuario.id))
        .filter(Usuario.rol_id.isnot(None))
        .group_by(Usuario.rol_id)
        .all()
    )
    roles = db.query(Rol).order_by(Rol.id.asc()).all()
    return [_serialize_rol(rol, conteos.get(rol.id, 0)) for rol in roles]


@router.get("/permisos", response_model=list[PermisoOut])
def list_permisos(
    db: Session = Depends(get_db),
    _user: Usuario = Depends(require_permission("roles.ver")),
):
    return db.query(Permiso).order_by(Permiso.categoria.asc(), Permiso.clave.asc()).all()


@router.patch("/{rol_id}/permisos", response_model=RolOut)
def update_rol_permisos(
    rol_id: int,
    payload: RolPermisosUpdate,
    db: Session = Depends(get_db),
    _user: Usuario = Depends(require_permission("roles.gestionar")),
):
    rol = db.get(Rol, rol_id)
    if not rol:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    if rol.es_superadmin:
        raise HTTPException(status_code=400, detail="El rol superadmin tiene acceso total y no usa permisos explícitos")

    claves = set(payload.permiso_claves)
    permisos = db.query(Permiso).filter(Permiso.clave.in_(claves)).all() if claves else []
    if len(permisos) != len(claves):
        raise HTTPException(status_code=400, detail="Hay claves de permiso inválidas")

    rol.permisos = permisos
    db.commit()
    db.refresh(rol)

    usuarios_count = db.query(func.count(Usuario.id)).filter(Usuario.rol_id == rol.id).scalar() or 0
    return _serialize_rol(rol, usuarios_count)
