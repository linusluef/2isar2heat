/* 2Isar2Heat — simulation (units: metres, seconds) */
(window.IH_MODS=window.IH_MODS||[]).push(()=>(function(root){
'use strict';
const IH=root.IH;const W=IH.world;const{TY,at,nodes,edges}=W;
const rand=(a,b)=>a+(b-a)*Math.random(),pick=a=>a[Math.floor(Math.random()*a.length)];
const clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t,hypot=Math.hypot;
const wrapA=a=>{while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a};
const emit=(t,a,b,c,d)=>{const h=IH.on&&IH.on[t];if(h)h(a,b,c,d)};
const sfx=(k,v,x,y,a)=>emit('sfx',k,v,x,y,a);
// story missions, jobs, pickups and shops only react on foot or in a ground vehicle, never in an aircraft
const inPlane=()=>!!(player.inCar&&player.inCar.t.plane);

/* ================= state ================= */
const G=IH.G={state:'menu',paused:false,heat:0,lastSeen:0,viol:0,time:0,spawnCD:0,blockCD:20,deadT:0,deadKind:'',story:0,jobs:0,best:0,seenNow:false,shopNear:null,zoneIn:null,hint:''};
const cars=[],peds=[],bullets=[],grenades=[],parts=[],decals=[],skids=[],floaters=[];
// other online players (filled by net.js every frame; never moved by the local simulation)
const remote=IH.remote={cars:[],peds:[]};
const stars=()=>Math.min(5,Math.floor(G.heat));
const CT={
  kompakt:{len:4.1,wid:1.8,ht:1.45,max:30,acc:14,turn:2.5,hp:90,mass:1,name:'Kompakt'},
  limousine:{len:4.8,wid:1.86,ht:1.45,max:33,acc:15,turn:2.3,hp:110,mass:1.25,name:'Limousine'},
  sport:{len:4.5,wid:1.92,ht:1.2,max:43,acc:20,turn:2.8,hp:85,mass:1.1,name:'Sportwagen'},
  taxi:{len:4.8,wid:1.86,ht:1.5,max:32,acc:14,turn:2.3,hp:110,mass:1.25,name:'Taxi'},
  transporter:{len:5.6,wid:2.05,ht:2.4,max:26,acc:10,turn:1.9,hp:150,mass:1.8,name:'Transporter'},
  polizei:{len:4.8,wid:1.86,ht:1.5,max:33,acc:15.5,turn:2.6,hp:140,mass:1.35,name:'Streifenwagen'},
  motorrad:{len:2.1,wid:0.8,ht:1.25,max:38,acc:22,turn:3.3,hp:45,mass:0.35,name:'Motorrad',bike:true},
  suv:{len:4.9,wid:2.0,ht:1.8,max:32,acc:14,turn:2.2,hp:170,mass:1.8,name:'SUV',offroad:0.85},
  super:{len:4.6,wid:2.0,ht:1.12,max:52,acc:27,turn:3.0,hp:80,mass:1.1,name:'Supersportwagen'},
  bus:{len:11.5,wid:2.55,ht:3.1,max:22,acc:7,turn:1.35,hp:320,mass:5,name:'MVG-Bus'},
  bierlaster:{len:8,wid:2.45,ht:3.2,max:24,acc:8,turn:1.55,hp:260,mass:4,name:'Bierlaster'},
  krankenwagen:{len:5.6,wid:2.1,ht:2.6,max:35,acc:15,turn:2.1,hp:170,mass:2,name:'Krankenwagen',emerg:true},
  feuerwehr:{len:7.6,wid:2.5,ht:3.1,max:28,acc:10,turn:1.7,hp:280,mass:4,name:'Feuerwehr',emerg:true},
  polsuv:{len:4.9,wid:2.0,ht:1.85,max:31,acc:14,turn:2.4,hp:190,mass:1.9,name:'Polizei-SUV',offroad:0.85},
  // aircraft (flyable): vr = rotation speed, climb = best climb rate m/s, turn = turn rate in the air
  cessna:{len:8.3,wid:2.2,ht:2.7,max:62,acc:8,turn:1,hp:140,mass:3,name:'Kleinflugzeug',plane:{cls:'cessna',vr:24,max:62,acc:9,climb:8,turn:0.62,gturn:0.9}},
  regio:{len:27,wid:3.2,ht:7.5,max:115,acc:10,turn:1,hp:280,mass:12,name:'Turboprop',plane:{cls:'regio',vr:34,max:115,acc:12,climb:10,turn:0.44,gturn:0.5}},
  jet:{len:38,wid:4.2,ht:11.5,max:185,acc:12,turn:1,hp:420,mass:25,name:'Passagierjet',plane:{cls:'narrow',vr:48,max:185,acc:15,climb:14,turn:0.34,gturn:0.36}},
};
const CIV_COLORS=['#2c3e70','#8e1b1b','#d9d9d4','#1d1f22','#5b6b4a','#6a7b8c','#b5b9bd','#7a3b6a','#c96b28','#264e4a','#3a3f47','#9b8f6a','#2f5d8a','#e2e2de'];
const SHIRTS=['#3d6fb6','#b33a3a','#e0d6c2','#2f2f35','#6a9a52','#c58b2b','#7c4f9e','#3c8f8a','#d15b8f','#8a8f96','#556b2f','#e8e1d0'];
const HAIR=['#2b1d14','#4a3426','#1a1a1a','#8a6a3d','#c9a26a','#6b6b6b','#a14b2a'];
const WEAP=[
  {id:'faust',name:'Faust',rate:0.4},
  {id:'pistole',name:'Pistole',rate:0.3,dmg:12,spread:0.03,pellets:1},
  {id:'schrot',name:'Schrotflinte',rate:0.85,dmg:6,spread:0.22,pellets:7},
  {id:'mp',name:'MP',rate:0.085,dmg:7,spread:0.08,pellets:1},
  {id:'granate',name:'Granaten',rate:0.8},
  {id:'schlaeger',name:'Baseballschläger',rate:0.55},
  {id:'gewehr',name:'Gewehr',rate:1.25,dmg:60,spread:0.004,pellets:1,life:0.42},
  {id:'molotow',name:'Molotows',rate:0.9},
];
let carId=0;

/* ================= helpers ================= */
const onFoot=()=>!player.inCar;
const solidCar=t=>t===TY.BUILD||t===TY.RAIL||t===TY.SOLID;
const solidPed=t=>t===TY.BUILD||t===TY.RAIL||t===TY.SOLID||t===TY.WATER;
const civOK=t=>t===TY.WALK||t===TY.PLAZA||t===TY.PARK||t===TY.LOT||t===TY.FIELD||t===TY.BANK;
function hasLOS(x0,y0,x1,y1){const d=hypot(x1-x0,y1-y0),n=Math.ceil(d/1.5);for(let i=1;i<n;i++){const t=i/n,g=at(x0+(x1-x0)*t,y0+(y1-y0)*t);if(g===TY.BUILD)return false}return true}
function focus(){return G.state==='menu'?IH.cam.target:{x:player.x,y:player.y}}

/* ================= entities ================= */
function makeCar(type,x,y,a,o){
  o=o||{};const t=CT[type];
  const FIXED={taxi:'#ece3c6',polizei:'#eef1f4',polsuv:'#eef1f4',bus:'#1d5fae',bierlaster:'#f2efe4',krankenwagen:'#f4f4f0',feuerwehr:'#c8201b'};
  const color=o.color||FIXED[type]||(type==='sport'?pick(['#d42a22','#f2b705','#1e1f22','#e8e8e8','#1d5fd1']):type==='super'?pick(['#f2b705','#e8e8e8','#d42a22','#1d1f22','#2bbf6a']):type==='motorrad'?pick(['#d42a22','#1d1f22','#f2b705','#2f5d8a','#e8e8e8']):pick(CIV_COLORS));
  const c={id:++carId,type,t,x,y,a,vx:0,vy:0,vf:0,vl:0,hp:t.hp,color,driver:o.driver||null,cop:type==='polizei'||type==='polsuv'||!!o.cop,z:0,vz:0,siren:false,fire:0,dead:false,brake:false,
    rev:false,revT:0,stuck:0,backT:0,wait:0,pursuit:false,sink:0,cruise:rand(11,14.5),mode:'nav',los:false,losT:0,replan:0,exitCD:3,copsOut:0,
    lastHit:-99,smokeT:0,rearL:null,rearR:null,label:o.label||null,mission:!!o.mission,parked:!!o.parked,hornT:0,q:[],qi:0,tail:null,route:null,
    up:o.up||{eng:0,brk:0,arm:0,nitro:0},nitroT:0,bomb:false,copHitCD:0,hold:0};
  c.maxHp=t.hp*(c.up.arm?1.6:1);c.hp=c.maxHp;
  const hl=t.len/2-0.05,hw=t.wid/2-0.05;c.pts=[[hl,0],[-hl,0]];const nS=Math.max(4,Math.ceil(t.len/1.4));for(let i=0;i<=nS;i++){const u=-hl+2*hl*i/nS;c.pts.push([u,hw],[u,-hw])}
  return c;
}
function makePed(x,y,kind){
  return{x,y,a:rand(-Math.PI,Math.PI),vx:0,vy:0,kind,state:'walk',spd:kind==='cop'?5.6:rand(1.25,1.6),t:rand(0,4),anim:rand(0,6),
    shirt:kind==='cop'?'#22406f':kind==='player'?'#ff8a1c':pick(SHIRTS),hair:kind==='cop'?'#14223a':pick(HAIR),
    hp:kind==='cop'?140:100,deadT:0,downT:0,fleeT:0,fx:0,fy:0,fireCD:rand(0.6,1.5),home:null,alive:true,turnT:rand(2,6),lx:x,ly:y,wave:false,id:++carId};
}
const player=IH.player=Object.assign(makePed(0,0,'player'),{hp:100,armor:0,inCar:null,weapon:0,ammo:[Infinity,36,0,0,0,0,0,0],money:0,fireCD:0,arrestT:0,stun:0,hitFlash:0,punch:0,throwT:0,stam:1,breakIn:null});

/* ================= traffic lights ================= */
function lightState(n,ang){
  if(!n.light)return'g';
  const g=Math.abs(Math.cos(ang-n.light.axis))>0.707?0:1;
  const ph=(G.time+n.light.off)%30;
  if(g===0)return ph<12?'g':ph<15?'y':'r';
  return ph>=15&&ph<27?'g':ph>=27?'y':'r';
}

/* ================= lanes & queues ================= */
function laneOff(e,lane){return e.oneway?((lane+0.5)*e.w/e.lanes-e.w/2):(lane+0.5)*(e.w/2)/e.lanes}
function lanePt(e,fwd,lane,s){const d=fwd?e.F:e.B;const p=W.pointAt(d.pts,d.cum,s);const o=laneOff(e,lane);return{x:p.x-p.ty*o,y:p.y+p.tx*o,tx:p.tx,ty:p.ty}}
function pushLane(c,e,fwd,lane,s0,s1){
  for(let s=s0;s<s1;s+=3.2){const p=lanePt(e,fwd,lane,s);c.q.push({x:p.x,y:p.y})}
  const p=lanePt(e,fwd,lane,s1);const endNode=nodes[fwd?e.b:e.a];
  const it={x:p.x,y:p.y,tx:p.tx,ty:p.ty};
  if(endNode.light)it.stop={n:endNode,ang:fwd?e.dirB:e.dirA};
  c.q.push(it);
  c.tail={e,fwd,lane,n:endNode.id};
}
function startOnEdge(c,e,fwd,s,lane){
  c.q=[];c.qi=0;const L=e.len;const sEnd=L-(fwd?e.clearB:e.clearA);
  pushLane(c,e,fwd,lane===undefined?(e.lanes>1?Math.floor(Math.random()*e.lanes):0):lane,Math.min(s,sEnd-0.5),sEnd);
}
const allowedFrom=(e,nid)=>!e.oneway||e.a===nid;
function appendNext(c){
  const tl=c.tail;if(!tl)return false;const n=nodes[tl.n];
  let opts=n.edges.map(i=>edges[i]).filter(e=>allowedFrom(e,n.id)&&(e!==tl.e||n.deg===1));
  if(!opts.length)opts=n.edges.map(i=>edges[i]).filter(e=>allowedFrom(e,n.id));
  if(!opts.length)return false;
  let e=null;
  if(c.route&&c.route.length>1){const nx=c.route[1];e=opts.find(o=>(o.a===n.id?o.b:o.a)===nx)||null;if(e)c.route.shift();else c.route=null}
  if(!e){
    const inAng=Math.atan2(tl.fwd?tl.e.pts[tl.e.pts.length-1][1]-tl.e.pts[tl.e.pts.length-2][1]:tl.e.pts[0][1]-tl.e.pts[1][1],tl.fwd?tl.e.pts[tl.e.pts.length-1][0]-tl.e.pts[tl.e.pts.length-2][0]:tl.e.pts[0][0]-tl.e.pts[1][0]);
    let tot=0;const ws=opts.map(o=>{const out=o.a===n.id?o.dirA:o.dirB;const d=Math.abs(wrapA(out-inAng));const w=d<0.5?3:d<2.4?1:0.15;tot+=w;return w});
    let r=Math.random()*tot;for(let i=0;i<opts.length;i++){r-=ws[i];if(r<=0){e=opts[i];break}}e=e||opts[0];
  }
  const fwd=e.a===n.id;const lane=e.lanes>1?(c.cop?0:Math.floor(Math.random()*e.lanes)):0;
  const last=c.q[c.q.length-1];const s0=fwd?e.clearA:e.clearB;const sEnd=e.len-(fwd?e.clearB:e.clearA);
  const P2=lanePt(e,fwd,lane,Math.min(s0,sEnd-0.5));
  if(last){
    const t0x=last.tx||0,t0y=last.ty||0,t1x=P2.tx,t1y=P2.ty;
    const crs=t0x*t1y-t0y*t1x,dot=t0x*t1x+t0y*t1y;
    let cx,cy,curve=true;
    if(Math.abs(crs)<0.15){if(dot>0)curve=false;else{cx=n.x+t0x*(n.r+7);cy=n.y+t0y*(n.r+7)}}
    else{const dx=P2.x-last.x,dy=P2.y-last.y;let a=(dx*t1y-dy*t1x)/crs;a=clamp(a,0,40);cx=last.x+t0x*a;cy=last.y+t0y*a}
    if(curve){for(let k=1;k<6;k++){const t=k/6,u=1-t;c.q.push({x:u*u*last.x+2*u*t*cx+t*t*P2.x,y:u*u*last.y+2*u*t*cy+t*t*P2.y})}}
  }
  pushLane(c,e,fwd,lane,Math.min(s0,sEnd-0.5),sEnd);
  return true;
}
function queueAhead(c){let d=0;for(let i=c.qi;i<c.q.length-1;i++){d+=hypot(c.q[i+1].x-c.q[i].x,c.q[i+1].y-c.q[i].y);if(d>80)break}return d+(c.q[c.qi]?hypot(c.q[c.qi].x-c.x,c.q[c.qi].y-c.y):0)}
function followQueue(c){
  if(!c.q.length)return null;
  if(queueAhead(c)<60){if(!appendNext(c)&&c.qi>=c.q.length-1)return null}
  const fx=Math.cos(c.a),fy=Math.sin(c.a);
  while(c.qi<c.q.length-1){const p=c.q[c.qi];const dx=p.x-c.x,dy=p.y-c.y,d=hypot(dx,dy);if(d<3.2||(dx*fx+dy*fy<0&&d<9))c.qi++;else break}
  if(c.qi>60){c.q.splice(0,c.qi-5);c.qi=5}
  const look=4.5+Math.abs(c.vf)*0.42;
  let acc=0,px=c.x,py=c.y,tx=c.q[c.qi].x,ty=c.q[c.qi].y;
  for(let i=c.qi;i<c.q.length;i++){const p=c.q[i];acc+=hypot(p.x-px,p.y-py);px=p.x;py=p.y;tx=p.x;ty=p.y;if(acc>=look)break}
  // curvature and stop markers ahead
  let far=null,dist=0,stopD=null,stopIt=null;px=c.x;py=c.y;
  for(let i=c.qi;i<c.q.length&&dist<45;i++){const p=c.q[i];dist+=hypot(p.x-px,p.y-py);px=p.x;py=p.y;if(!far&&dist>=22)far=p;if(p.stop&&stopD===null){stopD=dist;stopIt=p}}
  let bend=0;if(far)bend=Math.abs(wrapA(Math.atan2(far.y-c.y,far.x-c.x)-c.a));
  return{tx,ty,bend,stopD,stopIt};
}

/* ================= A* ================= */
function astar(from,to){
  if(from===to)return[from];
  const N=nodes.length,gS=new Float64Array(N).fill(Infinity),came=new Int32Array(N).fill(-1),closed=new Uint8Array(N);
  const h=i=>hypot(nodes[i].x-nodes[to].x,nodes[i].y-nodes[to].y);
  const heap=[];const push=(i,f)=>{heap.push([f,i]);let k=heap.length-1;while(k>0){const p=(k-1)>>1;if(heap[p][0]<=heap[k][0])break;[heap[p],heap[k]]=[heap[k],heap[p]];k=p}};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let k=0;for(;;){const l=2*k+1,r=l+1;let m=k;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===k)break;[heap[m],heap[k]]=[heap[k],heap[m]];k=m}}return top};
  gS[from]=0;push(from,h(from));
  while(heap.length){const[,u]=pop();if(closed[u])continue;if(u===to)break;closed[u]=1;
    for(const ei of nodes[u].edges){const e=edges[ei];if(!allowedFrom(e,u))continue;const v=e.a===u?e.b:e.a;const g=gS[u]+e.len;if(g<gS[v]){gS[v]=g;came[v]=u;push(v,g+h(v))}}}
  if(came[to]<0)return null;const path=[to];let k=to;while(k!==from){k=came[k];path.push(k)}return path.reverse();
}
function nearestNodeTo(x,y){const ne=W.nearestEdge(x,y,80);if(!ne){let b=0,bd=1e18;for(const n of nodes){const d=(n.x-x)**2+(n.y-y)**2;if(d<bd){bd=d;b=n.id}}return b}const e=ne.e;return ne.s<e.len/2?e.a:e.b}
function snapToRoad(c,tx,ty){
  const ne=W.nearestEdge(c.x,c.y,60);if(!ne){c.q=[];return false}
  const e=ne.e;let fwd;
  if(tx!==undefined){
    const ca=nodes[e.a],cb=nodes[e.b];fwd=hypot(cb.x-tx,cb.y-ty)<hypot(ca.x-tx,ca.y-ty);
    if(e.oneway)fwd=true;
  }else{fwd=(Math.cos(c.a)*ne.tx+Math.sin(c.a)*ne.ty)>=0;if(e.oneway)fwd=true}
  const s=fwd?ne.s:e.len-ne.s;
  startOnEdge(c,e,fwd,s+3,c.cop?0:undefined);
  if(tx!==undefined){const p=astar(c.tail.n,nearestNodeTo(tx,ty));c.route=p}
  return true;
}

