/* 2Isar2Heat — online mode.
   One global lobby without an own server: every client publishes to the same MQTT topic tree on several
   free public brokers (over secure WebSockets) at once and listens to all of them. Messages are de-duplicated
   by sender id and sequence number, so it does not matter which broker delivers first.
   Every player runs their own city (traffic, police, missions); only the players themselves, their shots,
   grenades, explosions, kills and quick-chat are shared. */
(window.IH_MODS=window.IH_MODS||[]).push(()=>(function(root){
'use strict';
const IH=root.IH;
const BASE='2isar2heat/v1/';
const DEFAULT_BROKERS=['wss://broker.emqx.io:8084/mqtt','wss://broker.hivemq.com:8884/mqtt','wss://test.mosquitto.org:8081/mqtt'];
const CAR_TYPES=['kompakt','limousine','sport','taxi','transporter','polizei','motorrad','suv','super','bus','bierlaster','krankenwagen','feuerwehr','polsuv','cessna','regio','jet','kampfheli'];
const CHAT=['Servus!','Rennen?','Folg mir!','Hilfe!','Gut gemacht!','Pass auf!','Haha 😄','Pfiat di!'];
const COLORS=['#ff8a1c','#3ddc84','#3b82ff','#ff4fa3','#ffd21a','#20d3d3','#b36bff','#ff5a4f','#9be15d','#f2f2f2'];
const te=new TextEncoder(),td=new TextDecoder();
const now=()=>performance.now();
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const num=(v,a,b,d)=>typeof v==='number'&&isFinite(v)?clamp(v,a,b):d;
function rid(){const a='abcdefghijkmnpqrstuvwxyz23456789';let s='';const r=new Uint8Array(10);(root.crypto||{getRandomValues:x=>{for(let i=0;i<x.length;i++)x[i]=Math.random()*256|0;return x}}).getRandomValues(r);for(const b of r)s+=a[b%a.length];return s}
function hashStr(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function cleanName(n){n=String(n||'').replace(/[\u0000-\u001f\u007f<>]/g,'').replace(/\s+/g,' ').trim();return n.slice(0,16)||'Gast'}

/* ---------- minimal MQTT 3.1.1 over WebSocket (QoS 0) ---------- */
function varint(n){const out=[];do{let b=n%128;n=Math.floor(n/128);if(n>0)b|=128;out.push(b)}while(n>0);return out}
function mstr(s){const b=te.encode(s);return[b.length>>8,b.length&255].concat(Array.from(b))}
function pkt(type,body){const h=[type].concat(varint(body.length));const out=new Uint8Array(h.length+body.length);out.set(h,0);out.set(body,h.length);return out}
class Link{
  constructor(url,net){this.url=url;this.net=net;this.ws=null;this.state='idle';this.buf=new Uint8Array(0);this.retry=0;this.nextTry=0;this.lastRx=0;this.pingAt=0;this.openAt=0}
  open(){
    this.state='connecting';this.openAt=now();this.buf=new Uint8Array(0);let ws;
    try{ws=new WebSocket(this.url,['mqtt'])}catch(e){this.fail();return}
    ws.binaryType='arraybuffer';this.ws=ws;
    ws.onopen=()=>{const n=this.net;const body=[].concat(mstr('MQTT'),[4,0x06,0,45],mstr(n.clientId),mstr(BASE+'b/'+n.id),mstr(JSON.stringify({i:n.id})));this.raw(pkt(0x10,body))};
    ws.onmessage=e=>{if(e.data instanceof ArrayBuffer)this.recv(new Uint8Array(e.data))};
    ws.onerror=()=>{};ws.onclose=()=>{if(this.ws===ws)this.fail()};
  }
  fail(){if(this.ws){const w=this.ws;this.ws=null;w.onclose=null;w.onmessage=null;try{w.close()}catch(e){}}const was=this.state;this.state='down';this.retry=Math.min(this.retry+1,6);this.nextTry=now()+1500*Math.pow(1.8,this.retry)+Math.random()*1000;if(was==='up')this.net.linkChanged()}
  raw(b){if(this.ws&&this.ws.readyState===1){try{this.ws.send(b)}catch(e){}}}
  recv(chunk){
    const nb=new Uint8Array(this.buf.length+chunk.length);nb.set(this.buf,0);nb.set(chunk,this.buf.length);this.buf=nb;
    for(;;){if(this.buf.length<2)break;let mul=1,len=0,i=1,ok=false;for(;i<5&&i<this.buf.length;i++){const b=this.buf[i];len+=(b&127)*mul;mul*=128;if(!(b&128)){ok=true;break}}
      if(!ok){if(i>=5){this.fail()}break}
      const total=i+1+len;if(this.buf.length<total)break;
      this.handle(this.buf[0],this.buf.subarray(i+1,total));this.buf=this.buf.slice(total)}
  }
  handle(t,body){
    this.lastRx=now();const kind=t>>4;
    if(kind===2){if(body.length>=2&&body[1]===0){this.state='up';this.retry=0;this.raw(pkt(0x82,[0,1].concat(mstr(BASE+'#'),[0])));this.net.linkChanged()}else this.fail()}
    else if(kind===3){const qos=(t>>1)&3;if(body.length<2)return;const tl=(body[0]<<8)|body[1];const topic=td.decode(body.subarray(2,2+tl));let p=2+tl;if(qos>0)p+=2;let payload='';try{payload=td.decode(body.subarray(p))}catch(e){return}this.net.onMessage(topic,payload)}
  }
  tick(t){
    if(this.state==='up'){if(t-this.pingAt>20000){this.pingAt=t;this.raw(new Uint8Array([0xC0,0]))}if(t-this.lastRx>65000)this.fail()}
    else if(this.state==='connecting'){if(t-this.openAt>12000)this.fail()}
    else if(this.state==='down'&&this.net.enabled&&t>=this.nextTry)this.open();
  }
  close(){if(this.ws){this.raw(new Uint8Array([0xE0,0]));const w=this.ws;this.ws=null;w.onclose=null;try{w.close()}catch(e){}}this.state='idle'}
}

/* ---------- lobby ---------- */
const net=IH.net={enabled:false,status:'off',id:rid(),clientId:'',name:'Gast',color:'#ff8a1c',peers:new Map(),links:[],seq:0,kills:0,feed:[],CHAT,
  onFeed:null,onChat:null};
net.color=COLORS[hashStr(net.id)%COLORS.length];
function brokers(){
  try{const q=new URLSearchParams(location.search).get('broker');if(q)return q.split(',').filter(u=>/^wss?:\/\//.test(u))}catch(e){}
  return DEFAULT_BROKERS;
}
net.start=function(name){
  net.name=cleanName(name);if(net.enabled)return;net.enabled=true;net.status='connecting';net.clientId='2i2h_'+net.id+'_'+rid().slice(0,4);
  net.links=brokers().map(u=>new Link(u,net));for(const l of net.links)l.open();
  net.sendT=0;feed('Verbinde mit der Lobby …','sys');
};
net.stop=function(){
  if(!net.enabled)return;publish('b/'+net.id,{i:net.id});for(const l of net.links)l.close();net.links=[];net.enabled=false;net.status='off';
  for(const p of net.peers.values())dropPeer(p,true);net.peers.clear();IH.remote.cars.length=0;IH.remote.peds.length=0;
};
net.linkChanged=function(){const up=net.links.filter(l=>l.state==='up').length;const before=net.status;net.status=!net.enabled?'off':up?'online':'connecting';if(before!=='online'&&net.status==='online'){const t=now();if(!net.onlineShown)feed('Online – globale Lobby','sys');else if(t-(net.offSince||t)>10000)feed('Wieder online','sys');net.onlineShown=true;net.sendT=0}if(before==='online'&&net.status!=='online')net.offSince=now()};   // brokers reconnecting don't spam the feed
net.linksUp=()=>net.links.filter(l=>l.state==='up').length;
function publish(sub,obj){const body=mstr(BASE+sub).concat(Array.from(te.encode(JSON.stringify(obj))));const b=pkt(0x30,body);for(const l of net.links)if(l.state==='up')l.raw(b)}
const recentJoin=new Map(),leftSaid=new Map();   // name -> last time we announced / lost them (one player reconnecting or reopening the app is announced once)
function feed(txt,kind,col){net.feed.push({txt,kind,col,t:now()});if(net.feed.length>6)net.feed.shift();if(net.onFeed)net.onFeed()}
net.event=function(type,m){if(!net.enabled||net.status!=='online')return;if(type==='kill'){const k=net.peers.get(m.by);feed((k?k.name:'Jemand')+' hat dich erledigt','kill',k?k.color:null)}m=Object.assign({i:net.id,q:++net.seq,e:type},m);publish('e/'+net.id,m)};
net.chat=function(i){if(!net.enabled)return;i=clamp(i|0,0,CHAT.length-1);net.event('msg',{t:i});net.myBubble={txt:CHAT[i],t:now()};feed(net.name+': '+CHAT[i],'chat',net.color)};

/* ---------- peers ---------- */
const gone=new Map();
function getPeer(id){
  let p=net.peers.get(id);if(p)return p;
  const h=hashStr(id);
  p={id,name:'Gast',color:COLORS[h%COLORS.length],last:now(),lastSeq:-1,evSeen:[],tokens:40,snaps:[],mode:'f',type:'limousine',cop:false,carColor:'#888',stars:0,weapon:0,hp:100,money:0,kills:0,paused:false,
    car:null,ped:{remote:true,peer:id,id:'rp_'+id,kind:'player',shirt:COLORS[h%COLORS.length],hair:['#2b1d14','#4a3426','#1a1a1a','#8a6a3d','#c9a26a'][h%5],skin:h%4,x:0,y:0,a:0,spdNow:0,anim:0,state:'walk',weapon:0},bubble:null,joined:false};
  net.peers.set(id,p);return p;
}
function dropPeer(p,silent){
  const rc=IH.remote;let i=rc.cars.indexOf(p.car);if(i>=0)rc.cars.splice(i,1);i=rc.peds.indexOf(p.ped);if(i>=0)rc.peds.splice(i,1);
  if(!silent&&p.joined&&now()-(p.joinT||0)>20000&&!leftSaid.has(p.name)){feed(p.name+' hat die Lobby verlassen','sys');leftSaid.set(p.name,now())}if(p.joined)recentJoin.set(p.name,now());net.peers.delete(p.id);
}
net.onMessage=function(topic,payload){
  if(!topic.startsWith(BASE)||payload.length>1500)return;const kind=topic.charAt(BASE.length);
  let m;try{m=JSON.parse(payload)}catch(e){return}
  if(!m||typeof m!=='object'||typeof m.i!=='string'||m.i.length<4||m.i.length>24||m.i===net.id)return;
  if(topic.slice(BASE.length+2)!==m.i)return;
  if(kind==='b'){const p=net.peers.get(m.i);if(p)dropPeer(p);gone.set(m.i,now());return}
  const gt=gone.get(m.i);if(gt&&now()-gt<15000)return;
  const q=num(m.q,0,1e12,-1);if(q<0)return;
  const p=getPeer(m.i);const t=now();
  if(kind==='s'){
    if(q<=p.lastSeq)return;p.lastSeq=q;p.last=t;
    const nm=cleanName(m.n);if(!p.joined){p.joined=true;p.name=nm;p.joinT=t;const last=recentJoin.get(nm);if(last===undefined||t-last>90000)feed(nm+' ist in der Lobby','sys',p.color);else if(leftSaid.has(nm))feed(nm+' ist wieder da','sys',p.color);leftSaid.delete(nm);recentJoin.set(nm,t)}p.name=nm;
    const x=num(m.x,-50,2050,null),y=num(m.y,-50,2050,null);if(x===null||y===null)return;
    const prevMode=p.mode;p.mode=m.m==='c'||m.m==='d'||m.m==='r'?m.m:'f';
    // just got into a car: remember where (from this message, not the delayed interpolation) so an empty local copy of that car can be removed
    if(p.mode==='c'&&prevMode!=='c')p.claim={x,y,type:CAR_TYPES[num(m.k,0,CAR_TYPES.length-1,1)|0],t};p.rd=p.mode==='r'&&typeof m.rd==='string'&&m.rd.length<=24?m.rd:null;p.seat=num(m.st,0,60,0)|0;
    // someone gets into my car as a passenger
    {const mine=p.rd===net.id;if(mine&&!p.withMe)feed(nm+' fährt bei dir mit','sys',p.color),IH.on&&IH.on.toast&&IH.on.toast(nm+' ist eingestiegen');else if(!mine&&p.withMe)feed(nm+' ist ausgestiegen','sys',p.color);p.withMe=mine}p.type=CAR_TYPES[num(m.k,0,CAR_TYPES.length-1,1)|0];p.cop=!!m.o;p.carColor=/^#[0-9a-f]{6}$/i.test(m.c)?m.c:'#888888';
    p.stars=num(m.s,0,5,0)|0;p.weapon=num(m.w,0,7,0)|0;p.hp=num(m.h,0,100,100);p.money=num(m.$,0,1e9,0)|0;p.kills=num(m.K,0,1e6,0)|0;p.paused=!!m.p;p.siren=!!m.r;if(/^#[0-9a-f]{6}$/i.test(m.sh||''))p.shirt=m.sh;p.carHp=num(m.ch,0,100,100);p.z=num(m.z,0,400,0);p.liv=/^[a-z]{3,10}$/.test(m.lv||'')?m.lv:null;p.roll=num(m.rl,-1,1,0);p.pitch=num(m.pt,-1,1,0);p.down=!!m.dn;
    // timeline from the sender's own clock (not our arrival times, which jitter with the network): smooth motion
    let st=t;const ts=typeof m.ts==='number'&&isFinite(m.ts)?m.ts:null;
    if(ts!==null){const o=t-ts;if(p.off===undefined||o<p.off||o-p.off>2500)p.off=o;else p.off+=Math.min(o-p.off,Math.max(0,t-(p.offT||t))*0.02);p.offT=t;st=ts+p.off}
    const lastS=p.snaps[p.snaps.length-1];
    if(!lastS||st>lastS.t){p.snaps.push({t:st,x,y,a:num(m.a,-10,10,0),vx:num(m.vx,-80,80,0),vy:num(m.vy,-80,80,0),z:num(m.z,0,3000,0)});if(p.snaps.length>8)p.snaps.shift()}
    return;
  }
  if(kind!=='e')return;
  if(p.evSeen.includes(q))return;p.evSeen.push(q);if(p.evSeen.length>80)p.evSeen.shift();
  p.last=t;p.tokens=Math.min(40,p.tokens+(t-(p.tokT||t))/1000*25);p.tokT=t;if(p.tokens<1)return;p.tokens--;
  const S=IH.sim,P=S.player;const ex=num(m.x,-50,2050,null),ey=num(m.y,-50,2050,null);
  const near=ex!==null&&ey!==null&&Math.hypot(ex-P.x,ey-P.y)<260;
  switch(m.e){
    case'shot':net.rx=(net.rx||0)+1;if(near)S.remoteShot({x:ex,y:ey,a:num(m.a,-10,10,0),w:num(m.w,1,8,1)|0,r:num(m.r,0,4294967295,1),z:num(m.z,0,400,1.2),vz:num(m.vz,-3000,3000,0)},p.id);break;
    case'gren':if(near)S.remoteGrenade({x:ex,y:ey,vx:num(m.vx,-40,40,0),vy:num(m.vy,-40,40,0),molotov:m.m===1},p.id);break;
    case'boom':if(near){const ty=CAR_TYPES[num(m.k,0,CAR_TYPES.length-1,0)|0];S.remoteBoom({x:ex,y:ey,a:num(m.a,-10,10,0),type:m.k===undefined?null:ty,color:/^#[0-9a-f]{6}$/i.test(m.c||'')?m.c:'#555555'},p.id);if(p.car)p.carBoomed=true}break;
    case'act':if(net.onAct)net.onAct(p,m);break;
    case'pldown':if(IH.sim_pldown)IH.sim_pldown(num(m.p,0,2,0)|0);break;
    case'horn':if(near&&IH.on&&IH.on.sfx)IH.on.sfx('horn',0.8,ex,ey);break;
    case'msg':{const i=num(m.t,0,CHAT.length-1,0)|0;p.bubble={txt:CHAT[i],t};feed(p.name+': '+CHAT[i],'chat',p.color);if(net.onChat)net.onChat(p,i);break}
    case'kill':{const by=typeof m.by==='string'?m.by:'';const st=num(m.s,0,5,0)|0;
      if(by===net.id){const bounty=100+st*150;IH.stats.kills++;S.addMoney(bounty,P.x,P.y);feed('Du hast '+p.name+' erledigt  +$'+bounty,'kill',net.color);if(IH.on&&IH.on.toast)IH.on.toast(p.name+' erledigt · +$'+bounty);if(IH.on&&IH.on.sfx)IH.on.sfx('cash')}
      else{const k=net.peers.get(by);feed((k?k.name:'Jemand')+' hat '+p.name+' erledigt','kill',k?k.color:'#ccc')}break}
  }
};

/* ---------- per-frame: send own state, interpolate the others ---------- */
let lastSent='';
let lastTick=0;
net.tick=function(){
  const t=now();const dt=lastTick?Math.min(1,(t-lastTick)/1000):0;lastTick=t;
  for(const l of net.links)l.tick(t);
  if(!net.enabled)return;
  const S=IH.sim,G=S.G,P=S.player;
  if(net.status==='online'&&G.state!=='menu'){
    net.sendT-=dt;
    if(net.sendT<=0){
      const c=P.inCar;const mode=G.state==='dead'?'d':c?'c':P.ride?'r':'f';const src=c||P;
      const m={i:net.id,q:++net.seq,ts:Math.round(t),n:net.name,x:+src.x.toFixed(2),y:+src.y.toFixed(2),a:+(c?c.a:P.a).toFixed(3),m:mode,z:c&&c.z?+c.z.toFixed(1):0,rl:c&&c.roll?+c.roll.toFixed(2):0,pt:c&&c.pitch?+c.pitch.toFixed(2):0,vx:+(src.vx||0).toFixed(2),vy:+(src.vy||0).toFixed(2),
        s:S.stars(),w:P.weapon,h:Math.round(P.hp),$:P.money,K:IH.stats.kills,sh:P.shirt};
      if(c){m.k=Math.max(0,CAR_TYPES.indexOf(c.type));m.c=c.color;m.ch=Math.round(c.hp/c.maxHp*100);if(c.cop)m.o=1;if(c.siren)m.r=1;if(c.liv)m.lv=c.liv}
      if(G.paused)m.p=1;
      if(mode==='r'){m.rd=P.ride.peer;m.st=P.ride.seat}
      const moving=Math.hypot(src.vx||0,src.vy||0)>0.3;const sig=mode+m.k+m.c+m.s+m.w+m.h+m.p+Math.round(m.x*2)+Math.round(m.y*2);
      if(moving||sig!==lastSent||net.idleT<=0){publish('s/'+net.id,m);lastSent=sig;net.idleT=1.5}
      net.idleT=(net.idleT||0)-(c?0.11:0.16)-Math.max(0,-net.sendT);
      net.sendT=c?(S.ridersOf&&S.ridersOf(net.id).length?0.07:0.1):0.16;   // more updates while someone rides along
    }
  }
  // remote bodies
  const rc=IH.remote;rc.cars.length=0;rc.peds.length=0;rc.riders=rc.riders||[];rc.riders.length=0;const delay=190;
  for(const p of Array.from(net.peers.values())){
    if(t-p.last>9000){dropPeer(p);continue}
    if(!p.snaps.length||!p.joined)continue;
    const rt=t-delay;let a=p.snaps[0],b=null;for(let i=0;i<p.snaps.length;i++){if(p.snaps[i].t<=rt)a=p.snaps[i];else{b=p.snaps[i];break}}
    let x,y,ang,vx=a.vx,vy=a.vy;
    let zz=a.z||0;
    if(b&&b!==a&&b.t>a.t){const k=clamp((rt-a.t)/(b.t-a.t),0,1),T=(b.t-a.t)/1000;
      // cubic Hermite through both snapshots using their velocities: no corners in the path, no speed jumps
      const k2=k*k,k3=k2*k,h00=2*k3-3*k2+1,h10=k3-2*k2+k,h01=-2*k3+3*k2,h11=k3-k2;
      const jump=Math.hypot(b.x-a.x,b.y-a.y)>Math.max(6,(Math.hypot(a.vx,a.vy)+Math.hypot(b.vx,b.vy))*T*1.5+2);
      if(jump){x=a.x+(b.x-a.x)*k;y=a.y+(b.y-a.y)*k}else{x=h00*a.x+h10*T*a.vx+h01*b.x+h11*T*b.vx;y=h00*a.y+h10*T*a.vy+h01*b.y+h11*T*b.vy}
      let d=b.a-a.a;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;ang=a.a+d*(k2*(3-2*k));vx=a.vx+(b.vx-a.vx)*k;vy=a.vy+(b.vy-a.vy)*k;zz=(a.z||0)+((b.z||0)-(a.z||0))*k}
    else{const last=p.snaps[p.snaps.length-1];const ext=clamp((rt-last.t)/1000,0,0.35);x=last.x+last.vx*ext;y=last.y+last.vy*ext;ang=last.a;vx=last.vx;vy=last.vy}
    if(p.mode==='c'){
      if(!p.car||p.car.type!==p.type||p.car.color!==p.carColor||p.car.cop!==p.cop){const CT=S.CT[p.type];p.car={remote:true,peer:p.id,id:'rc_'+p.id+'_'+p.type+(p.cop?'p':''),type:p.type,t:CT,color:p.carColor,cop:p.cop,label:null,x,y,a:ang,vx:0,vy:0,vf:0,vl:0,hp:100,maxHp:100,dead:false,sink:0,driver:'remote',brake:false,rev:false,siren:false}}
      const c=p.car;const fx=Math.cos(ang),fy=Math.sin(ang);const vf=vx*fx+vy*fy;c.brake=vf<(c.vf||0)-0.25&&vf>0.5;c.x=x;c.y=y;c.a=ang;c.vx=vx;c.vy=vy;c.vf=vf;c.vl=-vx*fy+vy*fx;c.rev=vf<-0.4;c.siren=p.siren;c.hp=p.carHp;c.z=zz;c.roll=p.roll;c.pitch=p.pitch;c.air=p.z>0.5;c.spd=Math.hypot(vx,vy);c.liv=p.liv||'isar';
      rc.cars.push(c);
    }
    if(p.mode!=='c'&&p.car){if(!p.carBoomed&&S.leaveRemoteCar)S.leaveRemoteCar(p.car);p.car=null;p.carBoomed=false}
    if(p.claim){if(t-p.claim.t>3000||(S.takenByRemote&&S.takenByRemote(p.claim.x,p.claim.y,p.claim.type)))p.claim=null}
    // passengers sit in their driver's vehicle (placed from the driver's car, not from their own delayed position)
    if(p.mode==='r'){const dc=p.rd===net.id?P.inCar:(net.peers.get(p.rd)||{}).car;if(dc)rc.riders.push({ped:p.ped,car:dc,seat:p.seat})}
    if(p.mode==='f'||p.mode==='d'){
      if(p.shirt&&p.ped.shirt!==p.shirt){p.ped=Object.assign({},p.ped,{shirt:p.shirt,id:'rp_'+p.id+p.shirt})}
      const q=p.ped;const sp=Math.hypot(vx,vy);q.anim+=dt*6.2832*(0.62+0.13*Math.min(sp,9))*(sp>0.3?1:0);q.x=x;q.y=y;q.a=sp>0.3?Math.atan2(vy,vx):ang;q.spdNow=sp;q.weapon=p.weapon;q.state=p.mode==='d'?'down':'walk';
      rc.peds.push(q);
    }
  }
};
net.playerList=function(){const out=[];for(const p of net.peers.values())if(p.joined)out.push(p);out.sort((a,b)=>b.money-a.money);return out};
root.addEventListener&&root.addEventListener('pagehide',()=>{if(net.enabled)publish('b/'+net.id,{i:net.id})});
document.addEventListener&&document.addEventListener('visibilitychange',()=>{if(!document.hidden&&net.enabled)for(const l of net.links)if(l.state==='down')l.nextTry=0});
})(window));
