# eSkate SUV Comunidad · envoltorio móvil

Este proyecto mantiene Comunidad separado de la app principal.

## Preparación
1. Instalar Node.js.
2. Ejecutar `npm install`.
3. Copiar la web estática a `www/` antes de sincronizar.
4. Ejecutar `npx cap add android` y/o `npx cap add ios`.
5. Ejecutar `npm run sync`.

## Importante
El proyecto nativo todavía debe generarse y probarse físicamente. GPS, permisos, audio, BLE y ejecución en segundo plano requieren validación específica en Android/iOS antes de publicación.