/* ================= physics ================= */
function carHitsWall(c,x,y,a){const ca=Math.cos(a),sa=Math.sin(a);for(const[u,v]of c.pts){if(solidCar(at(x+ca*u-sa*v,y+sa*u+ca*v)))return true}return false}
function driveCar(c,thr,steer,hb,dt,noRev){
  const t=c.t;const surf=at(c.x,c.y);const off=surf===TY.GRASS||surf===TY.PARK||surf===TY.BANK;
  const eng=c.up.eng?1.15:1,acc=t.acc*(c.up.eng?1.25:1);
  let max=t.max*eng*(off?(t.offroad||0.55):surf===TY.FIELD?0.8:1)*(c.hp<c.maxHp*0.3?0.78:1);
  let fx=Math.cos(c.a),fy=Math.sin(c.a);let vf=c.vx*fx+c.vy*fy;const sp=Math.abs(vf);
  const turn=steer*t.turn*Math.min(1,sp/6)*Math.max(0.55,1-sp/100)*(vf>=0?1:-1)*(hb?1.3:1);
  const na=c.a+turn*dt;if(!carHitsWall(c,c.x,c.y,na)){c.a=na;c.av=turn}else c.av=0;
  fx=Math.cos(c.a);fy=Math.sin(c.a);const rx=-fy,ry=fx;
  vf=c.vx*fx+c.vy*fy;let vl=c.vx*rx+c.vy*ry;
  const wet=(IH.env&&IH.env.rain)||0;const brk=16*(c.up.brk?1.45:1)*(1-0.22*wet);
  c.brake=false;c.rev=false;
  if(thr>0){if(vf<-0.4){vf=Math.min(0,vf+brk*thr*dt);c.brake=true}else vf+=acc*thr*dt*Math.max(0,1-vf/max)}
  else if(thr<0){if(vf>0.4){vf=Math.max(0,vf+brk*thr*dt);c.brake=true}else if(!noRev){vf+=acc*0.6*thr*dt*Math.max(0,1+vf/(max*0.3));c.rev=true}else{vf*=Math.exp(-6*dt);c.brake=true}}
  else vf*=Math.exp(-0.45*dt);
  if(c.nitroT>0){c.nitroT-=dt;vf+=acc*1.3*dt*Math.max(0,1-vf/(max*1.3))}
  vf-=Math.sign(vf)*Math.min(Math.abs(vf),(off?(t.offroad?2.5:6):1.5)*dt);
  if(hb){vf*=Math.exp(-1.1*dt);c.brake=true}
  vl*=Math.exp(-(hb?1.7:off?3.2:8.5*(1-0.38*wet))*dt);
  c.vx=fx*vf+rx*vl;c.vy=fy*vf+ry*vl;c.vf=vf;c.vl=vl;
}
function moveCar(c,dt){
  const nx=c.x+c.vx*dt,ny=c.y+c.vy*dt;
  if(!carHitsWall(c,nx,ny,c.a)){c.x=nx;c.y=ny;return}
  let hx=false,hy=false;
  if(!carHitsWall(c,nx,c.y,c.a)){c.x=nx;hy=true}else if(!carHitsWall(c,c.x,ny,c.a)){c.y=ny;hx=true}else{hx=hy=true}
  let imp=0;if(hx){imp+=Math.abs(c.vx);c.vx*=-0.25}if(hy){imp+=Math.abs(c.vy);c.vy*=-0.25}
  if(imp>7.5){
    damageCar(c,(imp-7.5)*1.25,c.driver==='player');
    sfx('crash',Math.min(1,imp/30),c.x,c.y);for(let i=0;i<5;i++)spark(c.x+Math.cos(c.a)*c.t.len/2,c.y+Math.sin(c.a)*c.t.len/2,0.6);
    if(c===player.inCar)emit('shake',Math.min(1,imp/25));
    if(c===player.inCar&&c.t.bike&&imp>8)c.eject=imp;
  }
}
function ejectRider(c,imp){
  if(player.inCar!==c)return;player.inCar=null;c.driver=null;c.eject=0;const fx=Math.cos(c.a),fy=Math.sin(c.a);
  let x=c.x+fx*1.6,y=c.y+fy*1.6;if(pedBlocked(x,y,false)){x=c.x;y=c.y}player.x=player.lx=x;player.y=player.ly=y;player.vx=c.vx*0.5;player.vy=c.vy*0.5;player.stun=1.2;
  emit('carchange');emit('toast','Abgeworfen!');sfx('punch',1,x,y);hurtPlayer(Math.min(60,imp*1.6),'car');c.vx*=0.3;c.vy*=0.3;
  if(mission.active&&mission.data.veh===c)mission.fail('Schicht beendet.',true);
}
function pointInCar(c,x,y,m){const dx=x-c.x,dy=y-c.y,ca=Math.cos(c.a),sa=Math.sin(c.a);const u=dx*ca+dy*sa,v=-dx*sa+dy*ca;m=m||0;return Math.abs(u)<c.t.len/2+m&&Math.abs(v)<c.t.wid/2+m}
function carCircles(c){const o=Math.max(0,c.t.len/2-c.t.wid/2),ca=Math.cos(c.a),sa=Math.sin(c.a);const n=Math.max(2,Math.ceil(2*o/(c.t.wid*0.8))+1);const out=[];for(let i=0;i<n;i++){const u=-o+2*o*i/(n-1);out.push([c.x+ca*u,c.y+sa*u])}return out}

/* ================= particles ================= */
function addPart(p){if(parts.length>900)parts.splice(0,50);parts.push(p)}
function blood(x,y){for(let i=0;i<5;i++)addPart({k:'deb',x,y,z:1.1,vx:rand(-3,3),vy:rand(-3,3),vz:rand(0.5,2.5),life:0.5,max:0.5,size:0.12,grav:1,col:'#8a1414'})}
function spark(x,y,z){addPart({k:'spark',x,y,z:z||0.6,vx:rand(-14,14),vy:rand(-14,14),vz:rand(1,6),life:0.3,max:0.3,size:0.12})}
function smoke(x,y,z,dark,big){addPart({k:dark?'smokeD':'smoke',x:x+rand(-0.4,0.4),y:y+rand(-0.4,0.4),z,vx:rand(-0.6,0.6)+0.6,vy:rand(-0.6,0.6),vz:rand(1.2,2.4),life:big?2.6:1.5,max:big?2.6:1.5,size:big?1.6:0.7,grow:big?2.2:1.2})}
function fire(x,y,z){addPart({k:'fire',x:x+rand(-0.6,0.6),y:y+rand(-0.6,0.6),z:z+rand(0,0.5),vx:rand(-0.6,0.6),vy:rand(-0.6,0.6),vz:rand(1.5,3.5),life:0.45,max:0.45,size:rand(0.6,1),grow:-0.8})}
function water(x,y,z,up){const a=rand(0,Math.PI*2),s=rand(0.5,2.5);addPart({k:'drop',x,y,z:z||0.4,vx:Math.cos(a)*s,vy:Math.sin(a)*s,vz:up?rand(4,8):rand(1,4),life:0.9,max:0.9,size:0.13,grav:1})}
function debris(x,y,col){addPart({k:'deb',x,y,z:0.8,vx:rand(-12,12),vy:rand(-12,12),vz:rand(3,10),life:rand(0.6,1.1),max:1.1,size:0.25,grav:1,col})}
function explosion(x,y,byPlayer,att){
  addPart({k:'boom',x,y,z:1.2,vx:0,vy:0,vz:1,life:0.6,max:0.6,size:2,grow:14});
  addPart({k:'flash',x,y,z:1.5,vx:0,vy:0,vz:0,life:0.15,max:0.15,size:9});
  for(let i=0;i<22;i++)debris(x,y,pick(['#333','#555','#7a2a1a','#222']));
  for(let i=0;i<14;i++)smoke(x+rand(-2,2),y+rand(-2,2),rand(0.5,2.5),true,true);
  for(let i=0;i<18;i++)fire(x+rand(-1.5,1.5),y+rand(-1.5,1.5),rand(0,1.5));
  if(decals.length>40)decals.shift();decals.push({x,y,r:rand(2.6,3.4),a:rand(0,6)});
  emit('shake',hypot(x-player.x,y-player.y)<40?1:0.3);sfx('boom',1,x,y);
  const RAD=8.5;
  for(const c of cars){if(c.dead||c.sink)continue;const d=hypot(c.x-x,c.y-y);if(d<RAD){const f=1-d/RAD;c.vx+=(c.x-x)/(d+0.1)*24*f;c.vy+=(c.y-y)/(d+0.1)*24*f;damageCar(c,85*f,byPlayer)}}
  for(const p of peds){const d=hypot(p.x-x,p.y-y);if(d<RAD+1.5)knock(p,(p.x-x)/(d+0.1)*20,(p.y-y)/(d+0.1)*20,byPlayer?'weapon':null,220*(1-d/(RAD+1.5))+20)}
  if(onFoot()&&G.state==='play'){const d=hypot(player.x-x,player.y-y);if(d<RAD+1&&!(att&&inSafeZone()))hurtPlayer(95*(1-d/(RAD+1)),'boom',att)}
  for(const p of W.propsNear(x,y,RAD))if(!p.broken&&p.k!=='tree'&&hypot(p.x-x,p.y-y)<RAD*0.8)breakProp(p,byPlayer,p.x-x,p.y-y);
  for(const p of peds)if(p.kind==='civ'&&!isDown(p)&&hypot(p.x-x,p.y-y)<45){p.state='flee';p.fleeT=rand(4,7);p.fx=x;p.fy=y}
}

/* ================= damage / offences ================= */
// who saw it? cops see 45 m, civilians 22 m (with a clear line of sight); unseen crimes go unpunished
function witness(x,y,victim){
  if(x===undefined)return'cop';
  for(const p of peds){if(p===victim||isDown(p)||p.kind==='player')continue;const r=p.kind==='cop'?45:22;if(Math.abs(p.x-x)>r||Math.abs(p.y-y)>r)continue;if(hypot(p.x-x,p.y-y)<r&&hasLOS(p.x,p.y,x,y))return p.kind==='cop'?'cop':'civ'}
  for(const c of activeCars){if(!c.cop||c.dead||c===player.inCar)continue;if(hypot(c.x-x,c.y-y)<50&&hasLOS(c.x,c.y,x,y))return'cop'}
  if(heli.on&&hypot(heli.x-x,heli.y-y)<60)return'cop';
  return null;
}
// heat grows slowly: one star = 1.0; caps per offence so that a short rampage stays at 2–3 stars
function offense(kind,amount,x,y,victim){
  if(G.state!=='play')return;const before=stars();
  if(kind!=='copcrash'&&kind!=='alarm'){const w=witness(x,y,victim);if(!w)return;if(w==='civ'&&before===0){G.callT=G.callT>0?G.callT:rand(3,6);G.callHeat=Math.max(G.callHeat||0,kind==='carhit'?1.05:1.1);G.callWhy=kind;G.viol+=amount||0;return}}
  // escalation budget: refills ~1 star per 22 s, so even a rampage needs well over a minute to reach 5 stars
  const room=Math.min(1.2,(G.heatRoom??0.6)+(G.time-(G.roomT??G.time))/22);G.roomT=G.time;
  const raise=v=>{const inc=Math.min(v,room);G.heatRoom=room-inc;G.heat=Math.min(5.99,G.heat+inc)};
  if(before===0)G.heatRoom=Math.min(room,0.3);
  if(kind==='copcrash'){if(before===0)G.heat=1.05;else raise(0.25)}
  else if(kind==='carhit'){if(before===0)G.heat=1.05;else raise(0.3)}
  else if(kind==='alarm'){if(before===0&&Math.random()<0.6)G.heat=1.05}
  else if(kind==='weapon'){G.viol+=amount;if(before===0){if(G.viol>=1.4)G.heat=1.05}else raise(0.14*amount)}
  if(stars()>before)G.heatT=G.time;
  if(stars()>before){G.lastSeen=0;if(before===0)emit('toast',kind==='alarm'?'Die Polizei hat den Autoalarm gehört':kind==='copcrash'?'Polizeiauto gerammt – du wirst gesucht':kind==='carhit'?'Fußgänger angefahren – du wirst gesucht':'Zu viel Gewalt – die Polizei ist alarmiert')}
}
function damageCar(c,amt,byPlayer){
  if(c.dead||amt<=0)return;c.hp-=amt;
  if(byPlayer)c.lastHit=G.time;
  if(c.hp<=0)explodeCar(c);else if(c.hp<c.maxHp*0.16&&!c.fire)c.fire=rand(3,4.5);
}
function explodeCar(c){
  if(c.dead)return;c.dead=true;c.hp=0;c.fire=0;c.siren=false;
  const byPlayer=G.time-c.lastHit<6||c.driver==='player';
  if(c.driver==='player'){if(G.state==='play')wasted('Das Auto ist explodiert.')}
  else if(c.driver&&c.driver!=='player'&&Math.random()<0.75){const p=makePed(c.x+rand(-1,1),c.y+rand(-1,1),c.cop?'cop':'civ');p.state='dead';p.hp=0;p.deadT=0;peds.push(p);if(byPlayer)offense('weapon',c.cop?3:1.5,c.x,c.y,p)}
  if(c.driver==='player')emit('net','boom',{x:+c.x.toFixed(1),y:+c.y.toFixed(1),a:+c.a.toFixed(2),k:Math.max(0,['kompakt','limousine','sport','taxi','transporter','polizei','motorrad','suv','super','bus','bierlaster','krankenwagen','feuerwehr','polsuv','cessna','regio','jet'].indexOf(c.type)),c:c.color});
  c.driver=null;c.vx*=0.3;c.vy*=0.3;
  explosion(c.x,c.y,byPlayer);
  if(byPlayer&&G.state==='play'){addMoney(c.cop?300:120,c.x,c.y);mission.onEvent('carboom',c)}
  if(mission.active&&mission.data.car===c&&!mission.data.bombOK)mission.fail('Der Wagen ist hinüber.');
}
function knock(p,vx,vy,cause,dmg){
  if(p.kind==='player'||p.state==='dead'||p.patient)return;
  const was=p.state;p.hp-=dmg===undefined?25:dmg;p.vx=vx;p.vy=vy;
  if(p.hp<=0){p.state='dead';p.deadT=0;p.wave=false;blood(p.x,p.y);if(p.home){p.home.copsOut=Math.max(0,(p.home.copsOut||1)-1)}}
  else{if(was==='down')return;p.state='down';p.downT=p.kind==='cop'?2.6:rand(2.2,3.2)}
  if(cause==='car')offense('carhit',1,p.x,p.y,p);else if(cause==='weapon')offense('weapon',p.kind==='cop'?(p.state==='dead'?3:2):(p.state==='dead'?1.5:0.7),p.x,p.y,p);
}
function breakProp(p,byPlayer,dx,dy){
  if(p.broken||p.k==='tree')return;p.broken=true;p.fall=Math.atan2(dy||rand(-1,1),dx||rand(-1,1));emit('prop',p);
  if(p.k==='hydrant'){p.spray=9;sfx('splash',0.6,p.x,p.y)}
  for(let i=0;i<6;i++)debris(p.x,p.y,p.k==='bin'?'#5f7b68':p.k==='hydrant'?'#b8262b':'#4b5058');
  if(byPlayer&&G.state==='play'){addMoney(p.k==='hydrant'?30:p.k==='lamp'?20:8,p.x,p.y);mission.onEvent('prop')}
}
function hurtPlayer(v,why,att){
  if(G.state!=='play')return;
  if(att){player.lastAtt=att;player.lastAttT=G.time}
  v*=why==='cop'?0.5:why==='boom'?0.75:why==='car'?0.7:0.85;player.hurtT=G.time;
  if(player.armor>0){const a=Math.min(player.armor,v*0.7);player.armor-=a;v-=a}
  player.hp-=v;player.hitFlash=0.25;emit('hurt',v);
  if(player.hp<=0){player.hp=0;wasted(why==='boom'?'Zu nah an der Explosion.':why==='cop'?'Die Polizei hat scharf geschossen.':why==='pvp'?'Von einem anderen Spieler erwischt.':'Überfahren.')}
}
function addMoney(v,x,y){player.money=Math.max(0,player.money+v);if(v>0&&x!==undefined)floaters.push({x,y,t:1.4,txt:'+$'+v,c:'#3ddc84'});if(player.money>G.best)G.best=player.money}

/* ================= spawning ================= */
function carNear(x,y,r){for(const c of cars)if(Math.abs(c.x-x)<r&&Math.abs(c.y-y)<r)return c;return null}
const TRAFFIC_MIX=['kompakt','kompakt','kompakt','limousine','limousine','limousine','taxi','transporter','sport','suv','suv','motorrad','motorrad','kompakt','limousine','suv','bus','bierlaster'];
function spawnTraffic(cop,cx,cy,rmin,rmax){
  const f=focus();cx=cx??f.x;cy=cy??f.y;rmin=rmin||130;rmax=rmax||260;
  for(let tries=0;tries<16;tries++){
    const a=rand(0,Math.PI*2),d=rand(rmin,rmax);const ne=W.nearestEdge(cx+Math.cos(a)*d,cy+Math.sin(a)*d,40);if(!ne)continue;
    const e=ne.e;if(e.bridge&&Math.random()<0.5)continue;
    const fwd=e.oneway?true:Math.random()<0.5;let s=fwd?ne.s:e.len-ne.s;
    const sEnd=e.len-(fwd?e.clearB:e.clearA),sStart=fwd?e.clearA:e.clearB;if(s<sStart+2||s>sEnd-6)continue;
    const lane=e.lanes>1?Math.floor(Math.random()*e.lanes):0;const p=lanePt(e,fwd,lane,s);
    if(hypot(p.x-player.x,p.y-player.y)<rmin*0.8&&G.state!=='menu')continue;
    if(carNear(p.x,p.y,9))continue;
    const type=cop?(stars()>=5&&Math.random()<0.35?'transporter':stars()>=3&&Math.random()<0.45?'polsuv':'polizei'):pick(TRAFFIC_MIX);
    if(!cop&&(type==='bus'||type==='bierlaster')&&(e.lanes<2&&e.w<9))continue;
    const c=makeCar(type,p.x,p.y,Math.atan2(p.ty,p.tx),{driver:'ai',cop});
    if(cop&&type==='transporter'){c.color='#22324f';c.label='SEK';c.maxHp=c.hp=220}
    startOnEdge(c,e,fwd,s,lane);
    const sp=c.cruise*0.8;c.vx=Math.cos(c.a)*sp;c.vy=Math.sin(c.a)*sp;
    cars.push(c);return c;
  }
  return null;
}
function fillLots(all){
  const f=focus();
  for(const lot of W.lots){
    const d=hypot(lot.cx-f.x,lot.cy-f.y);
    for(const s of lot.slots){
      if(s.car&&(!cars.includes(s.car)||s.car.dead||hypot(s.car.x-s.x,s.car.y-s.y)>4))s.car=null;
      if(d>300){if(s.car&&s.car.parked&&!s.car.mission&&!s.car.saved){const i=cars.indexOf(s.car);if(i>=0)cars.splice(i,1);s.car=null}continue}
      if(!all&&d<120)continue;
      if(!s.car&&!s.reserved&&!s.depot&&Math.random()<(all?0.5:0.06)&&!carNear(s.x,s.y,2.4)){
        const r=Math.random();const c=makeCar(r<0.03?'super':pick(['kompakt','kompakt','limousine','limousine','sport','transporter','taxi','suv','suv','motorrad']),s.x,s.y,s.a+(Math.random()<0.5?Math.PI:0),{parked:true});
        cars.push(c);s.car=c;
      }
    }
  }
}
function walkPointNear(cx,cy,rmin,rmax){for(let i=0;i<20;i++){const a=rand(0,Math.PI*2),d=rand(rmin,rmax);const x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d;const t=at(x,y);if(W.airside[Math.floor(y)*W.MAP+Math.floor(x)])continue;if(t===TY.WALK||t===TY.PLAZA||(t===TY.PARK&&Math.random()<0.25))return{x:Math.floor(x)+0.5,y:Math.floor(y)+0.5}}return null}

