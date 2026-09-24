const SUPABASE_URL='https://hnjgfppzgqeobsavyzal.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_7GinSOXWplq3vLmtQmKMAw_xom0bg3A';
let supabase=null;

const app=document.querySelector('#app');
const MADRID={lat:40.4168,lng:-3.7038};
const SPAIN_BOUNDS=[[27.4,-18.7],[44.2,4.6]];
const state={mode:'nearby',me:{...MADRID},map:null,meMarker:null,radius:null,riderLayers:[],selected:null,riders:[]};

const fillerRiders=[
  {name:'Rider Madrid 01',city:'Madrid',lat:40.6500,lng:-4.0500},
  {name:'Rider Madrid 02',city:'Madrid',lat:40.1500,lng:-3.2000},
  {name:'Rider Norte',city:'Santander',lat:43.4623,lng:-3.8099},
  {name:'Rider Bilbao',city:'Bilbao',lat:43.2630,lng:-2.9350},
  {name:'Rider Barcelona',city:'Barcelona',lat:41.3874,lng:2.1686},
  {name:'Rider Valencia',city:'Valencia',lat:39.4699,lng:-0.3763},
  {name:'Rider Sevilla',city:'Sevilla',lat:37.3891,lng:-5.9845}
];

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function kmBetween(a,b){const R=6371,toRad=d=>d*Math.PI/180;const dLat=toRad(b.lat-a.lat),dLon=toRad(b.lng-a.lng);const x=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function timeAgo(iso){if(!iso)return 'Última conexión';const s=Math.max(0,Math.floor((Date.now()-new Date(iso).getTime())/1000));if(s<60)return 'Última conexión: hace un momento';if(s<3600)return `Última conexión: hace ${Math.floor(s/60)} min`;if(s<86400)return `Última conexión: hace ${Math.floor(s/3600)} h`;return `Última conexión: hace ${Math.floor(s/86400)} d`;}
function toast(msg){const old=document.querySelector('.toast');old?.remove();const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('show'));setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),250)},2200);}

function loadScript(src,timeout=7000){
  return new Promise((resolve,reject)=>{
    const el=document.createElement('script');
    const timer=setTimeout(()=>{el.remove();reject(new Error('Timeout '+src))},timeout);
    el.src=src;el.async=true;
    el.onload=()=>{clearTimeout(timer);resolve(true)};
    el.onerror=()=>{clearTimeout(timer);reject(new Error('No se pudo cargar '+src))};
    document.head.appendChild(el);
  });
}
function loadCss(href){
  if(document.querySelector('link[data-dynamic="'+href+'"]'))return;
  const el=document.createElement('link');el.rel='stylesheet';el.href=href;el.dataset.dynamic=href;document.head.appendChild(el);
}
async function loadMapDependency(){
  loadCss('vendor/leaflet.css');
  if(!window.L)await loadScript('vendor/leaflet.js',2500);
  return !!window.L;
}
async function loadBackendDependency(){
  if(!window.supabase)await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',4500);
  if(window.supabase?.createClient){
    try{supabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY)}catch{supabase=null}
  }
  return !!supabase;
}
function showStartupError(err){
  const map=document.querySelector('#map');
  if(map)map.innerHTML='<div class="mapFallback">COMUNIDAD RIDER<br><small>No se pudo iniciar el mapa. La app sigue operativa.</small></div>';
  console.error('Comunidad Rider startup error',err);
}

async function currentUser(){if(!supabase)return null;try{const {data}=await supabase.auth.getUser();return data?.user||null}catch{return null}}

async function fetchRealRiders(){
  if(!supabase)return [];
  try{
    const me=await currentUser();
    const [{data:profiles,error:pe},{data:presence},{data:locations}]=await Promise.all([
      supabase.from('profiles').select('id,alias,city,board,avatar_url').limit(100),
      supabase.from('presence').select('profile_id,is_online,last_seen').limit(100),
      supabase.from('shared_locations').select('profile_id,latitude,longitude,updated_at,expires_at').limit(100)
    ]);
    if(pe||!profiles)return [];
    const pmap=new Map((presence||[]).map(x=>[x.profile_id,x]));
    const lmap=new Map((locations||[]).map(x=>[x.profile_id,x]));
    return profiles.filter(p=>p.id!==me?.id).map(p=>{
      const pr=pmap.get(p.id)||{};const loc=lmap.get(p.id)||{};
      if(typeof loc.latitude!=='number'||typeof loc.longitude!=='number')return null;
      return {id:p.id,name:p.alias||'Rider',city:p.city||'España',board:p.board||'eSkate',avatar:p.avatar_url||'',lat:loc.latitude,lng:loc.longitude,online:!!pr.is_online,lastSeen:pr.last_seen||loc.updated_at||null,isDemo:false};
    }).filter(Boolean);
  }catch{return []}
}

