// 2Isar2Heat – car and aircraft radio. Three stations whose music is composed and played live with the
// Web Audio API (no recordings). Every station rotates through three sub-genres, and every song is a new
// composition (own key, tempo, chords, melody and arrangement) generated from a seed:
//   Isar FM          – House · Trance · Electro-Pop
//   Lo-Fi Lehel      – Lo-Fi Hip-Hop · Jazz-Hop · Ambient
//   Radio Weißwurst  – Polka · Landler (3/4) · Marsch
// Instruments: sampled-on-the-fly drum kit, Karplus-Strong strings (guitar, zither, upright bass, harp),
// an additive piano, an FM electric piano, supersaws, formant "vocals", brass, accordion and mallets,
// mixed through a stereo reverb, a ping-pong delay and (for dance) kick side-chain pumping.
// Each station runs on the wall clock, so switching away and back drops you into the song where it is "now".
(window.IH_MODS=window.IH_MODS||[]).push(()=>(function(root){
'use strict';
const IH=root.IH,S=IH.sim,G=S.G,P=S.player;
const $=id=>document.getElementById(id);
function rnd(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
const mtof=m=>440*Math.pow(2,(m-69)/12);
const pick=(r,a)=>a[Math.floor(r()*a.length)];
const R=Math.random;

/* ======================= offline DSP (buffers made once, then played cheaply) ======================= */
function biq(type,f,q,sr){const w=2*Math.PI*Math.min(f,sr*0.45)/sr,cs=Math.cos(w),al=Math.sin(w)/(2*q);let b0,b1,b2;
  if(type==='lp'){b0=(1-cs)/2;b1=1-cs;b2=b0}else if(type==='hp'){b0=(1+cs)/2;b1=-(1+cs);b2=b0}else{b0=al;b1=0;b2=-al}
  const a0=1+al,a1=-2*cs,a2=1-al;let x1=0,x2=0,y1=0,y2=0;
  return x=>{const y=(b0*x+b1*x1+b2*x2-a1*y1-a2*y2)/a0;x2=x1;x1=x;y2=y1;y1=y;return y}}
function normalise(d,p){let m=0;for(let i=0;i<d.length;i++){const v=Math.abs(d[i]);if(v>m)m=v}if(m>0){const k=p/m;for(let i=0;i<d.length;i++)d[i]*=k}}
const F808=[205.3,304.4,369.6,522.7,540,800];
const metal=(fs,t)=>{let s=0;for(const f of fs)s+=((t*f)%1<0.5?1:-1);return s/fs.length};
function makeBuf(AC,sec,ch,fn){const sr=AC.sampleRate,n=Math.max(1,Math.floor(sec*sr));const b=AC.createBuffer(ch,n,sr);for(let c=0;c<ch;c++)fn(b.getChannelData(c),sr,c);return b}
function kickFn(f0,f1,pd,ad,click,sat,lp){return(d,sr)=>{let ph=0;const L=lp?biq('lp',lp,0.7,sr):null;for(let i=0;i<d.length;i++){const t=i/sr;const f=f1+(f0-f1)*Math.exp(-t*pd);ph+=6.2832*f/sr;
  let x=Math.sin(ph)*Math.exp(-t*ad);if(t<0.0015)x*=t/0.0015;x+=(R()*2-1)*click*Math.exp(-t*320);x=Math.tanh(x*sat);d[i]=L?L(x):x}normalise(d,0.95)}}
function tomFn(f0){return(d,sr)=>{let ph=0;for(let i=0;i<d.length;i++){const t=i/sr;ph+=6.2832*f0*(0.72+0.28*Math.exp(-t*12))/sr;d[i]=Math.sin(ph)*Math.exp(-t*7)+(R()*2-1)*0.12*Math.exp(-t*60)}normalise(d,0.85)}}
const KITDEF={
  kick:[0.5,1,kickFn(190,47,30,6.2,0.35,1.8)],
  kickLo:[0.45,1,kickFn(125,44,22,7,0.06,1.3,1500)],
  bdrum:[0.8,1,(d,sr)=>{let ph=0;const lp=biq('lp',400,0.7,sr);for(let i=0;i<d.length;i++){const t=i/sr;ph+=6.2832*(58+40*Math.exp(-t*18))/sr;d[i]=Math.sin(ph)*Math.exp(-t*4.2)+lp(R()*2-1)*0.5*Math.exp(-t*14)}normalise(d,0.9)}],
  snare:[0.36,1,(d,sr)=>{const hp=biq('hp',900,0.7,sr),lp=biq('lp',8000,0.7,sr);let p1=0,p2=0;for(let i=0;i<d.length;i++){const t=i/sr;p1+=6.2832*185*(1+0.25*Math.exp(-t*60))/sr;p2+=6.2832*330/sr;
    d[i]=(Math.sin(p1)+0.5*Math.sin(p2))*0.55*Math.exp(-t*26)+lp(hp(R()*2-1))*Math.exp(-t*15)}normalise(d,0.9)}],
  snareLo:[0.32,1,(d,sr)=>{const hp=biq('hp',500,0.7,sr),lp=biq('lp',3600,0.7,sr);let p1=0;for(let i=0;i<d.length;i++){const t=i/sr;p1+=6.2832*165*(1+0.2*Math.exp(-t*50))/sr;
    d[i]=Math.sin(p1)*0.8*Math.exp(-t*24)+lp(hp(R()*2-1))*0.8*Math.exp(-t*17)}normalise(d,0.85)}],
  march:[0.3,1,(d,sr)=>{const hp=biq('hp',1400,0.8,sr);let p1=0;for(let i=0;i<d.length;i++){const t=i/sr;p1+=6.2832*240/sr;d[i]=Math.sin(p1)*0.4*Math.exp(-t*40)+hp(R()*2-1)*Math.exp(-t*20)}normalise(d,0.85)}],
  rim:[0.08,1,(d,sr)=>{const bp=biq('bp',1700,3,sr);let ph=0;for(let i=0;i<d.length;i++){const t=i/sr;ph+=6.2832*820/sr;d[i]=Math.sin(ph)*Math.exp(-t*90)+bp(R()*2-1)*2*Math.exp(-t*120)}normalise(d,0.8)}],
  clap:[0.42,1,(d,sr)=>{const bp=biq('bp',1250,1.1,sr);const on=[0,0.011,0.022,0.033];for(let i=0;i<d.length;i++){const t=i/sr;let e=0;for(let k=0;k<4;k++)if(t>=on[k])e=Math.max(e,Math.exp(-(t-on[k])*(k===3?17:190)));d[i]=bp(R()*2-1)*e}normalise(d,0.9)}],
  hatC:[0.09,1,(d,sr)=>{const hp=biq('hp',7200,0.7,sr),bp=biq('bp',10000,0.9,sr);for(let i=0;i<d.length;i++){const t=i/sr;d[i]=hp(bp(metal(F808,t)*0.6+(R()*2-1)*0.5))*Math.exp(-t*60)}normalise(d,0.7)}],
  hatO:[0.5,1,(d,sr)=>{const hp=biq('hp',6800,0.7,sr),bp=biq('bp',9500,0.8,sr);for(let i=0;i<d.length;i++){const t=i/sr;d[i]=hp(bp(metal(F808,t)*0.6+(R()*2-1)*0.5))*Math.exp(-t*7.5)}normalise(d,0.65)}],
  ride:[1.5,1,(d,sr)=>{const hp=biq('hp',3200,0.7,sr),bp=biq('bp',5200,0.6,sr);const fs=F808.map(f=>f*2.37);let ph=0;for(let i=0;i<d.length;i++){const t=i/sr;ph+=6.2832*3150/sr;
    d[i]=hp(bp(metal(fs,t)*0.7+(R()*2-1)*0.25))*Math.exp(-t*2.6)+Math.sin(ph)*0.18*Math.exp(-t*6)}normalise(d,0.6)}],
  crash:[2.2,2,(d,sr)=>{const hp=biq('hp',4200,0.7,sr);const fs=F808.map(f=>f*1.73);for(let i=0;i<d.length;i++){const t=i/sr;const a=t<0.003?t/0.003:1;d[i]=hp((R()*2-1)*0.7+metal(fs,t)*0.4)*Math.exp(-t*1.8)*a}normalise(d,0.7)}],
  becken:[1.1,2,(d,sr)=>{const hp=biq('hp',2600,0.7,sr);const fs=F808.map(f=>f*1.31);for(let i=0;i<d.length;i++){const t=i/sr;d[i]=hp((R()*2-1)*0.6+metal(fs,t)*0.5)*Math.exp(-t*3.4)}normalise(d,0.7)}],
  shaker:[0.12,1,(d,sr)=>{const hp=biq('hp',5500,0.7,sr);for(let i=0;i<d.length;i++){const t=i/sr;const e=t<0.012?t/0.012:Math.exp(-(t-0.012)*38);d[i]=hp(R()*2-1)*e}normalise(d,0.5)}],
  tamb:[0.26,1,(d,sr)=>{const hp=biq('hp',6000,0.7,sr);const fs=[5200,6730,7310,8120,9050];for(let i=0;i<d.length;i++){const t=i/sr;const e=t<0.004?t/0.004:Math.exp(-t*14);d[i]=hp(metal(fs,t)*0.6+(R()*2-1)*0.5)*e}normalise(d,0.55)}],
  brush:[0.32,1,(d,sr)=>{const bp=biq('bp',2600,0.5,sr);for(let i=0;i<d.length;i++){const t=i/sr;const e=t<0.025?t/0.025:Math.exp(-(t-0.025)*11);d[i]=bp(R()*2-1)*e}normalise(d,0.6)}],
  tomL:[0.5,1,tomFn(110)],tomM:[0.45,1,tomFn(150)],tomH:[0.4,1,tomFn(205)],
};
const KITS=new WeakMap();
function kitBuf(name){const AC=A.AC;let K=KITS.get(AC);if(!K){K={};KITS.set(AC,K)}let b=K[name];if(!b){const df=KITDEF[name];if(!df)return null;b=K[name]=makeBuf(AC,df[0],df[1],df[2])}return b}
// reverb impulse: stereo decaying noise that gets darker over time
function irBuf(AC,sec){return makeBuf(AC,sec,2,(d,sr)=>{let lp=0;const pre=Math.floor(sr*0.014);for(let i=0;i<d.length;i++){const t=i/sr;const a=0.08+0.85*Math.exp(-t*2.2);lp+=a*((R()*2-1)-lp);
  d[i]=i<pre?0:lp*Math.exp(-t*(6.9/sec))*(t<0.03?(t-0.014)/0.016:1)}})}
// plucked strings (Karplus-Strong) and an additive piano, cached per note
const NOTES=new WeakMap();
function noteCache(){const AC=A.AC;let C=NOTES.get(AC);if(!C){C=new Map();NOTES.set(AC,C)}return C}
const KSP={gtr:[2.0,0.996,0.5,0.55],zit:[2.4,0.9985,0.6,0.95],ubass:[1.7,0.995,0.5,0.22],harp:[2.8,0.9975,0.52,0.7]};
function ksBuf(kind,m){const C=noteCache(),key=kind+m;let b=C.get(key);if(b)return b;const AC=A.AC,sr=AC.sampleRate,p=KSP[kind]||KSP.gtr;
  const N=Math.max(2,Math.round(sr/mtof(m))),dur=p[0]*(m>76?0.7:1),n=Math.floor(dur*sr);b=AC.createBuffer(1,n,sr);const d=b.getChannelData(0);const buf=new Float32Array(N);
  let lp=0;for(let k=0;k<N;k++){lp+=p[3]*((R()*2-1)-lp);buf[k]=lp}
  let idx=0;const s=p[2],dm=p[1];for(let i=0;i<n;i++){const nx=idx+1===N?0:idx+1;const y=dm*(s*buf[idx]+(1-s)*buf[nx]);d[i]=buf[idx];buf[idx]=y;idx=nx}
  let x1=0,y1=0;for(let i=0;i<n;i++){const x=d[i];const y=x-x1+0.995*y1;x1=x;y1=y;d[i]=y}
  const fo=Math.floor(sr*0.08);for(let i=0;i<fo;i++)d[n-1-i]*=i/fo;normalise(d,0.8);
  if(C.size>120)C.delete(C.keys().next().value);C.set(key,b);return b}
function pianoBuf(m){const C=noteCache(),key='p'+m;let b=C.get(key);if(b)return b;const AC=A.AC,sr=AC.sampleRate,f=mtof(m);
  const dur=Math.max(0.9,Math.min(2.8,3.2-(m-40)*0.045)),n=Math.floor(dur*sr);b=AC.createBuffer(1,n,sr);const d=b.getChannelData(0);
  const parts=[];for(let h=1;h<=10;h++){const fh=f*h*Math.sqrt(1+0.00035*h*h);if(fh>sr*0.42)break;parts.push([fh,(1/Math.pow(h,1.1))*(1+0.45*Math.sin(h*1.7)),(0.9+h*0.6)*(1+(m-48)*0.02)])}
  parts.push([f*1.0007,0.55,1.1*(1+(m-48)*0.02)],[2*f*1.0011,0.25,2*(1+(m-48)*0.02)]);   // second string: slow beating
  for(const[fh,amp,dec]of parts){const w=6.2832*fh/sr,c2=2*Math.cos(w);let s1=Math.sin(-w),s2=Math.sin(-2*w),e=amp;const ed=Math.exp(-dec/sr);
    for(let i=0;i<n;i++){const s0=c2*s1-s2;s2=s1;s1=s0;d[i]+=s0*e;e*=ed}}
  const lp=biq('lp',2600+m*30,0.7,sr);const hn=Math.floor(sr*0.02);for(let i=0;i<hn;i++)d[i]+=lp(R()*2-1)*0.25*(1-i/hn);
  const at=Math.floor(sr*0.002);for(let i=0;i<at;i++)d[i]*=i/at;const fo=Math.floor(sr*0.06);for(let i=0;i<fo;i++)d[n-1-i]*=i/fo;normalise(d,0.8);
  if(C.size>120)C.delete(C.keys().next().value);C.set(key,b);return b}
// buffers are made in small pieces between frames so the game never hitches
const warmQ=[];
function warmSong(s){for(const st of s.steps)for(const ev of st){if(ev[0]==='piano')for(const m of ev[1])warmQ.push(['p',m]);else if(ev[0]==='pluck')warmQ.push([ev[1],ev[2]]);else if(ev[0]==='hit')warmQ.push(['k',ev[1]])}}
function warmStep(){let n=0;while(warmQ.length&&n<2){const[k,m]=warmQ.shift();const C=noteCache();
  if(k==='k'){const K=KITS.get(A.AC);if(K&&K[m])continue;kitBuf(m)}else if(k==='p'){if(C.has('p'+m))continue;pianoBuf(m);n++}else{if(C.has(k+m))continue;ksBuf(k,m)}n++}}

/* ======================= audio graph ======================= */
let A=null;
function satCurve(k){const c=new Float32Array(1024);const tk=Math.tanh(k);for(let i=0;i<1024;i++){const x=i/511.5-1;c[i]=Math.tanh(k*x)/tk}return c}
function buildGraph(AC,dest){
  const g={AC};const mk=v=>{const n=AC.createGain();n.gain.value=v;return n};
  g.drums=mk(0.9);g.mix=mk(0.85);g.duck=mk(1);g.mix.connect(g.duck);
  g.pre=AC.createBiquadFilter();g.pre.type='lowpass';g.pre.frequency.value=18000;g.pre.Q.value=0.5;
  g.trim=mk(0.45);g.trim.connect(g.pre);g.drums.connect(g.trim);g.duck.connect(g.trim);
  g.shp=AC.createWaveShaper();g.shp.curve=satCurve(1.1);g.pre.connect(g.shp);
  g.st=mk(0);g.shp.connect(g.st);g.st.connect(dest);
  g.rv=mk(0.3);const cv=AC.createConvolver();cv.buffer=irBuf(AC,2.6);g.rv.connect(cv);const rr=mk(0.55);cv.connect(rr);rr.connect(g.trim);
  g.dl=mk(0.4);g.dL=AC.createDelay(2);g.dR=AC.createDelay(2);g.dL.delayTime.value=g.dR.delayTime.value=0.36;g.fb=mk(0.38);const dlp=AC.createBiquadFilter();dlp.type='lowpass';dlp.frequency.value=2800;
  const mg=AC.createChannelMerger(2);g.dl.connect(g.dL);g.dL.connect(dlp);dlp.connect(g.dR);g.dR.connect(g.fb);g.fb.connect(g.dL);g.dL.connect(mg,0,0);g.dR.connect(mg,0,1);const dr=mk(0.55);mg.connect(dr);dr.connect(g.duck);
  const lfo=AC.createOscillator();lfo.frequency.value=0.5;g.wow=mk(0);lfo.connect(g.wow);lfo.start();
  // vinyl crackle (lo-fi)
  const cb=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate);const cd=cb.getChannelData(0);for(let i=0;i<cd.length;i++)cd[i]=R()<0.0009?(R()*2-1)*0.9:(R()*2-1)*0.01;
  const cs=AC.createBufferSource();cs.buffer=cb;cs.loop=true;g.crk=mk(0);const cf=AC.createBiquadFilter();cf.type='bandpass';cf.frequency.value=2500;cf.Q.value=0.6;cs.connect(cf);cf.connect(g.crk);g.crk.connect(g.trim);cs.start();
  g.sc=0;g.noise=null;return g}
function ensure(){
  if(A)return A;const au=IH.audio;if(!au||!au.AC)return null;const AC=au.AC;
  const bus=AC.createGain();bus.gain.value=0.5;const comp=AC.createDynamicsCompressor();comp.threshold.value=-15;comp.ratio.value=3;comp.attack.value=0.008;comp.release.value=0.22;
  bus.connect(comp);comp.connect(au.master);
  A=buildGraph(AC,bus);A.noise=au.noiseBuf;
  const ns=AC.createBufferSource();ns.buffer=au.noiseBuf;ns.loop=true;const ng=AC.createGain();ng.gain.value=0;const nf=AC.createBiquadFilter();nf.type='bandpass';nf.frequency.value=1600;nf.Q.value=0.8;ns.connect(nf);nf.connect(ng);ng.connect(bus);ns.start();A.stat=ng;
  for(const k in KITDEF)warmQ.push(['k',k]);
  epoch=Date.now()/1000-AC.currentTime;return A}

/* ======================= voices ======================= */
let SD=0.12;   // duration of one step (16th note) of the current song; event lengths are given in steps
const gain=v=>{const n=A.AC.createGain();n.gain.value=v;return n};
function osc(type,f,t,stop,det){const o=A.AC.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);if(det)o.detune.setValueAtTime(det,t);o.start(t+R()*0.003);o.stop(stop);return o}
function filt(type,f,q){const b=A.AC.createBiquadFilter();b.type=type;b.frequency.value=f;if(q)b.Q.value=q;return b}
function wow(o){if(!A.wowOn||!o.detune)return;try{A.wow.connect(o.detune);o.onended=()=>{try{A.wow.disconnect(o.detune)}catch(e){}}}catch(e){}}
// gain envelope: attack, decay to sustain level, hold until t+hold, release; returns the end time
function env(p,t,peak,a,d,s,hold,r){peak=Math.max(0.0002,peak);p.setValueAtTime(0.0001,t);p.linearRampToValueAtTime(peak,t+a);if(s<1)p.setTargetAtTime(peak*s,t+a,Math.max(0.004,d/3));
  const e=t+Math.max(hold,a+0.004);p.setTargetAtTime(0,e,Math.max(0.004,r/4));return e+r*1.3+0.02}
function route(n,o,drum){o=o||{};let x=n;const AC=A.AC;if(o.pan&&AC.createStereoPanner){const p=AC.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,o.pan));n.connect(p);x=p}
  x.connect(drum?A.drums:A.mix);if(o.rv){const g=gain(o.rv);x.connect(g);g.connect(A.rv)}if(o.dl){const g=gain(o.dl);x.connect(g);g.connect(A.dl)}}