/* ================= peds ================= */
function pedBlocked(x,y,civ){
  for(const[ox,oy]of[[0.3,0],[-0.3,0],[0,0.3],[0,-0.3]]){const t=at(x+ox,y+oy);if(solidPed(t))return true;if(civ&&!civOK(t)&&!(t===TY.ROAD&&W.cross[Math.floor(y+oy)*W.MAP+Math.floor(x+ox)]))return true}
  for(const p of W.propsNear(x,y,1.5))if(!p.broken&&(p.k==='tree'||p.k==='lamp'||p.k==='hydrant'||p.k==='bin'||p.deco)&&hypot(p.x-x,p.y-y)<p.r+0.32)return true;
  return false;
}
function isDown(p){return p.state==='down'||p.state==='dead'}
function movePed(p,dx,dy,civ){let m=false;if(!pedBlocked(p.x+dx,p.y,civ)){p.x+=dx;m=true}if(!pedBlocked(p.x,p.y+dy,civ)){p.y+=dy;m=true}return m}
function slide(p,dx,dy){if(!movePed(p,dx,dy,false)){const s=hypot(dx,dy);if(!movePed(p,Math.sign(dx||1)*s,0,false))movePed(p,0,Math.sign(dy||1)*s,false)}}
function civSteer(p,dt){
  // walk with a heading; turn away from anything that is not pavement
  const look=1.4;
  const ok=a=>{const x=p.x+Math.cos(a)*look,y=p.y+Math.sin(a)*look;const t=at(x,y);if(W.airside[Math.floor(y)*W.MAP+Math.floor(x)]&&!W.airside[Math.floor(p.y)*W.MAP+Math.floor(p.x)])return false;if(!civOK(t)&&!(t===TY.ROAD&&W.cross[Math.floor(y)*W.MAP+Math.floor(x)]))return false;return!pedBlocked(x,y,true)};
  p.turnT-=dt;if(p.turnT<=0){p.turnT=rand(3,8);p.h=(p.h??p.a)+rand(-0.9,0.9)}
  let h=p.h??p.a;
  if(!ok(h)){let found=false;for(const d of[0.5,-0.5,1,-1,1.6,-1.6,2.3,-2.3,Math.PI]){const s=Math.random()<0.5?1:-1;if(ok(h+d*s)){h+=d*s;found=true;break}}if(!found)h+=Math.PI}
  p.h=h;
  if(!movePed(p,Math.cos(h)*p.spd*dt,Math.sin(h)*p.spd*dt,true))p.h=h+rand(1,3);
}
function updatePed(p,dt){
  p.t+=dt;
  if(p.state==='dead'){p.vx*=Math.exp(-5*dt);p.vy*=Math.exp(-5*dt);movePed(p,p.vx*dt,p.vy*dt,false);p.deadT+=dt;const far=hypot(p.x-player.x,p.y-player.y);if(p.deadT>75||(p.deadT>20&&far>55)||(p.deadT>8&&far>110))p.alive=false;return}
  if(isDown(p)){p.vx*=Math.exp(-5*dt);p.vy*=Math.exp(-5*dt);movePed(p,p.vx*dt,p.vy*dt,false);p.downT-=dt;if(p.downT<=0){p.state=p.kind==='cop'?'chase':'flee';p.fleeT=rand(4,7);p.fx=p.x-p.vx;p.fy=p.y-p.vy}return}
  if(p.kind==='civ'){
    if(p.state==='flee'){p.fleeT-=dt;if(p.fleeT<=0)p.state='walk';const dx=p.x-p.fx,dy=p.y-p.fy,d=hypot(dx,dy)||1;if(!movePed(p,dx/d*4.6*dt,dy/d*4.6*dt,false)){p.fx=p.x+rand(-5,5);p.fy=p.y+rand(-5,5)}}
    else if(p.state==='walk')civSteer(p,dt);
    else if(p.state==='wave'){if(!p.patient)p.a=Math.atan2((player.y-p.y),(player.x-p.x))}
    else if(p.state==='idle'){p.idleT-=dt;if(p.idleT<=0){p.idleT=rand(2,7);p.a=p.face+rand(-0.7,0.7)}}
    else if(p.state==='board'&&p.target){const c=p.target,dx=c.x-p.x,dy=c.y-p.y,d=hypot(dx,dy);p.boardT=(p.boardT||0)+dt;
      // reaching the car's side is enough (the body itself blocks the way to its centre); give up walking after a while and just get in
      if(d<1.2||pointInCar(c,p.x,p.y,1.0)||p.boardT>6){p.alive=false;p.boarded=true;sfx('door',0.7,c.x,c.y)}else slide(p,dx/d*3.4*dt,dy/d*3.4*dt)}
  }else if(p.kind==='cop')copPedAI(p,dt);
  const sp=hypot(p.x-p.lx,p.y-p.ly)/Math.max(dt,1e-4);
  const ss=(p.spdNow||0)+(Math.min(sp,12)-(p.spdNow||0))*Math.min(1,dt*7);
  if(sp>0.2){p.a=Math.atan2(p.y-p.ly,p.x-p.lx)}if(ss>0.2)p.anim+=dt*gaitW(ss);
  p.lx=p.x;p.ly=p.y;p.spdNow=ss;
}
function copPedAI(p,dt){
  const tgt=player.inCar||player;const dx=tgt.x-p.x,dy=tgt.y-p.y,d=hypot(dx,dy)||1;
  if(p.home&&(p.home.dead||p.home.driver==='player'||!cars.includes(p.home)))p.home=null;
  if(stars()===0||G.state!=='play'){
    if(p.home){goHome(p,dt)}else{const fd=hypot(p.x-player.x,p.y-player.y);if(fd>60)p.alive=false;else civSteer(p,dt)}return}
  if(p.home&&d>34){goHome(p,dt);return}
  const reach=player.inCar?player.inCar.t.wid/2+1.4:1.2;
  if(d>reach-0.2)slide(p,dx/d*p.spd*dt,dy/d*p.spd*dt);
  p.fireCD-=dt;
  if(stars()>=3&&d<28&&d>3&&p.fireCD<=0&&hasLOS(p.x,p.y,tgt.x,tgt.y)){p.fireCD=rand(0.8,1.4);const a=Math.atan2(dy,dx)+rand(-0.13,0.13);p.a=a;fireBullet(p.x+Math.cos(a)*0.8,p.y+Math.sin(a)*0.8,a,'cop',8,p);sfx('shot',0.55,p.x,p.y)}
  if(hasLOS(p.x,p.y,tgt.x,tgt.y)&&d<35)G.seenNow=true;
  const sp=player.inCar?hypot(player.inCar.vx,player.inCar.vy):hypot(player.vx,player.vy);
  if(d<reach+0.3&&sp<(player.inCar?2.5:3))player.arrestT+=dt*(player.inCar?0.7:1.2),G.arrestNow=true;
}
function goHome(p,dt){const h=p.home;const dx=h.x-p.x,dy=h.y-p.y,d=hypot(dx,dy)||1;if(d<2.2){p.alive=false;h.copsOut--;if(h.copsOut<=0&&h.driver==='copIdle'){h.driver=stars()>0?'cop':'ai';h.exitCD=6;if(stars()===0){h.pursuit=false;h.siren=false;snapToRoad(h)}}return}slide(p,dx/d*p.spd*dt,dy/d*p.spd*dt)}

/* ================= bullets & grenades ================= */
function fireBullet(x,y,a,owner,dmg,src,life){bullets.push({x,y,vx:Math.cos(a)*260,vy:Math.sin(a)*260,life:life||0.35,owner,dmg,src});addPart({k:'flash',x,y,z:1.2,vx:0,vy:0,vz:0,life:0.05,max:0.05,size:0.9})}
const fires=[];
function createFire(x,y,att){fires.push({x,y,t:5.5,att,pt:0});sfx('boom',0.35,x,y);for(const p of peds)if(p.kind==='civ'&&hypot(p.x-x,p.y-y)<25&&!isDown(p)){p.state='flee';p.fleeT=rand(3,6);p.fx=x;p.fy=y}}
function fireTick(dt){
  for(let i=fires.length-1;i>=0;i--){const f=fires[i];f.t-=dt;if(f.t<=0){fires.splice(i,1);continue}f.pt-=dt;if(f.pt<=0){f.pt=0.05;for(let k=0;k<2;k++)fire(f.x+rand(-2.2,2.2),f.y+rand(-2.2,2.2),0);if(Math.random()<0.3)smoke(f.x+rand(-1.5,1.5),f.y+rand(-1.5,1.5),1.5,true)}
    for(const p of peds)if(!isDown(p)&&hypot(p.x-f.x,p.y-f.y)<2.8)knock(p,rand(-2,2),rand(-2,2),f.att?null:'weapon',45);
    for(const c of activeCars)if(!c.dead&&!c.sink&&hypot(c.x-f.x,c.y-f.y)<3.4){damageCar(c,22*dt,!f.att);if(c.hp<c.maxHp*0.3&&!c.fire)c.fire=rand(3,4.5)}
    if(onFoot()&&G.state==='play'&&hypot(player.x-f.x,player.y-f.y)<2.6)hurtPlayer(18*dt,'boom',f.att)}
}
function crowdTick(f){
  for(const cr of W.crowds){if(hypot(cr.x-f.x,cr.y-f.y)>150)continue;let n=0;for(const p of peds)if(p.crowd===cr)n++;
    if(n<cr.n&&Math.random()<0.4){for(let k=0;k<6;k++){const a=rand(0,Math.PI*2),d=rand(1,cr.r);const x=cr.x+Math.cos(a)*d,y=cr.y+Math.sin(a)*d;if(pedBlocked(x,y,true))continue;const p=makePed(x,y,'civ');p.state='idle';p.crowd=cr;p.face=cr.face;p.a=cr.face+rand(-0.7,0.7);p.idleT=rand(1,6);peds.push(p);break}}}
}
// stride frequency: ~0.8 Hz when walking, ~1.4 Hz when running (one stride = two steps)
function gaitW(sp){return 6.2832*(0.62+0.13*Math.min(sp,9))}
const heli=IH.heli={on:false,x:0,y:0,z:42,a:0,vx:0,vy:0,hp:220,cool:0,fireCD:3,leaving:0};
function heliDown(){heli.on=false;heli.cool=45;explosion(heli.x,heli.y,true);addMoney(1500,heli.x,heli.y);G.heat=Math.min(5.99,G.heat+0.6);emit('banner','Hubschrauber abgeschossen!','+$1.500 – jetzt wird’s ernst','#ffc61a')}
/* ================= airport traffic (same schedule for every player: driven by the wall clock) ================= */
const planes=[{type:'narrow',liv:'isar',vis:false,x:0,y:0,z:0,a:0},{type:'wide',liv:'alpen',vis:false,x:0,y:0,z:0,a:0},{type:'regio',liv:'bavaria',vis:false,x:0,y:0,z:0,a:0}];
// keyframes [t, x, y, z, ease]; ease: 0 linear, 1 accelerate, 2 decelerate
const FLIGHTS=[
  // departure on 26L: taxi from the apron, roll west, climb hard and turn north well before the city
  {p:0,per:120,off:0,kf:[[0,1760,292,0],[14,1760,348,0],[20,1780,360,0],[48,1906,360,0],[54,1924,368,0],[60,1932,380,0],[64,1922,380,0],[72,1690,380,0,1],[74,1600,380,14],[78,1430,372,62],[83,1340,292,104],[88,1305,150,140],[94,1300,-150,190],[95,1300,-260,200]]},
  // arrival on 26R from the east (never over the city), taxi to the apron
  {p:1,per:120,off:58,kf:[[0,2850,80,180],[13,2000,80,26],[15.5,1875,80,0],[23,1655,80,0,2],[28,1646,94,0],[32,1662,100,0],[52,1750,100,0],[57,1760,122,0],[72,1760,196,0],[119,1760,197,0]]},
  {p:2,per:150,off:30,kf:[[0,1827,140,0],[6,1827,106,0],[10,1840,100,0],[24,1916,100,0],[28,1926,90,0],[31,1918,80,0],[38,1690,80,0,1],[42,1560,80,25],[47,1430,30,80],[53,1390,-130,140],[54,1390,-220,150]]},
];
function kfAt(kf,t){if(t<kf[0][0]||t>kf[kf.length-1][0])return null;for(let i=0;i<kf.length-1;i++){const a=kf[i],b=kf[i+1];if(t<=b[0]){let u=(t-a[0])/Math.max(1e-3,b[0]-a[0]);const e=b[4];if(e===1)u=u*u;else if(e===2)u=1-(1-u)*(1-u);return[a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u,a[3]+(b[3]-a[3])*u]}}return null}
function planeTick(dt){
  const now=Date.now()/1000;
  for(const F of FLIGHTS){const pl=planes[F.p];const t=((now-F.off)%F.per+F.per)%F.per;const p=kfAt(F.kf,t);if(!p){pl.vis=false;continue}
    const q=kfAt(F.kf,Math.min(t+0.4,F.kf[F.kf.length-1][0]))||p,q0=kfAt(F.kf,Math.max(t-0.4,0))||p;
    const dx=q[0]-q0[0],dy=q[1]-q0[1],dz=q[2]-q0[2],hv=Math.hypot(dx,dy);
    const na=hv>0.05?Math.atan2(dy,dx):pl.a;const da=wrapA(na-pl.a);pl.roll=clamp(-da/Math.max(dt,1e-3)*0.04,-0.4,0.4)*(p[2]>3?1:0.15);
    pl.a=na;pl.vis=true;pl.x=p[0];pl.y=p[1];pl.z=p[2];pl.pitch=hv>0.05?clamp(Math.atan2(dz,hv),-0.12,0.3):0;pl.spd=hv/0.8;
    if(pl.z<0.5&&p[0]<1600)pl.pitch=0;
    // anyone on the tarmac in its way gets hit
    if(pl.z<3&&G.state==='play'){const len=pl.type==='wide'?32:pl.type==='regio'?14:19,c=Math.cos(pl.a),s2=Math.sin(pl.a);
      const hit=(x,y,rad)=>{const rx=x-pl.x,ry=y-pl.y,u=rx*c+ry*s2,v=-rx*s2+ry*c;return Math.abs(u)<len&&Math.abs(v)<rad};
      if(player.inCar){const cc=player.inCar;if(hit(cc.x,cc.y,3.4)&&pl.spd>1.5){cc.vx+=c*pl.spd*0.6-s2*6;cc.vy+=s2*pl.spd*0.6+c*6;damageCar(cc,pl.spd>12?120:40*dt*10,false);sfx('crash',1,cc.x,cc.y)}}
      else if(hit(player.x,player.y,3)&&pl.spd>1.5&&player.stun<=0){hurtPlayer(pl.spd>12?200:45,'car');player.stun=1;player.vx=-s2*7;player.vy=c*7}}}
}
function heliTick(dt){
  const s=stars();heli.cool-=dt;
  if(heli.on){
    if(s<4||G.state!=='play'){heli.leaving+=dt;heli.x+=Math.cos(heli.a)*30*dt;heli.y+=Math.sin(heli.a)*30*dt;if(heli.leaving>9)heli.on=false;return}
    heli.leaving=0;const tgt=player.inCar||player;const tx=tgt.x+(tgt.vx||0)*1.2,ty=tgt.y+(tgt.vy||0)*1.2;const dx=tx-heli.x,dy=ty-heli.y,d=hypot(dx,dy);
    const want=Math.min(34,d*0.8),k=1-Math.exp(-1.3*dt);heli.vx+=(dx/(d||1)*want-heli.vx)*k;heli.vy+=(dy/(d||1)*want-heli.vy)*k;heli.x+=heli.vx*dt;heli.y+=heli.vy*dt;
    if(hypot(heli.vx,heli.vy)>2)heli.a=Math.atan2(heli.vy,heli.vx);heli.z=42+Math.sin(G.time*0.7)*2;
    const pd=hypot(tgt.x-heli.x,tgt.y-heli.y);if(pd<55&&!inSafeZone())G.seenNow=true;
    if(s>=5){heli.fireCD-=dt;if(heli.fireCD<=0&&pd<50&&G.state==='play'){heli.fireCD=2.4;for(let i=0;i<4;i++){const a=Math.atan2(tgt.y-heli.y,tgt.x-heli.x)+rand(-0.07,0.07);fireBullet(heli.x,heli.y,a,'cop',7,null,0.45)}sfx('mp',0.8,heli.x,heli.y)}}
    return}
  if(s>=4&&G.state==='play'&&heli.cool<=0){const a=rand(0,Math.PI*2);heli.x=player.x+Math.cos(a)*260;heli.y=player.y+Math.sin(a)*260;heli.vx=heli.vy=0;heli.hp=220;heli.on=true;heli.leaving=0;heli.fireCD=3;heli.a=a+Math.PI;emit('toast','Polizeihubschrauber im Anflug!')}
}
let depotT=0;
function depotTick(dt){
  depotT-=dt;if(depotT>0)return;depotT=4;
  for(const z of W.zones){const type={klinik:'krankenwagen',feuerwache:'feuerwehr',depot:'bus',brauerei:'bierlaster'}[z.kind];if(!type)continue;
    if(hypot(player.x-z.x,player.y-z.y)<110)continue;
    const spots=z.kind==='klinik'?z.lot.slots.map(sl=>({x:sl.x,y:sl.y,a:sl.a})):[{x:z.lot.cx,y:z.lot.cy,a:Math.atan2(z.lot.ty,z.lot.tx)}];
    z.vehs=z.vehs||[];
    spots.forEach((sp,i)=>{const v=z.vehs[i];if(v&&cars.includes(v)&&!v.dead&&(v.driver===null||v.driver==='player')&&hypot(v.x-sp.x,v.y-sp.y)<300)return;if(v&&v.driver==='player')return;
      if(carNear(sp.x,sp.y,3))return;const c=makeCar(type,sp.x,sp.y,sp.a,{parked:true});c.depot=true;cars.push(c);z.vehs[i]=c})}
}
function remoteShot(m,att){
  const Wp=WEAP[m.w];if(!Wp||!Wp.pellets)return;const sr=IH.util.mulberry32(m.r|0);
  for(let i=0;i<Wp.pellets;i++){const aa=m.a+(sr()*2-1)*Wp.spread;const b={x:m.x+Math.cos(aa)*0.9,y:m.y+Math.sin(aa)*0.9,vx:Math.cos(aa)*260,vy:Math.sin(aa)*260,life:Wp.life||(m.w===2?0.12:0.35),owner:'remote',dmg:Wp.dmg,src:null,att};bullets.push(b)}
  addPart({k:'flash',x:m.x+Math.cos(m.a)*0.9,y:m.y+Math.sin(m.a)*0.9,z:1.2,vx:0,vy:0,vz:0,life:0.05,max:0.05,size:0.9});
  sfx(m.w===3?'mp':m.w===2?'schrot':m.w===6?'gewehr':'shot',0.8,m.x,m.y);
  for(const p of peds)if(p.kind==='civ'&&(p.state==='walk'||p.state==='idle')&&hypot(p.x-m.x,p.y-m.y)<30){p.state='flee';p.fleeT=rand(4,7);p.fx=m.x;p.fy=m.y}
}
function remoteGrenade(m,att){grenades.push({x:m.x,y:m.y,z:1.6,vx:m.vx,vy:m.vy,vz:5,t:1.7,att,molotov:!!m.molotov});sfx('throw',0.6,m.x,m.y)}
function remoteBoom(m,att){explosion(m.x,m.y,false,att);if(m.type&&CT[m.type]){const w=makeCar(m.type,m.x,m.y,m.a||0,{parked:true,color:m.color});w.dead=true;w.hp=0;w.parked=false;w.driver=null;cars.push(w);smoke(m.x,m.y,2,true)}}
// a remote player got out: their car stays where they left it
function leaveRemoteCar(rc){if(!CT[rc.type]||rc.dead)return;if(hypot(rc.x-player.x,rc.y-player.y)>300)return;const c=makeCar(rc.type==='polizei'||rc.type==='polsuv'?'limousine':rc.type,rc.x,rc.y,rc.a,{parked:true,color:rc.color});c.hp=Math.max(10,rc.hp||100)*c.maxHp/100;cars.push(c)}
function updateBullets(dt,active){
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];let dead=false;const steps=Math.ceil(hypot(b.vx,b.vy)*dt/0.7);
    for(let s=0;s<steps&&!dead;s++){
      b.x+=b.vx*dt/steps;b.y+=b.vy*dt/steps;
      const t=at(b.x,b.y);if(t===TY.BUILD||t===TY.SOLID){spark(b.x,b.y,1.2);spark(b.x,b.y,1.2);dead=true;break}
      for(const c of active){if(c.sink||c===b.src||(b.owner==='player'&&c===player.inCar))continue;if(pointInCar(c,b.x,b.y)){spark(b.x,b.y,1);if(!c.dead){damageCar(c,b.dmg,b.owner==='player');if(b.owner==='player'&&c.cop&&c.driver&&c.driver!=='player')offense('weapon',0.34)}dead=true;break}}
      if(dead)break;
      for(const c of remote.cars){if(c.peer===b.att)continue;if(pointInCar(c,b.x,b.y)){spark(b.x,b.y,1);dead=true;break}}
      if(!dead&&b.owner==='player'&&heli.on&&hypot(b.x-heli.x,b.y-heli.y)<3.2){heli.hp-=b.dmg;spark(b.x,b.y,2);dead=true;if(heli.hp<=0)heliDown();break}
      if(dead)break;
      for(const p of peds){if(p===b.src||isDown(p))continue;if(Math.abs(p.x-b.x)<0.55&&Math.abs(p.y-b.y)<0.55){knock(p,b.vx*0.04,b.vy*0.04,b.owner==='player'?'weapon':null,b.dmg*3);if(isDown(p))blood(b.x,b.y);dead=true;break}}
      if(dead)break;
      for(const p of remote.peds){if(p.peer===b.att)continue;if(Math.abs(p.x-b.x)<0.55&&Math.abs(p.y-b.y)<0.55){blood(b.x,b.y);dead=true;break}}
      if(dead)break;
      if((b.owner==='cop'||b.owner==='remote')&&onFoot()&&Math.abs(player.x-b.x)<0.55&&Math.abs(player.y-b.y)<0.55){if(!(b.owner==='remote'&&inSafeZone()))hurtPlayer(b.dmg,b.owner==='cop'?'cop':'pvp',b.att);blood(b.x,b.y);dead=true;break}
      if((b.owner==='cop'||b.owner==='remote')&&player.inCar&&pointInCar(player.inCar,b.x,b.y)){if(!(b.owner==='remote'&&inSafeZone()))damageCar(player.inCar,b.dmg*0.6,false);if(b.att){player.lastAtt=b.att;player.lastAttT=G.time}spark(b.x,b.y,1);dead=true;break}
      for(const p of W.propsNear(b.x,b.y,1))if(!p.broken&&(p.k==='hydrant'||p.k==='bin')&&hypot(p.x-b.x,p.y-b.y)<p.r+0.2){breakProp(p,b.owner==='player',b.vx,b.vy);dead=true;break}
    }
    b.life-=dt;if(dead||b.life<=0)bullets.splice(i,1);
  }
  for(let i=grenades.length-1;i>=0;i--){const g=grenades[i];g.t-=dt;g.vz-=20*dt;
    const nx=g.x+g.vx*dt,ny=g.y+g.vy*dt;if(solidCar(at(nx,g.y))){g.vx*=-0.5}else g.x=nx;if(solidCar(at(g.x,ny))){g.vy*=-0.5}else g.y=ny;
    g.z+=g.vz*dt;if(g.z<0.15){g.z=0.15;g.vz*=-0.4;g.vx*=0.7;g.vy*=0.7;if(g.molotov)g.t=0}
    if(g.t<=0){if(g.molotov)createFire(g.x,g.y,g.att);else explosion(g.x,g.y,!g.att,g.att);grenades.splice(i,1)}}
}

