# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Descripción General

Sistema web de conciliación de servicios de transporte para **Cointra S.A.S.**, operador logístico intermediario entre un Cliente (dueño de la carga) y un Tercero (transportador). Cointra cobra al cliente, retiene su rentabilidad y paga al tercero.

**Estado actual:** En desarrollo activo (rama dev, localhost). Producción en `docker-prod-v1.2` no debe tocarse hasta completar los nuevos bloques.

**Stack:** Python 3.13 + FastAPI 0.115 + SQLAlchemy 2 + Alembic | PostgreSQL 16 | React 18 + TypeScript 5.6 + Vite 5 + TailwindCSS 3 | Docker Compose
**App móvil (nueva):** React Native + Expo — solo para rol CLIENTE

---

## Reglas Estructurales No Negociables

1. **Ningún archivo puede superar 1000 líneas.** Si un archivo se acerca a ese límite, dividirlo en módulos con nombres descriptivos y mantener las importaciones conectadas.
2. **Toda validación va en el backend.** El frontend solo presenta — nunca valida reglas de negocio.
3. **Lógica de negocio solo en `services/`**, nunca en routers ni en schemas.
4. **`sanitize_item_for_role()`** debe aplicarse antes de retornar cualquier servicio/ítem en cualquier endpoint.
5. **Sub_rol verificado además del rol** en todos los endpoints de edición/eliminación.

---

## Arquitectura

```
[React SPA]  ──VITE_API_URL──►  [FastAPI :8001]  ──►  [PostgreSQL 16 :5434]
[Expo App]   ──API_URL──────►         │
                                      │
                              [API Avansat externa]  ← solo verificación y generación Excel
                              [SMTP smtplib]         ← notificaciones manuales únicamente
```

- **Dev:** PostgreSQL:5434, backend:8001, frontend:5174 (HMR con volumen montado)
- **Prod:** backend:8001, frontend:3000 (Nginx sirve SPA estática, sin proxy `/api`)

> **Nota prod:** `nginx.conf` solo sirve la SPA (`try_files`). Las llamadas al backend van directamente a `VITE_API_URL` (baked en build-time). El enrutamiento de dominio a puertos es responsabilidad de infraestructura externa al repo.

> **Avansat:** Solo sirve para verificar información y generar archivos Excel. **No afecta ningún registro del sistema.** No crea, modifica ni sincroniza servicios.

---

## Comandos de Desarrollo

**Backend:**
```bash
cd backend
python -m venv venv && venv\Scripts\Activate.ps1   # Windows
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head   # OBLIGATORIO antes de iniciar
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend && npm install
cp .env.example .env   # VITE_API_URL=http://127.0.0.1:8001/api
npm run dev
```

**App móvil:**
```bash
cd mobile && npm install
npx expo start
```

**Docker (dev completo):**
```bash
docker compose up --build
```

**Migraciones:**
```bash
cd backend
alembic revision --autogenerate -m "descripcion"
alembic upgrade head
alembic downgrade -1
```

No hay suite de tests configurada.

---

## Variables de Entorno

**`backend/.env`:**
- `SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES=480`
- `DATABASE_URL` o `POSTGRES_HOST/PORT/DB/USER/PASSWORD` — PostgreSQL obligatorio
- `CORS_ORIGINS`, `FRONTEND_URL`
- `SMTP_ENABLED=false`, `SMTP_HOST/PORT/USER/PASSWORD/USE_TLS/MAIL_FROM`
- `AVANSAT_ENABLED=false`, `AVANSAT_URL`, `AVANSAT_AUTH_HEADER`, `AVANSAT_USER`, `AVANSAT_PASS`

**`frontend/.env`:** solo `VITE_API_URL`.
**`mobile/.env`:** solo `API_URL`.

**Seed inicial:** `cgutierrez@cointra.com.co` / `admin123` (COINTRA_ADMIN)

---

