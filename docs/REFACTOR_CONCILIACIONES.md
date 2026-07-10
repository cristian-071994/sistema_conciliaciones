# REFACTOR: División de `conciliaciones.py`

> **Estado:** En ejecución — 6 de 8 archivos completados.  
> **Rama de trabajo:** `dev` o rama feature sobre `dev`. NO tocar `docker-prod-v1.2`.  
> **Regla:** Ningún archivo resultante puede superar 1000 líneas.

---

## Motivación

`backend/app/api/routes/conciliaciones.py` tiene ~4,275 líneas (wc -l CRLF). Contiene mezclados: helpers privados, builders de Excel y 30 route handlers. Se divide sin modificar ninguna lógica de negocio.

---

## Estructura resultante (8 archivos)

| Archivo | ~Líneas | Contenido |
|---------|---------|-----------|
| `conciliaciones_helpers.py` | ~700 | 35 funciones helper privadas + constante `TRANSPORTE_SERVICE_CODES` |
| `conciliaciones_excel_renders.py` | ~420 | `_ExcelContext` NamedTuple + 11 funciones `_xl_*` (closures extraídas) |
| `conciliaciones_excel_legacy.py` | ~720 | `_prepare_facturacion_rows` + `_build_facturacion_excel` + `_build_conciliacion_excel_legacy` |
| `conciliaciones_excel.py` | ~650 | `_build_conciliacion_excel` (refactorizado, usa `_xl_*`) |
| `conciliaciones_items.py` | ~680 | 8 endpoints de ítems |
| `conciliaciones_workflow.py` | ~680 | 9 endpoints de workflow + comentarios |
| `conciliaciones_core.py` | ~660 | 14 endpoints CRUD, viajes, descargas, info |
| `conciliaciones.py` | ~30 | Aggregator únicamente |

---

## Archivo 1: `conciliaciones_helpers.py`

No tiene `APIRouter`. Solo funciones y la constante. Es importado por los otros módulos.

### Constante (copiar de línea 55 del original)
```python
TRANSPORTE_SERVICE_CODES = {"VIAJE", "VIAJE_ADICIONAL"}
```

### Funciones (en orden del archivo original, líneas 58–699)

| Función | Líneas aprox. |
|---------|---------------|
| `_login_url()` | 58–59 |
| `_estado_conciliacion_viaje(viaje)` | 62–65 |
| `_should_mark_conciliado(estado)` | 68–70 |
| `_default_viaje_item_financials(viaje)` | 73–85 |
| `_sync_viajes_conciliado_por_estado(db, conciliacion_id, estado)` | 88–94 |
| `_repair_missing_viaje_items(db, conc, user_id)` | 97–145 |
| `_existing_item_viaje_ids(db)` | 148–157 |
| `_validate_user_access_operacion(user, operacion)` | 160–166 |
| `_ensure_user_can_access_conciliacion(user, conc)` | 169–174 |
| `_ensure_cointra_admin(user)` | 177–179 |
| `_parse_target_emails(raw_value, recipients)` | 182–189 |
| `_users_matching_emails(recipients, target_emails)` | 192–206 |
| `_sender_signature(user)` | 209–213 |
| `_find_last_review_sender(db, conciliacion_id)` | 215–230 |
| `_resolve_recipients(db, operacion, roles)` | 233–254 |
| `_display_estado(conc)` | 257–263 |
| `_mark_borrador_dirty(conc)` | 266–269 |
| `_next_liquidacion_id(db, conciliacion_id)` | 272–286 |
| `_liquidacion_exists(db, conciliacion_id, liquidacion_id)` | 289–303 |
| `_find_last_status_actor(db, conc)` | 306–353 |
| `_build_conciliacion_totals_map(db, conciliacion_ids)` | 356–376 |
| `_build_conciliacion_estado_timestamps(db, conciliacion_id, created_at)` | 379–406 |
| `_enrich_conciliacion(db, conc, user, totals_map=None)` | 409–446 |
| `_as_float(value)` | 449–455 |
| `_split_total_evenly(total, count)` | 458–469 |
| `_build_liquidacion_metadata(liquidacion_id, periodo_inicio, periodo_fin)` | 472–483 |
| `_extract_liquidacion_metadata(item)` | 486–512 |
| `_normalize_manifiesto_for_lookup(value)` | 515–524 |
| `_normalize_placa_for_compare(value)` | 527–529 |
| `_item_servicio_codigo(item)` | 532–536 |
| `_is_transport_item(item)` | 539–541 |
| `_validate_transport_item_manifest_or_raise(db, item)` | 544–610 |
| `_validate_transport_items_manifests_or_raise(db, items, action_label)` | 613–638 |
| `_fetch_avansat_with_fallback(db, manifiesto, prefetched=None)` | 641–663 |
| `_prefetch_avansat_for_manifest_numbers_or_raise(db, manifest_numbers)` | 666–699 |

