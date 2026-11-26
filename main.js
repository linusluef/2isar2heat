/* 2Isar2Heat — app shell: audio, HUD, touch/keyboard/gamepad input, menus, online lobby UI */
(()=>{
'use strict';
const IH=window.IH=window.IH||{};
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:v>b?b:v,hypot=Math.hypot;
IH.cam={yaw:0,target:{x:600,y:640,vx:0,vy:0,a:0},snap:true};
const SET_KEY='2isar2heat.settings';
const isTouch=matchMedia('(pointer:coarse)').matches||('ontouchstart' in window);
const bigScreen=Math.min(screen.width,screen.height)>=700;
IH.settings={cam:'top',steer:'dir',muted:false,quality:(/iPad|iPhone|Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1)||(navigator.hardwareConcurrency||8)>4?'hoch':'mittel',tod:'zyklus',weather:'wechselnd',ui:'auto',online:true,name:'',zoom:1};
try{Object.assign(IH.settings,JSON.parse(localStorage.getItem(SET_KEY)||'{}'))}catch(e){}
if(!IH.settings.name)IH.settings.name='Spieler'+Math.floor(100+Math.random()*900);
function saveSettings(){try{localStorage.setItem(SET_KEY,JSON.stringify(IH.settings))}catch(e){}}
IH.saveSettings=saveSettings;
let S,W,R3,G,P,NET;

/* ---------- audio ---------- */
let AC=null,master,engOsc,engGain,engF,sirOsc,sirGain,noiseBuf,skidG,rainG;
function initAudio(){
  if(AC){if(AC.state==='suspended')AC.resume();return}
  try{AC=new(window.AudioContext||window.webkitAudioContext)();master=AC.createGain();master.gain.value=IH.settings.muted?0:0.55;master.connect(AC.destination);
    noiseBuf=AC.createBuffer(1,AC.sampleRate*1.5,AC.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    IH.audio={AC,master,noiseBuf};
    engOsc=AC.createOscillator();engOsc.type='sawtooth';engF=AC.createBiquadFilter();engF.type='lowpass';engF.frequency.value=380;engGain=AC.createGain();engGain.gain.value=0;engOsc.connect(engF);engF.connect(engGain);engGain.connect(master);engOsc.start();
    sirOsc=AC.createOscillator();sirOsc.type='triangle';sirGain=AC.createGain();sirGain.gain.value=0;sirOsc.connect(sirGain);sirGain.connect(master);sirOsc.start();
    const sk=AC.createBufferSource();sk.buffer=noiseBuf;sk.loop=true;const skf=AC.createBiquadFilter();skf.type='bandpass';skf.frequency.value=1800;skf.Q.value=3;skidG=AC.createGain();skidG.gain.value=0;sk.connect(skf);skf.connect(skidG);skidG.connect(master);sk.start();
    const hr=AC.createBufferSource();hr.buffer=noiseBuf;hr.loop=true;const hf=AC.createBiquadFilter();hf.type='lowpass';hf.frequency.value=260;heliG=AC.createGain();heliG.gain.value=0;const lfo=AC.createOscillator();lfo.frequency.value=13;const lfoG=AC.createGain();lfoG.gain.value=0;lfo.connect(lfoG);lfoG.connect(heliG.gain);heliLfo=lfoG;hr.connect(hf);hf.connect(heliG);heliG.connect(master);hr.start();lfo.start();
    initAudio2();
    const rn=AC.createBufferSource();rn.buffer=noiseBuf;rn.loop=true;const rf=AC.createBiquadFilter();rf.type='highpass';rf.frequency.value=900;const rf2=AC.createBiquadFilter();rf2.type='lowpass';rf2.frequency.value=5200;rainG=AC.createGain();rainG.gain.value=0;rn.connect(rf);rf.connect(rf2);rf2.connect(rainG);rainG.connect(master);rn.start();
  }catch(e){AC=null}
}
function distVol(x,y){if(x===undefined)return 1;const t=IH.cam.target;return clamp(1-hypot(x-t.x,y-t.y)/110,0,1)}
function noise(dur,type,freq,vol,q){const t=AC.currentTime;const s=AC.createBufferSource();s.buffer=noiseBuf;const f=AC.createBiquadFilter();f.type=type;f.frequency.value=freq;if(q)f.Q.value=q;const g=AC.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);s.connect(f);f.connect(g);g.connect(master);s.start(t,Math.random()*0.4,dur+0.05)}
function tone(f1,f2,dur,type,vol,delay){const t=AC.currentTime+(delay||0);const o=AC.createOscillator();o.type=type;o.frequency.setValueAtTime(f1,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+dur);const g=AC.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+dur+0.05)}
function sfx(k,v,x,y,a){
  if(!AC||IH.settings.muted)return;const vol=(v===undefined?1:v)*distVol(x,y);if(vol<0.02)return;
  switch(k){
    case'shot':noise(0.13,'highpass',700,0.55*vol);tone(180,60,0.08,'square',0.12*vol);break;
    case'schrot':noise(0.3,'lowpass',1400,0.8*vol);tone(120,40,0.15,'square',0.15*vol);break;
    case'mp':noise(0.07,'highpass',900,0.4*vol);break;
    case'boom':noise(1.1,'lowpass',420,1.0*vol);tone(90,30,0.7,'sine',0.6*vol);break;
    case'crash':noise(0.22,'bandpass',500,0.6*vol,0.8);break;
    case'punch':noise(0.08,'lowpass',300,0.6*vol);break;
    case'pick':tone(520,1040,0.14,'square',0.12*vol);break;
    case'cash':tone(880,0,0.08,'square',0.1*vol);tone(1320,0,0.12,'square',0.1*vol,0.08);break;
    case'horn':tone(392,0,0.32,'square',0.09*vol);tone(494,0,0.32,'square',0.07*vol);break;
    case'win':[523,659,784,1046].forEach((f,i)=>tone(f,0,0.16,'square',0.1*vol,i*0.09));break;
    case'fail':[392,330,262].forEach((f,i)=>tone(f,0,0.22,'sawtooth',0.08*vol,i*0.14));break;
    case'ring':tone(1200,0,0.06,'square',0.05*vol);tone(1200,0,0.06,'square',0.05*vol,0.1);break;
    case'splash':noise(0.6,'lowpass',900,0.6*vol);break;
    case'door':noise(0.06,'lowpass',600,0.35*vol);break;
    case'nitro':noise(0.8,'bandpass',900,0.6*vol,1.2);tone(200,600,0.6,'sawtooth',0.06*vol);break;
    case'beep':tone(1500,0,0.05,'square',0.06*vol);break;
    case'throw':noise(0.12,'highpass',2000,0.2*vol);break;
    case'chat':tone(880,1180,0.09,'sine',0.08*vol);break;
    case'gewehr':noise(0.45,'lowpass',2200,0.9*vol);tone(140,40,0.25,'square',0.18*vol);tone(900,300,0.05,'sawtooth',0.08*vol);break;
    case'alarm':tone(980,0,0.2,'square',0.06*vol);tone(740,0,0.2,'square',0.06*vol,0.22);break;
    case'honk':{const H=[[349,440],[415,523],[311,392],[466,587],[370,466]][(a|0)%5];const n=((a|0)%3===0)?2:1;const len=0.18+((a|0)%4)*0.07;
      for(let i=0;i<n;i++){tone(H[0],0,len,'sawtooth',0.035*vol,i*(len+0.08));tone(H[1],0,len,'square',0.03*vol,i*(len+0.08))}break}
    case'liftoff':noise(1.4,'lowpass',500,0.35*vol);break;
    case'touchdown':noise(0.09,'bandpass',2400,0.5*vol,4);noise(0.09,'bandpass',2100,0.4*vol,4);setTimeout(()=>noise(0.08,'bandpass',2300,0.3*vol,4),110);tone(70,40,0.25,'sine',0.35*vol);break;
    case'start':{// starter motor, then the engine catches
      for(let i=0;i<5;i++)tone(55,48,0.09,'sawtooth',0.07*vol,i*0.11);noise(0.5,'lowpass',300,0.12*vol);tone(40,75,0.35,'sawtooth',0.1*vol,0.55);break}
    case'spool':tone(400,3200,2.2,'sine',0.025*vol);noise(2.2,'lowpass',700,0.12*vol);break;
    case'stall':tone(880,0,0.12,'square',0.05*vol);tone(880,0,0.12,'square',0.05*vol,0.18);break;
  }
}
let skidV=0,heliG=null,heliLfo=null;
/* ---------- extended sound: car/bike/aircraft engines, traffic, footsteps, ambience ---------- */
let X=null;
function initAudio2(){
  const mk=v=>{const g=AC.createGain();g.gain.value=v;return g};
  const loopNoise=(type,f,q)=>{const s=AC.createBufferSource();s.buffer=noiseBuf;s.loop=true;s.playbackRate.value=0.9+Math.random()*0.2;const fl=AC.createBiquadFilter();fl.type=type;fl.frequency.value=f;if(q)fl.Q.value=q;s.connect(fl);s.start(0,Math.random());return fl};
  X={};
  // second engine oscillator: a sub "body" one octave down and a rasp for bikes
  X.eng2=AC.createOscillator();X.eng2.type='square';X.eng2G=mk(0);X.eng2.connect(X.eng2G);X.eng2G.connect(engF);X.eng2.start();
  // aircraft: propeller buzz, turbine whine, exhaust roar, wind
  X.prop=AC.createOscillator();X.prop.type='sawtooth';X.prop2=AC.createOscillator();X.prop2.type='square';X.propF=AC.createBiquadFilter();X.propF.type='lowpass';X.propF.frequency.value=700;X.propF.Q.value=2;X.propG=mk(0);
  const p2g=mk(0.5);X.prop.connect(X.propF);X.prop2.connect(p2g);p2g.connect(X.propF);X.propF.connect(X.propG);X.propG.connect(master);X.prop.start();X.prop2.start();
  X.whine=AC.createOscillator();X.whine.type='sine';X.whineG=mk(0);X.whine.connect(X.whineG);X.whineG.connect(master);X.whine.start();
  X.roarF=loopNoise('lowpass',500,0.7);X.roarG=mk(0);X.roarF.connect(X.roarG);X.roarG.connect(master);
  X.windF=loopNoise('bandpass',900,0.6);X.windG=mk(0);X.windF.connect(X.windG);X.windG.connect(master);
  // airport traffic heard from the ground
  X.farF=loopNoise('lowpass',420,0.7);X.farG=mk(0);X.farF.connect(X.farG);X.farG.connect(master);X.farW=AC.createOscillator();X.farW.type='sine';X.farWG=mk(0);X.farW.connect(X.farWG);X.farWG.connect(master);X.farW.start();
  // other cars: three positional engine voices for the nearest moving vehicles
  X.tv=[];for(let i=0;i<3;i++){const o=AC.createOscillator();o.type='sawtooth';const o2=AC.createOscillator();o2.type='triangle';const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=320;const g=mk(0);
    let out=g;if(AC.createStereoPanner){const pn=AC.createStereoPanner();g.connect(pn);pn.connect(master);out=pn;X.tv.push({o,o2,f,g,pn,car:null})}else{g.connect(master);X.tv.push({o,o2,f,g,pn:null,car:null})}
    const g2=mk(0.6);o.connect(f);o2.connect(g2);g2.connect(f);f.connect(g);o.start();o2.start()}
  // quiet city bed (distant traffic)
  X.bedF=loopNoise('lowpass',260,0.5);X.bedG=mk(0);X.bedF.connect(X.bedG);X.bedG.connect(master);
  X.stepI=null;X.pedSteps=new WeakMap();X.birdT=2;X.stallT=0;X.lastCar=null;
}
function surfaceAt(x,y){const t=W.at(x,y),T=W.TY;return t===T.GRASS||t===T.PARK||t===T.FIELD?'soft':t===T.WATER?'water':'hard'}
function footstep(x,y,vol,run){if(vol<0.01)return;const sf=surfaceAt(x,y),t=AC.currentTime,wet=IH.env&&IH.env.rain>0.4;
  const burst=(dur,type,f,q,v)=>{const s=AC.createBufferSource();s.buffer=noiseBuf;const fl=AC.createBiquadFilter();fl.type=type;fl.frequency.value=f*(0.9+Math.random()*0.2);fl.Q.value=q;const g=AC.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(v,t+0.004);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);s.connect(fl);fl.connect(g);g.connect(master);s.start(t,Math.random()*1.2,dur+0.03)};
  const v=vol*(run?1.35:1);
  if(sf==='soft'){burst(0.09,'lowpass',650,0.7,0.12*v);burst(0.05,'bandpass',2600,1.5,0.025*v)}
  else if(sf==='water'){burst(0.18,'bandpass',1200,0.8,0.12*v)}
  else{burst(0.045,'bandpass',1700,1.3,0.13*v);const o=AC.createOscillator();o.type='sine';o.frequency.setValueAtTime(110,t);o.frequency.exponentialRampToValueAtTime(55,t+0.05);const g=AC.createGain();g.gain.setValueAtTime(0.08*v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.06);o.connect(g);g.connect(master);o.start(t);o.stop(t+0.08);if(wet)burst(0.07,'highpass',3500,0.7,0.04*v)}}
