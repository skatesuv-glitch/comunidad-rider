package com.eskatesuv.ridervoz.voicenext

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import com.k2fsa.sherpa.onnx.KeywordSpotter
import com.k2fsa.sherpa.onnx.OnlineStream
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Nuevo detector de palabra de activación para Rider Voz.
 *
 * Este motor NO usa SpeechRecognizer y NO reproduce tonos.
 * Su única responsabilidad en la fase 1 es detectar "Rider".
 *
 * La inicialización concreta del KeywordSpotter se inyecta desde la capa
 * Android de la app para mantener este módulo separado de WebRTC/VOX.
 */
class RiderWakeWordEngine(
    private val context: Context,
    private val keywordSpotter: KeywordSpotter,
    private val keywordSpec: String,
    private val onWakeWord: () -> Unit,
    private val onError: (Throwable) -> Unit = {}
) {
    private val running = AtomicBoolean(false)
    private var stream: OnlineStream? = null
    private var recorder: AudioRecord? = null
    private var worker: Thread? = null

    private val sampleRate = 16000
    private val channel = AudioFormat.CHANNEL_IN_MONO
    private val encoding = AudioFormat.ENCODING_PCM_16BIT

    @Synchronized
    fun start(): Boolean {
        if (running.get()) return true

        if (ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.RECORD_AUDIO
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }

        return try {
            val minBuffer = AudioRecord.getMinBufferSize(sampleRate, channel, encoding)
            if (minBuffer <= 0) return false

            val localStream = keywordSpotter.createStream(keywordSpec)
            if (localStream.ptr == 0L) return false

            val localRecorder = AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                sampleRate,
                channel,
                encoding,
                minBuffer * 2
            )

            if (localRecorder.state != AudioRecord.STATE_INITIALIZED) {
                localStream.release()
                localRecorder.release()
                return false
            }

            stream = localStream
            recorder = localRecorder
            running.set(true)
            localRecorder.startRecording()

            worker = thread(name = "RiderWakeWord", start = true) {
                processLoop(localRecorder, localStream)
            }
            true
        } catch (t: Throwable) {
            running.set(false)
            onError(t)
            releaseInternal()
            false
        }
    }

    @Synchronized
    fun stop() {
        running.set(false)
        try {
            worker?.join(500)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        }
        worker = null
        releaseInternal()
    }

    fun isRunning(): Boolean = running.get()

    private fun processLoop(audioRecord: AudioRecord, kwsStream: OnlineStream) {
        val frame = ShortArray(1600) // 100 ms @ 16 kHz

        try {
            while (running.get()) {
                val read = audioRecord.read(frame, 0, frame.size)
                if (read <= 0) continue

                val samples = FloatArray(read) { i -> frame[i] / 32768.0f }
                kwsStream.acceptWaveform(samples, sampleRate)

                while (running.get() && keywordSpotter.isReady(kwsStream)) {
                    keywordSpotter.decode(kwsStream)
                    val result = keywordSpotter.getResult(kwsStream)
                    if (result.keyword.isNotBlank()) {
                        keywordSpotter.reset(kwsStream)
                        onWakeWord()
                    }
                }
            }
        } catch (t: Throwable) {
            if (running.get()) onError(t)
        } finally {
            running.set(false)
            releaseInternal()
        }
    }

    @Synchronized
    private fun releaseInternal() {
        val r = recorder
        recorder = null
        try {
            if (r?.recordingState == AudioRecord.RECORDSTATE_RECORDING) r.stop()
        } catch (_: Throwable) {}
        try {
            r?.release()
        } catch (_: Throwable) {}

        val s = stream
        stream = null
        try {
            s?.release()
        } catch (_: Throwable) {}
    }
}