/* ================= collisions ================= */
function collideRemote(active){
  for(const r of remote.cars){if((r.z||0)>2)continue;
    for(const a of active){if(a.sink||Math.abs(a.x-r.x)>7||Math.abs(a.y-r.y)>7)continue;
      const ca=carCircles(a),cr=carCircles(r);const ra=a.t.wid/2+0.08,rb=r.t.wid/2+0.08;let best=null;
      for(const p of ca)for(const q of cr){const dx=q[0]-p[0],dy=q[1]-p[1],d=hypot(dx,dy),ov=ra+rb-d;if(ov>0&&(!best||ov>best.ov))best={ov,nx:dx/(d||1),ny:dy/(d||1),px:(p[0]+q[0])/2,py:(p[1]+q[1])/2}}
      if(!best)continue;
      if(!carHitsWall(a,a.x-best.nx*best.ov,a.y-best.ny*best.ov,a.a)){a.x-=best.nx*best.ov;a.y-=best.ny*best.ov}
      const vn=(r.vx-a.vx)*best.nx+(r.vy-a.vy)*best.ny;
      if(vn<0){const ma=a.dead?2.5:a.t.mass,mb=r.t.mass,jj=-1.3*vn/(1/ma+1/mb);a.vx-=jj/ma*best.nx;a.vy-=jj/ma*best.ny;
        const imp=-vn;if(imp>6){damageCar(a,(imp-6)*mb/(ma+mb)*2,false);if(a===player.inCar){emit('shake',Math.min(0.9,imp/28));player.lastAtt=r.peer;player.lastAttT=G.time}sfx('crash',Math.min(1,imp/25),best.px,best.py);for(let k=0;k<4;k++)spark(best.px,best.py,0.6)}}
    }
  }
}
function collideCars(active){
  const circ=active.map(carCircles);
  for(let i=0;i<active.length;i++){const a=active[i];if(a.sink||a.air)continue;
    for(let j=i+1;j<active.length;j++){const b=active[j];if(b.sink||b.air)continue;if(Math.abs(a.x-b.x)>7||Math.abs(a.y-b.y)>7)continue;
      const ra=a.t.wid/2+0.08,rb=b.t.wid/2+0.08;let best=null;
      for(const p of circ[i])for(const q of circ[j]){const dx=q[0]-p[0],dy=q[1]-p[1],d=hypot(dx,dy),ov=ra+rb-d;if(ov>0&&(!best||ov>best.ov))best={ov,nx:dx/(d||1),ny:dy/(d||1),px:(p[0]+q[0])/2,py:(p[1]+q[1])/2}}
      if(!best)continue;
      const ma=a.dead?2.5:a.t.mass,mb=b.dead?2.5:b.t.mass,tm=ma+mb,pa=best.ov*mb/tm,pb=best.ov*ma/tm;
      if(!carHitsWall(a,a.x-best.nx*pa,a.y-best.ny*pa,a.a)){a.x-=best.nx*pa;a.y-=best.ny*pa}
      if(!carHitsWall(b,b.x+best.nx*pb,b.y+best.ny*pb,b.a)){b.x+=best.nx*pb;b.y+=best.ny*pb}
      const vn=(b.vx-a.vx)*best.nx+(b.vy-a.vy)*best.ny;
      if(vn<0){
        const jj=-1.3*vn/(1/ma+1/mb);
        a.vx-=jj/ma*best.nx;a.vy-=jj/ma*best.ny;b.vx+=jj/mb*best.nx;b.vy+=jj/mb*best.ny;
        const tq=(best.px-a.x)*best.ny-(best.py-a.y)*best.nx;a.a-=tq*jj/ma*0.003;
        const tq2=(best.px-b.x)*best.ny-(best.py-b.y)*best.nx;b.a+=tq2*jj/mb*0.003;
        const imp=-vn;
        const pl=a.driver==='player'?a:b.driver==='player'?b:null,other=pl===a?b:a;
        if(pl&&other.cop&&!other.dead&&imp>3.5&&other.copHitCD<=0){other.copHitCD=1.5;offense('copcrash')}
        if(imp>6){
          damageCar(a,(imp-6)*1.0*mb/tm*2,!!pl&&a!==pl);damageCar(b,(imp-6)*1.0*ma/tm*2,!!pl&&b!==pl);
          if(pl)emit('shake',Math.min(0.9,imp/28));if(pl&&pl.t.bike&&imp>7)pl.eject=imp;
          sfx('crash',Math.min(1,imp/25),best.px,best.py);for(let k=0;k<4;k++)spark(best.px,best.py,0.6);
        }
        if(pl&&other.driver==='ai'&&!other.cop)other.hornT=0.4;
      }
    }
  }
}
function collideCarProps(c){
  const sp=hypot(c.vx,c.vy);
  for(const p of W.propsNear(c.x,c.y,4)){
    if(p.broken)continue;
    for(const q of carCircles(c)){
      const dx=p.x-q[0],dy=p.y-q[1],d=hypot(dx,dy),r=p.r+c.t.wid/2;
      if(d<r){
        if(p.k!=='tree'&&sp>3){breakProp(p,c.driver==='player',c.vx,c.vy);c.vx*=0.88;c.vy*=0.88;damageCar(c,p.k==='lamp'?4:1.5,false);sfx('crash',0.4,p.x,p.y);break}
        const nx=dx/(d||1),ny=dy/(d||1),push=r-d;if(!carHitsWall(c,c.x-nx*push,c.y-ny*push,c.a)){c.x-=nx*push;c.y-=ny*push}
        const vn=c.vx*nx+c.vy*ny;if(vn>0){c.vx-=vn*nx*1.3;c.vy-=vn*ny*1.3;if(vn>8){damageCar(c,(vn-8)*1.2,false);sfx('crash',0.5,p.x,p.y);if(c===player.inCar)emit('shake',vn/30)}}
        break;
      }
    }
  }
}
function collideRemotePeds(){
  if(!(onFoot()&&G.state==='play'))return;
  for(const c of remote.cars){if((c.z||0)>2)continue;if(Math.abs(c.x-player.x)>4||Math.abs(c.y-player.y)>4)continue;if(!pointInCar(c,player.x,player.y,0.35))continue;
    const sp=hypot(c.vx,c.vy);if(sp>8&&player.stun<=0){hurtPlayer((sp-8)*2.2,'car',c.peer);player.stun=0.8;player.vx=c.vx*0.8;player.vy=c.vy*0.8;sfx('punch',1,player.x,player.y)}
    const dx=player.x-c.x,dy=player.y-c.y,ca=Math.cos(c.a),sa=Math.sin(c.a);const v=-dx*sa+dy*ca;movePed(player,-sa*Math.sign(v||1)*0.3,ca*Math.sign(v||1)*0.3,false)}
  for(const p of peds){if(isDown(p))continue;for(const c of remote.cars){if((c.z||0)>2)continue;if(Math.abs(c.x-p.x)>4||Math.abs(c.y-p.y)>4)continue;if(pointInCar(c,p.x,p.y,0.35)&&hypot(c.vx,c.vy)>6){knock(p,c.vx*0.9,c.vy*0.9,null,(hypot(c.vx,c.vy)-4)*9);sfx('punch',0.7,p.x,p.y);break}}}
}
function collidePedsCars(active){
  const list=(onFoot()&&G.state==='play')?peds.concat([player]):peds;
  for(const p of list){
    for(const c of active){
      if(c.sink||c.z>1||Math.abs(c.x-p.x)>7||Math.abs(c.y-p.y)>7)continue;if(!pointInCar(c,p.x,p.y,0.35))continue;
      const sp=hypot(c.vx,c.vy);
      if(p===player){if(sp>8&&player.stun<=0){hurtPlayer((sp-8)*2.2,'car');player.stun=0.8;player.vx=c.vx*0.8;player.vy=c.vy*0.8;sfx('punch',1,p.x,p.y)}}
      else if(sp>6&&!isDown(p)){knock(p,c.vx*0.9,c.vy*0.9,c.driver==='player'?'car':null,(sp-4)*9*(c.t.mass||1));sfx('punch',0.7,p.x,p.y);continue}
      const dx=p.x-c.x,dy=p.y-c.y,ca=Math.cos(c.a),sa=Math.sin(c.a);const v=-dx*sa+dy*ca;const nx=-sa*Math.sign(v||1),ny=ca*Math.sign(v||1);
      movePed(p,nx*0.3,ny*0.3,false);
    }
  }
}

