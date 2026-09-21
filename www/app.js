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
function dbLoad(){try{const value=JSON.parse(localStorage.getItem(KEY)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}}
function dbSave(db){try{localStorage.setItem(KEY,JSON.stringify(db));return true}catch{return false}}
async function currentUserId(){
  if(!supabaseClient)return null;
  try{const {data}=await supabaseClient.auth.getUser();return data?.user?.id||null}catch{return null}
}
const conversationCache=new Map();
async function getPrivateConversation(riderId){
  const me=await currentUserId();
  if(!supabaseClient||!me||!riderId)return null;
  const key=String(riderId);if(conversationCache.has(key))return conversationCache.get(key);
  try{
    const {data,error}=await supabaseClient.rpc('get_or_create_private_conversation',{other_profile:riderId});
    if(error||!data)return null;
    const id=Array.isArray(data)?data[0]:data;
    if(id){conversationCache.set(key,id);return id}
  }catch{}
  return null
}
async function fetchMessages(riderId){
  const conversationId=await getPrivateConversation(riderId);
  if(!conversationId)return null;
  try{
    const {data,error}=await supabaseClient.from('messages').select('*').eq('conversation_id',conversationId)
      .order('created_at',{ascending:true}).limit(100);
    if(error)return null;
    return data||[];
  }catch{return null}
}
async function sendRemoteMessage(riderId,text){
  const me=await currentUserId(),conversationId=await getPrivateConversation(riderId);
  if(!supabaseClient||!me||!conversationId)return null;
  try{
    const {data,error}=await supabaseClient.from('messages').insert({conversation_id:conversationId,sender_id:me,body:text}).select('id,created_at').single();
    return error||!data?.id?null:data;
  }catch{return null}
}
async function flushPendingMessages(riderId){
  const pending=savedMessages(riderId).filter(m=>m.pending);
  if(!pending.length)return 0;
  const sentKeys=new Set();
  for(const msg of pending){
    const sent=await sendRemoteMessage(riderId,msg.text);
    if(!sent)break;
    sentKeys.add(msg.id||msg.at);
  }
  if(sentKeys.size){
    const db=dbLoad(),messages=db.messages||{};
    const key=Object.keys(messages).find(k=>String(k)===String(riderId));
    if(key!=null&&messages[key]){
      messages[key]=messages[key].filter(m=>!sentKeys.has(m.id||m.at));
      db.messages=messages;dbSave(db);
    }
  }
  return sentKeys.size;
}
function savedMessages(id){const db=dbLoad(),messages=db.messages||{};let key=Object.keys(messages).find(k=>String(k)===String(id));if(key==null)key=String(id);const list=messages[key]||[];let changed=false,seq=0;for(const m of list){if(m.pending&&!m.id){m.id='local-'+(m.at||Date.now())+'-'+(++seq);changed=true}}if(changed)dbSave(db);return list}
function saveMessage(id,text){const db=dbLoad();db.messages=db.messages||{};let key=Object.keys(db.messages).find(k=>String(k)===String(id));if(key==null)key=String(id);db.messages[key]=db.messages[key]||[];db.messages[key].push({id:'local-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),text,from:'me',at:new Date().toISOString(),pending:true});dbSave(db)}
function clearSyncedLocalMessages(id,remoteHistory){const db=dbLoad(),messages=db.messages||{};const key=Object.keys(messages).find(k=>String(k)===String(id));if(key==null)return;const list=messages[key];if(!list?.length)return;const remaining=list.filter(l=>l.pending||!remoteHistory.some(m=>m.from===l.from&&m.text===l.text));if(remaining.length===list.length)return;messages[key]=remaining;db.messages=messages;dbSave(db)}
function isFavorite(id){return (dbLoad().favoriteRoutes||[]).map(String).includes(String(id))}
async function toggleFavorite(id){
  const db=dbLoad();db.favoriteRoutes=db.favoriteRoutes||[];
  const i=db.favoriteRoutes.findIndex(x=>String(x)===String(id)),adding=i<0;
  const uid=await currentUserId();if(!uid||!supabaseClient)return null;
  try{
    const result=adding
      ?await supabaseClient.from('route_favorites').upsert({route_id:id,profile_id:uid},{onConflict:'route_id,profile_id'})
      :await supabaseClient.from('route_favorites').delete().eq('route_id',id).eq('profile_id',uid);
    if(result.error)return null;
    adding?db.favoriteRoutes.push(id):db.favoriteRoutes.splice(i,1);dbSave(db);
    return adding
  }catch{return null}
}
function joinedChallenge(id){return (dbLoad().joinedChallenges||[]).map(String).includes(String(id))}
async function joinChallenge(id){
  if(joinedChallenge(id))return true;
  const uid=await currentUserId();if(!uid||!supabaseClient)return false;
  try{
    const {error}=await supabaseClient.from('challenge_members').upsert({challenge_id:id,profile_id:uid},{onConflict:'challenge_id,profile_id'});
    if(error)return false;
    const db=dbLoad();db.joinedChallenges=db.joinedChallenges||[];
    if(!db.joinedChallenges.map(String).includes(String(id)))db.joinedChallenges.push(id);
    dbSave(db);return true
  }catch{return false}
}
function saveState(){localStorage.setItem('cr_location_consent',state.locationConsent?'yes':'no');localStorage.setItem('cr_location_sharing',state.locationSharing?'yes':'no')}
function requestLocation(done){if(!navigator.geolocation){done&&done(null);return}navigator.geolocation.getCurrentPosition(p=>done&&done({lat:p.coords.latitude,lng:p.coords.longitude}),()=>done&&done(null),{enableHighAccuracy:true,timeout:8000,maximumAge:30000})}
async function publishRiderLocation(pos){
  if(!supabaseClient||!pos)return false;
  const uid=await currentUserId();if(!uid)return false;
  try{const expires=new Date(Date.now()+5*60*1000).toISOString();const {error}=await supabaseClient.from('shared_locations').upsert({profile_id:uid,latitude:pos.lat,longitude:pos.lng,expires_at:expires},{onConflict:'profile_id'});return !error}catch{return false}
}
async function clearRiderLocation(){
  if(!supabaseClient)return false;
  const uid=await currentUserId();if(!uid)return false;
  try{const {error}=await supabaseClient.from('shared_locations').delete().eq('profile_id',uid);return !error}catch{return false}
}
async function refreshSharedLocation(){
  if(!state.locationConsent||!state.locationSharing)return false;
  return await new Promise(resolve=>requestLocation(pos=>{if(!pos){resolve(false);return}publishRiderLocation(pos).then(resolve).catch(()=>resolve(false))}))
}
let riderLocationTimer=null;
function stopRiderLocationHeartbeat(){if(riderLocationTimer){clearInterval(riderLocationTimer);riderLocationTimer=null}}
function startRiderLocationHeartbeat(){
  stopRiderLocationHeartbeat();
  if(!state.locationConsent||!state.locationSharing)return;
  riderLocationTimer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine&&state.locationConsent&&state.locationSharing)refreshSharedLocation().catch(()=>{})},180000)
}
async function setRiderPresence(isOnline){
  if(!supabaseClient)return false;
  const uid=await currentUserId();if(!uid)return false;
  try{const {error}=await supabaseClient.from('presence').upsert({profile_id:uid,is_online:Boolean(isOnline),last_seen:new Date().toISOString()},{onConflict:'profile_id'});return !error}catch{return false}
}
let riderPresenceTimer=null;
function stopRiderPresenceHeartbeat(){if(riderPresenceTimer){clearInterval(riderPresenceTimer);riderPresenceTimer=null}}
function startRiderPresenceHeartbeat(){
  stopRiderPresenceHeartbeat();
  riderPresenceTimer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)setRiderPresence(true).catch(()=>{})},45000)
}
function riderPresenceIsFresh(pr){
  if(!pr?.is_online||!pr.last_seen)return false;
  const seen=new Date(pr.last_seen).getTime();
  return Number.isFinite(seen)&&Date.now()-seen<120000
}
async function fetchCommunityRiders(){
  if(!supabaseClient)return [];
  try{
    const [{data:profiles,error:profileError},{data:presence},{data:locations}]=await Promise.all([
      supabaseClient.from('profiles').select('*').limit(50),
      supabaseClient.from('presence').select('profile_id,is_online,last_seen').limit(50),
      supabaseClient.from('active_shared_locations').select('profile_id,latitude,longitude,accuracy_m,updated_at').limit(50)
    ]);
    if(profileError||!profiles||!profiles.length)return [];
    const presenceById=new Map((presence||[]).map(x=>[String(x.profile_id),x]));
    const locationById=new Map((locations||[]).map(x=>[String(x.profile_id),x]));
    const real=profiles.map((p,i)=>{
      const pr=presenceById.get(String(p.id)),loc=locationById.get(String(p.id));
      const online=riderPresenceIsFresh(pr);
      return {
        id:p.id,name:p.alias||p.name||'Rider',city:p.city||'',
        status:online?'Activo ahora':'Fuera de cobertura',
        state:online?'green':'red',
        left:(20+(i*17)%65)+'%',top:(25+(i*13)%55)+'%',
        latitude:loc?.latitude??null,longitude:loc?.longitude??null,accuracy:loc?.accuracy_m??null,
        bio:p.bio||'Sin descripción.'
      };
    });
    return real;
  }catch{return []}
}
async function fetchSharedRoutes(){
  if(!supabaseClient)return [];
  try{
    const {data,error}=await supabaseClient.from('routes').select('*').limit(50);
    if(error||!data||!data.length)return [];
    const authorIds=[...new Set(data.map(r=>r.author_id).filter(Boolean))];
    let authors=new Map();
    if(authorIds.length){const {data:profiles}=await supabaseClient.from('profiles').select('id,alias').in('id',authorIds);authors=new Map((profiles||[]).map(p=>[String(p.id),p.alias||'Rider']))}
    const formatDuration=seconds=>{const n=Number(seconds);if(!Number.isFinite(n)||n<0)return '—';const h=Math.floor(n/3600),m=Math.floor((n%3600)/60);return h?h+' h '+String(m).padStart(2,'0')+' min':m+' min'};
    return data.map(r=>({id:r.id,name:r.name||'Ruta Rider',city:r.city||'',km:String(r.distance_km??'—'),time:formatDuration(r.duration_seconds),elevation:Number.isFinite(Number(r.elevation_gain_m))?Number(r.elevation_gain_m):null,author:authors.get(String(r.author_id))||'Rider'}));
  }catch{return []}
}
async function fetchChallenges(){
  if(!supabaseClient)return [];
  try{
    const uid=await currentUserId();
    const [{data,error},{data:members}]=await Promise.all([
      supabaseClient.from('challenges').select('*').limit(50),
      uid?supabaseClient.from('challenge_members').select('challenge_id,progress').eq('profile_id',uid):Promise.resolve({data:[]})
    ]);
    if(error||!data||!data.length)return [];
    const progressById=new Map((members||[]).map(x=>[String(x.challenge_id),Number(x.progress)||0]));
    return data.map(x=>({id:x.id,name:x.name||'Reto',desc:x.description||'',progress:progressById.get(String(x.id))||0,target:Number(x.target)||1,unit:x.metric==='elevation_m'?'m':x.metric==='distance_km'?'km':'puntos'}));
  }catch{return []}
}
const riders=[];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let screenCleanup=null;function shell(body){if(screenCleanup){const cleanup=screenCleanup;screenCleanup=null;try{cleanup()}catch{}}app.innerHTML='<section class="phone">'+body+'</section>'}
function topbar(label,back){return '<div class="appTop">'+(back?'<button class="backBtn" id="back" aria-label="Volver">‹</button>':'<span class="topSpacer"></span>')+'<div class="miniBrand"><b>eSKATESUV</b><span>COMUNIDAD</span></div><span class="topSpacer"></span></div>'+(label?'<div class="screenLabel">'+label+'</div>':'')}
async function getSession(){
  if(!supabaseClient)return null;
  try{const {data}=await supabaseClient.auth.getSession();return data?.session||null}catch{return null}
}
function authScreen(){
  shell(`<div class="authScreen"><div class="authBrand"><b>eSKATESUV</b><span>COMUNIDAD</span></div><div class="authIntro"><h1 id="authTitle">Bienvenido Rider</h1><p id="authSubtitle">Accede a tu comunidad.</p></div><div id="authFields"></div><p class="sub center" id="authMsg"></p></div>`);
  const fields=document.querySelector('#authFields'),msg=document.querySelector('#authMsg'),title=document.querySelector('#authTitle'),subtitle=document.querySelector('#authSubtitle');
  const bindEyes=()=>document.querySelectorAll('.eyeBtn').forEach(b=>b.onclick=()=>{const i=document.getElementById(b.dataset.eye);i.type=i.type==='password'?'text':'password';b.classList.toggle('showing',i.type==='text');b.setAttribute('aria-label',i.type==='password'?'Mostrar contraseña':'Ocultar contraseña')});
  function loginForm(){
    title.textContent='Bienvenido Rider';subtitle.textContent='Accede a tu comunidad.';
    fields.innerHTML=`<label class="field">Correo electrónico<input id="authEmail" type="email" autocomplete="email" placeholder="tu@email.com"></label><label class="field">Contraseña<div class="passwordWrap"><input id="authPass" type="password" autocomplete="current-password" minlength="6" placeholder="Tu contraseña"><button type="button" class="eyeBtn" data-eye="authPass" aria-label="Mostrar contraseña"></button></div></label><div class="authOptions"><label><input id="rememberMe" type="checkbox" checked> <span>Recordarme</span></label><button type="button" class="authLink" id="forgotPass">¿Has olvidado tu contraseña?</button></div><button class="btn authPrimary" id="login">Entrar</button><p class="authSwitch">¿No tienes cuenta? <button type="button" class="authLink" id="goSignup">Regístrate</button></p>`;
    bindEyes();
    document.querySelector('#goSignup').onclick=()=>{msg.textContent='';signupForm()};
    document.querySelector('#forgotPass').onclick=async()=>{const email=document.querySelector('#authEmail').value.trim();if(!email){msg.textContent='Introduce tu correo para recuperar la contraseña.';return}try{const {error}=await supabaseClient.auth.resetPasswordForEmail(email);msg.textContent=error?error.message:'Te hemos enviado el enlace de recuperación.'}catch{msg.textContent='No se pudo enviar el enlace de recuperación.'}};
    document.querySelector('#login').onclick=async()=>{const email=document.querySelector('#authEmail').value.trim(),password=document.querySelector('#authPass').value;if(!email||!password){msg.textContent='Completa email y contraseña.';return}msg.textContent='Entrando…';try{const {error}=await supabaseClient.auth.signInWithPassword({email,password});if(error){msg.textContent=error.message==='Failed to fetch'?'No hay conexión con el servidor.':error.message;return}await ensureProfile();home()}catch(e){msg.textContent='No se pudo conectar. Revisa la conexión e inténtalo de nuevo.'}};
  }
  function signupForm(){
    title.textContent='Únete a la Comunidad';subtitle.textContent='Crea tu perfil Rider.';
    fields.innerHTML=`<label class="field">Seudónimo Rider<input id="authAlias" autocomplete="nickname" maxlength="24" placeholder="Tu nombre en la comunidad"></label><label class="field">Correo electrónico<input id="authEmail" type="email" autocomplete="email" placeholder="tu@email.com"></label><label class="field">Contraseña<div class="passwordWrap"><input id="authPass" type="password" autocomplete="new-password" minlength="6" placeholder="Mínimo 6 caracteres"><button type="button" class="eyeBtn" data-eye="authPass" aria-label="Mostrar contraseña"></button></div></label><button class="btn authPrimary" id="signup">Registrarse</button><p class="authTerms">Al registrarte aceptas las condiciones de uso y la política de privacidad.</p><p class="authSwitch">¿Ya tienes cuenta? <button type="button" class="authLink" id="goLogin">Entrar</button></p>`;
    bindEyes();document.querySelector('#goLogin').onclick=()=>{msg.textContent='';loginForm()};
    document.querySelector('#signup').onclick=async()=>{const nick=document.querySelector('#authAlias').value.trim(),email=document.querySelector('#authEmail').value.trim(),password=document.querySelector('#authPass').value;if(nick.length<3){msg.textContent='El seudónimo debe tener al menos 3 caracteres.';return}if(!email){msg.textContent='Introduce tu email.';return}if(password.length<6){msg.textContent='La contraseña debe tener al menos 6 caracteres.';return}msg.textContent='Creando cuenta…';try{const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{alias:nick}}});if(error){msg.textContent=error.message==='Failed to fetch'?'No hay conexión con el servidor.':error.message;return}if(data&&data.session){await ensureProfile();home();return}msg.textContent='Cuenta creada. Revisa tu email para activar el acceso.'}catch(e){msg.textContent='No se pudo conectar. Revisa la conexión e inténtalo de nuevo.'}};
  }
  loginForm();
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
async function cleanupRiderSessionResources({markOffline=false,clearLocation=false}={}){
  stopRiderPresenceHeartbeat();stopRiderLocationHeartbeat();
  if(screenCleanup){const cleanup=screenCleanup;screenCleanup=null;try{cleanup()}catch{}}
  const closingSession=sessionStorage.getItem('rider_voice_session');
  if(closingSession)await endVoiceInviteSession(closingSession).catch(()=>false);
  if(window.riderVoiceRtc){
    const rtc=window.riderVoiceRtc;
    if(rtc.voiceHealthTimer)clearInterval(rtc.voiceHealthTimer);if(rtc.readyTimer)clearInterval(rtc.readyTimer);
    if(rtc.networkChanged){window.removeEventListener('offline',rtc.networkChanged);window.removeEventListener('online',rtc.networkChanged)}
    for(const remoteId of rtc.peers.keys()){try{await rtc.channel.send({type:'broadcast',event:'leave',payload:{from:rtc.me,to:remoteId}})}catch{}}
    for(const pc of rtc.peers.values())pc.close();rtc.peers.clear();rtc.voiceStats?.clear?.();
    try{await rtc.channel.unsubscribe()}catch{}window.riderVoiceRtc=null
  }
  document.querySelectorAll('audio[data-voice-rider]').forEach(a=>{try{a.pause();a.srcObject=null}catch{}a.remove()});
  if(window.riderVoiceLocalStream){try{window.riderVoiceLocalStream.getTracks().forEach(track=>track.stop())}catch{}window.riderVoiceLocalStream=null}
  if(voiceInboxChannel){try{await voiceInboxChannel.unsubscribe()}catch{}voiceInboxChannel=null}
  pendingVoiceResponses.clear();sessionStorage.removeItem('rider_voice_session');sessionStorage.removeItem('rider_voice_peer');sessionStorage.removeItem('rider_voice_closing');
  if(clearLocation)await clearRiderLocation().catch(()=>false);if(markOffline)await setRiderPresence(false).catch(()=>false)
}
async function signOutRider(){
  if(!supabaseClient){authScreen();return}
  const btn=document.querySelector('#logout');if(btn){btn.disabled=true;btn.textContent='Cerrando sesión…'}
  try{
    await cleanupRiderSessionResources({markOffline:true,clearLocation:true});
    const {error}=await supabaseClient.auth.signOut();
    if(error)throw error;
    authScreen()
  }catch{
    if(btn){btn.disabled=false;btn.textContent='Cerrar sesión'}
    const menu=document.querySelector('.accountMenu');if(menu){let note=document.querySelector('#logoutError');if(!note){note=document.createElement('p');note.id='logoutError';note.className='sub center';menu.insertAdjacentElement('afterend',note)}note.textContent='No se pudo cerrar la sesión. Revisa la conexión e inténtalo de nuevo.'}
  }
}

