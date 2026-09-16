# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Descripción General

Sistema web de conciliación de servicios de transporte para **Cointra S.A.S.**, operador logístico intermediario entre un Cliente (dueño de la carga) y un Tercero (transportador). Cointra cobra al cliente, retiene su rentabilidad y paga al tercero.

**Estado actual:** En desarrollo activo (rama dev, localhost). Producción en `docker-prod-v1.2` no debe tocarse hasta completar los nuevos bloques.

**Stack:** Python 3.13 + FastAPI 0.115 + SQLAlchemy 2 + Alembic | PostgreSQL 16 | React 18 + TypeScript 5.6 + Vite 5 + TailwindCSS 3 | Docker Compose
**App móvil:** React Native + Expo (SDK 57) — implementada, solo para rol CLIENTE (crear/consultar viajes adicionales, autogestionar tarifas de ruta y ver manifiestos)

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

### Permisos por rol (identidad de negocio — fija, no editable vía UI)

- **COINTRA_ADMIN:** CRUD completo en todo. Puede editar cualquier registro en cualquier estado. `es_superadmin=True` en el modelo `Rol`: bypass total de `tiene_permiso()`.
- **COINTRA_USER:** Crea viajes (carga masiva), conciliaciones, vehículos. Edita servicios en BORRADOR. Qué catálogos administrativos puede además crear/editar/desactivar (operaciones, clientes, terceros, vehículos, servicios, catálogo de tarifas, viajes, Avansat) depende de los permisos que un COINTRA_ADMIN le asigne — ver "Permisos administrativos configurables" abajo.
- **CLIENTE:** Solo crea y ve sus **viajes adicionales**. Ve conciliaciones que le corresponden, y solo desde que Cointra las envía a revisión (nunca ve conciliaciones en BORRADOR — ni en listados, ni en el dashboard). No accede a ningún otro tipo de servicio.
- **TERCERO:** Carga servicios propios (conductor relevo, descargue, disponibilidad, estibas). Edita sus servicios solo si NO están asociados a una conciliación. Puede crear vehículos y tipos de vehículo propios (validado por `tercero_id`) — esto es fijo, no depende de permisos. NO crea conciliaciones.

Esta clasificación de negocio (rol + sub_rol) es fija y no se edita desde el panel de Roles y Permisos — ver `backend/app/core/permisos_catalog.py` (docstring) para el detalle de qué es regla fija vs. qué es permiso configurable.

### Permisos administrativos configurables (panel Roles y Permisos)

Además de la identidad de negocio fija de arriba, existe un segundo nivel de permisos **sí editable** desde `/roles` (solo visible con el permiso `roles.ver`/`roles.gestionar`), que gobierna el CRUD de catálogos administrativos: Usuarios, Roles, Presencia, Operaciones, Clientes, Terceros, Vehículos/Tipos de vehículo, Servicios, Catálogo de Tarifas, Viajes y Consulta Avansat.

- **Modelos:** `Rol` / `Permiso` (many-to-many vía `rol_permisos`), `Usuario.rol_id` (se resincroniza automáticamente con `sync_rol_id()` cada vez que cambian `rol`/`sub_rol`).
- **Catálogo canónico:** `backend/app/core/permisos_catalog.py` — lista de permisos, roles base y sus permisos por defecto (`PERMISOS_POR_ROL_DEFECTO`). Agregar un permiso nuevo aquí no requiere migración — `seed_data()` lo inserta de forma idempotente en cada arranque, y hace *backfill* automático a roles existentes si el permiso es nuevo.
- **Servicio:** `backend/app/services/permisos_service.py` — `tiene_permiso(db, usuario, clave)` y `permisos_de_usuario(db, usuario)` (esta última alimenta `permisos: string[]` en `/auth/me`, que el frontend usa para decidir qué mostrar).
- **Dependency FastAPI:** `require_permission(clave)` en `app/api/deps.py` — usar en vez de chequeos de rol embebidos para cualquier acción administrativa nueva.
- **Frontend:** `frontend/src/utils/permisos.ts` (`hasPermiso`/`hasAlgunPermiso`); `Sidebar.tsx` y las rutas gateadas en `App.tsx` (`RequirePermiso`) muestran/bloquean módulos según el permiso real del usuario, no según su rol — así un Cliente al que se le concede un permiso puntual (ej. `catalogo_tarifas.ver`) ve exactamente ese módulo.
- **Regla que NO se toca aquí:** un permiso administrativo nunca cambia la visibilidad financiera fija (tabla de arriba). Ej.: aunque se le conceda `catalogo_tarifas.crear` a un Cliente, `rentabilidad_pct`/`tarifa_tercero` siguen ocultos para él en la respuesta del backend — ver `_to_out()` en `backend/app/api/routes/tarifas.py`.

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