## Roles, Permisos y Visibilidad

### Visibilidad de campos financieros (regla no negociable)

| Campo          | COINTRA_ADMIN | COINTRA_USER | CLIENTE | TERCERO |
|----------------|:---:|:---:|:---:|:---:|
| tarifa_cliente | ✅ | ✅ | ✅ | ❌ |
| tarifa_tercero | ✅ | ✅ | ❌ | ✅ |
| rentabilidad   | ✅ | ✅ | ❌ | ❌ |

Implementado en `backend/app/services/visibility.py` → `sanitize_item_for_role()`. Aplica en responses de API, exports Excel/PDF y correos.

### Permisos por rol

- **COINTRA_ADMIN:** CRUD completo en todo. Puede editar cualquier registro en cualquier estado.
- **COINTRA_USER:** Crea viajes (carga masiva), conciliaciones, vehículos. Edita servicios en BORRADOR. NO elimina ni gestiona catálogos de usuarios/clientes/terceros/operaciones.
- **CLIENTE:** Solo crea y ve sus **viajes adicionales**. Ve conciliaciones que le corresponden. No accede a ningún otro tipo de servicio.
- **TERCERO:** Carga servicios propios (conductor relevo, descargue, disponibilidad, estibas). Edita sus servicios solo si NO están asociados a una conciliación. Puede crear vehículos propios (validado por `tercero_id`). NO crea conciliaciones.

---

## Tipos de Servicio

El sistema maneja 6 tipos de servicio como `ConciliacionItem`:

| Tipo | ¿Quién lo carga? | ¿Tiene tarifa fija? | ¿Tiene manifiesto PDF? |
|------|---|---|---|
| `VIAJE` | COINTRA (carga masiva) | No — valor libre | No |
| `VIAJE_ADICIONAL` | CLIENTE (solicitud formal) | Sí — tarifario por ruta | **Sí — obligatorio, resalta rojo si falta** |
| `HORA_EXTRA` | TERCERO | Sí — tarifa fija | No |
| `CONDUCTOR_RELEVO` | TERCERO | No — valor libre | No |
| `DESCARGUE` | TERCERO | No — valor libre | No |
| `DISPONIBILIDAD` | TERCERO | No — valor libre | No |
| `ESTIBADA` | TERCERO | No — valor libre | No |

> `VIAJE` es parte del contrato fijo de la operación. `VIAJE_ADICIONAL` es solicitado por el cliente fuera de la operación normal.

### Visibilidad de registros por rol (regla no negociable)

- **CLIENTE:** ve todos los servicios de sus propias operaciones, sin importar qué tercero esté asignado. Filtro: `operacion.cliente_id = usuario.cliente_id`.
- **TERCERO:** ve todos los servicios en los que él participa, sin importar qué cliente sea. Filtro: `operacion.tercero_id = usuario.tercero_id`.
- **COINTRA_ADMIN / COINTRA_USER:** ven todo.

Implementado en `backend/app/services/visibility.py`. El filtrado por `cliente_id` / `tercero_id` se aplica **en la query de BD**, no en el serializador. Aplica en listados, detalle, exports y correos.

---

## Estados

### Estados de servicios (todos los tipos)

```
PENDIENTE → EN_CONCILIACION → APROBADO
                           → RECHAZADO → PENDIENTE  (regresa para corrección)
```

- `PENDIENTE`: cargado al sistema, fuera de cualquier conciliación
- `EN_CONCILIACION`: incluido en una conciliación activa
- `APROBADO`: aprobado dentro de la conciliación
- `RECHAZADO`: rechazado, regresa automáticamente a `PENDIENTE`

> Los viajes adicionales sin manifiesto no tienen estado especial — se indica visualmente en rojo. No bloquea el flujo pero es una alerta.

### Estados de conciliación

