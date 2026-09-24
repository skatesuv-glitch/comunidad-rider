const test = require('node:test');
const assert = require('node:assert/strict');
const { Bot, parse, helpGroups } = require('../src/voice/rider-commands.js');
function setup(overrides = {}) {
  const out = { volume: .5, vox: true, said: [], left: 0, emergency: 0, voice: true, route:'speaker', radio:null, controls:[] };
  const bot = new Bot({ native: { speak: async ({text}) => out.said.push(text) }, status:()=>{}, toggle:()=>{},
    confirmations:()=>true, getVolume:()=>out.volume,setVolume:v=>out.volume=v,setVox:async v=>out.vox=v,
    getRiders:async()=>[{name:'Ana'},{name:'David'}],getNearbyRiders:async()=>({available:true,riders:[{name:'Ana'}]}),
    getOnboard:async()=>({available:true,ageMs:100,data:{speedKmh:23.6,tripDistanceKm:12.4,elapsedSeconds:3120,averageSpeedKmh:14.3,maximumSpeedKmh:38.7,bmsConnected:true,batteryPercent:62,rangeKm:31,gpsAvailable:true,navigationActive:true,remainingDistanceKm:8.3,remainingMinutes:22,etaEpochMs:Date.now()+22*60000,nextInstruction:'Gira a la derecha',nextInstructionDistanceMeters:300,recordingActive:true,recordingPaused:false}}),
    getDeviceStatus:async()=>({phoneBatteryPercent:71,internet:true,bluetooth:true}),
    isVoiceActive:()=>out.voice,isVoxActive:()=>out.vox,
    setAudioRoute:async route=>{out.route=route;return true},
    playRadio:async query=>{out.radio=query;return {name:query}},stopRadio:async()=>{out.radio=null},
    controlSkatesuv:async action=>{out.controls.push(action);return {ok:true,message:'OK '+action}},
    startVoice:async()=>true,stopVoice:()=>out.voice=false,
    leave:()=>out.left++, emergency:()=>out.emergency++, ...overrides });
  bot.enabled=true;return { bot,out };
}
test('activation and deactivation are different complete commands',()=>{
  assert.equal(parse('Rider, desactivar modo VOX').id,'voxOff');
  assert.equal(parse('Rider, activar modo VOX').id,'voxOn');
  assert.equal(parse('Rider, desactivar Rider Voz').id,'voiceOff');
  assert.equal(parse('Rider, activar Rider Voz').id,'voiceOn');
  assert.equal(parse('hablar con un rider subir volumen').wake,false);
  assert.equal(parse('Rider, no subir volumen').id,null);
});
test('volume up/down/mute/unmute and spoken acknowledgement',async()=>{
  const {bot,out}=setup();await bot.receive('Rider subir volumen');assert.equal(out.volume,.7);
  await bot.receive('Rider bajar volumen');assert.equal(out.volume,.5);
  await bot.receive('Rider silenciar');assert.equal(out.volume,0);
  await bot.receive('Rider bajar volumen');assert.equal(out.volume,0);
  await bot.receive('Rider activar sonido');assert.equal(out.volume,1);
  await bot.receive('Rider subir volumen');assert.equal(out.volume,1);
  assert.equal(out.said.length,6);
});
test('count and names use online riders, including the no-riders case',async()=>{
  const {bot,out}=setup();await bot.receive('Raider, ¿cuántos riders hay?');assert.equal(out.said.at(-1),'Hay 2 Riders conectados');
  await bot.receive('Rider quién está conectado');assert.equal(out.said.at(-1),'Conectados: Ana, David');
  bot.o.getRiders=async()=>[];await bot.receive('Rider quién está conectado');assert.equal(out.said.at(-1),'No hay Riders conectados');
});
test('Rider is required but a short natural pause after wake is accepted',async()=>{
  const {bot,out}=setup();await bot.receive('subir volumen');assert.equal(out.volume,.5);
  await bot.receive('Rider');assert.equal(out.said.length,0);
  await bot.receive('subir volumen');assert.equal(out.volume,.7);
  await bot.receive('bajar volumen');assert.equal(out.volume,.7);
  bot.wakeUntil=Date.now()-1;
  await bot.receive('bajar volumen');assert.equal(out.volume,.7);
  await bot.receive('Rider bajar volumen');assert.equal(out.volume,.5);
});
test('disable VOX and voice without accidentally enabling',async()=>{
  const {bot,out}=setup();await bot.receive('Rider desactivar modo vox');assert.equal(out.vox,false);
  await bot.receive('Rider desactivar rider voz');assert.equal(out.voice,false);
});
test('important actions require voice confirmation and can be cancelled',async()=>{
  const {bot,out}=setup();await bot.receive('Rider salir del grupo');assert.equal(out.left,0);
  await bot.receive('no');assert.equal(out.left,0);
  await bot.receive('Rider no');assert.equal(out.left,0);
  await bot.receive('Rider salir del grupo');await bot.receive('Rider sí');assert.equal(out.left,1);
  await bot.receive('Rider emergencia');await bot.receive('Rider no');assert.equal(out.emergency,0);
  await bot.receive('Rider emergencia');await bot.receive('Rider si');assert.equal(out.emergency,1);
  assert.match(out.said.at(-1),/No se ha enviado/);
});
test('repeat speaks the last real response',async()=>{
  const {bot,out}=setup();await bot.receive('Rider subir volumen');await bot.receive('Rider');
  await bot.receive('Rider repetir último mensaje');assert.equal(out.said.at(-1),'Volumen 70 por ciento');
});
test('recognition is gated during an in-flight spoken response',async()=>{
  let finish;const {bot,out}=setup();bot.native.speak=()=>new Promise(r=>finish=r);
  const work=bot.receive('Rider subir volumen');await bot.receive('Rider subir volumen');assert.equal(out.volume,.7);
  finish();await work;assert.equal(bot.busy,false);
});
test('stale transcript events cannot execute actions',async()=>{
  const {bot,out}=setup();bot.generation=2;await bot.receive('Rider subir volumen',1);assert.equal(out.volume,.5);
});