function chirp(){const t=AC.currentTime;const n=2+Math.floor(Math.random()*5),base=2600+Math.random()*2200;for(let i=0;i<n;i++){const o=AC.createOscillator();o.type='sine';const t0=t+i*(0.09+Math.random()*0.06);o.frequency.setValueAtTime(base*(0.9+Math.random()*0.25),t0);o.frequency.exponentialRampToValueAtTime(base*(1.15+Math.random()*0.4),t0+0.06);const g=AC.createGain();g.gain.setValueAtTime(0.0001,t0);g.gain.exponentialRampToValueAtTime(0.018,t0+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t0+0.07);o.connect(g);g.connect(master);o.start(t0);o.stop(t0+0.09)}}
function cricket(){const t=AC.currentTime;for(let i=0;i<6;i++){const o=AC.createOscillator();o.type='sine';o.frequency.value=4300+Math.random()*200;const g=AC.createGain();const t0=t+i*0.045;g.gain.setValueAtTime(0.0001,t0);g.gain.exponentialRampToValueAtTime(0.008,t0+0.008);g.gain.exponentialRampToValueAtTime(0.0001,t0+0.035);o.connect(g);g.connect(master);o.start(t0);o.stop(t0+0.05)}}
function audioTick2(dt){
  if(!X)return;const t=AC.currentTime,play=G.state==='play'&&!G.paused,c=P&&P.inCar;const lis=IH.cam.target||{x:0,y:0};
  const yaw=IH.cam.yaw||0,cy=Math.cos(yaw),sy=Math.sin(yaw);
  // --- own vehicle ---
  const plane=play&&c&&c.t.plane?c:null,bike=play&&c&&c.t.bike;
  if(c&&c!==X.lastCar){X.lastCar=c;if(play)sfx(c.t.plane?(c.type==='cessna'?'start':'spool'):'start',c.t.plane?0.9:0.7)}else if(!c)X.lastCar=null;
  if(play&&c&&!plane){const s=Math.abs(c.vf||0);const base=bike?62:38;const f=base+s*(bike?4.2:3)+((s/9)%1)*(bike?22:14);engOsc.frequency.setTargetAtTime(f,t,0.05);X.eng2.frequency.setTargetAtTime(f*0.5,t,0.05);
    engF.frequency.setTargetAtTime((bike?520:300)+s*(bike?18:13),t,0.1);engGain.gain.setTargetAtTime(bike?0.045:0.05,t,0.1);X.eng2G.gain.setTargetAtTime(bike?0.35:0.6,t,0.1)}
  else{engGain.gain.setTargetAtTime(0,t,0.1);X.eng2G.gain.setTargetAtTime(0,t,0.1)}
  let pG=0,wG=0,rG=0,windG=0;
  if(plane){const thr=c.thr||0,sp=Math.max(0,c.spd||0),T=c.t.plane,kind=c.type;const air=!!c.air;
    if(kind==='cessna'){const bpf=48+thr*34+sp*0.5;X.prop.frequency.setTargetAtTime(bpf,t,0.15);X.prop2.frequency.setTargetAtTime(bpf/2,t,0.15);X.propF.frequency.setTargetAtTime(500+thr*600,t,0.2);pG=0.05+thr*0.03;rG=0.01}
    else if(kind==='regio'){const bpf=68+thr*20;X.prop.frequency.setTargetAtTime(bpf,t,0.3);X.prop2.frequency.setTargetAtTime(bpf*0.5,t,0.3);X.propF.frequency.setTargetAtTime(420+thr*300,t,0.2);pG=0.035+thr*0.02;
      X.whine.frequency.setTargetAtTime(2400+thr*900,t,0.6);wG=0.006+thr*0.004;X.roarF.frequency.setTargetAtTime(380+thr*300,t,0.4);rG=0.03+thr*0.03}
    else{X.whine.frequency.setTargetAtTime(2800+thr*2600,t,0.8);wG=0.007+thr*0.007;X.roarF.frequency.setTargetAtTime(350+thr*1100,t,0.6);rG=0.05+thr*0.09}
    windG=air?Math.min(0.09,(sp/T.max)*(sp/T.max)*0.1+0.01):0;X.windF.frequency.setTargetAtTime(600+sp*12,t,0.3);
    // stall warning
    X.stallT-=dt;if(air&&sp<T.vr*0.85&&X.stallT<=0){X.stallT=0.5;sfx('stall',1)}}
  X.propG.gain.setTargetAtTime(pG,t,0.2);X.whineG.gain.setTargetAtTime(wG,t,0.4);X.roarG.gain.setTargetAtTime(rG,t,0.3);X.windG.gain.setTargetAtTime(windG,t,0.4);
  // --- airport traffic (scheduled planes), heard when you are not flying yourself ---
  let fv=0;if(play&&!plane&&S.planes){for(const q of S.planes){if(!q.vis)continue;const d=Math.hypot(q.x-lis.x,q.y-lis.y,(q.z||0)*0.7);const v=Math.max(0,1-d/380);if(v>fv)fv=v}}
  X.farG.gain.setTargetAtTime(fv*fv*0.16,t,0.4);X.farWG.gain.setTargetAtTime(fv*fv*0.006,t,0.4);X.farW.frequency.setTargetAtTime(3200,t,1);
  // --- other cars: give the three nearest moving vehicles an engine voice ---
  const cand=[];if(play){for(const k of S.cars){if(k===c||k.dead||k.parked||k.t.plane)continue;const sp=Math.abs(k.vf||0);if(sp<0.8)continue;const d=Math.hypot(k.x-lis.x,k.y-lis.y);if(d<48)cand.push([d,k,sp])}
    for(const k of IH.remote.cars){if(k.t&&k.t.plane)continue;const sp=Math.hypot(k.vx||0,k.vy||0);if(sp<0.8)continue;const d=Math.hypot(k.x-lis.x,k.y-lis.y);if(d<48)cand.push([d,k,sp])}}
  cand.sort((a,b)=>a[0]-b[0]);
  for(let i=0;i<X.tv.length;i++){const v=X.tv[i],e=cand[i];if(!e){v.g.gain.setTargetAtTime(0,t,0.15);continue}const[d,k,sp]=e;const idn=typeof k.id==='number'?k.id:[...String(k.id)].reduce((h,ch)=>(h*31+ch.charCodeAt(0))>>>0,7),off=(idn%7)*2.3,bk=k.t&&k.t.bike;
    const f=(bk?58:34)+off+sp*(bk?3.6:2.6)+((sp/9)%1)*10;if(!isFinite(f)){v.g.gain.setTargetAtTime(0,t,0.15);continue}v.o.frequency.setTargetAtTime(f,t,0.08);v.o2.frequency.setTargetAtTime(f*0.5,t,0.08);v.f.frequency.setTargetAtTime(240+sp*10,t,0.1);
    const q=1-d/48;const gv=q*q*(0.012+Math.min(sp,40)*0.0012);if(!isFinite(f)||!isFinite(gv)){v.g.gain.setTargetAtTime(0,t,0.15);continue}v.g.gain.setTargetAtTime(gv,t,0.12);
    if(v.pn){const dx=k.x-lis.x,dy=k.y-lis.y;v.pn.pan.setTargetAtTime(clamp((dx*cy+dy*sy)/22,-0.9,0.9),t,0.1)}}
  // --- city bed: louder with more traffic around ---
  X.bedG.gain.setTargetAtTime(play?Math.min(0.03,0.008+cand.length*0.0015):0,t,1);
  // --- footsteps: yours, and the people right next to you ---
  if(play&&!c&&!P.dead){const sp=P.spdNow||0;const idx=Math.floor((P.anim||0)/Math.PI);if(sp>0.6){if(X.stepI!==null&&idx!==X.stepI)footstep(P.x,P.y,Math.min(1,0.45+sp*0.06),sp>7.5);X.stepI=idx}else X.stepI=null}else X.stepI=null;
  if(play){let n=0;for(const q of S.peds){if(n>=4)break;if(q.state==='dead'||q.state==='down')continue;const d=Math.hypot(q.x-lis.x,q.y-lis.y);if(d>11||(q.spdNow||0)<0.5)continue;n++;
    const idx=Math.floor((q.anim||0)/Math.PI);const prev=X.pedSteps.get(q);if(prev!==undefined&&prev!==idx)footstep(q.x,q.y,0.32*(1-d/11),(q.spdNow||0)>3.5);X.pedSteps.set(q,idx)}}
  // --- birds by day, crickets at night, when there is green around ---
  X.birdT-=dt;if(play&&X.birdT<=0){X.birdT=1.2+Math.random()*3.5;const env=IH.env||{};let green=0;for(let k=0;k<8;k++){const a=k/8*6.283;if(surfaceAt(lis.x+Math.cos(a)*18,lis.y+Math.sin(a)*18)==='soft')green++}
    if(green>=3&&!(env.rain>0.4)&&!plane){if(env.night>0.6)cricket();else if(Math.random()<0.75)chirp()}}
}
let aT=0;
function audioTick(){
  if(!AC)return;const t=AC.currentTime;const now=performance.now()/1000,adt=Math.min(0.1,now-(aT||now));aT=now;try{audioTick2(adt)}catch(e){console.error(e)}
  let nd=1e9;for(const k of S.cars)if(k.siren&&!k.dead){const d=hypot(k.x-IH.cam.target.x,k.y-IH.cam.target.y);if(d<nd)nd=d}
  for(const k of IH.remote.cars)if(k.siren){const d=hypot(k.x-IH.cam.target.x,k.y-IH.cam.target.y);if(d<nd)nd=d}
  const sv=(G.paused||G.state==='menu')?0:clamp(1-nd/95,0,1)*0.06;sirGain.gain.setTargetAtTime(sv,t,0.08);sirOsc.frequency.setTargetAtTime((G.time%1.3)<0.65?440:587,t,0.01);
  skidV*=0.85;skidG.gain.setTargetAtTime(G.paused?0:skidV*0.08,t,0.05);
  rainG.gain.setTargetAtTime((IH.env?IH.env.rain:0)*0.05,t,0.4);
  if(heliG){const h=S.heli;const v=(h&&h.on&&!G.paused&&G.state!=='menu')?clamp(1-hypot(h.x-IH.cam.target.x,h.y-IH.cam.target.y)/240,0,1)*0.35:0;heliG.gain.setTargetAtTime(v,t,0.3);heliLfo.gain.setTargetAtTime(v*0.9,t,0.3)}
}

