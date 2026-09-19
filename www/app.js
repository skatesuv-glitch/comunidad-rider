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
function savedMessages(id){return (dbLoad().messages||{})[id]||[]}
function saveMessage(id,text){const db=dbLoad();db.messages=db.messages||{};db.messages[id]=db.messages[id]||[];db.messages[id].push({text,from:'me',at:new Date().toISOString()});dbSave(db)}
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
    return data.map((p,i)=>({
      id:p.id,name:p.alias||p.name||'Rider',city:p.city||'',
      status:p.is_active?'Activo ahora':'Última ubicación',
      state:p.is_active?'green':'red',
      left:(20+(i*17)%65)+'%',top:(25+(i*13)%55)+'%',
      board:p.board||'eSkate',km:p.km?String(p.km)+' km':''
    }));
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
    return data.map((x,i)=>({id:x.id,icon:'🏆',name:x.name||'Reto',desc:x.description||'',progress:0,target:Number(x.target)||1,unit:x.metric==='elevation_m'?'m':x.metric==='distance_km'?'km':'puntos'}));
  }catch{return challengeData}
}
const riders=[
{id:1,name:'Alex Rider',city:'Madrid',status:'Activo ahora',state:'green',left:'48%',top:'39%',board:'eSkate SUV',km:'1.240 km'},
{id:2,name:'Marta',city:'Valencia',status:'Última conexión: hace 2 h',state:'red',left:'70%',top:'51%',board:'Electric Rider',km:'860 km'},
{id:3,name:'Dani',city:'Sevilla',status:'Activo ahora',state:'green',left:'27%',top:'58%',board:'eSkate',km:'2.105 km'}];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function shell(body){app.innerHTML='<section class="phone">'+body+'</section>'}
async function getSession(){
  if(!supabaseClient)return null;
  try{const {data}=await supabaseClient.auth.getSession();return data?.session||null}catch{return null}
}
function authScreen(){
  shell(`<div class="brand">eSKATE SUV</div><h1>Acceso Rider</h1><p class="sub">Entra con tu cuenta o crea una nueva.</p><div class="authTabs"><button class="mini" id="showLogin">Entrar</button><button class="mini" id="showSignup">Crear cuenta</button></div><div id="authFields"></div><p class="sub center" id="authMsg"></p>`);
  const fields=document.querySelector('#authFields'),msg=document.querySelector('#authMsg');
  function loginForm(){
    fields.innerHTML=`<label class="field">Email<input id="authEmail" type="email" autocomplete="email" placeholder="tu@email.com"></label><label class="field">Contraseña<div class="passwordWrap"><input id="authPass" type="password" autocomplete="current-password" minlength="6" placeholder="Tu contraseña"><button type="button" class="eyeBtn" data-eye="authPass">👁</button></div></label><button class="btn" id="login">Entrar</button>`;
    document.querySelectorAll('.eyeBtn').forEach(b=>b.onclick=()=>{const i=document.getElementById(b.dataset.eye);i.type=i.type==='password'?'text':'password';b.textContent=i.type==='password'?'👁':'🙈'});document.querySelector('#login').onclick=async()=>{const email=document.querySelector('#authEmail').value.trim(),password=document.querySelector('#authPass').value;if(!email||!password){msg.textContent='Completa email y contraseña.';return}msg.textContent='Entrando…';try{const {error}=await supabaseClient.auth.signInWithPassword({email,password});if(error){msg.textContent=error.message==='Failed to fetch'?'No hay conexión con el servidor.':error.message;return}await ensureProfile();home()}catch(e){msg.textContent='No se pudo conectar. Revisa la conexión e inténtalo de nuevo.'}};
  }
  function signupForm(){
    fields.innerHTML=`<label class="field">Seudónimo Rider<input id="authAlias" autocomplete="nickname" maxlength="24" placeholder="Tu nombre en la comunidad"></label><label class="field">Email<input id="authEmail" type="email" autocomplete="email" placeholder="tu@email.com"></label><label class="field">Contraseña<div class="passwordWrap"><input id="authPass" type="password" autocomplete="new-password" minlength="6" placeholder="Mínimo 6 caracteres"><button type="button" class="eyeBtn" data-eye="authPass">👁</button></div></label><label class="field">Verificar contraseña<div class="passwordWrap"><input id="authPass2" type="password" autocomplete="new-password" minlength="6" placeholder="Repite la contraseña"><button type="button" class="eyeBtn" data-eye="authPass2">👁</button></div></label><button class="btn" id="signup">Crear cuenta</button>`;
    document.querySelectorAll('.eyeBtn').forEach(b=>b.onclick=()=>{const i=document.getElementById(b.dataset.eye);i.type=i.type==='password'?'text':'password';b.textContent=i.type==='password'?'👁':'🙈'});document.querySelector('#signup').onclick=async()=>{const nick=document.querySelector('#authAlias').value.trim(),email=document.querySelector('#authEmail').value.trim(),password=document.querySelector('#authPass').value,password2=document.querySelector('#authPass2').value;if(nick.length<3){msg.textContent='El seudónimo debe tener al menos 3 caracteres.';return}if(!email){msg.textContent='Introduce tu email.';return}if(password.length<6){msg.textContent='La contraseña debe tener al menos 6 caracteres.';return}if(password!==password2){msg.textContent='Las contraseñas no coinciden.';return}msg.textContent='Creando cuenta…';try{const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{alias:nick}}});if(error){msg.textContent=error.message==='Failed to fetch'?'No hay conexión con el servidor.':error.message;return}msg.textContent=data&&data.session?'✓ Cuenta creada':'✓ Cuenta creada. Revisa tu email para confirmarla.';if(data&&data.session){await ensureProfile();home()}}catch(e){msg.textContent='No se pudo conectar. Revisa la conexión e inténtalo de nuevo.'}};
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
  shell(`<div class="brand">MI CUENTA RIDER</div><div class="row spread"><h1>${esc(alias)}</h1><button class="mini" id="back">‹</button></div><div class="card"><small>SEUDÓNIMO</small><strong>${esc(alias)}</strong></div><div class="card"><small>CORREO</small><strong>${esc(user?.email||'')}</strong></div><button class="btn secondary" id="logout">Cerrar sesión</button>`);
  document.querySelector('#back').onclick=home;
  document.querySelector('#logout').onclick=signOutRider;
}

