package com.eskatesuv.ridervoz.voicenext

import android.content.Context
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.KeywordSpotter
import com.k2fsa.sherpa.onnx.KeywordSpotterConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig

/**
 * Configuración del modelo KWS inglés de sherpa-onnx.
 *
 * Para la primera prueba usamos GigaSpeech KWS 3.3M, pequeño y específico
 * para palabras/frases en inglés. La wake word es "RIDER".
 */
object RiderWakeWordFactory {
    private const val MODEL_DIR =
        "rider-kws/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01"

    private const val ENCODER =
        "encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx"
    private const val DECODER =
        "decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx"
    private const val JOINER =
        "joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx"
    private const val TOKENS = "tokens.txt"
    private const val KEYWORDS = "rider-keyword.txt"

    fun create(
        context: Context,
        onWakeWord: () -> Unit,
        onError: (Throwable) -> Unit
    ): RiderWakeWordEngine? {
        val required = listOf(ENCODER, DECODER, JOINER, TOKENS, KEYWORDS)
        if (required.any { !assetExists(context, "$MODEL_DIR/$it") }) return null

        val model = OnlineModelConfig(
            transducer = OnlineTransducerModelConfig(
                encoder = "$MODEL_DIR/$ENCODER",
                decoder = "$MODEL_DIR/$DECODER",
                joiner = "$MODEL_DIR/$JOINER"
            ),
            tokens = "$MODEL_DIR/$TOKENS",
            numThreads = 1,
            debug = false,
            provider = "cpu",
            modelType = ""
        )

        val config = KeywordSpotterConfig(
            featConfig = FeatureConfig(sampleRate = 16000, featureDim = 80),
            modelConfig = model,
            maxActivePaths = 4,
            keywordsFile = "$MODEL_DIR/$KEYWORDS",
            keywordsScore = 1.5f,
            keywordsThreshold = 0.25f,
            numTrailingBlanks = 1
        )

        val spotter = KeywordSpotter(
            assetManager = context.assets,
            config = config
        )

        return RiderWakeWordEngine(
            context = context,
            keywordSpotter = spotter,
            onWakeWord = onWakeWord,
            onError = onError
        )
    }

    private fun assetExists(context: Context, path: String): Boolean {
        return try {
            context.assets.open(path).close()
            true
        } catch (_: Throwable) {
            false
        }
    }
}