### Imports de `conciliaciones_helpers.py`
```python
from datetime import date
import json
from decimal import Decimal, ROUND_HALF_UP
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.api.deps import is_cointra_admin
from app.core.config import settings
from app.models.comentario import Comentario
from app.models.conciliacion import Conciliacion
from app.models.conciliacion_item import ConciliacionItem
from app.models.enums import ItemTipo, UserRole
from app.models.historial_cambio import HistorialCambio
from app.models.operacion import Operacion
from app.models.usuario import Usuario
from app.models.usuario_operacion import usuario_operaciones_asignadas
from app.models.viaje import Viaje
from app.schemas.conciliacion import ConciliacionOut
from app.services.audit import log_change
from app.services.avansat_cache import resolve_avansat_from_cache_only
```

> **Nota:** `from sqlalchemy import func` del archivo original es un import sin uso — NO incluirlo aquí.

---

## Archivo 2: `conciliaciones_excel_renders.py`

Contiene el contexto compartido de renderizado y las 11 funciones extraídas de las closures de `_build_conciliacion_excel`. Estas closures capturaban variables del scope externo; se convierten en funciones de módulo con parámetros explícitos. La lógica interna de cada función no cambia.

### `_ExcelContext` NamedTuple

Agrupa todas las variables de entorno que antes se capturaban implícitamente:

```python
from typing import NamedTuple
from openpyxl.styles import Alignment, Border, Font, PatternFill

class _ExcelContext(NamedTuple):
    conc: object                        # instancia Conciliacion ORM
    avansat_prefetched: dict | None
    show_tarifa_tercero: bool
    show_tarifa_cliente: bool
    show_cointra_financials: bool
    border: Border
    cop_format: str
    pct_format: str
    header_fill: PatternFill
    header_font: Font
    section_fill: PatternFill
    section_font: Font
    center: Alignment
    tipo_vehiculo_by_placa: dict[str, str]
    estado_label: str
    estado_fill_color: str
    estado_font_color: str
```

### Funciones extraídas (prefijo `_xl_`)

Se usa el prefijo `_xl_` para distinguirlas de las helpers de `conciliaciones_helpers.py`.

#### 1. `_xl_write_report_header(ws, title, ctx) -> int`
Reemplaza la closure `_write_report_header(ws, title)`.  
Usa de `ctx`: `conc`, `estado_label`, `estado_fill_color`, `estado_font_color`, `border`, `center`.

#### 2. `_xl_write_headers(ws, row_num, headers, ctx) -> dict[str, int]`
Reemplaza la closure `_write_headers(ws, row_num, headers)`.  
Usa de `ctx`: `header_fill`, `header_font`, `section_fill`, `border`, `center`.  
Retorna: dict `{header_name: col_index}`.

#### 3. `_xl_style_row(ws, row_num, columns_count, ctx, fill=None, font=None) -> None`
Reemplaza la closure `_style_row(ws, row_num, columns_count, fill=None, font=None)`.  
Usa de `ctx`: `border`.

#### 4. `_xl_write_financials(ws, row_num, col_idx, tarifa_cliente, tarifa_tercero, ctx) -> None`
Reemplaza la closure `_write_financials(ws, row_num, col_idx, tarifa_cliente, tarifa_tercero)`.  
Usa de `ctx`: `show_tarifa_cliente`, `show_tarifa_tercero`, `show_cointra_financials`, `cop_format`, `pct_format`.

#### 5. `_xl_accumulate_totals(source_items) -> dict[str, dict[str, float]]`
Reemplaza la closure `_accumulate_totals(source_items)`.  
**No usa variables de closure** — no necesita `ctx`. Se extrae sin cambios de firma.

#### 6. `_xl_manifest_context(item, ctx) -> dict[str, object]`
Reemplaza la closure `_manifest_context(item)`.  
Usa de `ctx`: `avansat_prefetched`.