function vib(o,t,stop,rate,cents,delay){const l=A.AC.createOscillator();l.frequency.value=rate;const lg=A.AC.createGain();lg.gain.setValueAtTime(0,t);lg.gain.linearRampToValueAtTime(cents,t+delay+0.15);l.connect(lg);lg.connect(o.detune);l.start(t);l.stop(stop)}
function duck(t){const p=A.duck.gain;p.setTargetAtTime(1-A.sc,t,0.003);p.setTargetAtTime(1,t+0.025,SD*1.1)}
const VOW={a:[800,1150,2900],o:[450,800,2830],e:[400,2000,2550],u:[325,700,2530],i:[300,2300,3000]};
const V={
  hit(t,name,v,o){const b=kitBuf(name);if(!b)return;const s=A.AC.createBufferSource();s.buffer=b;if(o&&o.rate)s.playbackRate.value=o.rate;const g=gain(v);s.connect(g);route(g,o,true);s.start(t);if(A.sc&&(name==='kick'))duck(t)},
  col(t,f,tc){A.pre.frequency.setTargetAtTime(f,t,tc||0.4)},
  bass(t,kind,m,len,v){const f=mtof(m),L=len*SD,AC=A.AC,g=AC.createGain();let end;
    if(kind==='organ'){end=env(g.gain,t,v,0.004,0.22,0.35,L,0.06);const lp=filt('lowpass',1500,0.7);osc('sine',f,t,end).connect(lp);const g2=gain(0.22);osc('square',f*2,t,end).connect(g2);g2.connect(lp);lp.connect(g)}
    else if(kind==='saw'||kind==='reese'){end=env(g.gain,t,v,0.003,0.2,0.75,L,0.04);const saw=kind==='saw';const lp=filt('lowpass',saw?320:420,saw?5:2);lp.frequency.setValueAtTime(saw?2600:1100,t);lp.frequency.setTargetAtTime(saw?300:420,t,0.05);
      for(const d of saw?[0]:[-16,16])osc('sawtooth',f,t,end,d).connect(lp);const sg=gain(0.55);osc('sine',f,t,end).connect(sg);sg.connect(g);lp.connect(g)}
    else if(kind==='funk'){end=env(g.gain,t,v,0.003,0.14,0.45,L,0.035);const lp=filt('lowpass',420,5);lp.frequency.setValueAtTime(3200,t);lp.frequency.setTargetAtTime(420,t,0.055);osc('square',f,t,end).connect(lp);lp.connect(g);osc('triangle',f,t,end).connect(g)}
    else if(kind==='tuba'){end=env(g.gain,t,v,0.025,0.2,0.8,L,0.06);const lp=filt('lowpass',420,1.2);lp.frequency.setValueAtTime(800,t);lp.frequency.setTargetAtTime(420,t+0.03,0.06);const o=osc('sawtooth',f,t,end,-35);o.detune.linearRampToValueAtTime(0,t+0.05);o.connect(lp);lp.connect(g);const sg=gain(0.5);osc('sine',f,t,end).connect(sg);sg.connect(g)}
    else{end=env(g.gain,t,v,0.012,0.5,0.75,L,0.12);osc('sine',f,t,end).connect(g);const g2=gain(0.1);osc('triangle',f*2,t,end).connect(g2);g2.connect(g)}
    route(g,{})},
  ep(t,ms,len,v,o){const L=len*SD,AC=A.AC,g=AC.createGain();const end=env(g.gain,t,v/Math.sqrt(ms.length),0.003,1.4,0.3,L,0.4);
    for(const m of ms){const f=mtof(m);const c=osc('sine',f,t,end);wow(c);const mo=osc('sine',f,t,end);const mg=AC.createGain();mg.gain.setValueAtTime(f*1.5,t);mg.gain.setTargetAtTime(f*0.22,t,0.3);mo.connect(mg);mg.connect(c.frequency);
      const tn=osc('sine',f*14,t,t+0.1);const tg=AC.createGain();tg.gain.setValueAtTime(f*2.2,t);tg.gain.exponentialRampToValueAtTime(1,t+0.07);tn.connect(tg);tg.connect(c.frequency);c.connect(g)}
    route(g,o)},
  piano(t,ms,v,o){const g=gain(v/Math.sqrt(ms.length));for(const m of ms){const s=A.AC.createBufferSource();s.buffer=pianoBuf(m);s.connect(g);s.start(t);if(o&&o.len)s.stop(t+o.len*SD+0.35)}
    if(o&&o.len){g.gain.setValueAtTime(v/Math.sqrt(ms.length),t+o.len*SD);g.gain.setTargetAtTime(0,t+o.len*SD,0.07)}route(g,o)},
  pluck(t,kind,m,v,o){const s=A.AC.createBufferSource();s.buffer=ksBuf(kind,m);const g=gain(v);s.connect(g);s.start(t);if(o&&o.len){const e=t+o.len*SD;g.gain.setValueAtTime(v,e);g.gain.setTargetAtTime(0,e,0.05);s.stop(e+0.3)}route(g,o)},
  saw(t,ms,len,v,o){o=o||{};const L=len*SD,AC=A.AC,a=o.att||0.005,rel=o.rel||0.12,n=o.n||5,spread=o.spread||20;const g=AC.createGain();
    const end=env(g.gain,t,v/Math.sqrt(ms.length*n)*1.6,a,o.dec||0.3,o.sus===undefined?0.8:o.sus,L,rel);const cut=o.cut||3000;const lp=filt('lowpass',cut,o.q||0.8);
    if(o.fenv){lp.frequency.setValueAtTime(cut*o.fenv,t);lp.frequency.setTargetAtTime(cut,t,o.fdec||0.08)}lp.connect(g);
    let pL=null,pR=null;if(AC.createStereoPanner&&n>1){pL=AC.createStereoPanner();pL.pan.value=-0.55;pR=AC.createStereoPanner();pR.pan.value=0.55;pL.connect(lp);pR.connect(lp)}
    for(const m of ms){const f=mtof(m);for(let k=0;k<n;k++){const d=n>1?(k/(n-1)*2-1)*spread:0;osc('sawtooth',f,t,end,d+(R()-0.5)*4).connect(pL?(k%2?pL:pR):lp)}}
    route(g,o)},
  pad(t,ms,len,v,o){o=o||{};const L=len*SD,AC=A.AC,g=AC.createGain();const end=env(g.gain,t,v/Math.sqrt(ms.length),o.att||0.9,1,1,L,o.rel||1.4);const lp=filt('lowpass',o.cut||1100,0.6);lp.connect(g);
    for(const m of ms){const f=mtof(m);const a=osc('triangle',f,t,end,-7),b=osc('sawtooth',f,t,end,7);wow(a);wow(b);const bg=gain(0.35);a.connect(lp);b.connect(bg);bg.connect(lp)}
    route(g,o)},
  strings(t,ms,len,v,o){o=o||{};const L=len*SD,AC=A.AC,g=AC.createGain();const end=env(g.gain,t,v/Math.sqrt(ms.length),o.att||0.5,1,1,L,o.rel||0.8);const lp=filt('lowpass',2600,0.5);lp.connect(g);
    for(const m of ms){const f=mtof(m);for(const d of[-9,0,9]){const x=osc('sawtooth',f,t,end,d);vib(x,t,end,5+R(),9,0.3);x.connect(lp)}}route(g,o)},
  lead(t,kind,m,len,v,o){o=o||{};const f=mtof(m),L=len*SD,AC=A.AC,g=AC.createGain();let end;
    if(kind==='sq'){end=env(g.gain,t,v,0.006,0.25,0.7,L,0.08);const lp=filt('lowpass',2400,2);lp.frequency.setValueAtTime(5200,t);lp.frequency.setTargetAtTime(2200,t,0.12);const x=osc('square',f,t,end);if(o.from){x.frequency.setValueAtTime(mtof(o.from),t);x.frequency.exponentialRampToValueAtTime(f,t+0.07)}vib(x,t,end,5.6,12,0.25);x.connect(lp);
      const y=osc('sawtooth',f*2,t,end,6);const yg=gain(0.18);y.connect(yg);yg.connect(lp);lp.connect(g)}
    else if(kind==='saw'){end=env(g.gain,t,v,0.006,0.3,0.8,L,0.15);const lp=filt('lowpass',4200,1);for(const d of[-11,0,11]){const x=osc('sawtooth',f,t,end,d);vib(x,t,end,5.2,8,0.3);x.connect(lp)}lp.connect(g)}
    else if(kind==='flute'){end=env(g.gain,t,v,0.06,0.2,0.85,L,0.12);const x=osc('sine',f,t,end);vib(x,t,end,4.8,14,0.25);x.connect(g);const h=osc('triangle',f*2,t,end);const hg=gain(0.12);h.connect(hg);hg.connect(g);
      const n=A.AC.createBufferSource();n.buffer=A.noise;n.start(t,R()*0.5);n.stop(end);const bp=filt('bandpass',f*2,4);const ng=gain(0.25);n.connect(bp);bp.connect(ng);ng.connect(g)}
    else if(kind==='trp'){end=env(g.gain,t,v,0.025,0.25,0.8,L,0.06);const lp=filt('lowpass',2000,1.4);lp.frequency.setValueAtTime(700,t);lp.frequency.linearRampToValueAtTime(3600,t+0.045);lp.frequency.setTargetAtTime(2100,t+0.05,0.15);
      const x=osc('sawtooth',f,t,end,-45);x.detune.linearRampToValueAtTime(0,t+0.05);if(L>0.3)vib(x,t,end,5.5,10,0.2);x.connect(lp);const pk=filt('peaking',1300,1);pk.gain.value=5;lp.connect(pk);pk.connect(g)}
    else if(kind==='clar'){end=env(g.gain,t,v,0.03,0.2,0.85,L,0.06);const lp=filt('lowpass',1900,0.8);const x=osc('square',f,t,end);if(L>0.3)vib(x,t,end,5.4,9,0.25);x.connect(lp);lp.connect(g)}
    else{/* accordion */end=env(g.gain,t,v,0.018,0.2,0.9,L,0.05);const lp=filt('lowpass',2700,0.7);for(const d of[-11,11])osc('sawtooth',f,t,end,d).connect(lp);const sq=osc('square',f/2,t,end);const sg=gain(0.3);sq.connect(sg);sg.connect(lp);lp.connect(g)}
    route(g,o)},
  vox(t,m,len,v,vw,o){const f=mtof(m),L=len*SD,AC=A.AC,g=AC.createGain();const end=env(g.gain,t,v,0.015,0.2,0.85,L,0.12);const x=osc('sawtooth',f,t,end,-90);x.detune.linearRampToValueAtTime(0,t+0.06);vib(x,t,end,5.2,16,0.15);
    const F=VOW[vw]||VOW.a;F.forEach((fr,k)=>{const bp=filt('bandpass',fr,k?9:6);const fg=gain(k===0?1:k===1?0.6:0.3);x.connect(bp);bp.connect(fg);fg.connect(g)});route(g,o)},
  acc(t,ms,len,v,o){const L=len*SD,AC=A.AC,g=AC.createGain();const end=env(g.gain,t,v/Math.sqrt(ms.length),0.012,0.12,0.7,L,0.045);const lp=filt('lowpass',2300,0.7);lp.connect(g);
    for(const m of ms){const f=mtof(m);for(const d of[-12,12])osc('sawtooth',f,t,end,d).connect(lp)}route(g,o)},
  brass(t,ms,len,v,o){const L=len*SD,AC=A.AC,g=AC.createGain();const end=env(g.gain,t,v/Math.sqrt(ms.length),0.02,0.15,0.7,L,0.05);const lp=filt('lowpass',1300,1);lp.frequency.setValueAtTime(600,t);lp.frequency.linearRampToValueAtTime(2600,t+0.04);lp.frequency.setTargetAtTime(1300,t+0.05,0.1);lp.connect(g);
    for(const m of ms){const x=osc('sawtooth',mtof(m),t,end,(R()-0.5)*14-25);x.detune.linearRampToValueAtTime((R()-0.5)*10,t+0.04);x.connect(lp)}route(g,o)},
  mallet(t,kind,m,v,o){const f=mtof(m),AC=A.AC,g=AC.createGain();const dec=kind==='vib'?1.7:kind==='mar'?0.45:kind==='glock'?1.1:2.4;const end=env(g.gain,t,v,0.002,dec,0,0.003,0.05)+dec;
    const add=(fr,amp,dd)=>{const x=osc('sine',fr,t,Math.min(end,t+dd*4+0.05));const xg=AC.createGain();xg.gain.setValueAtTime(amp,t);xg.gain.setTargetAtTime(0,t,dd);x.connect(xg);xg.connect(g)};
    g.gain.cancelScheduledValues(t);g.gain.setValueAtTime(v,t);g.gain.setTargetAtTime(0,t+0.002,dec/2.5);
    if(kind==='vib'){add(f,1,dec);add(f*4,0.18,0.12);const tr=AC.createOscillator();tr.frequency.value=5.2;const tg=gain(0.35*v);tr.connect(tg);tg.connect(g.gain);tr.start(t);tr.stop(end)}
    else if(kind==='mar'){add(f,1,0.35);add(f*4,0.3,0.04);add(f*9.8,0.08,0.015)}
    else if(kind==='glock'){add(f,1,0.9);add(f*2.76,0.35,0.25);add(f*5.4,0.15,0.08)}
    else{const c=osc('sine',f,t,end);const mo=osc('sine',f*3.5,t,end);const mg=AC.createGain();mg.gain.setValueAtTime(f*2.2,t);mg.gain.setTargetAtTime(f*0.1,t,0.6);mo.connect(mg);mg.connect(c.frequency);c.connect(g)}
    route(g,o)},
  riser(t,len,v){const L=len*SD,AC=A.AC,n=AC.createBufferSource();n.buffer=A.noise;n.loop=true;const bp=filt('bandpass',300,2.5);bp.frequency.setValueAtTime(300,t);bp.frequency.exponentialRampToValueAtTime(7500,t+L);
    const g=AC.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(v,t+L);g.gain.setTargetAtTime(0,t+L,0.03);n.connect(bp);bp.connect(g);n.start(t);n.stop(t+L+0.2);route(g,{rv:0.4})},
  boom(t,v){const AC=A.AC,o=osc('sine',75,t,t+1.6);o.frequency.exponentialRampToValueAtTime(32,t+1.2);const g=AC.createGain();g.gain.setValueAtTime(v,t);g.gain.setTargetAtTime(0,t,0.35);o.connect(g);route(g,{rv:0.5})},
  chime(t,m,v){this.mallet(t,'bell',m,v,{rv:0.4,dl:0.15})},
};

