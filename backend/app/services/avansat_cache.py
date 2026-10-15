from __future__ import annotations

from datetime import datetime, timedelta, date
import json

from sqlalchemy.orm import Session

from app.models.manifiesto_avansat import ManifiestoAvansat
from app.services.avansat import fetch_avansat_by_created_date_range, fetch_avansat_by_manifiestos_with_fallback


def _normalize_manifiesto(value: object) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if raw.endswith(".0"):
        integer_part = raw[:-2]
        if integer_part.isdigit():
            return integer_part
    return raw


def _ensure_cache_table(db: Session) -> None:
    ManifiestoAvansat.__table__.create(bind=db.get_bind(), checkfirst=True)


def _cache_row_to_payload(row: ManifiestoAvansat) -> dict:
    remesas: list[dict] = []
    if row.remesas_json:
        try:
            parsed = json.loads(row.remesas_json)
            if isinstance(parsed, list):
                remesas = [item for item in parsed if isinstance(item, dict)]
        except Exception:
            remesas = []
    return {
        "fecha_emision": row.fecha_emision,
        "placa_vehiculo": row.placa_vehiculo,
        "trayler": row.trayler,
        "remesa": row.remesa,
        "producto": row.producto,
        "ciudad_origen": row.ciudad_origen,
        "ciudad_destino": row.ciudad_destino,
        "fecha_cumplida": row.fecha_cumplida,
        "remesas": remesas,
    }


_PAYLOAD_TEXT_FIELDS = (
    "fecha_emision",
    "placa_vehiculo",
    "trayler",
    "remesa",
    "producto",
    "ciudad_origen",
    "ciudad_destino",
    "fecha_cumplida",
)

# Ventana móvil (por fecha de creación del manifiesto) que consulta la
# sincronización automática. Un manifiesto se crea hoy y Avansat lo reporta
# como cumplido días después; releer solo "ayer y hoy" nunca capturaría esa
# fecha. 10 días cubre el ciclo de cumplido habitual en una sola llamada.
RECENT_WINDOW_DAYS = 10


def _clean_text(value: object) -> str | None:
    return str(value or "").strip() or None


def _apply_payload(row: ManifiestoAvansat, payload: dict) -> bool:
    """Copia al row los valores no vacíos del payload y dice si algo cambió.
    Un valor vacío de Avansat nunca borra uno ya guardado (p. ej. la
    fecha_cumplida de un manifiesto que Avansat todavía no reporta)."""
    changed = False
    for field in _PAYLOAD_TEXT_FIELDS:
        new_value = _clean_text(payload.get(field))
        if new_value is not None and getattr(row, field) != new_value:
            setattr(row, field, new_value)
            changed = True

    remesas = payload.get("remesas")
    if isinstance(remesas, list) and remesas:
        new_json = json.dumps(remesas, ensure_ascii=True)
        if row.remesas_json != new_json:
            row.remesas_json = new_json
            changed = True
    return changed


def _upsert_manifiesto(
    db: Session,
    manifiesto: str,
    payload: dict,
    existing_row: ManifiestoAvansat | None = None,
) -> str:
    """Inserta el manifiesto si no existe o actualiza el existente.
    Devuelve 'inserted', 'updated', 'unchanged' o 'skipped' (dato inválido)."""
    normalized = _normalize_manifiesto(manifiesto)
    if not normalized or not payload:
        return "skipped"

    row = existing_row
    if row is None:
        row = (
            db.query(ManifiestoAvansat)
            .filter(ManifiestoAvansat.manifiesto_numero == normalized)
            .first()
        )

    if row is None:
        row = ManifiestoAvansat(manifiesto_numero=normalized, created_at=datetime.utcnow())
        _apply_payload(row, payload)
        if row.remesas_json is None:
            row.remesas_json = "[]"
        db.add(row)
        return "inserted"

    return "updated" if _apply_payload(row, payload) else "unchanged"


def save_avansat_payload(db: Session, manifiesto: str, payload: dict) -> str:
    """Guarda en la tabla de manifiestos lo que devolvió una consulta puntual
    a la API de Avansat, para que el Excel lo lea sin volver a consultarla."""
    _ensure_cache_table(db)
    outcome = _upsert_manifiesto(db, manifiesto, payload)
    db.commit()
    return outcome


