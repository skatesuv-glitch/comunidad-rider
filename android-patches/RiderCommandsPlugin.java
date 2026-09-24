package com.eskatesuv.ridervoz;

import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import java.io.*;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Receives PCM from Chromium. Never opens a second native microphone recorder. */
@CapacitorPlugin(name = "RiderCommands")
public final class RiderCommandsPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private Model model;
    private Recognizer recognizer;
    private TextToSpeech tts;
    private volatile boolean active, speaking, destroyed;
    private final java.util.concurrent.atomic.AtomicInteger generation = new java.util.concurrent.atomic.AtomicInteger();
    private boolean ttsReady;
    private String ttsError;
    private PluginCall speechCall;
    private long speechId;

    @Override public void load() {
        main.post(() -> {
            tts = new TextToSpeech(getContext(), status -> main.post(() -> {
                if (destroyed) return;
                if (status != TextToSpeech.SUCCESS) { ttsError = "No se pudo iniciar la voz de Android"; return; }
                int language = tts.setLanguage(new Locale("es", "ES"));
                if (language == TextToSpeech.LANG_MISSING_DATA || language == TextToSpeech.LANG_NOT_SUPPORTED) {
                    ttsError = "Instala una voz en español en los ajustes de texto a voz de Android"; return;
                }
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    public void onStart(String id) {}
                    public void onDone(String id) { finishSpeech(id, null); }
                    public void onError(String id) { finishSpeech(id, "Android no pudo reproducir la respuesta de voz"); }
                    @Override public void onError(String id, int code) { finishSpeech(id, "Error de respuesta de voz: " + code); }
                });
                ttsReady = true;
            }));
        });
    }

    @PluginMethod public void start(PluginCall call) {
        final int run = generation.incrementAndGet();
        final int rate = call.getInt("sampleRate", 16000);
        final String grammar = call.getString("grammar", "");
        if (rate < 8000 || rate > 96000 || grammar.isEmpty()) { call.reject("Formato de audio de comandos no válido"); return; }
        worker.execute(() -> {
            try {
                active = false;
                if (recognizer != null) { recognizer.close(); recognizer = null; }
                if (model == null) {
                    File root = new File(getContext().getFilesDir(), "rider-model-es-042-v1");
                    File ready = new File(root, ".complete");
                    if (!ready.exists()) { copyAsset("rider-model", root); if (!ready.createNewFile() && !ready.exists()) throw new IOException("No se pudo guardar el modelo"); }
                    model = new Model(root.getAbsolutePath());
                }
                recognizer = new Recognizer(model, rate, grammar);
                main.post(() -> waitForVoice(call, 0, run));
            } catch (Exception | LinkageError e) { call.reject("No se pudo preparar el reconocimiento local: " + e.getMessage()); }
        });
    }
    private void waitForVoice(PluginCall call, int attempt, int run) {
        if (run != generation.get()) { call.reject("Inicio cancelado"); return; }
        if (destroyed) { call.reject("Asistente cerrado"); return; }
        if (ttsReady) { active = true; call.resolve(); return; }
        if (ttsError != null || attempt >= 50) { call.reject(ttsError == null ? "La voz de Android no está disponible" : ttsError); return; }
        main.postDelayed(() -> waitForVoice(call, attempt + 1, run), 100);
    }

    @PluginMethod public void audio(PluginCall call) {
        final String pcm = call.getString("pcm", "");
        if (!active || speaking) { call.resolve(); return; }
        if (pcm.length() > 32768) { call.reject("Bloque de audio demasiado grande"); return; }
        worker.execute(() -> {
            try {
                if (active && !speaking && recognizer != null) {
                    byte[] bytes = Base64.decode(pcm, Base64.NO_WRAP);
                    if (recognizer.acceptWaveForm(bytes, bytes.length)) {
                        String text = new JSONObject(recognizer.getResult()).optString("text", "").trim();
                        if (!text.isEmpty()) { JSObject event = new JSObject(); event.put("text", text); notifyListeners("transcript", event); }
                    }
                }
                call.resolve();
            } catch (Exception | LinkageError e) { active = false; call.reject("Error al procesar el audio de comandos: " + e.getMessage()); }
        });
    }

    @PluginMethod public void speak(PluginCall call) {
        final String text = call.getString("text", "");
        speaking = true; // Gate PCM before the reply; recognition cannot hear its own TTS.
        main.post(() -> {
            if (!active || !ttsReady || destroyed) { speaking = false; call.reject("La respuesta de voz no está disponible"); return; }
            if (text.isEmpty() || text.length() > 3000) { speaking = false; call.reject("Respuesta de voz no válida"); return; }
            if (speechCall != null) { speaking = true; call.reject("Ya se está reproduciendo una respuesta"); return; }
            speechCall = call;
            String id = Long.toString(++speechId);
            if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id) == TextToSpeech.ERROR) {
                finishSpeech(id, "Android rechazó la respuesta de voz"); return;
            }
            main.postDelayed(() -> {
                if (speechCall == call && id.equals(Long.toString(speechId))) {
                    tts.stop(); finishSpeech(id, "La respuesta de voz ha tardado demasiado");
                }
            }, 30000);
        });
    }
    private void finishSpeech(String id, String error) {
        main.post(() -> {
            if (!id.equals(Long.toString(speechId)) || speechCall == null) return;
            PluginCall call = speechCall; speechCall = null;
            // Keep a short tail gate so the speaker's last syllable cannot wake the bot.
            main.postDelayed(() -> worker.execute(() -> {
                if (recognizer != null) recognizer.reset();
                speaking = false;
                if (error == null) call.resolve(); else call.reject(error);
            }), 250);
        });
    }

    @PluginMethod public void stop(PluginCall call) {
        generation.incrementAndGet(); active = false;
        main.post(() -> {
            ++speechId;
            if (tts != null) tts.stop();
            if (speechCall != null) { speechCall.reject("Respuesta cancelada"); speechCall = null; }
            worker.execute(() -> {
                if (recognizer != null) { recognizer.close(); recognizer = null; }
                speaking = false; call.resolve();
            });
        });
    }
    private void copyAsset(String path, File destination) throws IOException {
        String[] children = getContext().getAssets().list(path);
        if (children != null && children.length > 0) {
            if (!destination.isDirectory() && !destination.mkdirs()) throw new IOException("Sin espacio para el modelo");
            for (String child : children) copyAsset(path + "/" + child, new File(destination, child));
        } else {
            try (InputStream in = getContext().getAssets().open(path); OutputStream out = new FileOutputStream(destination)) {
                byte[] buffer = new byte[65536]; int count;
                while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
            }
        }
    }
    @Override protected void handleOnDestroy() {
        generation.incrementAndGet(); destroyed = true; active = false;
        main.removeCallbacksAndMessages(null);
        main.post(() -> { if (tts != null) { tts.stop(); tts.shutdown(); } });
        worker.execute(() -> { if (recognizer != null) { recognizer.close(); recognizer = null; } if (model != null) { model.close(); model = null; } });
        // Delayed callbacks may still drain. No work is accepted from JS after plugin destruction.
        super.handleOnDestroy();
    }
}
