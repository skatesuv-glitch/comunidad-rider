package com.eskatesuv.ridervoz.voicenext;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import java.util.ArrayList;
import java.util.Locale;
import kotlin.Unit;
import kotlin.jvm.functions.Function1;

public final class RiderCommandEngine {
  private final Context context;
  private final Function1<String,Unit> onCommand;
  private final Function1<Throwable,Unit> onError;
  private SpeechRecognizer recognizer;
  private boolean running;

  public RiderCommandEngine(Context c, Function1<String,Unit> ok, Function1<Throwable,Unit> err){
    context=c; onCommand=ok; onError=err;
  }

  public boolean start(){
    if(running)return true;
    if(!SpeechRecognizer.isRecognitionAvailable(context)){
      onError.invoke(new IllegalStateException("Reconocimiento de voz no disponible"));
      return false;
    }
    try{
      recognizer=SpeechRecognizer.createSpeechRecognizer(context);
      recognizer.setRecognitionListener(new RecognitionListener(){
        public void onReadyForSpeech(Bundle p){}
        public void onBeginningOfSpeech(){}
        public void onRmsChanged(float r){}
        public void onBufferReceived(byte[] b){}
        public void onEndOfSpeech(){}
        public void onEvent(int e,Bundle p){}
        public void onPartialResults(Bundle p){
          ArrayList<String> xs=p.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
          if(xs!=null&&!xs.isEmpty()){
            String text=xs.get(0).trim();
            if(!text.isEmpty() && looksLikeRiderCommand(text)){
              cleanup(); onCommand.invoke(text);
            }
          }
        }
        public void onError(int e){
          boolean was=running; cleanup();
          if(was) onError.invoke(new IllegalStateException("No he entendido el comando ("+e+")"));
        }
        public void onResults(Bundle b){
          ArrayList<String> xs=b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
          String text=(xs!=null&&!xs.isEmpty())?xs.get(0).trim():"";
          cleanup();
          if(!text.isEmpty()) onCommand.invoke(text);
          else onError.invoke(new IllegalStateException("No he entendido el comando"));
        }
      });
      Intent i=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
      i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
      i.putExtra(RecognizerIntent.EXTRA_LANGUAGE,"es-ES");
      i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE,"es-ES");
      i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,3);
      i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,true);
      running=true;
      recognizer.startListening(i);
      return true;
    }catch(Throwable t){ cleanup(); onError.invoke(t); return false; }
  }
  private boolean looksLikeRiderCommand(String raw){
    String s=raw.toLowerCase(Locale.ROOT);
    return s.contains("volumen")||s.contains("silenciar")||s.contains("sonido")||
      s.contains("vox")||s.contains("rider voz")||s.contains("conectado")||
      s.contains("cuantos")||s.contains("cuántos")||s.contains("repetir")||
      s.contains("salir")||s.contains("emergencia")||s.equals("si")||s.equals("sí")||s.equals("no");
  }
  public void stop(){
    running=false;
    try{if(recognizer!=null)recognizer.cancel();}catch(Throwable ignored){}
    try{if(recognizer!=null)recognizer.destroy();}catch(Throwable ignored){}
    recognizer=null;
  }
  private void cleanup(){
    running=false;
    try{if(recognizer!=null)recognizer.destroy();}catch(Throwable ignored){}
    recognizer=null;
  }
}
