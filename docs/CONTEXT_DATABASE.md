# CONTEXT DATABASE - Estado actual

## Motor objetivo
PostgreSQL obligatorio en desarrollo y produccion.

## Acceso desde backend
La URL de SQLAlchemy se resuelve en este orden:
1. DATABASE_URL (si esta definida)
2. Construccion por variables POSTGRES_HOST/PORT/DB/USER/PASSWORD

Driver configurado:
- postgresql+psycopg

## Migraciones
- Herramienta: Alembic
- Comando de aplicacion: alembic upgrade head
- Configuracion base: backend/alembic.ini + backend/alembic/env.py

## Migracion de datos historicos
Existe script para copiar datos desde SQLite a PostgreSQL:
- backend/scripts/migrate_sqlite_to_postgres.py

Comportamiento del script:
- Valida que el esquema exista en PostgreSQL.
- Trunca tablas destino en orden seguro.
- Copia registros tabla por tabla.
- Ajusta secuencias al maximo id actual.

Variables opcionales del script:
- SQLITE_SOURCE_URL
- POSTGRES_TARGET_URL

Alcance:
- SQLite se considera solo fuente historica de migracion puntual.
- SQLite no esta soportado como motor de ejecucion del backend.

## Convenciones operativas
- Crear y versionar cambios de esquema solo por Alembic.
- No alterar estructura de tablas manualmente en produccion.
- Ejecutar migraciones antes de levantar backend en entornos nuevos.
- Ejecutar backend y Alembic siempre contra PostgreSQL.

## Preparacion para contenedores
Diseno pensado para separar db como servicio dedicado y exponer al backend por URL de red interna.
