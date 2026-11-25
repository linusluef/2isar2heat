/* 2Isar2Heat — player accounts and cloud saves.
   Uses Firebase Authentication (name or e-mail + password) and Cloud Firestore through their REST APIs,
   so no extra library is needed. Each player can only read and write their own document players/{uid}.
   Without Firebase settings the game falls back to device saves and portable save codes. */
(function(){
'use strict';
const IH=window.IH=window.IH||{};
const CFG=(window.IH_CONFIG&&window.IH_CONFIG.firebase)||{};
const AUTH=CFG.authBase||'https://identitytoolkit.googleapis.com/v1/';
const TOKEN=CFG.tokenBase||'https://securetoken.googleapis.com/v1/';
const STORE=CFG.storeBase||'https://firestore.googleapis.com/v1/';
const KEY='2isar2heat.auth';
const NAME_DOMAIN='@spieler.2isar2heat.app';
const ERR={EMAIL_EXISTS:'Dieser Name ist schon vergeben.',EMAIL_NOT_FOUND:'Name oder Passwort falsch.',INVALID_PASSWORD:'Name oder Passwort falsch.',INVALID_LOGIN_CREDENTIALS:'Name oder Passwort falsch.',
  USER_DISABLED:'Dieses Konto ist gesperrt.',TOO_MANY_ATTEMPTS_TRY_LATER:'Zu viele Versuche – bitte kurz warten.',WEAK_PASSWORD:'Das Passwort braucht mindestens 6 Zeichen.',INVALID_EMAIL:'Bitte einen gültigen Namen oder eine E-Mail eingeben.',
  OPERATION_NOT_ALLOWED:'Anmeldung mit Passwort ist im Firebase-Projekt noch nicht eingeschaltet.',CONFIGURATION_NOT_FOUND:'Firebase-Projekt nicht gefunden – config.js prüfen.',API_KEY_INVALID:'Der API-Schlüssel in config.js ist ungültig.'};
const acc=IH.account={configured:!!(CFG.apiKey&&CFG.projectId),user:null,busy:false,lastSync:0,onChange:null,error:''};
let sess=null;try{sess=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}
if(sess&&acc.configured)acc.user={uid:sess.uid,name:sess.name};else sess=null;
function persist(){try{if(sess)localStorage.setItem(KEY,JSON.stringify(sess));else localStorage.removeItem(KEY)}catch(e){}}
function changed(){if(acc.onChange)acc.onChange()}
function translit(n){return n.toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'')}
function loginId(id){id=String(id||'').trim();if(id.includes('@'))return id;const t=translit(id);return t?t+NAME_DOMAIN:''}
async function post(url,body,form){
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'},body:form?new URLSearchParams(body).toString():JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok){const code=((j.error&&j.error.message)||'FEHLER').split(' ')[0].split(':')[0];const e=new Error(ERR[code]||('Fehler: '+code));e.code=code;throw e}
  return j;
}
async function token(){
  if(!sess)throw new Error('Nicht angemeldet');
  if(sess.idToken&&Date.now()<sess.exp-60000)return sess.idToken;
  const j=await post(TOKEN+'token?key='+encodeURIComponent(CFG.apiKey),{grant_type:'refresh_token',refresh_token:sess.refresh},true);
  sess.idToken=j.id_token;sess.refresh=j.refresh_token||sess.refresh;sess.exp=Date.now()+(+j.expires_in||3600)*1000;persist();return sess.idToken;
}
function docUrl(){return STORE+'projects/'+encodeURIComponent(CFG.projectId)+'/databases/(default)/documents/players/'+encodeURIComponent(sess.uid)}
async function auth(kind,id,pw){
  if(!acc.configured)throw new Error('Konten sind noch nicht eingerichtet.');
  const email=loginId(id);if(!email)throw new Error(ERR.INVALID_EMAIL);
  const j=await post(AUTH+'accounts:'+kind+'?key='+encodeURIComponent(CFG.apiKey),{email,password:pw,returnSecureToken:true});
  const name=String(id).includes('@')?String(id).split('@')[0]:String(id).trim().slice(0,16);
  sess={uid:j.localId,name,email,idToken:j.idToken,refresh:j.refreshToken,exp:Date.now()+(+j.expiresIn||3600)*1000};persist();acc.user={uid:sess.uid,name};acc.error='';changed();
  return acc.user;
}
acc.signUp=(id,pw)=>auth('signUp',id,pw);
acc.signIn=(id,pw)=>auth('signInWithPassword',id,pw);
acc.signOut=()=>{sess=null;acc.user=null;persist();changed()};
acc.fetchSave=async function(){
  const r=await fetch(docUrl(),{headers:{Authorization:'Bearer '+await token()}});
  if(r.status===404)return null;if(!r.ok)throw new Error('Laden fehlgeschlagen ('+r.status+')');
  const j=await r.json();const f=j.fields||{};
  try{const s=JSON.parse(f.save&&f.save.stringValue||'null');if(s&&f.name&&f.name.stringValue&&!s.name)s.name=f.name.stringValue;return s}catch(e){return null}
};
acc.pushSave=async function(s,keep){
  const body={fields:{save:{stringValue:JSON.stringify(s)},t:{integerValue:String(s.t||Date.now())},name:{stringValue:(sess&&sess.name)||''},money:{integerValue:String(s.money|0)}}};
  const r=await fetch(docUrl(),{method:'PATCH',keepalive:!!keep,headers:{'Content-Type':'application/json',Authorization:'Bearer '+await token()},body:JSON.stringify(body)});
  if(!r.ok)throw new Error('Speichern fehlgeschlagen ('+r.status+')');acc.lastSync=Date.now();changed();
};
// saves from the game are batched: at most one upload every few seconds, the latest one wins
let pending=null,timer=null;
acc.queue=function(s){if(!acc.user)return;pending=s;if(!timer)timer=setTimeout(flush,4000)};
async function flush(keep){clearTimeout(timer);timer=null;if(!pending||!acc.user)return;const s=pending;pending=null;try{await acc.pushSave(s,keep);acc.error=''}catch(e){acc.error=e.message;pending=pending||s;timer=setTimeout(flush,15000);changed()}}
acc.flush=flush;
window.addEventListener('pagehide',()=>{if(pending)flush(true)});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&pending)flush(true)});

/* ---------- portable save codes (work without any account) ---------- */
function b64e(str){const b=new TextEncoder().encode(str);let s='';for(const x of b)s+=String.fromCharCode(x);return btoa(s)}
function b64d(str){const s=atob(str);const b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return new TextDecoder().decode(b)}
function sum(str){let h=7;for(let i=0;i<str.length;i++)h=(h*31+str.charCodeAt(i))>>>0;return h.toString(36)}
acc.exportCode=s=>{const j=JSON.stringify(s);return'2I2H.'+b64e(j)+'.'+sum(j)};
acc.importCode=code=>{const m=String(code||'').trim().replace(/\s+/g,'').match(/^2I2H\.([A-Za-z0-9+/=]+)\.([a-z0-9]+)$/);if(!m)return null;try{const j=b64d(m[1]);if(sum(j)!==m[2])return null;return JSON.parse(j)}catch(e){return null}};
})();