## Flujo de Viaje Adicional

1. **Cliente solicita** vía web o app móvil: fecha, tercero asignado, tipo de vehículo, origen/destino (texto libre, sin FK a municipios), placa opcional (vehículos del tercero). Modelo: `SolicitudViajeAdicional` (`app/models/viaje_adicional.py`), endpoints en `app/api/routes/viajes_adicionales.py`.
2. **Sistema busca tarifa** en `catalogo_tarifas` (la misma tabla del Catálogo de Tarifas administrativo — no existe tabla separada `tarifas_ruta`) filtrando por servicio VIAJE_ADICIONAL + tipo de vehículo + origen/destino → `tarifa_cliente`.
3. **Si no hay tarifa registrada**, la web/app bloquea el envío de la solicitud (decisión de producto explícita) y ofrece crear la tarifa faltante ahí mismo: el Cliente solo ingresa `tarifa_cliente`, el sistema calcula `tarifa_tercero`/`rentabilidad_pct` con el % por defecto (`DEFAULT_RENTABILIDAD_PCT` en `services/pricing.py`) — un Cliente nunca puede fijar ni ver la rentabilidad, ni siquiera con permisos administrativos (ver `_ensure_puede_crear` en `tarifas.py`).
4. **Sistema calcula** `tarifa_cliente`, `tarifa_tercero`, `rentabilidad_pct` según la Regla de Negocio Central.
5. **Cointra sube manifiesto PDF** (`ManifiestoViajeAdicional`) — el número de manifiesto se ingresa **manualmente** por ahora; el parser automático (`services/manifiesto_parser.py`) sigue pendiente de una muestra real del formato para calibrarse.
6. **Manifiesto descargable** por cualquier usuario con acceso a la solicitud.
7. **Si no hay manifiesto**, el viaje adicional resalta en rojo en todas las vistas.
8. **Al convertirse en `Viaje`/`ConciliacionItem`** (`services/viaje_adicional_conversion.py`), sigue el flujo normal de conciliación.

`EstadoGestionViajeAdicional` es un campo **computado** (no persistido) que resume dónde va la solicitud: `PENDIENTE_TARIFA → PENDIENTE_MANIFIESTO → SIN_CONCILIAR → EN_BORRADOR/EN_REVISION/APROBADA/CONCILIADO` — distinto del campo manual `estado` (`ItemEstado`).

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
- `usuarios`: email, hashed_password, rol, sub_rol, `rol_id` (FK a `roles`, resincronizada por `sync_rol_id()`), token_version (invalida JWTs en logout)
- `clientes`, `terceros`: entidades vinculadas a usuarios
- `operaciones`: vincula cliente + tercero + % rentabilidad + descuento opcional
- `vehiculos`, `tipos_vehiculo`: placa/tipo vinculados a tercero
- `servicios`: catálogo de servicios con código auto-generado desde el nombre completo normalizado

**Roles y permisos (panel administrativo configurable):**
- `roles`: los 4 roles base sembrados (`COINTRA_ADMIN` con `es_superadmin=True`, `COINTRA_USER`, `CLIENTE`, `TERCERO`) — no hay roles "custom"
- `permisos`: catálogo de claves (`operaciones.crear`, `catalogo_tarifas.editar`, etc.) — ver `permisos_catalog.py`
- `rol_permisos`: tabla intermedia many-to-many entre `roles` y `permisos`

