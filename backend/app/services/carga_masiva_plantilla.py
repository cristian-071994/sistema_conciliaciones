"""Genera la plantilla Excel de carga masiva de servicios.

La hoja 'Instrucciones' y el desplegable de Tipo Servicio se generan a partir
del catálogo real de servicios activos: cualquier servicio que se cree desde
el módulo Servicios aparece automáticamente la próxima vez que se descargue la
plantilla, sin tocar este código.
"""

from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from sqlalchemy.orm import Session

from app.models.servicio import Servicio
from app.services.standby import es_standby

# (clave interna, encabezado visible, ancho). Las columnas se reconocen por
# nombre (ver _normalize_excel_header en viajes.py), no por posición.
_COLUMNAS = [
    ("tipo_servicio", "Tipo Servicio", 22),
    ("titulo", "Título", 30),
    ("fecha_servicio", "Fecha (YYYY-MM-DD)", 20),
    ("placa", "Placa", 14),
    ("origen", "Origen", 22),
    ("destino", "Destino", 22),
    ("conductor", "Conductor (opcional)", 22),
    ("tarifa_tercero", "Tarifa Tercero", 18),
    ("descripcion", "Descripción (opcional)", 30),
    ("manifiesto_numero", "Manifiesto (opcional)", 22),
    ("fecha_hora_inicio", "Fecha y Hora Inicio Stand By", 28),
    ("fecha_hora_fin", "Fecha y Hora Fin Stand By", 28),
]

_INSTRUCCIONES = [
    "",
    "1. En la hoja 'Carga de Servicios' complete una fila por cada servicio a cargar.",
    "2. La operación se selecciona en el sistema al momento de subir el archivo.",
    "3. Tipo Servicio: use exactamente el código de la tabla de abajo (columna A tiene un desplegable con los valores válidos).",
    "4. Fecha: formato YYYY-MM-DD (ej: 2026-05-15).",
    "5. Placa: solo la placa del vehículo (ej: ABC123).",
    "6. Tarifa Tercero: número sin puntos ni comas (ej: 150000) — obligatoria, salvo en Stand By; el sistema calcula la tarifa cliente según la rentabilidad de la operación.",
    "7. Origen y Destino: obligatorios solo para los tipos de servicio marcados 'Sí' en la columna 'Requiere origen/destino' de la tabla de abajo.",
    "8. Conductor y Descripción son opcionales.",
    "9. No modifique los encabezados de la fila 1 ni el nombre de la hoja.",
    "10. Borre las filas de ejemplo antes de cargar el archivo real.",
    "11. Manifiesto: opcional. Si se indica, debe existir en Avansat y la placa debe coincidir.",
    "12. Stand By: son obligatorias 'Fecha y Hora Inicio Stand By' y 'Fecha y Hora Fin Stand By' (ej: 2026-11-15 22:00 y 2026-11-18 04:00; también se acepta 15/11/2026 22:00). El Stand By puede abarcar varios días y se cobra por hora.",
    "13. Stand By: si deja 'Tarifa Tercero' vacía, el sistema la calcula como horas × tarifa por hora del Catálogo de Tarifas para el tipo de vehículo de la placa. Si la ingresa, se toma como el valor TOTAL del Stand By. En Stand By la columna 'Fecha' se ignora: se usa la fecha de inicio.",
    "",
    "TIPOS DE SERVICIO DISPONIBLES ACTUALMENTE EN EL SISTEMA",
    "(esta tabla se genera automáticamente desde el módulo Servicios — si creas un servicio nuevo ahí, aparecerá aquí la próxima vez que descargues esta plantilla)",
    "",
]


def _fila_ejemplo(servicio: Servicio) -> dict[str, object]:
    fila: dict[str, object] = {
        "tipo_servicio": servicio.codigo,
        "titulo": f"Ejemplo {servicio.nombre}",
        "fecha_servicio": "2026-05-15",
        "placa": "ABC123",
        "origen": "Ciudad A" if servicio.requiere_origen_destino else "",
        "destino": "Ciudad B" if servicio.requiere_origen_destino else "",
        "conductor": "Juan Pérez",
        "tarifa_tercero": 150000,
    }
    if es_standby(servicio):
        fila["tarifa_tercero"] = ""  # se calcula con la tarifa por hora del catálogo
        fila["fecha_hora_inicio"] = "2026-11-15 22:00"
        fila["fecha_hora_fin"] = "2026-11-18 04:00"
    return fila


