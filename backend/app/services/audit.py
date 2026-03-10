from sqlalchemy.orm import Session

from app.models.historial_cambio import HistorialCambio


def _to_text(value) -> str | None:
    if value is None:
        return None
    return str(value)


def log_change(
    db: Session,
    *,
    usuario_id: int,
    campo: str,
    valor_anterior=None,
    valor_nuevo=None,
    conciliacion_id: int | None = None,
    item_id: int | None = None,
) -> None:
    row = HistorialCambio(
        conciliacion_id=conciliacion_id,
        item_id=item_id,
        usuario_id=usuario_id,
        campo=campo,
        valor_anterior=_to_text(valor_anterior),
        valor_nuevo=_to_text(valor_nuevo),
    )
    db.add(row)