function notificationSettings(){
  const db=dbLoad();db.settings=db.settings||{};
  const current={voice:db.settings.notifyVoice!==false,chat:db.settings.notifyChat!==false,routes:db.settings.notifyRoutes!==false};
  shell(`${topbar('NOTIFICACIONES',true)}<div class="settingsIntro"><small>AVISOS DE COMUNIDAD</small><h1>Tú decides qué suena</h1><p>Configura los avisos de Comunidad Rider sin afectar a los avisos de conducción de eSkateSUV.</p></div><div class="settingsList"><button class="settingToggle" data-setting="voice"><span><strong>Rider Voz</strong><small>Invitaciones y llamadas de voz</small></span><i class="switch ${current.voice?'on':''}"><span class="knob"></span></i></button><button class="settingToggle" data-setting="chat"><span><strong>Chat Rider</strong><small>Mensajes nuevos de otros Riders</small></span><i class="switch ${current.chat?'on':''}"><span class="knob"></span></i></button><button class="settingToggle" data-setting="routes"><span><strong>Rutas y retos</strong><small>Novedades de actividad de la comunidad</small></span><i class="switch ${current.routes?'on':''}"><span class="knob"></span></i></button></div>`);
  document.querySelector('#back').onclick=accountScreen;
  document.querySelectorAll('[data-setting]').forEach(btn=>btn.onclick=()=>{const key=btn.dataset.setting;current[key]=!current[key];btn.querySelector('.switch').classList.toggle('on',current[key]);const d=dbLoad();d.settings=d.settings||{};d.settings['notify'+key[0].toUpperCase()+key.slice(1)]=current[key];dbSave(d)});
}
function helpScreen(){
  shell(`${topbar('AYUDA',true)}<div class="settingsIntro"><small>CENTRO RIDER</small><h1>¿En qué te ayudamos?</h1><p>Accesos rápidos para resolver los puntos habituales de Comunidad Rider.</p></div><div class="helpList"><div class="card"><strong>Rider Voz</strong><p>Comprueba permiso de micrófono, conexión a Internet y que el Rider siga disponible antes de iniciar la conversación.</p></div><div class="card"><strong>Ubicación y mapa</strong><p>Puedes activar o detener el uso de ubicación desde Privacidad. Tú decides cuándo aparecer en el mapa.</p></div><div class="card"><strong>Cuenta Rider</strong><p>Edita seudónimo, ciudad y descripción desde Mi cuenta Rider. La contraseña se recupera desde la pantalla de acceso.</p></div></div>`);
  document.querySelector('#back').onclick=accountScreen;
}

