// 2Isar2Heat – online activities: street races, bank heist (co-op) and the casino (blackjack, Texas Hold'em).
// Everything runs without a server: whoever opens a table / race / heist is the host and sends the state to the
// others over the lobby connection. Alone (or offline) the same code runs locally, with bots at the poker table.
(window.IH_MODS=window.IH_MODS||[]).push(()=>(function(root){
'use strict';
const IH=root.IH,S=IH.sim,W=IH.world,NET=IH.net,G=S.G,P=S.player;
const $=id=>document.getElementById(id);
const hypot=Math.hypot,clamp=(v,a,b)=>v<a?a:v>b?b:v,now=()=>performance.now()/1000;
const fmt=n=>'$'+Math.round(n).toLocaleString('de-DE');
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const A=IH.act={};

/* ---------------- messaging ---------------- */
const online=()=>NET.enabled&&NET.status==='online';
const others=()=>{try{return online()&&NET.playerList().length>0}catch(e){return false}};
const myId=()=>online()?NET.id:'local';
const myName=()=>(NET.name||IH.settings.name||'Du').slice(0,16);
const handlers={};
function deliver(from,m){const h=handlers[m.k];if(h)try{h(from,m)}catch(e){console.warn(e)}}
function send(m){if(online())NET.event('act',m);deliver(myId(),m)}
NET.onAct=(p,m)=>{if(m&&typeof m.k==='string')deliver(p.id,m)};
function peerPos(id){if(id===myId()){const s=P.inCar||P;return{x:s.x,y:s.y}}const p=NET.peers&&NET.peers.get(id);if(!p||!p.snaps||!p.snaps.length)return null;const s=p.snaps[p.snaps.length-1];return{x:s.x,y:s.y}}
function peerName(id){if(id===myId())return myName();const p=NET.peers&&NET.peers.get(id);return p?p.name:'Spieler'}
const uid=()=>Math.random().toString(36).slice(2,8);
function toast(t){IH.on&&IH.on.toast&&IH.on.toast(t)}
function banner(a,b,c){IH.on&&IH.on.banner&&IH.on.banner(a,b,c||'#ffc61a')}
function sfx(n,v){IH.on&&IH.on.sfx&&IH.on.sfx(n,v||0.8)}
function pay(n,x,y){if(n>0)S.addMoney(n,x??P.x,y??P.y);else P.money=Math.max(0,P.money+n);S.save&&S.save()}
function setHeat(h){if(S.stars()<Math.floor(h)){G.heat=Math.min(5.99,h);G.lastSeen=0}}

/* ---------------- UI scaffolding ---------------- */
const ui=document.createElement('div');ui.id='act';ui.innerHTML=`
<button id="actBtn" type="button" hidden></button>
<div id="actHud" hidden></div>
<div id="actPanel" class="overlay scroll" hidden><div class="panel" id="actBox"></div></div>
<div id="actInvite" hidden></div>`;
document.body.appendChild(ui);
let btnAction=null;
$('actBtn').addEventListener('click',()=>{if(btnAction)btnAction()});
$('actInvite').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.go){const inv=invites.get(b.dataset.go);if(inv){IH.waypoint={x:inv.x,y:inv.y};toast('Ziel auf der Karte markiert')}}if(b.dataset.x)invites.delete(b.dataset.x);renderInvites()});
let panelOpen=null;
function openPanel(kind,html,pause){panelOpen=kind;$('actBox').innerHTML=html;$('actPanel').hidden=false;if(pause!==false&&!online())G.paused=true;if(pause!==false)A.inside=true}
function closePanel(){panelOpen=null;$('actPanel').hidden=true;$('actBox').innerHTML='';G.paused=false;A.inside=false}
$('actBox').addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b||b.disabled)return;const fn=clickers[b.dataset.a];if(fn)fn(b.dataset.v,b)});
// never rebuild the panel while a finger is on it: a button replaced between touch-down and touch-up loses the tap
let ptrDown=false,pendingRender=null;
$('actBox').addEventListener('pointerdown',()=>{ptrDown=true},true);
const ptrUp=()=>{if(!ptrDown)return;ptrDown=false;setTimeout(()=>{const f=pendingRender;pendingRender=null;if(f)f()},30)};
for(const ev of['pointerup','pointercancel'])root.addEventListener(ev,ptrUp,true);
function rerender(fn){if(ptrDown){pendingRender=fn;return}fn()}
const clickers={};
function hud(html){const h=$('actHud');if(!html){h.hidden=true;return}h.hidden=false;if(h.innerHTML!==html)h.innerHTML=html}

/* ---------------- invitations from other players ---------------- */
const invites=new Map();
function invite(id,txt,x,y){if(invites.has(id)){invites.get(id).t=now();return}invites.set(id,{txt,x,y,t:now()});sfx('chat');renderInvites()}
function renderInvites(){const el=$('actInvite');for(const[k,v]of invites)if(now()-v.t>14)invites.delete(k);
  if(!invites.size){el.hidden=true;el.innerHTML='';return}el.hidden=false;
  const html=[...invites].slice(-2).map(([k,v])=>`<div class="inv"><span>${esc(v.txt)}</span><button data-go="${k}" type="button">Hinfahren</button><button data-x="${k}" type="button" class="x">×</button></div>`).join('');if(el.innerHTML!==html)el.innerHTML=html}

/* ================================================================================================ */
/*                                            STREET RACES                                         */
/* ================================================================================================ */
const RACES=W.raceDefs||[];
function routeOf(def){
  let pts;
  if(def.road){const rp=W.roadPts(def.road);let bi=0,bd=1e9;rp.forEach((p,i)=>{const d=hypot(p[0]-def.x,p[1]-def.y);if(d<bd){bd=d;bi=i}});pts=rp.slice(bi).concat(rp.slice(1,bi+1))}
  else if(def.via){pts=[[def.x,def.y]];let cur=[def.x,def.y];for(const v of def.via){const pa=S.astar(S.nearestNodeTo(cur[0],cur[1]),S.nearestNodeTo(v[0],v[1]));if(pa){const pl=S.pathPolyline(pa);for(const q of pl)pts.push(q)}pts.push(v);cur=v}}
  else pts=def.pts.slice();
  // resample to checkpoints every ~85 m
  const cum=W.cumLen(pts),L=cum[cum.length-1],cps=[];for(let s=85;s<L-20;s+=85){const p=W.pointAt(pts,cum,s);cps.push({x:p.x,y:p.y})}const e=pts[pts.length-1];cps.push({x:e[0],y:e[1],fin:true});
  return{cps,len:L};
}
const race={st:null};   // st: null | 'open' | 'count' | 'run' | 'done'
// race messages: rco open/ad, rcj join, rcg go, rcp checkpoint, rcf finish, rcr results, rcx cancel
handlers.rco=(from,m)=>{if(from===myId())return;const def=RACES.find(r=>r.id===m.r);if(!def)return;
  if(race.st&&race.id===m.id){race.left=m.left;race.fee=m.fee;race.members=m.mem||race.members;return}
  if(!race.st)invite('r'+m.id,`${peerName(from)} startet „${def.name}“ · Einsatz ${fmt(m.fee)} · noch ${Math.round(m.left)} s`,def.x,def.y);
  remoteRaces.set(m.id,{id:m.id,host:from,def,fee:m.fee,left:m.left,t:now(),mem:m.mem||[]})};
const remoteRaces=new Map();
handlers.rcj=(from,m)=>{if(race.st!=='open'||race.host!==myId()||m.id!==race.id)return;if(!race.members.includes(from)&&race.members.length<8){race.members.push(from);race.names[from]=m.n||peerName(from);toast((m.n||'Jemand')+' fährt mit');adRace()}};
handlers.rcg=(from,m)=>{if(!race.st||race.id!==m.id||from!==race.host)return;if(!m.mem.includes(myId())){cancelRace(true);return}startRace(m.mem,m.names||{})};
handlers.rcp=(from,m)=>{if(!race.st||race.id!==m.id)return;race.prog[from]={cp:m.cp,t:m.t,fin:!!m.fin,time:m.time};if(m.fin&&race.host===myId())checkRaceEnd()};
handlers.rcr=(from,m)=>{if(!race.st||race.id!==m.id||from!==race.host)return;finishRace(m.order,m.pay)};
handlers.rcx=(from,m)=>{if(race.st&&race.id===m.id&&from===race.host)cancelRace(false,'Der Gastgeber hat das Rennen abgesagt.')};
function adRace(){if(race.host===myId()&&race.st==='open')send({k:'rco',id:race.id,r:race.def.id,fee:race.fee,left:race.left,mem:race.members})}
function openRace(def,fee,solo){
  if(P.money<fee){toast('Nicht genug Geld für den Einsatz');return}
  solo=solo||!others();
  pay(-fee);Object.assign(race,{st:'open',id:uid(),def,fee,host:myId(),members:[myId()],names:{[myId()]:myName()},left:solo?3:30,prog:{},adT:solo?1e9:0,paid:true,soloOnly:solo});
  race.route=routeOf(def);closePanel();toast(solo?'Zeitfahren startet …':'Rennen offen – andere Spieler haben 30 s zum Mitmachen');if(!solo)adRace();
}
function joinRace(r){if(P.money<r.fee){toast('Nicht genug Geld für den Einsatz');return}pay(-r.fee);Object.assign(race,{st:'open',id:r.id,def:r.def,fee:r.fee,host:r.host,members:r.mem.slice(),names:{},left:r.left,prog:{},paid:true});race.route=routeOf(r.def);send({k:'rcj',id:r.id,n:myName()});invites.delete('r'+r.id);renderInvites();toast('Angemeldet – gleich geht’s los')}
function startRace(mem,names){race.members=mem;race.names=Object.assign(race.names||{},names);race.st='count';race.t0=now()+4;race.cpi=0;race.prog={};race.solo=mem.length<2;
  // grid: line up behind the start, two by two
  const i=mem.indexOf(myId()),c=P.inCar;const r0=race.route.cps[0];const a=Math.atan2(r0.y-race.def.y,r0.x-race.def.x);const back=6+Math.floor(i/2)*8,side=(i%2?-1:1)*2.6;
  if(c){c.x=race.def.x-Math.cos(a)*back-Math.sin(a)*side;c.y=race.def.y-Math.sin(a)*back+Math.cos(a)*side;c.a=a;c.vx=c.vy=0;IH.cam.snap=true}
  banner(race.def.name,race.solo?'Zeitfahren – schlag die Medaillenzeit':mem.length+' Fahrer · Einsatz '+fmt(race.fee),'#ffc61a');sfx('ring')}
