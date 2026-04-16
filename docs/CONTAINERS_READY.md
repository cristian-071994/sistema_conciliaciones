# Contenerizacion futura (estructura objetivo)

Este proyecto ya esta preparado para separar servicios sin cambios de logica:

- Servicio frontend: Vite/React
- Servicio backend: FastAPI
- Servicio db: PostgreSQL

## Contratos de configuracion

### Backend
Variables clave:

- DATABASE_URL (prioridad 1)
- POSTGRES_HOST
- POSTGRES_PORT
- POSTGRES_DB
- POSTGRES_USER
- POSTGRES_PASSWORD

Regla:

- Si DATABASE_URL tiene valor, backend usa esa cadena.
- Si DATABASE_URL esta vacia, backend arma URL con POSTGRES_*.
- El backend solo soporta PostgreSQL como motor de ejecucion.

### Frontend
Variables clave:

- VITE_API_URL

Regla:

- Debe apuntar al servicio backend (por ejemplo, http://backend:8000/api dentro de red Docker).

## Secuencia recomendada de arranque en contenedores

1. Levantar contenedor db (PostgreSQL).
2. Levantar backend y ejecutar `alembic upgrade head`.
3. Levantar frontend con `VITE_API_URL` apuntando al backend.

## Migracion de datos historicos (si aplica)

Si se requiere pasar datos de SQLite al nuevo PostgreSQL:

1. Crear esquema en PostgreSQL: `alembic upgrade head`
2. Ejecutar en backend: `python scripts/migrate_sqlite_to_postgres.py`

Variables opcionales del script:

- SQLITE_SOURCE_URL
- POSTGRES_TARGET_URL

Alcance:

- SQLite se usa unicamente como fuente historica para migracion puntual.
- SQLite no debe usarse como base activa en desarrollo ni en produccion.