**Operativa:**
- `conciliacion_items`: todos los tipos de servicio (viaje, viaje_adicional, hora_extra, etc.) con estado, item_tipo, tarifas, y campos específicos por tipo
- `conciliaciones`: contenedor con estado, período, `enviada_facturacion`/`factura_cliente_enviada` (booleanos, no forman parte del enum de estado — ver nota abajo)
- `viajes_adicionales_solicitud`: solicitud formal del cliente, tabla separada de `conciliacion_items` (decisión ya tomada, no pendiente) — se convierte en `Viaje`/`ConciliacionItem` vía `services/viaje_adicional_conversion.py` una vez tiene tarifa y manifiesto

**Tarifas:**
- `catalogo_tarifas`: tabla única y reutilizada para todo el catálogo — `servicio_id`, `tipo_vehiculo_id`, `origen`/`destino` (texto libre, solo obligatorios y usados cuando el servicio es VIAJE_ADICIONAL), `tarifa_cliente`, `rentabilidad_pct`, `tarifa_tercero` (calculada). No existe una tabla `tarifas_ruta` separada — fue una decisión explícita de reusar `catalogo_tarifas` en vez de crear un modelo nuevo.

**Soporte:**
- `manifiestos_viaje_adicional`: archivo PDF (`LargeBinary`), número de manifiesto ingresado manualmente por ahora, asociado 1:1 a una solicitud de viaje adicional
- `notificaciones`, `comentarios`, `historial_cambios` (audit trail — quién cambió qué estado y cuándo)
- `factura_archivo_cliente`: archivos Excel/PDF adjuntos a conciliaciones
- `manifiestos_avansat`, `avansat_cache`: solo para verificación externa, sin efecto en lógica

<!-- VERIFICADO → catalogo_tarifas no tiene FK a conciliacion_items en ninguna migración existente -->
<!-- VERIFICADO → usuarios.cliente_id y usuarios.tercero_id son FK directas a clientes/terceros (nullable). Tabla intermedia usuario_operaciones_asignadas para many-to-many usuario↔operación — es el mecanismo REAL de visibilidad de un Cliente sobre sus operaciones (no "todas las operaciones con ese cliente_id"), usado consistentemente en conciliaciones_core.py, viajes.py y dashboard.py -->
<!-- VERIFICADO → ConciliacionEstado (enum en BD) solo tiene: BORRADOR, EN_REVISION, APROBADA, CERRADA. Los estados ENVIADA/DEVUELTA/ANULADA del diagrama de abajo NO son valores del enum: "enviada a facturar" se modela con el booleano enviada_facturacion (+ factura_cliente_enviada para distinguir facturada), y "devuelta" se infiere de un historial_cambios con campo="devolucion_cliente" (devolver_conciliacion_cliente() deja el estado en BORRADOR otra vez) — ver _sanitize y el conteo de conc_devuelta en dashboard.py, que solo cuenta como Devuelta si SIGUE en BORRADOR sin corregir -->
<!-- VERIFICADO → código de servicio generado en backend/app/api/routes/servicios.py función _to_codigo(): convierte nombre completo a mayúsculas ASCII y reemplaza no-alfanuméricos por _. Ejemplo: "Hora Extra" → "HORA_EXTRA". NO son iniciales. Unicidad validada por nombre Y código antes de insertar -->

---

## Estructura del Proyecto

### Estado actual

