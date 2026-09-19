const SUPABASE_URL='https://hnjgfppzgqeobsavyzal.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_7GinSOXWplq3vLmtQmKMAw_xom0bg3A';
const supabaseClient=(window.supabase&&window.supabase.createClient)?window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},global:{fetch:window.fetch.bind(window)}}):null;
async function supabaseStatus(){
  if(!supabaseClient)return {ok:false,text:'Supabase no disponible'};
  try{
    const {error}=await supabaseClient.from('profiles').select('id',{head:true,count:'exact'}).limit(1);
    return error?{ok:false,text:'Backend pendiente'}:{ok:true,text:'Backend conectado'};
  }catch{return {ok:false,text:'Sin conexión al backend'}}
}
const app=document.querySelector('#app');
const state={locationConsent:localStorage.getItem('cr_location_consent')==='yes',locationSharing:localStorage.getItem('cr_location_sharing')==='yes'};
const KEY='comunidad_rider_v1';
function dbLoad(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}}
function dbSave(db){localStorage.setItem(KEY,JSON.stringify(db))}
async function currentUserId(){
  if(!supabaseClient)return null;
  try{const {data}=await supabaseClient.auth.getUser();return data?.user?.id||null}catch{return null}
}
async function fetchMessages(riderId){
  const me=await currentUserId();
  if(!supabaseClient||!me)return null;
  try{
    const {data,error}=await supabaseClient.from('messages').select('*')
      .or(`and(sender_id.eq.${me},receiver_id.eq.${riderId}),and(sender_id.eq.${riderId},receiver_id.eq.${me})`)
      .order('created_at',{ascending:true}).limit(100);
    if(error)return null;
    return data||[];
  }catch{return null}
}
async function sendRemoteMessage(riderId,text){
  const me=await currentUserId();
  if(!supabaseClient||!me)return false;
  try{
    const {error}=await supabaseClient.from('messages').insert({sender_id:me,receiver_id:riderId,body:text});
    return !error;
  }catch{return false}
}
async function flushPendingMessages(riderId){
  const pending=savedMessages(riderId).filter(m=>m.pending);
  if(!pending.length)return 0;
  let sentCount=0;
  for(const msg of pending){const sent=await sendRemoteMessage(riderId,msg.text);if(!sent)break;msg.pending=false;sentCount++}
  const db=dbLoad();if(db.messages?.[riderId]){db.messages[riderId]=db.messages[riderId].filter(m=>m.pending!==false);dbSave(db)}
  return sentCount;
}
function savedMessages(id){return (dbLoad().messages||{})[id]||[]}
function saveMessage(id,text){const db=dbLoad();db.messages=db.messages||{};db.messages[id]=db.messages[id]||[];db.messages[id].push({text,from:'me',at:new Date().toISOString(),pending:true});dbSave(db)}
function clearSyncedLocalMessages(id,remoteHistory){const db=dbLoad();const list=db.messages?.[id];if(!list?.length)return;const remaining=list.filter(l=>!remoteHistory.some(m=>m.from===l.from&&m.text===l.text));if(remaining.length===list.length)return;db.messages[id]=remaining;dbSave(db)}
function isFavorite(id){return (dbLoad().favoriteRoutes||[]).includes(id)}
function toggleFavorite(id){const db=dbLoad();db.favoriteRoutes=db.favoriteRoutes||[];const i=db.favoriteRoutes.indexOf(id);i<0?db.favoriteRoutes.push(id):db.favoriteRoutes.splice(i,1);dbSave(db);return db.favoriteRoutes.includes(id)}
function joinedChallenge(id){return (dbLoad().joinedChallenges||[]).includes(id)}
function joinChallenge(id){const db=dbLoad();db.joinedChallenges=db.joinedChallenges||[];if(!db.joinedChallenges.includes(id))db.joinedChallenges.push(id);dbSave(db)}
function saveState(){localStorage.setItem('cr_location_consent',state.locationConsent?'yes':'no');localStorage.setItem('cr_location_sharing',state.locationSharing?'yes':'no')}
function requestLocation(done){if(!navigator.geolocation){done&&done(null);return}navigator.geolocation.getCurrentPosition(p=>done&&done({lat:p.coords.latitude,lng:p.coords.longitude}),()=>done&&done(null),{enableHighAccuracy:true,timeout:8000,maximumAge:30000})}
async function fetchCommunityRiders(){
  if(!supabaseClient)return riders;
  try{
    const {data,error}=await supabaseClient.from('profiles').select('*').limit(50);
    if(error||!data||!data.length)return riders;
    const real=data.map((p,i)=>({
      id:p.id,name:p.alias||p.name||'Rider',city:p.city||'',
      status:p.is_active?'Activo ahora':'Fuera de cobertura',
      state:p.is_active?'green':'red',
      left:(20+(i*17)%65)+'%',top:(25+(i*13)%55)+'%',
      bio:p.bio||'Sin descripción.'
    }));
    const ids=new Set(real.map(r=>String(r.id)));return real.concat(riders.filter(r=>!ids.has(String(r.id))));
  }catch{return riders}
}
async function fetchSharedRoutes(){
  if(!supabaseClient)return routes;
  try{
    const {data,error}=await supabaseClient.from('routes').select('*').limit(50);
    if(error||!data||!data.length)return routes;
    return data.map((r,i)=>({id:r.id,name:r.name||'Ruta Rider',city:r.city||'',km:String(r.distance_km??r.km??'—'),time:r.duration||'—',level:r.level||'—',author:r.author_name||'Rider',likes:r.likes||0}));
  }catch{return routes}
}
async function fetchChallenges(){
  if(!supabaseClient)return challengeData;
  try{
    const {data,error}=await supabaseClient.from('challenges').select('*').limit(50);
    if(error||!data||!data.length)return challengeData;
    return data.map((x,i)=>({id:x.id,name:x.name||'Reto',desc:x.description||'',progress:0,target:Number(x.target)||1,unit:x.metric==='elevation_m'?'m':x.metric==='distance_km'?'km':'puntos'}));
  }catch{return challengeData}
}
const riders=[
{id:'offline-luna',name:'LunaRoad',city:'Madrid',status:'Fuera de cobertura',state:'red',left:'47%',top:'37%',bio:'Madrid · Rider de la comunidad.'},
{id:'offline-nomad',name:'SkateNomad',city:'Madrid',status:'Fuera de cobertura',state:'red',left:'54%',top:'42%',bio:'Madrid · Rider de la comunidad.'},
{id:'offline-volt',name:'VoltRider',city:'Madrid',status:'Fuera de cobertura',state:'red',left:'43%',top:'48%',bio:'Madrid · Rider de la comunidad.'},
{id:'offline-north',name:'NorthLine',city:'Madrid',status:'Fuera de cobertura',state:'red',left:'59%',top:'34%',bio:'Madrid · Rider de la comunidad.'},
{id:'offline-urban',name:'UrbanFlow',city:'Madrid',status:'Fuera de cobertura',state:'red',left:'38%',top:'41%',bio:'Madrid · Rider de la comunidad.'},
{id:'offline-ruta',name:'RutaLibre',city:'Madrid',status:'Fuera de cobertura',state:'red',left:'62%',top:'49%',bio:'Madrid · Rider de la comunidad.'},
{id:'offline-zero',name:'ZeroNoise',city:'Madrid',status:'Fuera de cobertura',state:'red',left:'49%',top:'55%',bio:'Madrid · Rider de la comunidad.'},
{id:'offline-sierra',name:'SierraRide',city:'Madrid',status:'Fuera de cobertura',state:'red',left:'34%',top:'53%',bio:'Madrid · Rider de la comunidad.'}
];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function shell(body){app.innerHTML='<section class="phone">'+body+'</section>'}
function topbar(label,back){return '<div class="appTop"><div class="miniBrand"><b>eSKATE SUV</b><span>COMUNIDAD</span></div>'+(back?'<button class="backBtn" id="back" aria-label="Volver">‹</button>':'')+'</div>'+(label?'<div class="screenLabel">'+label+'</div>':'')}
async function getSession(){
  if(!supabaseClient)return null;
  try{const {data}=await supabaseClient.auth.getSession();return data?.session||null}catch{return null}
}
function authScreen(){
  shell(`<div class="authBrand"><b>eSKATE SUV</b><span>COMUNIDAD</span></div><div class="authIntro"><small>BIENVENIDO RIDER</small><h1>Acceso Rider</h1><p>Tu comunidad, tus rutas y tu gente.</p></div><div class="authTabs"><button class="mini" id="showLogin">Entrar</button><button class="mini" id="showSignup">Crear cuenta</button></div><div id="authFields"></div><p class="sub center" id="authMsg"></p>`);
  const fields=document.querySelector('#authFields'),msg=document.querySelector('#authMsg');
  function loginForm(){
    fields.innerHTML=`<label class="field">Email<input id="authEmail" type="email" autocomplete="email" placeholder="tu@email.com"></label><label class="field">Contraseña<div class="passwordWrap"><input id="authPass" type="password" autocomplete="current-password" minlength="6" placeholder="Tu contraseña"><button type="button" class="eyeBtn" data-eye="authPass" aria-label="Mostrar contraseña"></button></div></label><button class="btn" id="login">Entrar</button>`;
    document.querySelectorAll('.eyeBtn').forEach(b=>b.onclick=()=>{const i=document.getElementById(b.dataset.eye);i.type=i.type==='password'?'text':'password';b.classList.toggle('showing',i.type==='text');b.setAttribute('aria-label',i.type==='password'?'Mostrar contraseña':'Ocultar contraseña')});document.querySelector('#login').onclick=async()=>{const email=document.querySelector('#authEmail').value.trim(),password=document.querySelector('#authPass').value;if(!email||!password){msg.textContent='Completa email y contraseña.';return}msg.textContent='Entrando…';try{const {error}=await supabaseClient.auth.signInWithPassword({email,password});if(error){msg.textContent=error.message==='Failed to fetch'?'No hay conexión con el servidor.':error.message;return}await ensureProfile();home()}catch(e){msg.textContent='No se pudo conectar. Revisa la conexión e inténtalo de nuevo.'}};
  }
  function signupForm(){
    fields.innerHTML=`<label class="field">Seudónimo Rider<input id="authAlias" autocomplete="nickname" maxlength="24" placeholder="Tu nombre en la comunidad"></label><label class="field">Email<input id="authEmail" type="email" autocomplete="email" placeholder="tu@email.com"></label><label class="field">Contraseña<div class="passwordWrap"><input id="authPass" type="password" autocomplete="new-password" minlength="6" placeholder="Mínimo 6 caracteres"><button type="button" class="eyeBtn" data-eye="authPass" aria-label="Mostrar contraseña"></button></div></label><label class="field">Verificar contraseña<div class="passwordWrap"><input id="authPass2" type="password" autocomplete="new-password" minlength="6" placeholder="Repite la contraseña"><button type="button" class="eyeBtn" data-eye="authPass2" aria-label="Mostrar contraseña"></button></div></label><button class="btn" id="signup">Crear cuenta</button>`;
    document.querySelectorAll('.eyeBtn').forEach(b=>b.onclick=()=>{const i=document.getElementById(b.dataset.eye);i.type=i.type==='password'?'text':'password';b.classList.toggle('showing',i.type==='text');b.setAttribute('aria-label',i.type==='password'?'Mostrar contraseña':'Ocultar contraseña')});document.querySelector('#signup').onclick=async()=>{const nick=document.querySelector('#authAlias').value.trim(),email=document.querySelector('#authEmail').value.trim(),password=document.querySelector('#authPass').value,password2=document.querySelector('#authPass2').value;if(nick.length<3){msg.textContent='El seudónimo debe tener al menos 3 caracteres.';return}if(!email){msg.textContent='Introduce tu email.';return}if(password.length<6){msg.textContent='La contraseña debe tener al menos 6 caracteres.';return}if(password!==password2){msg.textContent='Las contraseñas no coinciden.';return}msg.textContent='Creando cuenta…';try{const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{alias:nick}}});if(error){msg.textContent=error.message==='Failed to fetch'?'No hay conexión con el servidor.':error.message;return}if(data&&data.session){await ensureProfile();home();return}msg.textContent='Cuenta creada. Revisa tu email para activar el acceso.'}catch(e){msg.textContent='No se pudo conectar. Revisa la conexión e inténtalo de nuevo.'}};
  }
  document.querySelector('#showLogin').onclick=()=>{msg.textContent='';loginForm()};
  document.querySelector('#showSignup').onclick=()=>{msg.textContent='';signupForm()};
  signupForm();
}
async function ensureProfile(){
  const uid=await currentUserId();if(!uid||!supabaseClient)return;
  try{
    const {data:userData}=await supabaseClient.auth.getUser();
    const alias=userData?.user?.user_metadata?.alias||'Rider';
    const {data}=await supabaseClient.from('profiles').select('id,alias').eq('id',uid).maybeSingle();
    if(!data)await supabaseClient.from('profiles').insert({id:uid,alias});
    else if((!data.alias||data.alias==='Rider')&&alias!=='Rider')await supabaseClient.from('profiles').update({alias}).eq('id',uid);
  }catch{}
}
async function signOutRider(){
  if(!supabaseClient)return;
  try{await supabaseClient.auth.signOut()}catch{}
  authScreen();
}
async function accountScreen(){
  const uid=await currentUserId();
  if(!uid||!supabaseClient){authScreen();return}
  let user=null,profile=null;
  try{
    const {data:u}=await supabaseClient.auth.getUser();user=u?.user||null;
    const {data:p}=await supabaseClient.from('profiles').select('*').eq('id',uid).maybeSingle();profile=p||null;
  }catch{}
  const alias=profile?.alias||user?.user_metadata?.alias||'Rider';
  const initial=esc(alias.slice(0,1).toUpperCase());
  shell(`${topbar('MI CUENTA RIDER',true)}<div class="accountHero"><span class="profileMark profileMarkBig">${initial}</span><div><small>SESIÓN ACTIVA</small><h1>${esc(alias)}</h1></div></div><div class="card accountData"><small>SEUDÓNIMO</small><strong>${esc(alias)}</strong></div><div class="card accountData"><small>CORREO</small><strong>${esc(user?.email||'')}</strong></div><button class="btn secondary dangerBtn" id="logout">Cerrar sesión</button>`);
  document.querySelector('#back').onclick=home;
  document.querySelector('#logout').onclick=signOutRider;
}