test('exposes only a live command capture for Rider Voz reuse',()=>{
  const {bot}=setup();
  const live={getAudioTracks:()=>[{readyState:'live'}]}, ended={getAudioTracks:()=>[{readyState:'ended'}]};
  bot.stream=live;assert.equal(bot.getCaptureStream(),live);
  bot.stream=ended;assert.equal(bot.getCaptureStream(),null);
});

test('settings command catalogue only shows Rider-prefixed commands',()=>{
  assert.ok(helpGroups.length>=4);
  for(const group of helpGroups){
    assert.ok(group.title);
    assert.ok(group.commands.length);
    for(const command of group.commands) assert.match(command,/^Rider,/);
  }
});

test('Community Rider data is available through Rider assistant',async()=>{
  const {bot,out}=setup();
  await bot.receive('Rider cuantos riders hay en mi zona');
  assert.equal(out.said.at(-1),'Hay un Rider activo en tu zona');
  bot.o.getNearbyRiders=async()=>({available:true,riders:[{name:'Ana'},{name:'David'}]});
  await bot.receive('Rider que riders hay cerca');
  assert.equal(out.said.at(-1),'En tu zona están: Ana, David');
  bot.o.getNearbyRiders=async()=>({available:false,riders:[]});
  await bot.receive('Rider cuantos riders hay en mi zona');
  assert.match(out.said.at(-1),/activa Riders en mi zona en Comunidad Rider/);
});

test('onboard computer speaks real SKATESUV snapshot data',async()=>{
  const {bot,out}=setup();
  await bot.receive('Rider a que velocidad voy');assert.equal(out.said.at(-1),'Vas a 24 kilómetros por hora');
  await bot.receive('Rider cuantos kilometros llevo');assert.equal(out.said.at(-1),'Llevas 12,4 kilómetros');
  await bot.receive('Rider que bateria me queda');assert.equal(out.said.at(-1),'Te queda un 62 por ciento de batería');
  await bot.receive('Rider cuanta autonomia me queda');assert.equal(out.said.at(-1),'La autonomía estimada es de 31 kilómetros');
  await bot.receive('Rider cuantos kilometros me quedan para llegar');assert.equal(out.said.at(-1),'Te quedan 8,3 kilómetros para llegar');
  await bot.receive('Rider cuanto tiempo falta para llegar');assert.equal(out.said.at(-1),'Te quedan aproximadamente 22 minutos');
  await bot.receive('Rider cual es la siguiente indicacion');assert.match(out.said.at(-1),/300 metros, Gira a la derecha/);
  await bot.receive('Rider como voy');assert.match(out.said.at(-1),/12,4 kilómetros.*24 kilómetros por hora.*62 por ciento.*8,3 kilómetros/);
});

