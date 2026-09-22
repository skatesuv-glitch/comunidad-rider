package com.eskatesuv.ridervoz;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

public class RiderVoiceService extends Service {
    private static final String CHANNEL = "rider_voice_active";
    private AudioManager audio;
    private AudioFocusRequest focusRequest;
    @Override public void onCreate() {
        super.onCreate();
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Rider Voz activo", NotificationManager.IMPORTANCE_LOW));
        Notification notification = new NotificationCompat.Builder(this, CHANNEL).setContentTitle("Rider Voz activo").setContentText("Comunicación del grupo en segundo plano").setSmallIcon(getApplicationInfo().icon).setOngoing(true).setCategory(NotificationCompat.CATEGORY_SERVICE).build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(77, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE); else startForeground(77, notification);
        audio = (AudioManager)getSystemService(AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) { focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE).setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).build(); audio.requestAudioFocus(focusRequest); }
    }
    @Override public void onDestroy() { if (audio != null && Build.VERSION.SDK_INT >= 26 && focusRequest != null) audio.abandonAudioFocusRequest(focusRequest); super.onDestroy(); }
    @Override public int onStartCommand(Intent intent, int flags, int startId) { return START_STICKY; }
    @Override public IBinder onBind(Intent intent) { return null; }
}