/* ---------- HUD ---------- */
const STAR='<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';
$('stars').innerHTML=STAR.repeat(5);const starEls=[...$('stars').children];
const cache={};
function setTxt(id,v){if(cache[id]!==v){cache[id]=v;$(id).textContent=v}}
function setHidden(id,h){if(cache['h_'+id]!==h){cache['h_'+id]=h;$(id).hidden=h}}
let bannerT=0,toastT=0;
function banner(t,s,col){$('bTitle').textContent=t;$('bTitle').style.color=col||'#ffc61a';$('bSub').textContent=s||'';$('banner').classList.add('show');bannerT=Math.max(3,(s||'').length/22+2)}
function toast(t){$('toast').textContent=t;$('toast').classList.add('show');toastT=2.4}
const TITLES={notarzt:'Rettungsdienst',feuer:'Feuerwehr',bus:'MVG-Linie',bier:'Bierlieferung',kurier:'Kurierfahrt',sportwagen:'Auto besorgen',rennen:'Rennen',randale:'Randale',bombe:'Heiße Ware',fluchtwagen:'Fluchtwagen',flucht:'Flucht',taxi:'Taxi'};
function fmtTod(h){const hh=Math.floor(h)%24,mm=Math.floor((h%1)*60);return String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')}
// where an online player is: their ped, their car, or (as a passenger) the driver's car
function bodyOf(p){if(p.mode==='c')return p.car;if(p.mode==='r'){if(p.rd===NET.id)return P.inCar||null;const d=NET.peers.get(p.rd);return d&&d.car||null}return p.ped}
function updateHUD(){
  setTxt('money','$'+P.money.toLocaleString('de-DE'));
  const hp=Math.max(0,Math.round(P.hp));if(cache.hp!==hp){cache.hp=hp;$('hpbar').style.width=hp+'%'}
  const ar=Math.round(P.armor);setHidden('armorWrap',ar<=0);if(cache.ar!==ar){cache.ar=ar;$('arbar').style.width=ar+'%'}
  const w=P.weapon,wk=w+':'+P.ammo[w];if(cache.w!==wk){cache.w=wk;$('weapon').innerHTML=S.WEAP[w].name+(w?'<small>'+P.ammo[w]+'</small>':'')}
  const s=S.stars();if(cache.s!==s){cache.s=s;starEls.forEach((e,i)=>e.classList.toggle('on',i<s))}
  const bl=s>0&&G.lastSeen>1.5;if(cache.bl!==bl){cache.bl=bl;$('stars').classList.toggle('blink',bl)}
  const stv=Math.round((P.stam===undefined?1:P.stam)*50);const stHide=!!P.inCar||stv>=50;setHidden('stamWrap',stHide);if(!stHide&&cache.st!==stv){cache.st=stv;$('stambar').style.width=stv*2+'%'}
  const bi=P.breakIn&&G.state==='play';setHidden('breakin',!bi);if(bi)$('breakBar').style.width=Math.min(100,(1-P.breakIn.t/P.breakIn.T)*100)+'%';
  const ar2=P.arrestT>0.02&&G.state==='play';setHidden('arrest',!ar2);if(ar2)$('arrestBar').style.width=Math.min(100,P.arrestT*100)+'%';
  const c=P.inCar;setHidden('speedo',!c);
  if(c){setTxt('kmh',String(Math.round(Math.abs(c.vf||0)*3.6)));setTxt('carname',c.t.plane?c.t.name+' · '+(c.air?Math.round(c.z)+' m':'am Boden'):c.cop&&c.type==='polizei'?'Streifenwagen':c.t.name);setTxt('bHorn',c.type==='feuerwehr'?'Wasser':(c.t.emerg||c.cop)?'Sirene':'Hupe');setTxt('gear',(c.rev?'KM/H · R':'KM/H · D'));setTxt('nitroInfo',c.up.nitro>0?'NITRO ×'+c.up.nitro:'');
    const dmg=Math.round(c.hp/c.maxHp*100);if(cache.cd!==dmg){cache.cd=dmg;$('carbar').style.width=Math.max(0,dmg)+'%'}}
  const m=S.mission;setHidden('mission',!m.active);
  if(m.active){
    let txt='';
    switch(m.type){
      case'kurier':txt=m.stage?'Liefern: '+m.data.b.name:'Abholen: '+m.data.a.name;break;
      case'sportwagen':txt=m.stage?'Ab zum Hehler (orange Markierung)':'Schnapp dir den markierten Sportwagen';break;
      case'rennen':txt='Kontrollpunkt '+Math.min(m.cpi+1,m.cps.length)+' von '+m.cps.length;break;
      case'randale':txt=m.count+' von '+m.need+' zerstört';break;
      case'bombe':txt=m.data.armed?'In die Isar damit, schnell!':'Steig in das markierte Auto';break;
      case'fluchtwagen':txt=m.stage===0?'Fahr zur Bank in der Ludwigstraße':m.stage===1?'Warte, bis beide eingestiegen sind':S.stars()>0?'Polizei abhängen, dann ins Versteck':'Ab ins Versteck in Giesing';break;
      case'flucht':txt='Sterne loswerden: noch '+S.stars();break;
      case'taxi':txt=(m.stage?'Fahrgast will zum '+m.data.dest.name:'Halte beim winkenden Fahrgast')+(m.fares?' · '+m.fares+' Fahrten':'');break;
      case'notarzt':txt=(m.stage?'Ab ins Klinikum (Kreuz-Symbol)':'Hol den Verletzten ab – daneben anhalten')+(m.fares?' · '+m.fares+' gerettet · $'+m.earned:'');break;
      case'feuer':{const bc=m.data.burnCar;txt=(bc?'Auto brennt! Ranfahren und WASSER halten · '+Math.max(0,Math.ceil(bc.burn))+'%':'Nächster Einsatz …')+(m.fares?' · '+m.fares+' gelöscht':'');break}
      case'bus':txt=(m.data.hold>0?'Fahrgäste steigen ein …':'Nächste Haltestelle anfahren und halten')+(m.fares?' · '+m.fares+' Halte · $'+m.earned:'');break;
      case'verfolgung':case'zerstoeren':case'flug':txt=m.data.hud||'';break;
      case'bier':txt='Fässer zum '+(m.data.dest?m.data.dest.name:'Wirtshaus')+' – vorsichtig fahren!'+(m.fares?' · '+m.fares+' geliefert':'');break;
    }
    setTxt('mTitle',m.title||TITLES[m.type]);setTxt('mText',txt);
    const armedWait=m.type==='bombe'&&!m.data.armed;const t=Math.max(0,Math.ceil(m.time));setTxt('mTime',armedWait?'':Math.floor(t/60)+':'+String(t%60).padStart(2,'0'));
    const low=t<=10&&!armedWait;if(cache.low!==low){cache.low=low;$('mTime').classList.toggle('low',low)}
  }
  const nj=!m.active&&G.state==='play';const nx=S.mission.next();
  if(nj){const sm=IH.story&&IH.story.marker();const nav=IH.story&&IH.story.nav;const html='<b>Aufträge</b>Grüne Telefonzellen'+(sm?'<button type="button" class="sbtn'+(nav?' on':'')+'" id="storyBtn">★ '+(nav?'Navi: '+sm.label:'Story: '+sm.title)+'</button>':'');if(cache.nj!==html){cache.nj=html;$('nextJob').innerHTML=html}}else if(cache.nj!==''){cache.nj='';$('nextJob').innerHTML=''}
  const env=IH.env;setTxt('clock',fmtTod(env.tod)+(env.rain>0.5?'  ·  Regen':env.night>0.6?'  ·  Nacht':env.dusk>0.5?'  ·  Abend':''));
  // pads
  setHidden('footPads',!!c);setHidden('carPads',!c);
  if(!c){const fl=P.weapon===0?'Schlag':P.weapon===4?'Werfen':'Feuer';setTxt('bFire',fl);const near=!!P.ride||!!S.nearestCarFor(P.x,P.y,2.2)||!!S.remoteCarFor(P.x,P.y);if(cache.ed!==!near){cache.ed=!near;$('bEnter').classList.toggle('dim',!near)}setTxt('bEnter',P.ride?'Aus\u00adsteigen':'Ein\u00adsteigen')}
  if(c){const j=S.jobFor(c),on=S.onShift(),show=!!j&&(on||!S.mission.active);setHidden('bJob',!show);if(show){setTxt('bJob',on?'■ Schicht beenden':'▶ '+j.title+' starten');if(cache.jobOn!==on){cache.jobOn=on;$('bJob').classList.toggle('on',on)}}}
  if(!c)setHidden('bJob',true);
  else if(c.t.plane){setHidden('bNitro',true);setHidden('bDrift',true)}   // aircraft: height is on the joystick
  else{setHidden('bNitro',!(c.up.nitro>0));setHidden('bDrift',false);setTxt('bNitro','Nitro');setTxt('bDrift','Drift')}
  // online chip
  const on=NET.enabled;setHidden('bNet',!on);setHidden('bChat',!on||NET.status!=='online');
  if(on){const n=NET.playerList().length+1;const st=NET.status;const lbl=st==='online'?String(n):'…';setTxt('netN',lbl);const cls='ico net '+st;if(cache.netc!==cls){cache.netc=cls;$('bNet').className=cls}}
}

/* ---------- map symbols (minimap, big map, 3D signs) ---------- */
const ICON={home:['#ffc61a','house'],sale:['#8b919b','house'],lack:['#e0457b','spray'],werkstatt:['#3b82ff','wrench'],waffen:['#d8402f','gun'],imbiss:['#e8962a','pretzel'],phone:['#2fb56c','phone'],hehler:['#ff7a1a','$'],safe:['#2f9c63','V'],garage:['#c9a227','P'],way:['#b86bff','pin'],mission:['#ffc61a','!'],klinik:['#f2f2f2','cross'],feuerwache:['#e8402e','flame'],depot:['#2a6fd1','bus'],brauerei:['#e0a526','mug'],heli:['#1f3c88','heli'],pkg:['#f1ece0','W'],casino:['#8e1b6e','spade'],bank:['#1f4f3a','vault'],race:['#202124','flag'],airport:['#2a5fb0','plane'],story:['#e2711d','★']};
function drawIcon(g,kind,x,y,r){
  const d=ICON[kind]||ICON.mission;g.save();g.translate(x,y);g.beginPath();g.arc(0,0,r,0,7);g.fillStyle=d[0];g.fill();g.lineWidth=Math.max(1,r*0.16);g.strokeStyle='rgba(0,0,0,.75)';g.stroke();
  if(d[1].length===1){g.fillStyle='#fff';g.font='700 '+Math.round(r*1.35)+'px "Barlow Condensed",sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(d[1],0,r*0.08);g.restore();return}
  g.scale(r,r);g.fillStyle='#fff';g.strokeStyle='#fff';g.lineCap='round';g.lineJoin='round';
  switch(d[1]){
    case'house':g.beginPath();g.moveTo(-0.64,-0.02);g.lineTo(0,-0.62);g.lineTo(0.64,-0.02);g.closePath();g.fill();g.fillRect(-0.44,-0.06,0.88,0.58);g.fillStyle=d[0];g.fillRect(-0.12,0.16,0.24,0.36);break;
    case'spray':g.fillRect(-0.32,-0.2,0.5,0.74);g.fillRect(-0.17,-0.42,0.2,0.22);g.beginPath();for(const[a,b]of[[0.38,-0.5],[0.56,-0.32],[0.56,-0.64],[0.7,-0.48]]){g.moveTo(a+0.075,b);g.arc(a,b,0.075,0,7)}g.fill();break;
    case'wrench':g.lineWidth=0.25;g.beginPath();g.moveTo(-0.48,0.48);g.lineTo(0.1,-0.1);g.stroke();g.lineWidth=0.2;g.beginPath();g.arc(0.26,-0.26,0.25,Math.PI*0.95,Math.PI*2.55);g.stroke();break;
    case'gun':g.fillRect(-0.6,-0.34,1.16,0.27);g.beginPath();g.moveTo(-0.54,-0.08);g.lineTo(-0.16,-0.08);g.lineTo(-0.06,0.54);g.lineTo(-0.44,0.54);g.closePath();g.fill();break;
    case'pretzel':g.lineWidth=0.17;g.beginPath();g.arc(-0.25,-0.08,0.3,0,7);g.stroke();g.beginPath();g.arc(0.25,-0.08,0.3,0,7);g.stroke();g.beginPath();g.arc(0,0.02,0.52,Math.PI*0.12,Math.PI*0.88);g.stroke();break;
    case'phone':g.lineWidth=0.26;g.beginPath();g.arc(0,0.34,0.56,Math.PI*1.18,Math.PI*1.82);g.stroke();g.fillRect(-0.62,-0.06,0.32,0.26);g.fillRect(0.3,-0.06,0.32,0.26);break;
    case'cross':g.fillStyle='#d62e2e';g.fillRect(-0.16,-0.56,0.32,1.12);g.fillRect(-0.56,-0.16,1.12,0.32);break;
    case'flame':g.beginPath();g.moveTo(0,-0.66);g.bezierCurveTo(0.5,-0.2,0.56,0.2,0.42,0.38);g.bezierCurveTo(0.3,0.62,-0.3,0.62,-0.42,0.38);g.bezierCurveTo(-0.56,0.12,-0.3,-0.1,-0.18,-0.24);g.bezierCurveTo(-0.1,0,0.06,-0.1,0,-0.66);g.fill();g.fillStyle=d[0];g.beginPath();g.arc(0,0.32,0.17,0,7);g.fill();break;
    case'bus':g.fillRect(-0.5,-0.5,1,0.86);g.fillStyle=d[0];g.fillRect(-0.38,-0.38,0.76,0.32);g.fillStyle='#fff';g.beginPath();g.arc(-0.28,0.46,0.12,0,7);g.arc(0.28,0.46,0.12,0,7);g.fill();break;
    case'mug':g.fillRect(-0.48,-0.36,0.66,0.9);g.lineWidth=0.14;g.beginPath();g.arc(0.24,0.08,0.22,-Math.PI/2,Math.PI/2);g.stroke();g.beginPath();g.arc(-0.3,-0.4,0.18,0,7);g.arc(-0.05,-0.46,0.2,0,7);g.arc(0.14,-0.4,0.16,0,7);g.fill();break;
    case'heli':g.fillRect(-0.7,-0.06,1.4,0.1);g.beginPath();g.ellipse(-0.05,0.18,0.36,0.24,0,0,7);g.fill();g.fillRect(-0.62,0.1,0.4,0.1);g.fillRect(-0.03,-0.04,0.06,0.12);break;
    case'spade':g.beginPath();g.moveTo(0,-0.6);g.bezierCurveTo(0.7,-0.1,0.6,0.45,0.12,0.25);g.lineTo(0.25,0.6);g.lineTo(-0.25,0.6);g.lineTo(-0.12,0.25);g.bezierCurveTo(-0.6,0.45,-0.7,-0.1,0,-0.6);g.fill();break;
    case'vault':g.fillRect(-0.55,-0.5,1.1,1);g.fillStyle=d[0];g.beginPath();g.arc(0,0,0.3,0,7);g.fill();g.fillStyle='#fff';g.fillRect(-0.04,-0.3,0.08,0.6);g.fillRect(-0.3,-0.04,0.6,0.08);break;
    case'flag':g.fillRect(-0.5,-0.6,0.08,1.2);for(let r=0;r<3;r++)for(let c=0;c<4;c++)if((r+c)%2===0)g.fillRect(-0.42+c*0.22,-0.6+r*0.22,0.22,0.22);g.strokeStyle='#fff';g.lineWidth=0.05;g.strokeRect(-0.42,-0.6,0.88,0.66);break;
    case'plane':g.beginPath();g.moveTo(0.62,0);g.lineTo(0.42,-0.08);g.lineTo(0.05,-0.08);g.lineTo(-0.2,-0.55);g.lineTo(-0.34,-0.55);g.lineTo(-0.2,-0.08);g.lineTo(-0.48,-0.08);g.lineTo(-0.6,-0.28);g.lineTo(-0.66,-0.28);g.lineTo(-0.6,0);g.lineTo(-0.66,0.28);g.lineTo(-0.6,0.28);g.lineTo(-0.48,0.08);g.lineTo(-0.2,0.08);g.lineTo(-0.34,0.55);g.lineTo(-0.2,0.55);g.lineTo(0.05,0.08);g.lineTo(0.42,0.08);g.closePath();g.fill();break;
    case'pin':g.beginPath();g.arc(0,-0.16,0.38,Math.PI,0);g.lineTo(0,0.6);g.closePath();g.fill();g.fillStyle=d[0];g.beginPath();g.arc(0,-0.16,0.15,0,7);g.fill();break;
  }
  g.restore();
}
IH.drawIcon=drawIcon;IH.ICON=ICON;
const ZONE_ICON={werkstatt:'werkstatt',lack:'lack',hehler:'hehler',safe:'safe',klinik:'klinik',feuerwache:'feuerwache',depot:'depot',brauerei:'brauerei'};

/* ---------- GPS route to waypoint or mission target ---------- */
IH.waypoint=null;let route=null,routeT=0,routeKey='';
function updateRoute(dt){
  routeT-=dt;const m=S.mission;const tgt=IH.waypoint||(m.active&&m.tx!==null&&m.tx!==undefined?{x:m.tx,y:m.ty}:null);
  if(!tgt||G.state!=='play'){route=null;return}
  const src=P.inCar||P;
  if(IH.waypoint&&hypot(tgt.x-src.x,tgt.y-src.y)<14){IH.waypoint=null;route=null;toast('Wegpunkt erreicht');return}
  const key=Math.round(tgt.x)+','+Math.round(tgt.y);if(routeT>0&&key===routeKey)return;routeT=1.2;routeKey=key;
  const a=S.nearestNodeTo(src.x,src.y),b=S.nearestNodeTo(tgt.x,tgt.y);const path=S.astar(a,b);if(!path){route=null;return}
  let pts=path.length>1?S.pathPolyline(path):[[W.nodes[a].x,W.nodes[a].y]];
  // skip the part of the route that lies behind us
  let bi=0,bd=1e9;for(let i=0;i<Math.min(pts.length,40);i++){const d=hypot(pts[i][0]-src.x,pts[i][1]-src.y);if(d<bd){bd=d;bi=i}}pts=pts.slice(bi);
  route={pts:[[src.x,src.y]].concat(pts,[[tgt.x,tgt.y]]),col:IH.waypoint?'#c48bff':'#ffc61a'};
}

/* ---------- minimap & overlay ---------- */
const mini=$('mini'),mctx=mini.getContext('2d');
function drawMini(){
  const Wd=mini.width,Hh=mini.height,ov=R3.overview;const span=440;const sc=Wd/span;
  const px=P.x,py=P.y,rot=-IH.cam.yaw,cr=Math.cos(rot),sr=Math.sin(rot);
  mctx.save();mctx.clearRect(0,0,Wd,Hh);mctx.beginPath();mctx.arc(Wd/2,Hh/2,Wd/2,0,7);mctx.clip();mctx.fillStyle='#4d6a3b';mctx.fillRect(0,0,Wd,Hh);
  mctx.save();mctx.translate(Wd/2,Hh/2);mctx.rotate(rot);mctx.scale(sc,sc);mctx.translate(-px,-py);
  mctx.fillStyle='#2f6f74';for(const w of W.draw.water){mctx.beginPath();mctx.moveTo(w.outer[0][0],w.outer[0][1]);for(const q of w.outer)mctx.lineTo(q[0],q[1]);mctx.closePath();mctx.fill()}
  mctx.drawImage(ov,0,0,ov.width,ov.height,0,0,W.MAP,W.MAP);
  const night=IH.env?IH.env.night:0;if(night>0.05){mctx.fillStyle='rgba(8,12,28,'+(night*0.35)+')';mctx.fillRect(px-span,py-span,span*2,span*2)}
  if(route){mctx.lineCap='round';mctx.lineJoin='round';mctx.strokeStyle='rgba(0,0,0,.55)';mctx.lineWidth=11/sc;mctx.beginPath();mctx.moveTo(route.pts[0][0],route.pts[0][1]);for(const q of route.pts)mctx.lineTo(q[0],q[1]);mctx.stroke();mctx.strokeStyle=route.col;mctx.lineWidth=7/sc;mctx.stroke()}
  for(const c of S.cars)if(c.cop&&!c.dead&&(c.driver==='cop'||c.driver==='copIdle'||c.driver==='block')&&hypot(c.x-px,c.y-py)<span/2){mctx.fillStyle=Math.floor(G.time*6)%2?'#3b82ff':'#ff4136';mctx.fillRect(c.x-6/sc,c.y-6/sc,12/sc,12/sc)}
  mctx.restore();
  // symbols stay upright and are drawn in screen space
  const R0=Wd/2;
  const at=(x,y,r,clampIt)=>{const dx=(x-px)*sc,dy=(y-py)*sc;let X=dx*cr-dy*sr,Y=dx*sr+dy*cr;const d=hypot(X,Y),lim=R0-r-3;if(d>lim){if(!clampIt)return null;X=X/d*lim;Y=Y/d*lim}return[R0+X,R0+Y]};
  const icon=(x,y,kind,r,clampIt)=>{const q=at(x,y,r,clampIt);if(q)drawIcon(mctx,kind,q[0],q[1],r)};
  for(const p of W.properties){const own=S.G.owned.has(p.id);icon(p.x,p.y,own?'home':'sale',own?15:12,own&&p.id===S.G.home)}
  for(const z of W.zones)if(ZONE_ICON[z.kind])icon(z.x,z.y,ZONE_ICON[z.kind],13,false);
  if(IH.act)for(const mk of IH.act.markers())icon(mk.x,mk.y,mk.k,13,false);icon(1650,250,'airport',14,false);
  {const sm=IH.story&&IH.story.marker();if(sm)icon(sm.x,sm.y,'story',15,true)}
  for(const s2 of W.shops)icon(s2.x,s2.y,s2.k,12,false);
  if(!S.mission.active)for(const ph of W.phones)if((ph.cd||0)<=0)icon(ph.x,ph.y,'phone',12,false);
  if(NET.enabled)for(const p of NET.playerList()){const b=bodyOf(p);if(!b||!p.snaps.length)continue;const q=at(b.x,b.y,8,true);mctx.fillStyle=p.color;mctx.strokeStyle='#000';mctx.lineWidth=3;mctx.beginPath();mctx.arc(q[0],q[1],8,0,7);mctx.fill();mctx.stroke()}
  if(S.heli&&S.heli.on)icon(S.heli.x,S.heli.y,'heli',13,true);
  const m=S.mission;if(m.active&&m.tx!==null&&m.tx!==undefined)icon(m.tx,m.ty,'mission',15,true);
  if(IH.waypoint)icon(IH.waypoint.x,IH.waypoint.y,'way',15,true);
  mctx.restore();
  mctx.save();mctx.translate(Wd/2,Hh/2);const h=(P.inCar?P.inCar.a:P.a)+rot;mctx.rotate(h);mctx.fillStyle='#fff';mctx.strokeStyle='#000';mctx.lineWidth=3;mctx.beginPath();mctx.moveTo(16,0);mctx.lineTo(-10,-10);mctx.lineTo(-5,0);mctx.lineTo(-10,10);mctx.closePath();mctx.fill();mctx.stroke();mctx.restore();
  mctx.save();mctx.translate(Wd/2,Hh/2);mctx.rotate(rot);mctx.fillStyle='#fff';mctx.font='700 26px "Barlow Condensed",sans-serif';mctx.textAlign='center';mctx.textBaseline='middle';mctx.strokeStyle='#000';mctx.lineWidth=4;mctx.strokeText('N',0,-Hh/2+20);mctx.fillText('N',0,-Hh/2+20);mctx.restore();
}
const ov=$('ov'),octx=ov.getContext('2d');let ovDirty=false;
function sizeOverlay(){const d=Math.min(window.devicePixelRatio||1,2);ov.width=Math.round(window.innerWidth*d);ov.height=Math.round(window.innerHeight*d);octx.setTransform(d,0,0,d,0,0)}
function roundRect(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.lineTo(x+w-r,y);g.quadraticCurveTo(x+w,y,x+w,y+r);g.lineTo(x+w,y+h-r);g.quadraticCurveTo(x+w,y+h,x+w-r,y+h);g.lineTo(x+r,y+h);g.quadraticCurveTo(x,y+h,x,y+h-r);g.lineTo(x,y+r);g.quadraticCurveTo(x,y,x+r,y);g.closePath()}
function drawOverlay(){
  const w=window.innerWidth,h=window.innerHeight;
  // keep the overlay the size of the window (iPad: the visible height can change without a resize event) and wipe the
  // whole backing store, not just the visible part, so nothing drawn near an edge is ever left behind
  const d=Math.min(window.devicePixelRatio||1,2);if(ov.width!==Math.round(w*d)||ov.height!==Math.round(h*d))sizeOverlay();
  octx.save();octx.setTransform(1,0,0,1,0,0);octx.clearRect(0,0,ov.width,ov.height);octx.restore();
  if(G.state==='dead'){octx.fillStyle=G.deadKind==='busted'?'rgba(20,40,110,.25)':'rgba(110,10,10,.3)';octx.fillRect(0,0,w,h)}
  if(P.hitFlash>0&&G.state==='play'){octx.fillStyle='rgba(255,40,30,'+(P.hitFlash*0.9)+')';octx.fillRect(0,0,w,h)}
  octx.font='700 18px "Barlow Condensed","Arial Narrow",sans-serif';octx.textAlign='center';
  for(const f of S.floaters){const p=R3.project(f.x,f.y,2+(1.4-f.t)*2);if(p.behind)continue;octx.globalAlpha=Math.min(1,f.t*1.5);octx.fillStyle='#000';octx.fillText(f.txt,p.x+1,p.y+1);octx.fillStyle=f.c;octx.fillText(f.txt,p.x,p.y)}octx.globalAlpha=1;
  // story characters: name tags
  if(IH.story&&G.state==='play')for(const L of IH.story.labels()){const pr=R3.project(L.x,L.y,2.5);if(pr.behind||pr.x<-60||pr.x>w+60||pr.y<-60||pr.y>h+60)continue;octx.font='700 16px "Barlow Condensed","Arial Narrow",sans-serif';const tw=octx.measureText(L.t).width+16;octx.fillStyle='rgba(14,16,19,.78)';roundRect(octx,pr.x-tw/2,pr.y-22,tw,22,6);octx.fill();octx.fillStyle=L.c;octx.fillRect(pr.x-tw/2,pr.y-22,4,22);octx.fillStyle='#f1ede2';octx.textAlign='center';octx.fillText(L.t,pr.x+2,pr.y-6)}
  // other players: name, wanted level, health and chat bubbles
  if(NET.enabled){const now=performance.now();
    for(const p of NET.playerList()){const b=bodyOf(p);if(!b||!p.snaps.length)continue;const pr=R3.project(b.x,b.y,p.mode==='c'?3.2:2.6);if(pr.behind||pr.x<-60||pr.x>w+60||pr.y<-60||pr.y>h+60)continue;
      const label=p.name+(p.stars?'  '+'★'.repeat(p.stars):'')+(p.paused?'  (Pause)':'');octx.font='700 16px "Barlow Condensed","Arial Narrow",sans-serif';const tw=octx.measureText(label).width+16;
      octx.fillStyle='rgba(14,16,19,.72)';roundRect(octx,pr.x-tw/2,pr.y-22,tw,22,6);octx.fill();octx.fillStyle=p.color;octx.fillRect(pr.x-tw/2,pr.y-22,4,22);
      octx.fillStyle=p.stars>=3?'#ffc61a':'#f1ede2';octx.fillText(label,pr.x+2,pr.y-6);
      octx.fillStyle='rgba(0,0,0,.6)';octx.fillRect(pr.x-20,pr.y+2,40,4);octx.fillStyle='#ff4136';octx.fillRect(pr.x-20,pr.y+2,40*p.hp/100,4);
      if(p.bubble&&now-p.bubble.t<4500){octx.font='700 18px "Barlow Condensed","Arial Narrow",sans-serif';const bw=octx.measureText(p.bubble.txt).width+20;octx.fillStyle='#f1ede2';roundRect(octx,pr.x-bw/2,pr.y-56,bw,28,8);octx.fill();octx.beginPath();octx.moveTo(pr.x-6,pr.y-28.5);octx.lineTo(pr.x+6,pr.y-28.5);octx.lineTo(pr.x,pr.y-22);octx.fill();octx.fillStyle='#0e1013';octx.fillText(p.bubble.txt,pr.x,pr.y-36)}}
    if(NET.myBubble&&now-NET.myBubble.t<4000&&G.state==='play'){const src=P.inCar||P;const pr=R3.project(src.x,src.y,3);if(!pr.behind){octx.font='700 18px "Barlow Condensed","Arial Narrow",sans-serif';const bw=octx.measureText(NET.myBubble.txt).width+20;octx.fillStyle='#ffc61a';roundRect(octx,pr.x-bw/2,pr.y-40,bw,28,8);octx.fill();octx.fillStyle='#0e1013';octx.fillText(NET.myBubble.txt,pr.x,pr.y-20)}}
  }
  octx.textAlign='center';octx.font='700 18px "Barlow Condensed","Arial Narrow",sans-serif';
  const m=S.mission;
  if(G.state==='play'&&m.active&&m.tx!==null&&m.tx!==undefined){
    const p=R3.project(m.tx,m.ty,2);const mg=60;const inside=!p.behind&&p.x>mg&&p.x<w-mg&&p.y>mg+40&&p.y<h-mg;
    if(!inside){let dx=p.x-w/2,dy=p.y-h/2;if(p.behind){dx=-dx;dy=-dy}const a=Math.atan2(dy,dx);const kx=(w/2-mg)/Math.abs(Math.cos(a)||1e-3),ky=(h/2-mg-30)/Math.abs(Math.sin(a)||1e-3);const k=Math.min(kx,ky);const x=w/2+Math.cos(a)*k,y=h/2+Math.sin(a)*k;
      const src=P.inCar||P;const dm=Math.round(hypot(m.tx-src.x,m.ty-src.y));
      octx.save();octx.translate(x,y);octx.rotate(a);octx.fillStyle='#ffc61a';octx.strokeStyle='rgba(0,0,0,.75)';octx.lineWidth=2;octx.beginPath();octx.moveTo(20,0);octx.lineTo(-9,-13);octx.lineTo(-3,0);octx.lineTo(-9,13);octx.closePath();octx.fill();octx.stroke();octx.restore();
      octx.lineWidth=3;octx.strokeStyle='rgba(0,0,0,.8)';octx.fillStyle='#fff';const tx=x-Math.cos(a)*32,ty=y-Math.sin(a)*26+5;octx.strokeText(dm+' m',tx,ty);octx.fillText(dm+' m',tx,ty)}
  }
}
function renderFeed(){
  const box=$('feed');box.innerHTML='';const now=performance.now();
  for(const f of NET.feed){if(now-f.t>9000)continue;const d=document.createElement('div');d.className='fl '+f.kind;if(f.col)d.style.borderLeftColor=f.col;d.textContent=f.txt;box.appendChild(d)}
}
let feedT=0;

/* ---------- input ---------- */
let inp;
const joy=$('joy'),knob=$('knob'),zone=$('joyzone');
let joyId=null,joyX=0,joyY=0;
function uiScale(){const u=IH.settings.ui;const base=clamp(Math.min(innerWidth,innerHeight)/760,0.85,1.2);return base*(u==='klein'?0.85:u==='gross'?1.18:1)}
function applyUI(){const s=uiScale();document.documentElement.style.setProperty('--ui',s.toFixed(3))}
function joyR(){return 62*uiScale()}
function joyRest(){const r=zone.getBoundingClientRect();const s=uiScale();joyX=r.left+Math.max(115,Math.min(170,innerWidth*0.12))*s;joyY=r.bottom-Math.max(120,Math.min(175,innerHeight*0.2))*s;joy.style.left=joyX+'px';joy.style.top=joyY+'px';knob.style.transform='translate(0,0)'}
zone.addEventListener('pointerdown',e=>{if(joyId!==null)return;e.preventDefault();initAudio();joyId=e.pointerId;try{zone.setPointerCapture(e.pointerId)}catch(_){}const m=85*uiScale();joyX=clamp(e.clientX,m,innerWidth-m);joyY=clamp(e.clientY,m,innerHeight-m);joy.style.left=joyX+'px';joy.style.top=joyY+'px';joy.classList.add('on');joyMove(e)});
zone.addEventListener('pointermove',e=>{if(e.pointerId===joyId){e.preventDefault();joyMove(e)}});
const joyEnd=e=>{if(e.pointerId!==joyId)return;joyId=null;inp.mx=inp.my=inp.mm=0;joy.classList.remove('on');joyRest()};
zone.addEventListener('pointerup',joyEnd);zone.addEventListener('pointercancel',joyEnd);zone.addEventListener('lostpointercapture',joyEnd);
// free look: swipe anywhere outside the joystick and the buttons to turn the follow camera (like GTA San Andreas)
const lookPtr=new Map();
for(const el of[$('lookA'),$('lookB')]){
  el.addEventListener('pointerdown',e=>{if(IH.settings.cam!=='chase'||G.state!=='play')return;e.preventDefault();initAudio();try{el.setPointerCapture(e.pointerId)}catch(_){}lookPtr.set(e.pointerId,{x:e.clientX,y:e.clientY})});
  el.addEventListener('pointermove',e=>{const q=lookPtr.get(e.pointerId);if(!q)return;e.preventDefault();const dx=e.clientX-q.x,dy=e.clientY-q.y;q.x=e.clientX;q.y=e.clientY;
    const c=IH.cam,k=3.4/Math.max(600,innerWidth),inVeh=!!(P.inCar||P.ride);
    if(inVeh)c.look=(c.look||0)+dx*k;else{c.base=(c.base===undefined?c.yaw:c.base)+dx*k;c.freeT=3}
    c.lookP=clamp((c.lookP||0)+dy*k*0.6,-0.3,0.6);c.lookHold=1.6});
  const end=e=>{lookPtr.delete(e.pointerId)};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('lostpointercapture',end)}
$('nextJob').addEventListener('pointerdown',e=>{if(e.target.closest('#storyBtn')){e.preventDefault();e.stopPropagation();if(IH.story)IH.story.toggleNav()}});
function joyMove(e){const dx=e.clientX-joyX,dy=e.clientY-joyY,d=hypot(dx,dy),Rr=joyR();const k=d>Rr?Rr/d:1;knob.style.transform='translate('+dx*k+'px,'+dy*k+'px)';let m=Math.min(1,d/Rr);if(m<0.1)m=0;inp.mm=m;inp.mx=dx/(d||1)*m;inp.my=dy/(d||1)*m}
function bindPad(id,down,up){const el=$(id);el.addEventListener('pointerdown',e=>{e.preventDefault();try{el.setPointerCapture(e.pointerId)}catch(_){}el.classList.add('down');initAudio();down()});const end=()=>{el.classList.remove('down');up&&up()};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('lostpointercapture',end)}
// pedals: one touch area, the finger can slide between gas and brake
const pedals=$('pedals'),pGas=$('pGas'),pBrake=$('pBrake');const pedalPtr=new Map();
function whichPedal(x,y){const g=pGas.getBoundingClientRect(),b=pBrake.getBoundingClientRect();const inG=x>=g.left-8&&x<=g.right+8&&y>=g.top-30&&y<=g.bottom+10;const inB=x>=b.left-10&&x<=b.right+8&&y>=b.top-40&&y<=b.bottom+10;if(inG&&!inB)return'gas';if(inB&&!inG)return'brake';if(inG&&inB)return x>(g.left+b.right)/2?'gas':'brake';return x>g.left-4?'gas':'brake'}
function pedalUpdate(){let gas=false,brake=false;for(const v of pedalPtr.values()){if(v==='gas')gas=true;if(v==='brake')brake=true}inp.gas=gas;inp.brake=brake;pGas.classList.toggle('down',gas);pBrake.classList.toggle('down',brake)}
pedals.addEventListener('pointerdown',e=>{e.preventDefault();initAudio();try{pedals.setPointerCapture(e.pointerId)}catch(_){}pedalPtr.set(e.pointerId,whichPedal(e.clientX,e.clientY));pedalUpdate()});
pedals.addEventListener('pointermove',e=>{if(!pedalPtr.has(e.pointerId))return;e.preventDefault();const p=whichPedal(e.clientX,e.clientY);if(pedalPtr.get(e.pointerId)!==p){pedalPtr.set(e.pointerId,p);pedalUpdate()}});
const pedEnd=e=>{if(pedalPtr.delete(e.pointerId))pedalUpdate()};pedals.addEventListener('pointerup',pedEnd);pedals.addEventListener('pointercancel',pedEnd);pedals.addEventListener('lostpointercapture',pedEnd);
function bindAll(){
  bindPad('bFire',()=>{inp.fire=true},()=>{inp.fire=false});
  bindPad('bEnter',()=>{inp.enterQ=true});
  bindPad('bExit',()=>{inp.enterQ=true});
  bindPad('bAlt',()=>{inp.altQ=true});
  bindPad('bHorn',()=>{inp.fire=true},()=>{inp.fire=false});
  bindPad('bDrift',()=>{inp.hb=true},()=>{inp.hb=false});
  bindPad('bJob',()=>{S.toggleJob()});
  bindPad('bNitro',()=>{inp.nitroQ=true;inp.up=true},()=>{inp.up=false});
}
$('bPause').addEventListener('click',()=>setPause(true));
$('bCam').addEventListener('click',()=>toggleCam());
function toggleCam(){setSetting('cam',IH.settings.cam==='top'?'chase':'top');toast(IH.settings.cam==='top'?'Kamera: Draufsicht · Lenkung: Richtung zeigen':'Kamera: Verfolger · Lenkung: Links / Rechts')}
$('bSound').addEventListener('click',()=>{IH.settings.muted=!IH.settings.muted;saveSettings();$('bSound').classList.toggle('off',IH.settings.muted);if(master)master.gain.value=IH.settings.muted?0:0.55});
$('bSound').classList.toggle('off',IH.settings.muted);
const standalone=matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true;
const fsEl=document.documentElement,fsOK=!standalone&&!!(document.fullscreenEnabled||document.webkitFullscreenEnabled);if(!fsOK)$('bFull').hidden=true;
function goFull(){try{const p=fsEl.requestFullscreen?fsEl.requestFullscreen({navigationUI:'hide'}):fsEl.webkitRequestFullscreen?fsEl.webkitRequestFullscreen():null;if(p&&p.catch)p.catch(()=>{})}catch(e){}}
function exitFull(){try{const p=document.exitFullscreen?document.exitFullscreen():document.webkitExitFullscreen?document.webkitExitFullscreen():null;if(p&&p.catch)p.catch(()=>{})}catch(e){}}
$('bFull').addEventListener('click',()=>{if(document.fullscreenElement||document.webkitFullscreenElement)exitFull();else goFull()});
const bootQuality=IH.settings.quality;
function setSetting(k,v){IH.settings[k]=v;if(k==='cam')IH.settings.steer=v==='chase'?'lr':'dir';saveSettings();syncSettingButtons();if(inp)inp.steerMode=IH.settings.steer;if(k==='ui'){applyUI();joyRest()}}
function syncSettingButtons(){document.querySelectorAll('[data-set]').forEach(b=>b.setAttribute('aria-pressed',String(String(IH.settings[b.dataset.set])===b.dataset.val)));document.querySelectorAll('.qnote').forEach(e=>e.hidden=IH.settings.quality===bootQuality)}
document.querySelectorAll('[data-set]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.set;let v=b.dataset.val;if(k==='online'){v=v==='true';IH.settings.online=v;saveSettings();syncSettingButtons();if(G&&G.state!=='menu'){if(v)NET.start(IH.settings.name);else NET.stop()}return}
  if(k==='cam')setSetting('cam',v);else if(k==='steer'){IH.settings.steer=v;saveSettings();syncSettingButtons();if(inp)inp.steerMode=v}else setSetting(k,v)}));
