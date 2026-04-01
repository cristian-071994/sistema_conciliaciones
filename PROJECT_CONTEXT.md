# PROJECT CONTEXT - Sistema de Conciliacion

## Objetivo
Sistema web para gestionar conciliaciones operativas y financieras entre Cointra, clientes y terceros transportadores.

## Estado actual del proyecto
- Backend productivo en FastAPI con SQLAlchemy y Alembic.
- Frontend en React + TypeScript + Vite + Tailwind.
- Autenticacion JWT con control por rol: COINTRA, CLIENTE, TERCERO.
- Integracion Avansat con cache local y procesos de sincronizacion.
- Flujo completo de conciliacion con notificaciones internas y correo SMTP.
- Dashboard de indicadores por periodo y por rol.

## Base de datos (actual)
- Motor objetivo: PostgreSQL.
- ORM y migraciones ya configurados para PostgreSQL en backend.
- Se mantiene script de migracion para trasladar datos historicos de SQLite.

## Modulos funcionales activos
- Autenticacion y gestion de usuario.
- Catalogos: clientes, terceros, operaciones, servicios, vehiculos, tipos de vehiculo, tarifas.
- Viajes y conciliaciones (items, estados, manifiestos, historial, comentarios).
- Notificaciones internas y envio de correos manuales.
- Dashboard de KPIs y graficas.
- Avansat: consulta, cache y sincronizacion.

## Restricciones de visibilidad
- COINTRA: visibilidad financiera completa.
- CLIENTE: solo valores de cliente y conciliaciones autorizadas por acceso.
- TERCERO: solo valores de tercero y conciliaciones asociadas a su alcance.

## Preparacion para contenedores
La configuracion ya esta orientada a separar servicios:
- frontend
- backend
- db (PostgreSQL)

Documento de referencia: docs/CONTAINERS_READY.md
