const SUPABASE_URL='https://hnjgfppzgqeobsavyzal.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_7GinSOXWplq3vLmtQmKMAw_xom0bg3A';
const supabase=window.supabase?.createClient?.(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY)||null;

const app=document.querySelector('#app');
const MADRID={lat:40.4168,lng:-3.7038};
const SPAIN_BOUNDS=[[27.4,-18.7],[44.2,4.6]];
const state={mode:'nearby',me:{...MADRID},map:null,meMarker:null,radius:null,riderLayers:[],selected:null,riders:[]};

const fillerNames=['Rider Norte','Rider Sierra','Rider Oeste','Rider Sur','Rider Centro','Rider Este'];
const fillerOffsets=[[0.42,-0.31],[0.16,0.56],[-0.34,-0.49],[-0.51,0.24],[0.08,-0.22],[0.31,0.18]];

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function kmBetween(a,b){const R=6371,toRad=d=>d*Math.PI/180;const dLat=toRad(b.lat-a.lat),dLon=toRad(b.lng-a.lng);const x=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function timeAgo(iso){if(!iso)return 'Última conexión';const s=Math.max(0,Math.floor((Date.now()-new Date(iso).getTime())/1000));if(s<60)return 'Última conexión: hace un momento';if(s<3600)return `Última conexión: hace ${Math.floor(s/60)} min`;if(s<86400)return `Última conexión: hace ${Math.floor(s/3600)} h`;return `Última conexión: hace ${Math.floor(s/86400)} d`;}
function toast(msg){const old=document.querySelector('.toast');old?.remove();const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('show'));setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),250)},2200);}

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
  return fillerNames.map((name,i)=>({id:`demo-${i+1}`,name,city:'Rider de muestra',board:'eSkate SUV',lat:state.me.lat+fillerOffsets[i][0],lng:state.me.lng+fillerOffsets[i][1],online:false,lastSeen:new Date(Date.now()-(i+1)*45*60*1000).toISOString(),isDemo:true}));
}

function buildShell(){
  app.innerHTML=`<main class="appShell">
    <header class="topbar"><button class="iconBtn" id="backBtn" aria-label="Volver">‹</button><div class="title"><span>COMUNIDAD</span> <b>RIDER</b></div><button class="iconBtn" id="settingsBtn" aria-label="Ajustes">⚙</button></header>
    <section class="hero"><img src="assets/community-hero.jpg" alt="Riders al atardecer"><div class="heroShade"></div><div class="heroCopy">CONECTA, RUEDA<br>Y FORMA PARTE<br>DE ALGO MÁS GRANDE.<i></i></div></section>
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
  }else state.map.fitBounds(SPAIN_BOUNDS,{padding:[12,12]});
}

function setMode(mode){state.mode=mode;document.querySelector('#nearBtn').classList.toggle('active',mode==='nearby');document.querySelector('#allBtn').classList.toggle('active',mode==='all');document.querySelector('#riderCard').classList.add('hidden');redrawMap();}

function selectRider(r){state.selected=r;const dist=kmBetween(state.me,r).toFixed(1);const card=document.querySelector('#riderCard');card.classList.remove('hidden');card.innerHTML=`<div class="drag"></div><button class="closeCard" id="closeCard">×</button><div class="riderTop"><div class="avatar ${r.online?'onlineRing':'grayRing'}">${esc(r.name.charAt(0).toUpperCase())}</div><div class="riderMeta"><h2>${esc(r.name)}</h2><p>${esc(r.city)} · A ${dist} km</p><small class="${r.online?'statusOn':'statusOff'}">● ${r.online?'Conectado':timeAgo(r.lastSeen)}</small>${r.isDemo?'<em>Rider de muestra</em>':''}</div></div><div class="cardActions"><button id="messageBtn" ${r.isDemo?'disabled':''}>💬 <span>Mensaje</span></button><button class="invite" id="inviteBtn" ${r.isDemo?'disabled':''}>＋ <span>Invitar</span></button></div>`;
  document.querySelector('#closeCard').onclick=()=>card.classList.add('hidden');
  document.querySelector('#messageBtn').onclick=()=>openChat(r);
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
  navigator.geolocation.getCurrentPosition(p=>{state.me={lat:p.coords.latitude,lng:p.coords.longitude};const fillers=state.riders.filter(r=>r.isDemo);fillers.forEach((r,i)=>{r.lat=state.me.lat+fillerOffsets[i][0];r.lng=state.me.lng+fillerOffsets[i][1]});redrawMap();toast('Ubicación actualizada')},()=>toast('No se ha podido obtener tu ubicación'),{enableHighAccuracy:true,timeout:8000,maximumAge:30000});
}

async function boot(){
  buildShell();
  const real=await fetchRealRiders();
  state.riders=[...real];
  if(real.length<6)state.riders.push(...makeFiller().slice(0,6-real.length));
  initMap();
  if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>{state.me={lat:p.coords.latitude,lng:p.coords.longitude};const fillers=state.riders.filter(r=>r.isDemo);fillers.forEach((r,i)=>{r.lat=state.me.lat+fillerOffsets[i][0];r.lng=state.me.lng+fillerOffsets[i][1]});redrawMap();},()=>{}, {enableHighAccuracy:false,timeout:5000,maximumAge:120000});
}

boot();