/* ================= player ================= */
function nearestCarFor(x,y,maxD){let best=null,bd=maxD;for(const c of cars){if(c.dead||c.sink||(c.z||0)>1)continue;const dx=x-c.x,dy=y-c.y,lim=c.t.len/2+7;if(Math.abs(dx)>lim||Math.abs(dy)>lim)continue;const ca=Math.cos(c.a),sa=Math.sin(c.a);const u=dx*ca+dy*sa,v=-dx*sa+dy*ca;const cu=clamp(u,-c.t.len/2,c.t.len/2),cv=clamp(v,-c.t.wid/2,c.t.wid/2);const d=hypot(u-cu,v-cv);if(d<bd){bd=d;best=c}}return best}
function enterExit(){
  if(G.state!=='play')return;
  if(player.inCar){
    const c=player.inCar;if(c.t.plane&&(c.air||Math.abs(c.spd||0)>4)){emit('toast',c.air?'Erst landen!':'Erst anhalten');return}const ca=Math.cos(c.a),sa=Math.sin(c.a);
    for(const[u,v]of[[0,-(c.t.wid/2+0.9)],[0,c.t.wid/2+0.9],[-(c.t.len/2+0.9),0],[c.t.len/2+0.9,0]]){
      const x=c.x+ca*u-sa*v,y=c.y+sa*u+ca*v;
      if(!pedBlocked(x,y,false)&&!cars.some(o=>o!==c&&pointInCar(o,x,y,0.3))){player.x=x;player.y=y;player.lx=x;player.ly=y;player.vx=c.vx*0.3;player.vy=c.vy*0.3;player.a=c.a;c.driver=null;player.inCar=null;sfx('door');emit('carchange');if(mission.active&&mission.data.veh===c)mission.fail('Fahrzeug verlassen – Schicht beendet.',true);return}
    }
    emit('toast','Hier kannst du nicht aussteigen');return;
  }
  const c=nearestCarFor(player.x,player.y,2.2);if(!c)return;
  if(c.parked&&!c.driver&&!c.saved&&!c.home&&!c.depot&&!c.dead&&!c.t.plane){if(!player.breakIn){player.breakIn={c,t:c.t.bike?0.5:1.1,T:c.t.bike?0.5:1.1,x:player.x,y:player.y};sfx('door',0.5)}return}
  takeCar(c);
}
function takeCar(c){
  if(c.driver==='ai'||c.driver==='cop'||c.driver==='copIdle'){
    if(c.driver!=='copIdle'){const ped=makePed(c.x,c.y,c.cop?'cop':'civ');const ca=Math.cos(c.a),sa=Math.sin(c.a);ped.x=c.x+sa*(c.t.wid/2+0.9);ped.y=c.y-ca*(c.t.wid/2+0.9);
      if(pedBlocked(ped.x,ped.y,false)){ped.x=c.x-sa*(c.t.wid/2+0.9);ped.y=c.y+ca*(c.t.wid/2+0.9)}
      if(c.cop){ped.state='down';ped.downT=1.5}else{ped.state='flee';ped.fleeT=6;ped.fx=c.x;ped.fy=c.y}peds.push(ped)}
    stats.cars++;emit('toast',c.cop?'Streifenwagen geknackt':'Auto geknackt');
  }
  c.parked=false;c.driver='player';c.pursuit=false;c.siren=false;c.q=[];c.route=null;player.inCar=c;sfx('door');emit('carchange');
  if(c.saved)c.saved=false;
}
const input=IH.input={mx:0,my:0,mm:0,gas:false,brake:false,hb:false,fire:false,enterQ:false,altQ:false,nitroQ:false,steerMode:'dir',kb:{}};
function joyWorld(){const y=IH.cam.yaw||0;const c=Math.cos(y),s=Math.sin(y);return{x:c*input.mx-s*input.my,y:s*input.mx+c*input.my}}
function kbActive(){const k=input.kb;return k.KeyW||k.KeyA||k.KeyS||k.KeyD||k.ArrowUp||k.ArrowDown||k.ArrowLeft||k.ArrowRight}
function updatePlayer(dt){
  player.fireCD-=dt;player.stun-=dt;player.hitFlash-=dt;player.punch-=dt;
  if(input.enterQ){input.enterQ=false;enterExit()}
  if(input.altQ){input.altQ=false;if(onFoot()){let w=player.weapon;const N=WEAP.length;for(let i=0;i<N;i++){w=(w+1)%N;if(w===0||player.ammo[w]>0)break}player.weapon=w;sfx('pick',0.4)}}
  if(player.breakIn){const b=player.breakIn;b.t-=dt;if(hypot(player.x-b.x,player.y-b.y)>1.4||b.c.dead||!cars.includes(b.c)||b.c.driver)player.breakIn=null;else if(b.t<=0){player.breakIn=null;const c=b.c;if(Math.random()<0.45&&!c.mission){c.alarm=9;emit('toast','Alarmanlage!');if(copsClose(45))offense('alarm');for(const p of peds)if(p.kind==='civ'&&hypot(p.x-c.x,p.y-c.y)<25&&(p.state==='walk'||p.state==='idle')){p.state='flee';p.fleeT=rand(3,6);p.fx=c.x;p.fy=c.y}}stats.cars++;takeCar(c)}}
  const k=input.kb,kb=kbActive();
  if(player.inCar){
    const c=player.inCar;player.x=c.x;player.y=c.y;if(c.dead||c.sink)return;
    if(input.nitroQ){input.nitroQ=false;if(c.up.nitro>0&&c.nitroT<=0){c.up.nitro--;c.nitroT=2.6;sfx('nitro');emit('toast','Nitro!')}}
    const gas=input.gas||k.KeyW||k.ArrowUp,brake=input.brake||k.KeyS||k.ArrowDown;
    const vf=c.vf||0;let thr=0;
    if(brake&&!gas){if(vf>0.6){thr=-1;c.revT=0}else{c.revT+=dt;thr=c.revT>0.28?-1:0;if(thr===0){c.vx*=Math.exp(-8*dt);c.vy*=Math.exp(-8*dt);c.brake=true}}}
    else{c.revT=0;if(gas)thr=brake?-0.6:1}
    let steer=0;
    if(kb)steer=(k.KeyD||k.ArrowRight?1:0)-(k.KeyA||k.ArrowLeft?1:0);
    else if(input.mm>0.1){
      if(input.steerMode==='dir'){const v=joyWorld();const want=Math.atan2(v.y,v.x);const diff=wrapA(want-c.a);steer=clamp(diff*2.2,-1,1)*Math.min(1,input.mm*1.3);if(vf<-0.5)steer=-steer}
      else{const x=input.mx*Math.min(1,input.mm/Math.max(0.01,Math.hypot(input.mx,input.my))*1);steer=Math.sign(x)*Math.pow(Math.min(1,Math.abs(x)),1.35)}
    }
    if(c.t.plane){const dz=v=>Math.abs(v)<0.14?0:v;const ps=kb?steer:clamp(dz(input.mx)*1.2,-1,1),pp=kb?0:clamp(dz(input.my)*1.25,-1,1);
      c.ctl={gas,brake,steer:ps,pitch:pp,up:input.up||k.KeyR||k.KeyN,down:input.hb||k.KeyF||k.ShiftLeft||k.ShiftRight};c.hornT-=dt;return}
    if(!c.air)driveCar(c,thr,steer,input.hb||k.ShiftLeft||k.ShiftRight,dt,thr===0);
    if(thr<0&&vf<=0.6&&!(gas&&brake))c.rev=true;
    rampCheck(c,dt);
    const emerg=c.t.emerg||c.cop;
    if(c.type==='feuerwehr'){if(input.fire)waterCannon(c,dt)}
    else if(emerg){if(input.fire&&!c.fireHeld){c.siren=!c.siren;sfx('beep');emit('toast',c.siren?'Sirene an':'Sirene aus')}}
    c.fireHeld=input.fire;
    if(!emerg&&input.fire&&c.hornT<=0){c.hornT=0.6;sfx('horn');emit('net','horn',{x:c.x,y:c.y});for(const p of peds)if(p.kind==='civ'&&(p.state==='walk'||p.state==='idle')&&hypot(p.x-c.x,p.y-c.y)<12){p.state='flee';p.fleeT=1.5;p.fx=c.x;p.fy=c.y}}
    c.hornT-=dt;return;
  }
  // on foot
  let mx=0,my=0,mm=0;
  if(kb){mx=(k.KeyD||k.ArrowRight?1:0)-(k.KeyA||k.ArrowLeft?1:0);my=(k.KeyS||k.ArrowDown?1:0)-(k.KeyW||k.ArrowUp?1:0);const y=IH.cam.yaw||0,cc=Math.cos(y),s=Math.sin(y);const wx=cc*mx-s*my,wy=s*mx+cc*my;mx=wx;my=wy;const m=hypot(mx,my);if(m){mx/=m;my/=m;mm=1}}
  else if(input.mm>0.1){const v=joyWorld();const l=hypot(v.x,v.y)||1;mx=v.x/l;my=v.y/l;mm=input.mm}
  if(input.mm>0.96&&!kb)player.fullT=(player.fullT||0)+dt;else player.fullT=0;
  const wantSprint=mm>0.5&&(k.ShiftLeft||k.ShiftRight||input.sprint||player.fullT>0.35);
  const sprinting=wantSprint&&player.stam>0.03&&!player.breakIn;player.sprinting=sprinting;
  player.stam=clamp(player.stam+(sprinting?-dt/5.5:dt/7),0,1);
  if(player.breakIn)mm=0;
  const sp=player.stun>0?0:(sprinting?9.8:6.6)*Math.min(1,mm*1.15);
  player.vx=lerp(player.vx,mx*sp,1-Math.exp(-14*dt));player.vy=lerp(player.vy,my*sp,1-Math.exp(-14*dt));
  movePed(player,player.vx*dt,player.vy*dt,false);
  const msp=hypot(player.vx,player.vy);if(mm>0.1)player.a=Math.atan2(my,mx);if(msp>0.3)player.anim+=dt*gaitW(msp);player.spdNow=msp;
  if(at(player.x,player.y)===TY.WATER)wasted('In die Isar gefallen.');
  const fireKey=input.fire||k.Space;
  if(fireKey&&player.fireCD<=0&&!player.breakIn){
    const w=player.weapon,Wp=WEAP[w];
    if(w===0||w===5){const bat=w===5,reach=bat?1.5:0.9,ca=Math.cos(player.a),sa=Math.sin(player.a);player.fireCD=Wp.rate;player.punch=bat?0.3:0.18;const fx=player.x+ca*reach*0.8,fy=player.y+sa*reach*0.8;let hit=false;
      for(const p of peds)if(!isDown(p)&&hypot(p.x-fx,p.y-fy)<reach){knock(p,ca*(bat?11:6),sa*(bat?11:6),'weapon',bat?45:20);hit=true}
      for(const p of W.propsNear(fx,fy,reach+0.5))if(!p.broken&&p.k!=='tree'&&p.k!=='lamp'&&(bat||p.k==='bin')&&hypot(p.x-fx,p.y-fy)<reach+p.r){breakProp(p,true,ca,sa);hit=true}
      if(bat)for(const c of activeCars)if(!c.dead&&pointInCar(c,fx+ca*0.6,fy+sa*0.6,0.2)){damageCar(c,9,true);spark(fx,fy,1);sfx('crash',0.5,fx,fy);hit=true;break}
      sfx('punch',hit?1:0.35)}
    else if((w===4||w===7)&&player.ammo[w]>0){player.fireCD=Wp.rate;player.ammo[w]--;const a=autoAim(player.x,player.y,player.a,40);player.a=a;player.throwT=0.3;const molotov=w===7;
      const gr={x:player.x+Math.cos(a)*0.6,y:player.y+Math.sin(a)*0.6,z:1.6,vx:Math.cos(a)*15+player.vx,vy:Math.sin(a)*15+player.vy,vz:5,t:molotov?3:1.7,molotov};grenades.push(gr);sfx('throw');
      emit('net','gren',{x:gr.x,y:gr.y,vx:gr.vx,vy:gr.vy,m:molotov?1:0});
      if(player.ammo[w]===0)nextWeapon()}
    else if(player.ammo[w]>0){
      player.fireCD=Wp.rate;player.ammo[w]--;let a=autoAim(player.x,player.y,player.a,w===6?95:32);player.a=a;
      const seed=(Math.random()*1e9)|0,sr=IH.util.mulberry32(seed);
      for(let i=0;i<Wp.pellets;i++){const aa=a+(sr()*2-1)*Wp.spread;fireBullet(player.x+Math.cos(aa)*0.9,player.y+Math.sin(aa)*0.9,aa,'player',Wp.dmg,player,Wp.life||(w===2?0.12:0.35))}
      emit('net','shot',{x:player.x,y:player.y,a,w,r:seed});
      sfx(w===3?'mp':w===2?'schrot':w===6?'gewehr':'shot');
      for(const p of peds)if(p.kind==='civ'&&(p.state==='walk'||p.state==='idle')&&hypot(p.x-player.x,p.y-player.y)<30){p.state='flee';p.fleeT=rand(4,7);p.fx=player.x;p.fy=player.y}
      if(player.ammo[w]===0){nextWeapon();emit('toast','Keine Munition mehr')}
    }
  }
}
/* ================= flying ================= */
const OKLAND=new Set([TY.ROAD,TY.PLAZA,TY.FIELD,TY.LOT,TY.WALK,TY.GRASS,TY.PARK,TY.BRIDGE,TY.BANK]);
function planeCrash(c,why){if(c.dead)return;c.air=false;c.z=0;c.vz=0;explosion(c.x,c.y,c.driver==='player');explodeCar(c);for(let i=0;i<3;i++)explosion(c.x+Math.cos(c.a)*c.t.len*(i-1)*0.3,c.y+Math.sin(c.a)*c.t.len*(i-1)*0.3,false);if(why&&player.inCar===null)emit('toast',why)}
function planeStep(c,dt){
  const T=c.t.plane,ctl=c.driver==='player'?(c.ctl||{}):{};c.spd=c.spd||0;c.z=c.z||0;c.vz=c.vz||0;c.roll=c.roll||0;
  if(c.dead){c.spd*=Math.exp(-1.5*dt);c.x+=Math.cos(c.a)*c.spd*dt;c.y+=Math.sin(c.a)*c.spd*dt;c.vx=c.vy=0;return}
  if(c.driver!=='player'&&!c.air&&c.spd<0.1){c.vx=c.vy=0;return}
  const steer=ctl.steer||0,pitch=clamp((ctl.pitch||0)+(ctl.up?1:0)-(ctl.down?1:0),-1,1);
  const push=T.acc*Math.max(0,1-c.spd/T.max);
  if(!c.air){
    if(ctl.gas)c.spd+=push*dt;
    else if(ctl.brake){if(c.spd>0.2)c.spd=Math.max(0,c.spd-9*dt);else c.spd=Math.max(-3,c.spd-2*dt)}
    else c.spd=c.spd>0?Math.max(0,c.spd-0.9*dt):Math.min(0,c.spd+3*dt);
    const rate=steer*T.gturn*clamp(Math.abs(c.spd)/3+0.25,0,1)/(1+Math.abs(c.spd)/25);c.a+=rate*dt*(c.spd<-0.1?-1:1);c.roll*=Math.exp(-6*dt);
    if(c===player.inCar&&c.spd>=T.vr&&!c.toldVr){c.toldVr=1;emit('toast','Abhebegeschwindigkeit – jetzt hochziehen (Joystick nach unten)')}
    if(pitch>0.3&&c.spd>=T.vr){c.air=true;c.vz=2.5;c.z=0.3;sfx('liftoff',0.6,c.x,c.y)}
    // nose into something solid on the ground
    const nx=c.x+Math.cos(c.a)*c.t.len*0.5,ny=c.y+Math.sin(c.a)*c.t.len*0.5,g=at(nx,ny);
    if((g===TY.BUILD||g===TY.SOLID||g===TY.RAIL)&&c.spd>0){if(c.spd>14){planeCrash(c);return}damageCar(c,c.spd*4,false);c.spd=-0.5;sfx('crash',0.6,nx,ny)}
    if(at(c.x,c.y)===TY.WATER&&!c.sink){c.sink=0.01;if(c===player.inCar)wasted('Ins Wasser gestürzt.');return}
  }else{
    const stall=c.spd<T.vr*0.72;
    if(ctl.gas)c.spd+=push*dt;else if(ctl.brake)c.spd-=6*dt;
    c.spd=Math.max(0,c.spd-c.vz*0.12*dt);
    let vt=pitch>0?pitch*T.climb*clamp(c.spd/T.vr,0,1.3):pitch*T.climb*1.3;if(c.z<14&&vt<0&&!stall)vt=Math.max(vt,-2.6-c.z*0.25);if(stall){vt=c.z<12?-4.5:-14;if(c===player.inCar&&!c.toldStall){c.toldStall=1;emit('toast','Strömungsabriss! Gas geben')}}else c.toldStall=0;
    c.vz+=(vt-c.vz)*Math.min(1,dt*1.6);c.z+=c.vz*dt;if(c.z>320){c.z=320;c.vz=Math.min(0,c.vz)}
    c.roll+=(steer*0.65-c.roll)*Math.min(1,dt*3);c.a+=steer*T.turn*dt*clamp(c.spd/T.vr,0.5,1.2);
    const h=W.heightAt(c.x+Math.cos(c.a)*c.t.len*0.4,c.y+Math.sin(c.a)*c.t.len*0.4),hc=W.heightAt(c.x,c.y);
    if(c.z<Math.max(h,hc)-0.5&&Math.max(h,hc)>1){planeCrash(c,'Gegen ein Gebäude geflogen');return}
    if(c.z<=0){c.z=0;const g=at(c.x,c.y);if(c.vz>-7&&Math.abs(c.roll)<0.45&&OKLAND.has(g)){c.air=false;c.vz=0;c.roll=0;sfx('touchdown',Math.min(1,0.4-c.vz*0.1),c.x,c.y);if(c===player.inCar)emit('toast',hypot(c.vx,c.vy)>T.vr*1.3?'Harte Landung!':'Gelandet');c.toldVr=0}
      else{planeCrash(c,'Bruchlandung');return}}
    // out of the map: turn back
    if(c.x<20||c.y<20||c.x>W.MAP-20||c.y>W.MAP-20){c.a+=dt*1.2;if(c===player.inCar&&!c.toldEdge){c.toldEdge=1;emit('toast','Kartenrand – zurück nach München')}}else c.toldEdge=0;
  }
  c.vx=Math.cos(c.a)*c.spd;c.vy=Math.sin(c.a)*c.spd;c.vf=c.spd;c.vl=0;
  c.x=clamp(c.x+c.vx*dt,2,W.MAP-2);c.y=clamp(c.y+c.vy*dt,2,W.MAP-2);
  c.thr=c.driver==='player'?(ctl.gas?1:0.45):0;
  c.pitch=c.air?clamp(Math.atan2(c.vz,Math.max(8,c.spd))*1.4+0.04,-0.35,0.4):(pitch>0.3&&c.spd>T.vr*0.85?0.1:0);
}
// aircraft at the airport come back when they are gone and nobody is near
function spawnPlanes(force){const A=W.airport;if(!A||!A.flyable)return;for(const f of A.flyable){if(cars.some(c=>c.flyId===f.id&&!c.dead))continue;if(!force&&hypot(player.x-f.x,player.y-f.y)<160)continue;
  for(let i=cars.length-1;i>=0;i--)if(cars[i].flyId===f.id&&cars[i]!==player.inCar)cars.splice(i,1);const c=makeCar(f.type,f.x,f.y,f.a,{parked:true,color:'#f4f5f7'});c.flyId=f.id;c.liv=f.liv;c.z=0;c.spd=0;cars.push(c)}}
function rampCheck(c,dt){
  if(c.air)return;c.z=0;c.pitch=0;
  for(const r of W.ramps){const dx=c.x-r.x,dy=c.y-r.y;if(Math.abs(dx)>10||Math.abs(dy)>10)continue;const ca=Math.cos(r.a),sa=Math.sin(r.a);const u=dx*ca+dy*sa,v=-dx*sa+dy*ca;
    if(Math.abs(v)>r.wid/2+0.4||u<-r.len/2-0.2||u>r.len/2+0.8)continue;const along=c.vx*ca+c.vy*sa;if(along<1)continue;
    if(u<r.len/2){c.z=Math.max(0,(u+r.len/2)/r.len*r.h);c.pitch=Math.atan2(r.h,r.len);continue}
    if(along>8){c.air=true;c.z=r.h;c.vz=Math.min(15,2+along*0.34);c.airT=0;c.air0={x:c.x,y:c.y};c.ramp=r.i;c.vx=ca*along+(c.vx-ca*along)*0.5;c.vy=sa*along+(c.vy-sa*along)*0.5}}
}
function landCar(c){
  const vz=c.vz;c.z=0;c.vz=0;c.air=false;c.pitch=0;
  if(vz<-13)damageCar(c,(-vz-13)*4,false);sfx('crash',Math.min(1,-vz/20),c.x,c.y);
  if(c===player.inCar){emit('shake',Math.min(1,-vz/18));if(c.t.bike&&vz<-15)c.eject=-vz;
    if(c.air0){const d=hypot(c.x-c.air0.x,c.y-c.air0.y);if(c.airT>0.6&&d>12&&!c.dead){let pay=Math.round((d*6+c.airT*60)/10)*10;const first=!G.stunts.has(c.ramp);if(first){G.stunts.add(c.ramp);pay+=500}
      addMoney(pay,c.x,c.y);emit('banner',first?'Neuer Stuntsprung!':'Stuntsprung!',Math.round(d)+' m weit · '+c.airT.toFixed(1)+' s in der Luft · +$'+pay+(first?' · '+G.stunts.size+' von '+W.ramps.length:''),'#ffc61a');sfx('win',0.7);save()}}}
  c.air0=null;
}
function waterCannon(c,dt){
  const fx=Math.cos(c.a),fy=Math.sin(c.a);c.sprayT=(c.sprayT||0)-dt;
  if(c.sprayT<=0){c.sprayT=0.03;const ox=c.x+fx*(c.t.len/2),oy=c.y+fy*(c.t.len/2);for(let i=0;i<2;i++){const s=rand(16,22),a=c.a+rand(-0.06,0.06);addPart({k:'drop',x:ox,y:oy,z:2.6,vx:Math.cos(a)*s+c.vx,vy:Math.sin(a)*s+c.vy,vz:rand(1.5,3.5),life:0.9,max:0.9,size:0.16,grav:1})}}
  for(const o of activeCars){if(!o.burn)continue;const dx=o.x-c.x,dy=o.y-c.y,d=hypot(dx,dy);if(d>20)continue;if(Math.abs(wrapA(Math.atan2(dy,dx)-c.a))<0.45){o.burn=Math.max(0,o.burn-38*dt);if(Math.random()<0.2)smoke(o.x,o.y,1.5,false,true)}}
  for(const f of fires){const dx=f.x-c.x,dy=f.y-c.y;if(hypot(dx,dy)<20&&Math.abs(wrapA(Math.atan2(dy,dx)-c.a))<0.5)f.t-=dt*2}
  for(const p of peds)if(!isDown(p)&&p.kind!=='cop'){const dx=p.x-c.x,dy=p.y-c.y,d=hypot(dx,dy);if(d<14&&Math.abs(wrapA(Math.atan2(dy,dx)-c.a))<0.2)knock(p,fx*5,fy*5,null,0)}
}
function nextWeapon(){for(const w of[3,6,1,2,5,4,7,0])if(w===0||player.ammo[w]>0){player.weapon=w;return}}
function autoAim(x,y,a,range){
  let best=null,bs=0.42;
  for(const p of peds){if(isDown(p))continue;const d=hypot(p.x-x,p.y-y);if(d>range||d<0.4)continue;const da=Math.abs(wrapA(Math.atan2(p.y-y,p.x-x)-a));const s=da-(p.kind==='cop'?0.08:0);if(s<bs&&hasLOS(x,y,p.x,p.y)){bs=s;best=p}}
  for(const p of remote.peds){const d=hypot(p.x-x,p.y-y);if(d>range||d<0.4)continue;const da=Math.abs(wrapA(Math.atan2(p.y-y,p.x-x)-a))-0.06;if(da<bs&&hasLOS(x,y,p.x,p.y)){bs=da;best=p}}
  for(const c of cars.concat(remote.cars)){if(c.dead||c.sink)continue;const d=hypot(c.x-x,c.y-y);if(d>range||d<1)continue;const da=Math.abs(wrapA(Math.atan2(c.y-y,c.x-x)-a));if(da+0.05<bs&&hasLOS(x,y,c.x,c.y)){bs=da+0.05;best=c}}
  return best?Math.atan2(best.y-y,best.x-x):a;
}

