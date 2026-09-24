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
    getNearbyRiders:async()=>{
      if(!state.locationConsent||!state.locationSharing)return {available:false,riders:[]};
      await refreshSharedLocation().catch(()=>false);
      const riders=await fetchCommunityRiders();
      return {available:true,riders:riders.filter(r=>r.state==='green'&&Number.isFinite(Number(r.latitude))&&Number.isFinite(Number(r.longitude)))}
    },
    getOnboard:async()=>{
      if(!commandsNative?.getOnboardSnapshot)return {available:false,reason:'El ordenador de a bordo necesita SKATESUV compatible'};
      const result=await commandsNative.getOnboardSnapshot();
      if(!result?.available)return result||{available:false};
      try{return {...result,data:JSON.parse(result.json)}}catch{return {available:false,reason:'No pude leer los datos de SKATESUV'}}
    },
    getDeviceStatus:async()=>commandsNative?.getDeviceStatus?await commandsNative.getDeviceStatus():null,
    isVoiceActive:()=>voiceActive,
    isVoxActive:()=>voxEnabled,
    setAudioRoute:async route=>{
      audioRoute=route;
      if(!nativeVoice)return false;
      try{await nativeVoice.setAudioRoute({route});return true}catch{return false}
    },
    playRadio:async query=>{
      if(!commandsNative?.playRadio)throw new Error('Radio no disponible');
      return await commandsNative.playRadio({query});
    },
    stopRadio:async()=>{if(commandsNative?.stopRadio)await commandsNative.stopRadio()},
    controlSkatesuv:async action=>{
      if(!commandsNative?.controlSkatesuv)return {ok:false,message:'El control necesita SKATESUV compatible'};
      return await commandsNative.controlSkatesuv({action});
    },
    leave:()=>leave.click(),
    emergency:()=>setVoiceState(voiceActive?'active':'ready','EMERGENCIA · alerta local confirmada')
  });
  commandToggle.onclick=async()=>{if(riderCommands.starting)return;if(riderCommands.enabled){await riderCommands.stop();commandStatus.textContent='Comandos de voz desactivados'}else await riderCommands.start()};'''+s[b:]
old="if(voiceRecognition){voiceRecognition.onend=null;voiceRecognition.stop();voiceRecognition=null}if(nativeVoice&&nativeCommandsOn)nativeVoice.stopCommandListening().catch(()=>{});if(nativeCommandHandle?.remove)nativeCommandHandle.remove();"
assert old in s
s=s.replace(old,"riderCommands.stop().catch(()=>{});")
# If command listening already owns the browser microphone, Rider Voz clones that
# MediaStream instead of opening a second getUserMedia capture.
capture_old="rawVoiceStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation,noiseSuppression:noiseReduction,autoGainControl:true},video:false});"
capture_new="const commandInput=riderCommands.getCaptureStream?.();rawVoiceStream=commandInput?.getAudioTracks().some(t=>t.readyState==='live')?commandInput.clone():await navigator.mediaDevices.getUserMedia({audio:{echoCancellation,noiseSuppression:noiseReduction,autoGainControl:true},video:false});"
assert capture_old in s
s=s.replace(capture_old,capture_new,1)
# Keep settings compact: the complete working command list is collapsed by default.
examples_old='<div class="rvCommandExamples"><p><b>Rider,</b> subir volumen · bajar volumen · silenciar · activar sonido</p><p><b>Rider,</b> activar/desactivar Rider Voz · activar/desactivar modo VOX</p><p><b>Rider,</b> ¿quién está conectado? · repetir último mensaje</p><p><b>Con confirmación:</b> salir del grupo · emergencia</p></div>'
examples_new='<div class="rvCommandExamples"><p><b>Di siempre «Rider» delante de la orden.</b></p></div><button class="rvSettingsLink" id="allCommandsToggle" type="button" aria-expanded="false"><span><strong>Ver todos los comandos</strong><small>Lista completa por categorías</small></span><b id="allCommandsArrow">›</b></button><div class="rvCommandExamples hidden" id="allCommandsList"></div>'
assert examples_old in s
s=s.replace(examples_old,examples_new,1)

bind_anchor="const riderNickInput=document.querySelector('#riderNickInput'),saveRiderNick=document.querySelector('#saveRiderNick'),riderNickStatus=document.querySelector('#riderNickStatus');"
assert bind_anchor in s
bind_new=bind_anchor+"\n  const allCommandsToggle=document.querySelector('#allCommandsToggle'),allCommandsList=document.querySelector('#allCommandsList'),allCommandsArrow=document.querySelector('#allCommandsArrow');\n  if(allCommandsList){allCommandsList.innerHTML=(window.RiderCommands?.helpGroups||[]).map(group=>'<p><b>'+esc(group.title)+'</b><br>'+group.commands.map(esc).join('<br>')+'</p>').join('')}\n  if(allCommandsToggle)allCommandsToggle.onclick=()=>{const open=allCommandsList.classList.toggle('hidden')===false;allCommandsToggle.setAttribute('aria-expanded',open?'true':'false');if(allCommandsArrow)allCommandsArrow.textContent=open?'⌄':'›'};"
s=s.replace(bind_anchor,bind_new,1)

prefix=(root/'src/voice/rider-commands.js').read_text()+'\n/* APPROVED APP — only command integration below is replaced. */\n'
(root/'www/app.js').write_text(prefix+s)
