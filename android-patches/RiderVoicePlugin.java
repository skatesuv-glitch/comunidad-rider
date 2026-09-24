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
import java.util.ArrayList;
import java.util.Set;
import java.util.Locale;

@CapacitorPlugin(name = "RiderVoice", permissions = {
    @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
    @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT })
})
public class RiderVoicePlugin extends Plugin {

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

}
