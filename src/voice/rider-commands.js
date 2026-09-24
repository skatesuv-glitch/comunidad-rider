/* Rider commands: one browser audio source, offline native ASR, native TTS.
 * No UI creation and no ownership of the group's media tracks. */
(function (root) {
  'use strict';
  const normalize = text => String(text || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const orders = {
    volumeUp: ['subir volumen', 'sube el volumen', 'sube volumen', 'aumentar volumen'],
    volumeDown: ['bajar volumen', 'baja el volumen', 'baja volumen', 'reducir volumen'],
    mute: ['silenciar', 'silenciar audio', 'quitar sonido'],
    unmute: ['activar sonido', 'poner sonido', 'recuperar sonido'],
    voxOff: ['desactivar modo vox', 'desactiva modo vox', 'desactivar vox', 'desactivar manos libres'],
    voxOn: ['activar modo vox', 'activa modo vox', 'activar vox', 'activar manos libres'],
    voiceOff: ['desactivar rider voz', 'desactiva rider voz', 'desactivar raider voz'],
    voiceOn: ['activar rider voz', 'activa rider voz', 'activar raider voz'],
    count: ['cuantos riders hay', 'cuantos raiders hay', 'cuantos riders estan conectados', 'cuantos hay conectados', 'cuantos estan conectados'],
    names: ['quien esta conectado', 'quienes estan conectados', 'que riders hay conectados'],
    nearbyCount: ['cuantos riders hay en mi zona', 'cuantos raiders hay en mi zona', 'cuantos riders hay cerca', 'hay riders cerca'],
    nearbyNames: ['que riders hay en mi zona', 'quienes hay en mi zona', 'quien hay cerca', 'que riders hay cerca'],
    repeat: ['repetir ultimo mensaje', 'repite el ultimo mensaje', 'repite'],
    leave: ['salir del grupo', 'sal del grupo'],
    emergency: ['emergencia', 'activar emergencia'],
    yes: ['si', 'confirmar', 'confirmo', 'si confirmar'],
    no: ['no', 'cancelar', 'cancela']
  };
  const helpGroups = [
    { title: 'Audio', commands: [
      'Rider, subir volumen', 'Rider, bajar volumen', 'Rider, silenciar', 'Rider, activar sonido'
    ]},
    { title: 'Rider Voz', commands: [
      'Rider, activar Rider Voz', 'Rider, desactivar Rider Voz',
      'Rider, activar manos libres', 'Rider, desactivar manos libres'
    ]},
    { title: 'Comunidad Rider', commands: [
      'Rider, ¿quién está conectado?', 'Rider, ¿cuántos Riders hay?',
      'Rider, ¿cuántos Riders hay en mi zona?', 'Rider, ¿qué Riders hay cerca?', 'Rider, salir del grupo'
    ]},
    { title: 'Asistente', commands: [
      'Rider, repetir último mensaje', 'Rider, emergencia'
    ]}
  ];
  const lookup = new Map(Object.entries(orders).flatMap(([id, phrases]) => phrases.map(p => [p, id])));
  const parse = raw => {
    const text = normalize(raw), wake = /^(?:rider|raider)\b/.test(text);
    const order = wake ? text.replace(/^(?:rider|raider)\b\s*/, '') : text;
    return { wake, order, id: lookup.get(order) || null };
  };
  const grammar = [...new Set(['rider', 'raider', '[unk]', ...Object.values(orders).flat(),
    ...['rider', 'raider'].flatMap(w => Object.values(orders).flat().map(p => w + ' ' + p))])];

  class Bot {
    constructor(options) {
      this.o = options; this.native = options.native; this.enabled = false;
      this.generation = 0; this.busy = false; this.pending = null; this.deadline = 0;
      this.lastReply = ''; this.handles = []; this.starting = false;
    }
    status(text) { this.o.status(text); }
    getCaptureStream() {
      const stream = this.stream;
      return this.enabled && stream?.getAudioTracks().some(t => t.readyState === 'live') ? stream : null;
    }
    async start() {
      if (this.enabled || this.starting) return;
      this.starting = true;
      const run = ++this.generation;
      this.status('Preparando comandos Rider…');
      try {
        if (!this.native) throw new Error('Comandos Rider disponibles en la APK Android');
        this.handles.push(await this.native.addListener('transcript', e => {
          if (run === this.generation) this.receive(e.text, run).catch(e => this.fail(e, run));
        }));
        this.handles.push(await this.native.addListener('commandError', e => this.fail(new Error(e.message), run)));
        if (run !== this.generation) return;
        const shared = this.o.getStream?.();
        this.stream = shared?.getAudioTracks().some(t => t.readyState === 'live') ? shared.clone()
          : await navigator.mediaDevices.getUserMedia({ audio: this.o.audioConstraints(), video: false });
        if (run !== this.generation) { this.stream.getTracks().forEach(t => t.stop()); return; }
        this.context = new (root.AudioContext || root.webkitAudioContext)({ sampleRate: 16000 });
        await this.context.resume();
        await this.native.start({ sampleRate: this.context.sampleRate, grammar: JSON.stringify(grammar) });
        if (run !== this.generation) { await this.native.stop(); return; }
        this.source = this.context.createMediaStreamSource(this.stream);
        this.processor = this.context.createScriptProcessor(4096, 1, 1);
        this.silent = this.context.createGain(); this.silent.gain.value = 0;
        this.source.connect(this.processor); this.processor.connect(this.silent); this.silent.connect(this.context.destination);
        this.inFlight = false; this.overruns = 0;
        this.processor.onaudioprocess = event => {
          if (!this.enabled || this.busy || run !== this.generation) return;
          if (this.inFlight) {
            if (++this.overruns >= 4) this.fail(new Error('El teléfono no puede procesar el audio de comandos a tiempo'), run);
            return;
          }
          this.overruns = 0;
          const floats = event.inputBuffer.getChannelData(0), bytes = new Uint8Array(floats.length * 2);
          const view = new DataView(bytes.buffer);
          for (let i = 0; i < floats.length; i++) {
            const x = Math.max(-1, Math.min(1, floats[i])); view.setInt16(i * 2, x < 0 ? x * 32768 : x * 32767, true);
          }
          let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
          this.inFlight = true;
          this.native.audio({ pcm: btoa(binary) }).catch(e => this.fail(e, run)).finally(() => { this.inFlight = false; });
        };
        this.stream.getAudioTracks().forEach(t => t.addEventListener('ended', () => {
          if (this.enabled && run === this.generation) this.fail(new Error('Se ha desconectado el micrófono de comandos'), run);
        }));
        this.enabled = true; this.o.toggle(true); this.status('Escuchando «Rider…»');
      } catch (e) { if (run === this.generation) await this.fail(e, run); }
      finally { this.starting = false; }
    }
    async stop() {
      ++this.generation; this.enabled = false; this.starting = false;
      this.pending = null; this.deadline = 0; clearTimeout(this.timer); this.o.toggle(false);
      if (this.processor) { this.processor.onaudioprocess = null; this.processor.disconnect(); }
      this.source?.disconnect(); this.silent?.disconnect();
      // All tracks here belong to this bot (clones or its own getUserMedia request).
      this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
      if (this.context) await this.context.close().catch(() => {});
      this.context = null; this.source = null; this.processor = null; this.silent = null;
      await Promise.all(this.handles.splice(0).map(h => h.remove()));
      if (this.native) await this.native.stop().catch(() => {});
      this.busy = false;
    }
    async fail(error, run) {
      if (run !== this.generation) return;
      await this.stop(); this.status(error?.message || 'No se pudo iniciar el asistente Rider');
    }
    async reply(text, remember = true) {
      this.status(text);
      if (remember) this.lastReply = text;
      await this.native.speak({ text });
    }
    armWindow() {
      this.deadline = Date.now() + 10000; clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (!this.enabled || this.busy) return;
        this.pending = null; this.deadline = 0; this.status('Escuchando «Rider…»');
      }, 10000);
    }
    async receive(raw, run = this.generation) {
      if (!this.enabled || this.busy || run !== this.generation) return;
      const parsed = parse(raw), awaiting = this.deadline > Date.now();
      if (!parsed.wake && !awaiting) return;
      if (!awaiting) this.pending = null;
      this.busy = true; clearTimeout(this.timer);
      try {
        if (parsed.wake && !parsed.order) {
          await this.reply('Te escucho', false); if (run === this.generation) this.armWindow(); return;
        }
        let id = parsed.id;
        if (this.pending) {
          const pending = this.pending; this.pending = null; this.deadline = 0;
          if (id === 'no') { await this.reply('Cancelado', false); return; }
          if (id === 'yes') id = pending;
          else { await this.reply('Acción cancelada. Di Rider y una nueva orden', false); return; }
        } else if ((id === 'leave' || id === 'emergency') && this.o.confirmations()) {
          this.pending = id;
          await this.reply(id === 'leave' ? '¿Quieres salir del grupo? Di sí o no' : '¿Confirmas activar la alerta local de emergencia? Di sí o no', false);
          if (run === this.generation) this.armWindow(); return;
        }
        this.deadline = 0;
        switch (id) {
          case 'volumeUp': case 'volumeDown': {
            const value = Math.max(0, Math.min(1, Math.round((this.o.getVolume() + (id === 'volumeUp' ? .2 : -.2)) * 100) / 100));
            this.o.setVolume(value); await this.reply('Volumen ' + Math.round(value * 100) + ' por ciento'); break;
          }
          case 'mute': this.o.setVolume(0); await this.reply('Audio silenciado'); break;
          case 'unmute': this.o.setVolume(1); await this.reply('Sonido activado'); break;
          case 'voxOn': case 'voxOff': await this.o.setVox(id === 'voxOn'); if (run !== this.generation) return; await this.reply(id === 'voxOn' ? 'Modo VOX activado' : 'Modo VOX desactivado'); break;
          case 'voiceOn': { const active = await this.o.startVoice(); if (run !== this.generation) return; await this.reply(active ? 'Rider Voz activado' : 'Añade un Rider al grupo para iniciar la conversación'); break; }
          case 'voiceOff': this.o.stopVoice(); await this.reply('Rider Voz desactivado'); break;
          case 'count': case 'names': {
            const riders = await this.o.getRiders(); if (run !== this.generation) return;
            await this.reply(id === 'count' ? (riders.length === 1 ? 'Hay un Rider conectado' : 'Hay ' + riders.length + ' Riders conectados') :
              (riders.length ? 'Conectados: ' + riders.map(r => r.name || 'Rider').join(', ') : 'No hay Riders conectados')); break;
          }
          case 'nearbyCount': case 'nearbyNames': {
            const nearby = await this.o.getNearbyRiders(); if (run !== this.generation) return;
            if (!nearby?.available) {
              await this.reply('Para saber qué Riders hay en tu zona, activa Riders en mi zona en Comunidad Rider'); break;
            }
            const riders = nearby.riders || [];
            if (id === 'nearbyCount') {
              await this.reply(riders.length === 1 ? 'Hay un Rider activo en tu zona' : riders.length ? 'Hay ' + riders.length + ' Riders activos en tu zona' : 'No hay Riders activos en tu zona');
            } else {
              await this.reply(riders.length ? 'En tu zona están: ' + riders.map(r => r.name || 'Rider').join(', ') : 'No hay Riders activos en tu zona');
            }
            break;
          }
          case 'repeat': await this.reply(this.lastReply || 'Todavía no hay un mensaje para repetir', false); break;
          case 'leave': await this.reply('Saliendo del grupo'); if (run === this.generation) this.o.leave(); break;
          case 'emergency': this.o.emergency(); await this.reply('Alerta local de emergencia activada. No se ha enviado ningún aviso a contactos'); break;
          default: await this.reply('No he entendido la orden. Di Rider, subir volumen o cuántos Riders hay', false);
        }
      } finally { if (run === this.generation) this.busy = false; }
    }
  }
  const api = { parse, grammar, helpGroups, Bot, create: options => new Bot(options) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RiderCommands = api;
})(typeof window === 'undefined' ? globalThis : window);