#### 7. `_xl_item_service_code_upper(item) -> str`
Extrae closure auxiliar (approx. líneas 1441–1445 del original).  
Llama a `_item_servicio_codigo(item)` de `conciliaciones_helpers`.  
**No usa variables de closure.**

#### 8. `_xl_item_service_label(item) -> str`
Extrae closure auxiliar (approx. líneas 1447–1448 del original).  
Llama a `_xl_item_service_code_upper(item)`.  
**No usa variables de closure.**

#### 9. `_xl_write_adicionales_unified_section(ws, start_row, title, source_items, ctx)`
Reemplaza la closure `_write_adicionales_unified_section(ws, start_row, title, source_items)`.  
Usa de `ctx`: `show_tarifa_cliente`, `show_tarifa_tercero`, `show_cointra_financials`.  
Llama a: `_xl_write_headers`, `_xl_manifest_context`, `_xl_write_financials`, `_xl_style_row`, `_xl_item_service_label`.

#### 10. `_xl_write_transport_section(ws, start_row, title, source_items, ctx, write_plate_totals=False, totals_label_prefix="TOTAL PLACA")`
Reemplaza la closure `_write_transport_section(ws, start_row, title, source_items, write_plate_totals, totals_label_prefix)`.  
Usa de `ctx`: `show_tarifa_cliente`, `show_tarifa_tercero`, `show_cointra_financials`, `section_fill`, `section_font`, `avansat_prefetched`.  
Llama a: `_xl_accumulate_totals`, `_xl_manifest_context`, `_xl_write_headers`, `_xl_write_financials`, `_xl_style_row`.

#### 11. `_xl_write_additional_services_section(ws, start_row, title, source_items, ctx, write_plate_totals=False, totals_label_prefix="TOTAL PLACA")`
Reemplaza la closure `_write_additional_services_section(ws, start_row, title, source_items, write_plate_totals, totals_label_prefix)`.  
Usa de `ctx`: `show_tarifa_cliente`, `show_tarifa_tercero`, `show_cointra_financials`, `tipo_vehiculo_by_placa`, `section_fill`, `section_font`.  
Llama a: `_xl_write_headers`, `_xl_write_financials`, `_xl_style_row`.

### Imports de `conciliaciones_excel_renders.py`
```python
from typing import NamedTuple
from openpyxl.styles import Alignment, Border, Font, PatternFill
from app.models.conciliacion_item import ConciliacionItem
from .conciliaciones_helpers import (
    _item_servicio_codigo,
    _fetch_avansat_with_fallback,
)
```

---

## Archivo 3: `conciliaciones_excel_legacy.py`

Contiene las tres funciones Excel que, al revisar el código, **no son llamadas por ninguna ruta activa** (no aparecen en `grep` de las líneas de rutas 2363–4276). Son posible dead code, pero se conservan en el refactor — no se elimina nada.

> **VERIFICAR antes de ejecutar:** `grep -n "_build_facturacion_excel\|_build_conciliacion_excel_legacy\|_prepare_facturacion_rows" conciliaciones.py`  
> Si la búsqueda confirma que solo aparecen en sus propias definiciones (líneas 702–1414), son dead code. Aun así, se incluyen en este archivo para no perderlas.

### Funciones (en orden del archivo original)

| Función | Líneas aprox. |
|---------|---------------|
| `_prepare_facturacion_rows(db, items, avansat_prefetched=None)` | 702–744 |
| `_build_facturacion_excel(conc, rows)` | 747–861 |
| `_build_conciliacion_excel_legacy(conc, items, user_role, tipo_vehiculo_by_placa, avansat_prefetched=None)` | 864–1414 |

`_build_conciliacion_excel_legacy` mantiene sus propias closures internas (`_write_group_total`, `_write_servicios_block_header`). **No se refactorizan** — el usuario autorizó solo las closures de `_build_conciliacion_excel`.

### Imports de `conciliaciones_excel_legacy.py`
```python
from io import BytesIO
from sqlalchemy.orm import Session
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from app.models.conciliacion import Conciliacion
from app.models.conciliacion_item import ConciliacionItem
from app.models.enums import ItemTipo, UserRole
from app.models.viaje import Viaje
from .conciliaciones_helpers import (
    _extract_liquidacion_metadata,
    _normalize_manifiesto_for_lookup,
    _as_float,
    _split_total_evenly,
    _display_estado,
    _item_servicio_codigo,
    _fetch_avansat_with_fallback,
)
```

