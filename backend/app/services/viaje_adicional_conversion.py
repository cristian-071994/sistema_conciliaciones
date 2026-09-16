from sqlalchemy.orm import Session

from app.models.enums import UserRole
from app.models.servicio import Servicio
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.models.viaje_adicional import SolicitudViajeAdicional

# viajes.py (_is_viaje_or_extra) ya reconoce este código para el flujo de
# tarifa manual + manifiesto — es el mismo servicio que usan Tercero/Cointra
# cuando cargan un "viaje adicional" directamente en el módulo de Viajes.
VIAJE_ADICIONAL_SERVICIO_NOMBRE = "Viaje Adicional"
VIAJE_ADICIONAL_SERVICIO_CODIGO = "VIAJE_ADICIONAL"


def ensure_servicio_viaje_adicional(db: Session, created_by: int) -> Servicio:
    """Idempotente por código — se llama tanto desde el seed como, de forma
    defensiva, desde la conversión misma por si el catálogo se borró."""
    servicio = db.query(Servicio).filter(Servicio.codigo == VIAJE_ADICIONAL_SERVICIO_CODIGO).first()
    if servicio:
        return servicio
    servicio = Servicio(
        nombre=VIAJE_ADICIONAL_SERVICIO_NOMBRE,
        codigo=VIAJE_ADICIONAL_SERVICIO_CODIGO,
        requiere_origen_destino=True,
        activo=True,
        created_by=created_by,
    )
    db.add(servicio)
    db.flush()
    return servicio


def convertir_en_viaje(
    db: Session,
    solicitud: SolicitudViajeAdicional,
    numero_manifiesto: str,
    user: Usuario,
) -> Viaje:
    """Se llama al subir el manifiesto (con tarifa_tercero ya puesta por el
    Tercero) — crea el Viaje facturable, o si ya existía (reemplazo del PDF)
    solo sincroniza el número de manifiesto. A partir de aquí el registro
    entra al flujo normal de conciliación (adjuntar-viajes, etc.) igual que
    cualquier viaje cargado directamente por Tercero/Cointra.
    """
    if solicitud.tarifa_tercero is None:
        raise ValueError("La solicitud no tiene tarifa_tercero — no se puede convertir en viaje")

    if solicitud.viaje_id:
        viaje_existente = db.get(Viaje, solicitud.viaje_id)
        if viaje_existente:
            viaje_existente.manifiesto_numero = numero_manifiesto
            return viaje_existente

    servicio = ensure_servicio_viaje_adicional(db, created_by=user.id)
    descripcion = f"Producto: {solicitud.producto}."
    if solicitud.observaciones:
        descripcion += f" {solicitud.observaciones}"

    viaje = Viaje(
        operacion_id=solicitud.operacion_id,
        tercero_id=solicitud.operacion.tercero_id,
        servicio_id=servicio.id,
        titulo=solicitud.titulo,
        fecha_servicio=solicitud.fecha_viaje,
        origen=solicitud.origen,
        destino=solicitud.destino,
        placa=solicitud.vehiculo.placa,
        conductor=None,
        tarifa_tercero=float(solicitud.tarifa_tercero),
        tarifa_cliente=float(solicitud.tarifa_cliente) if solicitud.tarifa_cliente is not None else None,
        rentabilidad=float(solicitud.rentabilidad) if solicitud.rentabilidad is not None else None,
        manifiesto_numero=numero_manifiesto,
        descripcion=descripcion,
        cargado_por=UserRole.CLIENTE.value,
        activo=True,
        created_by=user.id,
    )
    db.add(viaje)
    db.flush()
    solicitud.viaje_id = viaje.id
    return viaje