syncSettingButtons();
const nameIn=$('pname');nameIn.value=IH.settings.name;nameIn.addEventListener('input',()=>{IH.settings.name=nameIn.value.slice(0,16);saveSettings();if(NET&&NET.enabled)NET.name=IH.settings.name.trim()||'Gast'});
nameIn.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter')nameIn.blur()});
window.addEventListener('keydown',e=>{if(!inp)return;if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'))return;if(mapOpenNow()){if(e.code==='Escape'||e.code==='KeyK')closeMap();return}if(!$('shop').hidden||!$('start').hidden||!$('prop').hidden)return;if(e.code==='KeyK'){openMap();return}inp.kb[e.code]=true;if(e.code==='KeyE'||e.code==='Enter')inp.enterQ=true;if(e.code==='KeyQ')inp.altQ=true;if(e.code==='KeyJ'&&P.inCar)S.toggleJob();if(e.code==='KeyN')inp.nitroQ=true;if(e.code==='KeyC')toggleCam();if(e.code==='KeyP'||e.code==='Escape')setPause(!G.paused);if(e.code==='Space'&&P.inCar)inp.fire=true;if(e.code==='KeyT'&&NET.enabled)toggleChat();if(/^Digit[1-8]$/.test(e.code)&&chatOpen){NET.chat(+e.code.slice(5)-1);toggleChat(false)}if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault()});
window.addEventListener('keyup',e=>{if(!inp)return;inp.kb[e.code]=false;if(e.code==='Space')inp.fire=false});
// iPad: no pinch zoom, no double-tap zoom, no rubber-band scrolling outside menus
for(const ev of['gesturestart','gesturechange','gestureend'])document.addEventListener(ev,e=>e.preventDefault());
document.addEventListener('dblclick',e=>e.preventDefault(),{passive:false});
document.addEventListener('touchmove',e=>{if(e.touches.length>1||!e.target.closest('.scroll'))e.preventDefault()},{passive:false});
document.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('visibilitychange',()=>{if(document.hidden&&G&&G.state!=='menu')setPause(true)});
function fillStats(){const st=IH.stats||{},g=S.G;const el=$('pStats');if(!el)return;el.innerHTML='<span><b>'+g.pkgs.size+'/'+W.packages.length+'</b>Weißwurst-Tüten</span><span><b>'+g.stunts.size+'/'+W.ramps.length+'</b>Stuntsprünge</span><span><b>'+(st.missions||0)+'</b>Aufträge</span><span><b>'+(st.cars||0)+'</b>Autos geklaut</span><span><b>'+(st.kills||0)+'</b>Spieler erwischt</span>'}
function setPause(p){if(!G||G.state==='menu')return;if(!$('shop').hidden||!$('prop').hidden||mapOpenNow())return;G.paused=p;$('pause').hidden=!p;if(p)fillStats();if(p){inp.fire=false;inp.hb=false;inp.gas=inp.brake=false;pedalPtr.clear();pedalUpdate();toggleChat(false)}}
$('btnResume').addEventListener('click',()=>setPause(false));
let rsArm=0;$('btnRestart').addEventListener('click',()=>{if(performance.now()-rsArm>4000){rsArm=performance.now();$('btnRestart').textContent='Wirklich? Alles weg';setTimeout(()=>{$('btnRestart').textContent='Neues Spiel'},4000);return}setPause(false);S.newGame(false)});
$('btnMenu').addEventListener('click',()=>{location.reload()});

/* ---------- gamepad (iPadOS supports Xbox / PlayStation / MFi controllers) ---------- */
let gpActive=false;const gpPrev={};
function pollGamepad(){
  const pads=navigator.getGamepads?navigator.getGamepads():[];let gp=null;for(const p of pads)if(p&&p.connected){gp=p;break}
  if(!gp){if(gpActive){gpActive=false;inp.mx=inp.my=inp.mm=0;inp.gas=inp.brake=inp.fire=inp.hb=false}return}
  const b=i=>gp.buttons[i]&&(gp.buttons[i].pressed||gp.buttons[i].value>0.3),bv=i=>gp.buttons[i]?gp.buttons[i].value:0;
  const pressed=i=>{const v=b(i),was=gpPrev[i];gpPrev[i]=v;return v&&!was};
  let lx=gp.axes[0]||0,ly=gp.axes[1]||0;if(b(14))lx=-1;if(b(15))lx=1;if(b(12))ly=-1;if(b(13))ly=1;
  const mag=Math.min(1,hypot(lx,ly));const any=mag>0.18||gp.buttons.some(x=>x&&x.pressed);
  if(pressed(11)&&P.inCar&&G.state==='play')S.toggleJob();
  if(pressed(9)){if(!$('start').hidden)$('btnCont').hidden?$('btnNew').click():$('btnCont').click();else if(!$('shop').hidden)$('shopClose').click();else setPause(!G.paused)}
  if(!any&&!gpActive)return;gpActive=any;
  if(G.paused||G.state==='menu')return;
  if(mag>0.18){inp.mm=mag;inp.mx=lx;inp.my=ly}else if(joyId===null){inp.mm=inp.mx=inp.my=0}
  const c=P.inCar;
  inp.gas=!!c&&bv(7)>0.15;inp.brake=!!c&&bv(6)>0.15;
  if(c){inp.hb=b(1);inp.fire=b(2);inp.sprint=false;inp.up=b(5)}else{inp.fire=b(2)||bv(7)>0.3;inp.hb=false;inp.sprint=b(1)}
  if(pressed(0))inp.enterQ=true;if(pressed(3))inp.altQ=true;if(pressed(5))inp.nitroQ=true;if(pressed(4))toggleCam();if(pressed(8)&&NET.enabled)toggleChat();
}

/* ---------- shop UI ---------- */
let shopKind=null;
function openShop(kind,name){
  if(G.state!=='play')return;shopKind=kind;G.paused=true;inp.gas=inp.brake=inp.fire=false;pedalPtr.clear();pedalUpdate();
  const def=S.SHOP[kind];$('shopTitle').textContent=name||def.title;
  $('shopSub').textContent=kind==='werkstatt'?'Dein Wagen: '+(P.inCar?P.inCar.t.name:'–')+' · Reparatur und Tuning':kind==='lack'?'Dein Wagen: '+(P.inCar?P.inCar.t.name:'–')+' · Neue Farbe für $250 – die Polizei verliert deine Spur.':kind==='waffen'?'Bezahlt wird bar. Fragen stellt hier keiner.':'Frisch, warm und günstig.';
  $('shopMsg').textContent='';renderShop();$('shop').hidden=false;
}
function renderShop(){
  const def=S.SHOP[shopKind];const box=$('shopItems');box.innerHTML='';
  if(shopKind==='lack'){const grid=document.createElement('div');grid.className='sw';grid.style.padding='12px 0';
    for(const[name,col]of S.PAINTS){const b=document.createElement('button');b.type='button';b.style.background=col;b.textContent=name;b.disabled=P.money<250||!P.inCar;if(P.inCar&&P.inCar.color===col)b.classList.add('on');
      b.addEventListener('click',()=>{const r=S.shopBuy('lack','paint',col);$('shopMsg').textContent=r==='ok'?'Frisch lackiert in '+name+'. Die Polizei sucht jetzt ein anderes Auto.':r;renderShop();updateHUD()});grid.appendChild(b)}
    box.appendChild(grid);return}
  for(const it of def.items){const price=S.shopPrice(it);const owned=it.once&&P.inCar&&P.inCar.up[it.once];
    const row=document.createElement('div');row.className='item';
    row.innerHTML='<div><b></b><span></span></div><span class="price"></span><button type="button"></button>';
    row.querySelector('b').textContent=it.name;row.querySelector('div span').textContent=it.desc;row.querySelector('.price').textContent=owned?'':'$'+price;
    const btn=row.querySelector('button');btn.textContent=owned?'Eingebaut':'Kaufen';btn.disabled=!!owned||P.money<price||(it.id==='repair'&&P.inCar&&P.inCar.hp>=P.inCar.maxHp);
    btn.addEventListener('click',()=>{const r=S.shopBuy(shopKind,it.id);$('shopMsg').textContent=r==='ok'?it.name+' gekauft.':r;renderShop();updateHUD()});
    box.appendChild(row)}
}
$('shopClose').addEventListener('click',()=>{$('shop').hidden=true;G.paused=false;shopKind=null});

/* ---------- homes ---------- */
const SHIRTS=['#ff8a1c','#ffd21a','#d8402f','#d15b8f','#7c4f9e','#3d6fb6','#3c8f8a','#6a9a52','#e0d6c2','#f2f2f2','#5b5f66','#2f2f35'];
let propCur=null;
function stopInputs(){inp.gas=inp.brake=inp.fire=inp.hb=false;pedalPtr.clear();pedalUpdate()}
function openProp(p){if(G.state!=='play'||!$('shop').hidden)return;propCur=p;G.paused=true;stopInputs();$('propMsg').textContent='';renderProp();$('prop').hidden=false}
function fact(label,val){const s2=document.createElement('span');s2.textContent=label+' ';const b=document.createElement('b');b.textContent=val;s2.appendChild(b);return s2}
function renderProp(){
  const p=propCur,own=G.owned.has(p.id);$('propTitle').textContent=p.name;
  const f=$('propFacts');f.innerHTML='';
  if(own)f.appendChild(fact('Status',G.home===p.id?'Dein Hauptwohnsitz':'Gehört dir'));else f.appendChild(fact('Preis','$'+p.price.toLocaleString('de-DE')));
  f.appendChild(fact('Garage',p.slots+(p.slots===1?' Platz':' Plätze')));if(p.income)f.appendChild(fact('Mieteinnahmen','+$'+p.income+' pro Tag'));
  $('propNote').textContent=own?'Hier bist du sicher: Gehst du mit Sternen hinein, verliert dich die Polizei (wenn sie nicht direkt hinter dir ist), und andere Spieler können dir hier nichts anhaben. Autos in der Garage nebenan bleiben dir erhalten.'
    :'Zu verkaufen. Als Eigentümer bist du hier sicher, kannst hier aufwachen und deine Autos in der Garage nebenan behalten.';
  const a=$('propActions');a.innerHTML='';const btn=(t,fn,dis,alt)=>{const b=document.createElement('button');b.type='button';b.className='btn2'+(alt?' alt':'');b.textContent=t;b.disabled=!!dis;b.addEventListener('click',fn);a.appendChild(b)};
  if(!own)btn('Kaufen · $'+p.price.toLocaleString('de-DE'),()=>{const r=S.buyProperty(p.id);$('propMsg').textContent=r==='ok'?'Glückwunsch – '+p.name+' gehört jetzt dir!':r;if(r==='ok')sfx('win');renderProp();updateHUD()},P.money<p.price);
  else{btn('Ausruhen',()=>{S.restAt();$('propMsg').textContent='Ausgeschlafen – volle Gesundheit.';renderProp()},P.hp>=100);
    if(G.home!==p.id)btn('Hier wohnen',()=>{S.setHome(p.id);$('propMsg').textContent='Hier wachst du ab jetzt auf.';renderProp()},false,true);
    btn('Speichern',()=>{S.save();$('propMsg').textContent=IH.account.user?'Gespeichert – auch in deinem Konto.':'Gespeichert.'},false,true)}
  $('propWardrobe').hidden=!own;
  if(own){const w=$('propShirts');w.innerHTML='';for(const c of SHIRTS){const b=document.createElement('button');b.type='button';b.className='small'+(P.shirt===c?' on':'');b.style.background=c;b.setAttribute('aria-label','Shirt '+c);b.addEventListener('click',()=>{S.setShirt(c);renderProp()});w.appendChild(b)}}
}
$('propClose').addEventListener('click',()=>{$('prop').hidden=true;G.paused=false;propCur=null});

/* ---------- full-screen map ---------- */
const mapCv=$('mapCv'),mapG=mapCv.getContext('2d');let mapS=1,mapX=600,mapY=600,mapT=0;const mapPtr=new Map();let mapDrag=null;
function mapOpenNow(){return!$('bigmap').hidden}
function openMap(){if(!G||G.state==='menu'||!$('shop').hidden||!$('prop').hidden)return;$('bigmap').hidden=false;G.paused=true;stopInputs();toggleChat(false);$('lobby').hidden=true;sizeMap();const src=P.inCar||P;mapX=src.x;mapY=src.y;mapS=Math.max(innerWidth,innerHeight)/700;drawMap()}
function closeMap(){$('bigmap').hidden=true;if($('pause').hidden)G.paused=false}
function sizeMap(){const d=Math.min(devicePixelRatio||1,2);mapCv.width=Math.round(innerWidth*d);mapCv.height=Math.round(innerHeight*d);mapG.setTransform(d,0,0,d,0,0)}
const w2s=(x,y)=>[(x-mapX)*mapS+innerWidth/2,(y-mapY)*mapS+innerHeight/2];
function drawMap(){
  const w=innerWidth,h=innerHeight,g=mapG;g.fillStyle='#16191e';g.fillRect(0,0,w,h);
  g.save();g.translate(w/2,h/2);g.scale(mapS,mapS);g.translate(-mapX,-mapY);
  g.fillStyle='#4d6a3b';g.fillRect(0,0,W.MAP,W.MAP);g.fillStyle='#2f6f74';for(const wa of W.draw.water){g.beginPath();g.moveTo(wa.outer[0][0],wa.outer[0][1]);for(const q of wa.outer)g.lineTo(q[0],q[1]);g.closePath();g.fill()}
  g.drawImage(R3.overview,0,0,W.MAP,W.MAP);
  if(route){g.lineCap='round';g.lineJoin='round';g.strokeStyle='rgba(0,0,0,.6)';g.lineWidth=9/mapS;g.beginPath();g.moveTo(route.pts[0][0],route.pts[0][1]);for(const q of route.pts)g.lineTo(q[0],q[1]);g.stroke();g.strokeStyle=route.col;g.lineWidth=5/mapS;g.stroke()}
  g.restore();
  g.font='700 14px "Barlow Condensed",sans-serif';g.textAlign='center';
  const label=(x,y,t,col)=>{g.lineWidth=3;g.strokeStyle='rgba(0,0,0,.85)';g.strokeText(t,x,y);g.fillStyle=col||'#f1ede2';g.fillText(t,x,y)};
  if(mapS>0.9)for(const pl of W.places){const[x,y]=w2s(pl.x,pl.y);if(x<-40||y<-40||x>w+40||y>h+40)continue;g.font='600 13px "Barlow Condensed",sans-serif';label(x,y-10,pl.name,'rgba(241,237,226,.85)')}
  g.font='700 14px "Barlow Condensed",sans-serif';
  const ic=(x,y,kind,r)=>{const q=w2s(x,y);drawIcon(g,kind,q[0],q[1],r);return q};
  for(const z of W.zones)if(ZONE_ICON[z.kind]){const q=ic(z.x,z.y,ZONE_ICON[z.kind],11);if(mapS>1.6)label(q[0],q[1]+24,z.name)}
  for(const s2 of W.shops){const q=ic(s2.x,s2.y,s2.k,10);if(mapS>2.2)label(q[0],q[1]+22,s2.name)}
  if(IH.act)for(const mk of IH.act.markers()){const q=ic(mk.x,mk.y,mk.k,11);if(mapS>1.2)label(q[0],q[1]+24,mk.k==='casino'?'Casino':mk.k==='bank'?'Bankraub':'Rennen')}
  {const q=ic(1650,250,'airport',13);label(q[0],q[1]+26,'Flughafen')}
  {const sm=IH.story&&IH.story.marker();if(sm){const q=ic(sm.x,sm.y,'story',15);label(q[0],q[1]+28,sm.label,'#ffc61a')}}
  if(!S.mission.active)for(const ph of W.phones)if((ph.cd||0)<=0)ic(ph.x,ph.y,'phone',10);
  for(const p of W.properties){const own=G.owned.has(p.id);const q=ic(p.x,p.y,own?'home':'sale',own?14:12);label(q[0],q[1]+26,own?p.name+(G.home===p.id?' ★':''):p.name+' · $'+p.price.toLocaleString('de-DE'),own?'#ffc61a':'#f1ede2')}
  if(NET.enabled)for(const p of NET.playerList()){const b=bodyOf(p);if(!b||!p.snaps.length)continue;const[x,y]=w2s(b.x,b.y);g.fillStyle=p.color;g.strokeStyle='#000';g.lineWidth=3;g.beginPath();g.arc(x,y,8,0,7);g.fill();g.stroke();label(x,y-14,p.name,p.color)}
  const m=S.mission;if(m.active&&m.tx!==null&&m.tx!==undefined)ic(m.tx,m.ty,'mission',13);
  if(IH.waypoint)ic(IH.waypoint.x,IH.waypoint.y,'way',14);
  const src=P.inCar||P;const[px,py]=w2s(src.x,src.y);g.save();g.translate(px,py);g.rotate(P.inCar?P.inCar.a:P.a);g.fillStyle='#fff';g.strokeStyle='#000';g.lineWidth=3;g.beginPath();g.moveTo(14,0);g.lineTo(-9,-9);g.lineTo(-4,0);g.lineTo(-9,9);g.closePath();g.fill();g.stroke();g.restore();
}
function buildLegend(){const L=$('legend');L.innerHTML='<b>Legende</b>';
  for(const[k,t]of[['home','Dein Zuhause'],['sale','Wohnung zu verkaufen'],['lack','Lackiererei'],['werkstatt','Werkstatt'],['waffen','Waffenladen'],['imbiss','Imbiss'],['phone','Aufträge'],['hehler','Hehler'],['safe','Versteck'],['casino','Casino (Blackjack, Poker)'],['bank','Bankraub (Koop)'],['race','Straßenrennen'],['airport','Flughafen'],['klinik','Klinik · Notarzt-Jobs'],['feuerwache','Feuerwache'],['depot','Busdepot'],['brauerei','Brauerei'],['mission','Auftragsziel'],['way','Wegpunkt']]){
    const c=document.createElement('canvas');c.width=c.height=44;const g=c.getContext('2d');drawIcon(g,k,22,22,19);const sp=document.createElement('span');sp.textContent=t;L.append(c,sp)}}
function mapZoom(f,cx,cy){const w=innerWidth,h=innerHeight;cx=cx===undefined?w/2:cx;cy=cy===undefined?h/2:cy;const wx=(cx-w/2)/mapS+mapX,wy=(cy-h/2)/mapS+mapY;mapS=clamp(mapS*f,Math.min(w,h)/1300,8);mapX=wx-(cx-w/2)/mapS;mapY=wy-(cy-h/2)/mapS;drawMap()}
mapCv.addEventListener('pointerdown',e=>{e.preventDefault();try{mapCv.setPointerCapture(e.pointerId)}catch(_){}mapPtr.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY});if(mapPtr.size===1)mapDrag={moved:false};else mapDrag=null});
mapCv.addEventListener('pointermove',e=>{const p=mapPtr.get(e.pointerId);if(!p)return;e.preventDefault();
  if(mapPtr.size===2){const ps=[...mapPtr.values()];const d0=hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y);p.x=e.clientX;p.y=e.clientY;const ps2=[...mapPtr.values()];const d1=hypot(ps2[0].x-ps2[1].x,ps2[0].y-ps2[1].y);if(d0>10)mapZoom(d1/d0,(ps2[0].x+ps2[1].x)/2,(ps2[0].y+ps2[1].y)/2);return}
  const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;if(mapDrag&&hypot(p.x-p.sx,p.y-p.sy)>8)mapDrag.moved=true;if(mapDrag&&mapDrag.moved){mapX-=dx/mapS;mapY-=dy/mapS;drawMap()}});
