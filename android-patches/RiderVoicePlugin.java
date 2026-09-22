package com.eskatesuv.ridervoz;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;
import java.util.ArrayList;
import java.util.Locale;

@CapacitorPlugin(name = "RiderVoice", permissions = {
    @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
    @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT })
})
public class RiderVoicePlugin extends Plugin implements RecognitionListener {
    private SpeechRecognizer recognizer;
    private Intent recognizerIntent;
    private boolean keepListening = false;

    @PluginMethod
    public void setAudioRoute(PluginCall call) {
        String route = call.getString("route", "speaker");
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        audio.setMode(AudioManager.MODE_IN_COMMUNICATION);
        try {
            if ("bluetooth".equals(route)) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissionForAlias("bluetooth", call, "bluetoothPermissionResult");
                    return;
                }
                audio.setSpeakerphoneOn(false);
                audio.startBluetoothSco();
                audio.setBluetoothScoOn(true);
            } else {
                audio.stopBluetoothSco();
                audio.setBluetoothScoOn(false);
                audio.setSpeakerphoneOn(true);
            }
            JSObject result = new JSObject(); result.put("route", route); call.resolve(result);
        } catch (Exception error) { call.reject("No se pudo cambiar la salida de audio", error); }
    }

    @PluginMethod
    public void startBackgroundAudio(PluginCall call) {
        Intent intent = new Intent(getContext(), RiderVoiceService.class);
        ContextCompat.startForegroundService(getContext(), intent);
        call.resolve();
    }

    @PluginMethod
    public void stopBackgroundAudio(PluginCall call) {
        getContext().stopService(new Intent(getContext(), RiderVoiceService.class));
        call.resolve();
    }

    @PluginMethod
    public void startCommandListening(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) { call.reject("Reconocimiento de voz no disponible"); return; }
        if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionResult"); return;
        }
        keepListening = true; startRecognizer(); call.resolve();
    }

    @PluginMethod
    public void stopCommandListening(PluginCall call) {
        keepListening = false; if (recognizer != null) recognizer.cancel(); call.resolve();
    }

    @PermissionCallback
    private void bluetoothPermissionResult(PluginCall call) {
        if (getPermissionState("bluetooth") == PermissionState.GRANTED) setAudioRoute(call);
        else call.reject("Permiso Bluetooth denegado");
    }

    @PermissionCallback
    private void microphonePermissionResult(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) startCommandListening(call);
        else call.reject("Permiso de micrófono denegado");
    }

    private void startRecognizer() {
        getActivity().runOnUiThread(() -> {
            if (recognizer == null) { recognizer = SpeechRecognizer.createSpeechRecognizer(getContext()); recognizer.setRecognitionListener(this); }
            if (recognizerIntent == null) {
                recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-ES");
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
            }
            try { recognizer.startListening(recognizerIntent); } catch (Exception ignored) {}
        });
    }

    private void restart() { if (keepListening) getActivity().getWindow().getDecorView().postDelayed(this::startRecognizer, 450); }
    @Override public void onResults(Bundle results) { ArrayList<String> lines = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); if (lines != null && !lines.isEmpty()) { JSObject data = new JSObject(); data.put("text", lines.get(0)); notifyListeners("voiceCommand", data); } restart(); }
    @Override public void onError(int error) { restart(); }
    @Override public void onReadyForSpeech(Bundle params) {}
    @Override public void onBeginningOfSpeech() {}
    @Override public void onRmsChanged(float rmsdB) {}
    @Override public void onBufferReceived(byte[] buffer) {}
    @Override public void onEndOfSpeech() {}
    @Override public void onPartialResults(Bundle partialResults) {}
    @Override public void onEvent(int eventType, Bundle params) {}
    @Override protected void handleOnDestroy() { keepListening = false; if (recognizer != null) { recognizer.destroy(); recognizer = null; } super.handleOnDestroy(); }
}