function cancelRace(silent,why){if(race.paid&&race.st&&race.st!=='done'&&race.st!=='run')pay(race.fee);if(!silent&&why)toast(why);race.st=null;IH.waypoint=null;hud(null)}
function checkRaceEnd(){const fin=race.members.filter(id=>race.prog[id]&&race.prog[id].fin);if(!race.firstFin&&fin.length)race.firstFin=now();
  if(fin.length===race.members.length||(race.firstFin&&now()-race.firstFin>45)){const order=race.members.slice().sort((a,b)=>{const pa=race.prog[a]||{cp:-1},pb=race.prog[b]||{cp:-1};if(pa.fin&&pb.fin)return pa.time-pb.time;if(pa.fin!==pb.fin)return pa.fin?-1:1;return pb.cp-pa.cp});
    const pot=race.fee*race.members.length,payk=race.members.length>=3?[0.65,0.25,0.1]:[1];const payout={};order.forEach((id,i)=>{if(payk[i]&&race.prog[id]&&race.prog[id].fin)payout[id]=Math.round(pot*payk[i])});
    send({k:'rcr',id:race.id,order,pay:payout})}}
function finishRace(order,payout){if(race.st==='done')return;race.st='done';race.doneT=now();const mine=payout[myId()]||0;const pl=order.indexOf(myId())+1;
  if(mine)pay(mine);banner(pl===1?'Sieg!':pl+'. Platz',mine?'+'+fmt(mine):'Kein Preisgeld','#ffc61a');IH.waypoint=null;S.stats&&(S.stats.races=(S.stats.races||0)+1)}
function raceTick(dt){
  if(!race.st){
    // other players' open races near us: drive into their start to join
    for(const[k,r]of remoteRaces){if(now()-r.t>5){remoteRaces.delete(k);continue}}
    return}
  const me=P.inCar;
  if(race.st==='open'){race.left-=dt;race.adT-=dt;if(race.adT<=0){race.adT=2;adRace()}
    const n=race.members.length;hud(`<b>${esc(race.def.name)}</b><span>Start in ${Math.max(0,Math.ceil(race.left))} s · ${n} Fahrer · Pott ${fmt(race.fee*n)}</span>`);
    if(race.host===myId()&&race.left<=0)send({k:'rcg',id:race.id,mem:race.members,names:race.names});
    if(race.host!==myId()&&race.left<-8)cancelRace(false,'Das Rennen ist ausgefallen.');
    if(!me&&!race.warned&&race.left<20){race.warned=true;toast('Steig in ein Auto – das Rennen startet gleich!')}return}
  if(race.st==='count'){const left=race.t0-now();if(me){me.vx*=0.9;me.vy*=0.9}hud(`<b class="big">${left>0?Math.ceil(left):'LOS!'}</b>`);if(left<=0){race.st='run';race.start=now();sfx('beep')}else return}
  if(race.st==='run'){
    const cps=race.route.cps,cp=cps[race.cpi];const src=me||P;
    if(!(me&&me.t.plane)&&hypot(src.x-cp.x,src.y-cp.y)<11){race.cpi++;sfx('pick');const time=now()-race.start;
      if(race.cpi>=cps.length){const pr={cp:race.cpi,t:time,fin:true,time};race.prog[myId()]=pr;send({k:'rcp',id:race.id,cp:race.cpi,fin:1,time:+time.toFixed(2)});
        if(race.solo){const L=race.route.len,gold=L/36,silver=L/30,bronze=L/25;const medal=time<gold?'Gold':time<silver?'Silber':time<bronze?'Bronze':null;const prize=medal?Math.round(race.fee*(medal==='Gold'?3:medal==='Silber'?2:1.2)):0;
          race.st='done';race.doneT=now();if(prize)pay(prize);banner(medal?medal+'medaille':'Zu langsam',time.toFixed(1)+' s'+(prize?' · +'+fmt(prize):''),'#ffc61a');IH.waypoint=null;return}
        race.st='wait'}
      else{race.prog[myId()]={cp:race.cpi,t:time};send({k:'rcp',id:race.id,cp:race.cpi,t:+time.toFixed(1)})}}
    const nx=cps[race.cpi];if(nx)IH.waypoint={x:nx.x,y:nx.y};
    let pos=1;for(const id of race.members){if(id===myId())continue;const pr=race.prog[id];if(pr&&(pr.fin||pr.cp>race.cpi))pos++}
    hud(`<b>${esc(race.def.name)}</b><span>${race.solo?'Zeitfahren':'Platz '+pos+'/'+race.members.length} · CP ${race.cpi}/${cps.length} · ${(now()-race.start).toFixed(1)} s</span>`);
    if(G.state==='dead'||G.state==='busted'){send({k:'rcp',id:race.id,cp:race.cpi,t:999});race.st='wait';toast('Rennen verloren')}
  }
  if(race.st==='wait'){hud(`<b>Im Ziel</b><span>Warte auf die anderen …</span>`);if(race.host===myId())checkRaceEnd();else if(now()-race.start>400)finishRace([],{})}
  if(race.st==='done'){hud(null);if(now()-race.doneT>1)race.st=null}
}
A.target=()=>{if(race.st==='run'||race.st==='count'){const c=race.route.cps;const t=c[race.cpi];return t?{x:t.x,y:t.y,next:c[race.cpi+1]||null}:null}if(race.st==='open'){return{x:race.def.x,y:race.def.y}}
  if(heist.st&&heist.target)return heist.target;return null};
let panelRace=null,panelRaceSig='';
function racePanel(def){
  const r=[...remoteRaces.values()].find(q=>q.def.id===def.id);panelRace=def;panelRaceSig=r?r.id:'';
  openPanel('race',`<p class="kicker">Straßenrennen</p><h2>${esc(def.name)}</h2>
   <p class="note">${others()?'Rennen ausschreiben: die anderen Spieler in der Lobby werden eingeladen, wer gewinnt, kassiert den Pott (ab 3 Fahrern: 65 % / 25 % / 10 %). Oder fahr allein ein Zeitfahren.':'Zeitfahren gegen die Medaillenzeiten: Gold zahlt das Dreifache deines Einsatzes, Silber das Doppelte, Bronze 1,2-fach.'}</p>
   ${r?`<div class="row"><button class="cta" data-a="rjoin" data-v="${r.id}" type="button">Mitfahren · ${fmt(r.fee)}</button></div><p class="note">${esc(peerName(r.host))} wartet hier schon.</p>`:
   `<p class="kicker">${others()?'Rennen ausschreiben · Einsatz':'Zeitfahren · Einsatz'}</p><div class="seg">${[100,250,500,1000].map(f=>`<button data-a="rstart" data-v="${f}" type="button">${fmt(f)}</button>`).join('')}</div>
    ${others()?`<p class="kicker">Allein · Zeitfahren</p><div class="seg">${[100,250,500,1000].map(f=>`<button data-a="rsolo" data-v="${f}" type="button">${fmt(f)}</button>`).join('')}</div>`:''}`}
   <div class="row"><button class="ghost" data-a="close" type="button">Später</button></div>`,false);
  clickers.rstart=v=>openRace(def,+v,!others());clickers.rsolo=v=>openRace(def,+v,true);clickers.rjoin=v=>{const q=remoteRaces.get(v);if(q){joinRace(q);closePanel()}};
}
clickers.close=()=>closePanel();

/* ================================================================================================ */
/*                                              BANK HEIST                                         */
/* ================================================================================================ */
const BANK=W.bank;
const heist={st:null};   // st: lobby | hack | drill | loot | escape | done
// hs: state from host · hsj join · hsp puzzle result · hsx cancel
handlers.hs=(from,m)=>{
  if(from!==myId()&&!heist.st&&m.st==='lobby'){invite('h'+m.id,`${peerName(from)} plant einen Bankraub · Treffpunkt ${BANK.name}`,BANK.x,BANK.y);remoteHeist={id:m.id,host:from,t:now()};return}
  if(!heist.st||heist.id!==m.id||from!==heist.host)return;
  const prev=heist.st;Object.assign(heist,{st:m.st==='loot'&&heist.st==='escape'?'escape':m.st,crew:m.crew,solved:m.solved,alarm:m.alarm,drill:m.drill,left:m.left,busy:m.busy||{}});
  if(prev!==heist.st)onHeistStage(prev);
};
let remoteHeist=null;
handlers.hsj=(from,m)=>{if(heist.host!==myId()||heist.id!==m.id||heist.st!=='lobby')return;if(!heist.crew.includes(from)&&heist.crew.length<4){heist.crew.push(from);toast(peerName(from)+' ist dabei');pushHeist()}};
handlers.hsp=(from,m)=>{if(heist.host!==myId()||heist.id!==m.id)return;if(m.busy!==undefined){heist.busy[m.i]=m.busy?from:null;pushHeist();return}
  if(m.ok){heist.solved[m.i]=1;toast(peerName(from)+': '+BANK.terms[m.i].name+' ausgeschaltet')}else if(m.full){heist.alarm=100;heist.solved[m.i]=2;toast('Falscher Code an '+BANK.terms[m.i].name+' – Alarm ausgelöst!')}else{heist.alarm=Math.min(100,heist.alarm+34);toast('Fehler an '+BANK.terms[m.i].name+'! Alarm '+heist.alarm+' %')}heist.busy[m.i]=null;pushHeist()};