/* ================= AI drivers ================= */
let activeCars=[];
function obstacleLimit(c,look,ignorePeds){
  const fx=Math.cos(c.a),fy=Math.sin(c.a);let lim=1e9;
  for(const o of activeCars.concat(remote.cars)){if(o===c||o.sink)continue;const dx=o.x-c.x,dy=o.y-c.y;if(Math.abs(dx)>look||Math.abs(dy)>look)continue;const al=dx*fx+dy*fy;if(al<=0||al>look)continue;const lat=Math.abs(-dx*fy+dy*fx);if(lat>1.1+o.t.wid*0.5)continue;const gap=al-(c.t.len+o.t.len)/2;lim=Math.min(lim,Math.max(0,gap-1.5)*1.6)}
  if(!ignorePeds){const list=(onFoot()&&G.state==='play'?peds.concat([player]):peds).concat(remote.peds);for(const p of list){const dx=p.x-c.x,dy=p.y-c.y;if(Math.abs(dx)>look||Math.abs(dy)>look)continue;const al=dx*fx+dy*fy;if(al<=0||al>look*0.7)continue;if(Math.abs(-dx*fy+dy*fx)>1.6)continue;lim=Math.min(lim,Math.max(0,al-c.t.len/2-2)*1.6)}}
  return lim;
}
const steerTo=(c,tx,ty)=>clamp(wrapA(Math.atan2(ty-c.y,tx-c.x)-c.a)*2.4,-1,1);
function aiDrive(c,dt){
  if(!c.q.length||c.qi>=c.q.length){if(!snapToRoad(c)){driveCar(c,0,0,true,dt,true);return}}
  if(c.backT>0){c.backT-=dt;driveCar(c,-0.7,-c.revSteer,false,dt);return}
  const st=followQueue(c);if(!st){snapToRoad(c);driveCar(c,0,0,true,dt,true);return}
  let target=c.cruise*(1-Math.min(0.68,st.bend*0.85));
  if(st.stopD!==null){const ls=lightState(st.stopIt.stop.n,st.stopIt.stop.ang);if(ls==='r'||(ls==='y'&&st.stopD>9))target=Math.min(target,Math.max(0,st.stopD-1.5)*0.9)}
  const lim=obstacleLimit(c,28);if(!(c.wait>14&&lim<2))target=Math.min(target,lim);
  const vf=c.vf||0;let thr=clamp((target-vf)/3.5,-1,1);if(target<0.4&&vf<0.6)thr=0;
  const steer=steerTo(c,st.tx,st.ty);
  driveCar(c,thr,steer,false,dt,true);
  if(target<2)c.wait+=dt;else c.wait=Math.max(0,c.wait-dt*2);
  if(target>3&&Math.abs(vf)<0.7)c.stuck+=dt;else c.stuck=Math.max(0,c.stuck-dt);
  if(c.stuck>2.2){c.stuck=0;c.backT=0.9;c.revSteer=steer||1}
  if(c.hornT>0){c.hornT-=dt;if(c.hornT<=0.05&&Math.random()<0.5)sfx('honk',0.4,c.x,c.y,c.id)}
  // impatient drivers: honk when stuck behind something (a green light, a parked player, a pedestrian), now and then for no reason
  c.honkCD=(c.honkCD===undefined?rand(4,20):c.honkCD)-dt;
  if(c.honkCD<=0){const blockedLong=c.wait>2.6&&lim<9&&!(st.stopD!==null&&st.stopD<lim+2);if(blockedLong||Math.random()<dt/70){sfx('honk',blockedLong?0.5:0.3,c.x,c.y,c.id);c.honkCD=blockedLong?rand(3,7):rand(25,60)}else if(c.honkCD<-1)c.honkCD=0}
}
// chase speed by wanted level (share of the patrol car's top speed): low levels are easier to outrun
const CHASE=[0.8,0.82,0.88,0.94,1,1];
function copDrive(c,dt){
  const tgt=player.inCar||player;const dx=tgt.x-c.x,dy=tgt.y-c.y,d=hypot(dx,dy);
  c.losT-=dt;if(c.losT<=0){const env=IH.env||{night:0,rain:0};c.los=d<70-22*env.night-12*env.rain&&hasLOS(c.x,c.y,tgt.x,tgt.y);c.losT=0.25}
  if(c.los){G.seenNow=true;G.lkx=tgt.x;G.lky=tgt.y}
  if(c.backT>0){c.backT-=dt;driveCar(c,-0.85,-c.revSteer,false,dt);return}
  let target,steer;const vf=c.vf||0;
  const tSp=player.inCar?hypot(player.inCar.vx,player.inCar.vy):hypot(player.vx,player.vy);
  if(c.los&&d<55){
    c.mode='direct';const lead=Math.min(0.7,d/40);const ax=tgt.x+(tgt.vx||0)*lead,ay=tgt.y+(tgt.vy||0)*lead;
    steer=steerTo(c,ax,ay);target=c.t.max*CHASE[stars()];if(d<15&&tSp<7)target=Math.max(0,(d-5.5)*1.6);
    if(Math.abs(wrapA(Math.atan2(ay-c.y,ax-c.x)-c.a))>1.6&&d<20)target=Math.min(target,12);
    c.exitCD-=dt;
    if(d<14&&Math.abs(vf)<4.5&&tSp<7&&c.exitCD<=0&&countCopPeds()<5+stars()){
      const n=stars()>=3?2:1;c.copsOut=0;
      for(let i=0;i<n;i++){const side=i?1:-1,ca=Math.cos(c.a),sa=Math.sin(c.a);const x=c.x-sa*side*(c.t.wid/2+0.9),y=c.y+ca*side*(c.t.wid/2+0.9);if(pedBlocked(x,y,false))continue;const p=makePed(x,y,'cop');p.state='chase';p.home=c;peds.push(p);c.copsOut++}
      if(c.copsOut>0){c.driver='copIdle';c.exitCD=8;sfx('door',0.6,c.x,c.y)}else c.exitCD=2;
    }
  }else{
    // without sight of you they only know where you were last seen: drive there, then search the streets around it
    c.replan-=dt;const known=(G.sightT||0)<1.5;let gx=known?tgt.x:G.lkx,gy=known?tgt.y:G.lky;
    if(!known){if(c.search&&hypot(c.x-c.search.x,c.y-c.search.y)>25){gx=c.search.x;gy=c.search.y}else if(hypot(c.x-G.lkx,c.y-G.lky)<30||c.search){const a=rand(0,Math.PI*2),r=rand(40,130);c.search={x:G.lkx+Math.cos(a)*r,y:G.lky+Math.sin(a)*r};gx=c.search.x;gy=c.search.y;c.replan=0}}else c.search=null;
    if(c.mode!=='nav'||c.replan<=0||!c.q.length){snapToRoad(c,gx,gy);c.mode='nav';c.replan=known?2.5:4}
    const st=followQueue(c);if(!st){driveCar(c,0,0,true,dt);return}
    steer=steerTo(c,st.tx,st.ty);target=c.t.max*(known?0.86:0.62)*(1-Math.min(0.6,st.bend*0.75));
    target=Math.min(target,obstacleLimit(c,10,true)+7);
  }
  const thr=clamp((target-vf)/3,-1,1);driveCar(c,thr,steer,false,dt);
  if(target>4&&Math.abs(vf)<1)c.stuck+=dt;else c.stuck=Math.max(0,c.stuck-dt);
  if(c.stuck>1.3){c.stuck=0;c.backT=0.8;c.revSteer=steer||1;c.mode='x'}
}
function racerDrive(c,dt){aiDrive(c,dt)}
function countCopPeds(){let n=0;for(const p of peds)if(p.kind==='cop')n++;return n}

/* ================= police ================= */
const WANT=[0,1,2,3,4,5];
function policeTick(dt){
  if(G.state!=='play')return;
  if(G.time-(player.hurtT||-99)>8&&player.hp>0&&player.hp<60&&onFoot())player.hp=Math.min(60,player.hp+2.5*dt);
  if(G.callT>0){G.callT-=dt;if(G.callT<=0){if(stars()===0){G.heat=Math.max(G.heat,G.callHeat||1.05);G.lastSeen=0;G.heatT=G.time;emit('toast',G.callWhy==='carhit'?'Ein Zeuge hat dich gemeldet – Fahndung!':'Ein Zeuge hat die Polizei gerufen')}G.callHeat=0}}
  const s=stars();
  G.viol=Math.max(0,G.viol-dt/15);
  let pursuers=0;
  for(const c of activeCars){if(!c.cop||c.dead)continue;
    if(s>0&&c.driver==='ai'&&hypot(c.x-player.x,c.y-player.y)<90){c.driver='cop';c.pursuit=true;c.siren=true;c.mode='x'}
    if(s===0&&(c.driver==='cop'||c.driver==='block')){c.driver='ai';c.pursuit=false;c.siren=false;c.q=[];c.route=null;c.cruise=rand(12,14)}
    if(c.driver==='cop'||c.driver==='copIdle')pursuers++;
    c.copHitCD-=dt;
  }
  G.spawnCD-=dt;
  if(s>0&&pursuers<WANT[s]&&G.spawnCD<=0){const c=spawnTraffic(true,player.x,player.y,110,220);if(c){c.driver='cop';c.pursuit=true;c.siren=true;c.mode='x';c.exitCD=2}G.spawnCD=s>=4?2.2:3.2}
  if(s>=4){G.blockCD-=dt;if(G.blockCD<=0){G.blockCD=40;roadblock()}}
  if(s>0){if(G.seenNow)G.lastSeen=0;else G.lastSeen+=dt;if(G.lastSeen>7+s*1.8){G.heat=s-1;G.lastSeen=0;emit('toast',s-1?'Ein Stern weniger':'Fahndung eingestellt')}}else G.lastSeen=0;
  if(s===0||G.seenNow||G.lkx===undefined){const src=player.inCar||player;G.lkx=src.x;G.lky=src.y}
  G.sightT=(s===0||G.seenNow)?0:(G.sightT||0)+dt;   // time since any officer actually saw you (a lost star doesn't reveal you)
  G.seenNow=false;
  if(!G.arrestNow)player.arrestT=Math.max(0,player.arrestT-dt*0.6);G.arrestNow=false;
  if(player.arrestT>=1)busted();
}
function roadblock(){
  const c=player.inCar;if(!c)return;const sp=hypot(c.vx,c.vy);if(sp<6)return;
  const ax=c.x+c.vx/sp*120,ay=c.y+c.vy/sp*120;const ne=W.nearestEdge(ax,ay,30);if(!ne||ne.e.oneway)return;
  const e=ne.e;const p=W.pointAt(e.F.pts,e.F.cum,ne.s);const nx=-p.ty,ny=p.tx;
  for(const o of[-e.w/4,e.w/4]){const x=p.x+nx*o,y=p.y+ny*o;if(carNear(x,y,3))continue;const b=makeCar('polizei',x,y,Math.atan2(ny,nx)+0.3,{driver:'block',cop:true});b.siren=true;cars.push(b);
    const cp=makePed(x+p.tx*3,y+p.ty*3,'cop');cp.home=b;b.copsOut=1;peds.push(cp)}
  emit('toast','Straßensperre voraus!');
}

/* ================= missions ================= */
const placeBy=n=>W.places.find(p=>p.name===n);
function sampleRoute(pts,step){const cum=W.cumLen(pts);const out=[];for(let s=0;s<=cum[cum.length-1];s+=step){const p=W.pointAt(pts,cum,s);out.push({x:p.x,y:p.y})}return out}
function pathPolyline(path){const pts=[];for(let i=0;i<path.length-1;i++){const a=path[i],b=path[i+1];const e=nodes[a].edges.map(k=>edges[k]).find(e=>(e.a===a&&e.b===b)||(e.b===a&&e.a===b));if(!e)continue;const p=e.a===a?e.pts:e.pts.slice().reverse();for(const q of p)pts.push(q)}return pts}
const STORY=[
  {type:'kurier',title:'Brezn-Express',from:'Viktualienmarkt',to:'Hauptbahnhof',time:110,pay:400,intro:'Sepp: „A Kistn Brezn muss vom Viktualienmarkt zum Hauptbahnhof. Schnell, bevor s’ altbacken werdn.“'},
  {type:'sportwagen',title:'Weiß-blauer Flitzer',near:[330,160],color:'#f2f2f2',time:220,pay:1500,intro:'Sepp: „Am Olympiapark steht a weißer Sportwagen. Bring’n ohne Kratzer zum Hehler in Neuhausen.“'},
  {type:'rennen',title:'Ringrunde',route:'ring',time:95,pay:900,intro:'Vroni: „Einmal um den Altstadtring, gegen die Uhr. Zeig, was du kannst.“'},
  {type:'randale',title:'Scherbenhaufen',need:10,time:60,pay:700,intro:'Vroni: „Die Konkurrenz braucht an Denkzettel. Zehn Straßenmöbel, sechzig Sekunden.“'},
  {type:'bombe',title:'Heiße Ware',time:60,pay:1200,intro:'Sepp: „Am Friedensengel steht a Auto mit tickender Fracht. Versenk’s in der Isar, bevor’s hochgeht!“'},
  {type:'fluchtwagen',title:'Bankgeschäft',time:200,pay:2500,intro:'Vroni: „Hol zwei Spezln an der Bank in der Ludwigstraße ab und bring s’ ins Versteck nach Giesing.“'},
  {type:'rennen',title:'Arena-Sprint',route:'arena',time:85,pay:1400,intro:'Sepp: „Vom Siegestor zur Arena, bevor der Anpfiff kommt!“'},
  {type:'flucht',title:'Fünf Sterne',stars:5,time:160,pay:5000,intro:'Vroni: „Die ganze Stadt sucht di. Überleb und häng s’ ab!“'},
];
const mission=IH.mission={active:false,type:'',title:'',stage:0,time:0,data:{},count:0,need:0,cps:null,cpi:0,tx:null,ty:null,pay:0,
  next(){return G.story<STORY.length?STORY[G.story]:null},
  start(def,phone){
    const m=this;m.active=true;m.type=def.type;m.title=def.title;m.stage=0;m.data={def,phone};m.count=0;m.need=def.need||0;m.cps=null;m.cpi=0;m.pay=def.pay;m.time=def.time;m.tx=m.ty=null;
    if(phone)phone.cd=999;sfx('ring');
    if(def.type==='kurier'){const a=placeBy(def.from),b=placeBy(def.to);m.data.a=a;m.data.b=b;m.tx=a.x;m.ty=a.y}
    else if(def.type==='sportwagen'){
      let slot=null,bd=1e9;for(const l of W.lots){if(W.zones.some(z=>z.lot===l))continue;const d=hypot(l.cx-def.near[0],l.cy-def.near[1]);if(d<bd&&l.slots.length){bd=d;slot=l.slots[Math.floor(l.slots.length/2)]}}
      if(slot&&slot.car){const i=cars.indexOf(slot.car);if(i>=0)cars.splice(i,1);slot.car=null}
      const c=makeCar('sport',slot.x,slot.y,slot.a,{parked:true,color:def.color,mission:true});cars.push(c);if(slot)slot.car=c;m.data.car=c;m.data.dest=W.zones.find(z=>z.kind==='hehler');
    }
    else if(def.type==='rennen'){
      let pts;
      if(def.route==='ring'){const rp=W.roadPts('Altstadtring');let bi=0,bd=1e9;rp.forEach((p,i)=>{const d=hypot(p[0]-player.x,p[1]-player.y);if(d<bd){bd=d;bi=i}});pts=rp.slice(bi).concat(rp.slice(1,bi+1));m.cps=sampleRoute(pts,95);m.cps.push({x:pts[0][0],y:pts[0][1]})}
      else if(def.route==='arena'){m.cps=[{x:520,y:334},{x:520,y:262},{x:521,y:180},{x:522,y:118},{x:620,y:110},{x:740,y:110},{x:860,y:110},{x:960,y:111},{x:1002,y:112}]}
      else{const to=def.toPlace;const p=astar(nearestNodeTo(player.x,player.y),nearestNodeTo(to.x,to.y));m.cps=p?sampleRoute(pathPolyline(p),120):[{x:to.x,y:to.y}];m.cps.push({x:to.x,y:to.y})}
      const d0=hypot(m.cps[0].x-player.x,m.cps[0].y-player.y);m.time+=d0/14;
    }
    else if(def.type==='randale'){}
    else if(def.type==='bombe'){const ne=W.nearestEdge(W.RB.x,W.RB.y+45,40);const p=lanePt(ne.e,true,0,ne.s);const c=makeCar('limousine',p.x,p.y,Math.atan2(p.ty,p.tx),{parked:true,color:'#5a5f66',mission:true});c.bomb=true;cars.push(c);m.data.car=c;m.data.armed=false}
    else if(def.type==='fluchtwagen'){const b=W.nearestEdge(526,410,30);m.data.bank={x:528,y:410};m.data.dest=W.zones.find(z=>z.kind==='safe');void b}
    else if(def.type==='flucht'){G.heat=Math.max(G.heat,(def.stars||3)+0.2);m.data.t0=G.time}
    else if(def.type==='taxi'){m.stage=0;m.fares=0;taxiNext()}
    else if(JOB_TYPES.includes(def.type)){m.stage=0;m.fares=0;m.earned=0;jobNext()}
    emit('mission',def.title,def.intro||'');
  },
  onEvent(e){if(!this.active)return;if(this.type==='randale'&&e==='prop'){this.count++;if(this.count>=this.need)this.win()}},
  tick(dt){
    const m=this;if(!m.active)return;
    const armedBomb=m.type==='bombe'&&!m.data.armed;
    if(!armedBomb){m.time-=dt;if(m.time<=0){if(m.type==='bombe'){const c=m.data.car;if(c&&!c.dead)explodeCar(c);m.fail('Bumm. Zu spät.');}else m.fail(m.type==='taxi'?'Der Fahrgast ist ausgestiegen.':'Die Zeit ist um.');return}}
    const px=player.x,py=player.y,pc=player.inCar,speed=pc?hypot(pc.vx,pc.vy):0;
    if(inPlane())return;   // targets, pick-ups and drop-offs only count on the ground
    switch(m.type){
      case'kurier':
        if(hypot(px-m.tx,py-m.ty)<7){if(m.stage===0){m.stage=1;m.tx=m.data.b.x;m.ty=m.data.b.y;sfx('pick');emit('toast','Ware an Bord – ab zum Ziel!')}else m.win()}break;
      case'sportwagen':{const c=m.data.car;if(!cars.includes(c)||c.dead||c.sink){m.fail('Der Wagen ist hinüber.');return}
        if(pc===c){m.stage=1;const z=m.data.dest;m.tx=z.x;m.ty=z.y;if(hypot(c.x-z.x,c.y-z.y)<z.r&&speed<2.5){m.pay=Math.round(m.data.def.pay*Math.max(0.3,c.hp/c.maxHp)/10)*10;enterExit();const i=cars.indexOf(c);if(i>=0)cars.splice(i,1);m.win()}}
        else{m.stage=0;m.tx=c.x;m.ty=c.y}break}
      case'rennen':{const cp=m.cps[m.cpi];m.tx=cp.x;m.ty=cp.y;if(hypot(px-cp.x,py-cp.y)<10){m.cpi++;sfx('pick');if(m.cpi>=m.cps.length){m.pay=Math.round((m.data.def.pay+m.time*12)/10)*10;m.win()}}break}
      case'bombe':{const c=m.data.car;if(!c||!cars.includes(c)){m.fail('Der Wagen ist weg.');return}
        if(!m.data.armed){m.tx=c.x;m.ty=c.y;if(pc===c){m.data.armed=true;emit('toast','Die Uhr läuft! Ab in die Isar!')}}
        else{m.tx=null;if(c.sink>0&&!c.dead){m.data.bombOK=true;if(pc===c){const b=nearestBankWalk(c.x,c.y);player.inCar=null;c.driver=null;player.x=b.x;player.y=b.y;player.lx=b.x;player.ly=b.y;emit('carchange');emit('toast','Rausgesprungen und ans Ufer geschwommen')}m.win();return}
          if(Math.floor(m.time*2)!==Math.floor((m.time+dt)*2))sfx('beep',0.5,c.x,c.y)}
        break}
      case'fluchtwagen':{
        if(m.stage===0){m.tx=m.data.bank.x;m.ty=m.data.bank.y;if(pc&&hypot(pc.x-m.tx,pc.y-m.ty)<10&&speed<2){m.stage=1;m.data.crew=[];for(let i=0;i<2;i++){const s=walkPointNear(m.tx,m.ty,3,8)||{x:m.tx+2,y:m.ty};const p=makePed(s.x,s.y,'civ');p.shirt='#1b1b1b';p.state='board';p.target=pc;peds.push(p);m.data.crew.push(p)}emit('toast','Die zwei kommen raus. Warte kurz!')}}
        else if(m.stage===1){if(!pc){m.fail('Ohne Fluchtwagen geht’s nicht.');return}for(const p of m.data.crew)p.target=pc;if(m.data.crew.every(p=>p.boarded)){m.stage=2;G.heat=Math.max(G.heat,3.2);G.lastSeen=0;emit('toast','Alle drin – Polizei alarmiert!')}}
        else{const z=m.data.dest;m.tx=z.x;m.ty=z.y;if(pc&&hypot(pc.x-z.x,pc.y-z.y)<z.r&&speed<2.5){if(stars()>0){if(!m.data.warned){m.data.warned=true;emit('toast','Erst die Polizei abhängen!')}}else m.win()}}
        break}
      case'flucht':if(stars()===0&&G.time-m.data.t0>5)m.win();break;
      case'taxi':{
        if(pc!==m.data.veh){m.fail('Taxi verlassen – Schicht beendet.',true);return}
        if(m.stage===0){const p=m.data.fare;if(!p||(!p.alive&&!p.boarded)){taxiNext();break}m.tx=p.x;m.ty=p.y;
          if(!p.boarded&&hypot(pc.x-p.x,pc.y-p.y)<8&&speed<1.5){p.state='board';p.target=pc;p.wave=false}
          if(p.boarded){m.stage=1;const dest=m.data.dest;m.tx=dest.x;m.ty=dest.y;m.time=hypot(dest.x-pc.x,dest.y-pc.y)/8.5+25;m.data.dist=hypot(dest.x-pc.x,dest.y-pc.y);emit('toast','Fahrgast: „'+pick(['Zum ','Bitte zum ','Schnell zum ','Einmal zum '])+dest.name+'!“')}}
        else{const d=m.data.dest;if(hypot(pc.x-d.x,pc.y-d.y)<10&&speed<2.5){const fare=Math.round(m.data.dist*0.9+m.time*3);addMoney(fare,pc.x,pc.y);m.fares++;sfx('cash');emit('toast','Fahrpreis +$'+fare);taxiNext()}}
        break}
      default:if(JOB_TYPES.includes(m.type))jobTick(m,dt,pc,speed);
    }
  },
  win(){const m=this;stats.missions++;addMoney(m.pay,player.x,player.y);emit('banner','Auftrag erledigt','+$'+m.pay,'#3ddc84');sfx('win');if(m.data.def&&STORY.includes(m.data.def))G.story++;else G.jobs++;m.end();save()},
  fail(why,quiet){const m=this;if(!quiet){emit('banner','Auftrag gescheitert',why,'#ff4136');sfx('fail')}else emit('toast',why);if(m.data.car)m.data.car.mission=false;if(m.data.crew)for(const p of m.data.crew)p.alive=false;if(m.data.fare)m.data.fare.wave=false,m.data.fare.state='walk';if(m.data.patient)m.data.patient.alive=false;if(m.data.burnCar){const bc=m.data.burnCar;bc.mission=false;if(bc.burn>0&&!bc.dead)explodeCar(bc)}m.end()},
  end(){if(this.type==='taxi'||JOB_TYPES.includes(this.type))G.jobCD=6;this.active=false;if(this.data.phone)this.data.phone.cd=20;this.data={};this.tx=this.ty=null}
};
const JOB_TYPES=['notarzt','feuer','bus','bier'];
const JOBS={taxi:{type:'taxi',title:'Taxi-Schicht',time:90,intro:'Halte bei winkenden Fahrgästen an und bring sie ans Ziel.'},
  krankenwagen:{type:'notarzt',title:'Rettungsdienst',time:90,intro:'Hol Verletzte ab und bring sie ins Klinikum. Hupe-Taste schaltet die Sirene.'},
  feuerwehr:{type:'feuer',title:'Feuerwehreinsätze',time:90,intro:'Fahr zum brennenden Auto und lösch es: Wasser-Taste gedrückt halten.'},
  bus:{type:'bus',title:'MVG-Linie',time:90,intro:'Fahr die Haltestellen an und halte kurz, bis alle eingestiegen sind.'},
  bierlaster:{type:'bier',title:'Bierlieferung',time:90,intro:'Bring die Fässer heil zum Wirtshaus – jeder Kratzer kostet Trinkgeld.'}};