---

## Archivo 4: `conciliaciones_excel.py`

Contiene únicamente `_build_conciliacion_excel` — refactorizado para usar las funciones `_xl_*` en lugar de closures.

### Cuerpo refactorizado de `_build_conciliacion_excel`

La función conserva exactamente la misma firma y retorna exactamente lo mismo. El único cambio es:

1. **Eliminar las 9 definiciones de closures** dentro del cuerpo de la función.
2. **Construir `ctx`** con todas las variables locales.
3. **Reemplazar cada llamada** a una closure por la función `_xl_*` equivalente, pasando `ctx` como argumento adicional.

```python
# Antes (closure):
_write_report_header(ws, title)

# Después (función de módulo):
_xl_write_report_header(ws, title, ctx)

# Antes:
col_idx = _write_headers(ws, row_num, headers)
# Después:
col_idx = _xl_write_headers(ws, row_num, headers, ctx)

# Antes:
_style_row(ws, row_num, n_cols, fill=section_fill)
# Después:
_xl_style_row(ws, row_num, n_cols, ctx, fill=section_fill)

# Antes:
_write_financials(ws, row, col_idx, tc, tt)
# Después:
_xl_write_financials(ws, row, col_idx, tc, tt, ctx)

# Antes:
totals = _accumulate_totals(items)
# Después:
totals = _xl_accumulate_totals(items)   # sin ctx

# Antes:
mc = _manifest_context(item)
# Después:
mc = _xl_manifest_context(item, ctx)

# Antes (closure auxiliar dentro de la función):
code = _item_service_code_upper(item)
label = _item_service_label(item)
# Después:
code = _xl_item_service_code_upper(item)
label = _xl_item_service_label(item)

# Antes:
_write_adicionales_unified_section(ws, start_row, title, source_items)
# Después:
_xl_write_adicionales_unified_section(ws, start_row, title, source_items, ctx)

# Antes:
_write_transport_section(ws, start_row, title, source_items, write_plate_totals=True, ...)
# Después:
_xl_write_transport_section(ws, start_row, title, source_items, ctx, write_plate_totals=True, ...)

# Antes:
_write_additional_services_section(ws, start_row, title, source_items, ...)
# Después:
_xl_write_additional_services_section(ws, start_row, title, source_items, ctx, ...)
```

El bloque de construcción de `ctx` va inmediatamente después de inicializar las variables de estilo, antes del primer uso de una closure:

```python
ctx = _ExcelContext(
    conc=conc,
    avansat_prefetched=avansat_prefetched,
    show_tarifa_tercero=show_tarifa_tercero,
    show_tarifa_cliente=show_tarifa_cliente,
    show_cointra_financials=show_cointra_financials,
    border=border,
    cop_format=cop_format,
    pct_format=pct_format,
    header_fill=header_fill,
    header_font=header_font,
    section_fill=section_fill,
    section_font=section_font,
    center=center,
    tipo_vehiculo_by_placa=tipo_vehiculo_by_placa,
    estado_label=estado_label,
    estado_fill_color=estado_fill_color,
    estado_font_color=estado_font_color,
)
```

### Imports de `conciliaciones_excel.py`
```python
from io import BytesIO
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from app.models.conciliacion import Conciliacion
from app.models.conciliacion_item import ConciliacionItem
from app.models.enums import ItemTipo, UserRole
from app.models.viaje import Viaje
from .conciliaciones_helpers import (
    _as_float,
    _display_estado,
    _item_servicio_codigo,
    _split_total_evenly,
)
from .conciliaciones_excel_renders import (
    _ExcelContext,
    _xl_write_report_header,
    _xl_write_headers,
    _xl_style_row,
    _xl_write_financials,
    _xl_accumulate_totals,
    _xl_manifest_context,
    _xl_item_service_code_upper,
    _xl_item_service_label,
    _xl_write_adicionales_unified_section,
    _xl_write_transport_section,
    _xl_write_additional_services_section,
)
```

---

## Archivo 5: `conciliaciones_items.py`

### Router
```python
router = APIRouter()  # Sin prefix — lo hereda del aggregator
```

### Endpoints (en este orden exacto — FastAPI es sensible al orden de registro)