```
BORRADOR → ENVIADA → EN_REVISION_CLIENTE → APROBADA → CERRADA
                   ↘ DEVUELTA → BORRADOR (Cointra corrige y reenvía)
                                                     ↘ ANULADA (en cualquier momento desde BORRADOR)
```

- `BORRADOR`: Cointra la está armando
- `ENVIADA`: enviada al cliente para revisión
- `EN_REVISION_CLIENTE`: cliente la está revisando
- `DEVUELTA`: cliente la rechazó con comentarios — requiere campo `motivo_devolucion`
- `APROBADA`: cliente y Cointra de acuerdo
- `CERRADA`: archivada, proceso terminado
- `ANULADA`: cancelada — los servicios regresan automáticamente a `PENDIENTE`; la conciliación queda como registro histórico de solo lectura

---

## Flujo de Viaje Adicional (nuevo)

1. **Cliente solicita** via web o app móvil: fecha, hora de cita, tercero asignado, tipología de vehículo, tipo de producto, origen, destino (municipios Colombia), tipo de viaje (ida / ida y vuelta), placa opcional (vehículos del tercero).
2. **Sistema aplica tarifa** desde `tarifas_ruta` según origen + destino + tipología + tipo de viaje → `tarifa_cliente`.
3. **Si no hay tarifa en el tarifario**, el tercero ingresa su `tarifa_tercero` manualmente.
4. **Sistema calcula** `tarifa_cliente`, `tarifa_tercero`, `rentabilidad` según regla de negocio central.
5. **Cointra sube manifiesto PDF** — bot extrae número de manifiesto y lo asocia al viaje adicional.
6. **Manifiesto descargable** por cualquier usuario con acceso al viaje adicional.
7. **Si no hay manifiesto**, el viaje adicional resalta en rojo en todas las vistas.
8. **Sigue el flujo normal** de conciliación.

---

## Regla de Negocio Central

```python
# Sin descuento:
tarifa_tercero = tarifa_cliente × (1 - % rentabilidad / 100)

# Con descuento habilitado en la operación:
valor_real_cliente = tarifa_cliente - descuento_valor
rentabilidad       = tarifa_cliente × (% / 100)   # siempre sobre tarifa original
tarifa_tercero     = valor_real_cliente - rentabilidad
```

Implementada en `backend/app/services/pricing.py`.

---

## Base de Datos — Tablas Principales

PostgreSQL 16. Soft deletes via campo `activo`. IDs `int autoincrement`, timestamps `created_at`/`updated_at`.

**Catálogos:**
- `usuarios`: email, hashed_password, rol, sub_rol, token_version (invalida JWTs en logout)
- `clientes`, `terceros`: entidades vinculadas a usuarios
- `operaciones`: vincula cliente + tercero + % rentabilidad + descuento opcional
- `vehiculos`: placa, tipo, vinculados a tercero
- `servicios`: catálogo de servicios con código auto-generado desde iniciales en mayúscula del nombre
- `municipios_colombia`: tabla de los 1,122 municipios — usar como FK en origen/destino de viajes adicionales

**Operativa:**
- `conciliacion_items`: todos los tipos de servicio (viaje, viaje_adicional, hora_extra, etc.) con estado, item_tipo, tarifas, y campos específicos por tipo
- `conciliaciones`: contenedor con estado, período, motivo_devolucion
- `viajes_adicionales_solicitud`: solicitud formal del cliente antes de convertirse en item (<!-- TODO: evaluar si merge con conciliacion_items o tabla separada -->)

**Tarifas:**
- `tarifas_ruta`: nombre, origen (FK municipios), destino (FK municipios), tipologia_vehiculo, tipo_viaje (IDA/IDA_VUELTA), precio_cliente, vigencia_desde, vigencia_hasta
- `catalogo_tarifa`: tarifa de hora extra (valor fijo)

