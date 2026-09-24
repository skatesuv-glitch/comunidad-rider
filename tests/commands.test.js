const test = require('node:test');
const assert = require('node:assert/strict');
const { Bot, parse, helpGroups } = require('../src/voice/rider-commands.js');
function setup(overrides = {}) {
  const out = { volume: .5, vox: true, said: [], left: 0, emergency: 0, voice: true };
  const bot = new Bot({ native: { speak: async ({text}) => out.said.push(text) }, status:()=>{}, toggle:()=>{},
    confirmations:()=>true, getVolume:()=>out.volume,setVolume:v=>out.volume=v,setVox:async v=>out.vox=v,
    getRiders:async()=>[{name:'Ana'},{name:'David'}],getNearbyRiders:async()=>({available:true,riders:[{name:'Ana'}]}),startVoice:async()=>true,stopVoice:()=>out.voice=false,
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
test('two-part wake followed by command, and expiration',async()=>{
  const {bot,out}=setup();await bot.receive('subir volumen');assert.equal(out.volume,.5);
  await bot.receive('Rider');assert.equal(out.said.at(-1),'Te escucho');
  await bot.receive('subir volumen');assert.equal(out.volume,.7);
  await bot.receive('bajar volumen');assert.equal(out.volume,.7);
  await bot.receive('Rider');bot.deadline=Date.now()-1;
  await bot.receive('bajar volumen');assert.equal(out.volume,.7);clearTimeout(bot.timer);
});
test('disable VOX and voice without accidentally enabling',async()=>{
  const {bot,out}=setup();await bot.receive('Rider desactivar modo vox');assert.equal(out.vox,false);
  await bot.receive('Rider desactivar rider voz');assert.equal(out.voice,false);
});
test('important actions require voice confirmation and can be cancelled',async()=>{
  const {bot,out}=setup();await bot.receive('Rider salir del grupo');assert.equal(out.left,0);
  await bot.receive('no');assert.equal(out.left,0);
  await bot.receive('Rider salir del grupo');await bot.receive('sí');assert.equal(out.left,1);
  await bot.receive('Rider emergencia');await bot.receive('no');assert.equal(out.emergency,0);
  await bot.receive('Rider emergencia');await bot.receive('si');assert.equal(out.emergency,1);
  assert.match(out.said.at(-1),/No se ha enviado/);
});
test('repeat speaks the last real response',async()=>{
  const {bot,out}=setup();await bot.receive('Rider subir volumen');await bot.receive('Rider');
  await bot.receive('repetir último mensaje');assert.equal(out.said.at(-1),'Volumen 70 por ciento');
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