async function accountScreen(){
  const uid=await currentUserId();
  if(!uid||!supabaseClient){authScreen();return}
  let user=null,profile=null;
  try{const {data:u}=await supabaseClient.auth.getUser();user=u?.user||null;const {data:p}=await supabaseClient.from('profiles').select('*').eq('id',uid).maybeSingle();profile=p||null}catch{}
  const alias=profile?.alias||user?.user_metadata?.alias||'Rider';
  const initial=esc(alias.slice(0,1).toUpperCase());
  shell(`${topbar('MI CUENTA RIDER',true)}<div class="accountProfile"><div class="profileMark profileMarkBig">${initial}</div><h1>${esc(alias)}</h1><small>RIDER eSKATE SUV</small></div><div class="accountFields"><div class="card accountData"><small>SEUDÓNIMO</small><strong>${esc(alias)}</strong></div><div class="card accountData"><small>CORREO ELECTRÓNICO</small><strong>${esc(user?.email||'')}</strong></div></div><div class="accountMenu"><button id="editProfile"><span>Editar perfil</span><b>›</b></button><button id="notifications"><span>Notificaciones</span><b>›</b></button><button id="privacyAccount"><span>Privacidad</span><b>›</b></button><button id="helpAccount"><span>Ayuda</span><b>›</b></button></div><button class="btn secondary dangerBtn" id="logout">Cerrar sesión</button>`);
  document.querySelector('#back').onclick=home;
  document.querySelector('#editProfile').onclick=myProfile;
  document.querySelector('#notifications').onclick=notificationSettings;
  document.querySelector('#privacyAccount').onclick=()=>privacy(accountScreen);
  document.querySelector('#helpAccount').onclick=helpScreen;
  document.querySelector('#logout').onclick=signOutRider;
}

async function createVoiceInviteRecord(recipientId,sessionId){
  if(!supabaseClient)return null;
  const me=await currentUserId();if(!me)return null;
  try{
    const expiresAt=new Date(Date.now()+30000).toISOString();
    const {data,error}=await supabaseClient.from('voice_invites').insert({sender_id:me,recipient_id:recipientId,session_id:sessionId,status:'pending',expires_at:expiresAt}).select('id').single();
    return error?null:data?.id||null
  }catch{return null}
}
async function updateVoiceInviteRecord(inviteId,status){
  if(!supabaseClient||!inviteId)return false;
  try{const {error}=await supabaseClient.from('voice_invites').update({status}).eq('id',inviteId);return !error}catch{return false}
}

async function endVoiceInviteSession(sessionId){
  if(!supabaseClient||!sessionId)return false;
  try{
    const me=await currentUserId();if(!me)return false;
    const {error}=await supabaseClient.from('voice_invites').update({status:'ended'}).eq('session_id',sessionId).eq('status','accepted').or('sender_id.eq.'+me+',recipient_id.eq.'+me);
    return !error
  }catch{return false}
}

