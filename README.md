# Sistema de Conciliacion - Cointra S.A.S. ---- .

Implementacion inicial full-stack basada en tus requerimientos funcionales:

- Backend: FastAPI + SQLAlchemy + JWT + RBAC
- Frontend: React + TypeScript + Vite
- Base de datos: PostgreSQL (obligatoria en desarrollo y produccion)

## Estructura
- `backend/`: API, modelos, reglas de negocio y seguridad por rol
- `frontend/`: interfaz web para login, conciliaciones e items

## Funcionalidades incluidas en esta version
- Autenticacion con JWT
- Roles: `COINTRA`, `CLIENTE`, `TERCERO`
- Modelo de datos alineado al dbdiagram compartido
- CRUD base de conciliaciones
- CRUD base de items conciliables
- Comentarios por conciliacion/item
- Ocultamiento de tarifas por rol
- Calculo de tarifa cliente segun rentabilidad de operacion
- Seed automatico con datos demo

## Usuarios demo
Se crean al iniciar el backend por primera vez:

- Cointra: `cointra@cointra.com` / `cointra123`
- Cliente: `cliente@cointra.com` / `cliente123`
- Tercero: `tercero@cointra.com` / `tercero123`

## Levantar backend
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

## Levantar frontend
En otra terminal:
```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

## Siguientes pasos recomendados
- Integrar API real de Avansat
- Cargue masivo de Excel (`RF-02`) y validaciones (`RF-03`)
- Flujo de aprobacion parcial por item con auditoria completa
- Notificaciones por correo y alerta interna
- Exportacion Excel/PDF por rol
- Despliegue con contenedores separados (frontend, backend, db)

## Politica de base de datos
- El proyecto corre solo sobre PostgreSQL.
- SQLite se mantiene unicamente para migracion historica one-time con el script `backend/scripts/migrate_sqlite_to_postgres.py`.
- No se debe usar `cointra.db` como base activa del backend.

Guia de preparacion para contenedores: `docs/CONTAINERS_READY.md`
