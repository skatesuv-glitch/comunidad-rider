# Rider Voz: base bloqueada y alcance autorizado

Petición de David, 24 de septiembre de 2026:
«NO SE TOCA NADA [...] estructura, colores, botones [...] eliminar y hacer desde cero Rider comandos de voz; buscar el porqué y no parchear».

Base única: Rider-Voz-CIRCULO-CENTRADO-FINO-V2(1)(1).zip, APK Rider-Voz-CIRCULO-CENTRADO-FINO-V2.apk.
El archivo reference/approved-assets.json fija las huellas de todos sus recursos web.
reference/approved-app.js conserva exactamente el JavaScript original extraído.

Solo se autoriza reemplazar el subsistema de comandos y las llamadas estrictamente necesarias para integrarlo. HTML, estilos, imagen, estructura, botones, PTT/VOX, conexión, grupos y Bluetooth se preservan. tests/verify_base.py bloquea cambios ajenos a comandos.

Nunca entregar otra base ni afirmar éxito por cambiar código. Antes de entregar una APK: compilar, verificar firma e instalación compatible, comparar recursos con la base aprobada, comprobar comandos y respuesta hablada. Indicar expresamente las pruebas de dispositivo que no se hayan podido ejecutar. Las APK se entregan dentro de ZIP.


## Base blindada posterior a prueba real

El usuario confirmó el 24 de septiembre de 2026 que Rider Voz UV2 287 funciona en dispositivo.
La rama `rider-voz-blindada-287` queda como base intocable.
Todo desarrollo nuevo se hace sobre `rider-voz-trabajo-288`.

Autorización nueva: evolucionar Comandos Rider a asistente/ordenador de a bordo y añadir en Ajustes un desplegable compacto con la lista de comandos. Regla funcional fija: toda orden de usuario debe ir precedida por «Rider»; la ayuda escrita mostrará siempre esa forma.

Comunidad Rider y Rider Voz comparten las mismas fuentes de datos. El asistente no mantiene una segunda lista de Riders ni una base paralela: consulta presencia, grupo y ubicación de Comunidad Rider. Las preguntas de zona respetan el consentimiento de ubicación ya existente; si no está activo, el asistente debe indicarlo y no eludirlo.