async function boot(){
  if(!supabaseClient){home();return}
  const session=await getSession();
  if(!session){authScreen();return}
  await ensureProfile();home();
}
function home(){shell(`<div class="communityHeader"><div class="brandLogo"><strong>eSKATE SUV</strong><span>COMUNIDAD</span></div><button class="mini accountBtn" id="account" aria-label="Mi cuenta">👤</button></div><p class="communityTag">RIDERS · RUTAS · EXPERIENCIAS</p><div class="backendStatus" id="backendStatus"><i></i><span>Comprobando backend…</span></div><div class="communityGrid">${[['voice','RIDER VOZ','Habla. Comparte. Conecta.'],['nearby','RIDERS EN MI ZONA','Encuentra riders cerca de ti.'],['routes','RUTAS COMPARTIDAS','Descubre. Guarda. Disfruta.'],['challenges','RETOS','Supera tus límites.']].map((x,i)=>`<button class="card menuCard photoCard heroCard hero-${x[0]}" data-menu="${i}"><span class="heroCopy"><strong>${x[1]}</strong><small>${x[2]}</small></span><span class="heroArrow">›</span></button>`).join('')}</div><button class="profileStrip" data-menu="4"><span class="profileMark">R</span><span><strong>MI PERFIL RIDER</strong><small>Cuenta, privacidad y preferencias</small></span><b>›</b></button>`);
supabaseStatus().then(s=>{const el=document.querySelector('#backendStatus');if(el){el.classList.toggle('ok',s.ok);el.querySelector('span').textContent=s.text}});
document.querySelector('[data-menu="0"]').onclick=riderVoice;document.querySelector('[data-menu="1"]').onclick=consent;document.querySelector('[data-menu="2"]').onclick=sharedRoutes;document.querySelector('[data-menu="3"]').onclick=challenges;document.querySelector('[data-menu="4"]').onclick=myProfile;
const account=document.querySelector('#account');if(account)account.onclick=accountScreen;
}
function consent(){if(state.locationConsent&&state.locationSharing){map();return}shell(`<div class="brand">RIDERS EN MI ZONA</div><h1>Privacidad primero</h1><div class="card"><div class="row"><div><h3>Compartir mi ubicación</h3><p>Activa esta opción para aparecer en la comunidad. Puedes desactivarla cuando quieras.</p></div><button class="switch" id="sw" aria-label="Compartir ubicación"><span class="knob"></span></button></div><div id="consent" class="hidden"><p class="sub">Tu ubicación se utiliza para mostrarte en el mapa. La última ubicación podrá mostrarse temporalmente cuando dejes de estar activo.</p><button class="btn" id="accept">ACEPTO Y ACTIVAR</button></div></div><button class="btn secondary" id="back">Volver</button>`);
const sw=document.querySelector('#sw'), box=document.querySelector('#consent');
sw.onclick=()=>{sw.classList.add('on');box.classList.remove('hidden')};document.querySelector('#accept').onclick=()=>{state.locationConsent=true;state.locationSharing=true;saveState();requestLocation(()=>map())};document.querySelector('#back').onclick=home}
async function map(){
  const liveRiders=await fetchCommunityRiders();
  window.communityRiders=liveRiders;
  shell(`<div class="sectionEyebrow">eSKATE SUV · COMUNIDAD</div><div class="row spread"><div class="sectionHero"><span class="sectionHeroIcon">📍</span><div><small>RIDERS EN MI ZONA</small><h1>España</h1></div></div><button class="mini" id="back">‹</button></div><div class="legend"><span>🟢 Activo</span><span>🔴 Última ubicación</span><span>🔵 Tú</span></div><div class="map"><div class="spain"></div>${liveRiders.map(r=>`<button aria-label="${esc(r.name)}" class="dot ${r.state}" data-rider="${r.id}" style="left:${r.left};top:${r.top}"></button>`).join('')}<i class="dot cyan" style="left:52%;top:56%"></i></div><p class="sub center">Toca un rider para ver su perfil.</p><button class="btn secondary" id="privacy">⚙️ Privacidad de ubicación</button>`);
  document.querySelector('#back').onclick=home;
  document.querySelector('#privacy').onclick=privacy;
  document.querySelectorAll('[data-rider]').forEach(b=>b.onclick=()=>profile(b.dataset.rider));
}
function profile(id){const pool=window.communityRiders||riders;const r=pool.find(x=>String(x.id)===String(id))||riders.find(x=>String(x.id)===String(id));shell(`<div class="brand">RIDER</div><button class="mini" id="back">‹ Mapa</button><div class="profileAvatar">🛹</div><h1 class="center">${esc(r.name)}</h1><p class="center ${r.state==='green'?'online':'offline'}">● ${esc(r.status)}</p><div class="card"><h3>${esc(r.city)}</h3><p>Tabla: ${esc(r.board)}</p><p>Distancia compartida: ${esc(r.km)}</p></div><button class="btn" id="message">💬 Enviar mensaje</button>`);document.querySelector('#back').onclick=map;document.querySelector('#message').onclick=()=>chat(r)}
async function chat(r){
  const remote=await fetchMessages(r.id);
  const local=savedMessages(r.id);
  const history=remote===null?local:remote.map(m=>({text:m.body||m.text||'',from:m.sender_id===r.id?'them':'me'}));
  shell(`<div class="row spread"><div><div class="brand">CHAT PRIVADO</div><h2>${esc(r.name)}</h2></div><button class="mini" id="back">‹</button></div><div class="chat" id="chat">${history.length?history.map(m=>'<div class="bubble '+(m.from==='them'?'them':'me')+'">'+esc(m.text)+'</div>').join(''):'<p class="sub center">Todavía no hay mensajes. Estrena el chat 👋</p>'}</div><button class="btn voice" id="voice">🎙️ Invitar a Rider Voz</button><div class="composer"><input id="msg" placeholder="Escribe un mensaje..."><button id="send">➤</button></div>`);
  document.querySelector('#back').onclick=()=>profile(r.id);
  const input=document.querySelector('#msg');
  const send=async()=>{
    const value=input.value.trim();if(!value)return;
    input.disabled=true;
    const sent=await sendRemoteMessage(r.id,value);
    if(!sent)saveMessage(r.id,value);
    document.querySelector('#chat').insertAdjacentHTML('beforeend',`<div class="bubble me">${esc(value)}</div>`);
    input.value='';input.disabled=false;input.focus();
  };
  document.querySelector('#send').onclick=send;
  input.onkeydown=e=>{if(e.key==='Enter')send()};
  document.querySelector('#voice').onclick=()=>voiceInvite(r);
}
function voiceInvite(r){shell(`<div class="brand">RIDER VOZ</div><button class="mini" id="back">‹ Chat</button><div class="profileAvatar">🎙️</div><h1 class="center">Invitar a ${esc(r.name)}</h1><p class="sub center">La conversación de voz solo comienza si el otro rider acepta.</p><button class="btn" id="invite">Enviar invitación</button><button class="btn secondary" id="cancel">Cancelar</button>`);const go=()=>chat(r);document.querySelector('#back').onclick=go;document.querySelector('#cancel').onclick=go;document.querySelector('#invite').onclick=()=>{document.querySelector('#invite').textContent='✓ Invitación enviada';document.querySelector('#invite').disabled=true}}
const routes=[{id:1,name:'Casa de Campo Loop',city:'Madrid',km:'18,4',time:'1 h 12 min',level:'Media',author:'Alex Rider',likes:34},{id:2,name:'Turia Night Ride',city:'Valencia',km:'14,8',time:'58 min',level:'Fácil',author:'Marta',likes:21},{id:3,name:'Sevilla Ribera',city:'Sevilla',km:'22,1',time:'1 h 31 min',level:'Media',author:'Dani',likes:47}];
async function sharedRoutes(){
  const liveRoutes=await fetchSharedRoutes();
  window.communityRoutes=liveRoutes;
  shell('<div class="sectionEyebrow">eSKATE SUV · COMUNIDAD</div><div class="row spread"><div class="sectionHero"><span class="sectionHeroIcon">🗺️</span><div><small>RUTAS COMPARTIDAS</small><h1>Descubrir rutas</h1></div></div><button class="mini" id="back">‹</button></div><p class="sub">Rutas publicadas por la comunidad.</p>'+liveRoutes.map(r=>'<button class="card menuCard communityListCard" data-route="'+r.id+'"><strong>🗺️ '+esc(r.name)+'</strong><small>📍 '+esc(r.city)+' · '+r.km+' km · '+esc(r.level)+'</small><small>🛹 '+esc(r.author)+' · ♥ '+r.likes+'</small></button>').join(''));
  document.querySelector('#back').onclick=home;
  document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>routeDetail(b.dataset.route));
}
function routeDetail(id){const pool=window.communityRoutes||routes;const r=pool.find(x=>String(x.id)===String(id))||routes.find(x=>String(x.id)===String(id));shell('<div class="brand">RUTA COMPARTIDA</div><button class="mini" id="back">‹ Rutas</button><div class="routePreview">⌁</div><h1>'+esc(r.name)+'</h1><p class="sub">📍 '+esc(r.city)+' · por '+esc(r.author)+'</p><div class="stats"><div><b>'+r.km+'</b><small>km</small></div><div><b>'+esc(r.time)+'</b><small>duración</small></div><div><b>'+esc(r.level)+'</b><small>nivel</small></div></div><button class="btn" id="openRoute">🧭 Abrir ruta</button><button class="btn secondary" id="fav">♡ Guardar en favoritas</button>');document.querySelector('#back').onclick=sharedRoutes;const fav=document.querySelector('#fav');if(isFavorite(r.id))fav.textContent='♥ Guardada en favoritas';fav.onclick=e=>{const on=toggleFavorite(r.id);e.currentTarget.textContent=on?'♥ Guardada en favoritas':'♡ Guardar en favoritas'};document.querySelector('#openRoute').onclick=e=>{e.currentTarget.textContent='✓ Ruta preparada';e.currentTarget.disabled=true}}
const challengeData=[{id:1,icon:'⚡',name:'50 km esta semana',desc:'Acumula 50 km en cualquier número de salidas.',progress:32,target:50,unit:'km'},{id:2,icon:'⛰️',name:'Cazador de desnivel',desc:'Suma 1.000 m de desnivel positivo.',progress:640,target:1000,unit:'m'},{id:3,icon:'🧭',name:'Explorador',desc:'Completa 3 rutas nuevas.',progress:1,target:3,unit:'rutas'}];
async function challenges(){
  const liveChallenges=await fetchChallenges();
  window.communityChallenges=liveChallenges;
  shell('<div class="sectionEyebrow">eSKATE SUV · COMUNIDAD</div><div class="row spread"><div class="sectionHero"><span class="sectionHeroIcon">🏆</span><div><small>RETOS</small><h1>Esta semana</h1></div></div><button class="mini" id="back">‹</button></div><p class="sub">Objetivos para darle una excusa más a las ruedas.</p>'+liveChallenges.map(x=>{const pct=Math.min(100,Math.round(x.progress/x.target*100));return '<button class="card menuCard communityListCard" data-challenge="'+x.id+'"><strong>'+x.icon+' '+esc(x.name)+'</strong><small>'+esc(x.desc)+'</small><span class="progress"><i style="width:'+pct+'%"></i></span><small>'+x.progress+' / '+x.target+' '+esc(x.unit)+' · '+pct+'%</small></button>'}).join(''));
  document.querySelector('#back').onclick=home;
  document.querySelectorAll('[data-challenge]').forEach(b=>b.onclick=()=>challengeDetail(b.dataset.challenge));
}
function challengeDetail(id){const pool=window.communityChallenges||challengeData;const x=pool.find(v=>String(v.id)===String(id))||challengeData.find(v=>String(v.id)===String(id)),pct=Math.min(100,Math.round(x.progress/x.target*100));shell('<div class="brand">RETO</div><button class="mini" id="back">‹ Retos</button><div class="challengeIcon">'+x.icon+'</div><h1 class="center">'+esc(x.name)+'</h1><p class="sub center">'+esc(x.desc)+'</p><div class="bigProgress">'+pct+'%</div><span class="progress"><i style="width:'+pct+'%"></i></span><p class="center">'+x.progress+' / '+x.target+' '+esc(x.unit)+'</p><button class="btn" id="join">Unirme al reto</button>');document.querySelector('#back').onclick=challenges;const join=document.querySelector('#join');if(joinedChallenge(x.id)){join.textContent='✓ Reto activo';join.disabled=true}join.onclick=e=>{joinChallenge(x.id);e.currentTarget.textContent='✓ Reto activo';e.currentTarget.disabled=true}}
function privacy(){shell('<div class="brand">PRIVACIDAD</div><button class="mini" id="back">‹ Mapa</button><h1>Ubicación</h1><div class="card"><h3>Compartir mi ubicación</h3><p id="shareStatus">'+(state.locationSharing?'Activada':'Desactivada')+'</p><button class="btn secondary" id="toggleShare">'+(state.locationSharing?'Desactivar':'Activar')+'</button></div><p class="sub">Al desactivarla dejas de compartir nuevas posiciones. El módulo queda preparado para aplicar después la caducidad de la última ubicación en el servidor.</p>');document.querySelector('#back').onclick=map;document.querySelector('#toggleShare').onclick=()=>{state.locationSharing=!state.locationSharing;saveState();privacy()}}
async function myProfile(){
  const db=dbLoad(),local=db.profile||{alias:'',city:'',board:'eSkate SUV',bio:''};
  let p={...local};
  const uid=await currentUserId();
  if(uid&&supabaseClient){try{const {data}=await supabaseClient.from('profiles').select('*').eq('id',uid).maybeSingle();if(data)p={...p,...data}}catch{}}
  shell('<div class="sectionEyebrow">eSKATE SUV · COMUNIDAD</div><div class="row spread"><div class="sectionHero"><span class="sectionHeroIcon">👤</span><div><small>MI PERFIL RIDER</small><h1>'+esc(p.alias||'Rider')+'</h1></div></div><button class="mini" id="back">‹</button></div><div class="profileAvatar profileHero"><span class="profileMark profileMarkBig">R</span></div><label class="field">Seudónimo<input id="alias" maxlength="24" value="'+esc(p.alias||'')+'" placeholder="Tu nombre Rider"></label><label class="field">Ciudad<input id="city" maxlength="40" value="'+esc(p.city||'')+'" placeholder="Ciudad"></label><label class="field">Tabla<input id="board" maxlength="40" value="'+esc(p.board||'eSkate SUV')+'" placeholder="eSkate SUV"></label><label class="field">Sobre mí<textarea id="bio" maxlength="140" placeholder="Cuéntale algo a la comunidad">'+esc(p.bio||'')+'</textarea></label><button class="btn" id="saveProfile">Guardar perfil</button><p class="sub center" id="saved"></p>');
  document.querySelector('#back').onclick=home;
  document.querySelector('#saveProfile').onclick=async()=>{
    const profile={alias:document.querySelector('#alias').value.trim(),city:document.querySelector('#city').value.trim(),board:document.querySelector('#board').value.trim(),bio:document.querySelector('#bio').value.trim()};
    const db=dbLoad();db.profile=profile;dbSave(db);
    let remote=false;
    if(uid&&supabaseClient){try{const {error}=await supabaseClient.from('profiles').update(profile).eq('id',uid);remote=!error}catch{}}
    document.querySelector('#saved').textContent=remote?'✓ Perfil sincronizado':'✓ Perfil guardado en este dispositivo';
  };
}
function riderVoice(){shell('<div class="sectionEyebrow">eSKATE SUV · COMUNIDAD</div><div class="row spread"><div class="sectionHero"><span class="sectionHeroIcon">🎙️</span><div><small>RIDER VOZ</small><h1>Conexión de voz</h1></div></div><button class="mini" id="back">‹</button></div><p class="sub">Habla con otros riders mientras ruedas. Las invitaciones requieren aceptación.</p><div class="card voiceFeature"><div class="voiceOrb">🎙️</div><div><h3>Sin conexión activa</h3><p>Selecciona un rider para enviar una invitación de voz.</p></div></div><button class="btn" id="find">📍 Buscar riders</button><div class="card"><h3>Controles previstos</h3><p>Micrófono · silenciar · volumen · finalizar conexión.</p></div>');document.querySelector('#back').onclick=home;document.querySelector('#find').onclick=consent}
boot();