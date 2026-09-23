package com.eskatesuv.ridervoz.voicenext;

import android.content.Context;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import com.k2fsa.sherpa.onnx.FeatureConfig;
import com.k2fsa.sherpa.onnx.OfflineModelConfig;
import com.k2fsa.sherpa.onnx.OfflineRecognizer;
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig;
import com.k2fsa.sherpa.onnx.OfflineStream;
import com.k2fsa.sherpa.onnx.OfflineWhisperModelConfig;
import java.util.ArrayList;
import kotlin.Unit;
import kotlin.jvm.functions.Function1;

public final class RiderCommandEngine {
  private final Context context; private final Function1<String,Unit> onCommand; private final Function1<Throwable,Unit> onError;
  private volatile boolean running; private AudioRecord recorder; private Thread worker;
  public RiderCommandEngine(Context c, Function1<String,Unit> ok, Function1<Throwable,Unit> err){context=c;onCommand=ok;onError=err;}
  public boolean start(){
    if(running)return true;
    try{
      int min=AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);
      recorder=new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,min*2);
      if(recorder.getState()!=AudioRecord.STATE_INITIALIZED)throw new IllegalStateException("AudioRecord no inicializado");
      running=true; recorder.startRecording(); worker=new Thread(this::captureAndDecode,"RiderCommand");worker.start();return true;
    }catch(Throwable t){stop();onError.invoke(t);return false;}
  }
  private void captureAndDecode(){
    try{
      ArrayList<Float> pcm=new ArrayList<>(); short[] b=new short[1600]; long until=System.currentTimeMillis()+5500;
      while(running&&System.currentTimeMillis()<until){int n=recorder.read(b,0,b.length);if(n>0)for(int i=0;i<n;i++)pcm.add(b[i]/32768f);}
      if(!running)return;
      float[] samples=new float[pcm.size()];for(int i=0;i<samples.length;i++)samples[i]=pcm.get(i);
      OfflineWhisperModelConfig whisper=new OfflineWhisperModelConfig("rider-asr/tiny-encoder.int8.onnx","rider-asr/tiny-decoder.int8.onnx","es","transcribe",0,false,false);
      OfflineModelConfig model=new OfflineModelConfig();model.setWhisper(whisper);model.setTokens("rider-asr/tiny-tokens.txt");model.setModelType("whisper");model.setNumThreads(2);
      OfflineRecognizerConfig cfg=new OfflineRecognizerConfig();cfg.setFeatConfig(new FeatureConfig(16000,80,0.0f));cfg.setModelConfig(model);
      OfflineRecognizer recognizer=new OfflineRecognizer(context.getAssets(),cfg);OfflineStream stream=recognizer.createStream();
      stream.acceptWaveform(samples,16000);recognizer.decode(stream);String text=recognizer.getResult(stream).getText().trim();
      stream.release();recognizer.release();if(!text.isEmpty())onCommand.invoke(text);else onError.invoke(new IllegalStateException("No he entendido el comando"));
    }catch(Throwable t){if(running)onError.invoke(t);}finally{stopRecorderOnly();running=false;}
  }
  public void stop(){running=false;stopRecorderOnly();}
  private void stopRecorderOnly(){try{if(recorder!=null)recorder.stop();}catch(Throwable ignored){}try{if(recorder!=null)recorder.release();}catch(Throwable ignored){}recorder=null;}
}