```
backend/app/
  api/routes/
    conciliaciones.py              # Aggregator — solo importa sub-routers
    conciliaciones_core.py         # Endpoints core (crear, listar, detalle, borrador...)
    conciliaciones_items.py        # Endpoints de ítems
    conciliaciones_workflow.py     # Endpoints de flujo y comentarios
    conciliaciones_excel.py        # _build_conciliacion_excel con _ExcelContext
    conciliaciones_excel_renders.py # _ExcelContext NamedTuple + funciones _xl_*
    conciliaciones_excel_legacy.py # _build_facturacion_excel + legacy (dead code candidato)
    conciliaciones_helpers.py      # Funciones privadas de utilidad
    viajes.py                      # ⚠️ ZONA DE RIESGO: >900 líneas — vigilar al tocar; incluye carga masiva Excel
    viajes_adicionales.py          # Solicitudes de viajes adicionales (crear, listar, tarifa, manifiesto)
    catalogs.py                    # Usuarios, clientes, terceros, operaciones
    vehiculos.py                   # Vehículos y tipos de vehículo
    servicios.py                   # Catálogo de servicios — contiene _to_codigo()
    tarifas.py                     # Catálogo de tarifas (incluye rutas de VIAJE_ADICIONAL)
    roles.py                       # Roles y permisos administrativos configurables
    presence.py                    # Heartbeat y usuarios en línea
    avansat.py                     # Consulta y sincronización de cache Avansat
    dashboard.py                   # KPIs y métricas diferenciadas por rol (>800 líneas — vigilar)
    notificaciones.py              # Inbox interno + envío manual de correo
  models/
    enums.py                 # UserRole, CointraSubRol, ConciliacionEstado, ItemTipo, ItemEstado
    usuario.py                # FK directas: cliente_id, tercero_id, rol_id (nullable)
    rol.py, permiso.py         # Roles y permisos administrativos configurables
    viaje_adicional.py         # SolicitudViajeAdicional
    manifiesto_viaje_adicional.py
    catalogo_tarifa.py         # Incluye origen/destino/tipo_vehiculo_id para rutas de VIAJE_ADICIONAL
    conciliacion.py            # Modelos ORM de conciliaciones e ítems
    catalogs.py                # Modelos ORM de clientes, terceros, operaciones, etc.
  schemas/                     # Pydantic separados por Create / Update / Response
  services/
    visibility.py             # sanitize_item_for_role() — SIEMPRE aplicar antes de retornar datos
    pricing.py                # Cálculo de tarifas y rentabilidad (DEFAULT_RENTABILIDAD_PCT)
    permisos_service.py       # tiene_permiso(), permisos_de_usuario(), sync_rol_id()
    presence_service.py       # Lógica de umbral de heartbeat
    viaje_adicional_conversion.py  # Convierte una solicitud aprobada en Viaje/ConciliacionItem
    rate_limit.py             # Rate limiting de intentos de login
    notifications.py          # Email (smtplib) + notificaciones internas
    avansat.py                # Cliente HTTP Avansat — solo verificación y Excel
    avansat_cache.py          # sync_avansat_yesterday_today()
    audit.py                  # Registro en historial_cambios
  core/
    config.py                 # Settings (pydantic-settings, carga .env)
    security.py                # JWT (python-jose) + bcrypt (passlib)
    permisos_catalog.py         # Catálogo canónico de permisos/roles base — ver seed_data()
    upload_limits.py            # Límites de tamaño de archivo (ver Deuda Técnica)
  db/
    seed.py                    # Crea admin inicial + siembra roles/permisos, idempotente
  alembic/versions/            # No tocar migraciones existentes sin nueva revisión

frontend/src/
  pages/
    DashboardHomePage.tsx      # KPIs y gráficas (SVG propios, sin librería de charts)
    DashboardPage.tsx          # Gestión de conciliaciones (lista, workflow, Excel)
    RolesPage.tsx              # Panel de Roles y Permisos — checkboxes + botón "Guardar cambios"
    ViajesAdicionalesPage.tsx
    CatalogoTarifasPage.tsx    # Incluye filtros por servicio/tipo de vehículo/ruta
    OperacionesPage.tsx, ClientesPage.tsx, TercerosPage.tsx, VehiculosPage.tsx, ServiciosPage.tsx, UsuariosPage.tsx, AvansatPage.tsx
  components/
    layout/Sidebar.tsx         # Ítems fijos por rol + ítems condicionados a permisos (PERMISSION_NAV_ITEMS)
    common/UserStatusIndicator.tsx  # Punto verde parpadeante de presencia
  services/api.ts               # Cliente HTTP centralizado (fetch nativo; token `refrigerados_token` en localStorage)
  types/index.ts                 # Interfaces TypeScript de todas las entidades
  utils/permisos.ts              # hasPermiso() / hasAlgunPermiso() — permisos administrativos configurables
  utils/formatters.ts            # formatCOP() para moneda colombiana

mobile/                          # React Native + Expo SDK 57 — solo CLIENTE, implementada
  app/
    (auth)/                     # login, bienvenida
    (tabs)/solicitudes.tsx, nueva-solicitud.tsx
    tarifas.tsx                 # Autogestión de tarifas de ruta faltantes (solo tarifa_cliente)
    manifiesto/[id].tsx         # Visor de PDF (WebView / Intent según plataforma)
  src/api.ts, src/auth.tsx, src/theme.ts
```