handlers.hsx=(from,m)=>{if(heist.st&&heist.id===m.id&&from===heist.host){toast('Der Bankraub wurde abgeblasen.');endHeist()}};
function pushHeist(){if(heist.host===myId())send({k:'hs',id:heist.id,st:heist.st,crew:heist.crew,solved:heist.solved,alarm:heist.alarm,drill:+heist.drill.toFixed(1),left:Math.round(heist.left||0),busy:heist.busy})}
function planHeist(){if(S.stars()>0){toast('Erst die Polizei abhängen');return}Object.assign(heist,{st:'lobby',id:uid(),host:myId(),crew:[myId()],solved:[0,0,0],alarm:0,drill:0,left:online()?40:0,busy:{},bag:false,adT:0});closePanel();pushHeist();
  toast(online()?'Crew wird gesucht – 40 s, oder sofort starten':'Los geht’s!');if(!online())heistGo()}
function joinHeist(){if(!remoteHeist)return;Object.assign(heist,{st:'lobby',id:remoteHeist.id,host:remoteHeist.host,crew:[],solved:[0,0,0],alarm:0,drill:0,busy:{},bag:false});send({k:'hsj',id:heist.id});invites.delete('h'+heist.id);renderInvites();closePanel();toast('Du bist in der Crew')}
function heistGo(){if(heist.host!==myId())return;heist.st='hack';pushHeist();onHeistStage('lobby')}
function onHeistStage(prev){
  if(heist.st==='hack')banner('Bankraub','Schaltet Alarmanlage, Kameras und Tresorschloss aus','#ffc61a');
  if(heist.st==='drill'){banner('Tresor wird aufgebohrt','Haltet die Stellung am Eingang!','#ff4136');setHeat(heist.alarm>=100?3.05:2.05)}
  if(heist.st==='loot'){banner('Tresor offen!','Schnapp dir deinen Anteil am Eingang','#3ddc84')}
  if(heist.st==='fail'){banner('Bankraub gescheitert','','#ff4136');endHeist()}
}
function endHeist(){heist.st=null;heist.target=null;hud(null);if(panelOpen==='puzzle')closePanel()}
function heistTick(dt){
  if(!heist.st)return;const src=P.inCar||P;const host=heist.host===myId();
  if(host){heist.adT-=dt;if(heist.adT<=0){heist.adT=heist.st==='lobby'?2:3;pushHeist()}
    if(heist.st==='lobby'){heist.left-=dt;if(heist.left<=0)heistGo()}
    if(heist.st==='hack'&&heist.solved.every(Boolean)){heist.st='drill';heist.drill=0;pushHeist();onHeistStage('hack')}
    if(heist.st==='hack'&&heist.alarm>=100&&!heist.alarmed){heist.alarmed=true;pushHeist()}
    if(heist.st==='drill'){let near=false;for(const id of heist.crew){const p=peerPos(id);if(p&&hypot(p.x-BANK.x,p.y-BANK.y)<14)near=true}if(near)heist.drill+=dt/28*100;if(heist.drill>=100){heist.drill=100;heist.st='loot';pushHeist();onHeistStage('drill')}}
    if(heist.st!=='lobby'){const alive=heist.crew.filter(id=>id===myId()||(NET.peers&&NET.peers.has(id)));if(alive.length!==heist.crew.length){heist.crew=alive;pushHeist()}}}
  else if(heist.st!=='escape'&&now()-(heist.seen||now())>20){toast('Verbindung zur Crew verloren');endHeist();return}
  if(heist.st==='hack'&&heist.alarm>=100)setHeat(3.05);
  // targets and HUD
  const n=heist.crew?heist.crew.length:1;const share=Math.round((5000+(heist.alarm<100?2500:0))*(n>1?1+0.25*(n-1):1)/n);
  if(heist.st==='lobby'){heist.target={x:BANK.x,y:BANK.y};hud(`<b>Bankraub · ${esc(BANK.name)}</b><span>Crew ${n}/4${host?' · Start in '+Math.max(0,Math.ceil(heist.left))+' s':''}</span>${host?'<button id="hsGo" type="button">Jetzt starten</button>':''}`);const b=$('hsGo');if(b)b.onclick=heistGo}
  else if(heist.st==='hack'){const open=BANK.terms.map((t,i)=>heist.solved[i]?null:i).filter(i=>i!==null);let best=null,bd=1e9;for(const i of open){const t=BANK.terms[i];const d=hypot(t.x-src.x,t.y-src.y);if(d<bd&&!heist.busy[i]){bd=d;best=t}}heist.target=best?{x:best.x,y:best.y}:null;
    hud(`<b>Sicherheitssysteme</b><span>${BANK.terms.map((t,i)=>(heist.solved[i]===2?'✖ ':heist.solved[i]?'✔ ':'○ ')+t.name).join(' · ')}</span><span class="${heist.alarm>=100?'alarm':''}">Alarm ${heist.alarm} %</span>`)}
  else if(heist.st==='drill'){heist.target={x:BANK.x,y:BANK.y};hud(`<b>Tresor bohren</b><span>${Math.floor(heist.drill)} % · bleibt am Eingang!</span><i class="bar"><i style="width:${heist.drill}%"></i></i>`)}
  else if(heist.st==='loot'){heist.target={x:BANK.x,y:BANK.y};hud(`<b>Tresor offen</b><span>Hol deinen Anteil am Eingang (${fmt(share)})</span>`);
    if(!P.inCar&&hypot(P.x-BANK.x,P.y-BANK.y)<3){heist.st='escape';heist.bag=true;heist.share=share;setHeat(4.05);sfx('pick');banner('Beute gesichert',fmt(share)+' – ab ins Versteck oder Polizei abhängen','#3ddc84')}}
  else if(heist.st==='escape'){const safe=W.zones.find(z=>z.kind==='safe');heist.target=safe?{x:safe.x,y:safe.y}:null;
    hud(`<b>Flucht!</b><span>${fmt(heist.share)} im Gepäck · Versteck erreichen oder Fahndung loswerden</span>`);
    if(G.state==='dead'||G.state==='busted'){banner('Beute verloren','','#ff4136');endHeist();return}
    if((safe&&hypot(src.x-safe.x,src.y-safe.y)<safe.r+2)||S.stars()===0){pay(heist.share);banner('Bankraub erfolgreich!','+'+fmt(heist.share),'#3ddc84');if(safe&&hypot(src.x-safe.x,src.y-safe.y)<safe.r+4){G.heat=0;G.lastSeen=0}S.stats&&(S.stats.heists=(S.stats.heists||0)+1);endHeist();return}}
  if(G.state==='dead'&&heist.st!=='escape'&&heist.st!=='lobby'&&host){heist.st='fail';pushHeist();onHeistStage('x')}
}
handlers.hs.seen=0;
const _hs=handlers.hs;handlers.hs=(f,m)=>{if(heist.st&&heist.id===m.id)heist.seen=now();_hs(f,m)};

