"""Validación de soportes (PDF/imagen) adjuntos a un servicio cargado.

Todo se valida acá, en el servidor: el tipo se detecta por los primeros bytes
del archivo (no por la extensión ni por el Content-Type que declare el
cliente), así un .exe renombrado a .pdf se rechaza. SVG/HTML quedan fuera a
propósito: pueden ejecutar scripts al abrirse.
"""

import re
from dataclasses import dataclass

from app.core.upload_limits import SERVICIO_ADJUNTO_MAX_BYTES, SERVICIO_ADJUNTOS_MAX_CANTIDAD

_EXTENSION_POR_TIPO = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


@dataclass
class AdjuntoValidado:
    filename: str
    content_type: str
    content: bytes


def detectar_tipo(content: bytes) -> str | None:
    if content.startswith(b"%PDF-"):
        return "application/pdf"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


def sanear_nombre(nombre: str | None, content_type: str) -> str:
    """Deja solo el nombre base, sin rutas ni caracteres de control, y con la
    extensión que corresponde al tipo real detectado."""
    base = (nombre or "").replace("\\", "/").split("/")[-1]
    base = re.sub(r"[^\w.\- ()]", "_", base).strip(" .")
    extension = _EXTENSION_POR_TIPO[content_type]
    stem = base.rsplit(".", 1)[0] if "." in base else base
    stem = (stem or "soporte")[: 255 - len(extension)]
    return f"{stem}{extension}"


def validar_adjunto(nombre: str | None, content: bytes) -> AdjuntoValidado:
    """Lanza ValueError con un mensaje apto para mostrar al usuario."""
    etiqueta = nombre or "El archivo"
    if not content:
        raise ValueError(f"'{etiqueta}' está vacío.")
    if len(content) > SERVICIO_ADJUNTO_MAX_BYTES:
        limite = SERVICIO_ADJUNTO_MAX_BYTES // (1024 * 1024)
        raise ValueError(f"'{etiqueta}' supera el tamaño máximo permitido ({limite} MB).")
    tipo = detectar_tipo(content)
    if tipo is None:
        raise ValueError(f"'{etiqueta}' no es un PDF ni una imagen válida (se aceptan PDF, JPG, PNG y WEBP).")
    return AdjuntoValidado(filename=sanear_nombre(nombre, tipo), content_type=tipo, content=content)


def validar_cantidad(existentes: int, nuevos: int) -> None:
    if nuevos <= 0:
        raise ValueError("Selecciona al menos un archivo.")
    if existentes + nuevos > SERVICIO_ADJUNTOS_MAX_CANTIDAD:
        disponibles = max(0, SERVICIO_ADJUNTOS_MAX_CANTIDAD - existentes)
        raise ValueError(
            f"Cada servicio admite máximo {SERVICIO_ADJUNTOS_MAX_CANTIDAD} archivos. "
            f"Ya tiene {existentes}; puedes agregar {disponibles} más."
        )
