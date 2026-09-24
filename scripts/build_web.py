from pathlib import Path
root=Path(__file__).resolve().parent.parent
s=(root/'reference/approved-app.js').read_text()
s=s.replace(",voiceRecognition=null,pttHeld=false", ",pttHeld=false")
s='\n'.join(l for l in s.split('\n') if not l.startswith('  const say=text=>'))
a=s.index('  const runVoiceCommand=raw=>')
b=s.index('\n',s.index('  let nativeCommandHandle=',a))
s=s[:a]+'''  const commandsNative=window.Capacitor?.Plugins?.RiderCommands||null;
  const riderCommands=window.RiderCommands.create({
    native:commandsNative,
    status:text=>{commandStatus.textContent=text},
    toggle:on=>commandToggle.classList.toggle('on',on),
    getStream:()=>rawVoiceStream,
    audioConstraints:()=>({echoCancellation,noiseSuppression:noiseReduction,autoGainControl:true}),
    confirmations:()=>voiceConfirmations,
    getVolume:()=>appVolume,
    setVolume:value=>{appVolume=value;applyVolume()},
    setVox,
    startVoice:async()=>{await startVoice();return voiceActive},
    stopVoice:()=>{releaseVoiceMedia();setVoiceState('ready','Rider Voz desactivado')},
    getRiders:async()=>{const riders=await fetchCommunityRiders();return riders.filter(r=>r.state==='green')},
    leave:()=>leave.click(),
    emergency:()=>setVoiceState(voiceActive?'active':'ready','EMERGENCIA · alerta local confirmada')
  });
  commandToggle.onclick=async()=>{if(riderCommands.starting)return;if(riderCommands.enabled){await riderCommands.stop();commandStatus.textContent='Comandos de voz desactivados'}else await riderCommands.start()};'''+s[b:]
old="if(voiceRecognition){voiceRecognition.onend=null;voiceRecognition.stop();voiceRecognition=null}if(nativeVoice&&nativeCommandsOn)nativeVoice.stopCommandListening().catch(()=>{});if(nativeCommandHandle?.remove)nativeCommandHandle.remove();"
assert old in s
s=s.replace(old,"riderCommands.stop().catch(()=>{});")
prefix=(root/'src/voice/rider-commands.js').read_text()+'\n/* APPROVED APP — only command integration below is replaced. */\n'
(root/'www/app.js').write_text(prefix+s)