/* ---------- puzzles ---------- */
let puz=null,codeSave=null;
function startPuzzle(i){
  if(heist.busy[i]&&heist.busy[i]!==myId()){toast('Da arbeitet schon jemand');return}
  send({k:'hsp',id:heist.id,i,busy:1});heist.busy[i]=myId();
  const kind=['code','wires','freq'][i];puz={i,kind,t0:now(),T:kind==='code'?100:kind==='wires'?24:30};
  if(kind==='wires'){
    // Stroop wiring: every socket shows a colour WORD printed in a different ink – the word counts, not the ink
    const n=6+(heist.crew.length>2?1:0),all=WCOL.slice().sort(()=>Math.random()-0.5).slice(0,n);
    const L=all.slice().sort(()=>Math.random()-0.5),R=all.slice().sort(()=>Math.random()-0.5);
    puz.L=L.map(c=>c.k);puz.R=R.map(c=>c.k);puz.ink=R.map(c=>{const o=WCOL.filter(x=>x.k!==c.k);return o[Math.floor(Math.random()*o.length)].k});puz.links={};puz.sel=null;puz.miss=0}
  if(kind==='code'){
    // one code per heist (same for the whole crew); leaving the terminal keeps your tries and the clock, so there is only one chance
    let h=2166136261;for(const ch of String(heist.id))h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;const d=[0,1,2,3,4,5,6,7,8,9];for(let k=9;k>0;k--){h=Math.imul(h^(h>>>15),2246822507)>>>0;const j=h%(k+1);[d[k],d[j]]=[d[j],d[k]]}
    puz.code=d.slice(0,5);puz.guess=[];puz.hist=[];if(codeSave&&codeSave.hid===heist.id){puz.hist=codeSave.hist;puz.t0=now()-codeSave.used}}
  if(kind==='freq'){puz.f=1+Math.random()*3,puz.a=0.3+Math.random()*0.6;puz.uf=2.5;puz.ua=0.5;puz.hold=0}
  renderPuzzle();
}
function puzzleDone(ok){const i=puz.i,full=!ok&&puz.kind==='code';puz=null;codeSave=null;send({k:'hsp',id:heist.id,i,ok:ok?1:0,full:full?1:0});closePanel();sfx(ok?'pick':'fail');toast(ok?'Geschafft!':full?'Falscher Code – ALARM! Das Schloss wird jetzt aufgebrochen':'Fehlgeschlagen – der Alarm steigt')}
const WCOL=[{k:'rot',n:'ROT',c:'#e74c3c'},{k:'blau',n:'BLAU',c:'#3498db'},{k:'gelb',n:'GELB',c:'#f1c40f'},{k:'gruen',n:'GRÜN',c:'#2ecc71'},{k:'lila',n:'LILA',c:'#9b59b6'},{k:'orange',n:'ORANGE',c:'#ff8c1a'},{k:'weiss',n:'WEISS',c:'#f4f4f4'},{k:'pink',n:'PINK',c:'#ff5fb0'}];
const wc=k=>WCOL.find(x=>x.k===k);
// Wordle scoring: g = right digit right place, y = digit in the code elsewhere, x = not in the code
function scoreCode(g,c){const r=g.map((d,i)=>d===c[i]?'g':null),left=c.filter((d,i)=>g[i]!==d);for(let i=0;i<g.length;i++){if(r[i])continue;const j=left.indexOf(g[i]);if(j>=0){r[i]='y';left.splice(j,1)}else r[i]='x'}return r}
function renderPuzzle(){
  if(!puz)return;const left=Math.max(0,puz.T-(now()-puz.t0));const tm=`<p class="kicker">${esc(BANK.terms[puz.i].name)} · ${left.toFixed(0)} s</p>`;
  if(puz.kind==='wires'){openPanel('puzzle',`${tm}<h2>Kabel verbinden</h2><p class="note">Tippe links ein Kabel und rechts die Buchse, deren <b>Wort</b> die Kabelfarbe nennt – die Schriftfarbe ist eine Falle. Zwei Fehlkontakte lösen Alarm aus${puz.miss?' · <b style="color:#ff4136">1 Fehlkontakt</b>':''}.</p>
    <div class="wires"><div>${puz.L.map((c,k)=>`<button data-a="wl" data-v="${k}" type="button" class="wire ${puz.sel===k?'sel':''} ${puz.links[k]!==undefined?'done':''}" style="--c:${wc(c).c}"></button>`).join('')}</div>
    <div>${puz.R.map((c,k)=>`<button data-a="wr" data-v="${k}" type="button" class="sock ${Object.values(puz.links).includes(k)?'done':''}" style="color:${wc(puz.ink[k]).c}">${wc(c).n}</button>`).join('')}</div></div>
    <div class="row"><button class="ghost" data-a="pquit" type="button">Abbrechen</button></div>`,false)}
  else if(puz.kind==='code'){
    const best={};for(const h of puz.hist)h.g.forEach((d,i)=>{const r=h.r[i],o=best[d];if(r==='g'||(r==='y'&&o!=='g')||!o)best[d]=r});
    const rows=[];for(let k=0;k<7;k++){const h=puz.hist[k];const cur=!h&&k===puz.hist.length;rows.push(`<div class="pinrow">${[0,1,2,3,4].map(i=>h?`<span class="pc r${h.r[i]}">${h.g[i]}</span>`:`<span class="pc ${cur?'cur':''}">${cur&&puz.guess[i]!==undefined?puz.guess[i]:''}</span>`).join('')}</div>`)}
    openPanel('puzzle',`${tm}<h2>Tresorschloss knacken</h2><p class="note">5-stelliger Code, jede Ziffer höchstens einmal · 7 Versuche. <b style="color:#3ddc84">Grün</b> = richtig, <b style="color:#ffc61a">Gelb</b> = kommt vor, andere Stelle, <b style="color:#8a8f98">Grau</b> = nicht im Code.</p>
    <div class="pingrid">${rows.join('')}</div>
    <div class="keys pinkeys">${[1,2,3,4,5,6,7,8,9,0].map(d=>`<button data-a="ck" data-v="${d}" type="button" class="${best[d]?'r'+best[d]:''}">${d}</button>`).join('')}<button data-a="ck" data-v="del" type="button">⌫</button><button data-a="ck" data-v="ok" type="button" class="enter">OK</button></div>
    <div class="row"><button class="ghost" data-a="pquit" type="button">Abbrechen</button></div>`,false)}
  else{openPanel('puzzle',`${tm}<h2>Kamera-Frequenz stören</h2><p class="note">Bring die gelbe Welle mit den Reglern genau über die weiße und halte sie kurz.</p>
    <canvas id="fqCv" width="520" height="160"></canvas>
    <label class="sl">Frequenz<input id="fqF" type="range" min="0.5" max="4.5" step="0.01" value="${puz.uf}"></label>
    <label class="sl">Stärke<input id="fqA" type="range" min="0.1" max="1" step="0.01" value="${puz.ua}"></label>
    <div class="row"><button class="ghost" data-a="pquit" type="button">Abbrechen</button></div>`,false);
    $('fqF').oninput=e=>{puz&&(puz.uf=+e.target.value)};$('fqA').oninput=e=>{puz&&(puz.ua=+e.target.value)}}
}
clickers.pquit=()=>{const i=puz?puz.i:null;if(puz&&puz.kind==='code')codeSave={hid:heist.id,hist:puz.hist,used:now()-puz.t0};puz=null;closePanel();if(i!==null)send({k:'hsp',id:heist.id,i,busy:0})};
clickers.wl=v=>{if(!puz)return;puz.sel=+v;renderPuzzle()};
clickers.wr=v=>{if(!puz||puz.sel===null)return;const k=+v;if(Object.values(puz.links).includes(k))return;if(puz.R[k]!==puz.L[puz.sel]){puz.miss++;sfx('fail',0.6);if(puz.miss>=2){puzzleDone(false);return}puz.sel=null;puz.t0-=4;renderPuzzle();return}puz.links[puz.sel]=k;puz.sel=null;sfx('beep',0.5);if(Object.keys(puz.links).length===puz.L.length)puzzleDone(true);else renderPuzzle()};
clickers.ck=v=>{if(!puz||puz.kind!=='code')return;if(v==='del'){puz.guess.pop();renderPuzzle();return}
  if(v==='ok'){if(puz.guess.length<5){toast('Erst 5 Ziffern eingeben');return}const g=puz.guess.slice(),r=scoreCode(g,puz.code);puz.hist.push({g,r});puz.guess=[];
    if(r.every(x=>x==='g')){puzzleDone(true);return}if(puz.hist.length>=7){toast('Code war '+puz.code.join(''));puzzleDone(false);return}sfx('beep',0.4);renderPuzzle();return}
  const d=+v;if(puz.guess.length>=5||puz.guess.includes(d))return;puz.guess.push(d);renderPuzzle()};
function puzzleTick(dt){
  if(!puz)return;const left=puz.T-(now()-puz.t0);if(left<=0){puzzleDone(false);return}
  const k=$('actBox').querySelector('.kicker');if(k)k.textContent=BANK.terms[puz.i].name+' · '+Math.ceil(left)+' s';
  if(puz.kind==='freq'){const cv=$('fqCv');if(!cv)return;const g=cv.getContext('2d');const w=cv.width,h=cv.height,t=now();g.fillStyle='#0b0e12';g.fillRect(0,0,w,h);g.strokeStyle='rgba(255,255,255,.12)';for(let x=0;x<w;x+=26){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke()}
    const wave=(f,a,col,lw)=>{g.strokeStyle=col;g.lineWidth=lw;g.beginPath();for(let x=0;x<=w;x+=3){const y=h/2-Math.sin(x/w*Math.PI*2*f+t*2)*a*h*0.42;x?g.lineTo(x,y):g.moveTo(x,y)}g.stroke()};
    wave(puz.f,puz.a,'#ffffff',3);wave(puz.uf,puz.ua,'#ffc61a',3);
    const ok=Math.abs(puz.uf-puz.f)<0.12&&Math.abs(puz.ua-puz.a)<0.07;puz.hold=ok?puz.hold+dt:Math.max(0,puz.hold-dt*2);g.fillStyle=ok?'#3ddc84':'#ff4136';g.fillRect(0,h-6,w*Math.min(1,puz.hold/1.4),6);if(puz.hold>=1.4)puzzleDone(true)}
}

/* ================================================================================================ */
/*                                                CARDS                                            */
/* ================================================================================================ */
const SUITS=['♠','♥','♦','♣'],RANKS=['2','3','4','5','6','7','8','9','10','B','D','K','A'];
const cardHtml=(c,small)=>{if(c===null||c===undefined)return`<i class="card back${small?' sm':''}"></i>`;const r=c%13,s=Math.floor(c/13);return`<i class="card${s===1||s===2?' red':''}${small?' sm':''}"><b>${RANKS[r]}</b><em>${SUITS[s]}</em></i>`};
function shuffled(n){const d=[];for(let i=0;i<n;i++)d.push(i%52);for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]]}return d}
// 5-card value -> comparable number
function rank5(cs){const r=cs.map(c=>c%13).sort((a,b)=>b-a),s=cs.map(c=>Math.floor(c/13));const fl=s.every(x=>x===s[0]);let uniq=[...new Set(r)];let st=-1;
  if(uniq.length===5){if(r[0]-r[4]===4)st=r[0];else if(r[0]===12&&r[1]===3)st=3}
  const cnt={};for(const x of r)cnt[x]=(cnt[x]||0)+1;const grp=Object.entries(cnt).map(([k,v])=>[v,+k]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]);
  const kick=grp.map(g=>g[1]);const val=(cat,ks)=>cat*1e10+ks.reduce((a,k,i)=>a+k*Math.pow(15,4-i),0);
  if(st>=0&&fl)return val(8,[st]);if(grp[0][0]===4)return val(7,kick);if(grp[0][0]===3&&grp[1][0]===2)return val(6,kick);if(fl)return val(5,r);if(st>=0)return val(4,[st]);if(grp[0][0]===3)return val(3,kick);if(grp[0][0]===2&&grp[1][0]===2)return val(2,kick);if(grp[0][0]===2)return val(1,kick);return val(0,r)}
