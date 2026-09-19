const KEY='comunidad_rider_v1';
const seed={profile:{id:'me',name:'Mi Rider',sharing:false},messages:{},favoriteRoutes:[],joinedChallenges:[]};
function load(){try{return {...seed,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...seed}}}
function save(db){localStorage.setItem(KEY,JSON.stringify(db));return db}
export const communityStore={
getProfile(){return load().profile},
setProfile(p){const db=load();db.profile={...db.profile,...p};save(db);return db.profile},
getMessages(id){return load().messages[id]||[]},
addMessage(id,text,from='me'){const db=load();db.messages[id]??=[];const msg={id:String(Date.now()),text,from,createdAt:new Date().toISOString()};db.messages[id].push(msg);save(db);return msg},
toggleFavorite(routeId){const db=load(),id=Number(routeId),i=db.favoriteRoutes.indexOf(id);i<0?db.favoriteRoutes.push(id):db.favoriteRoutes.splice(i,1);save(db);return db.favoriteRoutes.includes(id)},
joinChallenge(challengeId){const db=load(),id=Number(challengeId);if(!db.joinedChallenges.includes(id))db.joinedChallenges.push(id);save(db);return true}
};