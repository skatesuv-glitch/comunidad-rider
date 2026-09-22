package com.eskatesuv.ridervoz.voicenext

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Puente Capacitor del NUEVO motor de palabra de activación.
 *
 * Importante:
 * - No usa android.speech.SpeechRecognizer.
 * - No toca WebRTC ni la ruta de audio de llamadas.
 * - En fase 1 solo expone start/stop/status y el evento wakeWord.
 */
@CapacitorPlugin(name = "RiderWakeWord")
class RiderWakeWordPlugin : Plugin() {

    private var engine: RiderWakeWordEngine? = null

    override fun load() {
        super.load()
        // El motor se crea de forma perezosa en start().
        // Esto evita abrir el micrófono al cargar la app.
    }

    @PluginMethod
    fun start(call: PluginCall) {
        if (engine?.isRunning() == true) {
            call.resolve(statusPayload(true))
            return
        }

        try {
            val built = RiderWakeWordFactory.create(
                context = context,
                onWakeWord = {
                    val data = JSObject()
                    data.put("keyword", "Rider")
                    notifyListeners("wakeWord", data, true)
                },
                onError = { error ->
                    val data = JSObject()
                    data.put("message", error.message ?: error.javaClass.simpleName)
                    notifyListeners("wakeWordError", data, true)
                }
            )

            if (built == null) {
                call.reject("El modelo local de Rider todavía no está instalado")
                return
            }

            engine = built
            if (!built.start()) {
                engine = null
                call.reject("No se pudo iniciar la escucha local de Rider")
                return
            }

            call.resolve(statusPayload(true))
        } catch (t: Throwable) {
            engine = null
            call.reject(t.message ?: "Error iniciando RiderWakeWord")
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        engine?.stop()
        engine = null
        call.resolve(statusPayload(false))
    }

    @PluginMethod
    fun status(call: PluginCall) {
        call.resolve(statusPayload(engine?.isRunning() == true))
    }

    override fun handleOnDestroy() {
        engine?.stop()
        engine = null
        super.handleOnDestroy()
    }

    private fun statusPayload(active: Boolean): JSObject {
        val data = JSObject()
        data.put("active", active)
        data.put("engine", "sherpa-onnx")
        data.put("mode", "wake-word-only")
        return data
    }
}
