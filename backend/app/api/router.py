from fastapi import APIRouter

from app.api.routes import avansat, auth, catalogs, conciliaciones, notificaciones, viajes

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(catalogs.router)
api_router.include_router(viajes.router)
api_router.include_router(conciliaciones.router)
api_router.include_router(avansat.router)
api_router.include_router(notificaciones.router)