**Soporte:**
- `manifiestos_viaje_adicional`: archivo PDF, número de manifiesto extraído, asociado a viaje adicional
- `notificaciones`, `comentarios`, `historial_cambios` (audit trail — quién cambió qué estado y cuándo)
- `factura_archivo_cliente`: archivos Excel/PDF adjuntos a conciliaciones
- `manifiestos_avansat`, `avansat_cache`: solo para verificación externa, sin efecto en lógica

<!-- VERIFICADO → catalogo_tarifa no tiene FK a conciliacion_items en ninguna migración existente (12 migraciones revisadas) -->
<!-- VERIFICADO → usuarios.cliente_id y usuarios.tercero_id son FK directas a clientes/terceros (nullable). Tabla intermedia usuario_operaciones_asignadas para many-to-many usuario↔operación -->
<!-- PENDIENTE IMPLEMENTAR → ConciliacionEstado en BD solo tiene: BORRADOR, EN_REVISION, APROBADA, CERRADA. Faltan: ENVIADA, EN_REVISION_CLIENTE, DEVUELTA, ANULADA -->
<!-- VERIFICADO → código de servicio generado en backend/app/api/routes/servicios.py líneas 22-25: convierte nombre completo a mayúsculas ASCII y reemplaza no-alfanuméricos por _. Ejemplo: "Hora Extra" → "HORA_EXTRA". NO son iniciales. Unicidad validada por nombre Y código antes de insertar -->

---

## Estructura del Proyecto

### Estado actual — post Bloque 0 (verificado con Docker ✅)

```
backend/app/
  api/routes/
    conciliaciones.py              # Aggregator — 11 líneas, solo importa sub-routers ✅
    conciliaciones_core.py         # 14 endpoints core (crear, listar, detalle, borrador...) ✅
    conciliaciones_items.py        # 8 endpoints de ítems ✅
    conciliaciones_workflow.py     # 9 endpoints de flujo y comentarios ✅
    conciliaciones_excel.py        # _build_conciliacion_excel refactorizado con _ExcelContext ✅
    conciliaciones_excel_renders.py # _ExcelContext NamedTuple + 11 funciones _xl_* ✅
    conciliaciones_excel_legacy.py # _build_facturacion_excel + legacy (dead code candidato) ✅
    conciliaciones_helpers.py      # ~24 funciones privadas de utilidad — 665 líneas ✅
    viajes.py                      # ⚠️ ZONA DE RIESGO: 956 líneas — vigilar al tocar
    catalogs.py                    # Usuarios, clientes, terceros, operaciones
    servicios.py                   # Catálogo de servicios — contiene _to_codigo()
    dashboard.py                   # KPIs y métricas diferenciadas por rol
    notificaciones.py              # Inbox interno + envío manual de correo
  models/
    enums.py                 # UserRole, CointraSubRol, ConciliacionEstado, ItemTipo, ItemEstado
                             # Estados actuales: BORRADOR/EN_REVISION/APROBADA/CERRADA + PENDIENTE/EN_REVISION/APROBADO/RECHAZADO
    usuario.py               # FK directas: cliente_id, tercero_id (nullable)
    conciliacion.py          # Modelos ORM de conciliaciones e ítems
    catalogs.py              # Modelos ORM de clientes, terceros, operaciones, etc.
  schemas/                   # Pydantic separados por Create / Update / Response
  services/
    visibility.py            # sanitize_item_for_role() — SIEMPRE aplicar antes de retornar datos
    pricing.py               # Cálculo de tarifas y rentabilidad
    notifications.py         # Email (smtplib) + notificaciones internas
    avansat.py               # Cliente HTTP Avansat — solo verificación y Excel
    avansat_cache.py         # sync_avansat_yesterday_today()
    audit.py                 # Registro en historial_cambios
  core/
    config.py                # Settings (pydantic-settings, carga .env)
    security.py              # JWT (python-jose) + bcrypt (passlib)
  db/
    seed.py                  # Crea admin inicial si no existe
  alembic/versions/          # 12 migraciones existentes (no tocar sin nueva revisión)

frontend/src/
  pages/DashboardPage.tsx         # Hub principal
  services/api.ts                 # Cliente HTTP centralizado (fetch nativo; token en localStorage)
  types/index.ts                  # Interfaces TypeScript de todas las entidades
  utils/permissions.ts            # Visibilidad de campos por rol
  utils/formatters.ts             # formatCOP() para moneda colombiana
```

