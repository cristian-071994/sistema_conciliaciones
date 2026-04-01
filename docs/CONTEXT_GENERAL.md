# CONTEXT GENERAL - Sistema de Conciliacion

## Resumen
Aplicacion interna para controlar conciliaciones operativas y financieras entre Cointra, cliente y tercero.

## Stack vigente
- Backend: FastAPI + SQLAlchemy + Alembic.
- Frontend: React + TypeScript + Vite + Tailwind.
- Base de datos objetivo: PostgreSQL.
- Integraciones: Avansat (cache y sincronizacion) y SMTP para correo.

## Roles
- COINTRA: administracion operativa y financiera completa.
- CLIENTE: revision y decision de conciliaciones en su alcance.
- TERCERO: carga/consulta operativa con visibilidad financiera restringida.

## Flujo principal
1. Carga de viajes/servicios.
2. Creacion de conciliacion y asociacion de items/manifiestos.
3. Revision por cliente.
4. Aprobacion o devolucion.
5. Envio a facturacion y trazabilidad historica.

## Estado de la plataforma
- Backend y frontend activos.
- Migraciones administradas con Alembic.
- Configuracion preparada para usar PostgreSQL como fuente principal.
- Estructura lista para contenerizacion por servicios (frontend/backend/db).

## Referencias
- Backend: backend/README.md
- Frontend: frontend/README.md
- Base de datos: docs/CONTEXT_DATABASE.md
- Preparacion contenedores: docs/CONTAINERS_READY.md