function makeFiller(){
  return fillerRiders.map((r,i)=>({id:`demo-${i+1}`,name:r.name,city:r.city,board:'eSkate SUV',lat:r.lat,lng:r.lng,online:false,lastSeen:new Date(Date.now()-(i+1)*52*60*1000).toISOString(),isDemo:true}));
}

function buildShell(){
  app.innerHTML=`<main class="appShell">
    <header class="topbar"><button class="iconBtn" id="backBtn" aria-label="Volver">‹</button><div class="title"><span>COMUNIDAD</span> <b>RIDER</b></div><button class="iconBtn" id="settingsBtn" aria-label="Ajustes">⚙</button></header>
    <section class="hero"><img src="assets/community-approved.jpg" alt="Riders al atardecer"><div class="heroTextMask"></div><div class="heroCopy"><i></i><span>FORMA PARTE DE LA<br>COMUNIDAD SKATESUV</span></div></section>
    <section class="modeRow" aria-label="Zona del mapa">
      <button class="modeBtn active" id="nearBtn"><span class="modeIcon">⌖</span><strong>RIDERS EN MI ZONA</strong><small>radio 100 km</small></button>
      <button class="modeBtn" id="allBtn"><span class="modeIcon">◫</span><strong>EN TODAS LAS ZONAS</strong><small>mapa de España</small></button>
    </section>
    <section class="mapWrap"><div id="map"></div><div class="legend"><span><i class="legendDot greenDot"></i>Verde = conectado</span><span><i class="legendDot grayDot"></i>Gris = última conexión</span></div><button class="locateBtn" id="locateBtn" aria-label="Mi ubicación">⌖</button></section>
    <section class="riderCard hidden" id="riderCard"></section>
    <nav class="bottomNav"><button data-nav="inicio">⌂<span>INICIO</span></button><button data-nav="datos">▥<span>DATOS</span></button><button data-nav="mapa">●<span>MAPA</span></button><button class="active">♟<span>COMUNIDAD</span></button><button data-nav="ajustes">⚙<span>AJUSTES</span></button></nav>
    <div class="modal hidden" id="modal"></div>
  </main>`;
  document.querySelector('#nearBtn').onclick=()=>setMode('nearby');
  document.querySelector('#allBtn').onclick=()=>setMode('all');
  document.querySelector('#locateBtn').onclick=locateMe;
  document.querySelector('#settingsBtn').onclick=showPrivacy;
  document.querySelector('#backBtn').onclick=()=>toast('Volver a la pantalla anterior');
  document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>toast('Esta sección pertenece a la app principal'));
}

function initMap(){
  if(!window.L){document.querySelector('#map').innerHTML='<div class="mapFallback">MAPA SATÉLITE<br><small>Necesita conexión a internet</small></div>';return;}
  state.map=L.map('map',{zoomControl:false,attributionControl:true}).setView([state.me.lat,state.me.lng],9);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri'}).addTo(state.map);
  L.control.zoom({position:'bottomright'}).addTo(state.map);
  state.meMarker=L.circleMarker([state.me.lat,state.me.lng],{radius:8,color:'#d9fff0',weight:2,fillColor:'#13ef7d',fillOpacity:1}).addTo(state.map).bindTooltip('Tú');
  redrawMap();
}

function riderIcon(r){
  const cls=r.online?'online':'offline';
  const letter=esc((r.name||'R').trim().charAt(0).toUpperCase());
  return L.divIcon({className:'',html:`<button class="riderPin ${cls}" aria-label="${esc(r.name)}"><span>${letter}</span></button>`,iconSize:[42,48],iconAnchor:[21,44]});
}

