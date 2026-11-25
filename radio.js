// 2Isar2Heat – car and aircraft radio. Three stations whose music is generated live with the Web Audio API
// (no recordings): Isar FM (dance), Lo-Fi Lehel (chillhop) and Radio Weißwurst (Bavarian brass).
// Each station runs on its own clock, so switching away and back drops you into the song where it is "now".
(window.IH_MODS=window.IH_MODS||[]).push(()=>(function(root){
'use strict';
const IH=root.IH,S=IH.sim,G=S.G,P=S.player;
const $=id=>document.getElementById(id);
function rnd(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
const mtof=m=>440*Math.pow(2,(m-69)/12);
const pick=(r,a)=>a[Math.floor(r()*a.length)];

const STATIONS=[
  {id:'isar',name:'Isar FM',genre:'Dance & House',bpm:124,bars:32,color:'#3bd0ff',gen:genDance,vol:0.9,
   talk:['Isar FM – der Beat von München.','Ihr hört Isar FM. Mehr Bass für die Leopoldstraße.','Isar FM. Nonstop Dance, auch auf dem Mittleren Ring.']},
  {id:'lofi',name:'Lo-Fi Lehel',genre:'Chillhop',bpm:80,bars:24,swing:0.18,color:'#c79bff',gen:genLofi,vol:1.0,
   talk:['Lo-Fi Lehel. Zurücklehnen, auch im Stau.','Ihr hört Lo-Fi Lehel – Beats zum Cruisen an der Isar.']},
  {id:'blas',name:'Radio Weißwurst',genre:'Blasmusik',bpm:120,bars:32,color:'#ffc61a',gen:genBlas,vol:0.85,
   talk:['Radio Weißwurst – Servus und a scheene Fahrt!','Des is Radio Weißwurst. Blasmusik bis zum Frühschoppen.','Radio Weißwurst. Prost, und schaut’s auf de Straß!']},
  {id:'off',name:'Radio aus',genre:'',color:'#8a9099'}];
let cur=Number.isInteger(IH.settings.radio)?IH.settings.radio:0;if(cur<0||cur>=STATIONS.length)cur=0;

/* ---------------- audio graph ---------------- */
let A=null;   // {AC,bus,st:gain,noise,crackle}
function ensure(){
  if(A)return A;const au=IH.audio;if(!au||!au.AC)return null;const AC=au.AC;
  const bus=AC.createGain();bus.gain.value=0.5;const comp=AC.createDynamicsCompressor();comp.threshold.value=-16;comp.ratio.value=3.5;comp.attack.value=0.01;comp.release.value=0.2;
  bus.connect(comp);comp.connect(au.master);
  const st=AC.createGain();st.gain.value=0;st.connect(bus);
  // vinyl crackle for the lo-fi station
  const cb=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate);const cd=cb.getChannelData(0);for(let i=0;i<cd.length;i++)cd[i]=Math.random()<0.0009?(Math.random()*2-1)*0.9:(Math.random()*2-1)*0.012;
  const cs=AC.createBufferSource();cs.buffer=cb;cs.loop=true;const cg=AC.createGain();cg.gain.value=0;const cf=AC.createBiquadFilter();cf.type='bandpass';cf.frequency.value=2500;cf.Q.value=0.6;cs.connect(cf);cf.connect(cg);cg.connect(st);cs.start();
  // tuning static between stations
  const ns=AC.createBufferSource();ns.buffer=au.noiseBuf;ns.loop=true;const ng=AC.createGain();ng.gain.value=0;const nf=AC.createBiquadFilter();nf.type='bandpass';nf.frequency.value=1600;nf.Q.value=0.8;ns.connect(nf);nf.connect(ng);ng.connect(bus);ns.start();
  A={AC,bus,st,noise:au.noiseBuf,crackle:cg,stat:ng,out:st};return A;
}
// --- voices; every voice connects into A.out (the station gain) ---
function vg(t,peak,a,d,sus,rel,len){const g=A.AC.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(0.0002,peak),t+a);
  if(sus){g.gain.setValueAtTime(peak,t+Math.max(a,len-rel));g.gain.exponentialRampToValueAtTime(0.0001,t+len)}else g.gain.exponentialRampToValueAtTime(0.0001,t+a+d);return g}
function osc(type,f,t,stop){const o=A.AC.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);o.start(t);o.stop(stop);return o}
function filt(type,f,q){const b=A.AC.createBiquadFilter();b.type=type;b.frequency.value=f;if(q)b.Q.value=q;return b}
function noiseSrc(t,stop){const s=A.AC.createBufferSource();s.buffer=A.noise;s.start(t,Math.random()*0.8);s.stop(stop);return s}
const V={
  kick(t,v){const o=osc('sine',150,t,t+0.4);o.frequency.exponentialRampToValueAtTime(42,t+0.12);const g=vg(t,v,0.004,0.34);o.connect(g);g.connect(A.out)},
  boom(t,v){const o=osc('sine',110,t,t+0.5);o.frequency.exponentialRampToValueAtTime(48,t+0.18);const g=vg(t,v,0.006,0.45);const f=filt('lowpass',600);o.connect(f);f.connect(g);g.connect(A.out)},
  snare(t,v,soft){const n=noiseSrc(t,t+0.3);const f=filt('bandpass',soft?1300:1900,0.7);const g=vg(t,v*0.9,0.002,soft?0.14:0.18);n.connect(f);f.connect(g);g.connect(A.out);const o=osc('triangle',190,t,t+0.15);const g2=vg(t,v*0.45,0.002,0.09);o.connect(g2);g2.connect(A.out)},
  clap(t,v){for(let i=0;i<3;i++){const n=noiseSrc(t+i*0.011,t+i*0.011+0.2);const f=filt('bandpass',1500,1.2);const g=vg(t+i*0.011,v*(i===2?1:0.6),0.002,i===2?0.16:0.03);n.connect(f);f.connect(g);g.connect(A.out)}},
  hat(t,v,open){const n=noiseSrc(t,t+0.4);const f=filt('highpass',open?6500:7800);const g=vg(t,v,0.002,open?0.24:0.045);n.connect(f);f.connect(g);g.connect(A.out)},
  crash(t,v){const n=noiseSrc(t,t+1.6);const f=filt('highpass',4200);const g=vg(t,v,0.004,1.4);n.connect(f);f.connect(g);g.connect(A.out)},
  bass(t,m,len,v,type,cut){const o=osc(type||'sawtooth',mtof(m),t,t+len+0.05);const f=filt('lowpass',(cut||600)*3,4);f.frequency.setValueAtTime((cut||600)*3,t);f.frequency.exponentialRampToValueAtTime(cut||600,t+0.12);const g=vg(t,v,0.005,0,true,0.04,len);o.connect(f);f.connect(g);g.connect(A.out)},
  sub(t,m,len,v){const o=osc('sine',mtof(m),t,t+len+0.05);const g=vg(t,v,0.01,0,true,0.08,len);o.connect(g);g.connect(A.out)},
  pluck(t,m,len,v,type){const o=osc(type||'square',mtof(m),t,t+len+0.3);const f=filt('lowpass',3200,2);f.frequency.setValueAtTime(3200,t);f.frequency.exponentialRampToValueAtTime(700,t+0.25);const g=vg(t,v,0.004,Math.max(0.12,len));o.connect(f);f.connect(g);g.connect(A.out)},
  pad(t,ms,len,v){const f=filt('lowpass',1300,0.8);const g=vg(t,v,0.35,0,true,0.4,len);f.connect(g);g.connect(A.out);for(const m of ms)for(const d of[-7,7]){const o=osc('sawtooth',mtof(m),t,t+len+0.05);o.detune.value=d;o.connect(f)}},
  keys(t,ms,len,v){const f=filt('lowpass',1700);const g=vg(t,v,0.008,0,true,0.25,len);f.connect(g);g.connect(A.out);for(const m of ms){const o=osc('triangle',mtof(m),t,t+len+0.05);o.detune.value=(Math.random()-0.5)*9;o.connect(f);const o2=osc('sine',mtof(m+12),t,t+len*0.6);const g2=vg(t,0.35,0.005,len*0.5);o2.connect(g2);g2.connect(f)}},
  tuba(t,m,len,v){const o=osc('sawtooth',mtof(m),t,t+len+0.05);const f=filt('lowpass',420,1.5);f.frequency.setValueAtTime(700,t);f.frequency.exponentialRampToValueAtTime(380,t+0.1);const g=vg(t,v,0.02,0,true,0.05,len);o.connect(f);f.connect(g);g.connect(A.out)},
  brass(t,ms,len,v){const f=filt('lowpass',900,1);f.frequency.setValueAtTime(600,t);f.frequency.linearRampToValueAtTime(1900,t+0.05);f.frequency.exponentialRampToValueAtTime(1000,t+len);const g=vg(t,v,0.025,0,true,0.04,len);f.connect(g);g.connect(A.out);for(const m of ms){const o=osc('sawtooth',mtof(m),t,t+len+0.05);o.detune.value=(Math.random()-0.5)*10;o.connect(f)}},
  clar(t,m,len,v){const o=osc('square',mtof(m),t,t+len+0.05);const lfo=osc('sine',5.5,t,t+len+0.05);const lg=A.AC.createGain();lg.gain.value=len>0.3?6:0;lfo.connect(lg);lg.connect(o.detune);const f=filt('lowpass',2300,0.7);const g=vg(t,v,0.02,0,true,0.04,len);o.connect(f);f.connect(g);g.connect(A.out)},
  chime(t,m,v){const o=osc('sine',mtof(m),t,t+1.2);const g=vg(t,v,0.005,1.1);o.connect(g);g.connect(A.out);const o2=osc('sine',mtof(m+19),t,t+0.6);const g2=vg(t,v*0.3,0.005,0.5);o2.connect(g2);g2.connect(A.out)},
};

/* ---------------- song generators: return an array of steps (16 per bar), each a list of [voice,...args(relative)] ---------------- */
const MINOR_PROGS=[[[0,3,7],[-4,0,3],[3,7,10],[-2,2,5]],[[0,3,7],[-2,2,5],[-4,0,3],[-5,-2,2]],[[0,3,7],[5,8,12],[-4,0,3],[-2,2,5]],[[0,3,7],[-4,0,3],[5,8,12],[-5,-1,2]]];
function genDance(r){
  const root=pick(r,[45,47,48,50,52]),prog=pick(r,MINOR_PROGS),bars=32,steps=[];const arp=pick(r,[[0,1,2,1],[0,2,1,2],[2,1,0,1],[0,1,2,3]]);
  const sec=b=>b<4?'intro':b<12?'a':b<20?'b':b<24?'break':'drop';
  for(let b=0;b<bars;b++){const ch=prog[b%4],s=sec(b),last=b%4===3;
    for(let i=0;i<16;i++){const ev=[];
      if(s!=='break'&&i%4===0)ev.push(['kick',0.9]);
      if(s==='break'&&b===23)ev.push(['snare',0.15+i/16*0.5]);
      if(s!=='intro'&&s!=='break'&&(i===4||i===12))ev.push(['clap',0.55]);
      if(i%4===2)ev.push(['hat',s==='intro'?0.18:0.3,true]);else if(s==='drop'||s==='b')ev.push(['hat',0.09,false]);
      if((s==='a'||s==='b'||s==='drop')&&(i%4===2||(i%4===3&&r()<0.25)))ev.push(['bass',root-12+ch[0],0.4,0.42,'sawtooth',420]);
      if(i===0&&(s==='b'||s==='break'||s==='drop'))ev.push(['pad',ch.map(n=>root+12+n),4,0.07]);
      if((s==='b'||s==='drop')&&i%2===0){const n=ch[arp[(i/2)%4]%3]+(arp[(i/2)%4]===3?12:0);ev.push(['pluck',root+24+n,0.22,s==='drop'?0.11:0.08,'square'])}
      if(i===0&&b%8===0&&b>0)ev.push(['crash',0.25]);
      if(last&&s==='a'&&i>=12)ev.push(['snare',0.12+(i-12)*0.05]);
      steps.push(ev)}}
  return steps}
const JAZZ=[[[2,5,9,12],[7,11,14,17],[0,4,7,11],[9,13,16,19]],[[0,4,7,11],[9,12,16,19],[2,5,9,12],[7,11,14,17]],[[5,9,12,16],[4,7,11,14],[2,5,9,12],[7,10,14,17]],[[9,12,16,19],[2,5,9,12],[7,11,14,17],[0,4,7,11]]];
function genLofi(r){
  const root=pick(r,[48,50,51,53]),prog=pick(r,JAZZ),bars=24,steps=[];const kp=pick(r,[[0,7,10],[0,6,10],[0,3,10],[0,8,11]]);
  const pent=[0,2,4,7,9,12,14,16];
  for(let b=0;b<bars;b++){const ch=prog[b%4],intro=b<2;
    for(let i=0;i<16;i++){const ev=[];
      if(!intro&&kp.includes(i))ev.push(['boom',0.8]);
      if(!intro&&(i===4||i===12))ev.push(['snare',0.38,true]);
      if(i%2===0)ev.push(['hat',(i%4===0?0.07:0.12)*(0.7+r()*0.5),false]);
      if(i===0)ev.push(['keys',ch.map(n=>root+n),3.6,0.12]);
      if(i===10&&r()<0.5)ev.push(['keys',ch.slice(1).map(n=>root+n),1,0.07]);
      if(!intro&&(i===0||i===10||(i===7&&r()<0.4)))ev.push(['sub',root-24+ch[0],1.2,0.34]);
      if(b>=8&&b<20&&i%2===0&&r()<0.28)ev.push(['pluck',root+12+pick(r,pent),0.5,0.06,'triangle']);
      steps.push(ev)}}
  return steps}
function genBlas(r){
  const root=pick(r,[53,55,58,51]),bars=32,steps=[];
  const I=[0,4,7],IV=[5,9,12],V=[7,11,14],V7=[7,11,14,17];
  const prog=[I,I,V7,V7,V,V,I,I, I,I,IV,IV,I,V7,I,I];
  // melody: a motif for the A part and one for the B part, built on the chord tones
  const motif=k=>{const m=[];const r2=rnd(Math.floor(r()*1e9)+k);for(let b=0;b<4;b++){const bar=[];for(let i=0;i<8;i++){const rest=r2()<0.12;bar.push(rest?null:(r2()<0.7?pick(r2,[0,2,4]):pick(r2,[1,3,5])))}m.push(bar)}return m};
  const mA=motif(1),mB=motif(2);const scale=[0,2,4,5,7,9,11,12,14,16,17,19];
  for(let b=0;b<bars;b++){const ch=prog[b%16],part=(b%16)<8?'A':'B',mot=part==='A'?mA:mB,bar=mot[b%4];
    for(let i=0;i<16;i++){const ev=[];
      if(i===0||i===8)ev.push(['tuba',root-24+(i===0?ch[0]:ch[0]+7-(ch[0]+7>9?12:0)),0.8,0.5]);
      if(i===4||i===12)ev.push(['brass',ch.slice(0,3).map(n=>root+n),0.45,0.12]);
      if(i===4||i===12)ev.push(['snare',0.12,true]);
      if(i%2===0&&b>=2){const deg=bar[i/2];if(deg!==null){const base=ch[0]===7?4:ch[0]===5?3:0;const n=scale[Math.min(scale.length-1,base+deg)];ev.push(['clar',root+12+n,0.45,0.11])}}
      if(i===0&&b%8===0)ev.push(['crash',b===0?0.12:0.2]);
      if(i===14&&b%8===7)ev.push(['snare',0.25,true]);
      steps.push(ev)}}
  return steps}

/* ---------------- live scheduling ---------------- */
const songCache=new Map(),LEN=new Set(['bass','sub','pluck','pad','keys','tuba','brass','clar']);
function stepDur(st){return 60/st.bpm/4}
function songLen(st){return st.bars*16*stepDur(st)+3}
function song(st,idx){const k=st.id+idx;let s=songCache.get(k);if(!s){s=st.gen(rnd((idx+1)*7919+st.id.length*131));songCache.set(k,s);if(songCache.size>8)songCache.delete(songCache.keys().next().value)}return s}
let playing=null,nextT=0,curSong=-1,stepI=0,epoch=0,talkSong=-1;
function startStation(i){const st=STATIONS[i];if(!st.gen){playing=null;return}const AC=A.AC;const t=AC.currentTime+0.05,L=songLen(st);const abs=t+epoch;
  curSong=Math.floor(abs/L);const pos=abs-curSong*L;stepI=Math.ceil(pos/stepDur(st));nextT=curSong*L+stepI*stepDur(st)-epoch;playing=st;
  A.crackle.gain.setTargetAtTime(st.id==='lofi'?0.6:0,AC.currentTime,0.1)}
function schedule(){
  const st=playing,AC=A.AC,ahead=AC.currentTime+0.16,sd=stepDur(st),L=songLen(st);
  while(nextT<ahead){
    const s=song(st,curSong);
    if(stepI>=s.length){ // gap between songs: a jingle, sometimes the presenter
      const gapStart=curSong*L+s.length*sd-epoch;if(stepI===s.length){V.chime(Math.max(nextT,AC.currentTime),72,0.12);V.chime(Math.max(nextT,AC.currentTime)+0.25,76,0.1);V.chime(Math.max(nextT,AC.currentTime)+0.5,79,0.12);
        if(talkSong!==curSong&&curSong%2===0){talkSong=curSong;speak(pick(Math.random,st.talk))}}
      stepI++;nextT+=sd;if(nextT>=gapStart+3){curSong++;stepI=0;nextT=curSong*L-epoch}continue}
    const sw=st.swing&&stepI%2===1?st.swing*sd:0;
    for(const ev of s[stepI]){const fn=V[ev[0]];const args=ev.slice(1);if(LEN.has(ev[0]))args[1]*=sd*4;
      try{fn(nextT+sw,...args)}catch(e){}}
    stepI++;nextT+=sd}
}
function speak(txt){try{if(IH.settings.muted||!root.speechSynthesis)return;const u=new SpeechSynthesisUtterance(txt);u.lang='de-DE';u.rate=1.05;u.volume=0.8;const v=speechSynthesis.getVoices().find(x=>/^de/i.test(x.lang));if(v)u.voice=v;speechSynthesis.speak(u)}catch(e){}}

/* ---------------- UI: swipe or tap the bar at the bottom ---------------- */
const bar=document.createElement('div');bar.id='radio';bar.hidden=true;bar.innerHTML='<button type="button" class="rb" data-d="-1" aria-label="Vorheriger Sender">‹</button><div class="rinfo"><i class="eq"><b></b><b></b><b></b><b></b></i><span><b id="rName"></b><em id="rGenre"></em></span></div><button type="button" class="rb" data-d="1" aria-label="Nächster Sender">›</button>';
document.body.appendChild(bar);
let sx=null,sid=null;
bar.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();sx=e.clientX;sid=e.pointerId;try{bar.setPointerCapture(e.pointerId)}catch(_){}});
bar.addEventListener('pointerup',e=>{if(e.pointerId!==sid)return;e.stopPropagation();const dx=e.clientX-sx;sid=null;
  if(Math.abs(dx)>28)tune(dx<0?1:-1);else{const b=e.target.closest('.rb');tune(b?+b.dataset.d:1)}});
