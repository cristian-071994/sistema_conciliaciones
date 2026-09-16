from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.permiso import Permiso
from app.models.rol import Rol
from app.models.usuario import Usuario
from app.schemas.rol import PermisoOut, RolCreate, RolOut, RolPermisosUpdate, RolUpdate

router = APIRouter(prefix="/roles", tags=["roles"])


def _serialize_rol(rol: Rol, usuarios_count: int) -> RolOut:
    return RolOut(
        id=rol.id,
        nombre=rol.nombre,
        descripcion=rol.descripcion,
        es_superadmin=rol.es_superadmin,
        es_sistema=rol.es_sistema,
        activo=rol.activo,
        permiso_claves=sorted(p.clave for p in rol.permisos),
        usuarios_count=usuarios_count,
    )


def _usuarios_count(db: Session, rol_id: int) -> int:
    return db.query(func.count(Usuario.id)).filter(Usuario.rol_id == rol_id).scalar() or 0


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

    return _serialize_rol(rol, _usuarios_count(db, rol.id))


@router.post("", response_model=RolOut)
def create_rol(
    payload: RolCreate,
    db: Session = Depends(get_db),
    _user: Usuario = Depends(require_permission("roles.crear")),
):
    nombre = payload.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre del rol es obligatorio")
    if db.query(Rol).filter(func.upper(Rol.nombre) == nombre.upper()).first():
        raise HTTPException(status_code=400, detail="Ya existe un rol con ese nombre")

    rol = Rol(
        nombre=nombre,
        descripcion=(payload.descripcion or "").strip() or None,
        es_superadmin=False,
        es_sistema=False,
        activo=True,
    )
    db.add(rol)
    db.commit()
    db.refresh(rol)
    return _serialize_rol(rol, 0)


@router.patch("/{rol_id}", response_model=RolOut)
def update_rol(
    rol_id: int,
    payload: RolUpdate,
    db: Session = Depends(get_db),
    _user: Usuario = Depends(require_permission("roles.editar")),
):
    rol = db.get(Rol, rol_id)
    if not rol:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    if rol.es_sistema:
        raise HTTPException(
            status_code=400,
            detail="Los roles base del sistema no se pueden renombrar — su nombre define la clasificación de negocio de los usuarios.",
        )

    data = payload.model_dump(exclude_unset=True)
    if "nombre" in data and data["nombre"] is not None:
        nombre = data["nombre"].strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre del rol es obligatorio")
        existente = db.query(Rol).filter(func.upper(Rol.nombre) == nombre.upper(), Rol.id != rol_id).first()
        if existente:
            raise HTTPException(status_code=400, detail="Ya existe un rol con ese nombre")
        rol.nombre = nombre
    if "descripcion" in data:
        rol.descripcion = (data["descripcion"] or "").strip() or None

    db.commit()
    db.refresh(rol)
    return _serialize_rol(rol, _usuarios_count(db, rol.id))


@router.post("/{rol_id}/desactivar", response_model=RolOut)
def desactivar_rol(
    rol_id: int,
    db: Session = Depends(get_db),
    _user: Usuario = Depends(require_permission("roles.desactivar")),
):
    rol = db.get(Rol, rol_id)
    if not rol:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    if rol.es_sistema:
        raise HTTPException(status_code=400, detail="Los roles base del sistema no se pueden desactivar")

    rol.activo = False
    db.commit()
    db.refresh(rol)
    return _serialize_rol(rol, _usuarios_count(db, rol.id))


@router.post("/{rol_id}/activar", response_model=RolOut)
def activar_rol(
    rol_id: int,
    db: Session = Depends(get_db),
    _user: Usuario = Depends(require_permission("roles.desactivar")),
):
    rol = db.get(Rol, rol_id)
    if not rol:
        raise HTTPException(status_code=404, detail="Rol no encontrado")

    rol.activo = True
    db.commit()
    db.refresh(rol)
    return _serialize_rol(rol, _usuarios_count(db, rol.id))