const mapUp=e=>{const p=mapPtr.get(e.pointerId);if(!p)return;mapPtr.delete(e.pointerId);
  if(mapDrag&&!mapDrag.moved&&e.type==='pointerup'){const wx=(e.clientX-innerWidth/2)/mapS+mapX,wy=(e.clientY-innerHeight/2)/mapS+mapY;
    if(IH.waypoint){const q=w2s(IH.waypoint.x,IH.waypoint.y);if(hypot(q[0]-e.clientX,q[1]-e.clientY)<24){IH.waypoint=null;route=null;drawMap();mapDrag=null;return}}
    if(wx>0&&wy>0&&wx<W.MAP&&wy<W.MAP){IH.waypoint={x:wx,y:wy};routeT=0;updateRoute(0);sfx('beep');drawMap()}}
  if(!mapPtr.size)mapDrag=null};
mapCv.addEventListener('pointerup',mapUp);mapCv.addEventListener('pointercancel',mapUp);
mapCv.addEventListener('wheel',e=>{e.preventDefault();mapZoom(e.deltaY<0?1.15:1/1.15,e.clientX,e.clientY)},{passive:false});
$('mapZin').addEventListener('click',()=>mapZoom(1.4));$('mapZout').addEventListener('click',()=>mapZoom(1/1.4));
$('mapClear').addEventListener('click',()=>{IH.waypoint=null;route=null;drawMap()});$('mapClose').addEventListener('click',closeMap);
mini.addEventListener('pointerdown',e=>{if(G&&G.state!=='menu'){e.preventDefault();e.stopPropagation();openMap()}});

