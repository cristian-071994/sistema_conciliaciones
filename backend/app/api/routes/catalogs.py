from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.cliente import Cliente
from app.models.enums import UserRole
from app.models.operacion import Operacion
from app.models.tercero import Tercero
from app.models.usuario import Usuario
from app.schemas.catalogs import ClienteOut, OperacionOut, OperacionRentabilidadUpdate, TerceroOut

router = APIRouter(prefix="/catalogs", tags=["catalogs"])


@router.get("/clientes", response_model=list[ClienteOut])
def get_clientes(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    return db.query(Cliente).filter(Cliente.activo.is_(True)).order_by(Cliente.nombre).all()


@router.get("/terceros", response_model=list[TerceroOut])
def get_terceros(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    return db.query(Tercero).filter(Tercero.activo.is_(True)).order_by(Tercero.nombre).all()


@router.get("/operaciones", response_model=list[OperacionOut])
def get_operaciones(db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    query = db.query(Operacion).filter(Operacion.activa.is_(True))
    if user.rol.value == "CLIENTE" and user.cliente_id:
        query = query.filter(Operacion.cliente_id == user.cliente_id)
    if user.rol.value == "TERCERO" and user.tercero_id:
        query = query.filter(Operacion.tercero_id == user.tercero_id)
    return query.order_by(Operacion.nombre).all()


@router.patch("/operaciones/{operacion_id}/rentabilidad", response_model=OperacionOut)
def update_operacion_rentabilidad(
    operacion_id: int,
    payload: OperacionRentabilidadUpdate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    # Gestionar operaciones: solo Cointra (ADMIN/USER) a nivel de backend
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede configurar rentabilidad")

    operacion = db.get(Operacion, operacion_id)
    if not operacion:
        raise HTTPException(status_code=404, detail="Operacion no encontrada")
    operacion.porcentaje_rentabilidad = payload.porcentaje_rentabilidad
    db.commit()
    db.refresh(operacion)
    return operacion