/* ======================= music theory & composition helpers ======================= */
const SC={maj:[0,2,4,5,7,9,11],min:[0,2,3,5,7,8,10],dor:[0,2,3,5,7,9,10],lyd:[0,2,4,6,7,9,11]};
function dm(root,sc,deg){const o=Math.floor(deg/7),k=((deg%7)+7)%7;return root+sc[k]+12*o}
function chord(root,sc,deg,n){const r=[];for(let k=0;k<(n||3);k++)r.push(dm(root,sc,deg+2*k));return r}
function voice(ms,center){return ms.map(m=>{while(m<center-6)m+=12;while(m>=center+6)m-=12;return m}).sort((a,b)=>a-b)}
function inRange(m,lo,hi){while(m<lo)m+=12;while(m>hi)m-=12;return m}
function snap(d,c,tones){tones=tones||[0,2,4];for(const k of[0,-1,1,-2,2,-3,3]){const x=d+k;if(tones.includes((((x-c)%7)+7)%7))return x}return d}
// melody: four one-bar cells (rhythm + interval contour) arranged in 8-bar phrases (A B A C / A B A' cadence)
function melody(r,o){const{root,sc,cells,lo,hi}=o;const chordAt=o.chordAt;const ivs=o.ivs||[-2,-1,-1,-1,1,1,1,2,2,0,3,-3,4,-4];
  const mk=()=>({rh:pick(r,cells),iv:Array.from({length:24},()=>pick(r,ivs)),o:pick(r,[0,2,4,7,-3])});const C=[mk(),mk(),mk(),mk(),mk()];const form=o.form||[0,1,0,2,0,1,0,3];
  return(bar,alt)=>{const k=form[bar%form.length]+(alt&&form[bar%form.length]===2?2:0),cell=C[Math.min(4,k)],cad=bar%8===7;const out=[];let d=chordAt(bar,0)+cell.o;
    for(let j=0;j<cell.rh.length;j++){const[i,l]=cell.rh[j];if(j>0)d+=cell.iv[j];const c=chordAt(bar,i);if(i%4===0||l>=4)d=snap(d,c);
      let m=dm(root,sc,d),guard=0;while(m>hi&&guard++<8){d-=2;m=dm(root,sc,d)}while(m<lo&&guard++<16){d+=2;m=dm(root,sc,d)}
      if(cad&&j===cell.rh.length-1){d=snap(d,0);m=dm(root,sc,d)}out.push([i,l,m,d])}return out}}