/* ---------- account & save codes ---------- */
const ACC=IH.account;
function refreshCont(){const sv=S.loadSave();const b=$('btnCont');if(sv){b.hidden=false;b.textContent='Weiterspielen · $'+(sv.money|0).toLocaleString('de-DE')}else b.hidden=true}
function renderAcct(){const c=ACC.configured;$('acctNone').hidden=c;$('acctOut').hidden=!c||!!ACC.user;$('acctIn').hidden=!ACC.user;
  if(ACC.user)$('acctWho').textContent='Angemeldet als '+ACC.user.name+(ACC.lastSync?' · im Konto gesichert '+new Date(ACC.lastSync).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):'');
  if(ACC.error)$('acctMsg').textContent=ACC.error}
async function afterLogin(quiet){
  if(!quiet)$('acctMsg').textContent='Lade Spielstand …';
  try{const cloud=S.normalizeSave(await ACC.fetchSave());const local=S.loadSave();
    if(cloud&&(!local||(cloud.t||0)>=(local.t||0))){S.storeSave(cloud);if(!quiet||!local||cloud.t>local.t)$('acctMsg').textContent='Spielstand aus dem Konto geladen · $'+(cloud.money|0).toLocaleString('de-DE')}
    else if(local){await ACC.pushSave(Object.assign({},local,{t:local.t||Date.now()}));if(!quiet)$('acctMsg').textContent='Spielstand dieses Geräts im Konto gesichert.'}
    else if(!quiet)$('acctMsg').textContent='Angemeldet – dein Fortschritt wird ab jetzt im Konto gespeichert.';
    if(ACC.user&&ACC.user.name&&!quiet){IH.settings.name=ACC.user.name;nameIn.value=ACC.user.name;saveSettings()}
  }catch(e){$('acctMsg').textContent=e.message}
  refreshCont();renderAcct();
}
async function doAuth(kind){const id=$('aName').value.trim(),pw=$('aPw').value;if(!id||!pw){$('acctMsg').textContent='Bitte Name und Passwort eingeben.';return}
  $('acctMsg').textContent=kind==='up'?'Erstelle Konto …':'Melde an …';
  try{await(kind==='up'?ACC.signUp(id,pw):ACC.signIn(id,pw));$('aPw').value='';await afterLogin(false)}catch(e){$('acctMsg').textContent=e.message}renderAcct()}
