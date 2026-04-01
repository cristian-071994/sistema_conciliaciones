# CONTEXT BACKEND - Estado actual

## Stack real
- FastAPI
- SQLAlchemy 2.x
- Alembic
- Pydantic v2
- JWT (python-jose)
- SMTP para notificaciones
- Integracion Avansat (API + cache)

## Arquitectura vigente
- app/main.py: creacion app, middlewares, startup checks, routers.
- app/api/router.py: router principal /api.
- app/api/routes/: modulos de endpoints.
- app/models/: entidades SQLAlchemy.
- app/schemas/: contratos de entrada/salida.
- app/services/: logica de negocio (audit, pricing, notifications, avansat, visibility).
- app/db/: base declarativa, engine/session y seed inicial.

## Endpoints por dominio
- /api/auth
- /api/catalogs
- /api/viajes
- /api/conciliaciones
- /api/dashboard
- /api/avansat
- /api/notificaciones
- /api/vehiculos
- /api/servicios
- /api/catalogo-tarifas

## Seguridad y reglas
- Autenticacion JWT por bearer token.
- Filtros y visibilidad por rol.
- Encabezados de seguridad HTTP agregados por middleware.
- Requisito de esquema valido al iniciar (startup valida tabla usuarios).

## Base de datos
- Backend preparado para PostgreSQL como objetivo principal.
- Conexion configurable por DATABASE_URL o variables POSTGRES_*.
- Migraciones con Alembic requeridas antes del arranque en base nueva.

## Integraciones
- Avansat: sincronizacion y cache de manifiestos.
- Correo SMTP: notificaciones manuales y flujos de facturacion/revision.

## Operacion recomendada
1. Configurar variables de entorno.
2. Ejecutar alembic upgrade head.
3. Iniciar API con uvicorn app.main:app --reload.
