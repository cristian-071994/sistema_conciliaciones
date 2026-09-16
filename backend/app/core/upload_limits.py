"""Límites de tamaño de archivo para UploadFile — antes no existían en NINGÚN
endpoint (deuda técnica documentada en CLAUDE.md). El límite de nginx
(client_max_body_size, hoy 20M) es de infraestructura y no reemplaza esta
validación: debe existir también en la aplicación, con un mensaje de error
claro y protección aunque el archivo llegue por otra vía."""

FACTURA_PDF_MAX_BYTES = 15 * 1024 * 1024  # 15 MB por archivo de factura
CARGA_MASIVA_EXCEL_MAX_BYTES = 20 * 1024 * 1024  # 20 MB, igual al límite ya fijado en nginx
MANIFIESTO_VIAJE_ADICIONAL_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