// start / end a shift in a job vehicle by button, so the vehicle can also just be driven
function jobFor(c){return c&&!c.cop&&!(c.t&&c.t.plane)?JOBS[c.type]||null:null}
function onShift(){const pc=player.inCar;return!!(pc&&mission.active&&mission.data&&mission.data.veh===pc)}
function toggleJob(){
  if(G.state!=='play')return;const pc=player.inCar,j=jobFor(pc);if(!j)return;
  if(onShift()){const n=mission.fares||0,e=mission.earned||0;mission.end();sfx('beep');emit('toast','Schicht beendet'+(n?' · '+n+(n===1?' Auftrag':' Aufträge')+(e?' · +$'+e.toLocaleString('de-DE'):''):''));if(pc.type==='feuerwehr'||pc.type==='krankenwagen')pc.siren=false;return}
  if(mission.active){emit('toast','Erst den laufenden Auftrag abschließen');return}
  if(IH.act&&IH.act.busy()){emit('toast','Gerade nicht möglich');return}
  mission.start(Object.assign({pay:0},j));mission.data.veh=pc;if(pc.type==='feuerwehr')pc.siren=true}
const PUBS=[['Hofbräuhaus',600,650],['Augustiner',398,648],['Chinesischer Turm',655,312],['Schottenhamel-Festzelt',300,885],['Viktualienmarkt-Biergarten',598,706],['Paulaner am Nockherberg',960,1060],['Löwenbräukeller',372,505],['Hirschgarten',90,600]];
function roadSpot(cx,cy,rmin,rmax){for(let i=0;i<30;i++){const a=rand(0,Math.PI*2),d=rand(rmin,rmax);const ne=W.nearestEdge(cx+Math.cos(a)*d,cy+Math.sin(a)*d,30);if(!ne||ne.e.bridge||ne.e.oneway)continue;const e=ne.e;if(ne.s<e.clearA+6||ne.s>e.len-e.clearB-6)continue;const p=lanePt(e,true,0,ne.s);const o=e.w/2-1.2;return{x:p.x-p.ty*o,y:p.y+p.tx*o,a:Math.atan2(p.ty,p.tx)}}return null}
function jobNext(){
  const m=mission,pc=player.inCar;if(!pc){m.fail('Schicht beendet.',true);return}m.stage=0;m.data.hold=0;
  if(m.type==='notarzt'){let s=null;for(let i=0;i<20&&!s;i++){const p=walkPointNear(pc.x,pc.y,110,280);if(p&&W.nearestEdge(p.x,p.y,9))s=p}
    if(!s){m.fail('Gerade keine Einsätze.',true);return}const ped=makePed(s.x,s.y,'civ');ped.state='down';ped.downT=1e9;ped.wave=true;ped.patient=true;peds.push(ped);m.data.patient=ped;m.tx=s.x;m.ty=s.y;m.time=Math.max(m.time,hypot(s.x-pc.x,s.y-pc.y)/10+35);m.data.klinik=W.zones.find(z=>z.kind==='klinik')}
  else if(m.type==='feuer'){const s=roadSpot(pc.x,pc.y,120,280);if(!s){m.fail('Gerade keine Einsätze.',true);return}const c=makeCar(pick(['kompakt','limousine','transporter','suv']),s.x,s.y,s.a,{parked:true,mission:true});c.burn=100;cars.push(c);m.data.burnCar=c;m.tx=s.x;m.ty=s.y;m.time=Math.max(m.time,hypot(s.x-pc.x,s.y-pc.y)/9+45)}
  else if(m.type==='bus'){const s=roadSpot(pc.x,pc.y,140,260);if(!s){m.fail('Gerade keine Linie frei.',true);return}m.data.stop=s;m.tx=s.x;m.ty=s.y;m.data.dist=hypot(s.x-pc.x,s.y-pc.y);m.time=Math.max(m.time,m.data.dist/9+25)}
  else if(m.type==='bier'){const opts=PUBS.filter(p=>hypot(p[1]-pc.x,p[2]-pc.y)>250);const p=pick(opts.length?opts:PUBS);m.data.dest={name:p[0],x:p[1],y:p[2]};m.tx=p[1];m.ty=p[2];m.data.dist=hypot(p[1]-pc.x,p[2]-pc.y);m.data.hp0=pc.hp;m.time=m.data.dist/8.5+40}
}
function jobPay(m,v,msg){v=Math.round(v/5)*5;addMoney(v,player.x,player.y);m.fares++;m.earned+=v;stats.missions++;sfx('cash');emit('toast',msg+' +$'+v)}
function jobTick(m,dt,pc,speed){
  if(pc!==m.data.veh){m.fail('Fahrzeug verlassen – Schicht beendet.',true);return}
  if(m.type==='notarzt'){
    if(m.stage===0){const p=m.data.patient;if(!p||!p.alive){jobNext();return}m.tx=p.x;m.ty=p.y;if(hypot(pc.x-p.x,pc.y-p.y)<9&&speed<1.5){p.alive=false;m.data.patient=null;m.stage=1;const z=m.data.klinik;m.tx=z.x;m.ty=z.y;m.data.dist=hypot(z.x-pc.x,z.y-pc.y);m.time=Math.max(m.time,m.data.dist/9+25);sfx('door');emit('toast','Patient an Bord – ab ins Klinikum!')}}
    else{const z=m.data.klinik;if(hypot(pc.x-z.x,pc.y-z.y)<z.r+2&&speed<2.5){jobPay(m,150+m.data.dist*0.5+m.time*4,'Patient gerettet');jobNext()}}}
  else if(m.type==='feuer'){const c=m.data.burnCar;if(!c||!cars.includes(c)||c.dead){m.data.burnCar=null;m.fail('Das Auto ist ausgebrannt.');return}if(c.burn<=0){c.mission=false;m.data.burnCar=null;jobPay(m,200+m.time*4,'Feuer gelöscht');jobNext()}}
  else if(m.type==='bus'){const s=m.data.stop;if(hypot(pc.x-s.x,pc.y-s.y)<9&&speed<1.5){m.data.hold+=dt;if(m.data.hold>2.2){jobPay(m,60+m.data.dist*0.35,'Haltestelle bedient');if(m.fares%6===0){addMoney(300,pc.x,pc.y);emit('toast','Runde geschafft · Bonus +$300')}jobNext()}}else m.data.hold=0}
  else if(m.type==='bier'){const d=m.data.dest;if(hypot(pc.x-d.x,pc.y-d.y)<12&&speed<2){const frac=clamp(pc.hp/Math.max(1,m.data.hp0),0.2,1);jobPay(m,(250+m.data.dist*0.45)*frac,frac<0.95?'Geliefert, aber ein paar Fässer sind hin':'Lieferung angekommen');pc.hp=Math.max(pc.hp,m.data.hp0);jobNext()}}
}
function taxiNext(){
  const m=mission,pc=player.inCar;m.stage=0;
  let s=null;for(let i=0;i<20&&!s;i++){const p=walkPointNear(pc.x,pc.y,90,260);if(p&&W.nearestEdge(p.x,p.y,9))s=p}
  if(!s){m.fail('Keine Fahrgäste in der Nähe.',true);return}
  const ped=makePed(s.x,s.y,'civ');ped.state='wave';ped.wave=true;peds.push(ped);m.data.fare=ped;m.time=Math.max(m.time,hypot(s.x-pc.x,s.y-pc.y)/9+30);
  let dest=null;for(let i=0;i<30;i++){const pl=pick(W.places);const d=hypot(pl.x-s.x,pl.y-s.y);if(d>300&&d<1000){dest=pl;break}}m.data.dest=dest||pick(W.places);
}
function randomJob(){
  const r=Math.random(),pl=pick(W.places.filter(p=>hypot(p.x-player.x,p.y-player.y)>500));
  if(r<0.3){const a=pick(W.places.filter(p=>hypot(p.x-player.x,p.y-player.y)<450&&p!==pl))||pl;return{type:'kurier',title:'Kurierfahrt',from:a.name,to:pl.name,time:Math.round(hypot(a.x-player.x,a.y-player.y)/11+hypot(pl.x-a.x,pl.y-a.y)/12+25),pay:Math.round((200+hypot(pl.x-a.x,pl.y-a.y)*0.6)/10)*10,intro:'Bring ein Paket von '+a.name+' nach '+pl.name+'.'}}
  if(r<0.5)return{type:'rennen',title:'Sprint: '+pl.name,toPlace:pl,time:Math.round(hypot(pl.x-player.x,pl.y-player.y)/16+20),pay:600,intro:'Fahr durch alle Kontrollpunkte bis '+pl.name+'.'};
  if(r<0.65)return{type:'randale',title:'Randale',need:8,time:50,pay:500,intro:'Zerstör acht Straßenmöbel in 50 Sekunden.'};
  if(r<0.8)return{type:'sportwagen',title:'Auto besorgen',near:[pl.x,pl.y],color:pick(['#d42a22','#f2b705','#1d5fd1']),time:200,pay:1100,intro:'Bei '+pl.name+' parkt ein Sportwagen. Bring ihn zum Hehler.'};
  return{type:'flucht',title:'Abhängen',stars:3,time:100,pay:900,intro:'Drei Sterne. Häng die Polizei in 100 Sekunden ab.'};
}
function nearestBankWalk(x,y){for(let r=2;r<80;r+=2)for(let k=0;k<16;k++){const a=k/16*Math.PI*2;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;const t=at(px,py);if(t===TY.BANK||t===TY.WALK||t===TY.PARK||t===TY.GRASS)return{x:px,y:py}}return{x,y}}

/* ================= shops ================= */
const PAINTS=[['Rot','#c0221b'],['Gelb','#f2b705'],['Blau','#1d5fd1'],['Grün','#2f7a3e'],['Schwarz','#17181b'],['Weiß','#ecebe6'],['Silber','#b5b9bd'],['Orange','#e2711d'],['Petrol','#1f5d63'],['Violett','#5b3a8c'],['Pink','#d94f8c'],['Bordeaux','#6e1a26']];
function repaint(c,col){c.color=col;if(c.cop){c.cop=false;c.type=c.type==='polizei'?'limousine':c.type;c.t=CT[c.type];c.label=null;c.siren=false}G.heat=0;G.callT=0;G.lastSeen=0;G.viol=0;emit('carchange')}
const SHOP={
  waffen:{title:'Büchsenmacher',items:[
    {id:'pistole',name:'Pistole + 36 Schuss',desc:'Solide, präzise, leise genug.',price:120,buy:()=>{player.ammo[1]+=36;player.weapon=1}},
    {id:'schrot',name:'Schrotflinte + 16 Patronen',desc:'Kurze Reichweite, große Wirkung.',price:350,buy:()=>{player.ammo[2]+=16;player.weapon=2}},
    {id:'mp',name:'Maschinenpistole + 120 Schuss',desc:'Dauerfeuer für Notfälle.',price:500,buy:()=>{player.ammo[3]+=120;player.weapon=3}},
    {id:'schlaeger',name:'Baseballschläger',desc:'Leise, zuverlässig, beult Autos aus.',price:80,buy:()=>{player.ammo[5]=Infinity;player.weapon=5}},
    {id:'gewehr',name:'Gewehr + 10 Schuss',desc:'Trifft auch auf 90 Meter.',price:900,buy:()=>{player.ammo[6]+=10;player.weapon=6}},
    {id:'molotow',name:'5 Molotows',desc:'Setzt den Boden ein paar Sekunden in Brand.',price:300,buy:()=>{player.ammo[7]+=5;player.weapon=7}},
    {id:'granate',name:'5 Granaten',desc:'Werfen mit Feuer, explodieren nach 1,7 s.',price:400,buy:()=>{player.ammo[4]+=5;player.weapon=4}},
    {id:'weste',name:'Schutzweste',desc:'Fängt 70 % des Schadens ab.',price:250,buy:()=>{player.armor=100}}]},
  imbiss:{title:'Brotzeit',items:[
    {id:'brezn',name:'Brezn',desc:'+15 Gesundheit',price:4,buy:()=>{player.hp=Math.min(100,player.hp+15)}},
    {id:'leberkas',name:'Leberkässemmel',desc:'+40 Gesundheit',price:9,buy:()=>{player.hp=Math.min(100,player.hp+40)}},
    {id:'weisswurst',name:'Weißwurstfrühstück',desc:'Volle Gesundheit',price:18,buy:()=>{player.hp=100}}]},
  werkstatt:{title:'Werkstatt',items:[
    {id:'repair',name:'Reparieren',desc:'Schaden komplett beheben.',price:()=>{const c=player.inCar;return c?Math.max(40,Math.round((c.maxHp-c.hp)*4/10)*10):0},buy:()=>{const c=player.inCar;c.hp=c.maxHp;c.fire=0}},
    {id:'eng',name:'Motor-Tuning',desc:'+15 % Spitze, +25 % Beschleunigung.',price:700,once:'eng',buy:()=>{player.inCar.up.eng=1}},
    {id:'brk',name:'Sportbremsen',desc:'Bremsweg deutlich kürzer.',price:350,once:'brk',buy:()=>{player.inCar.up.brk=1}},
    {id:'arm',name:'Panzerung',desc:'+60 % Haltbarkeit, inklusive Reparatur.',price:900,once:'arm',buy:()=>{const c=player.inCar;c.up.arm=1;c.maxHp=c.t.hp*1.6;c.hp=c.maxHp}},
    {id:'nitro',name:'Nitro (3 Ladungen)',desc:'Kurzer Schub per Nitro-Taste.',price:500,buy:()=>{player.inCar.up.nitro+=3}}]},
};
function shopPrice(it){return typeof it.price==='function'?it.price():it.price}
SHOP.lack={title:'Lackiererei',paints:PAINTS,price:250,items:[]};
function shopBuy(kind,id,arg){
  if(kind==='lack'){const c=player.inCar;if(!c)return'Kein Auto';if(player.money<250)return'Zu wenig Geld';addMoney(-250);repaint(c,arg||pick(PAINTS)[1]);sfx('cash');save();return'ok'}
  const it=SHOP[kind].items.find(i=>i.id===id);if(!it)return'';const p=shopPrice(it);
  if(kind==='werkstatt'&&!player.inCar)return'Kein Auto';
  if(it.once&&player.inCar&&player.inCar.up[it.once])return'Schon eingebaut';
  if(player.money<p)return'Zu wenig Geld';addMoney(-p);it.buy();sfx('cash');save();return'ok'}

/* ================= save / load ================= */
const SAVE_KEY='2isar2heat.save';
const PROPS=W.properties;const propById=id=>PROPS.find(p=>p.id===id);
G.owned=new Set(['lehel']);G.home='lehel';G.stunts=new Set();G.pkgs=new Set();
const stats=IH.stats={kills:0,deaths:0,busted:0,missions:0,cars:0};
function inGarage(c,p){return hypot(c.x-p.gx,c.y-p.gy)<p.gr}
function collectGarages(mark){
  const out={};
  for(const id of G.owned){const p=propById(id);if(!p)continue;const list=[];
    for(const c of cars){if(c.dead||c.sink||c.mission||!(c.driver===null||c.driver==='player'))continue;if(inGarage(c,p)&&list.length<p.slots){list.push({type:c.type,color:c.color,up:Object.assign({},c.up)});if(mark)c.saved=true}}
    out[id]=list}
  return out;
}
function saveData(){
  return{v:2,t:Date.now(),money:player.money,ammo:player.ammo.map(a=>a===Infinity?-1:a),armor:player.armor,story:G.story,jobs:G.jobs,best:G.best,
    owned:[...G.owned],home:G.home,garages:collectGarages(true),stunts:[...G.stunts],pkgs:[...G.pkgs],shirt:player.shirt,stats:Object.assign({},stats),incomeDay:G.incomeDay||0,name:(IH.settings&&IH.settings.name)||''};
}
function save(){
  if(G.state==='menu')return;
  const s=saveData();
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(s))}catch(e){}
  emit('saved',s);return s;
}
function normalizeSave(s){
  if(!s||typeof s!=='object')return null;
  if(s.v===1){return{v:2,t:0,money:s.money|0,ammo:s.ammo,armor:s.armor||0,story:s.story|0,jobs:s.jobs|0,best:s.best|0,owned:['lehel'],home:'lehel',garages:{lehel:s.garage||[]},shirt:null,stats:{},incomeDay:0}}
  if(s.v!==2||!Array.isArray(s.ammo))return null;return s;
}
function loadSave(){try{return normalizeSave(JSON.parse(localStorage.getItem(SAVE_KEY)||'null'))}catch(e){return null}}
function storeSave(s){s=normalizeSave(s);if(!s)return false;try{localStorage.setItem(SAVE_KEY,JSON.stringify(s));return true}catch(e){return false}}