### Pendiente / no iniciado

- `services/manifiesto_parser.py` — extracción automática del número de manifiesto desde el PDF; hoy se ingresa manualmente. Pendiente de una muestra real del formato para calibrarse.
- Exportación de reportes (Excel/XLSX) más allá de lo que ya cubre `conciliaciones_excel.py` — no hay módulo `reportes.py` separado; no está en desarrollo activo.
- Selector de municipios de Colombia para origen/destino — hoy `origen`/`destino` son texto libre (sin FK), tanto en viajes adicionales como en el catálogo de tarifas.

---

## Comportamiento de Inicio (Backend)

En `startup_event()` (`app/main.py`):
1. Valida que exista la tabla `usuarios` — lanza `RuntimeError` si no hay migraciones
2. Ejecuta `seed_data()` — crea admin por defecto y siembra roles/permisos si no existen (idempotente; ver `permisos_catalog.py`)
3. Si `AVANSAT_ENABLED=true`, arranca hilo daemon que llama `sync_avansat_yesterday_today()` cada 1800 s

---

## Exportación de Reportes

Hoy solo existe exportación a Excel de conciliaciones (`conciliaciones_excel.py`) — la visibilidad de campos financieros aplica igualmente ahí según el rol que exporta. Un módulo `reportes.py` separado (servicios por período con filtros, viajes adicionales, KPIs del dashboard) sigue sin iniciarse — ver "Pendiente / no iniciado" en Estructura del Proyecto.

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

## App Móvil — React Native + Expo (SDK 57)

- Audiencia: **solo rol CLIENTE**
- Funcionalidades: crear solicitudes de viajes adicionales (origen/destino/tipo de vehículo con tarifa automática), ver lista con filtros, ver estado del viaje, descargar/ver PDF del manifiesto
- Filtros disponibles: placa, nombre de tarifa, origen, destino, estado (PENDIENTE, EN_CONCILIACION, APROBADO, RECHAZADO), fecha
- **Pantalla "Tarifas"** (`app/tarifas.tsx`): autogestión de tarifas de ruta faltantes cuando origen+destino+tipo de vehículo no tienen tarifa en el catálogo — el Cliente solo ingresa `tarifa_cliente`, el sistema calcula el resto (misma regla fija de "el Cliente nunca fija ni ve rentabilidad" que en la web)
- Misma API del backend — no hay endpoints exclusivos para móvil
- Autenticación: JWT igual que web, token propio `refrigerados_token`
- Ver `mobile/AGENTS.md` antes de escribir código nuevo: Expo SDK 57 cambió APIs (ej. `expo-file-system` se movió a `expo-file-system/legacy`)

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
- `backend/app/services/presence_service.py` — lógica de umbral de tiempo
- Frontend: componente `UserStatusIndicator.tsx` con animación CSS `animate-pulse` de Tailwind
- Solo COINTRA_ADMIN puede consultar `GET /api/presence/online` — los demás roles reciben 403 (permiso `presencia.ver`)

**BD:** campo `usuarios.ultimo_heartbeat: DateTime nullable` — sin tabla separada.

---

## Lo que el sistema NO hace

- No genera facturas electrónicas (solo autoriza para facturar)
- No envía correos automáticos (siempre manuales)
- No tiene periodicidad fija de conciliación (período libre)
- Avansat no crea ni modifica ningún registro del sistema

---

## Deuda Técnica / Pendientes