test('onboard data must be fresh and never invented',async()=>{
  const {bot,out}=setup({getOnboard:async()=>({available:true,ageMs:60000,data:{speedKmh:99}})});
  await bot.receive('Rider a que velocidad voy');assert.equal(out.said.at(-1),'No tengo datos recientes de SKATESUV');
  bot.o.getOnboard=async()=>({available:false,reason:'SKATESUV no disponible'});
  await bot.receive('Rider que bateria me queda');assert.equal(out.said.at(-1),'SKATESUV no disponible');
});

test('unknown commands only say Repite',async()=>{
  const {bot,out}=setup();
  await bot.receive('Rider frase que no existe');
  assert.equal(out.said.at(-1),'Repite');
});

test('unknown confirmation says Repite and keeps pending action',async()=>{
  const {bot,out}=setup();
  await bot.receive('Rider salir del grupo');
  assert.equal(bot.pending,'leave');
  await bot.receive('Rider quizá');
  assert.equal(out.said.at(-1),'Repite');
  assert.equal(bot.pending,'leave');
  await bot.receive('Rider no');
  assert.equal(out.left,0);
  assert.equal(bot.pending,null);
});

test('time, trip metrics and phone state commands work',async()=>{
  const {bot,out}=setup();
  await bot.receive('Rider que hora es');assert.match(out.said.at(-1),/^Son las \d{2}:\d{2}$/);
  await bot.receive('Rider cuanto tiempo llevo');assert.equal(out.said.at(-1),'Llevas 52 minutos');
  await bot.receive('Rider cual es mi velocidad media');assert.equal(out.said.at(-1),'Tu velocidad media es de 14 kilómetros por hora');
  await bot.receive('Rider cual ha sido mi velocidad maxima');assert.equal(out.said.at(-1),'Tu velocidad máxima es de 39 kilómetros por hora');
  await bot.receive('Rider que bateria tiene el movil');assert.equal(out.said.at(-1),'El móvil tiene un 71 por ciento de batería');
});

test('navigation, GPS and battery reach answers use real snapshot',async()=>{
  const {bot,out}=setup();
  await bot.receive('Rider esta activa la navegacion');assert.equal(out.said.at(-1),'La navegación está activa');
  await bot.receive('Rider repite la ultima indicacion');assert.equal(out.said.at(-1),'Gira a la derecha');
  await bot.receive('Rider tengo gps');assert.equal(out.said.at(-1),'GPS activo');
  await bot.receive('Rider esta grabando la ruta');assert.equal(out.said.at(-1),'La ruta se está grabando');
  await bot.receive('Rider llego al destino con esta bateria');assert.match(out.said.at(-1),/estimación actual.*31 kilómetros.*8,3/);
});

test('internet bluetooth Rider Voz and audio route commands',async()=>{
  const {bot,out}=setup();
  await bot.receive('Rider tengo internet');assert.equal(out.said.at(-1),'Tienes conexión a Internet');
  await bot.receive('Rider tengo bluetooth');assert.equal(out.said.at(-1),'Bluetooth activo');
  await bot.receive('Rider esta activo rider voz');assert.equal(out.said.at(-1),'Rider Voz está activo');
  await bot.receive('Rider esta activo manos libres');assert.equal(out.said.at(-1),'Manos libres activo');
  await bot.receive('Rider usar bluetooth');assert.equal(out.route,'bluetooth');
  await bot.receive('Rider usar altavoz');assert.equal(out.route,'speaker');
});

