package com.eskatesuv.ridervoz.voicenext

import android.content.Context
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.KeywordSpotter
import com.k2fsa.sherpa.onnx.KeywordSpotterConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig

/**
 * Configuración aislada del modelo KWS.
 *
 * Los assets todavía NO se añaden a la app estable hasta validar
 * tamaño/ABI y generar la tokenización exacta de "Rider".
 */
object RiderWakeWordFactory {

    private const val MODEL_DIR = "rider-kws"

    // Se reemplazará por la salida exacta de sherpa-onnx-cli text2token.
    // No se inventan tokens BPE a mano.
    private const val RIDER_KEYWORD_SPEC_FILE = "rider-keyword.txt"

    fun create(
        context: Context,
        onWakeWord: () -> Unit,
        onError: (Throwable) -> Unit
    ): RiderWakeWordEngine? {
        if (!assetExists(context, "$MODEL_DIR/encoder.onnx") ||
            !assetExists(context, "$MODEL_DIR/decoder.onnx") ||
            !assetExists(context, "$MODEL_DIR/joiner.onnx") ||
            !assetExists(context, "$MODEL_DIR/tokens.txt") ||
            !assetExists(context, "$MODEL_DIR/$RIDER_KEYWORD_SPEC_FILE")
        ) {
            return null
        }

        val model = OnlineModelConfig(
            transducer = OnlineTransducerModelConfig(
                encoder = "$MODEL_DIR/encoder.onnx",
                decoder = "$MODEL_DIR/decoder.onnx",
                joiner = "$MODEL_DIR/joiner.onnx"
            ),
            tokens = "$MODEL_DIR/tokens.txt",
            numThreads = 1,
            provider = "cpu",
            modelType = "zipformer2"
        )

        val config = KeywordSpotterConfig(
            featConfig = FeatureConfig(sampleRate = 16000, featureDim = 80),
            modelConfig = model,
            maxActivePaths = 4,
            keywordsFile = "$MODEL_DIR/$RIDER_KEYWORD_SPEC_FILE",
            keywordsScore = 1.5f,
            keywordsThreshold = 0.25f,
            numTrailingBlanks = 2
        )

        val spotter = KeywordSpotter(
            assetManager = context.assets,
            config = config
        )

        val spec = context.assets
            .open("$MODEL_DIR/$RIDER_KEYWORD_SPEC_FILE")
            .bufferedReader()
            .use { it.readText().trim() }

        return RiderWakeWordEngine(
            context = context,
            keywordSpotter = spotter,
            keywordSpec = spec,
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
