package com.eskatesuv.ridervoz.voicenext

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.k2fsa.sherpa.onnx.*
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Offline Spanish command recognizer used after RIDER wake-word detection.
 * Emits one finalized utterance, then stops so the wake-word engine can re-arm.
 */
class RiderCommandEngine(
    private val context: Context,
    private val onCommand: (String) -> Unit,
    private val onError: (Throwable) -> Unit = {}
) {
    private val running = AtomicBoolean(false)
    private var recognizer: OnlineRecognizer? = null
    private var stream: OnlineStream? = null
    private var recorder: AudioRecord? = null
    private var worker: Thread? = null

    fun start(): Boolean {
        if (running.get()) return true
        return try {
            val dir = "rider-asr"
            val config = OnlineRecognizerConfig(
                featConfig = FeatureConfig(sampleRate = 16000, featureDim = 80),
                modelConfig = OnlineModelConfig(
                    transducer = OnlineTransducerModelConfig(
                        encoder = "$dir/encoder.onnx",
                        decoder = "$dir/decoder.onnx",
                        joiner = "$dir/joiner.onnx"
                    ),
                    tokens = "$dir/tokens.txt",
                    numThreads = 2,
                    provider = "cpu",
                    debug = false
                ),
                decodingMethod = "greedy_search",
                enableEndpoint = true,
                rule1MinTrailingSilence = 1.2f,
                rule2MinTrailingSilence = 0.8f,
                rule3MinUtteranceLength = 12.0f
            )
            val r = OnlineRecognizer(context.assets, config)
            val s = r.createStream()
            val min = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            val a = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,min*2)
            if (a.state != AudioRecord.STATE_INITIALIZED) error("AudioRecord no inicializado")
            recognizer=r; stream=s; recorder=a; running.set(true); a.startRecording()
            worker=thread(name="RiderCommand"){ loop(r,s,a) }
            true
        } catch(t:Throwable){ stop(); onError(t); false }
    }

    private fun loop(r:OnlineRecognizer,s:OnlineStream,a:AudioRecord){
        val buf=ShortArray(1600)
        try {
            while(running.get()){
                val n=a.read(buf,0,buf.size); if(n<=0) continue
                s.acceptWaveform(FloatArray(n){i->buf[i]/32768.0f},16000)
                while(running.get() && r.isReady(s)) r.decode(s)
                if(r.isEndpoint(s)){
                    val text=r.getResult(s).text.trim()
                    if(text.isNotBlank()){ running.set(false); onCommand(text); break }
                    r.reset(s)
                }
            }
        } catch(t:Throwable){ if(running.get()) onError(t) }
        finally { release() }
    }

    fun stop(){ running.set(false); try{recorder?.stop()}catch(_:Throwable){}; try{worker?.join(500)}catch(_:Throwable){}; release() }
    private fun release(){
        try{recorder?.release()}catch(_:Throwable){}; recorder=null
        try{stream?.release()}catch(_:Throwable){}; stream=null
        try{recognizer?.release()}catch(_:Throwable){}; recognizer=null
    }
}
