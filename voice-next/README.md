# Rider Voz · motor de comandos V2

Objetivo: sustituir por completo el sistema antiguo basado en SpeechRecognizer por un motor local y silencioso.

## Reglas de integración

- No modificar WebRTC, llamadas, grupo, VOX, Bluetooth ni UI aprobada.
- No arrancar/parar SpeechRecognizer en bucle.
- La detección de la palabra de activación "Rider" se hará con keyword spotting local.
- Primera fase: detectar únicamente "Rider" y emitir un evento interno.
- Segunda fase: escuchar una orden corta después de detectar "Rider".
- Tercera fase: ejecutar comandos.
- Durante una llamada activa, el módulo debe respetar la propiedad del micrófono y no provocar cambios de ruta de audio.
- Cualquier fallo del motor de comandos debe desactivar solo comandos, nunca cerrar Rider Voz.

## Motor elegido

sherpa-onnx KeywordSpotter, ejecutado localmente en Android.

## Criterio para pasar de fase

No se añade ningún comando hasta comprobar que la detección de "Rider" funciona varios minutos sin pitidos, cierres ni interferencia con la comunicación.
