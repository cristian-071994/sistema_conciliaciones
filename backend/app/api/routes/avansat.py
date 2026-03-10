from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.operacion import Operacion
from app.models.usuario import Usuario
from app.models.viaje import Viaje

router = APIRouter(prefix="/avansat", tags=["avansat"])


@router.get("/manifiestos")
def search_manifiestos(
    operacion_id: int,
    placa: str | None = None,
    origen: str | None = None,
    destino: str | None = None,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        return []

    operacion = db.get(Operacion, operacion_id)
    if not operacion:
        return []

    query = db.query(Viaje).filter(Viaje.operacion_id == operacion_id)
    if placa:
        query = query.filter(Viaje.placa.ilike(f"%{placa}%"))
    if origen:
        query = query.filter(Viaje.origen.ilike(f"%{origen}%"))
    if destino:
        query = query.filter(Viaje.destino.ilike(f"%{destino}%"))

    # Conector inicial fase 1: simula manifiestos sin facturar basados en viajes cargados.
    data = []
    for v in query.order_by(Viaje.fecha_servicio.desc()).limit(50).all():
        data.append(
            {
                "manifiesto_id": v.manifiesto_avansat_id or f"AVS-{v.id}",
                "manifiesto_numero": v.manifiesto_numero or f"MNF-{v.id:05}",
                "fecha_servicio": str(v.fecha_servicio),
                "origen": v.origen,
                "destino": v.destino,
                "placa": v.placa,
                "sin_factura": True,
            }
        )
    return data
