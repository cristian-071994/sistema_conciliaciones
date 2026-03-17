import json
import ssl
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import settings


def _normalize_manifiesto(value: object) -> str:
    return str(value or "").strip()


def _strip_leading_zeros(value: str) -> str:
    stripped = value.lstrip("0")
    return stripped or "0"


def _extract_candidate_records(payload: object) -> list[dict]:
    candidates: list[dict] = []

    if isinstance(payload, list):
        candidates.extend([row for row in payload if isinstance(row, dict)])
        return candidates

    if isinstance(payload, dict):
        if payload.get("manifiesto") is not None:
            candidates.append(payload)

        for key in ("data", "result", "results", "items", "records", "respuesta"):
            value = payload.get(key)
            if isinstance(value, list):
                candidates.extend([row for row in value if isinstance(row, dict)])
            elif isinstance(value, dict) and value.get("manifiesto") is not None:
                candidates.append(value)

    return candidates


def _find_record_by_manifiesto(payload: object, manifiesto: str) -> dict:
    target = _normalize_manifiesto(manifiesto)
    if not target:
        return {}

    candidates = _extract_candidate_records(payload)
    if not candidates:
        return {}

    for row in candidates:
        raw = _normalize_manifiesto(row.get("manifiesto") or row.get("numero_manifiesto"))
        if raw == target:
            return row

    target_no_zeros = _strip_leading_zeros(target)
    for row in candidates:
        raw = _normalize_manifiesto(row.get("manifiesto") or row.get("numero_manifiesto"))
        if raw and _strip_leading_zeros(raw) == target_no_zeros:
            return row

    return {}


def fetch_avansat_by_manifiesto(manifiesto: str | None) -> dict:
    value = (manifiesto or "").strip()
    if not value:
        return {}
    if not settings.avansat_enabled:
        return {}

    params = {
        "aplicacion": settings.avansat_aplicacion,
        "type": settings.avansat_type,
        "user": settings.avansat_user,
        "pass": settings.avansat_pass,
        "manifiesto": value,
    }
    url = f"{settings.avansat_url}?{urlencode(params)}"

    req = Request(url, method="GET")
    if settings.avansat_auth_header:
        req.add_header("Authorization", settings.avansat_auth_header)

    context = None
    if not settings.avansat_verify_ssl:
        context = ssl._create_unverified_context()

    try:
        with urlopen(req, timeout=20, context=context) as response:
            raw = response.read().decode("utf-8", errors="ignore")
        payload = json.loads(raw)
    except Exception:
        return {}

    record = _find_record_by_manifiesto(payload, value)
    if not record:
        return {}

    remesas = record.get("remesas") if isinstance(record.get("remesas"), list) else []
    remesas_dicts = [row for row in remesas if isinstance(row, dict)]

    def pick(*keys: str) -> str | None:
        for key in keys:
            val = record.get(key)
            if val is None:
                continue
            txt = str(val).strip()
            if txt:
                return txt
        return None

    def pick_from_remesas(*keys: str) -> str | None:
        for remesa in remesas_dicts:
            for key in keys:
                val = remesa.get(key)
                if val is None:
                    continue
                txt = str(val).strip()
                if txt:
                    return txt
        return None

    return {
        "fecha_emision": pick("fecha_emision", "fecha_manifiesto", "fecha", "fecha_creacion"),
        "placa_vehiculo": pick("placa_vehiculo", "placa", "placa_cabezote"),
        "trayler": pick("trayler", "trailer", "remolque"),
        "remesa": pick("remesa", "numero_remesa") or pick_from_remesas("remesa", "numero_remesa"),
        "producto": (
            pick("producto", "producto_nombre", "nombre_producto", "mercancia", "material")
            or pick_from_remesas("producto", "mercancia", "material")
        ),
        "ciudad_origen": pick("ciudad_origen", "origen"),
        "ciudad_destino": pick("ciudad_destino", "destino"),
    }