function best7(cs){let b=-1;const n=cs.length;for(let a=0;a<n;a++)for(let c=a+1;c<n;c++){const h=cs.filter((_,i)=>i!==a&&i!==c);if(h.length<5)continue;const v=rank5(h.slice(0,5));if(v>b)b=v}return n<=5?rank5(cs):b}
const HANDNAME=['Höchste Karte','Ein Paar','Zwei Paare','Drilling','Straße','Flush','Full House','Vierling','Straight Flush'];
const handName=v=>HANDNAME[Math.floor(v/1e10)];
function equity(hole,board,opp,iters){let win=0;const used=new Set(hole.concat(board));const deck=[];for(let i=0;i<52;i++)if(!used.has(i))deck.push(i);
  for(let it=0;it<iters;it++){const d=deck.slice();for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]]}let k=0;const bd=board.concat(d.slice(k,k+5-board.length));k+=5-board.length;
    const mine=best7(hole.concat(bd));let best=true,tie=false;for(let o=0;o<opp;o++){const v=best7([d[k],d[k+1]].concat(bd));k+=2;if(v>mine){best=false;break}if(v===mine)tie=true}if(best)win+=tie?0.5:1}return win/iters}

/* ---------------- tables (host side) ---------------- */
const BOT_NAMES=['Sepp (Bot)','Resi (Bot)','Ferdl (Bot)','Vroni (Bot)','Wastl (Bot)'];
const tables=new Map();   // tables I host
const seen=new Map();     // tables announced by others
let myTable=null;         // {id, game, host, chips/buy}
let view=null;            // last public state of my table
handlers.tbl=(from,m)=>{if(from===myId())return;seen.set(m.t,{id:m.t,g:m.g,host:from,hn:m.h,n:m.n,max:m.max,stake:m.s,t:now()})};
handlers.tblx=(from,m)=>{seen.delete(m.t);if(myTable&&myTable.id===m.t&&from===myTable.host){cashOut('Der Tisch wurde geschlossen.')}};
function announce(T){send({k:'tbl',t:T.id,g:T.game,h:myName(),n:T.seats.filter(s=>!s.bot).length,max:T.game==='poker'?6:4,s:T.game==='poker'?T.bb:T.min})}
function closeTable(T){tables.delete(T.id);send({k:'tblx',t:T.id})}
handlers.tj=(from,m)=>{const T=tables.get(m.t);if(!T)return;
  const old=T.seats.find(s=>s.id===from);if(old){if(old.left){old.left=false;if(T.game==='poker')old.chips=clamp(m.c|0,0,1e6);T.dirty=true}else T.dirty=true;return}   // re-join after leaving mid-hand / repeated request: just resend the state
  const humans=T.seats.filter(s=>!s.bot).length;const max=T.game==='poker'?6:4;
  if(humans>=max){send({k:'tno',t:T.id,to:from,why:'Der Tisch ist voll.'});return}
  if(T.game==='poker'){const bi=T.seats.findIndex(s=>s.bot&&!s.inHand);const seat={id:from,name:String(m.n||'Spieler').slice(0,16),chips:clamp(m.c|0,0,1e6),bot:false,sitOut:false};if(T.seats.length>=6&&bi>=0)T.seats.splice(bi,1,seat);else if(T.seats.length<6)T.seats.push(seat);else{send({k:'tno',t:T.id,to:from,why:'Der Tisch ist voll.'});return}}
  else T.seats.push({id:from,name:String(m.n||'Spieler').slice(0,16),bet:0,hands:[],won:0});
  T.dirty=true};
handlers.tl=(from,m)=>{const T=tables.get(m.t);if(!T)return;const i=T.seats.findIndex(s=>s.id===from);if(i<0)return;const s=T.seats[i];
  if(T.game==='poker'){if(T.hand&&s.inHand&&!s.folded){s.folded=true;s.left=true;if(T.toAct===i)pokerAdvance(T,true)}else T.seats.splice(i,1)}else{T.seats.splice(i,1);if(T.toAct>=T.seats.length)T.toAct=-1}
  T.dirty=true};
handlers.tno=(from,m)=>{if(m.to===myId()&&myTable&&myTable.id===m.t){pay(myTable.buy);myTable=null;view=null;toast(m.why);casinoLobby()}};

/* ---------- Texas Hold'em host ---------- */
function newPoker(){const T={id:uid(),game:'poker',host:myId(),seats:[],sb:10,bb:20,d:-1,hand:null,toAct:-1,board:[],deck:[],dirty:true,annT:0,next:now()+3,hn:0,bots:true,log:''};tables.set(T.id,T);return T}
function pokerTopUpBots(T){if(!T.bots)return;const humans=T.seats.filter(s=>!s.bot).length;while(T.seats.length<Math.min(6,Math.max(4,humans+2))){const used=new Set(T.seats.map(s=>s.name));const nm=BOT_NAMES.find(n=>!used.has(n))||'Bot';T.seats.push({id:'bot_'+uid(),name:nm,chips:1000+Math.floor(Math.random()*6)*100,bot:true})}}
function pokerStart(T){
  T.seats=T.seats.filter(s=>!s.left&&(s.chips>0||!s.bot));for(const s of T.seats)if(s.bot&&s.chips<T.bb*5)s.chips=1000;pokerTopUpBots(T);
  const act=T.seats.filter(s=>s.chips>0);if(act.length<2||!T.seats.some(s=>!s.bot&&s.chips>0)){T.hand=null;T.dirty=true;T.next=now()+3;return}
  T.hn++;T.deck=shuffled(52);T.board=[];T.pots=null;T.show=null;T.hand=true;T.street=0;
  for(const s of T.seats){s.cards=[];s.bet=0;s.total=0;s.folded=s.chips<=0;s.allin=false;s.acted=false;s.inHand=s.chips>0;s.last=''}
  const nxt=i=>{for(let k=1;k<=T.seats.length;k++){const j=(i+k)%T.seats.length;if(T.seats[j].inHand)return j}return i};
  T.d=nxt(T.d<0?T.seats.length-1:T.d);const heads=act.length===2;const sbI=heads?T.d:nxt(T.d),bbI=nxt(sbI);
  for(let r=0;r<2;r++)for(const s of T.seats)if(s.inHand)s.cards.push(T.deck.pop());
  pokerBet(T,sbI,Math.min(T.sb,T.seats[sbI].chips));T.seats[sbI].last='Small Blind';pokerBet(T,bbI,Math.min(T.bb,T.seats[bbI].chips));T.seats[bbI].last='Big Blind';
  T.cur=T.bb;T.minRaise=T.bb;T.toAct=nxt(bbI);T.actT=now();
  for(const s of T.seats)if(!s.bot&&s.inHand)send({k:'pkh',t:T.id,to:s.id,hn:T.hn,c:s.cards});
  T.dirty=true;pokerMaybeSkip(T)}
function pokerBet(T,i,amt){const s=T.seats[i];amt=Math.min(amt,s.chips);s.chips-=amt;s.bet+=amt;s.total+=amt;if(s.chips===0)s.allin=true}
function live(T){return T.seats.filter(s=>s.inHand&&!s.folded)}
function pokerMaybeSkip(T){const s=T.seats[T.toAct];if(!s||!s.inHand||s.folded||s.allin)pokerAdvance(T,false)}
function pokerAction(T,i,a,amt){
  const s=T.seats[i];if(!T.hand||T.toAct!==i||!s)return;const need=T.cur-s.bet;
  if(a==='fold'){s.folded=true;s.last='Passt'}
  else if(a==='check'){if(need>0){a='call'}else s.last='Schiebt'}
  if(a==='call'){pokerBet(T,i,need);s.last=s.allin?'All-in':need>0?'Geht mit':'Schiebt'}
  if(a==='raise'){const to=Math.max(T.cur+T.minRaise,amt|0);const add=Math.min(s.chips,to-s.bet);pokerBet(T,i,add);if(s.bet>T.cur){T.minRaise=Math.max(T.minRaise,s.bet-T.cur);T.cur=s.bet;for(const o of T.seats)if(o!==s&&o.inHand&&!o.folded&&!o.allin)o.acted=false}s.last=s.allin?'All-in':'Erhöht auf '+s.bet}
  s.acted=true;T.dirty=true;pokerAdvance(T,true)}
