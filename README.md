# Sistema de Conciliacion - Cointra S.A.S.

Sistema web de conciliacion de servicios de transporte para Cointra S.A.S., operador logistico intermediario entre un Cliente (dueño de la carga) y un Tercero (transportador).

- Backend: FastAPI + SQLAlchemy 2 + Alembic + JWT + RBAC (roles fijos + permisos administrativos configurables)
- Frontend: React + TypeScript + Vite + TailwindCSS
- App movil: React Native + Expo (solo rol CLIENTE)
- Base de datos: PostgreSQL (obligatoria en desarrollo y produccion)

**Documentacion completa del sistema:** ver `CLAUDE.md` (arquitectura, reglas de negocio, roles y permisos, base de datos, estructura del proyecto). Este README solo cubre como levantar el entorno local.

## Estructura
- `backend/`: API, modelos, reglas de negocio y seguridad por rol
- `frontend/`: interfaz web (Cointra, Cliente, Tercero)
- `mobile/`: app movil Expo (solo Cliente)
- `docs/`: contexto adicional por dominio (backend, frontend, base de datos)

## Funcionalidades principales
- Autenticacion con JWT, roles `COINTRA` (con sub_rol `COINTRA_ADMIN`/`COINTRA_USER`), `CLIENTE`, `TERCERO`
- Panel de Roles y Permisos: CRUD administrativo configurable por rol (operaciones, clientes, terceros, vehiculos, servicios, catalogo de tarifas, viajes, Avansat, usuarios, roles)
- Conciliaciones: creacion, items, flujo de revision/aprobacion/devolucion, comentarios, historial
- Viajes adicionales: solicitud desde web o app movil, tarifa automatica por ruta, manifiesto PDF
- Catalogo de tarifas por servicio/tipo de vehiculo/ruta, con visibilidad financiera fija por rol
- Presencia en linea (solo COINTRA_ADMIN)
- Dashboard de KPIs y graficas por periodo y por rol
- Integracion Avansat (solo verificacion/cache, no modifica registros) y notificaciones por correo manual

## Usuario administrador (seed inicial)
Se crea automaticamente al iniciar el backend por primera vez (idempotente):

- `cgutierrez@cointra.com.co` / `admin123` (COINTRA_ADMIN)

## Levantar backend
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
uvicorn app.main:app --reload --port 8001
```

## Levantar frontend
En otra terminal:
```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

## Levantar app movil
En otra terminal:
```powershell
cd mobile
npm install
npx expo start
```

## Politica de base de datos
- El proyecto corre solo sobre PostgreSQL.
- SQLite se mantiene unicamente para migracion historica one-time con el script `backend/scripts/migrate_sqlite_to_postgres.py`.
- No se debe usar `cointra.db` como base activa del backend.

## Docker (entorno dev completo)
```bash
docker compose up --build
```
Guia de preparacion para contenedores: `docs/CONTAINERS_READY.md`
