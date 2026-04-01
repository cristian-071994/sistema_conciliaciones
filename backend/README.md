# Backend - Sistema de Conciliacion Cointra

## Requisitos
- Python 3.11+
- PostgreSQL 14+

## Instalacion
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

## Configuracion de base de datos (PostgreSQL)
El backend usa PostgreSQL por defecto.

Puedes configurar conexion de dos formas:

1. `DATABASE_URL` completa (recomendada para Docker/cloud)
2. Variables `POSTGRES_*` (fallback local)

Ejemplo rapido local:

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=sistema_conciliacion
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
DATABASE_URL=
```

Si usas `DATABASE_URL`, debe ser asi:

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/sistema_conciliacion
```

## Ejecutar
Antes del primer arranque (o en una base nueva), aplica migraciones:

```powershell
alembic upgrade head
```

Luego inicia la API:

```powershell
uvicorn app.main:app --reload
```

API docs: http://127.0.0.1:8000/docs

## Migrar datos existentes de SQLite a PostgreSQL
Si tienes datos historicos en `cointra.db`, puedes copiarlos a PostgreSQL:

1. Asegura que PostgreSQL este arriba y que la BD tenga el esquema con `alembic upgrade head`.
2. Ejecuta:

```powershell
python scripts/migrate_sqlite_to_postgres.py
```

El script trunca tablas destino, copia registros y reajusta secuencias.

## Preparado para contenedores (siguiente fase)
La configuracion ya esta organizada para separar servicios:

- `frontend` (React/Vite)
- `backend` (FastAPI)
- `db` (PostgreSQL)

Recomendacion para la fase Docker:

- Backend usando `DATABASE_URL=postgresql+psycopg://...` con host de servicio (`db`).
- Frontend consumiendo API por variable `VITE_API_URL`.
- Ejecutar `alembic upgrade head` al iniciar backend.

## Notificaciones (internas + correo manual)
- Endpoint bandeja usuario: `GET /api/notificaciones/mis`
- Marcar leida: `PATCH /api/notificaciones/{id}`
- Marcar todas: `POST /api/notificaciones/leer-todas`

Correo manual (decide el usuario):
- Sugeridos por conciliacion: `GET /api/notificaciones/correo/destinatarios-sugeridos/{conciliacion_id}?tipo=cliente_revision|respuesta_cliente`
- Preview plantilla/libre: `POST /api/notificaciones/correo/preview`
- Enviar correo: `POST /api/notificaciones/correo/send`

Plantillas disponibles:
- `CONCILIACION_PENDIENTE_CLIENTE`
- `RESPUESTA_CLIENTE_COINTRA`

Configurar SMTP en `.env`:
```env
SMTP_ENABLED=true
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=notificaciones@cointra.com.co
SMTP_PASSWORD=TU_CLAVE_APP_O_SMTP
SMTP_USE_TLS=true
SMTP_USE_SSL=false
MAIL_FROM=notificaciones@cointra.com.co
```

Si `SMTP_ENABLED=false`, el sistema mantiene notificaciones internas y no envia correo.

## Lo que debe habilitar TI para `notificaciones@cointra.com.co`
1. Acceso SMTP autenticado para el buzon.
2. Host/puerto y politica TLS/SSL (ej. Office365: `smtp.office365.com:587`, TLS).
3. Credencial SMTP o App Password para integracion.
4. Permiso de envio con remitente `notificaciones@cointra.com.co`.
5. DNS de correo correcto (SPF, DKIM, DMARC) para evitar spam.
6. Limites/cuotas de envio y whitelist interna.
