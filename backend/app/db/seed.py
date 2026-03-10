from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models.cliente import Cliente
from app.models.enums import UserRole
from app.models.operacion import Operacion
from app.models.tercero import Tercero
from app.models.usuario import Usuario


def seed_data(db: Session) -> None:
    if db.query(Usuario).count() > 0:
        return

    cliente = Cliente(nombre="Bavaria", nit="900123456", activo=True)
    tercero = Tercero(nombre="Vicente Rubio", nit="901000111", activo=True)
    db.add_all([cliente, tercero])
    db.flush()

    operacion = Operacion(
        cliente_id=cliente.id,
        tercero_id=tercero.id,
        nombre="Operacion Siberia",
        porcentaje_rentabilidad=10,
        activa=True,
    )
    db.add(operacion)
    db.flush()

    users = [
        Usuario(
            nombre="Admin Cointra",
            email="cointra@cointra.com",
            password_hash=get_password_hash("cointra123"),
            rol=UserRole.COINTRA,
            activo=True,
        ),
        Usuario(
            nombre="Usuario Cliente",
            email="cliente@cointra.com",
            password_hash=get_password_hash("cliente123"),
            rol=UserRole.CLIENTE,
            cliente_id=cliente.id,
            activo=True,
        ),
        Usuario(
            nombre="Usuario Tercero",
            email="tercero@cointra.com",
            password_hash=get_password_hash("tercero123"),
            rol=UserRole.TERCERO,
            tercero_id=tercero.id,
            activo=True,
        ),
    ]
    db.add_all(users)
    db.commit()