bar.addEventListener('pointercancel',()=>{sid=null});
function tune(d){cur=(cur+d+STATIONS.length)%STATIONS.length;IH.settings.radio=cur;try{localStorage.setItem('2isar2heat.radio',String(cur))}catch(e){}
  if(A){const AC=A.AC,t=AC.currentTime;A.st.gain.cancelScheduledValues(t);A.st.gain.setValueAtTime(0,t);A.stat.gain.cancelScheduledValues(t);A.stat.gain.setValueAtTime(0.12,t);A.stat.gain.exponentialRampToValueAtTime(0.0001,t+0.35);playing=null;switchT=t+0.3}
  render();showBig();try{root.speechSynthesis&&speechSynthesis.cancel()}catch(e){}}
try{const v=localStorage.getItem('2isar2heat.radio');if(v!==null&&!isNaN(+v))cur=Math.min(STATIONS.length-1,Math.max(0,+v))}catch(e){}
let switchT=0,bigT=0;
function render(){const st=STATIONS[cur];$('rName').textContent=st.name;$('rGenre').textContent=st.genre;bar.style.setProperty('--rc',st.color);bar.classList.toggle('off',!st.gen)}
function showBig(){const st=STATIONS[cur];const b=$('banner');if(!b)return;bigT=1.6;bar.classList.add('flash');setTimeout(()=>bar.classList.remove('flash'),350)}
render();
// keyboard: , and . (or M) switch; controller: d-pad left / right
root.addEventListener('keydown',e=>{if(!P.inCar||e.repeat)return;if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'))return;if(e.code==='Period'||e.code==='KeyM')tune(1);else if(e.code==='Comma')tune(-1)});
let padPrev=[false,false];

function tick(){
  const inVeh=!!P.inCar&&G.state==='play';
  if(bar.hidden===inVeh){bar.hidden=!inVeh;if(inVeh)render()}
  try{const gp=navigator.getGamepads?[...navigator.getGamepads()].find(g=>g&&g.connected):null;if(gp&&inVeh){const l=!!(gp.buttons[14]&&gp.buttons[14].pressed),r=!!(gp.buttons[15]&&gp.buttons[15].pressed);if(l&&!padPrev[0])tune(-1);if(r&&!padPrev[1])tune(1);padPrev=[l,r]}}catch(e){}
  if(!ensure())return;const AC=A.AC;
  const want=inVeh&&!G.paused&&!!STATIONS[cur].gen&&!IH.settings.muted&&AC.state==='running'&&AC.currentTime>=switchT;
  if(want&&!playing){startStation(cur);A.st.gain.cancelScheduledValues(AC.currentTime);A.st.gain.setTargetAtTime(STATIONS[cur].vol*0.55,AC.currentTime,0.25)}
  if(!want&&playing){A.st.gain.cancelScheduledValues(AC.currentTime);A.st.gain.setTargetAtTime(0,AC.currentTime,0.08);playing=null;A.crackle.gain.setTargetAtTime(0,AC.currentTime,0.1);try{root.speechSynthesis&&speechSynthesis.cancel()}catch(e){}}
  if(playing)schedule();
  bar.classList.toggle('live',!!playing);
}
setInterval(tick,30);
IH.radio={tune,get station(){return STATIONS[cur]},
  // test helper: render a few seconds of a station offline and report the levels
  async _render(i,sec){const OAC=new OfflineAudioContext(1,44100*sec,44100);const nb=OAC.createBuffer(1,44100,44100);const d=nb.getChannelData(0);for(let k=0;k<d.length;k++)d[k]=Math.random()*2-1;
    const saved=A;A={AC:OAC,noise:nb,out:OAC.createGain()};A.out.gain.value=0.55*STATIONS[i].vol*0.5;A.out.connect(OAC.destination);const st=STATIONS[i];const s=st.gen(rnd(7));const sd=stepDur(st);let errs=0;
    for(let k=0;k*sd<sec&&k<s.length;k++){const t=k*sd+(st.swing&&k%2?st.swing*sd:0);for(const ev of s[k]){const args=ev.slice(1);if(LEN.has(ev[0]))args[1]*=sd*4;try{V[ev[0]](t,...args)}catch(e){errs++}}}
    A=saved;const buf=await OAC.startRendering();const x=buf.getChannelData(0);let pk=0,sum=0;for(const v of x){pk=Math.max(pk,Math.abs(v));sum+=v*v}return{peak:+pk.toFixed(3),rms:+Math.sqrt(sum/x.length).toFixed(4),errs,steps:s.length}}};
})(window));
