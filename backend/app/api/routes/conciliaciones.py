from fastapi import APIRouter

from app.api.routes.conciliaciones_core import router as core_router
from app.api.routes.conciliaciones_items import router as items_router
from app.api.routes.conciliaciones_workflow import router as workflow_router

router = APIRouter(prefix="/conciliaciones", tags=["conciliaciones"])

router.include_router(core_router)
router.include_router(items_router)
router.include_router(workflow_router)