/* ================= properties ================= */
function propDoorNear(){if(!onFoot())return null;for(const p of PROPS)if(hypot(player.x-p.x,player.y-p.y)<2.3)return p;return null}
function inSafeZone(){if(G.state!=='play')return false;if(IH.act&&IH.act.inside)return true;const src=player.inCar||player;for(const id of G.owned){const p=propById(id);if(!p)continue;if(hypot(src.x-p.x,src.y-p.y)<14||hypot(src.x-p.gx,src.y-p.gy)<p.gr+2)return true}return false}
function copsClose(r){for(const p of peds)if(p.kind==='cop'&&!isDown(p)&&hypot(p.x-player.x,p.y-player.y)<r&&hasLOS(p.x,p.y,player.x,player.y))return true;for(const c of activeCars)if(c.cop&&(c.driver==='cop'||c.driver==='copIdle')&&hypot(c.x-player.x,c.y-player.y)<r&&hasLOS(c.x,c.y,player.x,player.y))return true;return false}
function buyProperty(id){const p=propById(id);if(!p)return'';if(G.owned.has(id))return'Gehört dir schon';if(player.money<p.price)return'Zu wenig Geld';addMoney(-p.price);G.owned.add(id);sfx('cash');save();emit('owned',id);return'ok'}
function setHome(id){if(G.owned.has(id)){G.home=id;save();emit('owned',id);return'ok'}return''}
function restAt(){player.hp=100;sfx('pick');save()}
function setShirt(col){player.shirt=col;emit('outfit');save()}
function payIncome(){
  const day=Math.floor(Date.now()/1440000);
  if(!G.incomeDay){G.incomeDay=day;return}
  if(day>G.incomeDay){let sum=0;for(const id of G.owned){const p=propById(id);if(p&&p.income)sum+=p.income}G.incomeDay=day;if(sum>0){addMoney(sum,player.x,player.y);emit('toast','Mieteinnahmen +$'+sum);sfx('cash');save()}}
}

/* ================= game flow ================= */
function placePlayer(x,y){player.x=x;player.y=y;player.lx=x;player.ly=y;player.vx=player.vy=0;player.inCar=null;player.hp=100;player.arrestT=0;player.stun=0;IH.cam.snap=true}
function resetWorld(){
  cars.length=0;peds.length=0;bullets.length=0;grenades.length=0;parts.length=0;skids.length=0;floaters.length=0;decals.length=0;G.planeT=0.3;G.planesOnce=false;
  for(const l of W.lots)for(const s of l.slots){s.car=null;s.reserved=!!s.prop}
  for(const p of W.props){if(p.k!=='tree'){p.broken=false;p.spray=0}}
  emit('propsReset');
}
function spawnGarages(sv){
  const gar=sv&&sv.garages?sv.garages:{lehel:[{type:'limousine',color:'#2c6e9e',up:{eng:0,brk:0,arm:0,nitro:0}}]};
  for(const id of G.owned){const p=propById(id);if(!p)continue;const list=(gar[id]||[]).slice(0,p.slots);
    list.forEach((g,i)=>{const sl=p.lot.slots[i];if(!sl||!CT[g.type])return;const c=makeCar(g.type,sl.x,sl.y,sl.a,{parked:true,color:g.color,up:Object.assign({eng:0,brk:0,arm:0,nitro:0},g.up)});c.saved=true;c.home=id;cars.push(c);sl.car=c})}
}
function placeAtHome(){
  const p=propById(G.home)||propById('lehel');
  const c0=cars.find(c=>c.home===p.id);
  if(c0)for(const sd of[1,-1]){const x=c0.x-Math.sin(c0.a)*sd*(c0.t.wid/2+1.1),y=c0.y+Math.cos(c0.a)*sd*(c0.t.wid/2+1.1);if(!pedBlocked(x,y,false)&&!cars.some(o=>o!==c0&&pointInCar(o,x,y,0.3))){placePlayer(x,y);player.a=c0.a;return}}
  placePlayer(p.x,p.y);
}
function newGame(cont,given){
  const s=cont?(given?normalizeSave(given):loadSave()):null;
  G.heat=0;G.callT=0;G.lastSeen=0;G.viol=0;G.story=s?s.story:0;G.jobs=s?s.jobs:0;G.best=s?s.best||0:0;
  player.money=s?s.money:150;player.ammo=s?s.ammo.map(a=>a<0?Infinity:a):[Infinity,24,0,0,0,0,0,0];while(player.ammo.length<WEAP.length)player.ammo.push(0);
  G.stunts=new Set(s&&s.stunts||[]);G.pkgs=new Set(s&&s.pkgs||[]);player.stam=1;player.breakIn=null;heli.on=false;heli.cool=0;fires.length=0;player.armor=s?s.armor:0;player.weapon=player.ammo[1]>0?1:0;
  G.owned=new Set(['lehel'].concat(s&&s.owned?s.owned.filter(id=>propById(id)):[]));G.home=s&&G.owned.has(s.home)?s.home:'lehel';G.incomeDay=s?s.incomeDay||0:0;
  player.shirt=s&&s.shirt?s.shirt:'#ff8a1c';Object.assign(stats,{kills:0,deaths:0,busted:0,missions:0,cars:0},s&&s.stats||{});emit('outfit');
  mission.active=false;for(const ph of W.phones)ph.cd=0;for(const p of W.pickups)p.cd=0;
  G.state='play';G.paused=false;G.propNear=null;
  resetWorld();spawnGarages(s);placeAtHome();depotT=0;for(const z of W.zones)z.vehs=[];
  fillLots(true);for(let i=0;i<22;i++)spawnTraffic(false,player.x,player.y,40,240);
  IH.cam.snap=true;emit('owned');
  emit('banner',s?'Willkommen zurück':'Servus in 2Isar2Heat',s?'Dein Spielstand ist geladen.':'Deine Wohnung und Garage sind gleich hier. Grüne Telefonzellen bringen Aufträge.','#ffc61a');
}
function clearPolice(){for(let i=cars.length-1;i>=0;i--){const c=cars[i];if(c.cop&&(c.driver==='cop'||c.driver==='copIdle'||c.driver==='block'))cars.splice(i,1)}for(let i=peds.length-1;i>=0;i--)if(peds[i].kind==='cop')peds.splice(i,1);G.heat=0;G.callT=0;G.lastSeen=0;G.viol=0}
function busted(){
  if(G.state!=='play')return;G.state='dead';G.deadKind='busted';G.deadT=3.4;
  const loss=Math.min(player.money,300);addMoney(-loss);player.ammo=[Infinity,0,0,0,0,0,0,0];player.weapon=0;player.armor=0;
  if(player.inCar){player.inCar.driver=null;player.inCar=null;emit('carchange')}
  if(mission.active){mission.end()}
  stats.busted++;emit('banner','Verhaftet!','−$'+loss+' Kaution · Waffen beschlagnahmt','#3b82ff');sfx('fail');
}
function wasted(why){
  if(G.state!=='play')return;
  if(player.lastAtt&&G.time-(player.lastAttT||-99)<8){emit('net','kill',{by:player.lastAtt,s:stars()});player.lastAtt=null}G.state='dead';G.deadKind='wasted';G.deadT=3.4;player.hp=0;
  const loss=Math.min(player.money,200);addMoney(-loss);
  if(player.inCar){player.x=player.inCar.x;player.y=player.inCar.y;player.inCar.driver=null;player.inCar=null;emit('carchange')}
  if(mission.active)mission.end();
  stats.deaths++;emit('banner','Erledigt!',why+' −$'+loss+' Behandlung','#ff4136');sfx('fail');
}
function respawn(){clearPolice();const h=propById(G.home)||propById('lehel');placePlayer(h.x,h.y);G.state='play';emit('toast',G.deadKind==='busted'?'Auf Kaution frei – zurück in '+h.name:'Wieder fit – zuhause in '+h.name);save()}

/* ================= main update ================= */
function update(dt){
  G.time+=dt;const f=focus();
  activeCars=cars.filter(c=>Math.abs(c.x-f.x)<330&&Math.abs(c.y-f.y)<330);
  if(G.state==='play')updatePlayer(dt);else if(G.state==='dead'){G.deadT-=dt;if(G.deadT<=0)respawn()}
  for(const c of activeCars){
    if(c.sink){c.sink+=dt;c.vx*=0.92;c.vy*=0.92;c.x+=c.vx*dt;c.y+=c.vy*dt;continue}
    if(c.t.plane){if(c.sink){c.sink+=dt;continue}planeStep(c,dt);if(c.fire>0&&!c.dead){c.fire-=dt;smoke(c.x,c.y,(c.z||0)+2,true);if(c.fire<=0)explodeCar(c)}continue}
    if(c.air){c.vz-=20*dt;c.z+=c.vz*dt;c.airT+=dt;moveCar(c,dt);if(c.z<=0)landCar(c);continue}
    if(c.alarm>0){c.alarm-=dt;c.alarmT=(c.alarmT||0)-dt;if(c.alarmT<=0){c.alarmT=0.45;sfx('alarm',0.9,c.x,c.y)}}
    if(c.burn>0&&!c.dead){c.burnT=(c.burnT||0)-dt;if(c.burnT<=0){c.burnT=0.06;fire(c.x+rand(-1,1),c.y+rand(-1,1),c.t.ht*0.8);if(Math.random()<0.5)smoke(c.x,c.y,c.t.ht,true,true)}}
    if(c.parked&&!c.driver&&Math.abs(c.vx)+Math.abs(c.vy)<0.05){c.vx=c.vy=0;continue}
    if(c.dead){driveCar(c,0,0,true,dt,true);c.vx*=Math.exp(-2*dt);c.vy*=Math.exp(-2*dt)}
    else if(c.driver==='ai')aiDrive(c,dt);
    else if(c.driver==='cop')copDrive(c,dt);
    else if(c.driver!=='player')driveCar(c,0,0,true,dt,true);
    moveCar(c,dt);
    if(c.eject){const imp=c.eject;c.eject=0;ejectRider(c,imp)}
    if(at(c.x,c.y)===TY.WATER&&!c.sink){c.sink=0.01;sfx('splash',1,c.x,c.y);for(let i=0;i<24;i++)water(c.x,c.y,0.3,true);if(c===player.inCar&&!(mission.active&&mission.type==='bombe'&&mission.data.car===c))wasted('In der Isar versenkt.');if(c.driver&&c.driver!=='player')c.driver=null}
    if(!c.dead){
      c.smokeT-=dt;const fz=c.t.ht*0.7;
      if(c.hp<c.maxHp*0.45&&c.smokeT<=0){c.smokeT=c.fire?0.05:0.14;const fx=c.x+Math.cos(c.a)*c.t.len*0.32,fy=c.y+Math.sin(c.a)*c.t.len*0.32;smoke(fx,fy,fz,c.fire>0);if(c.fire>0)fire(fx,fy,fz)}
      if(c.fire>0){c.fire-=dt;if(c.fire<=0)explodeCar(c)}
      if(c.nitroT>0&&Math.random()<0.6)addPart({k:'fire',x:c.x-Math.cos(c.a)*c.t.len/2,y:c.y-Math.sin(c.a)*c.t.len/2,z:0.4,vx:-Math.cos(c.a)*3,vy:-Math.sin(c.a)*3,vz:0,life:0.2,max:0.2,size:0.5,grow:-1});
    }else{c.smokeT-=dt;if(c.smokeT<=0){c.smokeT=0.25;smoke(c.x,c.y,0.8,true)}}
    const lat=Math.abs(c.vl||0);
    if(!c.dead&&(lat>6.5||(c.brake&&Math.abs(c.vf||0)>13))){
      const ca=Math.cos(c.a),sa=Math.sin(c.a),bx=c.x-ca*c.t.len*0.32,by=c.y-sa*c.t.len*0.32,hw=c.t.wid*0.4;
      const Lp={x:bx+sa*hw,y:by-ca*hw},Rp={x:bx-sa*hw,y:by+ca*hw};
      if(c.rearL)skids.push([c.rearL.x,c.rearL.y,Lp.x,Lp.y],[c.rearR.x,c.rearR.y,Rp.x,Rp.y]);c.rearL=Lp;c.rearR=Rp;if(skids.length>1200)skids.splice(0,60);
      if(c===player.inCar&&lat>8)emit('skid');
    }else c.rearL=c.rearR=null;
    collideCarProps(c);
  }
  {const ground=activeCars.filter(c=>!(c.t.plane&&(c.z||0)>2));collideCars(ground);collideRemote(ground)}
  {const A=W.airport;if(A&&A.gate){const src=player.inCar||player;const open=G.state==='play'&&hypot(src.x-A.gate.x,src.y-(A.gate.y0+A.gate.y1)/2)<18;if(open!==!!A.gateOpen){A.gateOpen=open;for(const i of A.gate.cells)W.grid[i]=open?TY.FIELD:TY.RAIL}}}
  G.planeT=(G.planeT||0)-dt;if(G.planeT<=0){G.planeT=5;spawnPlanes(!G.planesOnce);G.planesOnce=true}
  for(let i=cars.length-1;i>=0;i--){
    const c=cars[i];if(c.sink>1.6){if(c===player.inCar){player.inCar=null;emit('carchange')}cars.splice(i,1);continue}
    if(c===player.inCar||c.mission||c.saved||c.depot)continue;
    const d=hypot(c.x-f.x,c.y-f.y);
    if((c.driver==='ai'||c.driver==='cop'||c.driver==='block')&&d>360)cars.splice(i,1);
    else if(c.driver==='ai'&&c.wait>20&&d>90)cars.splice(i,1);
    else if((c.dead||(!c.parked&&!c.driver))&&d>420)cars.splice(i,1);
  }
  let traffic=0;for(const c of activeCars)if(c.driver==='ai'&&!c.cop)traffic++;
  if(traffic<26&&Math.random()<0.3)spawnTraffic(false);
  let patrols=0;for(const c of activeCars)if(c.cop&&c.driver==='ai')patrols++;
  if(patrols<2&&stars()===0&&Math.random()<0.01)spawnTraffic(true);
  let civs=0;
  for(const p of peds){updatePed(p,dt);if(p.kind==='civ'&&!p.crowd)civs++;if(!p.wave&&p.state!=='board'&&hypot(p.x-f.x,p.y-f.y)>200)p.alive=false}
  for(let i=peds.length-1;i>=0;i--)if(!peds[i].alive)peds.splice(i,1);
  const busy=hypot(f.x-520,f.y-640)<230;
  if(civs<(busy?62:42)&&Math.random()<0.5){const s=walkPointNear(f.x,f.y,busy?30:55,150);if(s)peds.push(makePed(s.x,s.y,'civ'))}
  crowdTick(f);fireTick(dt);heliTick(dt);planeTick(dt);
  collidePedsCars(activeCars);collideRemotePeds();
  updateBullets(dt,activeCars);
  for(const p of W.props){if(p.spray>0){p.spray-=dt;if(Math.abs(p.x-f.x)<80&&Math.abs(p.y-f.y)<80)for(let i=0;i<2;i++)water(p.x,p.y,0.5,true)}}
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.life-=dt;if(p.life<=0){parts.splice(i,1);continue}p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(p.grav){p.vz-=14*dt;if(p.z<0.05){p.z=0.05;p.vz*=-0.3;p.vx*=0.6;p.vy*=0.6}}if(p.k==='deb'||p.k==='spark'){p.vx*=Math.exp(-3*dt);p.vy*=Math.exp(-3*dt)}if(p.grow)p.size=Math.max(0.05,p.size+p.grow*dt)}
  for(let i=floaters.length-1;i>=0;i--){const fl=floaters[i];fl.t-=dt;if(fl.t<=0)floaters.splice(i,1)}
  if(G.state==='play'){
    policeTick(dt);mission.tick(dt);depotTick(dt);G.jobCD=(G.jobCD||0)-dt;
    {const src=player.inCar||player;for(const pk of inPlane()?[]:W.packages){if(G.pkgs.has(pk.i))continue;if(Math.abs(src.x-pk.x)<2.4&&Math.abs(src.y-pk.y)<2.4){G.pkgs.add(pk.i);const n=G.pkgs.size;addMoney(100,pk.x,pk.y);sfx('pick');if(n===W.packages.length){addMoney(10000,pk.x,pk.y);emit('banner','Alle Weißwurst-Tüten!','+$10.000 · Respekt.','#ffc61a');sfx('win')}else emit('toast','Weißwurst-Tüte '+n+' von '+W.packages.length);save()}}}
    // phones
    for(const ph of W.phones){ph.cd=(ph.cd||0)-dt;if(!mission.active&&ph.cd<=0&&!inPlane()&&!(IH.act&&IH.act.busy())&&hypot(player.x-ph.x,player.y-ph.y)<(player.inCar?5:2.4)){const def=mission.next()||randomJob();mission.start(def,ph)}}
    // pickups
    for(const p of W.pickups){p.cd=(p.cd||0)-dt;if(p.cd<=0&&!inPlane()&&hypot(player.x-p.x,player.y-p.y)<1.8){
      if(p.k==='health'){if(player.hp>=100)continue;player.hp=Math.min(100,player.hp+50);emit('toast','Erste Hilfe +50')}
      else if(p.k==='armor'){if(player.armor>=100)continue;player.armor=100;emit('toast','Schutzweste')}
      else if(p.k==='pistol'){player.ammo[1]+=24;if(player.weapon===0)player.weapon=1;emit('toast','Pistole +24')}
      else if(p.k==='smg'){player.ammo[3]+=90;player.weapon=3;emit('toast','MP +90')}
      else if(p.k==='shotgun'){player.ammo[2]+=12;player.weapon=2;emit('toast','Schrotflinte +12')}
      else{player.ammo[4]+=3;emit('toast','Granaten +3')}
      p.cd=45;sfx('pick')}}
    // shops and zones
    let near=null;
    if(onFoot()){for(const s of W.shops)if(hypot(player.x-s.x,player.y-s.y)<2)near=s}
    else if(!inPlane()){const c=player.inCar;for(const z of W.zones)if((z.kind==='werkstatt'||z.kind==='lack')&&hypot(c.x-z.x,c.y-z.y)<z.r&&hypot(c.vx,c.vy)<2.5)near=z}
    if(near&&G.shopNear!==near){G.shopNear=near;emit('shop',near.k||near.kind,near.name)}
    if(!near)G.shopNear=null;
    // own garages: park inside to keep the car
    {const c=inPlane()?null:player.inCar;let gz=null;if(c)for(const id of G.owned){const p=propById(id);if(p&&hypot(c.x-p.gx,c.y-p.gy)<p.gr)gz=p}
     if(gz&&hypot(c.vx,c.vy)<1){if(G.zoneIn!==gz){G.zoneIn=gz;const n=cars.filter(o=>o!==c&&!o.dead&&o.saved&&inGarage(o,gz)).length;if(n>=gz.slots)emit('toast','Garage voll ('+gz.slots+' Plätze) – Auto wird nicht gespeichert');else{c.home=gz.id;save();emit('toast','In der Garage – Auto und Spielstand gesichert')}}}
     else if(!gz)G.zoneIn=null}
    // front doors of homes
    {const p=propDoorNear();
     if(p&&G.propNear!==p){G.propNear=p;
       if(G.owned.has(p.id)&&stars()>0){if(copsClose(24))emit('toast','Die Polizei ist zu nah – erst abhängen!');else{G.heat=0;G.callT=0;G.lastSeen=0;G.viol=0;emit('toast','Untergetaucht – die Polizei hat deine Spur verloren');emit('property',p)}}
       else emit('property',p)}
     if(!p)G.propNear=null}
    payIncome();
    // taxi side job
    // job vehicles (taxi, ambulance, fire engine, bus, beer truck) no longer start a shift by themselves: see toggleJob()
    G.saveT=(G.saveT||0)-dt;if(G.saveT<=0){G.saveT=12;save()}
  }
  if(Math.random()<0.03)fillLots(false);
}

IH.sim={jobFor,onShift,toggleJob,spawnPlanes,planes,G,cars,peds,bullets,grenades,parts,decals,skids,floaters,player,mission,STORY,SHOP,WEAP,CT,stars,update,newGame,save,loadSave,lightState,shopBuy,shopPrice,nearestCarFor,
  spawnTraffic,fillLots,resetWorld,enterExit,get activeCars(){return activeCars},hasLOS,input,remote,remoteShot,remoteGrenade,remoteBoom,leaveRemoteCar,addMoney,pointInCar,
  PAINTS,stats,heli,fires,JOBS,makeCar,createFire,saveData,storeSave,normalizeSave,buyProperty,setHome,restAt,setShirt,inSafeZone,propById,astar,nearestNodeTo,pathPolyline};
})(window));