function pokerAdvance(T,moved){
  const L=live(T);
  if(L.length<=1){pokerShowdown(T);return}
  const pending=L.filter(s=>!s.allin&&(!s.acted||s.bet<T.cur));
  if(pending.length===0||(L.filter(s=>!s.allin).length<=1&&L.every(s=>s.allin||s.bet>=T.cur))){
    // street over
    for(const s of T.seats){s.bet=0;s.acted=false}T.cur=0;T.minRaise=T.bb;
    if(T.street>=3){pokerShowdown(T);return}
    T.street++;T.deck.pop();if(T.street===1)T.board.push(T.deck.pop(),T.deck.pop(),T.deck.pop());else T.board.push(T.deck.pop());
    if(L.filter(s=>!s.allin).length<=1){T.dirty=true;T.runout=now()+1.2;return}
    let j=T.d;for(let k=1;k<=T.seats.length;k++){const q=(T.d+k)%T.seats.length;const o=T.seats[q];if(o.inHand&&!o.folded&&!o.allin){j=q;break}}T.toAct=j;T.actT=now();T.dirty=true;return}
  for(let k=1;k<=T.seats.length;k++){const q=(T.toAct+k)%T.seats.length;const o=T.seats[q];if(o.inHand&&!o.folded&&!o.allin&&(!o.acted||o.bet<T.cur)){T.toAct=q;T.actT=now();T.dirty=true;return}}
}
function pokerShowdown(T){
  while(T.board.length<5&&live(T).length>1)T.board.push(T.deck.pop());
  const L=live(T),res={};const vals={};for(const s of L)vals[s.id]=L.length>1?best7(s.cards.concat(T.board)):0;
  // side pots
  const levels=[...new Set(T.seats.filter(s=>s.inHand).map(s=>s.total))].sort((a,b)=>a-b);let prev=0;
  for(const lv of levels){let pot=0;for(const s of T.seats)if(s.inHand)pot+=Math.max(0,Math.min(s.total,lv)-prev);const el=L.filter(s=>s.total>=lv);if(pot>0&&!el.length){for(const s of T.seats)if(s.inHand){const back=Math.max(0,Math.min(s.total,lv)-prev);s.chips+=back}}if(pot<=0||!el.length){prev=lv;continue}
    const top=Math.max(...el.map(s=>vals[s.id]));const win=el.filter(s=>vals[s.id]===top);const sh=Math.floor(pot/win.length);for(const w of win){w.chips+=sh;res[w.id]=(res[w.id]||0)+sh}prev=lv}
  T.show={res,cards:L.length>1?Object.fromEntries(L.map(s=>[s.id,s.cards])):{},names:Object.fromEntries(L.map(s=>[s.id,L.length>1?handName(vals[s.id]):''])),hn:T.hn};
  T.hand=null;T.toAct=-1;T.next=now()+6;T.dirty=true}
function botDecide(T,i){
  const s=T.seats[i],need=T.cur-s.bet,pot=T.seats.reduce((a,o)=>a+(o.total||0),0);const opp=Math.max(1,live(T).length-1);
  let eq;if(!T.board.length){const r=s.cards.map(c=>c%13).sort((a,b)=>b-a),suited=Math.floor(s.cards[0]/13)===Math.floor(s.cards[1]/13);eq=(r[0]===r[1]?0.5+r[0]/26:(r[0]+r[1])/30+(suited?0.05:0)+(r[0]-r[1]<3?0.04:0))-opp*0.04}
  else eq=equity(s.cards,T.board,opp,70);
  const odds=need/(pot+need||1),bluff=Math.random()<0.06;
  if(need===0){if(eq>0.62||bluff)return['raise',T.cur+Math.max(T.bb,Math.round(pot*(0.4+Math.random()*0.4)/10)*10)];return['check']}
  if(eq>0.78&&Math.random()<0.7)return['raise',T.cur+Math.max(T.minRaise,Math.round(pot*0.7/10)*10)];
  if(eq>odds+0.08||(need<=T.bb&&eq>0.3))return['call'];if(bluff&&need<s.chips*0.2)return['call'];return['fold']}
function pokerPublic(T){return{k:'pk',t:T.id,hn:T.hn,hand:!!T.hand,st:T.street,b:T.board,d:T.d,ta:T.toAct,cur:T.cur,mr:T.minRaise,bb:T.bb,left:T.hand&&T.toAct>=0?Math.max(0,Math.round(22-(now()-T.actT))):0,
  s:T.seats.map(s=>({id:s.id,n:s.name,c:s.chips,b:s.bet,tot:s.total||0,f:!!s.folded,a:!!s.allin,in:!!s.inHand,l:s.last||'',bot:!!s.bot})),sh:T.show}}
handlers.pa=(from,m)=>{const T=tables.get(m.t);if(!T||T.game!=='poker')return;const i=T.seats.findIndex(s=>s.id===from);if(i<0)return;if(m.a==='rebuy'){T.seats[i].chips+=clamp(m.c|0,0,1e6);T.dirty=true;return}pokerAction(T,i,m.a,m.v)};
function pokerTick(T){
  if(T.runout&&now()>T.runout){T.runout=0;pokerAdvance(T,false)}
  if(!T.hand){if(now()>T.next)pokerStart(T)}
  else if(T.toAct>=0&&!T.runout){const s=T.seats[T.toAct];if(s.bot){if(now()-T.actT>0.9+Math.random()*0.8){const[a,v]=botDecide(T,T.toAct);pokerAction(T,T.toAct,a,v)}}else if(now()-T.actT>22){pokerAction(T,T.toAct,T.cur>s.bet?'fold':'check')}}
  if(T.dirty){T.dirty=false;send(pokerPublic(T))}
}

/* ---------- Blackjack host ---------- */
function newBJ(){const T={id:uid(),game:'bj',host:myId(),seats:[],dealer:[],shoe:shuffled(312),ph:'bet',phT:now()+12,toAct:-1,min:10,dirty:true,annT:0,rn:1};tables.set(T.id,T);return T}
function bjVal(cs){let v=0,a=0;for(const c of cs){const r=c%13;v+=r===12?11:r>=8?10:r+2;if(r===12)a++}while(v>21&&a){v-=10;a--}return v}
const bjBJ=cs=>cs.length===2&&bjVal(cs)===21;
function bjDraw(T){if(T.shoe.length<60)T.shoe=shuffled(312);return T.shoe.pop()}
handlers.bb=(from,m)=>{const T=tables.get(m.t);if(!T||T.ph!=='bet')return;const s=T.seats.find(q=>q.id===from);if(!s)return;s.bet=clamp(m.v|0,0,100000);T.dirty=true;if(T.seats.every(q=>q.bet>0))T.phT=Math.min(T.phT,now()+1)};
handlers.ba=(from,m)=>{const T=tables.get(m.t);if(!T||T.ph!=='play')return;const i=T.seats.findIndex(q=>q.id===from);if(i!==T.toAct)return;bjAct(T,i,m.a)};
function bjAct(T,i,a){const s=T.seats[i];
  if(a==='hit'){s.cards.push(bjDraw(T));if(bjVal(s.cards)>=21)s.done=true}
  else if(a==='double'&&s.cards.length===2){s.bet*=2;s.cards.push(bjDraw(T));s.done=true;s.dbl=true}
  else s.done=true;
  T.actT=now();if(s.done)bjNext(T);T.dirty=true}
function bjNext(T){for(let k=Math.max(0,T.toAct+1);k<T.seats.length;k++){const s=T.seats[k];if(s.bet>0&&!s.done){T.toAct=k;T.actT=now();return}}T.toAct=-1;T.ph='dealer';T.phT=now()+0.8}
function bjTick(T){
  const t=now();
  if(T.ph==='bet'&&t>T.phT){const playing=T.seats.filter(s=>s.bet>0);if(!playing.length){T.phT=t+8;T.dirty=true}
    else{T.dealer=[bjDraw(T),bjDraw(T)];for(const s of T.seats){s.cards=s.bet>0?[bjDraw(T),bjDraw(T)]:[];s.done=!(s.bet>0)||bjBJ(s.cards);s.res='';s.pay=0;s.dbl=false}T.ph='play';T.toAct=-1;
      if(bjBJ(T.dealer)){T.ph='dealer';T.phT=t+0.5}else bjNext(T);T.dirty=true}}
  if(T.ph==='play'&&T.toAct>=0&&t-T.actT>20)bjAct(T,T.toAct,'stand');
  if(T.ph==='dealer'&&t>T.phT){const need=T.seats.some(s=>s.bet>0&&bjVal(s.cards)<=21&&!bjBJ(s.cards));if(need&&bjVal(T.dealer)<17){T.dealer.push(bjDraw(T));T.phT=t+0.7;T.dirty=true}
    else{const dv=bjVal(T.dealer),dbj=bjBJ(T.dealer);for(const s of T.seats){if(!(s.bet>0))continue;const v=bjVal(s.cards),bj=bjBJ(s.cards);let p=0,r;
        if(v>21){r='Überkauft'}else if(bj&&!dbj){p=Math.floor(s.bet*2.5);r='Blackjack!'}else if(dbj&&!bj){r='Bank hat Blackjack'}else if(dv>21||v>dv){p=s.bet*2;r='Gewonnen'}else if(v===dv){p=s.bet;r='Unentschieden'}else r='Verloren';
        s.pay=p;s.res=r;s.won=(s.won||0)+p-s.bet}
      T.ph='result';T.phT=t+5;T.dirty=true}}
  if(T.ph==='result'&&t>T.phT){T.ph='bet';T.phT=t+12;T.rn++;for(const s of T.seats){s.bet=0;s.cards=[];s.res='';s.pay=0}T.dealer=[];T.dirty=true}
  if(T.dirty){T.dirty=false;send({k:'bj',t:T.id,ph:T.ph,rn:T.rn,left:Math.max(0,Math.round(T.phT-t)),ta:T.toAct,d:T.ph==='play'||T.ph==='bet'?T.dealer.slice(0,1).concat(T.dealer.length?[null]:[]):T.dealer,dv:T.ph==='play'?null:bjVal(T.dealer),
    s:T.seats.map(s=>({id:s.id,n:s.name,bet:s.bet,c:s.cards||[],v:bjVal(s.cards||[]),done:!!s.done,r:s.res||'',p:s.pay||0,won:s.won||0}))})}
}

