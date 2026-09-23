package com.eskatesuv.riderwakewordtest

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.k2fsa.sherpa.onnx.*
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread
import kotlin.math.log10
import kotlin.math.sqrt

class MainActivity : AppCompatActivity() {
    private lateinit var status: TextView
    private lateinit var levelText: TextView
    private lateinit var levelBar: ProgressBar
    private lateinit var button: Button

    private var spotter: KeywordSpotter? = null
    private var stream: OnlineStream? = null
    private var recorder: AudioRecord? = null
    private var worker: Thread? = null
    private val running = AtomicBoolean(false)
    private var detections = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
            setBackgroundColor(Color.rgb(7, 18, 26))
        }

        status = TextView(this).apply {
            text = "NUEVO MOTOR RIDER\n\nParado"
            textSize = 24f
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
        }

        levelText = TextView(this).apply {
            text = "ENTRADA DE AUDIO: 0%"
            textSize = 15f
            gravity = Gravity.CENTER
            setTextColor(Color.LTGRAY)
            setPadding(0, 24, 0, 12)
        }

        levelBar = ProgressBar(
            this,
            null,
            android.R.attr.progressBarStyleHorizontal
        ).apply {
            max = 100
            progress = 0
        }

        button = Button(this).apply {
            text = "ACTIVAR DETECTOR"
            textSize = 16f
            setOnClickListener {
                if (running.get()) stopDetector() else ensurePermissionAndStart()
            }
        }

        root.addView(status, LinearLayout.LayoutParams(-1, 0, 1f))
        root.addView(levelText, LinearLayout.LayoutParams(-1, -2))
        root.addView(levelBar, LinearLayout.LayoutParams(-1, -2))
        root.addView(button, LinearLayout.LayoutParams(-1, -2))
        setContentView(root)
    }

    private fun ensurePermissionAndStart() {
        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.RECORD_AUDIO
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.RECORD_AUDIO),
                7
            )
        } else {
            startDetector()
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 7 &&
            grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
        ) {
            startDetector()
        }
    }

    private fun startDetector() {
        if (running.get()) return

        try {
            val dir =
                "rider-kws/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01"

            val model = OnlineModelConfig(
                transducer = OnlineTransducerModelConfig(
                    encoder = "$dir/encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
                    decoder = "$dir/decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
                    joiner = "$dir/joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx"
                ),
                tokens = "$dir/tokens.txt",
                numThreads = 1,
                provider = "cpu",
                debug = false
            )

            val cfg = KeywordSpotterConfig(
                featConfig = FeatureConfig(sampleRate = 16000, featureDim = 80),
                modelConfig = model,
                maxActivePaths = 4,
                numTrailingBlanks = 1,
                keywordsScore = 3.0f,
                keywordsThreshold = 0.10f,
                keywordsFile = "$dir/rider-keyword.txt"
            )

            val localSpotter = KeywordSpotter(
                assetManager = assets,
                config = cfg
            )
            val localStream = localSpotter.createStream()

            val min = AudioRecord.getMinBufferSize(
                16000,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )

            val localRecorder = AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                16000,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                min * 2
            )

            if (localRecorder.state != AudioRecord.STATE_INITIALIZED) {
                error("AudioRecord no inicializado")
            }

            spotter = localSpotter
            stream = localStream
            recorder = localRecorder
            running.set(true)
            localRecorder.startRecording()

            status.text =
                "ESCUCHANDO\n\nDi: RIDER\n\nDetecciones: $detections"
            button.text = "DETENER"

            worker = thread(name = "RiderKws") {
                val buf = ShortArray(1600)

                try {
                    while (running.get()) {
                        val n = localRecorder.read(buf, 0, buf.size)
                        if (n <= 0) continue

                        var sumSquares = 0.0
                        for (i in 0 until n) {
                            val s = buf[i].toDouble() / 32768.0
                            sumSquares += s * s
                        }
                        val rms = sqrt(sumSquares / n.coerceAtLeast(1))
                        val db = if (rms > 0.000001) 20.0 * log10(rms) else -120.0
                        val percent = (((db + 60.0) / 60.0) * 100.0)
                            .toInt()
                            .coerceIn(0, 100)

                        runOnUiThread {
                            levelBar.progress = percent
                            levelText.text = "ENTRADA DE AUDIO: $percent%"
                        }

                        val samples = FloatArray(n) { i ->
                            buf[i] / 32768.0f
                        }
                        localStream.acceptWaveform(samples, 16000)

                        while (
                            running.get() &&
                            localSpotter.isReady(localStream)
                        ) {
                            localSpotter.decode(localStream)
                            val result = localSpotter.getResult(localStream)

                            if (result.keyword.isNotBlank()) {
                                localSpotter.reset(localStream)
                                detections++

                                runOnUiThread {
                                    status.text =
                                        "RIDER DETECTADO ✓\n\n" +
                                        "Detecciones: $detections\n\n" +
                                        "Sigue escuchando"
                                }
                            }
                        }
                    }
                } catch (t: Throwable) {
                    runOnUiThread {
                        status.text =
                            "ERROR\n\n${t.message ?: t.javaClass.simpleName}"
                    }
                } finally {
                    running.set(false)
                }
            }
        } catch (t: Throwable) {
            status.text =
                "ERROR AL INICIAR\n\n${t.message ?: t.javaClass.simpleName}"
            stopDetector()
        }
    }

    private fun stopDetector() {
        running.set(false)

        try { recorder?.stop() } catch (_: Throwable) {}
        try { worker?.join(500) } catch (_: Throwable) {}
        worker = null

        try { recorder?.release() } catch (_: Throwable) {}
        recorder = null

        try { stream?.release() } catch (_: Throwable) {}
        stream = null

        try { spotter?.release() } catch (_: Throwable) {}
        spotter = null

        runOnUiThread {
            button.text = "ACTIVAR DETECTOR"
            levelBar.progress = 0
            levelText.text = "ENTRADA DE AUDIO: 0%"
            if (!isFinishing) {
                status.text = "PARADO\n\nSin SpeechRecognizer"
            }
        }
    }

    override fun onDestroy() {
        stopDetector()
        super.onDestroy()
    }
}
