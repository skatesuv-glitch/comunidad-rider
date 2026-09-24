from pathlib import Path

p = Path("android-patches/RiderCommandsPlugin.java")
s = p.read_text(encoding="utf-8")

checks = {
    "confirma audio real": "onIsPlayingChanged(boolean isPlaying)",
    "no da por bueno solo READY": "STATE_READY",
    "permite redirecciones http/https": ".setAllowCrossProtocolRedirects(true)",
    "usa user agent": '.setUserAgent("RiderVoz/2.0")',
    "marca HLS explícito": "MimeTypes.APPLICATION_M3U8",
    "tiene fallback Rock FM": "rockfm-barcelona.flumotion.com/playlist.m3u8",
    "tiene fallback Kiss FM": "bbkissfm.kissfmradio.cires21.com/bbkissfm.mp3",
    "prueba siguiente stream": "startRadioCandidates(candidates, index + 1",
    "tts no roba foco a radio": "player.setAudioAttributes(attrs, false)",
    "reanuda radio tras tts": "if (rp.getPlaybackState() == Player.STATE_READY && !rp.isPlaying()) rp.play()",
    "sale de modo voip para radio": "audio.setMode(AudioManager.MODE_NORMAL)",
    "respeta Rider Voz activo": 'call.getBoolean("voiceActive", false)',
    "normaliza gramática": "grammarPhrases.add(normalizeSpeech(phrase))",
    "radio conocida va directa": "if (isExactKnownRadio(text))",
    "radio conocida parcial va directa": "if (isExactKnownRadio(partial))",
    "ducking muy bajo": "player.setVolume(ducked ? 0.06f : 1.0f)",
    "mantiene duck tras wake": "System.currentTimeMillis() + 10000L",
    "bloquea radio en grupo": 'call.getBoolean("groupConnected", false)',
    "mensaje de bloqueo grupo": "Con Rider Voz conectado, la radio queda apagada",
}
for label, needle in checks.items():
    if needle not in s:
        raise SystemExit(f"FAIL radio native: {label}")

# El éxito de radio debe depender de isPlaying, no del antiguo STATE_READY.
segment = s[s.index("private void startRadioCandidates"):s.index("@PluginMethod public void stopRadio")]
if "STATE_READY" in segment:
    raise SystemExit("FAIL radio native: todavía acepta STATE_READY como éxito")

print("PASS: radio native playback, ducking, group lock and known-station fast path are present")