/* ---------------- client side of a table ---------------- */
let myHole=null,lastPayRound=-1,pkRaise=0;
handlers.pkh=(from,m)=>{if(m.to===myId()&&myTable&&myTable.id===m.t){myHole={hn:m.hn,c:m.c}}};
handlers.pk=(from,m)=>{if(!myTable||myTable.id!==m.t)return;view=m;myTable.seen=now();const me=m.s.find(s=>s.id===myId());if(me)myTable.chips=me.c;if(panelOpen==='poker')rerender(()=>{if(panelOpen==='poker')renderPoker()})};
handlers.bj=(from,m)=>{if(!myTable||myTable.id!==m.t)return;const prev=view;view=m;myTable.seen=now();const me=m.s.find(s=>s.id===myId());
  if(m.ph==='result'&&me&&lastPayRound!==m.rn&&me.bet>0){lastPayRound=m.rn;if(me.p>0)pay(me.p);sfx(me.p>me.bet?'pick':me.p===me.bet?'beep':'fail',0.6);myTable.inRound=0}
  if(m.ph==='play'&&me&&me.bet>0&&myTable.dbl!==m.rn&&prev&&prev.ph==='play'){const pm=prev.s.find(s=>s.id===myId());if(pm&&me.bet===pm.bet*2){pay(-pm.bet);myTable.dbl=m.rn}}
  if(panelOpen==='bj')rerender(()=>{if(panelOpen==='bj')renderBJ()})};
function sit(T,game){myTable={id:T.id,game,host:T.host||myId(),buy:0,chips:0,seen:now()};view=null;myHole=null}
function joinTable(t,buy){if(t.g==='poker'){if(P.money<buy){toast('Nicht genug Geld');return}pay(-buy);myTable={id:t.id,game:'poker',host:t.host,buy,chips:buy,seen:now()}}else myTable={id:t.id,game:'bj',host:t.host,buy:0,chips:0,seen:now()};
  myTable.since=now();myTable.tjT=now();myTable.ok=false;view=null;myHole=null;send({k:'tj',t:t.id,n:myName(),c:buy});if(t.g==='poker')renderPoker();else renderBJ()}
function leaveTable(){if(!myTable)return;send({k:'tl',t:myTable.id});myTable.inRound=0;cashOut(null)}
function cashOut(why){if(!myTable)return;const mt=myTable;myTable=null;view=null;myHole=null;if(mt.game==='poker'&&mt.chips>0)pay(mt.chips);if(mt.game==='bj'&&mt.inRound)pay(mt.inRound);
  const T=tables.get(mt.id);if(T&&T.host===myId())closeTable(T);if(why)toast(why);if(panelOpen==='poker'||panelOpen==='bj')casinoLobby()}
// leaving the table if the host disappears
function clientTick(){if(!myTable||myTable.host===myId())return;
  const inView=view&&view.s&&view.s.some(s=>s.id===myId());if(inView)myTable.ok=true;
  if(!myTable.ok){if(now()-(myTable.tjT||0)>1.5){myTable.tjT=now();send({k:'tj',t:myTable.id,n:myName(),c:myTable.buy||0})}
    if(now()-myTable.since>12){const mt=myTable;myTable=null;view=null;if(mt.game==='poker'&&mt.buy)pay(mt.buy);toast('Der Tisch antwortet nicht – Buy-in zurück');casinoLobby();return}}
  if(now()-myTable.seen>15)cashOut('Verbindung zum Tisch verloren – Chips ausgezahlt.')}

/* ---------------- casino UI ---------------- */
function casinoLobby(){
  const list=[...seen.values()].filter(t=>now()-t.t<12);
  openPanel('casino',`<p class="kicker">${esc(W.casino.name)}</p><h2>Casino</h2>
   <p class="note">Spiel mit anderen Spielern aus der Lobby – oder ganz allein: freie Plätze am Pokertisch übernehmen Bots, beim Blackjack spielst du gegen die Bank. Dein Geld: <b>${fmt(P.money)}</b></p>
   ${list.length?`<p class="kicker">Offene Tische</p><div class="tables">${list.map(t=>`<div class="tbl"><span><b>${t.g==='poker'?'Texas Hold’em':'Blackjack'}</b> · ${esc(t.hn)} · ${t.n}/${t.max}${t.g==='poker'?' · Blinds '+t.stake/2+'/'+t.stake:''}</span><button data-a="tjoin" data-v="${t.id}" type="button">Hinsetzen</button></div>`).join('')}</div>`:''}
   <p class="kicker">Neuer Tisch</p>
   <div class="row"><button class="cta" data-a="newbj" type="button">Blackjack</button><button class="cta" data-a="newpk" type="button">Texas Hold’em</button></div>
   <div class="row"><button class="ghost" data-a="close" type="button">Casino verlassen</button></div>`);
}
let pendingPoker=null;
clickers.newbj=()=>{const T=newBJ();sit(T,'bj');T.seats.push({id:myId(),name:myName(),bet:0,cards:[],won:0});T.dirty=true;renderBJ()};
// poker buy-in gets its own clear page (before, the choice appeared at the bottom of the lobby and was easy to miss)
function buyInPanel(t){pendingPoker=t;openPanel('casino',`<p class="kicker">${esc(W.casino.name)}</p><h2>Texas Hold’em</h2>
   <p class="note">${t==='new'?'Neuer Tisch – freie Plätze übernehmen Bots, andere Spieler können sich dazusetzen.':'Tisch von <b>'+esc(t.hn)+'</b> · '+t.n+'/'+t.max+' Spieler · Blinds '+t.stake/2+'/'+t.stake}<br>Mit wie viel Geld setzt du dich hin? Dein Geld: <b>${fmt(P.money)}</b></p>
   <div id="buyRow"><p class="kicker">Buy-in wählen</p><div class="seg">${[500,1000,2000,5000].map(b=>`<button data-a="buy" data-v="${b}" type="button"${P.money<b?' disabled':''}>${fmt(b)}</button>`).join('')}</div></div>
   <div class="row"><button class="ghost" data-a="lobby" type="button">Zurück</button></div>`)}
