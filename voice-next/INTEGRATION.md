# Integración Android · fase 1

## Qué se mantiene congelado

La APK estable aprobada sigue siendo la referencia visual y funcional. No se modifica:
- WebRTC
- llamadas
- grupo
- VOX
- Bluetooth
- círculo / ondas / layout

## Qué se sustituye

Solo el subsistema antiguo de comandos:
- RiderVoicePlugin.startCommandListening
- RiderVoicePlugin.stopCommandListening
- SpeechRecognizer
- eventos voiceCommand del motor antiguo

## Nuevo flujo

1. RiderWakeWordPlugin.start()
2. RiderWakeWordEngine abre AudioRecord a 16 kHz mono.
3. sherpa-onnx KeywordSpotter analiza PCM localmente.
4. Al detectar la palabra, emite el evento Capacitor wakeWord.
5. Fase 1 termina ahí. No se abre reconocimiento de comandos todavía.

## Modelo

Usar un modelo KWS móvil de sherpa-onnx compatible con inglés.
La frase "Rider" debe convertirse a tokens con la herramienta oficial text2token.
No escribir tokens BPE a mano.

Ejemplo de materia prima:
RIDER :1.5 #0.25 @RIDER

La salida de text2token se guarda como:
assets/rider-kws/rider-keyword.txt

## Condición de aprobación de fase 1

En dispositivo físico:
- 5 minutos en Rider Voz sin pitidos.
- 20 activaciones "Rider" seguidas.
- 0 cierres.
- 0 cambios de ruta de audio.
- Entrar/salir de Ajustes no detiene el motor si el usuario lo dejó activo.
- Durante llamada WebRTC, si Android no permite compartir el micrófono de forma segura, el detector se pausa sin sonido y se rearma al finalizar.

Hasta cumplir esto no se añade ningún comando.
