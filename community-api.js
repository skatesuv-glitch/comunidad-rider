import {backendConfig,remoteReady} from './backend-config.js';

async function request(path,options={}){
  if(!remoteReady()) throw new Error('REMOTE_BACKEND_NOT_CONFIGURED');
  const res=await fetch(backendConfig.url+path,{...options,headers:{'Content-Type':'application/json','Authorization':'Bearer '+backendConfig.publicKey,...options.headers}});
  if(!res.ok) throw new Error('REMOTE_'+res.status);
  return res.status===204?null:res.json();
}

export const communityApi={
  createProfile:data=>request('/profiles',{method:'POST',body:JSON.stringify(data)}),
  updatePresence:data=>request('/presence',{method:'PUT',body:JSON.stringify(data)}),
  publishLocation:data=>request('/locations',{method:'PUT',body:JSON.stringify(data)}),
  nearbyRiders:()=>request('/riders/nearby'),
  conversations:()=>request('/conversations'),
  messages:id=>request('/conversations/'+encodeURIComponent(id)+'/messages'),
  sendMessage:(id,text)=>request('/conversations/'+encodeURIComponent(id)+'/messages',{method:'POST',body:JSON.stringify({text})}),
  routes:()=>request('/routes'),
  publishRoute:data=>request('/routes',{method:'POST',body:JSON.stringify(data)}),
  challenges:()=>request('/challenges')
};