function redrawMap(){
  if(!state.map)return;
  state.riderLayers.forEach(x=>state.map.removeLayer(x));state.riderLayers=[];
  if(state.radius){state.map.removeLayer(state.radius);state.radius=null;}
  if(state.meMarker){state.meMarker.setLatLng([state.me.lat,state.me.lng]);}
  const shown=state.mode==='nearby'?state.riders.filter(r=>kmBetween(state.me,r)<=100):state.riders;
  shown.forEach(r=>{const m=L.marker([r.lat,r.lng],{icon:riderIcon(r)}).addTo(state.map);m.on('click',()=>selectRider(r));state.riderLayers.push(m)});
  if(state.mode==='nearby'){
    state.radius=L.circle([state.me.lat,state.me.lng],{radius:100000,color:'#16ef7f',weight:1.5,opacity:.85,fillColor:'#16ef7f',fillOpacity:.07}).addTo(state.map);
    state.map.setView([state.me.lat,state.me.lng],8);
  }else{
    state.map.invalidateSize();
    state.map.fitBounds([[36.0,-9.7],[43.9,3.4]],{padding:[18,18],animate:false});
    setTimeout(()=>{state.map?.invalidateSize();state.map?.fitBounds([[36.0,-9.7],[43.9,3.4]],{padding:[18,18],animate:false});},120);
  }
}

function setMode(mode){
  state.mode=mode;
  document.querySelector('#nearBtn').classList.toggle('active',mode==='nearby');
  document.querySelector('#allBtn').classList.toggle('active',mode==='all');
  redrawMap();
  const shown=mode==='nearby'?state.riders.filter(r=>kmBetween(state.me,r)<=100):state.riders;
  if(shown.length)selectRider(shown[0]);
}

function selectRider(r){
  state.selected=r;
  const dist=kmBetween(state.me,r).toFixed(1);
  const card=document.querySelector('#riderCard');
  card.classList.remove('hidden');
  const common=r.isDemo?3:8;
  card.innerHTML=`<div class="drag"></div>
    <button class="closeCard" id="closeCard">×</button>
    <div class="riderTop">
      <div class="avatar ${r.online?'onlineRing':'grayRing'}"><span class="avatarHelmet">R</span><i class="presenceDot ${r.online?'on':'off'}"></i></div>
      <div class="riderMeta">
        <h2>${esc(r.name)}</h2>
        <p>⌖ ${esc(r.city)} · A ${dist} km</p>
      </div>
      <div class="riderSide">
        <strong class="${r.online?'statusOn':'statusOff'}">● ${r.online?'Conectado':'Última conexión'}</strong>
        <small>♟ ${common} rutas en común</small>
      </div>
    </div>
    <div class="cardActions">
      <button id="messageBtn">💬 <span>Mensaje</span></button>
      <button id="callBtn">☎ <span>Hablar</span></button>
      <button class="invite" id="inviteBtn">♟ <span>Invitar</span></button>
    </div>`;
  document.querySelector('#closeCard').onclick=()=>card.classList.add('hidden');
  document.querySelector('#messageBtn').onclick=()=>openChat(r);
  document.querySelector('#callBtn').onclick=()=>openVoiceRider(r);
  document.querySelector('#inviteBtn').onclick=()=>toast(`Invitación preparada para ${r.name}`);
}

async function openChat(r){
  const modal=document.querySelector('#modal');modal.classList.remove('hidden');
  modal.innerHTML=`<section class="sheet"><header><button id="closeModal">‹</button><div><small>CHAT PRIVADO</small><h2>${esc(r.name)}</h2></div></header><div class="chatList" id="chatList"><p class="empty">Cargando mensajes…</p></div><div class="quickRow"><button id="quickTalk">¿Quieres que hablemos?</button><button class="voiceJump" id="voiceJump">IR A VOZ RIDER</button></div><div class="composer"><input id="chatInput" maxlength="1000" placeholder="Escribe un mensaje..."><button id="sendBtn">➤</button></div></section>`;
  document.querySelector('#closeModal').onclick=()=>modal.classList.add('hidden');
  document.querySelector('#voiceJump').onclick=()=>openVoiceRider(r);
  document.querySelector('#quickTalk').onclick=()=>sendChatText(r,'¿Quieres que hablemos?');
  document.querySelector('#sendBtn').onclick=()=>{const i=document.querySelector('#chatInput');const t=i.value.trim();if(t){i.value='';sendChatText(r,t)}};
  document.querySelector('#chatInput').onkeydown=e=>{if(e.key==='Enter')document.querySelector('#sendBtn').click()};
  renderMessages(r,await loadMessages(r));
}