function fitBars(bpm,spb){const bar=spb*60/bpm/4;return Math.max(16,Math.min(200,Math.floor((SLOT-13)/bar)))}
function layout(bars,head,loop,tail){const out=[];const push=a=>{for(const[n,l]of a)for(let k=0;k<l;k++)out.push(n)};push(head);const tl=[];for(const[n,l]of tail)for(let k=0;k<l;k++)tl.push(n);
  let g=0;while(out.length<bars-tl.length&&g++<20)push(loop);out.length=Math.max(0,bars-tl.length);return out.concat(tl).slice(0,bars)}
function newSong(bpm,spb,bars){const s={bpm,spb,sd:60/bpm/4,bars,steps:[]};for(let i=0;i<bars*spb;i++)s.steps.push([]);s.dur=s.steps.length*s.sd;s.half=Math.floor(s.steps.length/2);return s}
function at(s,bar,i,...ev){const k=bar*s.spb+i;if(k>=0&&k<s.steps.length&&i<s.spb)s.steps[k].push(ev)}
const sec0=(L,b)=>b===0||L[b]!==L[b-1];
const RH={
  house:[[[0,2],[3,1],[6,2],[10,2],[12,1],[14,2]],[[2,2],[6,2],[8,4],[14,2]],[[0,1],[2,1],[4,2],[7,3],[12,2]],[[3,2],[6,1],[8,2],[11,3]],[[0,3],[4,2],[8,3],[12,4]]],
  trance:[[[0,6],[6,2],[8,4],[12,4]],[[0,4],[4,4],[8,8]],[[0,3],[3,3],[6,2],[8,6],[14,2]],[[0,2],[2,2],[4,4],[8,4],[12,4]],[[0,8],[8,4],[12,2],[14,2]]],
  pop:[[[0,2],[2,2],[4,3],[8,2],[10,2],[12,4]],[[0,1],[2,1],[4,2],[6,2],[8,6],[14,2]],[[2,2],[4,2],[6,4],[10,2],[12,4]],[[0,3],[3,3],[6,2],[8,2],[10,6]],[[0,2],[3,2],[6,2],[8,8]]],
  lofi:[[[0,3],[6,2],[10,6]],[[4,2],[7,1],[8,4]],[[0,2],[3,1],[4,8]],[[2,2],[5,1],[6,2],[10,2],[12,4]],[[0,6],[8,2],[11,5]]],
  jazz:[[[0,3],[3,3],[6,2],[8,4],[12,4]],[[2,2],[4,2],[6,2],[8,6]],[[0,2],[2,1],[3,1],[4,4],[10,2],[12,4]],[[0,8],[10,2],[12,2],[14,2]],[[4,2],[6,2],[8,2],[10,2],[12,4]]],
  amb:[[[0,8],[8,8]],[[0,4],[6,10]],[[0,12],[12,4]],[[2,6],[8,8]]],
  polka:[[[0,2],[2,2],[4,2],[6,2],[8,2],[10,2],[12,4]],[[0,1],[1,1],[2,2],[4,2],[6,2],[8,4],[12,2],[14,2]],[[0,3],[3,1],[4,2],[6,2],[8,3],[11,1],[12,4]],[[0,2],[2,2],[4,4],[8,2],[10,2],[12,4]],[[0,4],[4,2],[6,2],[8,6],[14,2]]],
  laendler:[[[0,4],[4,2],[6,2],[8,4]],[[0,2],[2,2],[4,2],[6,2],[8,2],[10,2]],[[0,6],[6,2],[8,4]],[[0,3],[3,1],[4,4],[8,4]],[[0,4],[4,4],[8,2],[10,2]]],
  marsch:[[[0,3],[3,1],[4,4],[8,3],[11,1],[12,4]],[[0,4],[4,2],[6,2],[8,8]],[[0,2],[2,2],[4,2],[6,2],[8,3],[11,1],[12,4]],[[0,6],[6,2],[8,4],[12,4]],[[0,3],[3,1],[4,3],[7,1],[8,8]]],
};

/* ======================= Isar FM ======================= */
function genHouse(r){
  const bpm=pick(r,[121,122,123,124,125,126]),s=newSong(bpm,16,fitBars(bpm,16,8));s.sub='House';s.trim=0.75;
  const sc=r()<0.5?SC.min:SC.dor,root=pick(r,[57,58,59,60,61,62]);
  const prog=pick(r,[[0,5,3,4],[0,3,0,3],[0,6,5,6],[0,2,5,6],[5,3,0,4],[0,0,3,3]]);const ch=b=>prog[b%4];
  const L=layout(s.bars,[['in',8],['a',8]],[['b',16],['brk',8],['drop',16]],[['out',8]]);
  const bp=pick(r,[[[2,2,0],[6,1,0],[7,1,12],[10,2,0],[14,1,7]],[[0,1,0],[3,1,0],[6,2,12],[8,1,0],[11,1,0],[14,2,7]],[[2,1,0],[3,1,0],[6,1,0],[10,1,0],[11,1,12],[14,1,0]],[[2,3,0],[6,1,12],[10,3,0],[14,1,12]]]);
  const stab=pick(r,[[[0,2],[3,2],[6,2],[10,2],[13,2]],[[2,1],[5,1],[8,2],[11,1],[14,2]],[[0,3],[6,3],[10,1],[12,3]],[[3,2],[6,2],[11,2],[14,2]]]);
  const vw=pick(r,['a','o','e','u']),mel=melody(r,{root:root,sc,cells:RH.house,lo:62,hi:79,chordAt:b=>ch(b)});
  const keys=r()<0.6?'piano':'organ';
  for(let b=0;b<s.bars;b++){const x=L[b],c=ch(b),bn=inRange(dm(root-24,sc,c),36,48),cv=voice(chord(root,sc,c,4),66);
    if(x==='in')at(s,b,0,'col',600+Math.pow(b/7,2)*14000,0.6);if(x==='a'&&sec0(L,b))at(s,b,0,'col',18000,0.2);
    if(x==='brk'&&sec0(L,b))at(s,b,0,'col',2400,0.3);if(x==='brk'&&b+1<s.bars&&L[b+1]!=='brk')at(s,b,8,'col',18000,0.3);
    const kick=x!=='brk',full=x==='b'||x==='drop';
    for(let i=0;i<16;i++){
      if(kick&&i%4===0)at(s,b,i,'hit','kick',0.95);
      if(x!=='in'&&x!=='brk'&&(i===4||i===12))at(s,b,i,'hit','clap',0.55,{rv:0.12});
      if(i%4===2&&(x!=='in'||b>=4)&&x!=='brk')at(s,b,i,'hit','hatO',0.26,{pan:0.15});
      if(full&&i%2===1)at(s,b,i,'hit','hatC',0.1+(i%4===3?0.04:0),{pan:-0.2});
      if((x==='a'||full)&&r()<0.85)at(s,b,i,'hit','shaker',0.07+(i%2)*0.04,{pan:0.35});
    }
    if(sec0(L,b)&&x!=='in')at(s,b,0,'hit','crash',0.35,{pan:-0.3});
    if(b%8===7&&(x==='a'||full))for(let i=12;i<16;i++)at(s,b,i,'hit','snare',0.18+(i-12)*0.07,{rv:0.1});
    if(x!=='brk'&&(x!=='in'||b>=4))for(const[i,l,o]of bp)at(s,b,i,'bass','organ',bn+o,l,0.5);
    if(x==='a'||full||x==='out'){for(const[i,l]of stab)keys==='piano'?at(s,b,i,'piano',cv,0.32,{len:l,pan:0.1,rv:0.18}):at(s,b,i,'acc',cv,l,0.12,{pan:0.1,rv:0.15})}
    if(x==='brk'){at(s,b,0,'piano',cv,0.3,{rv:0.4,dl:0.15});if(b%2===0)at(s,b,0,'strings',voice(chord(root-12,sc,c,3),58),32,0.07,{rv:0.4})}
    if(x==='drop'&&b%2===0)at(s,b,0,'strings',voice(chord(root-12,sc,c,3),58),32,0.045,{rv:0.3});
    if(full)for(const[i,l,m]of mel(b))at(s,b,i,'vox',m,Math.min(l,3),0.09,vw,{pan:-0.1,rv:0.25,dl:0.18});
    if(x==='brk'&&b+1<s.bars&&L[b+1]!=='brk'&&L[b-1]==='brk')at(s,b-1,0,'riser',32,0.12);
    if(x==='drop'&&sec0(L,b))at(s,b,0,'boom',0.5);
  }
  Object.assign(s,{sc:0.45,dl:3,fb:0.35,rv:0.28,color:18000,drive:1.1});return s}
function genTrance(r){
  const bpm=pick(r,[132,134,136,138]),s=newSong(bpm,16,fitBars(bpm,16,8));s.sub='Trance';s.trim=0.72;
  const sc=SC.min,root=pick(r,[57,58,59,60,61,62,63]);const prog=pick(r,[[0,5,2,6],[0,6,5,6],[0,5,6,4],[5,6,0,0],[0,3,5,6],[0,5,3,6]]);const ch=b=>prog[Math.floor(b/2)%4];
  const L=layout(s.bars,[['in',8],['a',16]],[['brk',16],['drop',16]],[['out',8]]);
  const arp=pick(r,[[0,1,2,1,3,2,1,2],[0,2,1,3,0,2,1,3],[0,1,2,3,2,1,2,3],[3,2,1,0,1,2,3,2]]);
  const mel=melody(r,{root:root,sc,cells:RH.trance,lo:65,hi:84,chordAt:b=>ch(b),form:[0,0,1,1,0,0,2,3]});
  for(let b=0;b<s.bars;b++){const x=L[b],c=ch(b),bn=inRange(dm(root-24,sc,c),38,50),tones=chord(root+12,sc,c,3),cv=voice(chord(root,sc,c,3),64);
    if(x==='in')at(s,b,0,'col',900+Math.pow(b/7,2)*15000,0.6);if(x==='brk'&&sec0(L,b))at(s,b,0,'col',18000,0.2);
    const kick=x!=='brk'||b===s.bars-1,full=x==='drop';
    for(let i=0;i<16;i++){
      if(kick&&x!=='brk'&&i%4===0)at(s,b,i,'hit','kick',0.95);
      if((x==='a'||full)&&(i===4||i===12))at(s,b,i,'hit','clap',0.45,{rv:0.2});
      if(x!=='brk'&&i%4===2)at(s,b,i,'hit','hatO',0.24,{pan:0.2});
      if((x==='a'||full)&&i%4!==2)at(s,b,i,'hit','hatC',0.07+(i%2?0.03:0),{pan:-0.25});
      if(full&&i%4===0)at(s,b,i,'hit','ride',0.09,{pan:0.4});
      if((x==='a'||full||x==='out')&&i%4!==0)at(s,b,i,'bass','saw',bn+(i%4===3&&r()<0.3?12:0),1,0.42);
      if((x==='a'&&b>=12||full||x==='brk'&&b%16>=8)&&true){const k=arp[i%8];at(s,b,i,'saw',[tones[k%3]+(k===3?12:0)+12],1,full?0.12:0.09,{n:3,spread:14,cut:3600,fenv:2,fdec:0.06,sus:0.2,dec:0.15,rel:0.06,dl:0.3,rv:0.15,pan:(i%2?0.25:-0.25)})}
    }
    if(sec0(L,b)&&x!=='in')at(s,b,0,'hit','crash',0.35,{pan:0.3});
    if(x==='brk'){if(b%2===0)at(s,b,0,'saw',cv,32,0.16,{att:0.8,rel:1,cut:2200,rv:0.5});for(const[i,l,m]of mel(b))at(s,b,i,'lead','flute',m,l,0.09,{rv:0.4,dl:0.2})}
    if(full){if(b%2===0)at(s,b,0,'saw',cv,31,0.13,{att:0.02,cut:4200,rv:0.3});for(const[i,l,m]of mel(b))at(s,b,i,'lead','saw',m,l,0.08,{rv:0.3,dl:0.22})}
    if(x==='brk'&&b+1<s.bars&&L[b+1]==='drop'){for(let i=0;i<16;i++)at(s,b,i,'hit','snare',0.06+i/16*0.35,{rv:0.2});at(s,b-3,0,'riser',64,0.14)}
    if(full&&sec0(L,b))at(s,b,0,'boom',0.55);
  }
  Object.assign(s,{sc:0.6,dl:3,fb:0.42,rv:0.35,color:18000,drive:1.15});return s}
