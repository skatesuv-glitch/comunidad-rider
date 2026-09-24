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
    speed: ['a que velocidad voy', 'que velocidad llevo', 'velocidad actual', 'dime la velocidad'],
    tripDistance: ['cuantos kilometros llevo', 'cuanta distancia llevo', 'distancia recorrida', 'cuantos km llevo'],
    battery: ['que bateria me queda', 'cuanta bateria me queda', 'como voy de bateria', 'dime la bateria'],
    autonomy: ['cuanta autonomia me queda', 'cuantos kilometros puedo hacer', 'cuantos km puedo hacer'],
    remainingDistance: ['cuantos kilometros me quedan para llegar', 'cuantos km me quedan para llegar', 'cuanta distancia queda para llegar'],
    remainingTime: ['cuanto tiempo falta para llegar', 'cuanto tardare en llegar', 'cuantos minutos faltan para llegar'],
    eta: ['a que hora llego', 'a que hora llegare', 'hora de llegada'],
    nextInstruction: ['cual es la siguiente indicacion', 'proxima indicacion', 'que tengo que hacer ahora'],
    rideSummary: ['como voy', 'dame un resumen', 'resumen de marcha'],
    timeNow: ['que hora es', 'dime la hora', 'hora actual'],
    tripTime: ['cuanto tiempo llevo', 'cuanto tiempo llevo de ruta', 'tiempo de marcha'],
    averageSpeed: ['cual es mi velocidad media', 'que velocidad media llevo', 'velocidad media'],
    maxSpeed: ['cual ha sido mi velocidad maxima', 'que velocidad maxima llevo', 'velocidad maxima'],
    phoneBattery: ['que bateria tiene el movil', 'cuanta bateria tiene el movil', 'bateria del telefono', 'bateria del movil'],
    canReach: ['llego al destino con esta bateria', 'me da la bateria para llegar', 'tengo bateria para llegar'],
    navigationState: ['esta activa la navegacion', 'tengo navegacion activa', 'estado de navegacion'],
    repeatInstruction: ['repite la ultima indicacion', 'repite la indicacion', 'repetir indicacion'],
    gpsState: ['tengo gps', 'esta activo el gps', 'estado del gps'],
    internetState: ['tengo internet', 'hay internet', 'estado de internet'],
    bluetoothState: ['tengo bluetooth', 'esta activo el bluetooth', 'estado de bluetooth'],
    voiceState: ['esta activo rider voz', 'estado de rider voz'],
    voxState: ['esta activo manos libres', 'esta activo el manos libres', 'estado de manos libres'],
    useBluetooth: ['usar bluetooth', 'audio por bluetooth', 'pon el bluetooth'],
    useSpeaker: ['usar altavoz', 'audio por altavoz', 'pon el altavoz'],
    recordingState: ['esta grabando la ruta', 'estoy grabando la ruta', 'estado de grabacion'],
    navigationStart: ['iniciar navegacion', 'empieza la navegacion', 'comenzar navegacion'],
    navigationPause: ['pausar navegacion', 'pausa la navegacion'],
    navigationResume: ['continuar navegacion', 'reanudar navegacion', 'sigue la navegacion'],
    navigationStop: ['detener navegacion', 'parar navegacion', 'terminar navegacion'],
    recordStart: ['empezar a grabar ruta', 'iniciar grabacion de ruta', 'grabar ruta'],
    recordPause: ['pausar grabacion', 'pausa la grabacion'],
    recordResume: ['continuar grabacion', 'reanudar grabacion'],
    recordStop: ['terminar ruta', 'finalizar grabacion', 'detener grabacion'],
    help: ['que puedes hacer', 'que comandos tengo', 'ayuda'],
    radioRock: ['pon rock fm', 'pon radio rock fm', 'ponme rock fm'],
    radioPrompt: ['pon la radio', 'pon radio', 'ponme la radio', 'reproduce la radio'],
    radioStop: ['para la radio', 'parar la radio', 'apaga la radio', 'deten la radio'],
    repeat: ['repetir ultimo mensaje', 'repite el ultimo mensaje', 'repite'],
    leave: ['salir del grupo', 'sal del grupo'],
    emergency: ['emergencia', 'activar emergencia'],
    yes: ['si', 'confirmar', 'confirmo', 'si confirmar'],
    no: ['no', 'cancelar', 'cancela']
  };
  const helpGroups = [
    { title: 'Audio', commands: [
      'Rider, subir volumen', 'Rider, bajar volumen', 'Rider, silenciar', 'Rider, activar sonido',
      'Rider, usar Bluetooth', 'Rider, usar altavoz'
    ]},
    { title: 'Rider Voz', commands: [
      'Rider, activar Rider Voz', 'Rider, desactivar Rider Voz',
      'Rider, activar manos libres', 'Rider, desactivar manos libres',
      'Rider, ¿está activo Rider Voz?', 'Rider, ¿está activo manos libres?'
    ]},
    { title: 'Comunidad Rider', commands: [
      'Rider, ¿quién está conectado?', 'Rider, ¿cuántos Riders hay?',
      'Rider, ¿cuántos Riders hay en mi zona?', 'Rider, ¿qué Riders hay cerca?',
      'Rider, salir del grupo', 'Rider, emergencia'
    ]},
    { title: 'Ordenador de a bordo', commands: [
      'Rider, ¿a qué velocidad voy?', 'Rider, ¿cuántos kilómetros llevo?',
      'Rider, ¿cuánto tiempo llevo?', 'Rider, ¿cuál es mi velocidad media?',
      'Rider, ¿cuál ha sido mi velocidad máxima?', 'Rider, ¿qué batería me queda?',
      'Rider, ¿qué batería tiene el móvil?', 'Rider, ¿cuánta autonomía me queda?',
      'Rider, ¿llego al destino con esta batería?', 'Rider, ¿cómo voy?'
    ]},
    { title: 'Navegación', commands: [
      'Rider, ¿está activa la navegación?', 'Rider, ¿cuántos kilómetros me quedan para llegar?',
      'Rider, ¿cuánto tiempo falta para llegar?', 'Rider, ¿a qué hora llego?',
      'Rider, ¿cuál es la siguiente indicación?', 'Rider, repite la última indicación',
      'Rider, iniciar navegación', 'Rider, pausar navegación', 'Rider, continuar navegación',
      'Rider, detener navegación', 'Rider, ¿está grabando la ruta?',
      'Rider, empezar a grabar ruta', 'Rider, pausar grabación',
      'Rider, continuar grabación', 'Rider, finalizar grabación'
    ]},
    { title: 'Conexiones', commands: [
      'Rider, ¿tengo GPS?', 'Rider, ¿tengo Internet?', 'Rider, ¿tengo Bluetooth?'
    ]},
    { title: 'Radio', commands: [
      'Rider, pon [nombre de emisora]', 'Rider, pon Rock FM', 'Rider, para la radio'
    ]},
    { title: 'Asistente', commands: [
      'Rider, ¿qué hora es?', 'Rider, ¿qué puedes hacer?', 'Rider, repetir último mensaje',
      'Rider, sí', 'Rider, no'
    ]}
  ];
  const lookup = new Map(Object.entries(orders).flatMap(([id, phrases]) => phrases.map(p => [p, id])));
  const parse = raw => {
    const text = normalize(raw), wake = /^(?:rider|raider)\b/.test(text);
    const order = wake ? text.replace(/^(?:rider|raider)\b\s*/, '') : text;
    const exact = lookup.get(order) || null;
    if (exact) return { wake, order, id: exact };
    if (wake) {
      const radio = order.match(/^(?:pon|ponme|reproduce|escucha)\s+(?:la\s+radio\s+)?(.+)$/);
      if (radio) {
        let station = radio[1].trim()
          .replace(/\befe eme\b/g,'fm')
          .replace(/\blos cuarenta\b/g,'los 40')
          .replace(/\bcadena cien\b/g,'cadena 100');
        if (station === 'los 40') station = 'LOS40';
        if (station === 'cadena 100') station = 'Cadena 100';
        return { wake, order, id: 'radioNamed', station };
      }
    }
    return { wake, order, id: null };
  };
  const radioPrefixes = ['pon','ponme','reproduce','escucha'];
  const commonRadioPhrases = [
    'pon los 40','pon europa fm','pon kiss fm','pon cadena 100',
    'pon cadena ser','pon cope','pon onda cero','pon radio 3','pon rock fm'
  ];
  const grammar = [...new Set(['rider', 'raider', '[unk]',
    ...Object.values(orders).flat(), ...commonRadioPhrases,
    ...['rider', 'raider'].flatMap(w => Object.values(orders).flat().map(p => w + ' ' + p)),
    ...['rider', 'raider'].flatMap(w => commonRadioPhrases.map(p => w + ' ' + p)),
    ...['rider', 'raider'].flatMap(w => radioPrefixes.map(p => w + ' ' + p)),
    ...radioPrefixes])];

  class Bot {
    constructor(options) {
      this.o = options; this.native = options.native; this.enabled = false;
      this.generation = 0; this.busy = false; this.pending = null; this.deadline = 0; this.wakeUntil = 0;
      this.lastReply = ''; this.handles = []; this.starting = false;
    }
    status(text) { this.o.status(text); }
    async onboard(maxAgeMs = 15000) {
      const result = await this.o.getOnboard?.();
      if (!result?.available) return { ok: false, reason: result?.reason || 'SKATESUV no tiene datos de a bordo disponibles' };
      const age = Number(result.ageMs);
      if (!Number.isFinite(age) || age > maxAgeMs) return { ok: false, reason: 'No tengo datos recientes de SKATESUV' };
      let data = result.data;
      if (!data && result.json) {
        try { data = JSON.parse(result.json); } catch {}
      }
      return data ? { ok: true, data } : { ok: false, reason: 'No pude leer los datos de SKATESUV' };
    }
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
            this.overruns++;
            if (this.overruns === 8) this.status('Procesando audio…');
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
          this.native.audio({ pcm: btoa(binary) }).catch(() => {
            if (run === this.generation && this.enabled) this.status('Repite');
          }).finally(() => {
            this.inFlight = false;
            if (this.overruns) {
              const wasBusy = this.overruns >= 8;
              this.overruns = 0;
              if (wasBusy && this.enabled && !this.busy) this.status('Escuchando «Rider…»');
            }
          });
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
      this.pending = null; this.deadline = 0; this.wakeUntil = 0; clearTimeout(this.timer); this.o.toggle(false);
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
      let parsed = parse(raw);
      // «Rider» sigue siendo obligatorio. Se admite una pausa natural muy corta
      // después del wake word, sin respuesta hablada que pise la orden.
      const continuation = !parsed.wake && this.wakeUntil > Date.now();
      if (!parsed.wake && !continuation) return;
      if (continuation) parsed = parse('Rider ' + raw);
      this.busy = true; clearTimeout(this.timer);
      try {
        if (parsed.wake && !parsed.order) {
          this.wakeUntil = Date.now() + 1800;
          this.status('Te escucho…');
          return;
        }
        this.wakeUntil = 0;
        let id = parsed.id;
        if (this.pending) {
          const pending = this.pending; this.pending = null; this.deadline = 0;
          if (id === 'no') { await this.reply('Vale, cancelado', false); return; }
          if (id === 'yes') id = pending;
          else {
            this.pending = pending;
            await this.reply('Repite', false);
            if (run === this.generation) this.armWindow();
            return;
          }
        } else if ((id === 'leave' || id === 'emergency' || id === 'navigationStop' || id === 'recordStop') && this.o.confirmations()) {
          this.pending = id;
          const question = id === 'leave' ? '¿Quieres salir del grupo?' :
            id === 'emergency' ? '¿Confirmas activar la alerta local de emergencia?' :
            id === 'navigationStop' ? '¿Quieres detener la navegación?' :
            '¿Quieres finalizar la grabación de ruta?';
          await this.reply(question + ' Di Rider sí o Rider no', false);
          if (run === this.generation) this.armWindow(); return;
        }
        this.deadline = 0;
        switch (id) {
          case 'volumeUp': case 'volumeDown': {
            const value = Math.max(0, Math.min(1, Math.round((this.o.getVolume() + (id === 'volumeUp' ? .2 : -.2)) * 100) / 100));
            this.o.setVolume(value); await this.reply('Volumen al ' + Math.round(value * 100) + ' por ciento'); break;
          }
          case 'mute': this.o.setVolume(0); await this.reply('Listo, silencio'); break;
          case 'unmute': this.o.setVolume(1); await this.reply('Sonido listo'); break;
          case 'voxOn': case 'voxOff': await this.o.setVox(id === 'voxOn'); if (run !== this.generation) return; await this.reply(id === 'voxOn' ? 'Manos libres listo' : 'Manos libres desactivado'); break;
          case 'voiceOn': { const active = await this.o.startVoice(); if (run !== this.generation) return; await this.reply(active ? 'Rider Voz listo' : 'Primero añade un Rider al grupo'); break; }
          case 'voiceOff': this.o.stopVoice(); await this.reply('Rider Voz parado'); break;
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
          case 'speed': case 'tripDistance': case 'battery': case 'autonomy':
          case 'remainingDistance': case 'remainingTime': case 'eta': case 'nextInstruction':
          case 'rideSummary': case 'tripTime': case 'averageSpeed': case 'maxSpeed':
          case 'canReach': case 'navigationState': case 'repeatInstruction': case 'gpsState':
          case 'recordingState': {
            const onboard = await this.onboard(); if (run !== this.generation) return;
            if (!onboard.ok) { await this.reply(onboard.reason, false); break; }
            const d = onboard.data;
            const one = n => Math.round(Number(n) * 10) / 10;
            const spoken = n => String(one(n)).replace('.', ',');
            if (id === 'speed') {
              await this.reply('Vas a ' + Math.round(Number(d.speedKmh) || 0) + ' kilómetros por hora'); break;
            }
            if (id === 'tripDistance') {
              await this.reply('Llevas ' + spoken(Number(d.tripDistanceKm) || 0) + ' kilómetros'); break;
            }
            if (id === 'tripTime') {
              const seconds = Math.max(0, Math.round(Number(d.elapsedSeconds) || 0));
              const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60);
              await this.reply(hours ? 'Llevas ' + hours + ' horas y ' + minutes + ' minutos' : 'Llevas ' + minutes + ' minutos'); break;
            }
            if (id === 'averageSpeed') {
              await this.reply('Tu velocidad media es de ' + Math.round(Number(d.averageSpeedKmh) || 0) + ' kilómetros por hora'); break;
            }
            if (id === 'maxSpeed') {
              await this.reply('Tu velocidad máxima es de ' + Math.round(Number(d.maximumSpeedKmh) || 0) + ' kilómetros por hora'); break;
            }
            if (id === 'battery') {
              if (!d.bmsConnected || !Number.isFinite(Number(d.batteryPercent))) await this.reply('No veo la batería. Conecta el BMS en SKATESUV', false);
              else await this.reply('Te queda un ' + Math.round(Number(d.batteryPercent)) + ' por ciento');
              break;
            }
            if (id === 'autonomy') {
              if (!d.bmsConnected) await this.reply('No veo la batería. Conecta el BMS en SKATESUV', false);
              else if (!Number.isFinite(Number(d.rangeKm)) || Number(d.rangeKm) <= 0) await this.reply('Aún no tengo datos suficientes de autonomía', false);
              else await this.reply('Te quedan unos ' + Math.round(Number(d.rangeKm)) + ' kilómetros');
              break;
            }
            if (id === 'canReach') {
              const range = Number(d.rangeKm), remaining = Number(d.remainingDistanceKm);
              if (!d.navigationActive || !Number.isFinite(remaining)) await this.reply('Ahora mismo no llevas navegación', false);
              else if (!d.bmsConnected || !Number.isFinite(range) || range <= 0) await this.reply('Aún no tengo datos suficientes para calcularlo', false);
              else if (range >= remaining) await this.reply('Sí, con la estimación actual llegas. Te quedan unos ' + Math.round(range) + ' kilómetros y faltan ' + spoken(remaining));
              else await this.reply('Con la estimación actual no llegas. Te quedan unos ' + Math.round(range) + ' kilómetros y faltan ' + spoken(remaining));
              break;
            }
            if (id === 'navigationState') {
              await this.reply(d.navigationActive ? 'Sí, vas con navegación' : 'No, ahora mismo no llevas navegación'); break;
            }
            if (id === 'repeatInstruction') {
              if (!d.navigationActive || !d.nextInstruction) await this.reply('Ahora mismo no tengo ninguna indicación', false);
              else await this.reply(d.nextInstruction);
              break;
            }
            if (id === 'gpsState') {
              await this.reply(d.gpsAvailable ? 'GPS listo' : 'Ahora mismo no pillo GPS'); break;
            }
            if (id === 'recordingState') {
              await this.reply(d.recordingActive ? (d.recordingPaused ? 'La grabación está pausada' : 'Sí, estoy grabando la ruta') : 'No estás grabando ninguna ruta'); break;
            }
            if (id === 'remainingDistance') {
              if (!d.navigationActive || !Number.isFinite(Number(d.remainingDistanceKm))) await this.reply('Ahora mismo no llevas navegación', false);
              else await this.reply('Te quedan ' + spoken(d.remainingDistanceKm) + ' kilómetros para llegar');
              break;
            }
            if (id === 'remainingTime') {
              if (!d.navigationActive || !Number.isFinite(Number(d.remainingMinutes))) await this.reply('Ahora mismo no llevas navegación', false);
              else await this.reply('Te quedan aproximadamente ' + Math.round(Number(d.remainingMinutes)) + ' minutos');
              break;
            }
            if (id === 'eta') {
              if (!d.navigationActive || !Number.isFinite(Number(d.etaEpochMs))) await this.reply('Ahora mismo no llevas navegación', false);
              else {
                const date = new Date(Number(d.etaEpochMs));
                await this.reply('Llegas sobre las ' + date.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}));
              }
              break;
            }
            if (id === 'nextInstruction') {
              if (!d.navigationActive || !d.nextInstruction) await this.reply('Todavía no tengo la siguiente indicación', false);
              else {
                const meters = Number(d.nextInstructionDistanceMeters);
                await this.reply(Number.isFinite(meters) ? 'En ' + (meters < 1000 ? Math.max(10,Math.round(meters/10)*10) + ' metros, ' : spoken(meters/1000) + ' kilómetros, ') + d.nextInstruction : d.nextInstruction);
              }
              break;
            }
            const parts = [
              'Llevas ' + spoken(Number(d.tripDistanceKm) || 0) + ' kilómetros',
              'vas a ' + Math.round(Number(d.speedKmh) || 0) + ' kilómetros por hora'
            ];
            if (d.bmsConnected && Number.isFinite(Number(d.batteryPercent))) parts.push('te queda un ' + Math.round(Number(d.batteryPercent)) + ' por ciento de batería');
            if (d.navigationActive && Number.isFinite(Number(d.remainingDistanceKm))) parts.push('faltan ' + spoken(d.remainingDistanceKm) + ' kilómetros para llegar');
            await this.reply(parts.join(', '));
            break;
          }
          case 'timeNow': {
            const now = new Date();
            await this.reply('Son las ' + now.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})); break;
          }
          case 'phoneBattery': case 'internetState': case 'bluetoothState': {
            const d = await this.o.getDeviceStatus?.(); if (run !== this.generation) return;
            if (!d) { await this.reply('Ese dato no está disponible', false); break; }
            if (id === 'phoneBattery') {
              const value = Number(d.phoneBatteryPercent);
              await this.reply(Number.isFinite(value) && value >= 0 ? 'El móvil está al ' + Math.round(value) + ' por ciento' : 'No consigo leer la batería del móvil', false);
            } else if (id === 'internetState') {
              await this.reply(d.internet ? 'Sí, tienes Internet' : 'Ahora mismo no tienes Internet');
            } else {
              await this.reply(d.bluetooth ? 'Bluetooth listo' : 'Bluetooth apagado');
            }
            break;
          }
          case 'voiceState': await this.reply(this.o.isVoiceActive?.() ? 'Rider Voz está listo' : 'Rider Voz está parado'); break;
          case 'voxState': await this.reply(this.o.isVoxActive?.() ? 'Manos libres listo' : 'Manos libres apagado'); break;
          case 'useBluetooth': {
            const ok = await this.o.setAudioRoute?.('bluetooth'); if (run !== this.generation) return;
            await this.reply(ok === false ? 'No he podido poner el Bluetooth' : 'Listo, audio por Bluetooth'); break;
          }
          case 'useSpeaker': {
            const ok = await this.o.setAudioRoute?.('speaker'); if (run !== this.generation) return;
            await this.reply(ok === false ? 'No he podido poner el altavoz' : 'Listo, audio por altavoz'); break;
          }
          case 'navigationStart': case 'navigationPause': case 'navigationResume': case 'navigationStop':
          case 'recordStart': case 'recordPause': case 'recordResume': case 'recordStop': {
            const action = ({
              navigationStart:'navigation_start', navigationPause:'navigation_pause',
              navigationResume:'navigation_resume', navigationStop:'navigation_stop',
              recordStart:'record_start', recordPause:'record_pause',
              recordResume:'record_resume', recordStop:'record_stop'
            })[id];
            const result = await this.o.controlSkatesuv?.(action); if (run !== this.generation) return;
            const natural = {
              navigationStart:'Navegación en marcha', navigationPause:'Navegación pausada',
              navigationResume:'Seguimos', navigationStop:'Navegación parada',
              recordStart:'Grabando ruta', recordPause:'Grabación pausada',
              recordResume:'Seguimos grabando', recordStop:'Ruta guardada'
            }[id];
            await this.reply(result?.ok ? natural : (result?.message || 'No he podido hacerlo'), !!result?.ok);
            break;
          }
          case 'help': await this.reply('Marcha, navegación, batería, Riders, audio, conexiones y radio'); break;
          case 'radioPrompt': await this.reply('¿Cuál quieres?', false); break;
          case 'radioRock': case 'radioNamed': {
            const requested = id === 'radioRock' ? 'Rock FM' : parsed.station;
            try {
              const station = await this.o.playRadio?.(requested); if (run !== this.generation) return;
              if (!station?.ok && !station?.name) {
                await this.reply(station?.message || 'Esa no la pillo. Prueba otra', false);
              } else {
                await this.reply('Vale, pongo ' + (station.name || requested));
              }
            } catch {
              await this.reply('Esa no la pillo. Prueba otra', false);
            }
            break;
          }
          case 'radioStop': await this.o.stopRadio?.(); if (run !== this.generation) return; await this.reply('Radio fuera'); break;
          case 'repeat': await this.reply(this.lastReply || 'Todavía no tengo nada que repetir', false); break;
          case 'leave': await this.reply('Vale, salgo del grupo'); if (run === this.generation) this.o.leave(); break;
          case 'emergency': this.o.emergency(); await this.reply('Alerta local activada. No he avisado a ningún contacto'); break;
          default: await this.reply('Repite', false);
        }
      } finally { if (run === this.generation) this.busy = false; }
    }
  }
  const api = { parse, grammar, helpGroups, Bot, create: options => new Bot(options) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RiderCommands = api;
})(typeof window === 'undefined' ? globalThis : window);
