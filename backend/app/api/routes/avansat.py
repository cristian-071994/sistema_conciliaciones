from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.core.config import settings
from app.models.enums import UserRole
from app.models.usuario import Usuario
from app.services.avansat import fetch_avansat_by_manifiesto

router = APIRouter(prefix="/avansat", tags=["avansat"])


class AvansatLookupOut(BaseModel):
    manifiesto: str
    encontrado: bool
    fecha_emision: str | None = None
    producto: str | None = None
    placa_vehiculo: str | None = None
    trayler: str | None = None
    remesa: str | None = None
    ciudad_origen: str | None = None
    ciudad_destino: str | None = None


@router.get("/manifiesto/{manifiesto}", response_model=AvansatLookupOut)
def consultar_manifiesto(
    manifiesto: str,
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede consultar Avansat")

    value = manifiesto.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Debes enviar un manifiesto valido")

    if not settings.avansat_enabled:
        raise HTTPException(
            status_code=503,
            detail="La integracion con Avansat esta deshabilitada. Configura AVANSAT_ENABLED y credenciales en backend/.env.",
        )

    data = fetch_avansat_by_manifiesto(value)
    return AvansatLookupOut(manifiesto=value, encontrado=bool(data), **data)
