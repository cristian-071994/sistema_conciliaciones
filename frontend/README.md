# Frontend - Sistema de Conciliacion Cointra

## Requisitos
- Node.js 20+

## Instalacion
```powershell
npm install
copy .env.example .env
```

## Configuracion
Variable principal:

- VITE_API_URL=http://127.0.0.1:8000/api

## Ejecutar en desarrollo
```powershell
npm run dev
```

## Build de produccion
```powershell
npm run build
npm run preview
```

## Modulos de pagina
- Dashboard principal
- Conciliaciones
- Operaciones
- Avansat
- Vehiculos
- Servicios
- Catalogo de tarifas
- Clientes
- Terceros
- Usuarios

## Notas de integracion
- El frontend depende de una API backend autenticada por JWT.
- Si el backend retorna 401, la sesion se limpia y se fuerza login.
- Para despliegue por contenedores, VITE_API_URL debe apuntar al servicio backend.
