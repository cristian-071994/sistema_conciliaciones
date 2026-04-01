# CONTEXT FRONTEND - Estado actual

## Stack real
- React 18
- TypeScript
- Vite 5
- React Router 6
- TailwindCSS

## Estructura principal
- src/App.tsx: enrutamiento, sesion, carga inicial y alertas.
- src/pages/: modulos de UI por dominio.
- src/services/api.ts: cliente HTTP con token JWT y manejo de 401.
- src/types/: contratos tipados frontend/backend.
- src/components/: layout, formularios y modales reutilizables.

## Rutas activas
- /login
- /forgot-password
- /reset-password
- /dashboard
- /conciliaciones
- /operaciones
- /avansat
- /vehiculos
- /servicios
- /catalogo-tarifas
- /clientes
- /terceros
- /usuarios
- /cambiar-password

## Comportamiento clave
- Autenticacion persistente con token en localStorage.
- Carga de datos inicial por usuario autenticado.
- Mecanismo de logout automatico ante 401.
- Dashboard con filtros por periodo y visualizacion por rol.
- Alertas de notificaciones y apertura dirigida de conciliaciones.

## Configuracion
- Variable principal: VITE_API_URL
- Valor local esperado: http://127.0.0.1:8000/api

## Compatibilidad con contenedores
En despliegue por contenedores, VITE_API_URL debe apuntar al servicio backend dentro de la red interna.
