# Viajes Adicionales — App móvil (Cointra)

App para que el **CLIENTE** solicite viajes adicionales desde el celular:
operación, vehículo disponible, fecha, origen/destino, producto y
observaciones. Usa la misma API del backend que la web — no hay endpoints
exclusivos de móvil. Solo usuarios con rol `CLIENTE` pueden iniciar sesión
aquí (lo valida `src/auth.tsx`, no el backend).

Incluye además la pantalla `app/tarifas.tsx` para que el Cliente cree una
tarifa de ruta cuando el sistema no encuentra una para el origen/destino/tipo
de vehículo seleccionado — solo ingresa `tarifa_cliente`; el backend calcula
`tarifa_tercero`/rentabilidad con el % por defecto (el Cliente nunca ve ni
fija la rentabilidad).

Stack: Expo SDK 57 + Expo Router (React Native 0.86 / React 19).

## Desarrollo local

```bash
npm install --legacy-peer-deps
cp .env.example .env   # EXPO_PUBLIC_API_URL=http://127.0.0.1:8001/api
npx expo start
```

- `--legacy-peer-deps` es necesario hoy por un conflicto de peer-deps entre
  `expo-router`/`@expo/cli` y `react-dom` en esta versión de Expo (no es un
  problema de este proyecto, es de la propia cadena de dependencias de Expo
  57). Revisar si sigue haciendo falta cuando se actualice el SDK.
- Escanea el QR con la app **Expo Go** en un Android real, o `npm run android`
  con un emulador/dispositivo conectado.
- `npm run web:preview` levanta la versión web en `http://localhost:8090`
  (usado también por `.claude/launch.json` para previsualizar en el navegador
  durante el desarrollo — la versión Android real usa `react-native-webview`
  y `expo-intent-launcher` para el manifiesto, que no aplican en web).

## Cómo se ve el manifiesto PDF

Android no puede renderizar PDF dentro de un WebView de forma nativa, así
que la app descarga el archivo (`expo-file-system/legacy`, con el header
`Authorization` de la sesión) y lo abre con el visor de PDF del sistema vía
`expo-intent-launcher` (`ACTION_VIEW`). iOS sí puede mostrarlo embebido en un
WebView. Ver `app/manifiesto/[id].tsx`.

## Generar el APK (esto NO corre en Docker)

Docker ejecuta servidores, no instala apps en el celular del cliente. El
`Dockerfile.prod` de esta carpeta solo sirve la versión **web** de la app
(útil para probarla desde un navegador en el servidor). Para el APK real:

```bash
# Build local (requiere Android Studio / SDK instalado)
npx expo run:android --variant release

# O con EAS Build (build en la nube de Expo, sin instalar nada localmente)
npx eas build --platform android
```

## Despliegue de la versión web (Docker, en el mismo servidor)

```bash
docker build -f Dockerfile.prod \
  --build-arg EXPO_PUBLIC_API_URL=https://conciliaciones.cointra.com.co/api \
  -t cointra-viajes-adicionales-web .
docker run -p 8090:80 cointra-viajes-adicionales-web
```

Falta agregar este servicio a `docker-compose.prod.yml` cuando se decida el
dominio/subpath definitivo para la versión web (pendiente, no se ha hecho
todavía).
