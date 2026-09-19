# Modelo de backend - Comunidad Rider

La maqueta separa interfaz y datos. El backend remoto deberá contemplar perfiles, presencia, ubicaciones compartidas, conversaciones, mensajes, rutas, favoritos, retos e invitaciones de Rider Voz.

## Privacidad
La ubicación se publica únicamente tras consentimiento explícito. Desactivar la compartición debe impedir nuevas actualizaciones. La última ubicación deberá tener caducidad definida en servidor y no convertirse en un historial de movimientos visible para otros usuarios.

## Estado actual
community-store.js usa localStorage para desarrollar la interfaz sin depender todavía de un proveedor remoto. No es multiusuario ni sincroniza dispositivos.