function genPop(r){
  const bpm=pick(r,[108,110,112,115,118]),s=newSong(bpm,16,fitBars(bpm,16,8));s.sub='Electro-Pop';s.trim=0.95;
  const major=r()<0.65,sc=major?SC.maj:SC.min,root=pick(r,[58,60,61,62,63,64]);
  const prog=major?pick(r,[[0,4,5,3],[5,3,0,4],[0,2,3,4],[0,5,3,4],[3,4,0,5]]):pick(r,[[0,5,2,6],[0,3,6,5],[5,6,0,0]]);const ch=b=>prog[b%4];
  const L=layout(s.bars,[['in',4],['v',8],['c',8]],[['v',8],['c',8],['br',8],['c',8]],[['out',4]]);
  const kp=pick(r,[[0,4,8,12],[0,6,8,10],[0,4,8,11,12]]),bp=pick(r,[[0,12,0,12,0,12,0,12],[0,0,12,0,0,12,7,12],[0,12,0,7,0,12,10,12]]);
  const lead=melody(r,{root:root,sc,cells:RH.pop,lo:64,hi:81,chordAt:b=>ch(b)}),verse=melody(r,{root:root,sc,cells:RH.pop,lo:60,hi:74,chordAt:b=>ch(b)});
  const epr=pick(r,[[[0,3],[3,3],[6,2],[10,2],[12,4]],[[0,6],[6,2],[8,6],[14,2]],[[2,2],[6,2],[10,2],[14,2]]]);
  for(let b=0;b<s.bars;b++){const x=L[b],c=ch(b),bn=inRange(dm(root-24,sc,c),36,47),cv=voice(chord(root,sc,c,4),65);
    const drums=x!=='br'&&x!=='in';let prev=null;
    for(let i=0;i<16;i++){
      if(drums&&kp.includes(i))at(s,b,i,'hit','kick',0.85);
      if(drums&&(i===4||i===12)){at(s,b,i,'hit','snare',0.5,{rv:0.18});at(s,b,i,'hit','clap',0.3,{rv:0.1})}
      if(x!=='br'&&i%2===0)at(s,b,i,'hit',i%4===2&&x==='c'?'hatO':'hatC',i%4===2?0.16:0.1,{pan:-0.2});
      if(x==='c'&&r()<0.9)at(s,b,i,'hit','tamb',0.05+(i%4===2?0.05:0),{pan:0.45});
      if(x!=='in'&&i%2===0)at(s,b,i,'bass','funk',bn+bp[i/2],1.2,0.42);
    }
    if(x==='br')at(s,b,0,'bass','sub',bn,15,0.35);
    for(const[i,l]of epr)at(s,b,i,'ep',cv,l,x==='br'?0.16:0.12,{pan:-0.15,rv:0.2,dl:x==='br'?0.2:0});
    if(x==='c'){for(const[i,l,m]of lead(b)){at(s,b,i,'lead','sq',m,l,0.065,{from:prev,pan:0.12,rv:0.22,dl:0.15});prev=m}if(b%2===0)at(s,b,0,'strings',voice(chord(root,sc,c,3),70),32,0.04,{rv:0.3})}
    if(x==='v'&&b%8>=4)for(const[i,l,m]of verse(b))at(s,b,i,'vox',m,Math.min(3,l),0.07,'o',{rv:0.3,dl:0.2});
    if(x==='br')for(const[i,l,m]of verse(b))at(s,b,i,'mallet','vib',m+12,0.12,{rv:0.35,dl:0.25});
    if(sec0(L,b)&&x!=='in')at(s,b,0,'hit','crash',0.3);
    if(b%8===7&&drums)[[10,'tomH'],[12,'tomM'],[14,'tomL']].forEach(([i,t])=>at(s,b,i,'hit',t,0.4,{pan:i===10?0.4:i===14?-0.4:0}));
  }
  Object.assign(s,{sc:0.22,dl:4,fb:0.3,rv:0.22,color:18000,drive:1.1});return s}

/* ======================= Lo-Fi Lehel ======================= */
function lofiProg(r){const major=r()<0.6;return major?{sc:SC.maj,prog:pick(r,[[1,4,0,5],[1,4,0,0],[3,2,1,0],[0,5,1,4],[3,4,2,5]])}:{sc:SC.dor,prog:pick(r,[[0,3],[0,3,0,6],[0,6,5,4],[0,4,3,3]])}}
function genLofi(r){
  const bpm=pick(r,[72,75,78,80,84,88]),s=newSong(bpm,16,fitBars(bpm,16,4));s.sub='Lo-Fi Hip-Hop';s.trim=1.3;s.sw16=pick(r,[0.18,0.24,0.3]);
  const{sc,prog}=lofiProg(r),root=pick(r,[57,58,59,60,62,63]);const ch=b=>prog[b%prog.length];
  const L=layout(s.bars,[['in',4]],[['a',8],['b',8]],[['brk',4],['b',8],['out',4]]);
  const kp=pick(r,[[0,7,10],[0,3,10],[0,6,9],[0,10,11],[0,8,10]]),inst=pick(r,['gtr','flute','vib','harp']);
  const mel=melody(r,{root:root,sc,cells:RH.lofi,lo:inst==='flute'?67:60,hi:inst==='flute'?84:79,chordAt:b=>ch(b)});
  for(let b=0;b<s.bars;b++){const x=L[b],c=ch(b),bn=inRange(dm(root-24,sc,c),36,47);const cv=voice(chord(root,sc,c,4).concat(r()<0.5?[dm(root,sc,c+8)]:[]),64);
    if(sec0(L,b))at(s,b,0,'col',x==='in'||x==='brk'?1500:x==='out'?2200:4400,0.8);
    const drums=x!=='in'&&x!=='brk';
    for(let i=0;i<16;i++){
      if(drums&&kp.includes(i))at(s,b,i,'hit','kickLo',0.85*(i===0?1:0.8));
      if(drums&&(i===4||i===12))at(s,b,i,'hit','snareLo',0.5,{rv:0.15});
      if(drums&&(i===7||i===15)&&r()<0.25)at(s,b,i,'hit','rim',0.12);
      if(x!=='in'&&i%2===0)at(s,b,i,'hit',i===14&&r()<0.2?'hatO':'hatC',(0.06+r()*0.06)*(x==='brk'?0.6:1),{pan:0.25});
      if(drums&&kp.includes(i))at(s,b,i,'bass','sub',bn,i===0?6:3,0.4);
    }
    // chords: on the one, sometimes pushed (anticipated) into the previous bar, with a soft comp
    if(r()<0.25&&b>0)at(s,b-1,14,'ep',cv,18,0.17,{rv:0.25});else at(s,b,0,'ep',cv,15,0.17,{rv:0.25});
    if(r()<0.4)at(s,b,10,'ep',cv.slice(1),2,0.08,{rv:0.2});
    if(x==='b'||x==='out')for(const[i,l,m]of mel(b)){if(inst==='gtr')at(s,b,i,'pluck','gtr',m,0.32,{len:l+1,pan:0.3,rv:0.3});else if(inst==='harp')at(s,b,i,'pluck','harp',m,0.28,{pan:0.3,rv:0.35,dl:0.12});else if(inst==='vib')at(s,b,i,'mallet','vib',m,0.15,{pan:0.3,rv:0.3});else at(s,b,i,'lead','flute',m,l,0.07,{pan:0.2,rv:0.3})}
    if(x==='a'&&b%2===1)at(s,b,8,'pluck','gtr',inRange(dm(root,sc,c+4),64,76),0.18,{pan:-0.35,rv:0.4,dl:0.2});
  }
  Object.assign(s,{sc:0,dl:6,fb:0.3,rv:0.3,color:4400,drive:1.7,crackle:0.6,wow:7});return s}
function genJazz(r){
  const bpm=pick(r,[86,88,90,94,96]),s=newSong(bpm,16,fitBars(bpm,16,4));s.sub='Jazz-Hop';s.trim=1.45;s.sw8=pick(r,[0.28,0.33]);
  const major=r()<0.7,sc=major?SC.maj:SC.min,root=pick(r,[55,56,57,58,60]);
  const prog=major?pick(r,[[1,4,0,5],[1,4,0,0],[2,5,1,4],[0,5,1,4]]):pick(r,[[1,4,0,0],[0,3,1,4]]);const ch=b=>prog[b%4];
  const L=layout(s.bars,[['in',4],['head',8]],[['solo',8],['head',8]],[['out',4]]);
  const mel=melody(r,{root:root,sc,cells:RH.jazz,lo:65,hi:84,chordAt:b=>ch(b)}),solo=melody(r,{root:root,sc,cells:RH.jazz,lo:65,hi:86,chordAt:b=>ch(b),form:[0,1,2,3,0,1,2,4]});
  const comp=pick(r,[[[6,2],[14,2]],[[2,2],[10,3]],[[3,2],[10,2],[14,2]],[[0,3],[6,2],[11,2]]]);
  for(let b=0;b<s.bars;b++){const x=L[b],c=ch(b),nc=ch(b+1);
    // walking bass: root, chord tone, chord tone, chromatic/scale approach to the next root
    const r0=inRange(dm(root-24,sc,c),36,48),nr=inRange(dm(root-24,sc,nc),36,48);const w=[r0,inRange(dm(root-24,sc,c+pick(r,[2,4])),36,50),inRange(dm(root-24,sc,c+pick(r,[4,5,2])),36,52),nr+(r()<0.5?1:-1)];
    const drums=x!=='in';
    for(let i=0;i<16;i++){
      if(drums&&(i%4===0||(i%4===2&&(i===6||i===14))))at(s,b,i,'hit','ride',i%4===0?0.16:0.11,{pan:0.35});
      if(drums&&(i===4||i===12))at(s,b,i,'hit',r()<0.5?'brush':'rim',0.22,{pan:-0.1,rv:0.12});
      if(drums&&(i===0||(i===10&&r()<0.6)))at(s,b,i,'hit','kickLo',0.6);
      if(drums&&(i===4||i===12))at(s,b,i,'hit','hatC',0.06,{pan:-0.3});
      if(i%4===0)at(s,b,i,'pluck','ubass',w[i/4],0.55,{len:4});
    }
    const rootless=voice([dm(root,sc,c+2),dm(root,sc,c+4),dm(root,sc,c+6),dm(root,sc,c+8)],62);
    for(const[i,l]of comp){if(r()<0.5)at(s,b,i,'piano',rootless,0.22,{len:l,rv:0.2,pan:-0.2});else at(s,b,i,'ep',rootless,l,0.15,{rv:0.2,pan:-0.2})}
    if(x==='head')for(const[i,l,m]of mel(b))at(s,b,i,'mallet','vib',m,0.2,{pan:0.25,rv:0.3});
    if(x==='solo')for(const[i,l,m]of solo(b))at(s,b,i,'piano',[m],0.3,{len:l,pan:0.2,rv:0.25});
    if(x==='in'||x==='out')at(s,b,0,'ep',voice(chord(root,sc,c,4),62),14,0.14,{rv:0.3});
  }
  Object.assign(s,{sc:0,dl:6,fb:0.25,rv:0.3,color:6500,drive:1.4,crackle:0.35,wow:4});return s}