### Archivos nuevos a crear (pendientes de implementación)

```
backend/app/
  api/routes/
    conciliaciones_estado.py     # Transiciones de estado (extraído de conciliaciones.py)
    conciliaciones_items.py      # CRUD de ítems (extraído de conciliaciones.py)
    conciliaciones_archivos.py   # Archivos adjuntos (extraído de conciliaciones.py)
    viajes_adicionales.py        # Solicitudes de viajes adicionales (nuevo)
    tarifas_ruta.py              # CRUD tarifario de rutas (nuevo)
    manifiestos.py               # Upload PDF + extracción número manifiesto (nuevo)
    reportes.py                  # Exportación Excel/XLSX (nuevo)
    presence.py                  # Heartbeat y usuarios en línea (nuevo)
  models/
    viaje_adicional.py           # ORM viajes adicionales (nuevo)
    tarifa_ruta.py               # ORM tarifario de rutas (nuevo)
    municipio.py                 # ORM municipios Colombia — 1122 registros seed (nuevo)
  services/
    manifiesto_parser.py         # Extracción número manifiesto desde PDF (nuevo)
    reportes_service.py          # Lógica generación Excel (nuevo)
    presence.py                  # Lógica umbral heartbeat (nuevo)

frontend/src/
  pages/
    ViajesAdicionalesPage.tsx    # Lista y gestión (nuevo)
    TarifasRutaPage.tsx          # Tarifario — solo COINTRA_ADMIN (nuevo)
    ReportesPage.tsx             # Exportación reportes (nuevo)
  components/
    MunicipioSelector.tsx        # Selector búsqueda municipios Colombia (nuevo)
    ManifiestoUpload.tsx         # Upload PDF manifiesto (nuevo)
    VehiculoSelector.tsx         # Selector vehículos del tercero (nuevo)
    UserStatusIndicator.tsx      # Punto verde parpadeante presencia (nuevo)

mobile/                          # React Native + Expo — solo CLIENTE (nuevo, repo separado)
  app/
    (auth)/login.tsx
    (tabs)/solicitudes.tsx
    (tabs)/nueva-solicitud.tsx
  components/
    MunicipioSelector.tsx
    ManifiestoViewer.tsx
  services/api.ts
```

---

## Comportamiento de Inicio (Backend)

En `startup_event()` (`app/main.py`):
1. Valida que exista la tabla `usuarios` — lanza `RuntimeError` si no hay migraciones
2. Ejecuta `seed_data()` — crea admin por defecto y carga municipios Colombia si no existen (idempotente)
3. Si `AVANSAT_ENABLED=true`, arranca hilo daemon que llama `sync_avansat_yesterday_today()` cada 1800 s

---

## Exportación de Reportes

Módulo nuevo `reportes.py` + `reportes_service.py`. Exportación en **XLSX** de:
- Lista de servicios por operación y período (con filtros por tipo, estado, tercero, cliente)
- Conciliaciones (detalle de ítems, tarifas según visibilidad de rol)
- Viajes adicionales (con estado de manifiesto)
- Dashboard KPIs

La visibilidad de campos financieros aplica igualmente en los exports según el rol que exporta.

---

## Convenciones de Código

**Backend:** `snake_case`; lógica de negocio solo en `services/`; schemas Pydantic separados por operación (Create / Update / Response); un archivo de modelo ORM por dominio; máximo 1000 líneas por archivo.