$('aLogin').addEventListener('click',()=>doAuth('in'));$('aSignup').addEventListener('click',()=>doAuth('up'));
$('aLogout').addEventListener('click',()=>{ACC.flush();ACC.signOut();$('acctMsg').textContent='Abgemeldet. Der Spielstand bleibt auf diesem Gerät.';renderAcct()});
for(const id of['aName','aPw'])$(id).addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter')doAuth('in')});
let codeMode='out';
function openCode(mode){codeMode=mode;const ta=$('codeText');$('codeMsg').textContent='';$('codeBox').hidden=false;
  if(mode==='out'){const sv=G&&G.state!=='menu'?S.saveData():S.loadSave();ta.readOnly=true;ta.value=sv?ACC.exportCode(sv):'';$('codeTitle').textContent='Spielstand-Code';$('codeHelp').textContent=sv?'Kopiere den Code und füge ihn auf dem anderen Gerät unter „Code eingeben“ ein.':'Noch kein Spielstand vorhanden – spiel erst eine Runde.';$('codeAct').textContent='Kopieren';$('codeAct').disabled=!sv}
  else{ta.readOnly=false;ta.value='';$('codeTitle').textContent='Code eingeben';$('codeHelp').textContent='Füge deinen Spielstand-Code ein. Er ersetzt den Spielstand auf diesem Gerät.';$('codeAct').textContent='Laden';$('codeAct').disabled=false;setTimeout(()=>ta.focus(),50)}}