let voiceInboxChannel=null;
const pendingVoiceResponses=new Map();
async function showVoiceInvite(payload,channel){
  const me=await currentUserId();
  if(!me||!payload||String(payload.to)!==String(me)||!payload.sessionId)return false;
  if(payload.createdAt&&Date.now()-Number(payload.createdAt)>30000){if(payload.inviteId)await updateVoiceInviteRecord(payload.inviteId,'expired');return false}
  if(window.riderVoiceRtc||sessionStorage.getItem('rider_voice_session')){if(payload.inviteId)await updateVoiceInviteRecord(payload.inviteId,'declined');if(channel)await channel.send({type:'broadcast',event:'voice-invite-response',payload:{from:me,to:String(payload.from),sessionId:payload.sessionId,inviteId:payload.inviteId,accepted:false,reason:'busy'}});return false}
  const pool=window.communityRiders||riders;
  const rider=pool.find(x=>String(x.id)===String(payload.from))||{id:String(payload.from),name:payload.senderName||'Rider'};
  shell(topbar('RIDER VOZ',true)+'<div class="voiceInvitePanel"><div class="profileAvatar voiceInviteAvatar"><span class="voiceInviteGlyph"></span></div><small>LLAMADA RIDER</small><h1>'+esc(rider.name)+' te invita</h1><p>Quiere iniciar una conversación Rider Voz contigo.</p><div class="inviteRider"><span class="profileMark">'+esc((rider.name||'R').slice(0,1).toUpperCase())+'</span><span><strong>'+esc(rider.name)+'</strong><small class="online">● Invitación recibida</small></span></div><button class="btn" id="acceptVoice">Aceptar</button><button class="btn secondary" id="rejectVoice">Rechazar</button><p class="sub center" id="inviteStatus"></p></div>');
  let answered=false;
  const reply=async accepted=>{
    if(answered)return;answered=true;
    const accept=document.querySelector('#acceptVoice'),reject=document.querySelector('#rejectVoice');if(accept)accept.disabled=true;if(reject)reject.disabled=true;
    try{
      if(payload.inviteId)await updateVoiceInviteRecord(payload.inviteId,accepted?'accepted':'declined');
      if(channel)await channel.send({type:'broadcast',event:'voice-invite-response',payload:{from:me,to:String(payload.from),sessionId:payload.sessionId,inviteId:payload.inviteId,accepted}});
      if(accepted){sessionStorage.setItem('rider_voice_session',payload.sessionId);sessionStorage.setItem('rider_voice_peer',String(payload.from));riderVoice()}else home()
    }catch{answered=false;if(accept)accept.disabled=false;if(reject)reject.disabled=false;const status=document.querySelector('#inviteStatus');if(status)status.textContent='No se pudo responder · revisa la conexión.'}
  };
  document.querySelector('#back').onclick=()=>reply(false);document.querySelector('#rejectVoice').onclick=()=>reply(false);document.querySelector('#acceptVoice').onclick=e=>{e.currentTarget.disabled=true;e.currentTarget.textContent='Entrando…';reply(true)};
  return true
}
async function recoverPendingVoiceInvite(){
  if(!supabaseClient)return false;
  const me=await currentUserId();if(!me)return false;
  try{
    const now=new Date().toISOString();
    const {data,error}=await supabaseClient.from('voice_invites').select('id,sender_id,session_id,created_at,expires_at').eq('recipient_id',me).eq('status','pending').gt('expires_at',now).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(error||!data)return false;
    if(!data.session_id){await updateVoiceInviteRecord(data.id,'expired');return false}
    const createdAt=new Date(data.created_at).getTime();
    return await showVoiceInvite({from:data.sender_id,to:me,sessionId:data.session_id,inviteId:data.id,createdAt},voiceInboxChannel)
  }catch{return false}
}
async function ensureVoiceInbox(){
  if(!supabaseClient||voiceInboxChannel)return;
  const me=await currentUserId();if(!me)return;
  const channel=supabaseClient.channel('rider-voice-inbox-'+me,{config:{broadcast:{self:false}}});
  channel.on('broadcast',{event:'voice-invite'},({payload})=>{showVoiceInvite(payload,channel)}).on('broadcast',{event:'voice-invite-response'},({payload})=>{if(!payload?.sessionId)return;const handler=pendingVoiceResponses.get(payload.sessionId);if(handler)handler(payload)}).subscribe();
  voiceInboxChannel=channel;
}
async function enterAppAfterSplash(){
  if(!supabaseClient){home();return}
  const session=await getSession();
  if(!session){authScreen();return}
  await ensureProfile();await setRiderPresence(true);startRiderPresenceHeartbeat();await ensureVoiceInbox();if(state.locationConsent&&state.locationSharing){refreshSharedLocation().catch(()=>{});startRiderLocationHeartbeat();}const recovered=await recoverPendingVoiceInvite();if(!recovered)home();
}
function splashScreen(){
  const letters=[...'eSkateSUV'].map((ch,i)=>`<span style="--i:${i}">${ch}</span>`).join('');
  app.innerHTML=`<section class="launchSplash" aria-label="eSkateSUV"><div class="launchShade"></div><div class="launchBrand"><div class="launchMark" aria-hidden="true"><span class="launchS launchSOne"></span><span class="launchS launchSTwo"></span></div><div class="launchWord" aria-label="eSkateSUV">${letters}</div><div class="launchTag">RIDE <b>·</b> EXPLORE <b>·</b> CONNECT</div></div></section>`;
  requestAnimationFrame(()=>document.querySelector('.launchSplash')?.classList.add('is-in'));
  setTimeout(()=>document.querySelector('.launchSplash')?.classList.add('is-out'),2200);
  setTimeout(()=>enterAppAfterSplash(),2850);
}
let authStateCleanupRunning=false;
function watchAuthState(){
  if(!supabaseClient)return;
  supabaseClient.auth.onAuthStateChange((event)=>{
    if(event!=='SIGNED_OUT'||authStateCleanupRunning)return;
    authStateCleanupRunning=true;
    cleanupRiderSessionResources().catch(()=>{}).finally(()=>{authStateCleanupRunning=false;authScreen()})
  })
}
function boot(){watchAuthState();splashScreen()}
async function activityScreen(){
  const db=dbLoad();let fav=new Set((db.favoriteRoutes||[]).map(String)).size,joined=new Set((db.joinedChallenges||[]).map(String)).size;
  const group=new Set((db.voiceGroup||[]).map(String)).size;
  const uid=await currentUserId();
  if(uid&&supabaseClient){
    try{
      const [{count:favCount,error:favError},{count:challengeCount,error:challengeError}]=await Promise.all([
        supabaseClient.from('route_favorites').select('route_id',{count:'exact',head:true}).eq('profile_id',uid),
        supabaseClient.from('challenge_members').select('challenge_id',{count:'exact',head:true}).eq('profile_id',uid)
      ]);
      if(!favError&&Number.isFinite(favCount))fav=favCount;
      if(!challengeError&&Number.isFinite(challengeCount))joined=challengeCount
    }catch{}
  }
  shell(`${topbar('ACTIVIDAD',true)}<div class="screenHero activityHero"><div><small>TU COMUNIDAD</small><h1>Actividad Rider</h1><p>Un resumen de lo que tienes en marcha.</p></div></div><div class="activityList"><button class="card activityCard" id="activityVoice"><span><small>RIDER VOZ</small><strong>${group?group+' Rider'+(group===1?'':'s')+' en tu grupo':'Sin grupo activo'}</strong></span><b>›</b></button><button class="card activityCard" id="activityRoutes"><span><small>RUTAS GUARDADAS</small><strong>${fav} favorita${fav===1?'':'s'}</strong></span><b>›</b></button><button class="card activityCard" id="activityChallenges"><span><small>RETOS ACTIVOS</small><strong>${joined} reto${joined===1?'':'s'}</strong></span><b>›</b></button></div>`);
  document.querySelector('#back').onclick=home;document.querySelector('#activityVoice').onclick=riderVoice;document.querySelector('#activityRoutes').onclick=sharedRoutes;document.querySelector('#activityChallenges').onclick=challenges
}
function home(){const p=dbLoad().profile||{};const initial=esc((p.alias||'R').slice(0,1).toUpperCase());const alias=esc(p.alias||'Rider');shell(`<div class="communityHeader"><div class="brandLogo"><strong>eSKATESUV</strong><span>COMUNIDAD</span></div><button class="accountBtn profileBubble" id="account" aria-label="Mi cuenta"><span>${initial}</span></button></div><p class="communityTag">TU GENTE. TUS RUTAS. TU RIDE.</p><div class="communityGrid">${[['voice','RIDER VOZ','Habla. Comparte. Conecta.'],['nearby','RIDERS EN MI ZONA','Encuentra riders cerca de ti.'],['routes','RUTAS COMPARTIDAS','Descubre. Guarda. Disfruta.'],['challenges','RETOS','Supera tus límites.']].map((x,i)=>`<button class="menuCard heroCard hero-${x[0]}" data-menu="${i}"><span class="heroVisual"></span><span class="heroCopy"><strong>${x[1]}</strong><small>${x[2]}</small></span><span class="heroArrow">›</span></button>`).join('')}</div><nav class="communityNav"><button class="active" data-nav="home"><i class="navHome"></i><small>Inicio</small></button><button data-nav="map"><i class="navMap"></i><small>Mapa</small></button><button class="navPlus" data-nav="plus"><i>+</i></button><button data-nav="activity"><i class="navBell"></i><small>Actividad</small></button><button data-menu="4"><i class="navProfile"></i><small>Perfil</small></button></nav>`);
document.querySelector('[data-menu="0"]').onclick=riderVoice;document.querySelector('[data-menu="1"]').onclick=consent;document.querySelector('[data-menu="2"]').onclick=sharedRoutes;document.querySelector('[data-menu="3"]').onclick=challenges;document.querySelector('[data-menu="4"]').onclick=myProfile;document.querySelector('[data-nav="map"]').onclick=consent;document.querySelector('[data-nav="plus"]').onclick=sharedRoutes;document.querySelector('[data-nav="activity"]').onclick=activityScreen;
const account=document.querySelector('#account');if(account){account.title=alias;account.onclick=accountScreen}
}
function consent(){if(state.locationConsent&&state.locationSharing){map();return}shell(`${topbar('RIDERS EN MI ZONA',true)}<div class="screenHero privacyHero"><div><small>ANTES DE APARECER EN EL MAPA</small><h1>Privacidad primero</h1><p>Tú controlas cuándo compartes tu ubicación.</p></div></div><div class="card"><div class="row"><div><h3>Compartir mi ubicación</h3><p>Activa esta opción para aparecer en la comunidad. Puedes desactivarla cuando quieras.</p></div><button class="switch" id="sw" aria-label="Compartir ubicación"><span class="knob"></span></button></div><div id="consent" class="hidden"><p class="sub">Tu ubicación se utiliza para mostrarte en el mapa. La última ubicación podrá mostrarse temporalmente cuando dejes de estar activo.</p><button class="btn" id="accept">ACEPTO Y ACTIVAR</button></div></div><button class="btn secondary" id="back">Volver</button>`);
const sw=document.querySelector('#sw'), box=document.querySelector('#consent');
sw.onclick=()=>{const on=sw.classList.toggle('on');box.classList.toggle('hidden',!on)};document.querySelector('#accept').onclick=()=>{const btn=document.querySelector('#accept');if(btn){btn.disabled=true;btn.textContent='ACTIVANDO UBICACIÓN…'}requestLocation(pos=>{if(!pos){state.locationConsent=false;state.locationSharing=false;saveState();if(btn){btn.disabled=false;btn.textContent='ACEPTO Y ACTIVAR'}const note=document.querySelector('#consent .sub');if(note)note.textContent='No se pudo obtener la ubicación. Revisa el permiso de ubicación del dispositivo e inténtalo de nuevo.';return}state.locationConsent=true;publishRiderLocation(pos).then(ok=>{if(!ok){state.locationSharing=false;saveState();if(btn){btn.disabled=false;btn.textContent='ACEPTO Y ACTIVAR'}const note=document.querySelector('#consent .sub');if(note)note.textContent='No se pudo compartir la ubicación. Revisa la conexión e inténtalo de nuevo.';return}state.locationSharing=true;saveState();startRiderLocationHeartbeat();map()}).catch(()=>{state.locationSharing=false;saveState();if(btn){btn.disabled=false;btn.textContent='ACEPTO Y ACTIVAR'}const note=document.querySelector('#consent .sub');if(note)note.textContent='No se pudo compartir la ubicación. Revisa la conexión e inténtalo de nuevo.'})})};document.querySelector('#back').onclick=home}
async function map(){
  let myLocation=null;
  if(state.locationConsent&&state.locationSharing){await refreshSharedLocation();const uid=await currentUserId();if(uid&&supabaseClient){try{const {data}=await supabaseClient.from('active_shared_locations').select('latitude,longitude,accuracy_m').eq('profile_id',uid).maybeSingle();if(data)myLocation=data}catch{}}}
  const liveRiders=await fetchCommunityRiders();
  window.communityRiders=liveRiders;
  const located=liveRiders.filter(r=>Number.isFinite(Number(r.latitude))&&Number.isFinite(Number(r.longitude)));
  const visibleRiders=located.filter(r=>r.state==='green');
  const activeCount=visibleRiders.length;
  const origin=myLocation||located[0]||null;
  if(origin){const lat0=Number(origin.latitude),lng0=Number(origin.longitude),latScale=Math.max(Math.cos(lat0*Math.PI/180),0.2);for(const r of located){const dx=(Number(r.longitude)-lng0)*latScale,dy=Number(r.latitude)-lat0;r.left=(50+Math.max(-1,Math.min(1,dx/0.02))*38)+'%';r.top=(50-Math.max(-1,Math.min(1,dy/0.02))*38)+'%'}}
  shell(`${topbar('RIDERS EN MI ZONA',true)}<div class="mapToolbar"><div><small>COMUNIDAD CERCANA</small><h1>Riders en mi zona</h1></div><button class="mapPrivacy" id="privacy" aria-label="Privacidad"><span class="privacyGlyph"></span></button></div><div class="mapLegend"><span><i class="legendDot green"></i>Activo${activeCount?' · '+activeCount:''}</span><span><i class="legendDot red"></i>Fuera de cobertura</span><span><i class="legendDot cyan"></i>Tú</span></div><div class="riderMap"><div class="mapRoad roadA"></div><div class="mapRoad roadB"></div><div class="mapRoad roadC"></div>${visibleRiders.map(r=>`<button aria-label="${esc(r.name)}" class="riderPin ${r.state}" data-rider="${r.id}" style="left:${r.left};top:${r.top}"><span>${esc((r.name||'R').slice(0,1).toUpperCase())}</span></button>`).join('')}${myLocation?'<i class="riderPin cyan mePin" style="left:50%;top:50%"><span>TÚ</span></i>':''}<div class="mapFocus"></div></div><div class="mapFooter"><span class="mapLiveState"><i></i>${activeCount?activeCount+' Rider'+(activeCount===1?'':'s')+' conectado'+(activeCount===1?'':'s'):'Sin Riders conectados ahora'}</span><span class="mapHint">Toca un Rider para ver su perfil</span></div>`);
  document.querySelector('#back').onclick=home;
  document.querySelector('#privacy').onclick=()=>privacy(map);
  document.querySelectorAll('[data-rider]').forEach(b=>b.onclick=()=>profile(b.dataset.rider));
}
async function profile(id){
  const pool=window.communityRiders||[];
  const r=pool.find(x=>String(x.id)===String(id));
  if(!r){map();return}
  const online=r.state==='green';
  let routeCount=null;
  if(supabaseClient&&r.id){try{const {count,error}=await supabaseClient.from('routes').select('id',{count:'exact',head:true}).eq('author_id',r.id);if(!error&&Number.isFinite(count))routeCount=count}catch{}}
  const city=esc(r.city||'—'),bio=esc(r.bio||'Rider de la comunidad eSKATESUV.');
  shell(`${topbar('PERFIL RIDER',true)}<div class="riderCover communityProfileCover"><div class="riderAvatar userAvatar" title="Foto de perfil del Rider"><div class="avatarPortrait avatar-${String(r.id).replace(/[^a-z0-9-]/gi,'').toLowerCase()}"><span>${esc((r.name||'R').slice(0,1).toUpperCase())}</span></div></div></div><div class="riderIdentity"><div><small>RIDER</small><h1>${esc(r.name)}</h1><p class="${online?'online':'offline'}">● ${online?'En línea':'Fuera de cobertura'}</p></div></div><div class="riderStats"><div><b>${city}</b><small>ZONA</small></div><div><b>${routeCount===null?'—':routeCount}</b><small>RUTAS</small></div><div><b>—</b><small>RETOS</small></div></div><div class="card riderAbout"><small>SOBRE MÍ</small><p>${bio}</p></div><button class="btn ${online?'':'disabledAction'}" id="message" ${online?'':'disabled'}>${online?'Enviar mensaje':'Fuera de cobertura'}</button><button class="btn secondary ${online?'':'disabledAction'}" id="voiceProfile" ${online?'':'disabled'}>Rider Voz</button>`);
  document.querySelector('#back').onclick=map;
  if(online){
    document.querySelector('#message').onclick=()=>chat(r);
    document.querySelector('#voiceProfile').onclick=()=>voiceInvite(r);
  }
}
async function chat(r){
  const current=(window.communityRiders||[]).find(x=>String(x.id)===String(r?.id));
  if(!r||!current||current.state!=='green'){if(r?.id)profile(r.id);else map();return}
  r=current;
  await flushPendingMessages(r.id);
  const remote=await fetchMessages(r.id);
  const local=savedMessages(r.id);
  const remoteHistory=remote===null?[]:remote.map(m=>({id:m.id||'',text:m.body||m.text||'',from:String(m.sender_id)===String(r.id)?'them':'me',at:m.created_at||''}));
  if(remote!==null)clearSyncedLocalMessages(r.id,remoteHistory);
  const currentLocal=savedMessages(r.id);
  const history=remote===null?local:remoteHistory.concat(currentLocal.filter(l=>l.pending||!remoteHistory.some(m=>(l.remoteId&&m.id&&String(m.id)===String(l.remoteId))||(!l.remoteId&&m.from===l.from&&m.text===l.text&&String(m.at||'')===String(l.at||'')))));
  history.sort((a,b)=>String(a.at||'').localeCompare(String(b.at||'')));
  shell(`${topbar('CHAT PRIVADO',true)}<div class="chatHead"><span class="profileMark">${esc((r.name||'R').slice(0,1).toUpperCase())}</span><div><small>CONVERSACIÓN CON</small><h2>${esc(r.name)}</h2></div></div><div class="chat" id="chat">${history.length?history.map(m=>'<div class="bubble '+(m.from==='them'?'them':'me')+(m.pending?' pending':'')+'">'+esc(m.text)+(m.pending?'<small class="messageState">Pendiente</small>':'')+'</div>').join(''):'<p class="sub center">Todavía no hay mensajes.</p>'}</div><button class="btn voice" id="voice">Invitar a Rider Voz</button><div class="composer"><input id="msg" maxlength="1000" autocomplete="off" enterkeyhint="send" placeholder="Escribe un mensaje..."><button id="send" aria-label="Enviar"><span class="sendGlyph"></span></button></div>`);
  
  const input=document.querySelector('#msg');
  const chatBox=document.querySelector('#chat');if(chatBox)chatBox.scrollTop=chatBox.scrollHeight;
  const send=async()=>{
    const value=input.value.trim();if(!value||input.disabled||!chatActive)return;
    input.disabled=true;const sendBtn=document.querySelector('#send');if(sendBtn)sendBtn.disabled=true;
    let live=null;
    if(navigator.onLine){const refreshed=await fetchCommunityRiders();window.communityRiders=refreshed;live=refreshed.find(x=>String(x.id)===String(r.id))}
    const sent=(navigator.onLine&&live?.state==='green')?await sendRemoteMessage(r.id,value):null;
    if(!sent)saveMessage(r.id,value);
    const empty=chatBox?.querySelector('.sub.center');if(empty)empty.remove();
    chatBox?.insertAdjacentHTML('beforeend',`<div class="bubble me${sent?'':' pending'}">${esc(value)}${sent?'':'<small class="messageState">Pendiente</small>'}</div>`);
    if(chatBox)chatBox.scrollTop=chatBox.scrollHeight;
    input.value='';input.disabled=false;if(sendBtn)sendBtn.disabled=false;input.focus();
  };
  document.querySelector('#send').onclick=send;
  input.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();send()}};
  let chatActive=true,retryingPending=false;
  const cleanupChat=()=>{chatActive=false;window.removeEventListener('online',retryPending);document.removeEventListener('visibilitychange',onVisible);if(screenCleanup===cleanupChat)screenCleanup=null};screenCleanup=cleanupChat;
  const retryPending=async()=>{if(!chatActive||retryingPending||document.visibilityState!=='visible'||!navigator.onLine)return;retryingPending=true;try{const sent=await flushPendingMessages(r.id);if(sent&&chatActive){cleanupChat();chat(r)}}finally{retryingPending=false}};
  const onVisible=()=>{if(document.visibilityState==='visible')retryPending()};
  document.querySelector('#voice').onclick=()=>{cleanupChat();voiceInvite(r)};
  const backBtn=document.querySelector('#back');backBtn.onclick=()=>{cleanupChat();profile(r.id)};
  window.addEventListener('online',retryPending);
  document.addEventListener('visibilitychange',onVisible);
}
async function voiceInvite(r){const current=(window.communityRiders||[]).find(x=>String(x.id)===String(r?.id));if(!r||!current||current.state!=='green'){if(r?.id)profile(r.id);else map();return}r=current;shell(topbar('RIDER VOZ',true)+'<div class="voiceInvitePanel"><div class="profileAvatar voiceInviteAvatar"><span class="voiceInviteGlyph"></span></div><small>INVITACIÓN DE VOZ</small><h1>Invitar a '+esc(r.name)+'</h1><p>La conversación comienza cuando el Rider acepta.</p><div class="inviteRider"><span class="profileMark">'+esc((r.name||'R').slice(0,1).toUpperCase())+'</span><span><strong>'+esc(r.name)+'</strong><small class="online">● En línea</small></span></div><button class="btn" id="invite">Enviar invitación</button><button class="btn secondary" id="cancel">Cancelar</button><p class="sub center" id="inviteStatus"></p></div>');let cancelPendingInvite=null;const go=async()=>{if(cancelPendingInvite)await cancelPendingInvite();chat(r)};document.querySelector('#back').onclick=go;document.querySelector('#cancel').onclick=go;document.querySelector('#invite').onclick=async e=>{if(e.currentTarget.disabled)return;const me=await currentUserId();if(!supabaseClient||!me){document.querySelector('#inviteStatus').textContent='No se pudo identificar tu sesión.';return}const sessionId=[String(me),String(r.id)].sort().join('-')+'-'+Date.now();const inviteId=await createVoiceInviteRecord(r.id,sessionId);if(!inviteId){document.querySelector('#inviteStatus').textContent='No se pudo registrar la invitación.';return}await ensureVoiceInbox();if(!voiceInboxChannel){await updateVoiceInviteRecord(inviteId,'expired');document.querySelector('#inviteStatus').textContent='No se pudo abrir el canal Rider Voz.';return}const inbox=supabaseClient.channel('rider-voice-inbox-'+r.id,{config:{broadcast:{self:false}}});let finished=false,inviteTimeout=null;const finish=()=>{if(finished)return;finished=true;if(inviteTimeout){clearTimeout(inviteTimeout);inviteTimeout=null}pendingVoiceResponses.delete(sessionId);cancelPendingInvite=null;try{inbox.unsubscribe()}catch{}};cancelPendingInvite=async()=>{if(finished)return;await updateVoiceInviteRecord(inviteId,'expired');finish()};pendingVoiceResponses.set(sessionId,payload=>{if(!payload||String(payload.to)!==String(me)||payload.sessionId!==sessionId)return;if(payload.accepted){sessionStorage.setItem('rider_voice_session',sessionId);sessionStorage.setItem('rider_voice_peer',String(r.id));document.querySelector('#inviteStatus').textContent=r.name+' ha aceptado · entrando en Rider Voz…';finish();setTimeout(()=>riderVoice(),250)}else{document.querySelector('#inviteStatus').textContent=payload.reason==='busy'?r.name+' está en otra conversación Rider Voz.':r.name+' ha rechazado la invitación.';e.currentTarget.disabled=false;e.currentTarget.textContent='Enviar invitación';finish()}});inbox.subscribe(async status=>{if(status!=='SUBSCRIBED')return;try{await inbox.send({type:'broadcast',event:'voice-invite',payload:{from:me,to:String(r.id),sessionId,inviteId,createdAt:Date.now()}});e.currentTarget.textContent='Invitación enviada';document.querySelector('#cancel').textContent='Volver al chat';document.querySelector('#inviteStatus').textContent='Esperando respuesta del Rider.';inviteTimeout=setTimeout(()=>{if(!finished){document.querySelector('#inviteStatus').textContent='Sin respuesta · puedes volver a intentarlo.';updateVoiceInviteRecord(inviteId,'expired');e.currentTarget.disabled=false;e.currentTarget.textContent='Enviar invitación';finish()}},30000)}catch{await updateVoiceInviteRecord(inviteId,'expired');e.currentTarget.disabled=false;e.currentTarget.textContent='Enviar invitación';document.querySelector('#inviteStatus').textContent='No se pudo enviar la invitación.';finish()}})}}
const routes=[];
async function sharedRoutes(){
  const liveRoutes=await fetchSharedRoutes();
  const uid=await currentUserId();
  if(uid&&supabaseClient){try{const {data}=await supabaseClient.from('route_favorites').select('route_id').eq('profile_id',uid);if(data){const db=dbLoad();db.favoriteRoutes=data.map(x=>x.route_id);dbSave(db)}}catch{}}
  window.communityRoutes=liveRoutes;
  const routeCards=liveRoutes.length?liveRoutes.map(r=>'<button class="routeCard" data-route="'+r.id+'"><span class="routeThumb"><i></i></span><span class="routeCardCopy"><small>'+esc(r.city||'RUTA RIDER')+'</small><strong>'+esc(r.name)+'</strong><em>'+r.km+' km'+(r.elevation!==null?' · +'+r.elevation+' m':'')+' · '+esc(r.author)+'</em></span><b>›</b></button>').join(''):'<p class="sub center">Todavía no hay rutas compartidas.</p>';
  shell(topbar('RUTAS COMPARTIDAS',true)+'<div class="screenHero routeHero"><div><small>RUTAS DE LA COMUNIDAD</small><h1>Descubrir rutas</h1><p>Explora y guarda rutas compartidas por otros Riders.</p></div></div><div class="routeList">'+routeCards+'</div>');
  document.querySelector('#back').onclick=home;
  document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>routeDetail(b.dataset.route));
}
function routeDetail(id){const pool=window.communityRoutes||[];const r=pool.find(x=>String(x.id)===String(id));if(!r){sharedRoutes();return}shell(topbar('RUTA COMPARTIDA',true)+'<div class="routePreview routeCanvas"><span class="routeLine"></span></div><h1>'+esc(r.name)+'</h1><p class="sub">'+esc(r.city)+' · por '+esc(r.author)+'</p><div class="stats"><div><b>'+r.km+'</b><small>km</small></div><div><b>'+esc(r.time)+'</b><small>duración</small></div><div><b>'+(r.elevation!==null?'+'+r.elevation+' m':'—')+'</b><small>desnivel</small></div></div><button class="btn" id="openRoute">Preparar ruta</button><button class="btn secondary" id="fav">♡ Guardar en favoritas</button>');document.querySelector('#back').onclick=sharedRoutes;const fav=document.querySelector('#fav');if(isFavorite(r.id))fav.textContent='♥ Guardada en favoritas';fav.onclick=async e=>{const wasFavorite=isFavorite(r.id);e.currentTarget.disabled=true;const on=await toggleFavorite(r.id);if(on===null){e.currentTarget.textContent=wasFavorite?'♥ Guardada · reintenta':'♡ No se pudo guardar · reintenta'}else{e.currentTarget.textContent=on?'♥ Guardada en favoritas':'♡ Guardar en favoritas'}e.currentTarget.disabled=false};document.querySelector('#openRoute').onclick=e=>{const btn=e.currentTarget;btn.textContent='Ruta preparada para navegación';btn.disabled=true;const db=dbLoad();db.preparedRoute={id:r.id,name:r.name,city:r.city,km:r.km,preparedAt:new Date().toISOString()};dbSave(db)}}
const challengeData=[];
async function challenges(){
  const liveChallenges=await fetchChallenges();
  const uid=await currentUserId();
  if(uid&&supabaseClient){try{const {data}=await supabaseClient.from('challenge_members').select('challenge_id').eq('profile_id',uid);if(data){const db=dbLoad();db.joinedChallenges=data.map(x=>x.challenge_id);dbSave(db)}}catch{}}
  window.communityChallenges=liveChallenges;
  const challengeCards=liveChallenges.length?liveChallenges.map(x=>{const target=Math.max(1,Number(x.target)||1),progress=Math.max(0,Number(x.progress)||0);const pct=Math.min(100,Math.round(progress/target*100));return '<button class="challengeCard" data-challenge="'+x.id+'"><span class="challengePct">'+pct+'%</span><span class="challengeCopy"><strong>'+esc(x.name)+'</strong><small>'+esc(x.desc)+'</small><span class="progress"><i style="width:'+pct+'%"></i></span><em>'+progress+' / '+target+' '+esc(x.unit)+'</em></span><b>›</b></button>'}).join(''):'<p class="sub center">Todavía no hay retos disponibles.</p>';
  shell(topbar('RETOS',true)+'<div class="screenHero challengeHero"><div><small>RETOS DE LA COMUNIDAD</small><h1>Retos</h1><p>Objetivos, progreso y participación Rider.</p></div></div><div class="challengeList">'+challengeCards+'</div>');
  document.querySelector('#back').onclick=home;
  document.querySelectorAll('[data-challenge]').forEach(b=>b.onclick=()=>challengeDetail(b.dataset.challenge));
}
function challengeDetail(id){const pool=window.communityChallenges||challengeData;const x=pool.find(v=>String(v.id)===String(id))||challengeData.find(v=>String(v.id)===String(id));if(!x){challenges();return}const target=Math.max(1,Number(x.target)||1),progress=Math.max(0,Number(x.progress)||0);const pct=Math.min(100,Math.round(progress/target*100));shell(topbar('RETO',true)+'<div class="challengeBadge"><span>'+pct+'%</span><small>PROGRESO</small></div><h1 class="center">'+esc(x.name)+'</h1><p class="sub center">'+esc(x.desc)+'</p><div class="bigProgress">'+pct+'%</div><span class="progress"><i style="width:'+pct+'%"></i></span><p class="center">'+progress+' / '+target+' '+esc(x.unit)+'</p><button class="btn" id="join">Unirme al reto</button>');document.querySelector('#back').onclick=challenges;const join=document.querySelector('#join');if(joinedChallenge(x.id)){join.textContent='Reto activo';join.disabled=true}join.onclick=async e=>{e.currentTarget.disabled=true;e.currentTarget.textContent='Uniéndome…';const remote=await joinChallenge(x.id);if(remote){e.currentTarget.textContent='Reto activo'}else{e.currentTarget.textContent='No se pudo unir · reintenta';e.currentTarget.disabled=false}}}
function privacy(returnTo=map){shell(topbar('PRIVACIDAD',true)+'<div class="screenHero privacyHero"><div><small>CONTROL RIDER</small><h1>Ubicación</h1><p>Tú decides cuándo apareces en la comunidad.</p></div></div><div class="card"><h3>Compartir mi ubicación</h3><p id="shareStatus">'+(state.locationSharing?'Activada':'Desactivada')+'</p><button class="btn secondary" id="toggleShare">'+(state.locationSharing?'Desactivar':'Activar')+'</button></div><p class="sub">Al desactivarla, Comunidad deja de solicitar tu ubicación. Puedes volver a activarla cuando quieras.</p>');document.querySelector('#back').onclick=returnTo;document.querySelector('#toggleShare').onclick=()=>{if(state.locationSharing){state.locationSharing=false;saveState();stopRiderLocationHeartbeat();clearRiderLocation().finally(()=>privacy(returnTo));return}const btn=document.querySelector('#toggleShare');if(btn){btn.disabled=true;btn.textContent='Activando…'}requestLocation(pos=>{if(!pos){state.locationSharing=false;saveState();if(btn){btn.disabled=false;btn.textContent='Activar'}const status=document.querySelector('#shareStatus');if(status)status.textContent='No se pudo obtener la ubicación';return}state.locationConsent=true;publishRiderLocation(pos).then(ok=>{if(!ok){state.locationSharing=false;saveState();if(btn){btn.disabled=false;btn.textContent='Activar'}const status=document.querySelector('#shareStatus');if(status)status.textContent='No se pudo compartir la ubicación';return}state.locationSharing=true;saveState();privacy(returnTo)}).catch(()=>{state.locationSharing=false;saveState();if(btn){btn.disabled=false;btn.textContent='Activar'}const status=document.querySelector('#shareStatus');if(status)status.textContent='No se pudo compartir la ubicación'})})}}
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
    if(uid&&supabaseClient){try{const {error}=await supabaseClient.from('profiles').upsert({id:uid,...profile},{onConflict:'id'});remote=!error}catch{}}
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
  shell(`<div class="sectionEyebrow">eSKATESUV · COMUNIDAD</div><div class="row spread"><div><small class="voiceLabel">RIDER VOZ</small><h1 class="voiceTitle">Conexión de voz</h1></div><button class="mini" id="back">‹</button></div><div class="voiceCockpit"><div class="voiceRing"><div class="voiceWave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><strong>LISTO</strong><small id="voiceSpeaker">Sin grupo activo</small></div></div><div class="voiceParticipants" id="voiceParticipants"><small>GRUPO RIDER</small><div id="voiceGroup"><span class="emptyGroup">Añade Riders para crear el grupo</span></div></div><div class="voiceControls"><button class="voiceControl" id="mute"><span class="voiceMicGlyph" aria-hidden="true"></span><small>Micrófono ON</small></button><button class="voiceControl primaryVoice" id="find"><span class="voiceAddGlyph" aria-hidden="true">+</span><small>Rider</small></button><button class="voiceControl" id="volume"><span class="voiceVolumeGlyph" aria-hidden="true"></span><small>Volumen</small></button></div><div class="voiceStatus"><i></i><span>Manos libres · esperando grupo</span></div><button class="btn voiceExit hidden" id="leaveVoice">Salir del grupo</button><div class="riderPicker hidden" id="riderPicker"><div class="pickerHead"><div><small>AÑADIR AL GRUPO</small><h2>Riders</h2></div><button id="closePicker">×</button></div><div class="pickerList">${selectable.length?selectable.map(r=>`<button class="pickerRider" data-add-rider="${r.id}"><span class="profileMark">${esc((r.name||'R').slice(0,1).toUpperCase())}</span><span><strong>${esc(r.name)}</strong><small class="online">● En línea</small></span><b>+</b></button>`).join(''):'<p class="pickerEmpty">No hay Riders conectados ahora mismo.</p>'}${offline.map(r=>`<div class="pickerRider unavailable"><span class="profileMark">${esc((r.name||'R').slice(0,1).toUpperCase())}</span><span><strong>${esc(r.name)}</strong><small class="offline">● Fuera de cobertura</small></span><b>×</b></div>`).join('')}</div></div>`);
  document.querySelector('#back').onclick=()=>{document.body.classList.remove('pickerOpen');home()};
  const picker=document.querySelector('#riderPicker'),group=document.querySelector('#voiceGroup'),leave=document.querySelector('#leaveVoice');
  const invitedSession=sessionStorage.getItem('rider_voice_session');const invitedPeer=sessionStorage.getItem('rider_voice_peer');const storedVoiceGroup=(dbLoad().voiceGroup||[]).map(String).filter(id=>availableIds.has(id));if(invitedPeer&&!storedVoiceGroup.includes(String(invitedPeer)))storedVoiceGroup.push(String(invitedPeer));const selected=new Map(storedVoiceGroup.map(id=>{let r=selectable.find(x=>String(x.id)===id);if(!r&&invitedPeer&&String(invitedPeer)===id)r=pool.find(x=>String(x.id)===id)||{id,name:'Rider',state:'green'};return r?[id,r]:null}).filter(Boolean));
  const renderGroup=()=>{const db=dbLoad();db.voiceGroup=[...selected.keys()];dbSave(db);const speaker=document.querySelector('#voiceSpeaker'),status=document.querySelector('.voiceStatus span');if(speaker)speaker.textContent=selected.size?(selected.size===1?[...selected.values()][0].name:selected.size+' Riders en el grupo'):'Sin grupo activo';if(status)status.textContent=selected.size?'Grupo preparado · esperando conexión':'Manos libres · esperando grupo';group.innerHTML=selected.size?[...selected.values()].map(r=>`<button class="groupRider" data-remove-rider="${r.id}" title="Quitar Rider"><span class="profileMark">${esc((r.name||'R').slice(0,1).toUpperCase())}</span><small>${esc(r.name)}</small><span class="voiceQualityBadge" aria-label="Audio sin medir">○ AUDIO</span><b>×</b></button>`).join(''):'<span class="emptyGroup">Añade Riders para crear el grupo</span>';leave.classList.toggle('hidden',!selected.size);document.querySelectorAll('[data-remove-rider]').forEach(b=>b.onclick=()=>{const id=String(b.dataset.removeRider);selected.delete(id);const rtc=window.riderVoiceRtc;if(rtc){rtc.channel.send({type:'broadcast',event:'leave',payload:{from:rtc.me,to:id}});const pc=rtc.peers.get(id);if(pc){pc.close();rtc.peers.delete(id)}rtc.voiceStats?.delete?.(id);const audio=document.querySelector('audio[data-voice-rider="'+id+'"]');if(audio){try{audio.pause();audio.srcObject=null}catch{}audio.remove()}}renderGroup();if(voiceActive&&!selected.size){voiceActive=false;releaseVoiceMedia();setVoiceState('ready','Grupo finalizado · sin Riders')}})};
  document.querySelector('#find').onclick=()=>{picker.classList.remove('hidden');document.body.classList.add('pickerOpen')};
  const closePicker=()=>{picker.classList.add('hidden');document.body.classList.remove('pickerOpen')};
  document.querySelector('#closePicker').onclick=closePicker;
  document.querySelectorAll('[data-add-rider]').forEach(b=>{const id=String(b.dataset.addRider);if(selected.has(id)){b.classList.add('selected');b.querySelector('b').textContent='•'}b.onclick=()=>{const r=selectable.find(x=>String(x.id)===id);if(!r)return;if(selected.has(id)){selected.delete(id);const rtc=window.riderVoiceRtc;if(rtc){rtc.channel.send({type:'broadcast',event:'leave',payload:{from:rtc.me,to:id}});const pc=rtc.peers.get(id);if(pc){pc.close();rtc.peers.delete(id)}rtc.voiceStats?.delete?.(id);const audio=document.querySelector('audio[data-voice-rider="'+id+'"]');if(audio){try{audio.pause();audio.srcObject=null}catch{}audio.remove()}}b.classList.remove('selected');b.querySelector('b').textContent='+'}else{selected.set(id,r);b.classList.add('selected');b.querySelector('b').textContent='✓'}renderGroup();if(voiceActive&&!selected.size){voiceActive=false;releaseVoiceMedia();setVoiceState('ready','Grupo finalizado · sin Riders')}}});
  document.querySelector('#mute').onclick=e=>{e.currentTarget.classList.toggle('muted');e.currentTarget.querySelector('small').textContent=e.currentTarget.classList.contains('muted')?'Micrófono OFF':'Micrófono ON'};const volume=document.querySelector('#volume');volume.onclick=e=>{const off=!e.currentTarget.classList.contains('muted');e.currentTarget.classList.toggle('muted',off);document.querySelectorAll('audio[data-voice-rider]').forEach(a=>{a.muted=off;if(!off)a.play().catch(()=>{})});e.currentTarget.querySelector('small').textContent=off?'Audio OFF':'Volumen'};
  leave.onclick=()=>{selected.clear();document.querySelectorAll('[data-add-rider]').forEach(b=>{b.classList.remove('selected');const mark=b.querySelector('b');if(mark)mark.textContent='+'});closePicker();renderGroup()};
  picker.addEventListener('click',e=>{if(e.target===picker)closePicker()});
  let voiceActive=false,voiceChecking=false;
  const voiceRing=document.querySelector('.voiceRing');
  const setVoiceState=(mode,text)=>{
    voiceActive=mode==='active';
    if(voiceRing){voiceRing.classList.toggle('active',voiceActive);const strong=voiceRing.querySelector('strong');if(strong)strong.textContent=voiceActive?'EN VOZ':'LISTO'}
    const status=document.querySelector('.voiceStatus span');if(status)status.textContent=text;
  };
  const checkVoiceCoverage=async()=>{
    if(!voiceActive||voiceChecking)return;
    voiceChecking=true;
    try{
      const refreshed=await fetchCommunityRiders();window.communityRiders=refreshed;
      const onlineIds=new Set(refreshed.filter(x=>x.state==='green').map(x=>String(x.id)));
      let removed=0;
      for(const id of [...selected.keys()]){if(!onlineIds.has(id)){selected.delete(id);removed++}}
      if(removed){
        renderGroup();
        if(!selected.size){voiceActive=false;releaseVoiceMedia();setVoiceState('ready','Grupo finalizado · Riders fuera de cobertura')}
        else setVoiceState('active',removed+' Rider fuera de cobertura · voz continúa');
      }
    }finally{voiceChecking=false}
  };
  let localVoiceStream=null;
  const releaseVoiceMedia=()=>{
    const closingSession=sessionStorage.getItem('rider_voice_session');
    if(closingSession)endVoiceInviteSession(closingSession).catch(()=>{});
    if(window.riderVoiceRtc){const rtc=window.riderVoiceRtc;if(rtc.voiceHealthTimer)clearInterval(rtc.voiceHealthTimer);if(rtc.readyTimer)clearInterval(rtc.readyTimer);if(rtc.networkChanged){window.removeEventListener('offline',rtc.networkChanged);window.removeEventListener('online',rtc.networkChanged)}const leaveSignals=[...rtc.peers.keys()].map(remoteId=>rtc.channel.send({type:'broadcast',event:'leave',payload:{from:rtc.me,to:remoteId}}).catch(()=>{}));for(const pc of rtc.peers.values())pc.close();rtc.peers.clear();rtc.voiceStats?.clear?.();Promise.allSettled(leaveSignals).finally(()=>rtc.channel.unsubscribe());window.riderVoiceRtc=null}
    document.querySelectorAll('audio[data-voice-rider]').forEach(a=>{try{a.pause();a.srcObject=null}catch{}a.remove()});document.querySelectorAll('.voiceQualityBadge').forEach(x=>x.remove());document.querySelectorAll('[data-voice-quality]').forEach(x=>{delete x.dataset.voiceQuality;x.classList.remove('speaking')});
    if(localVoiceStream){localVoiceStream.getTracks().forEach(track=>track.stop());localVoiceStream=null}window.riderVoiceLocalStream=null
    sessionStorage.removeItem('rider_voice_session');sessionStorage.removeItem('rider_voice_peer');sessionStorage.removeItem('rider_voice_closing');
  };
  let voiceStarting=false;
  const startVoice=async()=>{
    if(voiceStarting){setVoiceState('ready','Conectando Rider Voz…');return}
    if(!selected.size){setVoiceState('ready','Añade al menos un Rider al grupo');return}
    if(voiceActive||localVoiceStream){setVoiceState('active','Rider Voz ya está iniciado');return}
    if(!navigator.mediaDevices?.getUserMedia){setVoiceState('ready','Micrófono no disponible en este dispositivo');return}
    const startBtn=document.querySelector('#startVoice');voiceStarting=true;if(startBtn){startBtn.disabled=true;startBtn.textContent='Conectando…'}
    try{
      setVoiceState('ready','Solicitando acceso al micrófono…');
      localVoiceStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});window.riderVoiceLocalStream=localVoiceStream;
      const audioTrack=localVoiceStream.getAudioTracks()[0];
      if(audioTrack){audioTrack.onmute=()=>{if(voiceActive)setVoiceState('active','Micrófono interrumpido · esperando audio…')};audioTrack.onunmute=()=>{if(voiceActive)setVoiceState('active','Micrófono recuperado · Rider Voz activo')};audioTrack.onended=()=>{voiceActive=false;releaseVoiceMedia();setVoiceState('ready','Micrófono desconectado · vuelve a iniciar Rider Voz')};const settings=audioTrack.getSettings?.()||{};const requested=['echoCancellation','noiseSuppression','autoGainControl'];const enabled=requested.filter(k=>settings[k]===true);const unavailable=requested.filter(k=>settings[k]===false);const label=enabled.length===3?'Audio optimizado: eco · ruido · ganancia':enabled.length?'Audio optimizado: '+enabled.length+'/3 filtros activos':'Audio del dispositivo activo';setVoiceState('ready',label+(unavailable.length?' · '+unavailable.length+' no disponibles':''))}
      const muteBtn=document.querySelector('#mute');
      if(muteBtn&&audioTrack){
        muteBtn.classList.remove('muted');
        muteBtn.querySelector('small').textContent='Micrófono ON';
        muteBtn.onclick=e=>{audioTrack.enabled=!audioTrack.enabled;e.currentTarget.classList.toggle('muted',!audioTrack.enabled);e.currentTarget.querySelector('small').textContent=audioTrack.enabled?'Micrófono ON':'Micrófono OFF'};
      }
      setVoiceState('active','Rider Voz activo · micrófono preparado');
      const me=await currentUserId();
      if(supabaseClient&&me){
        const sessionId=sessionStorage.getItem('rider_voice_session');const channelKey=sessionId||[me,...selected.keys()].sort().join('-');const channel=supabaseClient.channel('rider-voice-'+channelKey,{config:{broadcast:{self:false}}});
        const peers=new Map(),readyPeers=new Set(),readyAttempts=new Map();
        const sendReady=async remoteId=>{remoteId=String(remoteId);if(readyPeers.has(remoteId))return;const tries=(readyAttempts.get(remoteId)||0)+1;readyAttempts.set(remoteId,tries);await channel.send({type:'broadcast',event:'ready',payload:{from:me,to:remoteId,attempt:tries}})};
        const makePeer=async(remoteId,initiator)=>{
          remoteId=String(remoteId);let pc=peers.get(remoteId);if(pc)return pc;
          pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});peers.set(remoteId,pc);
          localVoiceStream.getTracks().forEach(track=>pc.addTrack(track,localVoiceStream));
          pc.ontrack=e=>{let audio=document.querySelector('audio[data-voice-rider="'+remoteId+'"]');if(!audio){audio=document.createElement('audio');audio.autoplay=true;audio.playsInline=true;audio.dataset.voiceRider=remoteId;document.body.appendChild(audio)}audio.srcObject=e.streams[0];audio.onplaying=()=>{const card=document.querySelector('[data-remove-rider="'+remoteId+'"]');if(card)card.classList.add('speaking')};audio.onpause=audio.onended=()=>{const card=document.querySelector('[data-remove-rider="'+remoteId+'"]');if(card)card.classList.remove('speaking')};audio.play().catch(()=>setVoiceState('active','Audio recibido · toca Volumen para escucharlo'))};
          pc.onicecandidate=e=>{if(e.candidate)channel.send({type:'broadcast',event:'ice',payload:{from:me,to:remoteId,candidate:e.candidate}})};
          pc.oniceconnectionstatechange=()=>{const s=pc.iceConnectionState;if(s==='checking')setVoiceState('active','Negociando ruta de audio…');if(s==='connected'||s==='completed')setTimeout(()=>window.riderVoiceRtc?.refreshVoiceQuality?.(),0);if(s==='failed')setVoiceState('active','Ruta de audio bloqueada · intentando alternativa…')};
          pc.onicecandidateerror=e=>{const msg=e?.errorCode===701?'Servidor STUN no accesible':'Error de ruta ICE';setVoiceState('active',msg+' · buscando alternativa…')};
          let reconnectTimer=null;
          pc.onconnectionstatechange=async()=>{const s=pc.connectionState;if(s==='connected'){if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null}setVoiceState('active','Rider Voz conectado · audio en directo');setTimeout(()=>window.riderVoiceRtc?.refreshVoiceQuality?.(),0)}if(s==='disconnected'){setVoiceState('active','Conexión de voz inestable · reconectando…');if(String(me)<String(remoteId)&&!reconnectTimer)reconnectTimer=setTimeout(async()=>{reconnectTimer=null;if(pc.connectionState==='disconnected'&&pc.signalingState==='stable'){try{const offer=await pc.createOffer({iceRestart:true});await pc.setLocalDescription(offer);await channel.send({type:'broadcast',event:'offer',payload:{from:me,to:remoteId,sdp:offer}})}catch{setVoiceState('active','No se pudo recuperar la conexión de voz')}}},2500)}if(s==='failed'){setVoiceState('active','Reconectando Rider Voz…');if(String(me)<String(remoteId)&&pc.signalingState==='stable')try{const offer=await pc.createOffer({iceRestart:true});await pc.setLocalDescription(offer);await channel.send({type:'broadcast',event:'offer',payload:{from:me,to:remoteId,sdp:offer}})}catch{setVoiceState('active','No se pudo recuperar la conexión de voz')}}if(s==='closed'){if(reconnectTimer)clearTimeout(reconnectTimer);peers.delete(remoteId)}};
          if(initiator&&readyPeers.has(remoteId)){const offer=await pc.createOffer();await pc.setLocalDescription(offer);channel.send({type:'broadcast',event:'offer',payload:{from:me,to:remoteId,sdp:offer}})}
          return pc;
        };
        const flushIce=async pc=>{if(!pc?.remoteDescription)return;for(const candidate of (pc._pendingIce||[]).splice(0)){try{await pc.addIceCandidate(candidate)}catch{}}};
        channel.on('broadcast',{event:'ready'},async({payload})=>{if(String(payload?.to)!==String(me))return;const remoteId=String(payload.from),wasReady=readyPeers.has(remoteId);readyPeers.add(remoteId);if(!wasReady)await channel.send({type:'broadcast',event:'ready',payload:{from:me,to:remoteId,ack:true}});if(String(me)<remoteId){const pc=await makePeer(remoteId,false);if(pc.signalingState==='stable'&&!pc.localDescription){const offer=await pc.createOffer();await pc.setLocalDescription(offer);await channel.send({type:'broadcast',event:'offer',payload:{from:me,to:remoteId,sdp:offer}})}}})
          .on('broadcast',{event:'offer'},async({payload})=>{if(String(payload?.to)!==String(me))return;const pc=await makePeer(payload.from,false);if(pc.signalingState!=='stable')return;await pc.setRemoteDescription(payload.sdp);await flushIce(pc);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);channel.send({type:'broadcast',event:'answer',payload:{from:me,to:payload.from,sdp:answer}})})
          .on('broadcast',{event:'answer'},async({payload})=>{if(String(payload?.to)!==String(me))return;const pc=peers.get(String(payload.from))||peers.get(payload.from);if(pc&&pc.signalingState==='have-local-offer'){await pc.setRemoteDescription(payload.sdp);await flushIce(pc)}})
          .on('broadcast',{event:'ice'},async({payload})=>{if(String(payload?.to)!==String(me))return;const pc=await makePeer(payload.from,false);if(pc&&payload.candidate){if(pc.remoteDescription){try{await pc.addIceCandidate(payload.candidate)}catch{}}else{(pc._pendingIce||(pc._pendingIce=[])).push(payload.candidate)}}})
          .on('broadcast',{event:'leave'},({payload})=>{if(payload?.to&&String(payload.to)!==String(me))return;const id=String(payload?.from||'');const pc=peers.get(id)||peers.get(payload?.from);if(pc){pc.close();peers.delete(id);peers.delete(payload?.from)}voiceStats.delete(id);readyPeers.delete(id);readyAttempts.delete(id);const audio=document.querySelector('audio[data-voice-rider="'+id+'"]');if(audio){try{audio.pause();audio.srcObject=null}catch{}audio.remove()}selected.delete(id);renderGroup();if(!selected.size){voiceActive=false;releaseVoiceMedia();setVoiceState('ready','Grupo finalizado · el Rider ha salido');return}setTimeout(()=>window.riderVoiceRtc?.refreshVoiceQuality?.(),0)})
          .subscribe(async status=>{if(status==='SUBSCRIBED'){for(const remoteId of selected.keys())await sendReady(String(remoteId))}});const readyTimer=setInterval(()=>{if(!voiceActive)return;for(const remoteId of selected.keys())if(!readyPeers.has(String(remoteId))&&(readyAttempts.get(String(remoteId))||0)<6)sendReady(String(remoteId)).catch(()=>{})},1500);
        const connectedCount=()=>[...peers.values()].filter(pc=>pc.connectionState==='connected').length;
        const voiceStats=new Map();
        let qualityBusy=false;
        const refreshVoiceQuality=async()=>{if(!voiceActive||qualityBusy)return;qualityBusy=true;try{const n=connectedCount();let worst=0;for(const [remoteId,pc] of peers){if(pc.connectionState!=='connected')continue;try{const stats=await pc.getStats();let pair=null,inbound=null;stats.forEach(r=>{if(r.type==='candidate-pair'&&r.state==='succeeded'&&r.nominated)pair=r;if(r.type==='inbound-rtp'&&r.kind==='audio'&&!r.isRemote)inbound=r});const rtt=pair&&Number.isFinite(pair.currentRoundTripTime)?Math.round(pair.currentRoundTripTime*1000):null;const prev=voiceStats.get(remoteId)||{};let lossPct=null;if(inbound&&Number.isFinite(inbound.packetsLost)&&Number.isFinite(inbound.packetsReceived)){const lostDelta=Math.max(0,inbound.packetsLost-(prev.lost||0)),recvDelta=Math.max(0,inbound.packetsReceived-(prev.received||0)),total=lostDelta+recvDelta;if(total)lossPct=Math.round(lostDelta*100/total);voiceStats.set(remoteId,{rtt,lost:inbound.packetsLost,received:inbound.packetsReceived,lossPct});const card=document.querySelector('[data-remove-rider="'+remoteId+'"]');if(card){const q=(lossPct===null&&rtt===null)?'':((lossPct!==null&&lossPct>=8)||(rtt!==null&&rtt>=250))?'weak':((lossPct!==null&&lossPct>=3)||(rtt!==null&&rtt>=120))?'medium':'good';card.dataset.voiceQuality=q;card.title='Audio Rider'+(rtt===null?'':' · '+rtt+' ms')+(lossPct===null?'':' · '+lossPct+'% pérdida');let badge=card.querySelector('.voiceQualityBadge');if(!badge){badge=document.createElement('span');badge.className='voiceQualityBadge';card.appendChild(badge)}badge.textContent=q==='good'?'● AUDIO':q==='medium'?'● AUDIO':q==='weak'?'● AUDIO':'○ AUDIO';badge.setAttribute('aria-label',q==='good'?'Audio bueno':q==='medium'?'Audio medio':q==='weak'?'Audio débil':'Audio sin medir')}}else voiceStats.set(remoteId,{...prev,rtt});const score=Math.max(rtt===null?0:rtt>=250?2:rtt>=120?1:0,lossPct===null?0:lossPct>=8?2:lossPct>=3?1:0);worst=Math.max(worst,score)}catch{}}if(n)setVoiceState('active','Rider Voz conectado · '+n+' enlace'+(n===1?'':'s')+' de audio · '+(worst===0?'señal buena':worst===1?'señal media':'señal débil'))}finally{qualityBusy=false}};
        let healthMisses=0;
        const voiceHealthTimer=setInterval(()=>{if(!voiceActive)return;const total=peers.size,n=connectedCount();if(total&&n===0){healthMisses++;setVoiceState('active',healthMisses>=3?'Sin enlace de audio · revisa conexión':'Conectando audio Rider…')}else{healthMisses=0;if(n<total)setVoiceState('active','Rider Voz · '+n+'/'+total+' enlaces conectados');else if(n)refreshVoiceQuality()}},5000);
        const networkChanged=async()=>{if(!voiceActive)return;if(!navigator.onLine){setVoiceState('active','Sin Internet · Rider Voz en pausa');return}setVoiceState('active','Red recuperada · reconectando voz…');for(const [remoteId,pc] of peers){if(String(me)>=String(remoteId)||pc.signalingState!=='stable')continue;try{const offer=await pc.createOffer({iceRestart:true});await pc.setLocalDescription(offer);await channel.send({type:'broadcast',event:'offer',payload:{from:me,to:remoteId,sdp:offer}})}catch{setVoiceState('active','Red recuperada · reintentando audio…')}}};
        window.addEventListener('offline',networkChanged);window.addEventListener('online',networkChanged);
        window.riderVoiceRtc={channel,peers,me,sessionId,voiceHealthTimer,readyTimer,refreshVoiceQuality,networkChanged,voiceStats};
      }
    }catch(err){
      releaseVoiceMedia();
      setVoiceState('ready',err?.name==='NotAllowedError'?'Permiso de micrófono denegado':'No se pudo activar el micrófono');
    }finally{
      voiceStarting=false;
      if(startBtn){startBtn.disabled=false;startBtn.textContent=voiceActive?'Rider Voz activo':'Iniciar Rider Voz'}
    }
  };
  const syncVoiceMembers=async()=>{
    const refreshed=await fetchCommunityRiders();window.communityRiders=refreshed;
    const onlineIds=new Set(refreshed.filter(x=>x.state==='green').map(x=>String(x.id)));
    let changed=false;
    for(const id of [...selected.keys()]){if(!onlineIds.has(id)){selected.delete(id);const rtc=window.riderVoiceRtc;if(rtc){try{await rtc.channel.send({type:'broadcast',event:'leave',payload:{from:rtc.me,to:id}})}catch{}const pc=rtc.peers.get(id);if(pc){pc.close();rtc.peers.delete(id)}rtc.voiceStats?.delete?.(id);const audio=document.querySelector('audio[data-voice-rider="'+id+'"]');if(audio){try{audio.pause();audio.srcObject=null}catch{}audio.remove()}}changed=true}}
    if(changed)renderGroup();
    if(voiceActive&&!selected.size){voiceActive=false;releaseVoiceMedia();setVoiceState('ready','Grupo finalizado · sin Riders disponibles')}
  };
  const onVoiceVisible=()=>{if(document.visibilityState==='visible')syncVoiceMembers()};
  const onVoiceOnline=()=>syncVoiceMembers();
  document.addEventListener('visibilitychange',onVoiceVisible);
  window.addEventListener('online',onVoiceOnline);
  const voiceStart=document.createElement('button');
  voiceStart.className='btn';
  voiceStart.id='startVoice';
  voiceStart.textContent='Iniciar Rider Voz';
  leave.parentNode.insertBefore(voiceStart,leave);
  voiceStart.onclick=startVoice;
  if(invitedSession&&invitedPeer&&selected.has(String(invitedPeer))){setVoiceState('ready','Invitación aceptada · conectando Rider Voz…');setTimeout(()=>startVoice(),150)}
  const voiceTimer=setInterval(checkVoiceCoverage,15000);
  const stopVoiceWatch=()=>{clearInterval(voiceTimer);releaseVoiceMedia();document.removeEventListener('visibilitychange',onVoiceVisible);window.removeEventListener('online',onVoiceOnline);if(screenCleanup===stopVoiceWatch)screenCleanup=null};screenCleanup=stopVoiceWatch;
  const originalBack=document.querySelector('#back').onclick;
  document.querySelector('#back').onclick=()=>{stopVoiceWatch();originalBack()};
  const originalLeave=leave.onclick;
  leave.onclick=()=>{voiceActive=false;stopVoiceWatch();originalLeave();setVoiceState('ready','Manos libres · esperando grupo')};
  renderGroup();
}
boot();