def resolve_avansat_for_manifiestos(
    db: Session,
    manifiestos: list[str],
    max_age_minutes: int,
) -> tuple[dict[str, dict], list[str]]:
    _ensure_cache_table(db)
    normalized = [
        _normalize_manifiesto(value)
        for value in manifiestos
        if _normalize_manifiesto(value)
    ]
    unique_manifiestos = list(dict.fromkeys(normalized))
    if not unique_manifiestos:
        return {}, []

    cached_rows = (
        db.query(ManifiestoAvansat)
        .filter(ManifiestoAvansat.manifiesto_numero.in_(unique_manifiestos))
        .all()
    )
    cache_by_manifiesto = {row.manifiesto_numero: row for row in cached_rows}

    resolved: dict[str, dict] = {}
    to_refresh: list[str] = []
    for manifiesto in unique_manifiestos:
        row = cache_by_manifiesto.get(manifiesto)
        if row:
            payload = _cache_row_to_payload(row)
            if payload:
                resolved[manifiesto] = payload
                continue
        to_refresh.append(manifiesto)

    fetched = fetch_avansat_by_manifiestos_with_fallback(to_refresh)
    for manifiesto in to_refresh:
        data = fetched.get(manifiesto) or {}
        if data:
            resolved[manifiesto] = data
            _upsert_manifiesto(db, manifiesto, data, cache_by_manifiesto.get(manifiesto))

    db.commit()
    missing = [manifiesto for manifiesto in unique_manifiestos if not resolved.get(manifiesto)]
    return resolved, missing


def resolve_avansat_from_cache_only(
    db: Session,
    manifiestos: list[str],
) -> tuple[dict[str, dict], list[str]]:
    _ensure_cache_table(db)
    normalized = [
        _normalize_manifiesto(value)
        for value in manifiestos
        if _normalize_manifiesto(value)
    ]
    unique_manifiestos = list(dict.fromkeys(normalized))
    if not unique_manifiestos:
        return {}, []

    cached_rows = (
        db.query(ManifiestoAvansat)
        .filter(ManifiestoAvansat.manifiesto_numero.in_(unique_manifiestos))
        .all()
    )
    cache_by_manifiesto = {row.manifiesto_numero: row for row in cached_rows}

    resolved: dict[str, dict] = {}
    missing: list[str] = []
    for manifiesto in unique_manifiestos:
        row = cache_by_manifiesto.get(manifiesto)
        if not row:
            missing.append(manifiesto)
            continue
        resolved[manifiesto] = _cache_row_to_payload(row)

    return resolved, missing


def previous_month_to_today_window() -> tuple[date, date]:
    today = date.today()
    first_day_current = today.replace(day=1)
    last_day_previous = first_day_current - timedelta(days=1)
    first_day_previous = last_day_previous.replace(day=1)
    return first_day_previous, today


def yesterday_today_window() -> tuple[date, date]:
    today = date.today()
    yesterday = today - timedelta(days=1)
    return yesterday, today


def recent_window(days: int = RECENT_WINDOW_DAYS) -> tuple[date, date]:
    today = date.today()
    return today - timedelta(days=days - 1), today


def sync_avansat_range(
    db: Session,
    start_date: date,
    end_date: date,
) -> dict[str, int | str]:
    """Consulta Avansat por fecha de creación y hace upsert en la tabla de
    manifiestos: agrega los nuevos y actualiza los ya existentes (así se
    completa fecha_cumplida cuando Avansat la reporta)."""
    _ensure_cache_table(db)

    range_start = min(start_date, end_date)
    range_end = max(start_date, end_date)
    fetched_by_manifiesto = fetch_avansat_by_created_date_range(range_start, range_end)
    summary: dict[str, int | str] = {
        "total": len(fetched_by_manifiesto),
        "inserted": 0,
        "updated": 0,
        "skipped": 0,
        "start_date": range_start.isoformat(),
        "end_date": range_end.isoformat(),
    }
    if not fetched_by_manifiesto:
        return summary

    normalized_numbers = list(
        {_normalize_manifiesto(number) for number in fetched_by_manifiesto if _normalize_manifiesto(number)}
    )
    existing_rows = (
        db.query(ManifiestoAvansat)
        .filter(ManifiestoAvansat.manifiesto_numero.in_(normalized_numbers))
        .all()
    )
    existing_by_number = {row.manifiesto_numero: row for row in existing_rows}

    for manifiesto, payload in fetched_by_manifiesto.items():
        normalized = _normalize_manifiesto(manifiesto)
        outcome = _upsert_manifiesto(db, normalized, payload, existing_by_number.get(normalized))
        # "unchanged" y "skipped" se reportan juntos: ya estaba al día o no era válido.
        summary_key = outcome if outcome in ("inserted", "updated") else "skipped"
        summary[summary_key] = int(summary[summary_key]) + 1

    db.commit()
    return summary


def sync_avansat_previous_month_to_today(db: Session) -> dict[str, int | str]:
    start_date, end_date = previous_month_to_today_window()
    return sync_avansat_range(db, start_date, end_date)


def sync_avansat_yesterday_today(db: Session) -> dict[str, int | str]:
    start_date, end_date = yesterday_today_window()
    return sync_avansat_range(db, start_date, end_date)


def sync_avansat_recent_window(db: Session) -> dict[str, int | str]:
    start_date, end_date = recent_window()
    return sync_avansat_range(db, start_date, end_date)
