package com.eskatesuv.ridervoz;

import android.os.Handler;
import android.os.Bundle;
import android.database.Cursor;
import android.bluetooth.BluetoothAdapter;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.net.Uri;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import org.json.JSONArray;
import org.vosk.Model;
import org.vosk.Recognizer;
import java.io.*;
import java.util.Locale;
import java.text.Normalizer;
import java.util.HashSet;
import java.util.Set;
import java.util.Comparator;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Receives PCM from Chromium. Never opens a second native microphone recorder. */
@CapacitorPlugin(name = "RiderCommands")
public final class RiderCommandsPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ExecutorService ioWorker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private Model model;
    private Recognizer recognizer;
    private Recognizer radioRecognizer;
    private TextToSpeech tts;
    private volatile boolean active, speaking, destroyed;
    private final java.util.concurrent.atomic.AtomicInteger generation = new java.util.concurrent.atomic.AtomicInteger();
    private boolean ttsReady;
    private String ttsError;
    private PluginCall speechCall;
    private long speechId;
    private final Set<String> grammarPhrases = new HashSet<>();
    private String lastPartial = "";
    private String lastRadioPartial = "";
    private int radioPartialHits;
    private boolean radioCandidate;
    private long radioCandidateAt;
    private long lastRadioChangeAt;
    private final ArrayDeque<byte[]> preRoll = new ArrayDeque<>();
    private final ConcurrentHashMap<String,String[]> radioCache = new ConcurrentHashMap<>();
    private int partialHits;
    private String lastEmitted = "";
    private long lastEmitAt;
    private MediaPlayer radioPlayer;
    private String radioStationName = "";
    private boolean radioDucked;

    @Override public void load() {
        main.post(() -> {
            tts = new TextToSpeech(getContext(), status -> main.post(() -> {
                if (destroyed) return;
                if (status != TextToSpeech.SUCCESS) { ttsError = "No se pudo iniciar la voz de Android"; return; }
                int language = tts.setLanguage(new Locale("es", "ES"));
                if (language == TextToSpeech.LANG_MISSING_DATA || language == TextToSpeech.LANG_NOT_SUPPORTED) {
                    ttsError = "Instala una voz en español en los ajustes de texto a voz de Android"; return;
                }
                // Mantiene el tono del motor del teléfono, pero prioriza la voz española local
                // de mayor calidad y una cadencia apenas más natural.
                try {
                    Voice best = tts.getVoices().stream()
                        .filter(v -> "es".equals(v.getLocale().getLanguage()))
                        .filter(v -> !v.isNetworkConnectionRequired())
                        .max(Comparator.comparingInt((Voice v) ->
                            v.getQuality() + ("ES".equals(v.getLocale().getCountry()) ? 1000 : 0)))
                        .orElse(null);
                    if (best != null) tts.setVoice(best);
                } catch (Exception ignored) {}
                tts.setSpeechRate(1.03f);
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
        grammarPhrases.clear();
        try {
            JSONArray phrases = new JSONArray(grammar);
            for (int i = 0; i < phrases.length(); i++) {
                String phrase = phrases.optString(i, "").trim();
                if (!phrase.isEmpty() && !"[unk]".equals(phrase)) grammarPhrases.add(phrase);
            }
        } catch (Exception e) { call.reject("Gramática de comandos no válida"); return; }
        lastPartial = ""; partialHits = 0; lastRadioPartial = ""; radioPartialHits = 0; radioCandidate = false; radioCandidateAt = 0; lastRadioChangeAt = 0; preRoll.clear(); lastEmitted = ""; lastEmitAt = 0;
        worker.execute(() -> {
            try {
                active = false;
                if (recognizer != null) { recognizer.close(); recognizer = null; }
                if (radioRecognizer != null) { radioRecognizer.close(); radioRecognizer = null; }
                if (model == null) {
                    File root = new File(getContext().getFilesDir(), "rider-model-es-042-v1");
                    File ready = new File(root, ".complete");
                    if (!ready.exists()) { copyAsset("rider-model", root); if (!ready.createNewFile() && !ready.exists()) throw new IOException("No se pudo guardar el modelo"); }
                    model = new Model(root.getAbsolutePath());
                }
                recognizer = new Recognizer(model, rate, grammar);
                radioRecognizer = new Recognizer(model, rate);
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
                    rememberPreRoll(bytes);
                    if (radioCandidate) {
                        processRadioRecognition(bytes);
                    } else if (recognizer.acceptWaveForm(bytes, bytes.length)) {
                        JSONObject result = new JSONObject(recognizer.getResult());
                        String text = result.optString("text", "").trim();
                        if (isRadioLead(text)) {
                            beginRadioMode();
                        } else if (isProtectedOff(text) && !wasStablePartial(text)) {
                            recognizer.reset();
                            lastPartial = "";
                            partialHits = 0;
                        } else {
                            emitTranscript(text, false);
                        }
                    } else {
                        String partial = new JSONObject(recognizer.getPartialResult()).optString("partial", "").trim();
                        if (partial.isEmpty()) { lastPartial = ""; partialHits = 0; }
                        else {
                            if (partial.equals(lastPartial)) partialHits++; else { lastPartial = partial; partialHits = 1; }
                            if (isRadioLead(partial)) {
                                beginRadioMode();
                            } else {
                                boolean exact = grammarPhrases.contains(partial);
                                boolean wakeOnly = "rider".equals(partial) || "raider".equals(partial);
                                boolean protectedOff = isProtectedOff(partial);
                                int stableHits = wakeOnly ? 5 : (protectedOff ? 4 : 2);
                                if (exact && partialHits >= stableHits) emitTranscript(partial, true);
                            }
                        }
                    }
                }
                call.resolve();
            } catch (Exception | LinkageError e) {
                // Un fallo puntual de ASR no debe apagar Rider Voz.
                try { if (recognizer != null) recognizer.reset(); } catch (Exception ignored) {}
                try { if (radioRecognizer != null) radioRecognizer.reset(); } catch (Exception ignored) {}
                radioCandidate = false;
                radioCandidateAt = 0;
                lastRadioPartial = "";
                radioPartialHits = 0;
                preRoll.clear();
                call.resolve();
            }
        });
    }

    private void rememberPreRoll(byte[] bytes) {
        preRoll.addLast(Arrays.copyOf(bytes, bytes.length));
        while (preRoll.size() > 12) preRoll.removeFirst();
    }

    private boolean isProtectedOff(String raw) {
        String n = normalizeSpeech(raw);
        return n.equals("rider desactivar rider voz") ||
               n.equals("rider desactiva rider voz") ||
               n.equals("raider desactivar raider voz");
    }

    private boolean wasStablePartial(String raw) {
        String n = normalizeSpeech(raw);
        return n.equals(normalizeSpeech(lastPartial)) && partialHits >= 2;
    }

    private boolean isRadioLead(String raw) {
        String n = normalizeSpeech(raw);
        if (!n.matches("^(rider|raider) (pon|ponme|reproduce|escucha)( .*)?$")) return false;
        if (n.matches("^(rider|raider) (pon|ponme) (el )?(bluetooth|altavoz|sonido)$")) return false;
        return true;
    }

    private void beginRadioMode() {
        if (radioCandidate || radioRecognizer == null) return;
        radioCandidate = true;
        radioCandidateAt = System.currentTimeMillis();
        lastRadioPartial = "";
        radioPartialHits = 0;
        lastRadioChangeAt = radioCandidateAt;
        main.post(() -> setRadioDucked(true));
        try {
            radioRecognizer.reset();
            for (byte[] chunk : preRoll) {
                if (radioRecognizer.acceptWaveForm(chunk, chunk.length)) {
                    String replay = new JSONObject(radioRecognizer.getResult()).optString("text", "").trim();
                    if (maybeEmitRadio(replay, true)) {
                        endRadioMode(true);
                        return;
                    }
                }
            }
            String partial = new JSONObject(radioRecognizer.getPartialResult()).optString("partial", "").trim();
            if (!partial.isEmpty()) {
                lastRadioPartial = partial;
                radioPartialHits = 1;
                lastRadioChangeAt = System.currentTimeMillis();
            }
        } catch (Exception ignored) {}
    }

    private void endRadioMode(boolean accepted) {
        radioCandidate = false;
        radioCandidateAt = 0;
        lastRadioPartial = "";
        radioPartialHits = 0;
        lastRadioChangeAt = 0;
        preRoll.clear();
        try { if (radioRecognizer != null) radioRecognizer.reset(); } catch (Exception ignored) {}
        try { if (recognizer != null) recognizer.reset(); } catch (Exception ignored) {}
        main.post(() -> setRadioDucked(false));
    }

    private void processRadioRecognition(byte[] bytes) {
        if (radioRecognizer == null || speaking || !active || !radioCandidate) return;
        long now = System.currentTimeMillis();
        if (now - radioCandidateAt > 4500) {
            endRadioMode(false);
            return;
        }
        try {
            if (radioRecognizer.acceptWaveForm(bytes, bytes.length)) {
                String text = new JSONObject(radioRecognizer.getResult()).optString("text", "").trim();
                String normalized = normalizeSpeech(text);
                if (normalized.matches("^(rider|raider) (pon|ponme|reproduce|escucha)( la radio| radio)?$")) {
                    emitTranscript(normalized, true);
                    endRadioMode(true);
                } else if (!maybeEmitRadio(text, true)) {
                    endRadioMode(false);
                }
            } else {
                String partial = new JSONObject(radioRecognizer.getPartialResult()).optString("partial", "").trim();
                if (partial.isEmpty()) return;
                if (partial.equals(lastRadioPartial)) {
                    radioPartialHits++;
                } else {
                    lastRadioPartial = partial;
                    radioPartialHits = 1;
                    lastRadioChangeAt = now;
                }
                String normalized = normalizeSpeech(partial);
                String stationTail = extractStationTail(normalized);
                if (!stationTail.isEmpty() && radioPartialHits >= 2 && now - lastRadioChangeAt >= 650) {
                    if (maybeEmitRadio(partial, false)) endRadioMode(true);
                }
            }
        } catch (Exception ignored) {
            endRadioMode(false);
        }
    }

    private String normalizeSpeech(String raw) {
        return Normalizer.normalize(String.valueOf(raw).toLowerCase(Locale.ROOT), Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .replaceAll("[^a-z0-9 ]", " ")
            .replaceAll("\\s+", " ")
            .trim();
    }

    private String extractStationTail(String normalized) {
        if (normalized == null) return "";
        String tail = normalized.replaceFirst("^(rider|raider) (pon|ponme|reproduce|escucha)( la radio)? ", "").trim();
        return tail.equals(normalized) ? "" : tail;
    }

    private boolean maybeEmitRadio(String raw, boolean finalResult) {
        if (raw == null || raw.trim().isEmpty()) return false;
        String normalized = normalizeSpeech(raw);
        String stationTail = extractStationTail(normalized);
        if (stationTail.isEmpty()) return false;
        if (stationTail.equals("altavoz") || stationTail.equals("bluetooth") || stationTail.equals("sonido")) return false;
        emitTranscript(normalized, true);
        return true;
    }

    private void emitTranscript(String text, boolean resetAfter) {
        if (text == null) return;
        text = text.trim();
        if (text.isEmpty()) return;
        long now = System.currentTimeMillis();
        if (text.equals(lastEmitted) && now - lastEmitAt < 1200) return;
        lastEmitted = text; lastEmitAt = now; lastPartial = ""; partialHits = 0;
        JSObject event = new JSObject(); event.put("text", text); notifyListeners("transcript", event);
        if (resetAfter && recognizer != null) recognizer.reset();
    }

    @PluginMethod public void controlSkatesuv(PluginCall call) {
        final String action = call.getString("action", "").trim();
        if (action.isEmpty() || action.length() > 40) { call.reject("Orden SKATESUV no válida"); return; }
        try {
            Bundle result = getContext().getContentResolver().call(
                Uri.parse("content://com.skatesuv.eskate.riderbridge"),
                "control", action, null
            );
            JSObject out = new JSObject();
            out.put("ok", result != null && result.getBoolean("ok", false));
            out.put("message", result == null ? "SKATESUV no respondió" : result.getString("message", "Orden ejecutada"));
            call.resolve(out);
        } catch (Exception e) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("message", "No pude comunicar con SKATESUV");
            call.resolve(out);
        }
    }

    @PluginMethod public void getOnboardSnapshot(PluginCall call) {
        JSObject result = new JSObject();
        try (Cursor cursor = getContext().getContentResolver().query(
                Uri.parse("content://com.skatesuv.eskate.riderbridge/snapshot"),
                new String[]{"json"}, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) {
                result.put("available", false);
                result.put("reason", "SKATESUV no tiene datos de a bordo disponibles");
                call.resolve(result);
                return;
            }
            String raw = cursor.getString(0);
            if (raw == null || raw.trim().isEmpty()) {
                result.put("available", false);
                result.put("reason", "SKATESUV no tiene datos de a bordo disponibles");
                call.resolve(result);
                return;
            }
            JSONObject snapshot = new JSONObject(raw);
            long sourceAt = snapshot.optLong("timestamp", 0L);
            long age = sourceAt > 0L ? Math.max(0L, System.currentTimeMillis() - sourceAt) : Long.MAX_VALUE;
            result.put("available", true);
            result.put("json", raw);
            result.put("ageMs", age);
            call.resolve(result);
        } catch (Exception e) {
            result.put("available", false);
            result.put("reason", "No se pudo leer el ordenador de a bordo de SKATESUV");
            call.resolve(result);
        }
    }

    @PluginMethod public void getDeviceStatus(PluginCall call) {
        JSObject result = new JSObject();
        try {
            BatteryManager battery = (BatteryManager)getContext().getSystemService(Context.BATTERY_SERVICE);
            int batteryPercent = battery == null ? -1 : battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
            result.put("phoneBatteryPercent", batteryPercent >= 0 ? batteryPercent : JSONObject.NULL);

            ConnectivityManager cm = (ConnectivityManager)getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            boolean online = false;
            if (cm != null) {
                android.net.Network network = cm.getActiveNetwork();
                NetworkCapabilities caps = network == null ? null : cm.getNetworkCapabilities(network);
                online = caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
            }
            result.put("internet", online);

            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            result.put("bluetooth", adapter != null && adapter.isEnabled());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("No se pudo consultar el estado del teléfono", e);
        }
    }

    @PluginMethod public void playRadio(PluginCall call) {
        final String query = call.getString("query", "").trim();
        if (query.isEmpty() || query.length() > 80) {
            JSObject out = new JSObject(); out.put("ok", false); out.put("message", "Emisora no válida"); call.resolve(out); return;
        }
        String cacheKey = normalizeSpeech(query);
        String[] cached = radioCache.get(cacheKey);
        if (cached != null) {
            main.post(() -> startRadioPlayer(cached[0], cached[1], call));
            return;
        }
        ioWorker.execute(() -> {
            HttpURLConnection connection = null;
            try {
                String encoded = URLEncoder.encode(query, StandardCharsets.UTF_8.toString());
                JSONArray stations = null;
                String[] servers = new String[]{
                    "https://de1.api.radio-browser.info",
                    "https://nl1.api.radio-browser.info"
                };
                Exception lastError = null;
                for (String server : servers) {
                    try {
                        URL url = new URL(server + "/json/stations/search?name=" +
                            encoded + "&hidebroken=true&is_https=true&order=clickcount&reverse=true&limit=20");
                        connection = (HttpURLConnection)url.openConnection();
                        connection.setConnectTimeout(3000);
                        connection.setReadTimeout(4500);
                        connection.setRequestProperty("User-Agent", "RiderVoz/2.0");
                        StringBuilder body = new StringBuilder();
                        try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()))) {
                            String line; while ((line = reader.readLine()) != null) body.append(line);
                        }
                        stations = new JSONArray(body.toString());
                        connection.disconnect(); connection = null;
                        break;
                    } catch (Exception serverError) {
                        lastError = serverError;
                        if (connection != null) { connection.disconnect(); connection = null; }
                    }
                }
                if (stations == null) throw (lastError == null ? new IOException("Sin servidores de radio") : lastError);
                JSONObject chosen = null;
                JSONObject contains = null;
                String normalizedQuery = normalizeSpeech(query).replaceFirst("^radio ", "").trim();
                for (int i = 0; i < stations.length(); i++) {
                    JSONObject station = stations.optJSONObject(i);
                    if (station == null) continue;
                    String name = normalizeSpeech(station.optString("name", ""));
                    if (name.equals(normalizedQuery)) { chosen = station; break; }
                    if (contains == null && (name.contains(normalizedQuery) || normalizedQuery.contains(name))) contains = station;
                }
                if (chosen == null) chosen = contains;
                if (chosen == null && stations.length() > 0) chosen = stations.optJSONObject(0);
                if (chosen == null) {
                    JSObject out = new JSObject(); out.put("ok", false); out.put("message", "No encuentro esa emisora"); call.resolve(out); return;
                }
                String streamUrl = chosen.optString("url_resolved", chosen.optString("url", ""));
                String stationName = chosen.optString("name", query).trim();
                if (streamUrl.isEmpty()) {
                    JSObject out = new JSObject(); out.put("ok", false); out.put("message", "La emisora no tiene audio disponible"); call.resolve(out); return;
                }
                radioCache.put(cacheKey, new String[]{streamUrl, stationName});
                final String finalUrl = streamUrl, finalName = stationName;
                main.post(() -> startRadioPlayer(finalUrl, finalName, call));
            } catch (Exception e) {
                JSObject out = new JSObject(); out.put("ok", false); out.put("message", "No pude conectar con la radio"); call.resolve(out);
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private void startRadioPlayer(String url, String name, PluginCall call) {
        try {
            stopRadioPlayer();
            MediaPlayer player = new MediaPlayer();
            AtomicBoolean settled = new AtomicBoolean(false);
            player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build());
            player.setDataSource(url);
            player.setOnPreparedListener(p -> {
                if (!settled.compareAndSet(false, true)) {
                    try { p.release(); } catch (Exception ignored) {}
                    return;
                }
                radioPlayer = p;
                radioStationName = name;
                p.start();
                JSObject result = new JSObject(); result.put("ok", true); result.put("name", name); call.resolve(result);
            });
            player.setOnErrorListener((p, what, extra) -> {
                if (!settled.compareAndSet(false, true)) return true;
                try { p.release(); } catch (Exception ignored) {}
                if (radioPlayer == p) radioPlayer = null;
                JSObject out = new JSObject(); out.put("ok", false); out.put("message", "La emisora no pudo iniciar la reproducción"); call.resolve(out);
                return true;
            });
            player.prepareAsync();
            main.postDelayed(() -> {
                if (!settled.compareAndSet(false, true)) return;
                try { player.reset(); player.release(); } catch (Exception ignored) {}
                if (radioPlayer == player) radioPlayer = null;
                JSObject out = new JSObject(); out.put("ok", false); out.put("message", "La emisora tarda demasiado en responder"); call.resolve(out);
            }, 6000);
        } catch (Exception e) {
            JSObject out = new JSObject(); out.put("ok", false); out.put("message", "No se pudo reproducir la emisora"); call.resolve(out);
        }
    }

    @PluginMethod public void stopRadio(PluginCall call) {
        main.post(() -> { stopRadioPlayer(); call.resolve(); });
    }

    private void stopRadioPlayer() {
        MediaPlayer player = radioPlayer; radioPlayer = null; radioStationName = ""; radioDucked = false;
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) {}
            try { player.release(); } catch (Exception ignored) {}
        }
    }

    private void setRadioDucked(boolean ducked) {
        MediaPlayer player = radioPlayer;
        if (player == null) return;
        try {
            player.setVolume(ducked ? 0.18f : 1.0f, ducked ? 0.18f : 1.0f);
            radioDucked = ducked;
        } catch (Exception ignored) {}
    }

    @PluginMethod public void speak(PluginCall call) {
        final String text = call.getString("text", "");
        speaking = true; // Gate PCM before the reply; recognition cannot hear its own TTS.
        setRadioDucked(true);
        main.post(() -> {
            if (!active || !ttsReady || destroyed) { speaking = false; setRadioDucked(false); call.reject("La respuesta de voz no está disponible"); return; }
            if (text.isEmpty() || text.length() > 3000) { speaking = false; setRadioDucked(false); call.reject("Respuesta de voz no válida"); return; }
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
            }, 12000);
        });
    }
    private void finishSpeech(String id, String error) {
        main.post(() -> {
            if (!id.equals(Long.toString(speechId)) || speechCall == null) return;
            PluginCall call = speechCall; speechCall = null;
            // Keep a short tail gate so the speaker's last syllable cannot wake the bot.
            main.postDelayed(() -> worker.execute(() -> {
                if (recognizer != null) recognizer.reset();
                if (radioRecognizer != null) radioRecognizer.reset();
                lastPartial = ""; partialHits = 0;
                speaking = false;
                setRadioDucked(false);
                if (error == null) call.resolve(); else call.reject(error);
            }), 250);
        });
    }

    @PluginMethod public void stop(PluginCall call) {
        generation.incrementAndGet(); active = false;
        lastPartial = ""; partialHits = 0; lastRadioPartial = ""; radioPartialHits = 0; radioCandidate = false; radioCandidateAt = 0; lastRadioChangeAt = 0; preRoll.clear(); lastEmitted = ""; lastEmitAt = 0;
        main.post(() -> {
            ++speechId;
            if (tts != null) tts.stop();
            if (speechCall != null) { speechCall.reject("Respuesta cancelada"); speechCall = null; }
            worker.execute(() -> {
                if (recognizer != null) { recognizer.close(); recognizer = null; }
                if (radioRecognizer != null) { radioRecognizer.close(); radioRecognizer = null; }
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
        main.post(() -> { stopRadioPlayer(); if (tts != null) { tts.stop(); tts.shutdown(); } });
        ioWorker.shutdownNow();
        worker.execute(() -> { if (recognizer != null) { recognizer.close(); recognizer = null; } if (radioRecognizer != null) { radioRecognizer.close(); radioRecognizer = null; } if (model != null) { model.close(); model = null; } });
        // Delayed callbacks may still drain. No work is accepted from JS after plugin destruction.
        super.handleOnDestroy();
    }
}
