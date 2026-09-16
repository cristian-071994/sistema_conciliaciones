from sqlalchemy.orm import Session

from app.core.permisos_catalog import PERMISOS, PERMISOS_POR_ROL_DEFECTO, ROLES_BASE
from app.core.security import get_password_hash
from app.models.enums import CointraSubRol, UserRole
from app.models.permiso import Permiso
from app.models.rol import Rol
from app.models.usuario import Usuario
from app.services.permisos_service import sync_rol_id
from app.services.viaje_adicional_conversion import ensure_servicio_viaje_adicional


def _seed_roles_y_permisos(db: Session) -> None:
    """Idempotente por nombre/clave: solo inserta lo que falte. Nunca
    sobrescribe los permisos de un rol ya existente (para no pisar
    personalizaciones hechas desde el módulo de Roles).

    Excepción deliberada: un permiso que se agrega recién en este arranque
    (no existía antes en absoluto) se concede automáticamente a los roles
    que lo traen en PERMISOS_POR_ROL_DEFECTO, incluso si el rol ya existía.
    Un admin no pudo haber revocado algo que nunca existió, así que esto
    replica el comportamiento fijo previo a que la acción fuera
    configurable — sin esto, cada CRUD nuevo que se vuelve permiso
    quedaría bloqueado de golpe para roles que ya lo tenían."""
    permisos_por_clave = {p.clave: p for p in db.query(Permiso).all()}
    permisos_nuevos: list[Permiso] = []
    for clave, categoria, descripcion in PERMISOS:
        if clave not in permisos_por_clave:
            nuevo = Permiso(clave=clave, categoria=categoria, descripcion=descripcion)
            db.add(nuevo)
            permisos_por_clave[clave] = nuevo
            permisos_nuevos.append(nuevo)
    db.flush()

    roles_por_nombre = {r.nombre: r for r in db.query(Rol).all()}
    for nombre, descripcion, es_superadmin, es_sistema in ROLES_BASE:
        if nombre in roles_por_nombre:
            continue
        nuevo_rol = Rol(
            nombre=nombre,
            descripcion=descripcion,
            es_superadmin=es_superadmin,
            es_sistema=es_sistema,
        )
        for clave in PERMISOS_POR_ROL_DEFECTO.get(nombre, []):
            permiso = permisos_por_clave.get(clave)
            if permiso:
                nuevo_rol.permisos.append(permiso)
        db.add(nuevo_rol)
        roles_por_nombre[nombre] = nuevo_rol
    db.flush()

    if permisos_nuevos:
        claves_nuevas = {p.clave for p in permisos_nuevos}
        for nombre, claves_defecto in PERMISOS_POR_ROL_DEFECTO.items():
            rol = roles_por_nombre.get(nombre)
            if not rol:
                continue
            claves_actuales = {p.clave for p in rol.permisos}
            for clave in claves_defecto:
                if clave in claves_nuevas and clave not in claves_actuales:
                    rol.permisos.append(permisos_por_clave[clave])
        db.flush()


def seed_data(db: Session) -> None:
    _seed_roles_y_permisos(db)

    # Usuario administrador Cointra (idempotente)
    admin_email = "cgutierrez@cointra.com.co"
    admin = db.query(Usuario).filter(Usuario.email == admin_email).first()
    if not admin:
        admin = Usuario(
            nombre="Administrador Cointra",
            email=admin_email,
            password_hash=get_password_hash("admin123"),
            rol=UserRole.COINTRA,
            sub_rol=CointraSubRol.COINTRA_ADMIN,
            activo=True,
        )
        db.add(admin)
        db.flush()

    # Defensivo: cualquier usuario sin rol_id (ej. creado antes de este módulo
    # y aún no alcanzado por el backfill de la migración) queda sincronizado.
    for usuario in db.query(Usuario).filter(Usuario.rol_id.is_(None)).all():
        sync_rol_id(db, usuario)

    # El módulo de viajes adicionales (cliente) depende de este servicio para
    # convertir la solicitud en un Viaje facturable al subir el manifiesto.
    ensure_servicio_viaje_adicional(db, created_by=admin.id)

    db.commit()
