from sqlalchemy.orm import Session

from app.models.enums import CointraSubRol, UserRole
from app.models.permiso import Permiso
from app.models.rol import Rol
from app.models.usuario import Usuario


def nombre_rol_base_para(rol: UserRole, sub_rol: CointraSubRol | None) -> str:
    """Nombre del rol base (uno de los 4 sembrados) que corresponde a esta
    clasificación de negocio fija. Un usuario siempre queda vinculado a
    exactamente uno de estos 4 — no hay roles de negocio "custom"."""
    if rol == UserRole.COINTRA:
        return "COINTRA_ADMIN" if sub_rol == CointraSubRol.COINTRA_ADMIN else "COINTRA_USER"
    return rol.value


def sync_rol_id(db: Session, usuario: Usuario) -> None:
    """Vincula usuario.rol_id al rol base que corresponde a su (rol, sub_rol)
    actual. Se llama cada vez que se crea o cambia el rol/sub_rol de un
    usuario para que el perfil de permisos nunca quede desincronizado."""
    nombre = nombre_rol_base_para(usuario.rol, usuario.sub_rol)
    rol_row = db.query(Rol).filter(Rol.nombre == nombre).first()
    usuario.rol_id = rol_row.id if rol_row else None


def tiene_permiso(db: Session, usuario: Usuario, clave: str) -> bool:
    if usuario.rol_id is None:
        return False
    rol_row = db.query(Rol).filter(Rol.id == usuario.rol_id).first()
    if not rol_row:
        return False
    if rol_row.es_superadmin:
        return True
    return (
        db.query(Permiso)
        .join(Permiso.roles)
        .filter(Rol.id == rol_row.id, Permiso.clave == clave)
        .first()
        is not None
    )


def permisos_de_usuario(db: Session, usuario: Usuario) -> list[str]:
    """Claves de permiso que el frontend puede usar para decidir qué mostrar.
    Un superadmin recibe el catálogo completo (acceso total real); los demás
    reciben exactamente lo que su rol tiene concedido."""
    if usuario.rol_id is None:
        return []
    rol_row = db.query(Rol).filter(Rol.id == usuario.rol_id).first()
    if not rol_row:
        return []
    if rol_row.es_superadmin:
        return sorted(clave for (clave,) in db.query(Permiso.clave).all())
    return sorted(p.clave for p in rol_row.permisos)