| Función | Método | Path | Líneas orig. aprox. |
|---------|--------|------|---------------------|
| `create_item` | POST | `/items` | 2680–2738 |
| `list_items` | GET | `/{conciliacion_id}/items` | 2741–2774 |
| `create_liquidacion_contrato_fijo` | POST | `/{conciliacion_id}/liquidacion-contrato-fijo` | 2777–2908 |
| `delete_liquidacion_item` | DELETE | `/items/{item_id}` | 2911–2990 |
| `delete_disponibilidad_item` | DELETE | `/{conciliacion_id}/disponibilidad/{item_id}` | 2993–3061 |
| `update_item_estado` | PATCH | `/items/{item_id}/estado` | 3064–3096 |
| `patch_item` | PATCH | `/items/{item_id}` | 3099–3260 |
| `cliente_decide_item` | PATCH | `/items/{item_id}/decision-cliente` | 3263–3305 |

> **CRÍTICO:** `update_item_estado` (`/estado`) debe estar registrado ANTES que `patch_item` (`/{item_id}`) para que FastAPI no lo trate como path param.

### Imports de `conciliaciones_items.py`
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.comentario import Comentario
from app.models.conciliacion import Conciliacion
from app.models.conciliacion_item import ConciliacionItem
from app.models.enums import ItemEstado, ItemTipo, UserRole
from app.models.historial_cambio import HistorialCambio
from app.models.operacion import Operacion
from app.models.servicio import Servicio
from app.models.usuario import Usuario
from app.models.vehiculo import Vehiculo
from app.models.viaje import Viaje
from app.schemas.conciliacion import (
    ClienteItemDecision,
    ConciliacionItemCreate,
    ConciliacionItemOut,
    ConciliacionItemPatch,
    ConciliacionItemUpdateEstado,
    LiquidacionContratoFijoCreate,
)
from app.services.audit import log_change
from app.services.pricing import apply_rentabilidad
from app.services.visibility import sanitize_item_for_role
from .conciliaciones_helpers import (
    TRANSPORTE_SERVICE_CODES,
    _validate_user_access_operacion,
    _ensure_user_can_access_conciliacion,
    _mark_borrador_dirty,
    _extract_liquidacion_metadata,
    _build_liquidacion_metadata,
    _next_liquidacion_id,
    _liquidacion_exists,
    _normalize_manifiesto_for_lookup,
    _is_transport_item,
    _validate_transport_item_manifest_or_raise,
    _repair_missing_viaje_items,
    _default_viaje_item_financials,
    _should_mark_conciliado,
    _fetch_avansat_with_fallback,
    _item_servicio_codigo,
)
```

---

## Archivo 6: `conciliaciones_workflow.py`

### Router
```python
router = APIRouter()  # Sin prefix
```

### Endpoints (en este orden exacto)

| Función | Método | Path | Líneas orig. aprox. |
|---------|--------|------|---------------------|
| `update_estado_conciliacion` | PATCH | `/{conciliacion_id}/estado` | 2637–2677 |
| `enviar_revision` | POST | `/{conciliacion_id}/enviar-revision` | 3308–3397 |
| `aprobar_conciliacion_cliente` | POST | `/{conciliacion_id}/aprobar-cliente` | 3400–3485 |
| `devolver_conciliacion_cliente` | POST | `/{conciliacion_id}/devolver-cliente` | 3488–3574 |
| `enviar_facturacion_conciliacion` | POST | `/{conciliacion_id}/enviar-facturacion` | 3577–3696 |
| `enviar_factura_cliente_conciliacion` | POST | `/{conciliacion_id}/enviar-factura-cliente` | 3699–3817 |
| `cerrar_conciliacion` | POST | `/{conciliacion_id}/cerrar` | 3922–3960 |
| `add_comment` | POST | `/comentarios` | 3963–4001 |
| `get_comments` | GET | `/{conciliacion_id}/comentarios` | 4004–4022 |

### Imports de `conciliaciones_workflow.py`
```python
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session, selectinload
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.comentario import Comentario
from app.models.conciliacion import Conciliacion
from app.models.conciliacion_item import ConciliacionItem
from app.models.enums import ItemEstado, ItemTipo, UserRole
from app.models.factura_archivo_cliente import FacturaArchivoCliente
from app.models.historial_cambio import HistorialCambio
from app.models.operacion import Operacion
from app.models.usuario import Usuario
from app.models.vehiculo import Vehiculo
from app.models.viaje import Viaje
from app.schemas.conciliacion import (
    ComentarioCreate,
    ComentarioOut,
    ConciliacionOut,
    ConciliacionUpdateEstado,
    ConciliacionWorkflowAction,
)
from app.services.audit import log_change
from app.services.notifications import create_internal_notifications, send_manual_email
from app.services.visibility import sanitize_item_for_role
from .conciliaciones_helpers import (
    _validate_user_access_operacion,
    _ensure_user_can_access_conciliacion,
    _sync_viajes_conciliado_por_estado,
    _resolve_recipients,
    _parse_target_emails,
    _users_matching_emails,
    _sender_signature,
    _find_last_review_sender,
    _login_url,
    _validate_transport_items_manifests_or_raise,
    _prefetch_avansat_for_manifest_numbers_or_raise,
    _enrich_conciliacion,
    _mark_borrador_dirty,
    _display_estado,
)
from .conciliaciones_excel import _build_conciliacion_excel
```

---

## Archivo 7: `conciliaciones_core.py`

### Router
```python
router = APIRouter()  # Sin prefix
```

### Endpoints

Los endpoints de descarga (líneas 3820–3919 en el original) aparecen físicamente entre los de workflow, pero pertenecen semánticamente al core. En el nuevo archivo se puede alterar su posición sin consecuencias para FastAPI (paths no conflictivos).

| Función | Método | Path | Líneas orig. aprox. |
|---------|--------|------|---------------------|
| `create_conciliacion` | POST | `/` | 2365–2460 |
| `list_conciliaciones` | GET | `/` | 2462–2487 |
| `list_closed_history` | GET | `/historial-cerradas` | 2490–2528 |
| `update_conciliacion` | PATCH | `/{conciliacion_id}` | 2531–2558 |
| `deactivate_conciliacion` | DELETE | `/{conciliacion_id}` | 2561–2585 |
| `guardar_conciliacion_borrador` | POST | `/{conciliacion_id}/guardar-borrador` | 2588–2616 |
| `reactivate_conciliacion` | POST | `/{conciliacion_id}/reactivar` | 2619–2633 |
| `descargar_facturas_conciliacion` | GET | `/{conciliacion_id}/descargar-facturas` | 3820–3864 |
| `descargar_conciliacion_excel` | GET | `/{conciliacion_id}/descargar-excel` | 3867–3919 |
| `get_pending_viajes` | GET | `/{conciliacion_id}/viajes-pendientes` | 4025–4066 |
| `attach_pending_viajes` | POST | `/{conciliacion_id}/adjuntar-viajes` | 4069–4147 |
| `detach_viaje_from_conciliacion` | DELETE | `/{conciliacion_id}/viajes/{viaje_id}` | 4150–4212 |
| `get_historial` | GET | `/{conciliacion_id}/historial` | 4215–4233 |
| `get_resumen_financiero` | GET | `/{conciliacion_id}/resumen-financiero` | 4236–4275 |

### Imports de `conciliaciones_core.py`
```python
from io import BytesIO
import zipfile
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload
from app.api.deps import get_current_user, is_cointra_admin
from app.db.session import get_db
from app.models.conciliacion import Conciliacion
from app.models.conciliacion_item import ConciliacionItem
from app.models.enums import ItemTipo, UserRole
from app.models.factura_archivo_cliente import FacturaArchivoCliente
from app.models.historial_cambio import HistorialCambio
from app.models.operacion import Operacion
from app.models.usuario import Usuario
from app.models.vehiculo import Vehiculo
from app.models.viaje import Viaje
from app.schemas.conciliacion import (
    ConciliacionCreate,
    ConciliacionOut,
    ConciliacionUpdate,
)
from app.schemas.historial import HistorialCambioOut, ResumenFinancieroOut
from app.schemas.viaje import AdjuntarViajesRequest, ViajeOut
from app.services.audit import log_change
from app.services.notifications import create_internal_notifications
from .conciliaciones_helpers import (
    TRANSPORTE_SERVICE_CODES,
    _validate_user_access_operacion,
    _ensure_user_can_access_conciliacion,
    _ensure_cointra_admin,
    _enrich_conciliacion,
    _build_conciliacion_totals_map,
    _sync_viajes_conciliado_por_estado,
    _should_mark_conciliado,
    _default_viaje_item_financials,
    _existing_item_viaje_ids,
    _repair_missing_viaje_items,
    _mark_borrador_dirty,
    _estado_conciliacion_viaje,
    _prefetch_avansat_for_manifest_numbers_or_raise,
    _normalize_placa_for_compare,
)
from .conciliaciones_excel import _build_conciliacion_excel
```

---

## Archivo 8: `conciliaciones.py` (aggregator)

Reemplaza completamente el contenido actual. No tiene lógica propia.

```python
from fastapi import APIRouter