function genAmbient(r){
  const bpm=pick(r,[66,70,72,76]),s=newSong(bpm,16,fitBars(bpm,16,4));s.sub='Ambient';s.trim=1.4;
  const sc=r()<0.5?SC.maj:SC.lyd,root=pick(r,[57,59,60,62,64]);const prog=pick(r,[[0,3,5,4],[0,5,3,3],[3,0,4,5],[0,1,0,3]]);const ch=b=>prog[Math.floor(b/2)%4];
  const L=layout(s.bars,[['in',8]],[['a',8],['b',8]],[['out',8]]);
  const ap=pick(r,[[0,1,2,3,4,3,2,1],[0,2,4,1,3,5,2,4],[0,1,2,4,2,1,0,2]]),mk=pick(r,['mar','harp','glock']);
  const mel=melody(r,{root:root+12,sc,cells:RH.amb,lo:72,hi:91,chordAt:b=>ch(b),ivs:[-2,-1,1,2,3,-3,4]});
  for(let b=0;b<s.bars;b++){const x=L[b],c=ch(b),bn=inRange(dm(root-24,sc,c),38,50);
    if(b%2===0){at(s,b,0,'pad',voice(chord(root,sc,c,4),62),32,0.12,{att:1.6,rel:2,cut:1500,rv:0.6});at(s,b,0,'bass','sub',bn,30,0.3)}
    if(x!=='in'||b>=4)for(let k=0;k<8;k++){const m=dm(root,sc,c+ap[k])+12;if(mk==='harp')at(s,b,k*2,'pluck','harp',m,0.2,{pan:(k%2?0.4:-0.4),rv:0.5,dl:0.25});else at(s,b,k*2,'mallet',mk,m,mk==='glock'?0.07:0.14,{pan:(k%2?0.4:-0.4),rv:0.5,dl:0.25})}
    if(x==='b'){for(let i=0;i<16;i++){if(i===0||i===10)at(s,b,i,'hit','kickLo',0.5);if(i===12)at(s,b,i,'hit','rim',0.12,{rv:0.4});if(i%2===0)at(s,b,i,'hit','shaker',0.05+(i%4===2?0.03:0),{pan:0.3})}
      for(const[i,l,m]of mel(b))at(s,b,i,'mallet','bell',m,0.06,{rv:0.6,dl:0.3})}
    if(x==='a'&&b%4===2)for(const[i,l,m]of mel(b))at(s,b,i,'lead','flute',m-12,l,0.05,{rv:0.6,dl:0.2});
  }
  Object.assign(s,{sc:0,dl:6,fb:0.45,rv:0.55,color:9000,drive:1.1,crackle:0.15,wow:3});return s}

/* ======================= Radio Weißwurst ======================= */
// harmonies per bar: number = whole bar, [a,b] = two halves
const chAt=(prog)=>(b,i)=>{const p=prog[b%prog.length];return Array.isArray(p)?p[i<8?0:1]:p};
function genPolka(r){
  const bpm=pick(r,[104,108,112,116]),s=newSong(bpm,16,fitBars(bpm,16,8));s.sub='Polka';s.trim=1.15;
  const root=pick(r,[58,60,62,63,65]),sc=SC.maj;const A=[0,4,4,0,0,3,[0,4],0],B=[4,4,0,0,4,4,[1,4],0];
  const L=layout(s.bars,[['in',2],['A',8],['A',8],['B',8]],[['T',8],['T2',8],['A',8]],[['out',2]]);
  const lead=pick(r,['clar','acc']),mA=melody(r,{root:root,sc,cells:RH.polka,lo:67,hi:86,chordAt:chAt(A)}),mB=melody(r,{root:root,sc,cells:RH.polka,lo:67,hi:86,chordAt:chAt(B)});
  const mT=melody(r,{root:root+5,sc,cells:RH.marsch,lo:65,hi:82,chordAt:chAt(A)});
  for(let b=0;b<s.bars;b++){const x=L[b],trio=x==='T'||x==='T2',rt=trio?root+5:root,pr=x==='B'?B:A,cf=chAt(pr);
    for(let i=0;i<16;i+=2){const c=cf(b,i);
      if(i%4===0){const fifth=(i/4)%2===1;at(s,b,i,'bass','tuba',inRange(dm(rt-24,sc,c+(fifth?4:0)),36,50),2,0.5);if(i%8===0)at(s,b,i,'hit','bdrum',0.5)}
      else{const cv=voice(chord(rt,sc,c,3),64);at(s,b,i,'acc',cv,1.2,0.12,{pan:-0.25});if(x!=='T')at(s,b,i,'brass',cv,1,0.08,{pan:0.25});at(s,b,i,'hit','march',0.16,{pan:0.1});if(i%8===2&&x!=='T')at(s,b,i,'hit','becken',0.1,{pan:0.3})}}
    if(x==='in')at(s,b,0,'brass',voice(chord(root,sc,b===0?4:0,3),67),b===0?12:14,0.18,{rv:0.2});
    if(x==='out'){at(s,b,0,'brass',voice(chord(root,sc,b===s.bars-1?0:4,3),67),b===s.bars-1?8:6,0.2,{rv:0.25});continue}
    const m=x==='B'?mB(b):trio?mT(b):mA(b,x==='A'&&b%16>=8);
    for(const[i,l,n,d]of m){at(s,b,i,'lead',trio?'trp':lead,n,l,0.11,{pan:-0.05,rv:0.15});
      if(x==='B'||x==='T2')at(s,b,i,'lead',trio?'trp':'clar',dm(rt,sc,d-2),l,0.07,{pan:0.3,rv:0.15})}   // second voice a third below
    if(b%8===7)for(let i=8;i<16;i++)at(s,b,i,'hit','march',0.1+(i-8)*0.04);
    if(sec0(L,b))at(s,b,0,'hit','becken',0.25,{pan:-0.3});
  }
  Object.assign(s,{sc:0,dl:4,fb:0.15,rv:0.18,color:12000,drive:1.15});return s}
function genLaendler(r){
  const bpm=pick(r,[150,156,162,168]),s=newSong(bpm,12,fitBars(bpm,12,8));s.sub='Landler';s.trim=1.4;
  const root=pick(r,[58,60,62,63,65]),sc=SC.maj;const A=[0,0,4,4,4,4,0,0,0,0,3,3,0,4,0,0],B=[4,4,0,0,4,4,0,0,3,3,0,0,4,4,0,0];
  const L=layout(s.bars,[['in',4],['A',16]],[['B',16],['A',16]],[['out',4]]);
  const mA=melody(r,{root:root,sc,cells:RH.laendler,lo:67,hi:88,chordAt:b=>A[b%16],ivs:[-2,-1,1,2,4,-4,5,-3,0],form:[0,1,0,2,0,1,3,4]});
  const mB=melody(r,{root:root,sc,cells:RH.laendler,lo:67,hi:88,chordAt:b=>B[b%16],ivs:[-2,-1,1,2,4,-4,5,-3],form:[0,1,0,2,0,1,3,4]});
  const lead=pick(r,['acc','clar']),zit=r()<0.7;
  for(let b=0;b<s.bars;b++){const x=L[b],c=(x==='B'?B:A)[b%16],bn=inRange(dm(root-24,sc,c+(b%2?4:0)),36,50),cv=voice(chord(root,sc,c,3),64);
    at(s,b,0,'bass','tuba',bn,3,0.5);at(s,b,4,'acc',cv,2,0.11,{pan:-0.25});at(s,b,8,'acc',cv,2,0.1,{pan:-0.25});
    at(s,b,4,'pluck','gtr',cv[0],0.12,{pan:0.35});at(s,b,8,'pluck','gtr',cv[1],0.1,{pan:0.35});
    if(x==='in'){if(b===0)at(s,b,0,'lead',lead,dm(root,sc,4)+12,12,0.1,{rv:0.2});continue}
    if(x==='out'){if(b===s.bars-1)at(s,b,0,'lead',lead,root+12,10,0.12,{rv:0.3});continue}
    const m=x==='B'?mB(b):mA(b,b%32>=16);
    for(const[i,l,n,d]of m){at(s,b,i,'lead',lead,n,l,0.11,{rv:0.18});at(s,b,i,'lead',lead==='acc'?'clar':'acc',dm(root,sc,d-2),l,0.06,{pan:0.3,rv:0.18})}
    if(x==='B'&&zit)for(let k=0;k<6;k++)at(s,b,k*2,'pluck','zit',dm(root,sc,c+[0,2,4,7,4,2][k])+12,0.14,{pan:0.45,rv:0.2});
    if(x==='B'&&b%4===3){at(s,b,4,'hit','clap',0.25,{rv:0.2});at(s,b,8,'hit','clap',0.25,{rv:0.2})}   // Schuhplattler
  }
  Object.assign(s,{sc:0,dl:4,fb:0.15,rv:0.22,color:11000,drive:1.1});return s}
function genMarsch(r){
  const bpm=pick(r,[110,114,116,120]),s=newSong(bpm,16,fitBars(bpm,16,8));s.sub='Marsch';s.trim=1.15;
  const root=pick(r,[58,60,63,65]),sc=SC.maj;const A=[0,0,4,4,4,4,[0,4],0],B=[3,3,0,0,[1,4],4,[0,4],0];
  const L=layout(s.bars,[['in',2],['A',8],['A',8],['B',8]],[['T',8],['T2',8]],[['A',8],['out',2]]);
  const mA=melody(r,{root:root,sc,cells:RH.marsch,lo:65,hi:84,chordAt:chAt(A)}),mB=melody(r,{root:root,sc,cells:RH.marsch,lo:65,hi:84,chordAt:chAt(B)}),mT=melody(r,{root:root+5,sc,cells:RH.marsch,lo:62,hi:79,chordAt:chAt(A)});
  const snare=pick(r,[[0,3,4,8,11,12],[0,2,3,4,8,10,11,12],[0,4,6,7,8,12,14,15]]);
  for(let b=0;b<s.bars;b++){const x=L[b],trio=x==='T'||x==='T2',rt=trio?root+5:root,cf=chAt(x==='B'?B:A),soft=x==='T';
    for(let i=0;i<16;i+=4){const c=cf(b,i);
      if(i%8===0){at(s,b,i,'bass','tuba',inRange(dm(rt-24,sc,c+(i===8?4:0)),36,50),3,0.5);at(s,b,i,'hit','bdrum',soft?0.4:0.6);if(!soft)at(s,b,i,'hit','becken',0.16,{pan:0.3})}
      else at(s,b,i,'brass',voice(chord(rt,sc,c,3),62),1.5,soft?0.06:0.11,{pan:-0.2})}
    for(const i of snare)at(s,b,i,'hit','march',(i%4===0?0.3:0.16)*(soft?0.6:1),{pan:0.1});
    if(b%8===7)for(let i=8;i<16;i++)at(s,b,i,'hit','march',0.12+(i-8)*0.04);
    if(x==='in'){at(s,b,0,'brass',voice(chord(root,sc,4,4),67),b===0?6:14,0.18,{rv:0.2});continue}
    if(x==='out'){if(b===s.bars-1){at(s,b,0,'brass',voice(chord(root,sc,0,4),67),10,0.2,{rv:0.3});at(s,b,0,'hit','crash',0.4)}else at(s,b,8,'brass',voice(chord(root,sc,4,4),67),6,0.18);continue}
    const m=x==='B'?mB(b):trio?mT(b):mA(b,b%16>=8);
    for(const[i,l,n,d]of m){at(s,b,i,'lead',soft?'clar':'trp',n,l,soft?0.1:0.11,{rv:0.18});if(!soft)at(s,b,i,'lead','trp',dm(rt,sc,d-2),l,0.06,{pan:0.3,rv:0.18});if(x==='B'||x==='T2')at(s,b,i,'mallet','glock',n+12,0.05,{pan:-0.3,rv:0.2})}
    if(sec0(L,b))at(s,b,0,'hit','crash',0.3);
  }
  Object.assign(s,{sc:0,dl:4,fb:0.1,rv:0.2,color:12000,drive:1.15});return s}