clickers.lobby=()=>{pendingPoker=null;casinoLobby()};
clickers.newpk=()=>buyInPanel('new');
clickers.tjoin=v=>{const t=seen.get(v);if(!t){toast('Der Tisch ist nicht mehr offen');casinoLobby();return}if(t.g==='poker')buyInPanel(t);else joinTable(t,0)};
clickers.buy=v=>{const b=+v;if(P.money<b){toast('Nicht genug Geld');return}if(pendingPoker==='new'){pay(-b);const T=newPoker();myTable={id:T.id,game:'poker',host:myId(),buy:b,chips:b,seen:now()};view=null;myHole=null;T.seats.push({id:myId(),name:myName(),chips:b,bot:false});pokerTopUpBots(T);T.dirty=true;renderPoker()}else if(pendingPoker)joinTable(pendingPoker,b)};
clickers.leave=()=>{leaveTable();casinoLobby()};
function seatHtml(s,me,extra){return`<div class="seat${s.id===me?' me':''}${extra||''}"><b>${esc(s.n)}</b>`}
function renderPoker(){
  const v=view;const me=myId();
  if(!v){openPanel('poker',`<p class="kicker">Texas Hold’em</p><h2>Tisch wird vorbereitet …</h2><div class="row"><button class="ghost" data-a="leave" type="button">Aufstehen</button></div>`);return}
  const mine=v.s.find(s=>s.id===me);const myTurn=v.hand&&v.ta>=0&&v.s[v.ta]&&v.s[v.ta].id===me;const need=mine?v.cur-mine.b:0;const pot=v.s.reduce((a,s)=>a+s.tot,0);
  const hole=myHole&&myHole.hn===v.hn?myHole.c:null;const sh=v.sh&&v.sh.hn===v.hn&&!v.hand?v.sh:null;
  const minTo=v.cur+Math.max(v.mr,v.bb);if(pkRaise<minTo)pkRaise=minTo;const maxTo=mine?mine.c+mine.b:0;if(pkRaise>maxTo)pkRaise=maxTo;
  openPanel('poker',`<p class="kicker">Texas Hold’em · Blinds ${v.bb/2}/${v.bb}</p>
   <div class="felt"><div class="board">${[0,1,2,3,4].map(i=>v.b[i]!==undefined?cardHtml(v.b[i]):'<i class="card slot"></i>').join('')}</div><div class="pot">Pot ${fmt(pot)}</div></div>
   <div class="seats">${v.s.map((s,i)=>`<div class="seat${s.id===me?' me':''}${i===v.ta&&v.hand?' turn':''}${s.f?' fold':''}"><b>${esc(s.n)}${i===v.d?' <em class="dealer">D</em>':''}</b><span>${fmt(s.c)}${s.b?' · Einsatz '+fmt(s.b):''}</span>
     <div class="hc">${sh&&sh.cards[s.id]?sh.cards[s.id].map(c=>cardHtml(c,1)).join(''):s.id===me&&hole?hole.map(c=>cardHtml(c,1)).join(''):s.in&&!s.f&&v.hand?cardHtml(null,1)+cardHtml(null,1):''}</div>
     <small>${sh?(sh.res[s.id]?'<b class="win">+'+fmt(sh.res[s.id])+'</b> ':'')+esc(sh.names[s.id]||''):esc(s.l)}</small></div>`).join('')}</div>
   ${myTurn?`<div class="acts"><button class="cta" data-a="pk" data-v="fold" type="button">Passen</button><button class="cta" data-a="pk" data-v="${need>0?'call':'check'}" type="button">${need>0?'Mitgehen '+fmt(Math.min(need,mine.c)):'Schieben'}</button>
     ${mine.c>need?`<button class="cta" data-a="pk" data-v="raise" type="button">${pkRaise>=maxTo?'All-in':'Erhöhen auf '+fmt(pkRaise)}</button><span class="rz"><button data-a="rz" data-v="-1" type="button">−</button><button data-a="rz" data-v="1" type="button">+</button><button data-a="rz" data-v="max" type="button">Max</button></span>`:''}<span class="note">${v.left} s</span></div>`:
     `<p class="note">${v.hand?(v.ta>=0&&v.s[v.ta]?esc(v.s[v.ta].n)+' ist dran …':'…'):'Nächste Hand gleich …'}</p>`}
   <div class="row">${mine&&mine.c<v.bb&&!v.hand?`<button class="ghost" data-a="rebuy" type="button">Nachkaufen ${fmt(1000)}</button>`:''}<button class="ghost" data-a="leave" type="button">Aufstehen &amp; auszahlen</button></div>`);
}
clickers.pk=v=>{if(!view||!myTable)return;send({k:'pa',t:myTable.id,a:v,v:pkRaise});pkRaise=0};
clickers.rz=v=>{if(!view)return;const mine=view.s.find(s=>s.id===myId());if(!mine)return;const step=view.bb*(view.cur>view.bb*8?5:2);if(v==='max')pkRaise=mine.c+mine.b;else pkRaise+=(+v)*step;renderPoker()};
clickers.rebuy=()=>{if(P.money<1000){toast('Nicht genug Geld');return}pay(-1000);myTable.buy+=1000;send({k:'pa',t:myTable.id,a:'rebuy',c:1000})};
let bjBet=50;
function renderBJ(){
  const v=view,me=myId();if(!v){openPanel('bj',`<p class="kicker">Blackjack</p><h2>Tisch wird vorbereitet …</h2><div class="row"><button class="ghost" data-a="leave" type="button">Aufstehen</button></div>`);return}
  const mine=v.s.find(s=>s.id===me);const myTurn=v.ph==='play'&&v.s[v.ta]&&v.s[v.ta].id===me;
  openPanel('bj',`<p class="kicker">Blackjack · Bank zieht bis 16, steht ab 17 · Blackjack zahlt 3:2</p>
   <div class="felt"><div class="board">${v.d.map(c=>cardHtml(c)).join('')}</div><div class="pot">${v.dv?'Bank: '+v.dv:'Bank'}</div></div>
   <div class="seats">${v.s.map((s,i)=>`<div class="seat${s.id===me?' me':''}${i===v.ta&&v.ph==='play'?' turn':''}"><b>${esc(s.n)}</b><span>${s.bet?'Einsatz '+fmt(s.bet):'—'}${s.c.length?' · '+s.v:''}</span><div class="hc">${s.c.map(c=>cardHtml(c,1)).join('')}</div><small>${s.r?'<b class="'+(s.p>s.bet?'win':'')+'">'+esc(s.r)+'</b>':''} ${s.won?'Bilanz '+(s.won>0?'+':'')+fmt(s.won):''}</small></div>`).join('')}</div>
   ${v.ph==='bet'?(mine&&mine.bet?`<p class="note">Einsatz ${fmt(mine.bet)} – Karten in ${v.left} s</p>`:`<div class="acts"><span class="rz"><button data-a="bjb" data-v="-1" type="button">−</button><b>${fmt(bjBet)}</b><button data-a="bjb" data-v="1" type="button">+</button></span><button class="cta" data-a="bjbet" type="button">Setzen</button><span class="note">${v.left} s</span></div>`):
     myTurn?`<div class="acts"><button class="cta" data-a="bja" data-v="hit" type="button">Karte</button><button class="cta" data-a="bja" data-v="stand" type="button">Halten</button>${mine.c.length===2&&P.money>=mine.bet?`<button class="cta" data-a="bja" data-v="double" type="button">Verdoppeln</button>`:''}</div>`:
     `<p class="note">${v.ph==='play'?(v.s[v.ta]?esc(v.s[v.ta].n)+' ist dran …':''):v.ph==='dealer'?'Die Bank zieht …':'Nächste Runde gleich …'}</p>`}
   <div class="row"><button class="ghost" data-a="leave" type="button">Aufstehen</button></div>`);
}
clickers.bjb=v=>{const steps=[10,25,50,100,250,500,1000,2500];let i=steps.indexOf(bjBet);i=clamp(i+(+v),0,steps.length-1);bjBet=steps[i];renderBJ()};
clickers.bjbet=()=>{if(P.money<bjBet){toast('Nicht genug Geld');return}pay(-bjBet);myTable.inRound=bjBet;send({k:'bb',t:myTable.id,v:bjBet})};
clickers.bja=v=>{if(v==='double'){const mine=view.s.find(s=>s.id===myId());if(!mine||P.money<mine.bet)return;myTable.inRound=(myTable.inRound||0)+mine.bet}send({k:'ba',t:myTable.id,a:v})};
const _close=clickers.close;clickers.close=()=>{if(myTable)leaveTable();_close()};

/* ================================================================================================ */
/*                                    points of interest & main tick                               */
/* ================================================================================================ */
A.busy=()=>!!(race.st&&race.st!=='done')||!!heist.st;
A.markers=()=>{const out=[];if(W.casino)out.push({x:W.casino.x,y:W.casino.y,k:'casino'});if(BANK)out.push({x:BANK.x,y:BANK.y,k:'bank'});for(const r of RACES)out.push({x:r.x,y:r.y,k:'race'});return out};
function nearPOI(){
  if(G.state!=='play'||S.mission.active||P.ride)return null;const src=P.inCar||P;
  if(heist.st==='hack'&&!P.inCar){for(let i=0;i<BANK.terms.length;i++){const t=BANK.terms[i];if(!heist.solved[i]&&hypot(P.x-t.x,P.y-t.y)<2.6)return{label:t.name+' knacken',fn:()=>startPuzzle(i)}}}
  if(A.busy())return null;
  if(W.casino&&!P.inCar&&hypot(P.x-W.casino.x,P.y-W.casino.y)<4.5){if(S.stars()>0)return{key:'casinoW',auto:true,label:'Casino (erst Polizei abhängen)',fn:()=>toast('Mit Fahndung kommst du nicht rein')};return{key:'casino',auto:true,label:'Casino betreten',fn:casinoLobby}}
  if(BANK&&!P.inCar&&hypot(P.x-BANK.x,P.y-BANK.y)<4){return{key:'bank',auto:true,label:remoteHeist&&now()-remoteHeist.t<10?'Bankraub mitmachen':'Bankraub planen',fn:()=>{if(remoteHeist&&now()-remoteHeist.t<10)joinHeist();else openPanel('heist',`<p class="kicker">${esc(BANK.name)}</p><h2>Bankraub</h2>
     <p class="note">Bis zu 4 Spieler. Schaltet an drei Stellen rund um die Bank die Sicherheitssysteme aus (Kabel, Funkfrequenz, Tresorcode), bohrt den Tresor auf, während die Polizei anrückt, und bringt die Beute ins Versteck. Mehr Crew = mehr Beute insgesamt.</p>
     <div class="row"><button class="cta" data-a="hplan" type="button">${online()?'Crew zusammenstellen':'Loslegen'}</button><button class="ghost" data-a="close" type="button">Lieber nicht</button></div>`,false)}}}
  const ground=P.inCar&&!P.inCar.t.plane;
  if(ground)for(const r of RACES){if(hypot(src.x-r.x,src.y-r.y)<16&&Math.hypot(P.inCar.vx,P.inCar.vy)<9)return{key:'race'+r.id,auto:true,label:'Rennen: '+r.name,fn:()=>racePanel(r)}}
  if(!P.inCar)for(const r of RACES){if(hypot(P.x-r.x,P.y-r.y)<10)return{key:'raceF'+r.id,auto:true,label:'Rennen: '+r.name+' (nur mit Fahrzeug)',fn:()=>toast('Hol dir ein Auto oder Motorrad und fahr auf die Startlinie')}}
  for(const r of remoteRaces.values()){if(ground&&hypot(src.x-r.def.x,src.y-r.def.y)<14)return{label:'Mitfahren: '+r.def.name+' ('+fmt(r.fee)+')',fn:()=>joinRace(r)}}
  return null}
clickers.hplan=()=>planHeist();
let tickT=0,lastT=now(),autoKey=null,lobT=0,lobSig=null;
function tick(){
  const t=now(),dt=Math.min(0.1,t-lastT);lastT=t;
  try{
    if(G.state!=='menu'){raceTick(dt);heistTick(dt);puzzleTick(dt);clientTick()}
    for(const T of tables.values()){T.annT-=dt;if(T.annT<=0){T.annT=4;announce(T)}T.hbT=(T.hbT||0)-dt;if(T.hbT<=0){T.hbT=2.5;T.dirty=true}if(T.game==='poker')pokerTick(T);else bjTick(T)}
    tickT-=dt;if(tickT<=0){tickT=0.25;const zone=nearPOI();
      // stepping onto the red carpet / the bank steps / a start line opens the activity by itself (once per visit), the button stays as a fallback
      if(!zone)autoKey=null;else if(zone.auto&&zone.key!==autoKey&&!panelOpen){autoKey=zone.key;try{zone.fn()}catch(e){console.error(e)}}
      const poi=panelOpen?null:zone;btnAction=poi?poi.fn:null;const b=$('actBtn');b.hidden=!poi;if(poi&&b.textContent!==poi.label)b.textContent=poi.label;renderInvites()}
    // the casino lobby keeps its list of open tables up to date while it is open
    lobT-=dt;if(lobT<=0){lobT=1;if(panelOpen==='race'&&panelRace){const r=[...remoteRaces.values()].find(q=>q.def.id===panelRace.id);if((r?r.id:'')!==panelRaceSig&&!ptrDown)racePanel(panelRace)}
      if(panelOpen==='casino'){const sig=[...seen.values()].filter(q=>now()-q.t<12).map(q=>q.id+':'+q.n).join(',');const br=$('buyRow');if(sig!==lobSig&&!(br&&!br.hidden)&&!ptrDown){lobSig=sig;casinoLobby()}}else lobSig=null}
  }catch(e){console.error(e)}
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
A._t={heist,race,tables,solve:ok=>{if(puz)puzzleDone(ok)},get puz(){return puz},get view(){return view}};
})(window));