- **Sin validación de tamaño de archivo en `UploadFile`.** Los endpoints
  que reciben archivos (`backend/app/api/routes/conciliaciones_workflow.py`
  — adjuntos de factura, `archivos_factura: list[UploadFile]` — y
  `backend/app/api/routes/viajes.py` — carga masiva de Excel, `file:
  UploadFile` en `/carga-masiva/preview` y `/carga-masiva`) no validan el
  tamaño del archivo recibido en ningún punto del código, ni en el
  backend ni en el frontend (sin chequeo de `file.size` en ningún
  componente). Detectado el 2026-07-31 al definir
  `client_max_body_size` en el reverse proxy de `conciliaciones_gateway`
  — ese límite es de infraestructura (nginx, hoy 20M), no reemplaza una
  validación real de la aplicación (mensaje de error claro al usuario,
  límite explícito y documentado, protección aunque el archivo llegue
  por otra vía que no pase por ese proxy). Pendiente de implementar,
  no se actúa todavía.

### Para la fase de despliegue en servidor (en orden de prioridad)

0. **BLOQUEANTE — credenciales de producción embebidas en la imagen
   Docker.** La imagen de producción actual (`docker-prod-v1.2` /
   `docker-compose.prod.yml`), construida sin `backend/.dockerignore`,
   muy probablemente contiene `backend/.env.prod` con credenciales
   reales (Postgres, SMTP, Avansat, `SECRET_KEY`) embebidas en texto
   plano dentro de la imagen — el `Dockerfile` hace `COPY . .` y hasta
   el 2026-07-31 nada excluía esos archivos. Verificado empíricamente en
   la imagen construida desde `conciliaciones_gateway` antes del fix:
   `docker exec ... ls /app/` mostraba `.env` y `.env.prod` presentes;
   son recuperables con un simple `docker run ... cat /app/.env.prod`
   por cualquiera con acceso a la imagen.

   **Esto NO se corrige solo con el `.dockerignore` de la rama
   `feature/gateway-subpath`** (que sí evita que vuelva a ocurrir en
   imágenes nuevas). Requiere, además:
   - Reconstruir y redesplegar la imagen de producción con el
     `.dockerignore` aplicado.
   - **ROTAR todas las credenciales que pudieran haber quedado
     expuestas** — especialmente `SECRET_KEY`: rotarla invalida todas
     las sesiones firmadas con la clave vieja (todos los usuarios deben
     volver a iniciar sesión), comportamiento esperado y correcto en
     este caso, no un efecto secundario a evitar.

   Bloqueante antes del corte real a producción vía el gateway. Va por
   encima de `AVANSAT_VERIFY_SSL` en prioridad: aquí las credenciales ya
   están expuestas de facto en un artefacto distribuible, no es un
   riesgo latente.

1. **PRIORIDAD ALTA — `AVANSAT_VERIFY_SSL=false`** (`backend/.env`,
   `backend/.env.prod`, default en `app/core/config.py:34`): la
   verificación TLS está deshabilitada al llamar a Avansat, un proveedor
   externo real — riesgo de MITM sobre credenciales y datos de
   manifiestos. Es más urgente que el resto de esta lista porque es una
   protección de seguridad activamente apagada en producción hoy, no
   solo una mala práctica latente. Resolver (habilitar verificación, o
   documentar por qué el certificado de Avansat no valida y fijar el CA
   correspondiente) ANTES de montar el despliegue unificado.
2. **Secretos en texto plano** en `backend/.env.prod` y duplicados en
   `docker-compose.prod.yml` (Postgres, SMTP, Avansat, SECRET_KEY) —
   definir mecanismo de secretos para el servidor compartido.
3. **Vulnerabilidades de `npm audit` del frontend de Anticipos** (4,
   requieren salto de versión mayor de `vite`/`react-router-dom` —
   documentadas en el CLAUDE.md de ese repo, Fase 16). Menor urgencia:
   sin exploit conocido aplicable al uso actual, pero resolver antes de
   exponer el dominio unificado.

---

## Documentación Adicional

Leer antes de hacer cambios en lógica de negocio:
- `docs/CONTEXT_GENERAL.md` — reglas de negocio, flujo completo, actores
- `docs/CONTEXT_DATABASE.md` — esquema PostgreSQL completo
- `docs/CONTEXT_BACKEND.md` — endpoints y servicios detallados
- `docs/CONTEXT_FRONTEND.md` — componentes y patrones UX