/* ======================= stations ======================= */
const SLOT=170;   // every song (plus jingle and presenter) fills one slot of the station clock
const STATIONS=[
  {id:'isar',name:'Isar FM',genre:'Dance',color:'#3bd0ff',vol:0.85,seed:11,subs:[genHouse,genTrance,genPop],
   talk:['Isar FM – der Beat von München.','Ihr hört Isar FM. Mehr Bass für die Leopoldstraße.','Isar FM. Nonstop Dance, auch auf dem Mittleren Ring.','Isar FM – lauter als der Föhn.','Ihr hört Isar FM. Heute Nacht legen wir auf, bis die erste Tram fährt.'],
   artists:['DJ Fröttmaning','Nachtzug 17','Isarflimmern','Monaco Disco Club','Laser Leopold','Die Föhnwelle','Kollektiv Kulturstrand','MC Maxvorstadt','Neonbrezn','Lilo Lehel','Sendlinger Synths','Bogenhausen Boys'],
   titles:['Mitternacht am Monopteros','Föhnsturm','Tunnelblick','Leuchtreklame','Bassline Bogenhausen','Nachtschicht','Rotlicht am Stachus','Sonnenaufgang Sendling','Zehn nach Zwei','Blaue Stunde','Tram 19','Olympiaturm','Ringverkehr','Glasscherben','Elektrisch','Funkenflug']},
  {id:'lofi',name:'Lo-Fi Lehel',genre:'Chill',color:'#c79bff',vol:1.0,seed:23,subs:[genLofi,genJazz,genAmbient],
   talk:['Lo-Fi Lehel. Zurücklehnen, auch im Stau.','Ihr hört Lo-Fi Lehel – Beats zum Cruisen an der Isar.','Lo-Fi Lehel. Für alle, die gerade nirgendwo hinmüssen.','Hier ist Lo-Fi Lehel. Tee aufsetzen, Fenster runter.'],
   artists:['Lehel Lights','Kaffeehaus Kid','Viktualien Tapes','Hofgarten Hops','Gärtnerplatz Kassetten','Studentenstadt Sound','Die müden Mopeds','Nordbad Nostalgie','Milchkaffee Trio','Flaucher Flow'],
   titles:['Regentropfen auf der Tram','Spätzle um Mitternacht','Lernen für morgen','Hofgarten im November','Kassettendeck','Leise Isar','Fensterplatz','Milchkaffee','Novemberlicht','Nachtbus N40','Sonntag in Haidhausen','Wolken über Giesing','Dachterrasse']},
  {id:'blas',name:'Radio Weißwurst',genre:'Volksmusik',color:'#ffc61a',vol:0.85,seed:37,subs:[genPolka,genLaendler,genMarsch],
   talk:['Radio Weißwurst – Servus und a scheene Fahrt!','Des is Radio Weißwurst. Blasmusik bis zum Frühschoppen.','Radio Weißwurst. Prost, und schaut’s auf de Straß!','Griaß eich bei Radio Weißwurst. Weiter geht’s mit da Musi.'],
   artists:['Die Haidhauser Musikanten','Blaskapelle Oberföhring','Trachtenkapelle Thalkirchen','Die lustigen Giesinger','Musikzug Moosach','Auer-Dult-Musi','Die Schwabinger Spitzbuam','Feldmochinger Blech'],
   titles:{Polka:['Weißwurst-Polka','Brezn-Galopp','Schweinsbraten-Polka','Radl-Polka','Biergarten-Polka','Radi-Polka'],Landler:['Almrausch-Landler','Isarauen-Walzer','Sonnwend-Landler','Kirta-Walzer','Hoagascht-Landler'],Marsch:['Wiesn-Einzugsmarsch','Gruß an Giesing','Marsch der Trambahner','Frühschoppen-Marsch','Hofbräu-Defiliermarsch']}},
  {id:'off',name:'Radio aus',genre:'',color:'#8a9099'}];
let cur=Number.isInteger(IH.settings.radio)?IH.settings.radio:0;if(cur<0||cur>=STATIONS.length)cur=0;
const PERMS=[[0,1,2],[1,2,0],[2,0,1],[0,2,1],[1,0,2],[2,1,0]];
function subFor(st,sl){const r=rnd(Math.floor(sl/3)*131+st.seed);return PERMS[Math.floor(r()*6)][((sl%3)+3)%3]}
const songCache=new Map();
function songFor(st,sl){const k=st.id+':'+sl;let s=songCache.get(k);if(s)return s;const r=rnd(sl*7919+st.seed*104729);const sub=subFor(st,sl);s=st.subs[sub](r);
  const tl=Array.isArray(st.titles)?st.titles:st.titles[s.sub];s.title=pick(r,tl);s.artist=pick(r,st.artists);
  songCache.set(k,s);while(songCache.size>6)songCache.delete(songCache.keys().next().value);warmSong(s);return s}

/* ======================= live scheduling ======================= */
let playing=null,nextT=0,slot=0,stepI=0,epoch=0,gapDone=false,shown=null;
function applySong(s,t){const AC=A.AC;SD=s.sd;A.sc=s.sc||0;A.pre.frequency.setTargetAtTime(s.color||18000,t,0.3);A.rv.gain.setTargetAtTime(s.rv||0.25,t,0.1);
  const dt=Math.min(1.9,(s.dl||3)*s.sd);A.dL.delayTime.setValueAtTime(dt,t);A.dR.delayTime.setValueAtTime(dt,t);A.fb.gain.setTargetAtTime(s.fb||0.3,t,0.1);
  A.crk.gain.setTargetAtTime(s.crackle||0,t,0.3);A.wow.gain.setValueAtTime(s.wow||0,t);A.wowOn=!!s.wow;A.shp.curve=satCurve(s.drive||1.1);A.duck.gain.setTargetAtTime(1,t,0.05);A.trim.gain.setTargetAtTime(0.45*(s.trim||1),t,0.2);
  const delay=Math.max(0,(t-AC.currentTime)*1000);setTimeout(()=>{if(playing){shown=s;render()}},delay)}
function startStation(i){const st=STATIONS[i];if(!st.subs){playing=null;return}const AC=A.AC;const t=AC.currentTime+0.06,abs=t+epoch;
  slot=Math.floor(abs/SLOT);const s=songFor(st,slot);const pos=abs-slot*SLOT;playing=st;SD=s.sd;
  if(pos<s.dur-1){stepI=Math.ceil(pos/s.sd);gapDone=false;applySong(s,t)}else{stepI=s.steps.length;gapDone=true;shown=null;render()}
  nextT=slot*SLOT-epoch+stepI*s.sd}
function schedule(){
  const st=playing,AC=A.AC,ahead=AC.currentTime+0.22;let guard=0;
  while(nextT<ahead&&guard++<300){const s=songFor(st,slot);SD=s.sd;
    if(nextT<AC.currentTime-0.05){stepI=Math.ceil((AC.currentTime+0.02-(slot*SLOT-epoch))/s.sd);nextT=slot*SLOT-epoch+stepI*s.sd;continue}  // fell behind (tab hidden): resync silently
    if(stepI>=s.steps.length){if(!gapDone){gapDone=true;const t0=Math.max(nextT,AC.currentTime);jingle(st,t0);bed(st,t0+1.5,slot*SLOT-epoch+SLOT-t0-1.5);announce(st,s,slot)}
      slot++;stepI=0;gapDone=false;nextT=slot*SLOT-epoch;continue}
    if(stepI===0){applySong(s,Math.max(nextT,AC.currentTime));const sl=slot;setTimeout(()=>{if(playing===st)introTalk(st,s,sl)},Math.max(0,(nextT-AC.currentTime)*1000))}
    if(stepI===s.half)songFor(st,slot+1);
    const i=stepI%s.spb;let t=nextT;if(s.sw16&&i%2===1)t+=s.sw16*s.sd;if(s.sw8&&i%4===2)t+=s.sw8*2*s.sd;
    for(const ev of s.steps[stepI]){const fn=V[ev[0]];if(fn)try{fn.apply(V,[t].concat(ev.slice(1)))}catch(e){}}
    stepI++;nextT=slot*SLOT-epoch+stepI*s.sd}
}
// a soft chord bed under the presenter between songs, so there is never dead air
function bed(st,t,dur){if(dur<1)return;SD=0.12;const L=dur/SD;const ch=st.id==='isar'?[57,64,69,72]:st.id==='lofi'?[60,64,67,71]:[65,69,72];
  if(st.id==='blas')V.acc(t,ch,L,0.05,{rv:0.3});else V.pad(t,ch,L,0.07,{att:1.2,rel:1.5,cut:1200,rv:0.5})}
function jingle(st,t){SD=0.12;
  if(st.id==='isar'){V.saw(t,[57,64,69,73],10,0.14,{att:0.05,cut:3500,fenv:0.3,fdec:0.4,rv:0.5});[69,73,76,81].forEach((m,k)=>V.vox(t+0.18*k,m,1.4,0.08,'a',{rv:0.4,dl:0.3}));V.boom(t,0.4)}
  else if(st.id==='lofi'){[60,64,67,71,74].forEach((m,k)=>V.ep(t+k*0.16,[m],6,0.14,{rv:0.4,dl:0.25}));V.mallet(t+0.9,'vib',79,0.12,{rv:0.5})}
  else{const n=[[65,0,2],[65,0.25,1],[69,0.375,1],[72,0.5,3],[77,0.95,6]];for(const[m,o,l]of n){V.lead(t+o,'trp',m,l,0.12,{rv:0.25});V.lead(t+o,'trp',m-4,l,0.07,{pan:0.3,rv:0.25})}V.bass(t+0.95,'tuba',41,6,0.5);V.hit(t+0.95,'becken',0.25)}}
/* ---------- presenter: song announcements, station IDs, traffic, weather, time, police news ---------- */
const TRAFFIC=['Verkehrsservice: Stau auf dem Mittleren Ring Richtung Luise-Kiesselbach-Platz.','Verkehr: Am Stachus geht gerade gar nix. Umfahren, wenn’s geht.','Achtung Autofahrer: Auf der Leopoldstraße wird wieder einmal gerast. Die Polizei ist vor Ort.','Am Flughafen kommt es zu Verzögerungen auf der Terminalstraße.','Auf der Ludwigsbrücke liegt ein umgefallener Maßkrug. Vorsicht!','Der Altstadtring ist frei, nur am Isartor stockt es wie immer.','Im Englischen Garten läuft eine Herde Surfer über den Weg. Langsam fahren!','Rund um die Theresienwiese ist viel los. Parkplätze: keine.'];
const NEWS=['Nachrichten: Die Stadtwerke testen neue Trambahnen auf der Linie 19.','Kurz notiert: Der Viktualienmarkt hat heute länger offen.','Aus der Stadt: Am Olympiaturm ist die Aussicht heute bis zu den Alpen.','Sport: Die Löwen trainieren heute öffentlich. Der Eintritt ist frei.'];
function clockLine(){const e=IH.env||{};const h=Math.floor(e.tod||12)%24,m=Math.floor(((e.tod||12)%1)*60);return'Es ist '+h+' Uhr'+(m?' '+m:'')+'.'}
function weatherLine(r){const e=IH.env||{};if(e.rain>0.5)return pick(r,['Das Wetter: Es regnet in München. Licht an und Abstand halten.','Regen über der Stadt – die Straßen sind rutschig.']);if(e.night>0.6)return pick(r,['Das Wetter: eine klare Nacht über München.','Für alle Nachteulen da draußen: fahrt vorsichtig.']);return pick(r,['Das Wetter: weiß-blauer Himmel über München, so soll’s sein.','Das Wetter: Sonne, ein bisserl Föhn und beste Fernsicht.','Das Wetter: mild und trocken, perfekt für den Biergarten.'])}
function copLine(r){const n=S.stars?S.stars():0;if(!n)return null;const c=P.inCar;const DAT={kompakt:'einem Kleinwagen',limousine:'einer Limousine',sport:'einem Sportwagen',taxi:'einem Taxi',transporter:'einem Transporter',polizei:'einem gestohlenen Streifenwagen',motorrad:'einem Motorrad',suv:'einem SUV',super:'einem Supersportwagen',bus:'einem MVG-Bus',bierlaster:'einem Bierlaster',krankenwagen:'einem Krankenwagen',feuerwehr:'einem Feuerwehrauto',polsuv:'einem gestohlenen Polizei-SUV'};
  const what=c?(c.t.plane?'einem Flugzeug':DAT[c.type]||'einem Auto'):'einer Person zu Fuß';
  const base=c?pick(r,['Eilmeldung: Die Polizei fahndet gerade nach '+what+' in der Innenstadt.','Polizeimeldung: Großfahndung in München! Gesucht wird jemand mit '+what+'.']):pick(r,['Eilmeldung: Die Polizei sucht in der Innenstadt nach einer flüchtigen Person.','Polizeimeldung: Großfahndung in München! Ein Verdächtiger ist zu Fuß unterwegs.']);
  return base+(n>=4?' Auch ein Hubschrauber ist im Einsatz.':'')}