function localKey(r){return `cr_chat_${r.id}`;}
function loadLocal(r){try{return JSON.parse(localStorage.getItem(localKey(r))||'[]')}catch{return []}}
function saveLocal(r,list){localStorage.setItem(localKey(r),JSON.stringify(list.slice(-100)));}
async function loadMessages(r){
  if(!supabase||r.isDemo)return loadLocal(r);
  const me=await currentUser();if(!me)return loadLocal(r);
  try{const {data,error}=await supabase.from('direct_messages').select('*').or(`and(sender_id.eq.${me.id},receiver_id.eq.${r.id}),and(sender_id.eq.${r.id},receiver_id.eq.${me.id})`).order('created_at',{ascending:true}).limit(100);if(error)throw error;return (data||[]).map(m=>({text:m.body,from:m.sender_id===me.id?'me':'them',at:m.created_at}));}catch{return loadLocal(r)}
}
async function sendChatText(r,text){
  const list=loadLocal(r);list.push({text,from:'me',at:new Date().toISOString()});saveLocal(r,list);renderMessages(r,list);
  if(supabase&&!r.isDemo){const me=await currentUser();if(me){try{await supabase.from('direct_messages').insert({sender_id:me.id,receiver_id:r.id,body:text})}catch{}}}
}
function renderMessages(r,list){const el=document.querySelector('#chatList');if(!el)return;el.innerHTML=list.length?list.map(m=>`<div class="bubble ${m.from==='me'?'me':'them'}">${esc(m.text)}</div>`).join(''):'<p class="empty">Todavía no hay mensajes. Saluda 👋</p>';el.scrollTop=el.scrollHeight;}

function openVoiceRider(r){
  toast(`Abriendo Voz Rider para hablar con ${r.name}`);
  setTimeout(()=>{window.location.href='eskatesuv://voz-rider';},250);
}

function showPrivacy(){
  const modal=document.querySelector('#modal');modal.classList.remove('hidden');modal.innerHTML=`<section class="sheet privacySheet"><header><button id="closeModal">‹</button><div><small>COMUNIDAD RIDER</small><h2>Privacidad</h2></div></header><div class="privacyCard"><h3>Tu ubicación, bajo tu control</h3><p>Solo se usa para mostrar riders de tu zona y para que tú puedas aparecer si lo autorizas.</p><label><input type="checkbox" id="shareLocation" checked> Permitir ubicación para Comunidad Rider</label><label><input type="checkbox" id="showApprox" checked> Mostrar distancia aproximada</label></div><button class="primaryFull" id="savePrivacy">GUARDAR</button></section>`;document.querySelector('#closeModal').onclick=()=>modal.classList.add('hidden');document.querySelector('#savePrivacy').onclick=()=>{modal.classList.add('hidden');toast('Privacidad guardada')};
}

function locateMe(){
  if(!navigator.geolocation){toast('Ubicación no disponible');return;}
  navigator.geolocation.getCurrentPosition(p=>{state.me={lat:p.coords.latitude,lng:p.coords.longitude};redrawMap();toast('Ubicación actualizada')},()=>toast('No se ha podido obtener tu ubicación'),{enableHighAccuracy:true,timeout:8000,maximumAge:30000});
}

async function refreshRealRiders(){
  try{
    await loadBackendDependency();
    const real=await fetchRealRiders();
    const demos=makeFiller();
    state.riders=[...real,...demos];
    redrawMap();
  }catch{}
}
async function boot(){
  state.riders=makeFiller();
  buildShell();
  if(state.riders.length) selectRider(state.riders[0]);
  try{
    await loadMapDependency();
    initMap();
  }catch(err){
    showStartupError(err);
  }
  if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>{state.me={lat:p.coords.latitude,lng:p.coords.longitude};redrawMap();},()=>{}, {enableHighAccuracy:false,timeout:5000,maximumAge:120000});
  refreshRealRiders();
}
boot().catch(showStartupError);