def construir_plantilla(db: Session) -> BytesIO:
    servicios_activos = db.query(Servicio).filter(Servicio.activo.is_(True)).order_by(Servicio.nombre.asc()).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "Carga de Servicios"

    header_fill = PatternFill(start_color="1F6B3A", end_color="1F6B3A", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=11)

    for col_num, (_, display, width) in enumerate(_COLUMNAS, 1):
        cell = ws.cell(row=1, column=col_num, value=display)
        cell.fill = header_fill
        cell.font = header_font
        ws.column_dimensions[get_column_letter(col_num)].width = width

    # Una fila de ejemplo por servicio activo (hasta un máximo razonable) para
    # que quede claro qué va en cada tipo. Stand By se incluye siempre aparte
    # para que sus columnas nuevas no queden fuera del tope de 6.
    ejemplos = servicios_activos[:6]
    standby = next((s for s in servicios_activos if es_standby(s)), None)
    if standby and standby not in ejemplos:
        ejemplos.append(standby)
    filas = [_fila_ejemplo(s) for s in ejemplos] or [
        {"tipo_servicio": "VIAJE", "titulo": "Urbano Ruta 1", "fecha_servicio": "2026-05-15", "placa": "ABC123",
         "origen": "Ciudad A", "destino": "Ciudad B", "conductor": "Juan Pérez", "tarifa_tercero": 150000}
    ]
    for row_num, fila in enumerate(filas, start=2):
        for col_num, (clave, _, _) in enumerate(_COLUMNAS, 1):
            ws.cell(row=row_num, column=col_num, value=fila.get(clave, ""))

    # Desplegable de Tipo Servicio contra el catálogo real (evita typos que
    # tumben la fila al cargar) — se alimenta de una hoja de referencia oculta
    # por si hay muchos servicios/nombres largos.
    if servicios_activos:
        ws_ref = wb.create_sheet("_ServiciosValidos")
        for i, servicio in enumerate(servicios_activos, start=1):
            ws_ref.cell(row=i, column=1, value=servicio.codigo)
        ws_ref.sheet_state = "hidden"

        dv = DataValidation(
            type="list",
            formula1=f"_ServiciosValidos!$A$1:$A${len(servicios_activos)}",
            allow_blank=True,
            showErrorMessage=True,
        )
        dv.error = "Selecciona un Tipo Servicio de la lista — revisa la hoja 'Instrucciones' para ver el catálogo completo."
        dv.errorTitle = "Tipo de servicio inválido"
        ws.add_data_validation(dv)
        dv.add("A2:A1000")

    ws_info = wb.create_sheet("Instrucciones")
    ws_info["A1"] = "INSTRUCCIONES PARA CARGA MASIVA DE SERVICIOS"
    ws_info["A1"].font = Font(bold=True, size=13)
    for i, linea in enumerate(_INSTRUCCIONES, 2):
        ws_info[f"A{i}"] = linea
    ws_info.column_dimensions["A"].width = 34
    ws_info.column_dimensions["B"].width = 40
    ws_info.column_dimensions["C"].width = 26

    tabla_header_row = 2 + len(_INSTRUCCIONES)
    for col_num, texto in enumerate(["Código (Tipo Servicio)", "Nombre", "Requiere origen/destino"], 1):
        cell = ws_info.cell(row=tabla_header_row, column=col_num, value=texto)
        cell.fill = header_fill
        cell.font = header_font

    if servicios_activos:
        for i, servicio in enumerate(servicios_activos, start=1):
            row = tabla_header_row + i
            ws_info.cell(row=row, column=1, value=servicio.codigo)
            ws_info.cell(row=row, column=2, value=servicio.nombre)
            ws_info.cell(row=row, column=3, value="Sí" if servicio.requiere_origen_destino else "No")
    else:
        ws_info.cell(
            row=tabla_header_row + 1,
            column=1,
            value="No hay servicios activos configurados todavía — créalos en el módulo Servicios antes de usar la carga masiva.",
        )

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return output