let talkBusy=false,lastTalk=-99,unlocked=false;
function say(st,lines,delay){if(talkBusy)return;talkBusy=true;setTimeout(()=>{talkBusy=false;if(playing!==st)return;const l=typeof lines==='function'?lines():lines;if(l&&l.length)speak(l.join(' '),st)},delay||0)}
function announce(st,s,sl){const r=rnd(sl*977+st.seed);const lines=[];const cop=copLine(r);
  if(IH.settings.talk==='aus')return;if(!cop&&IH.settings.talk!=='oft'&&r()<0.5)return;   // not after every song
  lines.push(pick(r,['Das war ','Ihr habt gehört: ','Gerade lief ','Eben gehört: '])+'„'+s.title+'“ von '+s.artist+'.');
  if(r()<0.4)lines.push(pick(r,st.talk));
  if(cop)lines.push(cop);else{const x=r();lines.push(x<0.4?pick(r,TRAFFIC):x<0.75?weatherLine(r):x<0.9?clockLine():pick(r,NEWS))}
  const next=songFor(st,sl+1);if(next)lines.push('Und jetzt: '+next.sub+' – „'+next.title+'“ von '+next.artist+'.');
  say(st,lines,1400)}
function introTalk(st,s,sl){if(performance.now()/1000-lastTalk<40||IH.settings.talk==='aus')return;const r=rnd(sl*313+st.seed);if(r()<(IH.settings.talk==='oft'?0.5:0.8))return;const lines=[pick(r,['Hier kommt ','Weiter geht’s mit ','Für euch: '])+'„'+s.title+'“ von '+s.artist+'.'];
  if(r()<0.5)lines.push(r()<0.5?pick(r,TRAFFIC):weatherLine(r));say(st,lines,600)}
function tuneInTalk(st){if(performance.now()/1000-lastTalk<25)return;say(st,()=>{const s=shown;const lines=['Ihr hört '+st.name+'.'];if(s)lines.push('Gerade läuft „'+s.title+'“ von '+s.artist+'.');return lines},1200)}
function speak(txt,st){try{if(IH.settings.muted||!root.speechSynthesis||IH.settings.talk==='aus')return;lastTalk=performance.now()/1000;const u=new SpeechSynthesisUtterance(txt);u.lang='de-DE';u.rate=1;u.pitch=1;u.volume=0.35;const v=IH.pickVoice(st&&st.id==='lofi'?'f':st&&st.id==='blas'?'m':null);if(v)u.voice=v;
    // music dips under the voice, the text shows in the radio bar
    const vol=STATIONS[cur].vol*0.75;u.onstart=()=>{if(A&&playing===st){A.st.gain.setTargetAtTime(vol*0.78,A.AC.currentTime,0.3)}subtitle=txt;render()};   // the music only dips a little: the voice stays in the background
    const end=()=>{if(A&&playing===st){A.st.gain.setTargetAtTime(vol,A.AC.currentTime,0.4)}subtitle=null;render()};u.onend=end;u.onerror=end;
    speechSynthesis.speak(u)}catch(e){}}
// German system voices, best first: premium/enhanced/neural ones sound far more natural; the robotic novelty voices are skipped
const NOVELTY=/Eddy|Flo|Grandma|Grandpa|Oma|Opa|Reed|Rocko|Sandy|Shelley|Albert|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Jester|Organ|Superstar|Trinoids|Whisper|Zarvox|Bad News|Good News/i;
const FEMALE=/Anna|Helena|Petra|Marlene|Vicki|Katja|Sabine|Hedda|Katharina|Lena|Female|Frau/i,MALE=/Markus|Yannick|Martin|Viktor|Hans|Conrad|Stefan|Jonas|Florian|Male|Mann/i;
let voiceList=null;
function voices(){if(voiceList)return voiceList;try{const vs=speechSynthesis.getVoices().filter(x=>/^de/i.test(x.lang)&&!NOVELTY.test(x.name));
  const score=x=>(/premium/i.test(x.name+x.voiceURI)?40:0)+(/enhanced|erweitert|neural|natural|online/i.test(x.name+x.voiceURI)?30:0)+(/Google/i.test(x.name)?14:0)+(FEMALE.test(x.name)||MALE.test(x.name)?6:0)+(x.localService===false?4:0)+(/de-DE/i.test(x.lang)?2:0);
  voiceList=vs.sort((a,b)=>score(b)-score(a));if(!voiceList.length)voiceList=null}catch(e){}return voiceList}
IH.pickVoice=function(g){const vs=voices();if(!vs)return null;const want=g==='f'?FEMALE:g==='m'?MALE:null;return(want&&vs.find(x=>want.test(x.name)))||vs[0]};
try{root.speechSynthesis&&speechSynthesis.addEventListener&&speechSynthesis.addEventListener('voiceschanged',()=>{voiceList=null})}catch(e){}
// iOS only lets a page speak after speech was started once from a tap: do that silently on the first touch
function unlock(){if(unlocked||!root.speechSynthesis)return;unlocked=true;try{const u=new SpeechSynthesisUtterance(' ');u.volume=0;u.lang='de-DE';speechSynthesis.speak(u)}catch(e){}}
for(const ev of['pointerdown','touchend','keydown'])root.addEventListener(ev,unlock,{capture:true,passive:true});
let subtitle=null;

/* ======================= UI: swipe or tap the bar at the bottom ======================= */
const bar=document.createElement('div');bar.id='radio';bar.hidden=true;bar.innerHTML='<button type="button" class="rb" data-d="-1" aria-label="Vorheriger Sender">‹</button><div class="rinfo"><i class="eq"><b></b><b></b><b></b><b></b></i><span><b id="rName"></b><em id="rGenre"></em></span></div><button type="button" class="rb" data-d="1" aria-label="Nächster Sender">›</button>';
document.body.appendChild(bar);
let sx=null,sid=null;
bar.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();sx=e.clientX;sid=e.pointerId;try{bar.setPointerCapture(e.pointerId)}catch(_){}});
bar.addEventListener('pointerup',e=>{if(e.pointerId!==sid)return;e.stopPropagation();const dx=e.clientX-sx;sid=null;
  if(Math.abs(dx)>28)tune(dx<0?1:-1);else{const b=e.target.closest('.rb');tune(b?+b.dataset.d:1)}});
bar.addEventListener('pointercancel',()=>{sid=null});
function tune(d){cur=(cur+d+STATIONS.length)%STATIONS.length;IH.settings.radio=cur;try{localStorage.setItem('2isar2heat.radio',String(cur))}catch(e){}
  if(A){const AC=A.AC,t=AC.currentTime;A.st.gain.cancelScheduledValues(t);A.st.gain.setValueAtTime(0,t);A.stat.gain.cancelScheduledValues(t);A.stat.gain.setValueAtTime(0.12,t);A.stat.gain.exponentialRampToValueAtTime(0.0001,t+0.35);playing=null;switchT=t+0.3}
  shown=null;subtitle=null;render();flash();try{root.speechSynthesis&&speechSynthesis.cancel()}catch(e){}talkBusy=false;lastTalk=-99}
try{const v=localStorage.getItem('2isar2heat.radio');if(v!==null&&!isNaN(+v))cur=Math.min(STATIONS.length-1,Math.max(0,+v))}catch(e){}
let switchT=0;
function render(){const st=STATIONS[cur];$('rName').textContent=st.name;$('rGenre').textContent=subtitle&&playing===st?'🎙 '+subtitle:shown&&playing===st?shown.sub+' · '+shown.artist+' – '+shown.title:st.genre;bar.style.setProperty('--rc',st.color);bar.classList.toggle('off',!st.subs)}
function flash(){bar.classList.add('flash');setTimeout(()=>bar.classList.remove('flash'),350)}
render();
root.addEventListener('keydown',e=>{if(!(P.inCar||P.ride)||e.repeat)return;if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'))return;if(e.code==='Period'||e.code==='KeyM')tune(1);else if(e.code==='Comma')tune(-1)});
let padPrev=[false,false];

function tick(){
  const inVeh=(!!P.inCar||!!P.ride)&&G.state==='play';
  if(bar.hidden===inVeh){bar.hidden=!inVeh;if(inVeh)render()}
  try{const gp=navigator.getGamepads?[...navigator.getGamepads()].find(g=>g&&g.connected):null;if(gp&&inVeh){const l=!!(gp.buttons[14]&&gp.buttons[14].pressed),r=!!(gp.buttons[15]&&gp.buttons[15].pressed);if(l&&!padPrev[0])tune(-1);if(r&&!padPrev[1])tune(1);padPrev=[l,r]}}catch(e){}
  if(!inVeh&&!playing&&!A)return;
  if(!ensure())return;const AC=A.AC;
  if(warmQ.length)warmStep();
  const want=inVeh&&!G.paused&&!!STATIONS[cur].subs&&!IH.settings.muted&&AC.state==='running'&&AC.currentTime>=switchT;
  if(want&&!playing){startStation(cur);if(playing)tuneInTalk(playing);A.st.gain.cancelScheduledValues(AC.currentTime);A.st.gain.setTargetAtTime(STATIONS[cur].vol*0.75,AC.currentTime,0.25)}
  if(!want&&playing){subtitle=null;A.st.gain.cancelScheduledValues(AC.currentTime);A.st.gain.setTargetAtTime(0,AC.currentTime,0.08);playing=null;shown=null;render();try{root.speechSynthesis&&speechSynthesis.cancel()}catch(e){}talkBusy=false}
  if(playing)schedule();
  bar.classList.toggle('live',!!playing);
}
let cost=0,costMax=0;setInterval(()=>{const t0=performance.now();tick();const d=performance.now()-t0;cost+=d;if(d>costMax)costMax=d},30);
IH.radio={tune,get station(){return STATIONS[cur]},get now(){return shown},_skipToEnd(){if(!playing||!A)return;const s=songFor(playing,slot);epoch+=Math.max(0,(slot*SLOT-epoch+s.dur-2)-A.AC.currentTime)},_cost(){const r={total:+cost.toFixed(1),max:+costMax.toFixed(1)};cost=0;costMax=0;return r},
  // test helper: render `sec` seconds of one sub-genre offline and report the levels
  async _render(i,sub,sec,seed,raw){const OAC=new OfflineAudioContext(2,44100*sec,44100);const nb=OAC.createBuffer(1,44100,44100);const d=nb.getChannelData(0);for(let k=0;k<d.length;k++)d[k]=R()*2-1;
    const saved=A;const g=buildGraph(OAC,OAC.destination);g.noise=nb;g.st.gain.value=0.75*STATIONS[i].vol*0.5;if(raw){g.pre.disconnect();g.pre.connect(g.st);g.st.gain.value=1}A=g;const st=STATIONS[i];const s=st.subs[sub](rnd(seed||7));applySong(s,0);let errs=0,ev=0;const err=[];
    for(let k=0;k*s.sd<sec-0.5&&k<s.steps.length;k++){const ii=k%s.spb;let t=k*s.sd;if(s.sw16&&ii%2===1)t+=s.sw16*s.sd;if(s.sw8&&ii%4===2)t+=s.sw8*2*s.sd;SD=s.sd;for(const e of s.steps[k]){ev++;try{V[e[0]].apply(V,[t].concat(e.slice(1)))}catch(x){errs++;if(err.length<3)err.push(e[0]+': '+x.message)}}}
    A=saved;const buf=await OAC.startRendering();let pk=0,sum=0;for(let c=0;c<2;c++){const x=buf.getChannelData(c);for(const v of x){const a=Math.abs(v);if(a>pk)pk=a;sum+=v*v}}
    return{sub:s.sub,bpm:s.bpm,bars:s.bars,dur:+s.dur.toFixed(1),peak:+pk.toFixed(3),rms:+Math.sqrt(sum/(2*44100*sec)).toFixed(4),events:ev,errs,err}}};
})(window));