from app.api.routes.conciliaciones_core import router as core_router
from app.api.routes.conciliaciones_items import router as items_router
from app.api.routes.conciliaciones_workflow import router as workflow_router

router = APIRouter(prefix="/conciliaciones", tags=["conciliaciones"])

router.include_router(core_router)
router.include_router(items_router)
router.include_router(workflow_router)
```

`app/api/router.py` **no se modifica** — ya incluye `from app.api.routes.conciliaciones import router` y ese import sigue siendo válido.

---

## Grafo de dependencias entre módulos

```
conciliaciones.py (aggregator)
├── conciliaciones_core.py
│   ├── conciliaciones_helpers.py
│   └── conciliaciones_excel.py
│       ├── conciliaciones_helpers.py
│       └── conciliaciones_excel_renders.py
│           └── conciliaciones_helpers.py
├── conciliaciones_items.py
│   └── conciliaciones_helpers.py
└── conciliaciones_workflow.py
    ├── conciliaciones_helpers.py
    └── conciliaciones_excel.py

conciliaciones_excel_legacy.py  (importado por nadie en rutas — dead code)
    └── conciliaciones_helpers.py
```

Sin ciclos. Cada módulo solo importa hacia abajo en la jerarquía.

---

## Orden de implementación

Seguir este orden para que los imports siempre resuelvan contra módulos ya existentes:

1. ✅ `conciliaciones_helpers.py` — **LISTO** (665 líneas). Funciones y constante copiadas exactamente.
2. ✅ `conciliaciones_excel_renders.py` — **LISTO** (501 líneas). `_ExcelContext` + 11 funciones `_xl_*`.
3. ✅ `conciliaciones_excel_legacy.py` — **LISTO** (732 líneas). Tres funciones legacy copiadas sin cambios.
4. ✅ `conciliaciones_excel.py` — **LISTO** (560 líneas). `_build_conciliacion_excel` refactorizado con `_xl_*` y `ctx`.
5. ✅ `conciliaciones_items.py` — **LISTO** (675 líneas). 8 endpoints de ítems. Nota: se añadió `_resolve_recipients` y `create_internal_notifications` que el doc omitía pero `create_item` requiere.
6. ✅ `conciliaciones_workflow.py` — **LISTO** (701 líneas). 9 endpoints de workflow.
7. ⏳ `conciliaciones_core.py` — copiar los 14 endpoints core
8. ⏳ Reemplazar `conciliaciones.py` con el aggregator

---

## Verificaciones post-refactor

```bash
# 1. Importación sin errores
cd backend
python -c "from app.api.routes.conciliaciones import router; print('OK')"

