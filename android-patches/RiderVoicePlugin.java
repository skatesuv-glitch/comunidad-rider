package com.eskatesuv.ridervoz;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.media.AudioDeviceInfo;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;
import com.eskatesuv.ridervoz.voicenext.RiderWakeWordEngine;
import com.eskatesuv.ridervoz.voicenext.RiderWakeWordFactory;
import com.eskatesuv.ridervoz.voicenext.RiderCommandEngine;
import java.util.Set;

@CapacitorPlugin(name = "RiderVoice", permissions = {
    @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
    @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT })
})
public class RiderVoicePlugin extends Plugin {
    private RiderWakeWordEngine wakeEngine;
    private RiderCommandEngine commandEngine;
    private boolean keepListening = false;
    private long commandSessionUntil = 0L;
    private static final long COMMAND_SESSION_MS = 25000L; // Rider stays command-active for 25 s after wake word

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
    public void getBluetoothDevices(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("bluetooth", call, "bluetoothListPermissionResult"); return;
        }
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        JSArray devices = new JSArray();
        if (adapter != null) {
            Set<BluetoothDevice> bonded = adapter.getBondedDevices();
            AudioManager audio = (AudioManager)getContext().getSystemService(Context.AUDIO_SERVICE);
            String activeAddress = "";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                AudioDeviceInfo active = audio.getCommunicationDevice();
                if (active != null) activeAddress = active.getAddress();
            }
            for (BluetoothDevice device : bonded) {
                JSObject item = new JSObject();
                item.put("name", device.getName() == null ? "Dispositivo Bluetooth" : device.getName());
                item.put("address", device.getAddress());
                item.put("selected", device.getAddress().equals(activeAddress));
                devices.put(item);
            }
        }
        JSObject result = new JSObject(); result.put("devices", devices); call.resolve(result);
    }

    @PluginMethod
    public void selectBluetoothDevice(PluginCall call) {
        String address = call.getString("address", "");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("bluetooth", call, "bluetoothSelectPermissionResult"); return;
        }
        AudioManager audio = (AudioManager)getContext().getSystemService(Context.AUDIO_SERVICE);
        audio.setMode(AudioManager.MODE_IN_COMMUNICATION); audio.setSpeakerphoneOn(false);
        boolean selected = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            for (AudioDeviceInfo device : audio.getAvailableCommunicationDevices()) {
                if ((device.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || device.getType() == AudioDeviceInfo.TYPE_BLE_HEADSET || device.getType() == AudioDeviceInfo.TYPE_BLE_SPEAKER) && (address.isEmpty() || address.equals(device.getAddress()))) {
                    selected = audio.setCommunicationDevice(device); if (selected) break;
                }
            }
        } else { audio.startBluetoothSco(); audio.setBluetoothScoOn(true); selected = true; }
        JSObject result = new JSObject(); result.put("selected", selected); result.put("address", address); call.resolve(result);
    }

    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS); intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(intent); call.resolve();
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
        if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionResult"); return;
        }
        keepListening = true;
        if (!armWakeWord()) { keepListening = false; call.reject("No se pudo iniciar Rider con sherpa-onnx"); return; }
        call.resolve();
    }

    @PluginMethod
    public void stopCommandListening(PluginCall call) {
        keepListening = false;
        commandSessionUntil = 0L;
        stopEngines();
        call.resolve();
    }

    @PluginMethod
    public void testVoiceCommand(PluginCall call) {
        if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionResult"); return;
        }
        stopEngines();
        startCommandCapture();
        call.resolve();
    }

    private boolean armWakeWord() {
        stopEngines();
        wakeEngine = RiderWakeWordFactory.INSTANCE.create(getContext(),
            () -> { if (keepListening) { commandSessionUntil = System.currentTimeMillis() + COMMAND_SESSION_MS; if (wakeEngine != null) wakeEngine.stop(); wakeEngine = null; startCommandCapture(); } return kotlin.Unit.INSTANCE; },
            error -> { emitVoiceError(error); return kotlin.Unit.INSTANCE; });
        return wakeEngine != null && wakeEngine.start();
    }

    private void startCommandCapture() {
        commandEngine = new RiderCommandEngine(getContext(),
            text -> { emitVoiceCommand("Rider " + text); commandEngine = null; if (keepListening) getActivity().runOnUiThread(() -> { if (System.currentTimeMillis() < commandSessionUntil) startCommandCapture(); else armWakeWord(); }); return kotlin.Unit.INSTANCE; },
            error -> { emitVoiceError(error); commandEngine = null; if (keepListening) getActivity().runOnUiThread(() -> { if (System.currentTimeMillis() < commandSessionUntil) startCommandCapture(); else armWakeWord(); }); return kotlin.Unit.INSTANCE; });
        if (!commandEngine.start()) emitVoiceError(new IllegalStateException("No se pudo iniciar el reconocimiento de comando"));
    }

    private void emitVoiceCommand(String text) {
        JSObject data = new JSObject(); data.put("text", text); notifyListeners("voiceCommand", data);
    }

    private void emitVoiceError(Throwable error) {
        JSObject data = new JSObject(); data.put("message", error.getMessage() == null ? "Error de voz" : error.getMessage()); notifyListeners("voiceCommandError", data);
    }

    private void stopEngines() {
        if (wakeEngine != null) { wakeEngine.stop(); wakeEngine = null; }
        if (commandEngine != null) { commandEngine.stop(); commandEngine = null; }
    }

    @PermissionCallback
    private void bluetoothPermissionResult(PluginCall call) {
        if (getPermissionState("bluetooth") == PermissionState.GRANTED) setAudioRoute(call);
        else call.reject("Permiso Bluetooth denegado");
    }

    @PermissionCallback
    private void bluetoothListPermissionResult(PluginCall call) {
        if (getPermissionState("bluetooth") == PermissionState.GRANTED) getBluetoothDevices(call); else call.reject("Permiso Bluetooth denegado");
    }

    @PermissionCallback
    private void bluetoothSelectPermissionResult(PluginCall call) {
        if (getPermissionState("bluetooth") == PermissionState.GRANTED) selectBluetoothDevice(call); else call.reject("Permiso Bluetooth denegado");
    }

    @PermissionCallback
    private void microphonePermissionResult(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) startCommandListening(call);
        else call.reject("Permiso de micrófono denegado");
    }

    @Override protected void handleOnDestroy() { keepListening = false; stopEngines(); super.handleOnDestroy(); }
}
