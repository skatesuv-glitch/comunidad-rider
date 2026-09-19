# Base de datos · Comunidad Rider

Esquema inicial en `database/schema.sql`.

Principios:
- La ubicación compartida tiene caducidad obligatoria.
- La vista `active_shared_locations` excluye posiciones caducadas.
- Chat, rutas, retos y Rider Voz están separados por entidades.
- No se almacenan secretos en el repositorio.

Pendiente antes de producción:
1. Elegir/provisionar proveedor PostgreSQL.
2. Añadir autenticación real y políticas de acceso por usuario.
3. Ejecutar migraciones en entorno de desarrollo.
4. Sustituir los datos demo de la interfaz por la API remota.
5. Pruebas multiusuario y revisión de privacidad.