# 2. Conteo de líneas de todos los archivos nuevos
wc -l app/api/routes/conciliaciones*.py

# 3. Arrancar el backend y verificar health
uvicorn app.main:app --reload
curl http://localhost:8000/health

# 4. Verificar que los endpoints siguen respondiendo (requiere DB corriendo)
curl http://localhost:8000/conciliaciones/ -H "Authorization: Bearer <token>"
```

---

## Notas para el ejecutor

- **`func` de sqlalchemy** está importado en el original pero no se usa en ningún lugar. No incluirlo en ningún archivo nuevo.
- **`_build_facturacion_excel` y `_build_conciliacion_excel_legacy`** no son llamadas por ninguna ruta activa (verificado con grep). Se conservan en `conciliaciones_excel_legacy.py` sin eliminar, pero son candidatas a borrar en una sesión posterior.
- **Orden de `include_router` en el aggregator:** `core_router` primero (tiene `GET /` y `POST /`), luego `items_router`, luego `workflow_router`. Mantener este orden evita ambigüedades.
- **Closures de `_build_conciliacion_excel_legacy`** (`_write_group_total`, `_write_servicios_block_header`): NO refactorizar — el usuario solo autorizó las closures de `_build_conciliacion_excel`.
- **Los imports relativos** usan `.` (punto simple) porque todos los módulos están en el mismo directorio `app/api/routes/`.
- Si algún import falla al verificar, revisar si el modelo o schema está en otro path y ajustar — los paths listados aquí son los del archivo original.