async function boot(){
  if(!supabaseClient){home();return}
  const session=await getSession();
  if(!session){authScreen();return}
  await ensureProfile();home();
}
function home(){const p=dbLoad().profile||{};const initial=esc((p.alias||'R').slice(0,1).toUpperCase());const alias=esc(p.alias||'Rider');shell(`<div class="communityHeader"><div class="brandLogo"><strong>eSKATE SUV</strong><span>COMUNIDAD</span></div><button class="accountBtn profileBubble" id="account" aria-label="Mi cuenta"><span>${initial}</span></button></div><p class="communityTag">RIDERS · RUTAS · EXPERIENCIAS</p><div class="communityGrid">${[['voice','RIDER VOZ','Conexión Rider'],['nearby','RIDERS EN MI ZONA','Comunidad cercana'],['routes','RUTAS COMPARTIDAS','Rutas de la comunidad'],['challenges','RETOS','Desafíos Rider']].map((x,i)=>`<button class="menuCard heroCard hero-${x[0]}" data-menu="${i}"><span class="heroVisual"></span><span class="heroCopy"><strong>${x[1]}</strong><small>${x[2]}</small></span><span class="heroArrow">›</span></button>`).join('')}</div><button class="profileStrip" data-menu="4"><span class="profileMark">${initial}</span><span><strong>${alias}</strong><small>Mi perfil Rider · Privacidad</small></span><b>›</b></button>`);
document.querySelector('[data-menu="0"]').onclick=riderVoice;document.querySelector('[data-menu="1"]').onclick=consent;document.querySelector('[data-menu="2"]').onclick=sharedRoutes;document.querySelector('[data-menu="3"]').onclick=challenges;document.querySelector('[data-menu="4"]').onclick=myProfile;
const account=document.querySelector('#account');if(account){account.title=alias;account.onclick=accountScreen}
}
function consent(){if(state.locationConsent&&state.locationSharing){map();return}shell(`${topbar('RIDERS EN MI ZONA',true)}<div class="screenHero privacyHero"><div><small>ANTES DE APARECER EN EL MAPA</small><h1>Privacidad primero</h1><p>Tú controlas cuándo compartes tu ubicación.</p></div></div><div class="card"><div class="row"><div><h3>Compartir mi ubicación</h3><p>Activa esta opción para aparecer en la comunidad. Puedes desactivarla cuando quieras.</p></div><button class="switch" id="sw" aria-label="Compartir ubicación"><span class="knob"></span></button></div><div id="consent" class="hidden"><p class="sub">Tu ubicación se utiliza para mostrarte en el mapa. La última ubicación podrá mostrarse temporalmente cuando dejes de estar activo.</p><button class="btn" id="accept">ACEPTO Y ACTIVAR</button></div></div><button class="btn secondary" id="back">Volver</button>`);
const sw=document.querySelector('#sw'), box=document.querySelector('#consent');
sw.onclick=()=>{sw.classList.add('on');box.classList.remove('hidden')};document.querySelector('#accept').onclick=()=>{state.locationConsent=true;state.locationSharing=true;saveState();requestLocation(()=>map())};document.querySelector('#back').onclick=home}
async function map(){
  const liveRiders=await fetchCommunityRiders();
  window.communityRiders=liveRiders;
  const activeCount=liveRiders.filter(r=>r.state==='green').length;
  shell(`${topbar('RIDERS EN MI ZONA',true)}<div class="mapToolbar"><div><small>COMUNIDAD CERCANA</small><h1>Riders en mi zona</h1></div><button class="mapPrivacy" id="privacy" aria-label="Privacidad"><span class="privacyGlyph"></span></button></div><div class="mapLegend"><span><i class="legendDot green"></i>Activo${activeCount?' · '+activeCount:''}</span><span><i class="legendDot red"></i>Fuera de cobertura</span><span><i class="legendDot cyan"></i>Tú</span></div><div class="riderMap"><div class="mapRoad roadA"></div><div class="mapRoad roadB"></div><div class="mapRoad roadC"></div>${liveRiders.map(r=>`<button aria-label="${esc(r.name)}" class="riderPin ${r.state}" data-rider="${r.id}" style="left:${r.left};top:${r.top}"><span>${esc((r.name||'R').slice(0,1).toUpperCase())}</span></button>`).join('')}<i class="riderPin cyan mePin" style="left:52%;top:56%"><span>TÚ</span></i><div class="mapFocus"></div></div><div class="mapFooter"><span class="mapLiveState"><i></i>${activeCount?activeCount+' Rider'+(activeCount===1?'':'s')+' conectado'+(activeCount===1?'':'s'):'Sin Riders conectados ahora'}</span><span class="mapHint">Toca un Rider para ver su perfil</span></div>`);
  document.querySelector('#back').onclick=home;
  document.querySelector('#privacy').onclick=privacy;
  document.querySelectorAll('[data-rider]').forEach(b=>b.onclick=()=>profile(b.dataset.rider));
}
function profile(id){
  const pool=window.communityRiders||riders;
  const r=pool.find(x=>String(x.id)===String(id))||riders.find(x=>String(x.id)===String(id));
  if(!r){map();return}
  const online=r.state==='green';
  const city=esc(r.city||'—'),bio=esc(r.bio||'Rider de la comunidad eSKATE SUV.');
  shell(`${topbar('PERFIL RIDER',true)}<div class="riderCover communityProfileCover"><div class="riderAvatar userAvatar" title="Foto de perfil del Rider"><div class="avatarPortrait avatar-${String(r.id).replace(/[^a-z0-9-]/gi,'').toLowerCase()}"><span>${esc((r.name||'R').slice(0,1).toUpperCase())}</span></div></div></div><div class="riderIdentity"><div><small>RIDER</small><h1>${esc(r.name)}</h1><p class="${online?'online':'offline'}">● ${online?'En línea':'Fuera de cobertura'}</p></div></div><div class="riderStats"><div><b>${city}</b><small>ZONA</small></div><div><b>0</b><small>RUTAS</small></div><div><b>0</b><small>RETOS</small></div></div><div class="card riderAbout"><small>SOBRE MÍ</small><p>${bio}</p></div><button class="btn ${online?'':'disabledAction'}" id="message" ${online?'':'disabled'}>${online?'Enviar mensaje':'Fuera de cobertura'}</button><button class="btn secondary ${online?'':'disabledAction'}" id="voiceProfile" ${online?'':'disabled'}>Rider Voz</button>`);
  document.querySelector('#back').onclick=map;
  if(online){
    document.querySelector('#message').onclick=()=>chat(r);
    document.querySelector('#voiceProfile').onclick=()=>voiceInvite(r);
  }
}
async function chat(r){
  if(!r||r.state!=='green'){if(r?.id)profile(r.id);else map();return}
  await flushPendingMessages(r.id);
  const remote=await fetchMessages(r.id);
  const local=savedMessages(r.id);
  const remoteHistory=remote===null?[]:remote.map(m=>({text:m.body||m.text||'',from:String(m.sender_id)===String(r.id)?'them':'me',at:m.created_at||''}));
  if(remote!==null)clearSyncedLocalMessages(r.id,remoteHistory);
  const currentLocal=savedMessages(r.id);
  const history=remote===null?local:remoteHistory.concat(currentLocal.filter(l=>!remoteHistory.some(m=>m.from===l.from&&m.text===l.text)));
  history.sort((a,b)=>String(a.at||'').localeCompare(String(b.at||'')));
  shell(`${topbar('CHAT PRIVADO',true)}<div class="chatHead"><span class="profileMark">${esc((r.name||'R').slice(0,1).toUpperCase())}</span><div><small>CONVERSACIÓN CON</small><h2>${esc(r.name)}</h2></div></div><div class="chat" id="chat">${history.length?history.map(m=>'<div class="bubble '+(m.from==='them'?'them':'me')+(m.pending?' pending':'')+'">'+esc(m.text)+(m.pending?'<small class="messageState">Pendiente</small>':'')+'</div>').join(''):'<p class="sub center">Todavía no hay mensajes.</p>'}</div><button class="btn voice" id="voice">Invitar a Rider Voz</button><div class="composer"><input id="msg" maxlength="1000" autocomplete="off" enterkeyhint="send" placeholder="Escribe un mensaje..."><button id="send" aria-label="Enviar"><span class="sendGlyph"></span></button></div>`);
  
  const input=document.querySelector('#msg');
  const chatBox=document.querySelector('#chat');if(chatBox)chatBox.scrollTop=chatBox.scrollHeight;
  const send=async()=>{
    const value=input.value.trim();if(!value||input.disabled)return;
    input.disabled=true;const sendBtn=document.querySelector('#send');if(sendBtn)sendBtn.disabled=true;
    const sent=await sendRemoteMessage(r.id,value);
    if(!sent)saveMessage(r.id,value);
    const empty=chatBox?.querySelector('.sub.center');if(empty)empty.remove();
    chatBox?.insertAdjacentHTML('beforeend',`<div class="bubble me${sent?'':' pending'}">${esc(value)}${sent?'':'<small class="messageState">Pendiente</small>'}</div>`);
    if(chatBox)chatBox.scrollTop=chatBox.scrollHeight;
    input.value='';input.disabled=false;if(sendBtn)sendBtn.disabled=false;input.focus();
  };
  document.querySelector('#send').onclick=send;
  input.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();send()}};
  let chatActive=true,retryingPending=false;
  document.querySelector('#voice').onclick=()=>{chatActive=false;window.removeEventListener('online',retryPending);document.removeEventListener('visibilitychange',onVisible);voiceInvite(r)};
  const retryPending=async()=>{if(!chatActive||retryingPending||document.visibilityState!=='visible'||!navigator.onLine)return;retryingPending=true;try{const sent=await flushPendingMessages(r.id);if(sent&&chatActive)chat(r)}finally{retryingPending=false}};
  const onVisible=()=>{if(document.visibilityState==='visible')retryPending()};
  const cleanupChat=()=>{chatActive=false;window.removeEventListener('online',retryPending);document.removeEventListener('visibilitychange',onVisible)};
  const backBtn=document.querySelector('#back');backBtn.onclick=()=>{cleanupChat();profile(r.id)};
  window.addEventListener('online',retryPending);
  document.addEventListener('visibilitychange',onVisible);
}
function voiceInvite(r){if(!r||r.state!=='green'){if(r?.id)profile(r.id);else map();return}shell(topbar('RIDER VOZ',true)+'<div class="voiceInvitePanel"><div class="profileAvatar voiceInviteAvatar"><span class="voiceInviteGlyph"></span></div><small>INVITACIÓN DE VOZ</small><h1>Invitar a '+esc(r.name)+'</h1><p>La conversación comienza cuando el Rider acepta.</p><div class="inviteRider"><span class="profileMark">'+esc((r.name||'R').slice(0,1).toUpperCase())+'</span><span><strong>'+esc(r.name)+'</strong><small class="online">● En línea</small></span></div><button class="btn" id="invite">Enviar invitación</button><button class="btn secondary" id="cancel">Cancelar</button><p class="sub center" id="inviteStatus"></p></div>');const go=()=>chat(r);document.querySelector('#back').onclick=go;document.querySelector('#cancel').onclick=go;document.querySelector('#invite').onclick=e=>{e.currentTarget.textContent='Invitación enviada';e.currentTarget.disabled=true;document.querySelector('#inviteStatus').textContent='Esperando respuesta del Rider.'}}
const routes=[{id:1,name:'Casa de Campo Loop',city:'Madrid',km:'18,4',time:'1 h 12 min',level:'Media',author:'Alex Rider',likes:34},{id:2,name:'Turia Night Ride',city:'Valencia',km:'14,8',time:'58 min',level:'Fácil',author:'Marta',likes:21},{id:3,name:'Sevilla Ribera',city:'Sevilla',km:'22,1',time:'1 h 31 min',level:'Media',author:'Dani',likes:47}];
async function sharedRoutes(){
  const liveRoutes=await fetchSharedRoutes();
  window.communityRoutes=liveRoutes;
  shell(topbar('RUTAS COMPARTIDAS',true)+'<div class="screenHero routeHero"><div><small>RUTAS DE LA COMUNIDAD</small><h1>Descubrir rutas</h1><p>Explora y guarda rutas compartidas por otros Riders.</p></div></div><div class="routeList">'+liveRoutes.map(r=>'<button class="routeCard" data-route="'+r.id+'"><span class="routeThumb"><i></i></span><span class="routeCardCopy"><small>'+esc(r.city||'RUTA RIDER')+'</small><strong>'+esc(r.name)+'</strong><em>'+r.km+' km · '+esc(r.level)+' · '+esc(r.author)+'</em></span><b>›</b></button>').join('')+'</div>');
  document.querySelector('#back').onclick=home;
  document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>routeDetail(b.dataset.route));
}
function routeDetail(id){const pool=window.communityRoutes||routes;const r=pool.find(x=>String(x.id)===String(id))||routes.find(x=>String(x.id)===String(id));if(!r){sharedRoutes();return}shell(topbar('RUTA COMPARTIDA',true)+'<div class="routePreview routeCanvas"><span class="routeLine"></span></div><h1>'+esc(r.name)+'</h1><p class="sub">'+esc(r.city)+' · por '+esc(r.author)+'</p><div class="stats"><div><b>'+r.km+'</b><small>km</small></div><div><b>'+esc(r.time)+'</b><small>duración</small></div><div><b>'+esc(r.level)+'</b><small>nivel</small></div></div><button class="btn" id="openRoute">Abrir ruta</button><button class="btn secondary" id="fav">♡ Guardar en favoritas</button>');document.querySelector('#back').onclick=sharedRoutes;const fav=document.querySelector('#fav');if(isFavorite(r.id))fav.textContent='♥ Guardada en favoritas';fav.onclick=e=>{const on=toggleFavorite(r.id);e.currentTarget.textContent=on?'♥ Guardada en favoritas':'♡ Guardar en favoritas'};document.querySelector('#openRoute').onclick=e=>{e.currentTarget.textContent='Ruta preparada';e.currentTarget.disabled=true}}
const challengeData=[{id:1,name:'50 km esta semana',desc:'Acumula 50 km en cualquier número de salidas.',progress:32,target:50,unit:'km'},{id:2,name:'Cazador de desnivel',desc:'Suma 1.000 m de desnivel positivo.',progress:640,target:1000,unit:'m'},{id:3,name:'Explorador',desc:'Completa 3 rutas nuevas.',progress:1,target:3,unit:'rutas'}];
async function challenges(){
  const liveChallenges=await fetchChallenges();
  window.communityChallenges=liveChallenges;
  shell(topbar('RETOS',true)+'<div class="screenHero challengeHero"><div><small>RETOS DE LA COMUNIDAD</small><h1>Retos</h1><p>Objetivos, progreso y participación Rider.</p></div></div><div class="challengeList">'+liveChallenges.map(x=>{const pct=Math.min(100,Math.round(x.progress/x.target*100));return '<button class="challengeCard" data-challenge="'+x.id+'"><span class="challengePct">'+pct+'%</span><span class="challengeCopy"><strong>'+esc(x.name)+'</strong><small>'+esc(x.desc)+'</small><span class="progress"><i style="width:'+pct+'%"></i></span><em>'+x.progress+' / '+x.target+' '+esc(x.unit)+'</em></span><b>›</b></button>'}).join('')+'</div>');
  document.querySelector('#back').onclick=home;
  document.querySelectorAll('[data-challenge]').forEach(b=>b.onclick=()=>challengeDetail(b.dataset.challenge));
}
function challengeDetail(id){const pool=window.communityChallenges||challengeData;const x=pool.find(v=>String(v.id)===String(id))||challengeData.find(v=>String(v.id)===String(id));if(!x){challenges();return}const pct=Math.min(100,Math.round(x.progress/x.target*100));shell(topbar('RETO',true)+'<div class="challengeBadge"><span>'+pct+'%</span><small>PROGRESO</small></div><h1 class="center">'+esc(x.name)+'</h1><p class="sub center">'+esc(x.desc)+'</p><div class="bigProgress">'+pct+'%</div><span class="progress"><i style="width:'+pct+'%"></i></span><p class="center">'+x.progress+' / '+x.target+' '+esc(x.unit)+'</p><button class="btn" id="join">Unirme al reto</button>');document.querySelector('#back').onclick=challenges;const join=document.querySelector('#join');if(joinedChallenge(x.id)){join.textContent='Reto activo';join.disabled=true}join.onclick=e=>{joinChallenge(x.id);e.currentTarget.textContent='Reto activo';e.currentTarget.disabled=true}}
function privacy(){shell(topbar('PRIVACIDAD',true)+'<div class="screenHero privacyHero"><div><small>CONTROL RIDER</small><h1>Ubicación</h1><p>Tú decides cuándo apareces en la comunidad.</p></div></div><div class="card"><h3>Compartir mi ubicación</h3><p id="shareStatus">'+(state.locationSharing?'Activada':'Desactivada')+'</p><button class="btn secondary" id="toggleShare">'+(state.locationSharing?'Desactivar':'Activar')+'</button></div><p class="sub">Al desactivarla dejas de compartir nuevas posiciones. El módulo queda preparado para aplicar después la caducidad de la última ubicación en el servidor.</p>');document.querySelector('#back').onclick=map;document.querySelector('#toggleShare').onclick=()=>{state.locationSharing=!state.locationSharing;saveState();privacy()}}
async function myProfile(){
  const db=dbLoad(),local=db.profile||{alias:'',city:'',bio:''};
  let p={...local};
  const uid=await currentUserId();
  if(uid&&supabaseClient){try{const {data}=await supabaseClient.from('profiles').select('*').eq('id',uid).maybeSingle();if(data){p={...p,...data};const cached={alias:p.alias||'',city:p.city||'',bio:p.bio||''};db.profile=cached;dbSave(db)}}catch{}}
  shell(topbar('MI PERFIL RIDER',true)+'<div class="myProfileCover"><div class="profileMark profileMarkBig">'+esc((p.alias||'R').slice(0,1).toUpperCase())+'</div></div><div class="profileHead profileHeadOwn"><div><small>RIDER</small><h1>'+esc(p.alias||'Rider')+'</h1></div></div><label class="field">Seudónimo<input id="alias" maxlength="24" autocomplete="nickname" value="'+esc(p.alias||'')+'" placeholder="Tu nombre Rider"></label><label class="field">Ciudad<input id="city" maxlength="40" value="'+esc(p.city||'')+'" placeholder="Ciudad"></label><label class="field">Sobre mí<textarea id="bio" maxlength="140" placeholder="Cuéntale algo a la comunidad">'+esc(p.bio||'')+'</textarea></label><button class="btn" id="saveProfile">Guardar perfil</button><p class="sub center" id="saved"></p>');
  document.querySelector('#back').onclick=home;
  document.querySelector('#saveProfile').onclick=async()=>{
    const profile={alias:document.querySelector('#alias').value.trim(),city:document.querySelector('#city').value.trim(),bio:document.querySelector('#bio').value.trim()};
    if(!profile.alias){document.querySelector('#saved').textContent='El seudónimo es obligatorio';document.querySelector('#alias').focus();return}if(profile.alias.length<3){document.querySelector('#saved').textContent='Usa al menos 3 caracteres';document.querySelector('#alias').focus();return}if(!/^[\p{L}\p{N}._ -]+$/u.test(profile.alias)){document.querySelector('#saved').textContent='El seudónimo contiene caracteres no admitidos';document.querySelector('#alias').focus();return}profile.alias=profile.alias.replace(/\s+/g,' ').trim();profile.city=profile.city.replace(/\s+/g,' ').trim();profile.bio=profile.bio.trim();
    let remote=false;
    if(uid&&supabaseClient){try{const {error}=await supabaseClient.from('profiles').update(profile).eq('id',uid);remote=!error}catch{}}
    const db=dbLoad();db.profile=profile;dbSave(db);
    const mark=document.querySelector('.profileMarkBig');if(mark)mark.textContent=profile.alias.slice(0,1).toUpperCase();
    const title=document.querySelector('.profileHeadOwn h1');if(title)title.textContent=profile.alias;
    document.querySelector('#saved').textContent=remote?'Perfil sincronizado':'Perfil guardado en este dispositivo';
  };
}
async function riderVoice(){
  const liveRiders=await fetchCommunityRiders();
  window.communityRiders=liveRiders;
  const pool=liveRiders;
  const selectable=pool.filter(r=>r.state==='green');
  const offline=pool.filter(r=>r.state!=='green');
  const availableIds=new Set(selectable.map(r=>String(r.id)));
  shell(`<div class="sectionEyebrow">eSKATE SUV · COMUNIDAD</div><div class="row spread"><div><small class="voiceLabel">RIDER VOZ</small><h1 class="voiceTitle">Conexión de voz</h1></div><button class="mini" id="back">‹</button></div><div class="voiceCockpit"><div class="voiceRing"><div class="voiceWave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><strong>LISTO</strong><small id="voiceSpeaker">Sin grupo activo</small></div></div><div class="voiceParticipants" id="voiceParticipants"><small>GRUPO RIDER</small><div id="voiceGroup"><span class="emptyGroup">Añade Riders para crear el grupo</span></div></div><div class="voiceControls"><button class="voiceControl" id="mute"><span>MIC</span><small>Micrófono ON</small></button><button class="voiceControl primaryVoice" id="find"><span>+</span><small>Rider</small></button><button class="voiceControl" id="volume"><span>VOL</span><small>Volumen</small></button></div><div class="voiceStatus"><i></i><span>Manos libres · esperando grupo</span></div><button class="btn voiceExit hidden" id="leaveVoice">Salir del grupo</button><div class="riderPicker hidden" id="riderPicker"><div class="pickerHead"><div><small>AÑADIR AL GRUPO</small><h2>Riders</h2></div><button id="closePicker">×</button></div><div class="pickerList">${selectable.length?selectable.map(r=>`<button class="pickerRider" data-add-rider="${r.id}"><span class="profileMark">${esc((r.name||'R').slice(0,1).toUpperCase())}</span><span><strong>${esc(r.name)}</strong><small class="online">● En línea</small></span><b>+</b></button>`).join(''):'<p class="pickerEmpty">No hay Riders conectados ahora mismo.</p>'}${offline.map(r=>`<div class="pickerRider unavailable"><span class="profileMark">${esc((r.name||'R').slice(0,1).toUpperCase())}</span><span><strong>${esc(r.name)}</strong><small class="offline">● Fuera de cobertura</small></span><b>×</b></div>`).join('')}</div></div>`);
  document.querySelector('#back').onclick=()=>{document.body.classList.remove('pickerOpen');home()};
  const picker=document.querySelector('#riderPicker',group=document.querySelector('#voiceGroup'),leave=document.querySelector('#leaveVoice');
  const storedVoiceGroup=(dbLoad().voiceGroup||[]).map(String).filter(id=>availableIds.has(id));const selected=new Map(storedVoiceGroup.map(id=>{const r=selectable.find(x=>String(x.id)===id);return r?[id,r]:null}).filter(Boolean));
  const renderGroup=()=>{const db=dbLoad();db.voiceGroup=[...selected.keys()];dbSave(db);const speaker=document.querySelector('#voiceSpeaker'),status=document.querySelector('.voiceStatus span');if(speaker)speaker.textContent=selected.size?(selected.size===1?[...selected.values()][0].name:selected.size+' Riders en el grupo'):'Sin grupo activo';if(status)status.textContent=selected.size?'Grupo preparado · esperando conexión':'Manos libres · esperando grupo';group.innerHTML=selected.size?[...selected.values()].map(r=>`<button class="groupRider" data-remove-rider="${r.id}" title="Quitar Rider"><span class="profileMark">${esc((r.name||'R').slice(0,1).toUpperCase())}</span><small>${esc(r.name)}</small><b>×</b></button>`).join(''):'<span class="emptyGroup">Añade Riders para crear el grupo</span>';leave.classList.toggle('hidden',!selected.size);document.querySelectorAll('[data-remove-rider]').forEach(b=>b.onclick=()=>{selected.delete(String(b.dataset.removeRider));renderGroup()})};
  document.querySelector('#find').onclick=()=>{picker.classList.remove('hidden');document.body.classList.add('pickerOpen')};
  const closePicker=()=>{picker.classList.add('hidden');document.body.classList.remove('pickerOpen')};
  document.querySelector('#closePicker').onclick=closePicker;
  document.querySelectorAll('[data-add-rider]').forEach(b=>{const id=String(b.dataset.addRider);if(selected.has(id)){b.classList.add('selected');b.querySelector('b').textContent='•'}b.onclick=()=>{const r=selectable.find(x=>String(x.id)===id);if(!r)return;if(selected.has(id)){selected.delete(id);b.classList.remove('selected');b.querySelector('b').textContent='+'}else{selected.set(id,r);b.classList.add('selected');b.querySelector('b').textContent='✓'}renderGroup()}});
  document.querySelector('#mute').onclick=e=>{e.currentTarget.classList.toggle('muted');e.currentTarget.querySelector('small').textContent=e.currentTarget.classList.contains('muted')?'Micrófono OFF':'Micrófono ON'};const volume=document.querySelector('#volume');volume.onclick=e=>{e.currentTarget.classList.toggle('muted');e.currentTarget.querySelector('small').textContent=e.currentTarget.classList.contains('muted')?'Audio OFF':'Volumen'};
  leave.onclick=()=>{selected.clear();document.querySelectorAll('[data-add-rider]').forEach(b=>{b.classList.remove('selected');const mark=b.querySelector('b');if(mark)mark.textContent='+'});closePicker();renderGroup()};
  picker.addEventListener('click',e=>{if(e.target===picker)closePicker()});
  renderGroup();
}
boot();