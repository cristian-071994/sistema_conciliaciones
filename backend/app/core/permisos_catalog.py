"""Catálogo canónico de roles y permisos del módulo de administración.

Este catálogo gobierna acciones ADMINISTRATIVAS: gestión de usuarios, roles,
presencia, y el CRUD de los catálogos operativos (Operaciones, Clientes,
Terceros, Vehículos/Tipos de vehículo, Servicios, Catálogo de Tarifas,
Viajes, Avansat). COINTRA_ADMIN siempre tiene acceso total (es_superadmin).

Lo que NO vive aquí — sigue fijo en UserRole/CointraSubRol y en el código de
cada endpoint, a propósito, porque son la definición misma de cada rol de
negocio, no un permiso administrativo que tenga sentido apagar/prender:
  - Quién puede crear una solicitud de viaje adicional (CLIENTE), ingresar su
    tarifa (TERCERO) o adjuntar el manifiesto (COINTRA).
  - El ciclo de estados de una conciliación (borrador → revisión → aprobada
    → facturada) y quién puede moverla de un estado a otro.
  - La visibilidad de datos por rol: qué operaciones ve cada quien y qué
    campos financieros ve cada rol (sanitize_item_for_role).
  - Que un Tercero pueda crear vehículos/tipos de vehículo propios: es su
    capacidad de autogestionar su flota, no una concesión administrativa.

seed_data() usa este catálogo para insertar de forma idempotente (por
nombre/clave) cualquier rol o permiso nuevo que se agregue en el futuro, sin
requerir una migración de Alembic por cada permiso nuevo. La migración
7a2f9c4e6b81 mantiene su propia copia congelada de la versión inicial.
"""

# (nombre, descripcion, es_superadmin, es_sistema)
ROLES_BASE: list[tuple[str, str, bool, bool]] = [
    ("COINTRA_ADMIN", "Administrador Cointra — acceso total", True, True),
    ("COINTRA_USER", "Usuario operativo Cointra", False, True),
    ("CLIENTE", "Usuario del cliente", False, True),
    ("TERCERO", "Usuario del transportador (tercero)", False, True),
]

# (clave, categoria, descripcion)
PERMISOS: list[tuple[str, str, str]] = [
    ("usuarios.ver", "Usuarios", "Ver el listado de usuarios del sistema"),
    ("usuarios.crear", "Usuarios", "Crear nuevos usuarios"),
    ("usuarios.editar", "Usuarios", "Editar usuarios existentes"),
    ("usuarios.desactivar", "Usuarios", "Desactivar o reactivar usuarios"),
    ("roles.ver", "Roles", "Ver roles y sus permisos"),
    ("roles.crear", "Roles", "Crear roles nuevos"),
    ("roles.editar", "Roles", "Editar nombre y descripción de roles"),
    ("roles.desactivar", "Roles", "Desactivar o reactivar roles"),
    ("roles.gestionar", "Roles", "Editar los permisos asignados a cada rol"),
    ("presencia.ver", "Presencia", "Ver el estado de conexión de los usuarios"),
    ("operaciones.crear", "Operaciones", "Crear nuevas operaciones"),
    ("operaciones.editar", "Operaciones", "Editar operaciones existentes (cliente, tercero, asignaciones)"),
    ("operaciones.rentabilidad", "Operaciones", "Configurar el porcentaje de rentabilidad de una operación"),
    ("operaciones.desactivar", "Operaciones", "Desactivar o reactivar operaciones"),
    ("clientes.crear", "Clientes", "Crear nuevos clientes"),
    ("clientes.editar", "Clientes", "Editar clientes existentes"),
    ("clientes.desactivar", "Clientes", "Desactivar o reactivar clientes"),
    ("terceros.crear", "Terceros", "Crear nuevos terceros"),
    ("terceros.editar", "Terceros", "Editar terceros existentes"),
    ("terceros.desactivar", "Terceros", "Desactivar o reactivar terceros"),
    ("vehiculos.crear", "Vehículos", "Crear vehículos (además de los que registra directamente cada Tercero)"),
    ("vehiculos.editar", "Vehículos", "Editar vehículos existentes"),
    ("vehiculos.desactivar", "Vehículos", "Desactivar o reactivar vehículos"),
    ("tipos_vehiculo.crear", "Vehículos", "Crear tipos de vehículo"),
    ("tipos_vehiculo.editar", "Vehículos", "Editar tipos de vehículo"),
    ("tipos_vehiculo.desactivar", "Vehículos", "Desactivar o reactivar tipos de vehículo"),
    ("servicios.crear", "Servicios", "Crear tipos de servicio en el catálogo"),
    ("servicios.editar", "Servicios", "Editar tipos de servicio existentes"),
    ("servicios.desactivar", "Servicios", "Desactivar o reactivar tipos de servicio"),
    ("catalogo_tarifas.ver", "Catálogo de Tarifas", "Ver el catálogo completo de tarifas parametrizadas"),
    ("catalogo_tarifas.crear", "Catálogo de Tarifas", "Crear tarifas (además de rutas que puede crear un Cliente desde la app)"),
    ("catalogo_tarifas.editar", "Catálogo de Tarifas", "Editar tarifas existentes"),
    ("catalogo_tarifas.desactivar", "Catálogo de Tarifas", "Desactivar o reactivar tarifas"),
    ("viajes.crear", "Viajes", "Cargar viajes de forma individual o masiva (además de lo que carga cada Tercero)"),
    ("viajes.editar", "Viajes", "Editar viajes existentes"),
    ("viajes.desactivar", "Viajes", "Desactivar o reactivar viajes"),
    ("avansat.consultar", "Consulta Avansat", "Consultar manifiestos y caché de Avansat"),
    ("avansat.sincronizar", "Consulta Avansat", "Disparar la sincronización manual de ayer/hoy"),
    ("avansat.sincronizar_historico", "Consulta Avansat", "Disparar la sincronización desde el mes anterior"),
]

# Permisos por defecto de roles no-superadmin (COINTRA_ADMIN tiene bypass
# total). Reproduce EXACTAMENTE el comportamiento que ya tenía el sistema
# antes de que estas acciones fueran configurables, para que ningún
# COINTRA_USER pierda ni gane acceso el día que esto se despliegue — un
# admin ajusta desde el módulo de Roles a partir de ahí.
PERMISOS_POR_ROL_DEFECTO: dict[str, list[str]] = {
    "COINTRA_USER": [
        "operaciones.crear",
        "operaciones.rentabilidad",
        "clientes.crear",
        "terceros.crear",
        "vehiculos.crear",
        "tipos_vehiculo.crear",
        "viajes.crear",
        "avansat.consultar",
        "avansat.sincronizar",
    ],
    "CLIENTE": [],
    "TERCERO": [],
}
