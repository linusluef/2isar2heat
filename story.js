// 2Isar2Heat – story campaign "Isarfieber": characters waiting at contact points around the city, dialogue scenes
// with letterbox camera shots before each story mission, phone calls afterwards, chapter cards and an ending.
// The missions themselves are defined in sim.js (STORY, with a `story` block each).
(window.IH_MODS=window.IH_MODS||[]).push(()=>(function(root){
'use strict';
const IH=root.IH,S=IH.sim,G=S.G,P=S.player,W=IH.world,R3=IH.r3;
const $=id=>document.getElementById(id);
const hypot=Math.hypot;
const CAST={
  sepp:{name:'Sepp',role:'Wirt vom Grünen Hirsch',col:'#ffc61a',shirt:'#3f6b34',hair:'#9a9a9a',pitch:0.8,rate:0.95},
  vroni:{name:'Vroni',role:'Fahrerin',col:'#ff6fae',shirt:'#c2185b',hair:'#7a3b12',pitch:1.35,rate:1.08},
  memo:{name:'Memo',role:'Schrauber aus Giesing',col:'#3bd0ff',shirt:'#1f4e79',hair:'#141414',pitch:1.0,rate:1.05},
  brandl:{name:'Kommissar Brandl',role:'Kripo München',col:'#a9bfd6',shirt:'#55595f',hair:'#2e2e2e',pitch:0.7,rate:0.92},
};
const CHAPTER={1:'Kapitel 1 · Neu in der Stadt',2:'Kapitel 2 · Der Graf',3:'Kapitel 3 · Isarfieber'};
const current=()=>G.story<S.STORY.length?S.STORY[G.story]:null;

/* ---------- contact points and the characters standing there ---------- */
const posCache=new Map();
function contactPos(def){const k=def.story.at;let p=posCache.get(k);if(p)return p;const pl=W.places.find(q=>q.name===k)||{x:600,y:920};
  // stand on the pavement next to the place, not in the middle of the road
  let best=null;for(let r=0;r<40&&!best;r+=2)for(let i=0;i<16&&!best;i++){const a=i/16*Math.PI*2,x=pl.x+Math.cos(a)*r,y=pl.y+Math.sin(a)*r;const t=W.at(x,y);if(t===W.TY.WALK||t===W.TY.PLAZA)best={x,y}}
  p=best||{x:pl.x,y:pl.y};posCache.set(k,p);return p}
let npc=null,npcFor=null;
function ensureNpc(def){const cp=contactPos(def),c=CAST[def.story.npc];const near=hypot(P.x-cp.x,P.y-cp.y)<180;
  if(!near){if(npc){npc.alive=false;npc=null}return}
  if(!npc||!npc.alive||npcFor!==def||!S.peds.includes(npc)){if(npc)npc.alive=false;npc=S.makePed(cp.x,cp.y,'civ');Object.assign(npc,{npc:true,state:'npc',shirt:c.shirt,hair:c.hair,id:'npc_'+def.story.npc+'_'+G.story});npc.face=0;S.peds.push(npc);npcFor=def}
  npc.x=cp.x;npc.y=cp.y;npc.lx=cp.x;npc.ly=cp.y;npc.spdNow=0;
  const d=hypot(P.x-npc.x,P.y-npc.y);if(d<25)npc.a=Math.atan2(P.y-npc.y,P.x-npc.x)}
function canStart(){if(G.state!=='play'||S.mission.active||cut||S.stars()>0||P.ride)return false;if(IH.act&&IH.act.busy&&IH.act.busy())return false;const c=P.inCar;if(c&&(c.t.plane||Math.hypot(c.vx,c.vy)>3))return false;return true}

/* ---------- cutscene UI ---------- */
const box=document.createElement('div');box.id='story';box.hidden=true;box.innerHTML='<div class="lb top"></div><div class="lb bot"></div><div id="stCard"></div><div id="stDlg"><div id="stWho"></div><div id="stTxt"></div><div class="stBtns"><span></span><button type="button" id="stNext">Weiter ›</button></div></div><button type="button" id="stSkip">Überspringen ››</button>';   // skip is always visible, also during the chapter card
document.body.appendChild(box);
let cut=null;   // {lines,i,shown,full,t,cam,onEnd,phone}
function speakLine(who,txt){try{if(IH.settings.muted||!root.speechSynthesis)return;speechSynthesis.cancel();const c=CAST[who]||{};const u=new SpeechSynthesisUtterance(txt.replace(/[„“’]/g,''));u.lang='de-DE';u.pitch=c.pitch||1;u.rate=c.rate||1;u.volume=1;
  const v=speechSynthesis.getVoices().filter(x=>/^de/i.test(x.lang));if(v.length)u.voice=v[(who.length)%v.length];speechSynthesis.speak(u)}catch(e){}}
function showLine(){const L=cut.lines[cut.i];const c=CAST[L[0]]||{name:L[0],col:'#fff'};
  $('stWho').innerHTML=(cut.phone?'📞 ':'')+'<b style="color:'+c.col+'">'+c.name+'</b>'+(c.role?' <span>'+c.role+'</span>':'');cut.full=L[1];cut.shown=0;$('stTxt').textContent='';
  cut.speaker=L[0];speakLine(L[0],L[1])}
function play(lines,o){if(!lines||!lines.length){o.onEnd&&o.onEnd();return}
  cut=Object.assign({lines,i:0,shown:0,full:'',t:0,weapon:P.weapon},o);G.cut=true;P.weapon=0;box.hidden=false;   // (gun put away while talking)
  document.body.classList.add('cutscene');
  try{root.speechSynthesis&&speechSynthesis.cancel()}catch(e){}
  if(o.card){$('stCard').textContent=o.card;$('stCard').className='on';$('stDlg').style.visibility='hidden';cut.cardT=2.6}else{$('stCard').className='';$('stDlg').style.visibility='visible';showLine()}}
function advance(){if(!cut)return;if(cut.cardT>0){cut.cardT=0;$('stCard').className='';$('stDlg').style.visibility='visible';showLine();return}
  if(cut.shown<cut.full.length){cut.shown=cut.full.length;$('stTxt').textContent=cut.full;return}
  cut.i++;if(cut.i>=cut.lines.length){finish();return}showLine()}
function finish(){const c=cut;cut=null;G.cut=false;if(c&&c.weapon!==undefined&&P.weapon===0)P.weapon=c.weapon;box.hidden=true;document.body.classList.remove('cutscene');R3.camOverride=null;try{root.speechSynthesis&&speechSynthesis.cancel()}catch(e){}if(c&&c.onEnd)c.onEnd()}
$('stNext').addEventListener('click',e=>{e.stopPropagation();advance()});
$('stSkip').addEventListener('click',e=>{e.stopPropagation();if(cut){cut.i=cut.lines.length-1;cut.shown=cut.full.length;cut.cardT=0;finish()}});
box.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;e.preventDefault();advance()});
root.addEventListener('keydown',e=>{if(!cut)return;if(e.code==='Space'||e.code==='Enter'||e.code==='KeyE'){e.preventDefault();advance()}else if(e.code==='Escape'){e.preventDefault();$('stSkip').click()}},true);

// camera: a slow over-the-shoulder shot of the character and you
function cutCam(){const n=npc,t=performance.now()/1000;const src=P.inCar||P;
  if(cut.phone||!n){const a=t*0.12;return[src.x+Math.cos(a)*9,6.5,src.y+Math.sin(a)*9,src.x,1.2,src.y]}
  const mx=(n.x+src.x)/2,my=(n.y+src.y)/2;const dx=src.x-n.x,dy=src.y-n.y,d=Math.max(1.5,hypot(dx,dy));const ux=dx/d,uy=dy/d;
  const side=cut.i%2?1:-1,sw=Math.sin(t*0.25)*0.8;
  const cx=mx-uy*(4.2+d*0.6)*side+ux*sw,cy=my+ux*(4.2+d*0.6)*side+uy*sw;return[cx,2.3,cy,mx,1.45,my]}

/* ---------- flow ---------- */
let postQ=[],lastCh=0;
function startStory(def){const st=def.story;const card=st.ch!==lastCh&&(G.story===0||S.STORY[G.story-1].story.ch!==st.ch)?CHAPTER[st.ch]:null;lastCh=st.ch;
  if(P.inCar){const c=P.inCar;c.vx*=0.2;c.vy*=0.2}P.vx=P.vy=0;if(!P.inCar&&npc)P.a=Math.atan2(npc.y-P.y,npc.x-P.x);
  R3.camOverride=()=>cut?cutCam():null;
  // seen this briefing already (retry after a failed attempt)? then only the last line
  const again=seenPre.has(def),lines=again?[st.pre[st.pre.length-1]]:st.pre;seenPre.add(def);needLeave=true;
  play(lines,{card:again?null:card,onEnd:()=>{if(current()!==def)return;S.mission.start(def,null)}})}
const seenPre=new Set();let needLeave=false;
// after a story mission: the character calls you
const ow=S.mission.win;S.mission.win=function(){const def=this.data&&this.data.def;ow.apply(this,arguments);if(def&&def.story)postQ.push({def,t:performance.now()+3200})};   // the call comes once the success banner is gone
function playPost(def){R3.camOverride=()=>cut?cutCam():null;
  play(def.story.post,{phone:!def.story.end,onEnd:()=>{if(def.story.end)ending();else{const nx=current();if(nx)IH.on&&IH.on.toast&&IH.on.toast('Neuer Story-Auftrag: '+nx.title+' · '+CAST[nx.story.npc].name+' wartet bei '+nx.story.at+' ★')}}})}
function ending(){R3.camOverride=()=>cut?cutCam():null;play([['sepp','Servus, und danke – ohne di hätt’ ma’s ned g’schafft.']],{card:'ENDE · Danke fürs Spielen!',onEnd:()=>{IH.on&&IH.on.banner&&IH.on.banner('Isarfieber – geschafft!','Freie Aufträge gibt’s weiter an den grünen Telefonzellen','#ffc61a')}})}

let tickT=0,lastT=performance.now();
function tick(){const nowT=performance.now(),dt=Math.min(0.25,(nowT-lastT)/1000);lastT=nowT;
  if(cut){if(cut.cardT>0){cut.cardT-=dt;if(cut.cardT<=0){$('stCard').className='';$('stDlg').style.visibility='visible';showLine()}}
    else if(cut.shown<cut.full.length){cut.shown=Math.min(cut.full.length,cut.shown+dt*42);$('stTxt').textContent=cut.full.slice(0,Math.floor(cut.shown))}
    if(G.state!=='play'){finish()}return}
  if(G.state!=='play')return;
  if(postQ.length&&performance.now()>postQ[0].t&&!S.mission.active&&S.stars()===0){playPost(postQ.shift().def);return}
  const def=current();if(!def){if(npc){npc.alive=false;npc=null}return}
  tickT-=dt;if(tickT<=0){tickT=0.25;ensureNpc(def)}
  if(npc){const src=P.inCar||P;const d=hypot(src.x-npc.x,src.y-npc.y);if(d>10)needLeave=false;if(!needLeave&&canStart()&&d<(P.inCar?7:3.2))startStory(def)}
}
setInterval(tick,1000/60);

IH.story={
  get active(){return!!cut},
  marker(){const d=current();if(!d||S.mission.active)return null;const cp=contactPos(d);return{x:cp.x,y:cp.y,title:d.title,label:CAST[d.story.npc].name+' · '+d.story.at,chapter:'Kapitel '+d.story.ch}},
  // the route arrow / light beam to the next contact only when you ask for it (tap the story button in the mission panel)
  get nav(){return!!IH.settings.storyNav},
  toggleNav(){IH.settings.storyNav=!IH.settings.storyNav;try{IH.saveSettings&&IH.saveSettings()}catch(e){}const m=this.marker();if(IH.on&&IH.on.toast)IH.on.toast(IH.settings.storyNav&&m?'Navi zur Story: '+m.label:'Story-Navi aus');},
  target(){if(!IH.settings.storyNav||S.mission.active||cut||(IH.act&&IH.act.busy&&IH.act.busy()))return null;const m=this.marker();return m?{x:m.x,y:m.y}:null},
  labels(){const out=[];if(npc&&npc.alive&&npcFor){const c=CAST[npcFor.story.npc];if(hypot(P.x-npc.x,P.y-npc.y)<60)out.push({x:npc.x,y:npc.y,t:c.name+' ★',c:c.col})}return out},
  _play:play,_next:advance,_skip:()=>{if(cut)$('stSkip').click()},CAST
};
})(window));