test('radio and short help commands',async()=>{
  const {bot,out}=setup();
  await bot.receive('Rider pon rock fm');assert.equal(out.radio,'Rock FM');assert.equal(out.said.at(-1),'Poniendo Rock FM');
  await bot.receive('Rider pon los cuarenta');assert.equal(out.radio,'LOS40');assert.equal(out.said.at(-1),'Poniendo LOS40');
  await bot.receive('Rider para la radio');assert.equal(out.radio,null);assert.equal(out.said.at(-1),'Radio detenida');
  await bot.receive('Rider que puedes hacer');assert.match(out.said.at(-1),/marcha, navegación, batería, Comunidad Rider, audio, conexiones y radio/);
});

test('settings catalogue includes every public command family',()=>{
  const all=helpGroups.flatMap(g=>g.commands);
  const expected=[
    'Rider, ¿qué hora es?','Rider, ¿cuánto tiempo llevo?','Rider, ¿cuál es mi velocidad media?',
    'Rider, ¿cuál ha sido mi velocidad máxima?','Rider, ¿qué batería tiene el móvil?',
    'Rider, ¿llego al destino con esta batería?','Rider, ¿está activa la navegación?',
    'Rider, repite la última indicación','Rider, ¿tengo GPS?','Rider, ¿tengo Internet?',
    'Rider, ¿tengo Bluetooth?','Rider, pon [nombre de emisora]','Rider, para la radio',
    'Rider, iniciar navegación','Rider, pausar navegación','Rider, continuar navegación',
    'Rider, detener navegación','Rider, empezar a grabar ruta','Rider, pausar grabación',
    'Rider, continuar grabación','Rider, finalizar grabación'
  ];
  for(const command of expected)assert.ok(all.includes(command),command);
});

test('generic radio command captures arbitrary station names',()=>{
  const a=parse('Rider pon Los 40');assert.equal(a.id,'radioNamed');assert.equal(a.station,'los 40');
  const b=parse('Rider pon Cadena Cien');assert.equal(b.id,'radioNamed');assert.equal(b.station,'Cadena 100');
  const c=parse('Rider reproduce Radio Paradise');assert.equal(c.id,'radioNamed');assert.equal(c.station,'radio paradise');
  const d=parse('Rider pon Kiss efe eme');assert.equal(d.id,'radioNamed');assert.equal(d.station,'kiss fm');
});

test('navigation and recording controls call SKATESUV actions',async()=>{
  const {bot,out}=setup();
  await bot.receive('Rider iniciar navegacion');assert.equal(out.controls.at(-1),'navigation_start');
  await bot.receive('Rider pausar navegacion');assert.equal(out.controls.at(-1),'navigation_pause');
  await bot.receive('Rider continuar navegacion');assert.equal(out.controls.at(-1),'navigation_resume');

  await bot.receive('Rider detener navegacion');
  assert.notEqual(out.controls.at(-1),'navigation_stop');
  assert.equal(bot.pending,'navigationStop');
  await bot.receive('Rider si');
  assert.equal(out.controls.at(-1),'navigation_stop');

  await bot.receive('Rider empezar a grabar ruta');assert.equal(out.controls.at(-1),'record_start');
  await bot.receive('Rider pausar grabacion');assert.equal(out.controls.at(-1),'record_pause');
  await bot.receive('Rider continuar grabacion');assert.equal(out.controls.at(-1),'record_resume');

  await bot.receive('Rider finalizar grabacion');
  assert.notEqual(out.controls.at(-1),'record_stop');
  assert.equal(bot.pending,'recordStop');
  await bot.receive('Rider no');
  assert.notEqual(out.controls.at(-1),'record_stop');
});

test('radio failures do not kill the assistant',async()=>{
  const {bot,out}=setup({playRadio:async()=>({ok:false,message:'No encuentro esa emisora'})});
  await bot.receive('Rider pon emisora inventada');
  assert.equal(out.said.at(-1),'No encuentro esa emisora');
  assert.equal(bot.enabled,true);
  await bot.receive('Rider que hora es');
  assert.match(out.said.at(-1),/^Son las \d{2}:\d{2}$/);
});

test('wake pause also supports a free radio station name',async()=>{
  const {bot,out}=setup();
  await bot.receive('Rider');
  await bot.receive('pon Kiss efe eme');
  assert.equal(out.radio,'kiss fm');
});