**Frontend:** componentes en `PascalCase`; hooks con prefijo `use`; TailwindCSS para todo, sin CSS externo; `formatCOP()` para moneda; nunca validar reglas de negocio en el frontend.

**BD:** IDs `int autoincrement`, timestamps `created_at`/`updated_at`, soft deletes con campo `activo`, campos opcionales como `nullable`.

**Código de servicio:** generado en `backend/app/api/routes/servicios.py` función `_to_codigo()`. Convierte el nombre completo a mayúsculas ASCII y reemplaza caracteres no alfanuméricos por `_`. Ejemplo: `"Hora Extra"` → `"HORA_EXTRA"`. Unicidad validada por nombre Y código antes de insertar. **No son iniciales** — es el nombre completo normalizado.

---

## Integraciones Externas

- **Avansat** (`AVANSAT_ENABLED`): solo para verificación de información y generación de Excel. No afecta registros del sistema.
- **SMTP** (`SMTP_ENABLED`): correos siempre manuales (botón en UI). SMTP_ENABLED=false en dev.
- **Parser PDF manifiestos** (`services/manifiesto_parser.py`): extrae número de manifiesto del PDF subido por Cointra. Formato de manifiesto a definir — pendiente de muestra para calibrar el parser.

---

## App Móvil — React Native + Expo

- Audiencia: **solo rol CLIENTE**
- Funcionalidades: crear solicitudes de viajes adicionales, ver lista con filtros por cualquier campo, ver estado del viaje, descargar/ver PDF del manifiesto
- Filtros disponibles: placa, nombre de tarifa, origen, destino, estado (PENDIENTE, EN_CONCILIACION, APROBADO, RECHAZADO), fecha
- Misma API del backend — no hay endpoints exclusivos para móvil
- Autenticación: JWT igual que web

---

## Presencia en Línea (solo COINTRA_ADMIN)

El super admin puede ver en tiempo real qué usuarios están conectados al sistema.

**Comportamiento:**
- Cada usuario autenticado envía un **heartbeat** al backend cada 30 segundos (llamada ligera a `POST /api/presence/heartbeat`).
- El backend registra `ultimo_heartbeat` en la tabla `usuarios` (o tabla separada `user_presence`).
- Un usuario se considera **en línea** si su `ultimo_heartbeat` tiene menos de 60 segundos de antigüedad.
- En la vista de gestión de usuarios (solo COINTRA_ADMIN), cada usuario muestra un **punto verde parpadeante** si está en línea, o un punto gris si está desconectado.
- El frontend consulta `GET /api/presence/online` cada 30 segundos para actualizar el estado visual (polling simple, sin WebSockets).

**Implementación:**
- `backend/app/api/routes/presence.py` — endpoints `heartbeat` y `online`
- `backend/app/services/presence.py` — lógica de umbral de tiempo
- Frontend: componente `UserStatusIndicator.tsx` con animación CSS `animate-pulse` de Tailwind
- Solo COINTRA_ADMIN puede consultar `GET /api/presence/online` — los demás roles reciben 403

**BD:** campo `ultimo_heartbeat: DateTime nullable` en tabla `usuarios`, o tabla separada `user_presence(usuario_id, ultimo_heartbeat)`.

---

## Lo que el sistema NO hace

- No genera facturas electrónicas (solo autoriza para facturar)
- No envía correos automáticos (siempre manuales)
- No tiene periodicidad fija de conciliación (período libre)
- Avansat no crea ni modifica ningún registro del sistema

---

## Documentación Adicional

Leer antes de hacer cambios en lógica de negocio:
- `docs/CONTEXT_GENERAL.md` — reglas de negocio, flujo completo, actores
- `docs/CONTEXT_DATABASE.md` — esquema PostgreSQL completo
- `docs/CONTEXT_BACKEND.md` — endpoints y servicios detallados
- `docs/CONTEXT_FRONTEND.md` — componentes y patrones UX