$('codeAct').addEventListener('click',()=>{const ta=$('codeText');
  if(codeMode==='out'){const done=()=>{$('codeMsg').textContent='Kopiert.'};try{navigator.clipboard.writeText(ta.value).then(done,()=>{ta.select();$('codeMsg').textContent='Markiert – jetzt kopieren.'})}catch(e){ta.select();$('codeMsg').textContent='Markiert – jetzt kopieren.'}}
  else{const sv=ACC.importCode(ta.value);const n=sv&&S.normalizeSave(sv);if(!n||!S.storeSave(Object.assign(n,{t:Date.now()}))){$('codeMsg').textContent='Ungültiger Code.';return}$('codeMsg').textContent='Geladen · $'+(n.money|0).toLocaleString('de-DE')+'. Tippe auf „Weiterspielen“.';refreshCont();if(ACC.user)ACC.pushSave(S.loadSave()).catch(()=>{})}});
$('codeText').addEventListener('keydown',e=>e.stopPropagation());
$('codeClose').addEventListener('click',()=>{$('codeBox').hidden=true});
$('codeOut').addEventListener('click',()=>openCode('out'));$('codeIn').addEventListener('click',()=>openCode('in'));

/* ---------- online lobby UI ---------- */
let chatOpen=false;
function toggleChat(force){chatOpen=force===undefined?!chatOpen:force;$('chatPanel').hidden=!chatOpen;if(chatOpen)$('lobby').hidden=true}
function buildChat(){const box=$('chatPanel');box.innerHTML='';NET.CHAT.forEach((t,i)=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.addEventListener('click',()=>{initAudio();NET.chat(i);sfx('chat');toggleChat(false)});box.appendChild(b)})}
$('bChat').addEventListener('click',()=>toggleChat());
$('bNet').addEventListener('click',()=>{const l=$('lobby');l.hidden=!l.hidden;if(!l.hidden){toggleChat(false);renderLobby()}});
$('lobbyClose').addEventListener('click',()=>{$('lobby').hidden=true});
function renderLobby(){
  const list=$('lobbyList');list.innerHTML='';const st=NET.status;
  $('lobbyState').textContent=st==='online'?'Verbunden über '+NET.linksUp()+' von '+NET.links.length+' Servern':st==='connecting'?'Verbinde …':'Offline';
  const me={name:IH.settings.name||'Du',color:NET.color,money:P.money,kills:IH.stats.kills,stars:S.stars(),me:true};
  const rows=[me].concat(NET.playerList()).sort((a,b)=>b.money-a.money);
  for(const p of rows){const r=document.createElement('div');r.className='lrow'+(p.me?' me':'');
    const dot=document.createElement('i');dot.style.background=p.color;const nm=document.createElement('b');nm.textContent=p.name+(p.me?' (du)':'');
    const info=document.createElement('span');const src=p.me?(P.inCar||P):(p.mode==='c'&&p.car?p.car:p.ped);const dist=p.me?'':Math.round(hypot(src.x-P.x,src.y-P.y))+' m';
    info.textContent=(p.stars?'★'.repeat(p.stars)+'  ':'')+'$'+p.money.toLocaleString('de-DE')+'  ·  '+p.kills+' K'+(dist?'  ·  '+dist:'');r.append(dot,nm,info);list.appendChild(r)}
}
let lobbyT=0;

/* ---------- boot ---------- */
let menuCar=null;
function menuTick(){
  if(!menuCar||!S.cars.includes(menuCar)||menuCar.dead||menuCar.driver!=='ai'){menuCar=S.activeCars.find(c=>c.driver==='ai'&&!c.cop&&hypot(c.x-IH.cam.target.x,c.y-IH.cam.target.y)<200)||S.cars.find(c=>c.driver==='ai')}
  if(menuCar)IH.cam.target={x:menuCar.x,y:menuCar.y,vx:menuCar.vx,vy:menuCar.vy,a:menuCar.a};
}
let last=0,miniT=0;
function frame(now){
  let dt=Math.min(0.05,(now-last)/1000);last=now;
  pollGamepad();
  if(!G.paused){const n=dt>0.025?2:1;for(let i=0;i<n;i++)S.update(dt/n)}
  if(G.state==='menu')menuTick();
  NET.tick(dt);
  R3.frame(G.paused?0:dt);
  if(G.state==='menu'&&ovDirty){ovDirty=false;octx.save();octx.setTransform(1,0,0,1,0,0);octx.clearRect(0,0,ov.width,ov.height);octx.restore()}
  if(G.state!=='menu'){ovDirty=true;updateRoute(dt||0.016);updateHUD();drawOverlay();miniT-=dt;if(miniT<=0){miniT=0.08;drawMini()}}
  if(mapOpenNow()){mapT-=1/60;if(mapT<=0){mapT=0.5;drawMap()}}
  feedT-=dt;if(feedT<=0){feedT=0.5;renderFeed()}
  lobbyT-=dt;if(lobbyT<=0){lobbyT=1;if(!$('lobby').hidden)renderLobby()}
  bannerT-=dt;if(bannerT<=0)$('banner').classList.remove('show');
  toastT-=dt;if(toastT<=0)$('toast').classList.remove('show');
  audioTick();
  requestAnimationFrame(frame);
}
function startGame(cont){
  initAudio();if(fsOK&&isTouch)goFull();
  try{navigator.wakeLock&&navigator.wakeLock.request('screen').catch(()=>{})}catch(e){}
  $('start').hidden=true;$('hud').hidden=false;$('ctrl').hidden=false;applyUI();joyRest();sizeOverlay();
  S.newGame(cont);inp.steerMode=IH.settings.steer;
  if(IH.settings.online)NET.start(IH.settings.name);
}
async function boot(){
  if(!window.THREE){$('loading').textContent='Die 3D-Bibliothek konnte nicht geladen werden. Bitte Seite neu laden.';return}
  try{if(document.fonts&&document.fonts.load)await Promise.race([Promise.all([document.fonts.load('700 20px "Barlow Condensed"'),document.fonts.load('600 20px "Barlow Condensed"'),document.fonts.load('20px Bungee')]),new Promise(r=>setTimeout(r,1500))])}catch(e){}
  try{
    const T0=performance.now();const tm=[];for(const m of window.IH_MODS||[]){const t=performance.now();m();tm.push(Math.round(performance.now()-t))}
    W=IH.world;S=IH.sim;G=S.G;P=S.player;inp=S.input;inp.steerMode=IH.settings.steer;NET=IH.net;
    R3=IH.r3;const T1=performance.now();R3.init($('gl'));IH.bootTimes={mods:tm,r3init:Math.round(performance.now()-T1),total:Math.round(performance.now()-T0)};
  }catch(err){$('loading').textContent='Fehler beim Aufbau: '+err.message;console.error(err);return}
  IH.on={sfx,shake:v=>R3.shake(v),toast,banner,mission:(t,intro)=>banner(t,intro,'#ffc61a'),shop:(k,name)=>openShop(k,name),prop:p=>R3.onProp(p),propsReset:()=>R3.resetProps(),carchange:()=>{for(const k in cache)if(k.startsWith('h_'))delete cache[k]},skid:()=>{skidV=1},
    net:(t,m)=>NET.event(t,m),hurt:()=>{},property:p=>openProp(p),owned:()=>{R3.refreshProps()},saved:sv=>ACC.queue(sv),outfit:()=>R3.dropPed(P.id)};
  NET.onChat=()=>sfx('chat',0.7);
  bindAll();buildChat();buildLegend();renderAcct();if(ACC.user)afterLogin(true);
  // attract mode: the city drives itself behind the title
  IH.cam.target={x:520,y:700,vx:0,vy:0,a:0};S.fillLots(true);for(let i=0;i<24;i++)S.spawnTraffic(false,520,700,20,200);for(let i=0;i<30;i++)S.update(1/30);
  R3.prewarm();
  refreshCont();
  $('btnNew').disabled=false;$('loading').textContent='';
  $('btnCont').addEventListener('click',()=>startGame(true));
  let newArm=0;$('btnNew').addEventListener('click',()=>{if(S.loadSave()&&performance.now()-newArm>4000){newArm=performance.now();$('btnNew').textContent='Sicher? Ersetzt deinen Spielstand';setTimeout(()=>{$('btnNew').textContent='Neues Spiel'},4000);return}startGame(false)});
  window.addEventListener('resize',()=>{R3.resize();sizeOverlay();applyUI();if(joyId===null)joyRest();if(mapOpenNow()){sizeMap();drawMap()}});
  applyUI();
  if(window.IH_TEST)window.IH_TEST({S,R3,NET,ACC,startGame,setPause,toggleChat,openMap,closeMap,openProp,drawMap});
  requestAnimationFrame(t=>{last=t;frame(t)});
}
// install hint for iPad/iPhone Safari (real full screen comes from "Add to Home Screen")
const iOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
// phones/tablets: the game only boots when started from the home screen (install.js shows the install screen)
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
if(!(window.IH_GATE&&IH_GATE.blocked))setTimeout(boot,60);
})();
