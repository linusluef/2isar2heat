/* 2Isar2Heat — 2.5D renderer (three.js r128). Sim (x, y) maps to three (x, z); height is three y. */
(window.IH_MODS=window.IH_MODS||[]).push(()=>(function(root){
'use strict';
const IH=root.IH,W=IH.world,S=IH.sim,THREE=root.THREE;
const R3=IH.r3={};
const hypot=Math.hypot,clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t,smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
let renderer,scene,camera,sun,hemi,maxAniso=1;
const cam=IH.cam;

/* ---------- quality presets ---------- */
const QUAL={
  hoch:{overview:4096,shadow:2048,chunkPx:1024,prMax:2,prStart:2,cache:22,budget:1,trees:1,facade:256},
  mittel:{overview:4096,shadow:2048,chunkPx:768,prMax:1.6,prStart:1.5,cache:26,budget:1,trees:1,facade:256},
  niedrig:{overview:2048,shadow:0,chunkPx:512,prMax:1.25,prStart:1.0,cache:26,budget:2,trees:0.6,facade:128},
};
let Q=QUAL.hoch;

/* ---------- shared uniforms ---------- */
const U={time:{value:0},lit:{value:0},nightK:{value:0},shopK:{value:0},skyRefl:{value:new THREE.Color(0,0,0)},detail:{value:null},sway:{value:1}};

/* ---------- small helpers ---------- */
const matCache=new Map();
const landmarkMats=new Set();
function lam(color,o){const k=color+JSON.stringify(o||{});let m=matCache.get(k);if(!m){m=new THREE.MeshLambertMaterial(Object.assign({color},o||{}));matCache.set(k,m)}return m}
function mergeGeos(parts){
  // parts: [{g, color, m (Matrix4), grp}] -> one non-indexed geometry with vertex colours; parts with grp get geometry groups (sorted)
  const hasGrp=parts.some(p=>p.grp);if(hasGrp)parts=parts.slice().sort((a,b)=>(a.grp||0)-(b.grp||0));
  let n=0;const prepared=parts.map(p=>{let g=p.g.index?p.g.toNonIndexed():p.g.clone();if(p.m)g.applyMatrix4(p.m);n+=g.attributes.position.count;return{g,c:new THREE.Color(p.color),grp:p.grp||0}});
  const pos=new Float32Array(n*3),nor=new Float32Array(n*3),col=new Float32Array(n*3);let o=0;const groups=[];
  for(const p of prepared){const a=p.g.attributes;if(!a.normal)p.g.computeVertexNormals();pos.set(a.position.array,o*3);nor.set(p.g.attributes.normal.array,o*3);
    for(let i=0;i<a.position.count;i++){col[(o+i)*3]=p.c.r;col[(o+i)*3+1]=p.c.g;col[(o+i)*3+2]=p.c.b}
    const last=groups[groups.length-1];if(last&&last.grp===p.grp)last.count+=a.position.count;else groups.push({grp:p.grp,start:o,count:a.position.count});
    o+=a.position.count;p.g.dispose()}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));
  if(hasGrp)for(const gr of groups)g.addGroup(gr.start,gr.count,gr.grp);
  g.computeBoundingSphere();return g;
}
const M4=()=>new THREE.Matrix4();
function tm(x,y,z,ry,sx,sy,sz,rz){const m=M4();m.compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,ry||0,rz||0)),new THREE.Vector3(sx||1,sy||1,sz||1));return m}
function boxPart(cx,cy,cz,lx,ly,lz,color,grp){return{g:new THREE.BoxGeometry(lx,ly,lz),color,m:tm(cx,cy,cz),grp}}
// box whose top face is pulled in (front = +x): makes windscreens, bonnets and cabins
function taperBox(L,H,Wd,inF,inB,inS){
  const x0=-L/2,x1=L/2,z0=-Wd/2,z1=Wd/2;const b=[[x0,0,z0],[x1,0,z0],[x1,0,z1],[x0,0,z1]],t=[[x0+inB,H,z0+inS],[x1-inF,H,z0+inS],[x1-inF,H,z1-inS],[x0+inB,H,z1-inS]];
  const q=[];const quad=(a,b2,c,d)=>q.push(a,b2,c,a,c,d);
  quad(t[0],t[3],t[2],t[1]);quad(b[0],b[1],b[2],b[3]);quad(b[0],t[0],t[1],b[1]);quad(b[1],t[1],t[2],b[2]);quad(b[2],t[2],t[3],b[3]);quad(b[3],t[3],t[0],b[0]);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(q.flat(),3));g.computeVertexNormals();return g;
}
function canvasTex(w,h,fn,rep){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');fn(g,w,h);const t=new THREE.CanvasTexture(c);t.anisotropy=maxAniso;if(rep){t.wrapS=t.wrapT=THREE.RepeatWrapping}return t}
function labelSprite(text,bg,fg,scale){
  const c=document.createElement('canvas');const g=c.getContext('2d');g.font='700 64px "Barlow Condensed","Arial Narrow",sans-serif';const w=Math.ceil(g.measureText(text).width)+48;c.width=w;c.height=96;
  g.fillStyle=bg;const r=18;g.beginPath();g.moveTo(r,0);g.lineTo(w-r,0);g.quadraticCurveTo(w,0,w,r);g.lineTo(w,96-r);g.quadraticCurveTo(w,96,w-r,96);g.lineTo(r,96);g.quadraticCurveTo(0,96,0,96-r);g.lineTo(0,r);g.quadraticCurveTo(0,0,r,0);g.fill();
  g.font='700 64px "Barlow Condensed","Arial Narrow",sans-serif';g.fillStyle=fg;g.textAlign='center';g.textBaseline='middle';g.fillText(text,w/2,52);
  const t=new THREE.CanvasTexture(c);const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:true,fog:true}));s.scale.set(w/96*(scale||2),scale||2,1);return s;
}
function rnd(seed){return IH.util.mulberry32(seed)}
function iconLabel(kind,text,fg,scale){
  const c=document.createElement('canvas');const g=c.getContext('2d');const font='700 60px "Barlow Condensed","Arial Narrow",sans-serif';g.font=font;const tw=Math.ceil(g.measureText(text).width);const H=96,w=H+tw+36;c.width=w;c.height=H;
  g.fillStyle='rgba(18,20,24,.82)';const r=18;g.beginPath();g.moveTo(r,0);g.lineTo(w-r,0);g.quadraticCurveTo(w,0,w,r);g.lineTo(w,H-r);g.quadraticCurveTo(w,H,w-r,H);g.lineTo(r,H);g.quadraticCurveTo(0,H,0,H-r);g.lineTo(0,r);g.quadraticCurveTo(0,0,r,0);g.fill();
  if(IH.drawIcon)IH.drawIcon(g,kind,H/2,H/2,34);g.font=font;g.fillStyle=fg||'#f1ede2';g.textBaseline='middle';g.fillText(text,H+6,H/2+3);
  const t=new THREE.CanvasTexture(c);t.anisotropy=maxAniso;const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:true,fog:true}));const sc=scale||2.2;sp.scale.set(w/H*sc,sc,1);return sp;
}
function lotPad(l,col,opacity){
  const tex=canvasTex(256,256,(g)=>{g.clearRect(0,0,256,256);g.fillStyle=col;g.globalAlpha=0.16;g.fillRect(0,0,256,256);g.globalAlpha=1;g.strokeStyle=col;g.lineWidth=12;g.strokeRect(6,6,244,244);
    g.lineWidth=7;g.globalAlpha=0.8;for(let i=-256;i<512;i+=48){g.beginPath();g.moveTo(i,256);g.lineTo(i+40,216);g.stroke()}g.globalAlpha=1});
  const sh=new THREE.Shape(l.pts.map(p=>new THREE.Vector2(p[0],p[1])));const g=new THREE.ShapeGeometry(sh);g.rotateX(Math.PI/2);const uv=g.attributes.uv,pos=g.attributes.position;const P0=l.pts[0];
  for(let i=0;i<uv.count;i++){const dx=pos.getX(i)-P0[0],dy=pos.getZ(i)-P0[1];uv.setXY(i,(dx*l.tx+dy*l.ty)/l.w,1-(dx*l.nx+dy*l.ny)/l.d)}
  const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:opacity||0.85,depthWrite:false,side:THREE.DoubleSide}));m.position.y=0.09;m.renderOrder=3;scene.add(m);return m;
}

/* ---------- environment: time of day & weather ---------- */
const ENV=IH.env={tod:10,day:1,night:0,dusk:0,lampK:0,rain:0,rainTarget:0,sunDir:new THREE.Vector3(0.4,0.8,0.4)};
const C3=h=>new THREE.Color(h);
const PAL={skyTopDay:C3('#4a86d4'),skyTopDusk:C3('#33466e'),skyTopNight:C3('#04070f'),horDay:C3('#bcd6ea'),horDusk:C3('#f2a46b'),horNight:C3('#121a2c'),
  sunDay:C3('#fff3de'),sunDusk:C3('#ffb070'),moon:C3('#9db4e8'),hemiDay:C3('#dde9fa'),hemiDusk:C3('#f6cfac'),hemiNight:C3('#2c3d66'),gDay:C3('#6a6652'),gNight:C3('#16181e'),rainSky:C3('#6f7782'),rainHor:C3('#959ca5')};
const skyTop=new THREE.Color(),skyHor=new THREE.Color(),tmpCol=new THREE.Color(),tmpCol2=new THREE.Color();
function todFromClock(){
  // one in-game day lasts 24 real minutes; derived from the wall clock so every online player sees the same sky
  const f=((Date.now()/1000)%1440)/1440;
  if(f<0.6)return 7+f/0.6*11.5;          // 07:00–18:30
  if(f<0.7)return 18.5+(f-0.6)/0.1*2.5;  // dusk
  if(f<0.9)return(21+(f-0.7)/0.2*8)%24;  // night 21:00–05:00
  return 5+(f-0.9)/0.1*2;                // dawn
}
function hash1(n){let t=(n*0x6D2B79F5)|0;t=Math.imul(t^t>>>15,1|t);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296}
function rainFromClock(){const slot=Math.floor(Date.now()/480000);return hash1(slot+77)<0.24?1:0}
function envUpdate(dt){
  const set=IH.settings||{};const mode=set.tod||'zyklus';
  ENV.tod=mode==='tag'?11.5:mode==='abend'?17.7:mode==='nacht'?23.2:todFromClock();
  const wm=set.weather||'wechselnd';ENV.rainTarget=wm==='klar'?0:wm==='regen'?1:rainFromClock();
  ENV.rain+=(ENV.rainTarget-ENV.rain)*(1-Math.exp(-dt*0.25));if(dt===0)ENV.rain=ENV.rainTarget;
  const th=(ENV.tod-6)/24*Math.PI*2,se=Math.sin(th);
  ENV.day=smooth(-0.12,0.12,se);ENV.night=1-ENV.day;ENV.dusk=clamp(1-Math.abs(se-0.04)/0.24,0,1);
  ENV.lampK=smooth(0.25,0.7,ENV.night+ENV.rain*0.25);
  const el=Math.asin(clamp(se,-1,1))*0.78;
  if(ENV.day>0.02){const c=Math.cos(Math.max(0.12,el));ENV.sunDir.set(Math.cos(th)*c,Math.sin(Math.max(0.12,el)),Math.sin(th)*c*0.85+0.25).normalize()}
  else ENV.sunDir.set(-0.35,0.75,0.4).normalize();
  const rk=ENV.rain*0.85;
  skyTop.copy(PAL.skyTopDay).lerp(PAL.skyTopDusk,ENV.dusk*0.85).lerp(PAL.rainSky,rk*ENV.day);skyTop.lerp(PAL.skyTopNight,ENV.night);
  skyHor.copy(PAL.horDay).lerp(PAL.horDusk,ENV.dusk*0.8).lerp(PAL.rainHor,rk*ENV.day);skyHor.lerp(PAL.horNight,ENV.night);
  if(!sun)return;
  tmpCol.copy(PAL.sunDay).lerp(PAL.sunDusk,ENV.dusk*0.9);sun.color.copy(PAL.moon).lerp(tmpCol,ENV.day);
  sun.intensity=lerp(0.26,1.0,ENV.day)*(1-0.5*ENV.rain);
  tmpCol.copy(PAL.hemiDay).lerp(PAL.hemiDusk,ENV.dusk*0.6);hemi.color.copy(PAL.hemiNight).lerp(tmpCol,ENV.day);hemi.groundColor.copy(PAL.gNight).lerp(PAL.gDay,ENV.day);
  hemi.intensity=lerp(0.46,0.56,ENV.day)*(1-0.15*ENV.rain);
  tmpCol2.copy(skyHor).multiplyScalar(0.92);scene.fog.color.copy(tmpCol2);scene.background.copy(tmpCol2);
  fogBase[0]=scene.fog.near=lerp(lerp(150,230,ENV.day),95,ENV.rain);fogBase[1]=scene.fog.far=lerp(lerp(430,600,ENV.day),330,ENV.rain);
  U.lit.value=ENV.lampK*0.46;U.nightK.value=ENV.lampK;U.shopK.value=ENV.lampK;
  U.skyRefl.value.copy(skyHor).multiplyScalar(0.16*ENV.day);
  if(skyMat){skyMat.uniforms.top.value.copy(skyTop);skyMat.uniforms.hor.value.copy(skyHor);skyMat.uniforms.sunDir.value.copy(ENV.sunDir);skyMat.uniforms.night.value=ENV.night;skyMat.uniforms.sunCol.value.copy(sun.color).multiplyScalar(ENV.day*(1-ENV.rain*0.8))}
  if(waterMat){const u=waterMat.uniforms;u.sky.value.copy(skyHor).lerp(skyTop,0.3);u.sunDir.value.copy(ENV.sunDir);u.sunCol.value.copy(sun.color).multiplyScalar(ENV.day*(1-ENV.rain*0.7)+0.15*ENV.night);u.night.value=ENV.night;
    u.deep.value.set('#22636b').lerp(PAL.skyTopNight,ENV.night*0.75);u.shallow.value.set('#4f9f9b').lerp(PAL.horNight,ENV.night*0.7)}
  for(const m of landmarkMats){m.emissive.copy(m.color).multiplyScalar(0.3*ENV.lampK)}
  if(lampHeadMat){lampHeadMat.color.set('#8d8b80').lerp(tmpCol.set('#fff1c2'),ENV.lampK)}
  if(poolMat)poolMat.opacity=0.62*ENV.lampK;
  if(beamMat){beamMat.opacity=0.55*smooth(0.15,0.6,ENV.night+ENV.rain*0.4);glareMat.opacity=beamMat.opacity*1.4;tailGlowMat.opacity=0.85*smooth(0.15,0.6,ENV.night+ENV.rain*0.4)}
  envCubeUpdate();
}

/* ---------- sky dome ---------- */
let skyMat=null,skyMesh=null;
function buildSky(){
  skyMat=new THREE.ShaderMaterial({depthWrite:false,fog:false,side:THREE.BackSide,
    uniforms:{top:{value:new THREE.Color()},hor:{value:new THREE.Color()},sunDir:{value:new THREE.Vector3()},sunCol:{value:new THREE.Color()},night:{value:0},time:U.time},
    vertexShader:'varying vec3 vD;void main(){vD=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position=p.xyww;}',
    fragmentShader:`uniform vec3 top;uniform vec3 hor;uniform vec3 sunDir;uniform vec3 sunCol;uniform float night;uniform float time;varying vec3 vD;
      float h3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      void main(){vec3 d=normalize(vD);float h=d.y;vec3 c=mix(hor,top,pow(clamp(h,0.0,1.0),0.55));if(h<0.0)c=mix(hor,hor*0.55,clamp(-h*4.0,0.0,1.0));
        float s=max(dot(d,sunDir),0.0);c+=sunCol*(pow(s,900.0)*4.0+pow(s,12.0)*0.22);
        if(night>0.05&&h>0.0){vec3 q=floor(d*180.0);float st=step(0.9965,h3(q));float tw=0.6+0.4*sin(time*2.0+h3(q+1.0)*40.0);c+=vec3(st*tw*night*smoothstep(0.0,0.25,h));}
        gl_FragColor=vec4(c,1.0);}`});
  skyMesh=new THREE.Mesh(new THREE.SphereGeometry(900,32,16),skyMat);skyMesh.renderOrder=-10;skyMesh.frustumCulled=false;scene.add(skyMesh);
}

/* ---------- environment cube for reflections (cars, glass) ---------- */
let envCube=null,envSides=null,envLast=-1;
function buildEnvCube(){
  envSides=[];for(let i=0;i<6;i++){const c=document.createElement('canvas');c.width=c.height=64;envSides.push(c)}
  envCube=new THREE.CubeTexture(envSides);envCubeUpdate(true);
}
function envCubeUpdate(force){
  if(!envSides)return;const key=Math.round(ENV.day*20)+Math.round(ENV.rain*10)*100+Math.round(ENV.dusk*10)*10000;if(!force&&key===envLast)return;envLast=key;
  const top='#'+skyTop.getHexString(),hor='#'+skyHor.getHexString(),gnd='#'+tmpCol.copy(skyHor).multiplyScalar(0.25).getHexString();
  const r=rnd(5);
  envSides.forEach((c,i)=>{const g=c.getContext('2d');
    if(i===2){g.fillStyle=top;g.fillRect(0,0,64,64);return}
    if(i===3){g.fillStyle=gnd;g.fillRect(0,0,64,64);return}
    const gr=g.createLinearGradient(0,0,0,64);gr.addColorStop(0,top);gr.addColorStop(0.5,hor);gr.addColorStop(0.5,gnd);gr.addColorStop(1,gnd);g.fillStyle=gr;g.fillRect(0,0,64,64);
    // a city skyline on the horizon
    g.fillStyle='rgba(30,34,40,'+(0.55+0.3*ENV.night)+')';let x=0;while(x<64){const w=3+r()*7,h=4+r()*12;g.fillRect(x,32-h,w,h+1);if(ENV.night>0.3){g.fillStyle='rgba(255,210,140,.8)';for(let k=0;k<3;k++)g.fillRect(x+r()*w,32-r()*h,1,1);g.fillStyle='rgba(30,34,40,'+(0.55+0.3*ENV.night)+')'}x+=w}});
  envCube.needsUpdate=true;
}

/* ---------- ground textures ---------- */
const C={grass:'#7fa654',grass2:'#729a49',grass3:'#89b05c',park:'#76a24d',field:'#d2c49f',plaza:'#c2b9a7',plazaJ:'#bdb3a1',walk:'#bfb8ab',walkJ:'#aca598',curb:'#e2dccf',road:'#4c4f56',road2:'#45484e',bridge:'#5a5d64',mark:'#f2efe6',lot:'#585c63',water:'#2f6f74',bank:'#d6ccb2',base:'#46484c',path:'#d9cfb3'};
function bboxOf(pts,pad){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const p of pts){if(p[0]<x0)x0=p[0];if(p[1]<y0)y0=p[1];if(p[0]>x1)x1=p[0];if(p[1]>y1)y1=p[1]}return[x0-pad,y0-pad,x1+pad,y1+pad]}
for(const e of W.edges)e.bb=bboxOf(e.pts,e.w/2+e.walk+1);
for(const z of W.draw.zones)z.bb=bboxOf(z.pts,(z.w||0)+1);
for(const b of W.buildings)b.bb=bboxOf(b.pts,3);
for(const l of W.lots)l.bb=bboxOf(l.pts,1);
const parkPaths=[];
{const r=rnd(77);for(const[cx,cy,rx,ry,n]of[[690,300,85,170,9],[230,200,120,110,6]]){for(let i=0;i<n;i++){const a0=r()*6.28,a1=a0+2+r()*2.2;const p0=[cx+Math.cos(a0)*rx,cy+Math.sin(a0)*ry],p2=[cx+Math.cos(a1)*rx,cy+Math.sin(a1)*ry],p1=[cx+(r()-0.5)*rx,cy+(r()-0.5)*ry];const pts=[];for(let k=0;k<=24;k++){const t=k/24,u=1-t;pts.push([u*u*p0[0]+2*u*t*p1[0]+t*t*p2[0],u*u*p0[1]+2*u*t*p1[1]+t*t*p2[1]])}parkPaths.push({pts,bb:bboxOf(pts,3)})}}}
const hit=(bb,x0,y0,x1,y1)=>bb[2]>=x0&&bb[0]<=x1&&bb[3]>=y0&&bb[1]<=y1;
function polyPath(g,pts){g.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)g.lineTo(pts[i][0],pts[i][1])}
function offsetLine(pts,off){const out=[];for(let i=0;i<pts.length;i++){const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];const dx=b[0]-a[0],dy=b[1]-a[1],l=hypot(dx,dy)||1;out.push([pts[i][0]-dy/l*off,pts[i][1]+dx/l*off])}return out}
function subLine(e,s0,s1){const out=[];const st=2;for(let s=s0;s<s1;s+=st){const p=W.pointAt(e.pts,e.cum,s);out.push([p.x,p.y])}const p=W.pointAt(e.pts,e.cum,s1);out.push([p.x,p.y]);return out}

// surface patterns (drawn once, used as fill/stroke styles in world units)
const PAT={};let patOK=false;
function mkPat(name,px,world,draw){const c=document.createElement('canvas');c.width=c.height=px;draw(c.getContext('2d'),px,rnd(name.length*97+px));PAT[name]={c,world}}
function speck(g,n,px,r,cols,sz){for(let i=0;i<n;i++){g.fillStyle=cols[Math.floor(r()*cols.length)];const s=sz*(0.5+r());g.fillRect(r()*px,r()*px,s,s)}}
function buildPatterns(){
  try{const t=document.createElement('canvas').getContext('2d').createPattern(document.createElement('canvas'),'repeat');patOK=!!(t&&t.setTransform&&window.DOMMatrix)}catch(e){patOK=false}
  mkPat('grass',96,4,(g,p,r)=>{g.fillStyle=C.grass;g.fillRect(0,0,p,p);for(let i=0;i<500;i++){g.strokeStyle=r()<0.5?C.grass2:C.grass3;g.lineWidth=1;const x=r()*p,y=r()*p;g.beginPath();g.moveTo(x,y);g.lineTo(x+(r()-0.5)*3,y-2-r()*3);g.stroke()}speck(g,40,p,r,['#6d8f43','#93b866','#a3a85a'],2)});
  mkPat('park',96,4,(g,p,r)=>{g.fillStyle=C.park;g.fillRect(0,0,p,p);for(let i=0;i<520;i++){g.strokeStyle=r()<0.5?'#6b9645':'#83ad58';g.lineWidth=1;const x=r()*p,y=r()*p;g.beginPath();g.moveTo(x,y);g.lineTo(x+(r()-0.5)*3,y-2-r()*3);g.stroke()}speck(g,24,p,r,['#e8e3c8','#d9c96b'],1.2)});
  mkPat('field',96,5,(g,p,r)=>{g.fillStyle=C.field;g.fillRect(0,0,p,p);for(let i=0;i<420;i++){g.strokeStyle=['#c2b285','#ddd0aa','#b9a978','#a9b06a'][Math.floor(r()*4)];g.lineWidth=1;const x=r()*p,y=r()*p;g.beginPath();g.moveTo(x,y);g.lineTo(x+(r()-0.5)*4,y-1-r()*3);g.stroke()}});
  mkPat('bank',96,4,(g,p,r)=>{g.fillStyle=C.bank;g.fillRect(0,0,p,p);speck(g,700,p,r,['#c8bc9e','#e3d9c0','#b8ad92','#cfc4a6'],1.6)});
  mkPat('walk',128,3,(g,p,r)=>{const n=6,s=p/n;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const v=180+Math.floor(r()*14);g.fillStyle='rgb('+v+','+(v-6)+','+(v-17)+')';g.fillRect(x*s,y*s,s,s)}
    speck(g,500,p,r,['rgba(0,0,0,.06)','rgba(255,255,255,.08)'],1.2);g.strokeStyle='rgba(120,114,104,.85)';g.lineWidth=1.3;g.beginPath();for(let i=0;i<=n;i++){g.moveTo(i*s,0);g.lineTo(i*s,p);g.moveTo(0,i*s);g.lineTo(p,i*s)}g.stroke()});
  mkPat('plaza',128,4,(g,p,r)=>{const n=8,s=p/n;g.fillStyle='#ada493';g.fillRect(0,0,p,p);for(let y=0;y<n;y++){const off=(y%2)*s/2;for(let x=-1;x<=n;x++){const v=184+Math.floor(r()*14);g.fillStyle='rgb('+v+','+(v-7)+','+(v-18)+')';g.fillRect(x*s+off+0.8,y*s+0.8,s-1.6,s-1.6)}}speck(g,500,p,r,['rgba(0,0,0,.05)','rgba(255,255,255,.05)'],1.5)});
  mkPat('asphalt',128,4,(g,p,r)=>{g.fillStyle=C.road;g.fillRect(0,0,p,p);speck(g,1200,p,r,['#51545b','#474a50','#55585e','#44474d'],1.3);speck(g,40,p,r,['#62656a'],1)});
  mkPat('bridge',128,4,(g,p,r)=>{g.fillStyle=C.bridge;g.fillRect(0,0,p,p);speck(g,1000,p,r,['#62656c','#53565c','#6b6e74'],1.4)});
  mkPat('concrete',128,8,(g,p,r)=>{g.fillStyle='#a4a49e';g.fillRect(0,0,p,p);speck(g,900,p,r,['#9b9b95','#acaca6','#96968f','#b1b0aa'],1.2);g.strokeStyle='rgba(60,60,58,.35)';g.lineWidth=1;g.strokeRect(0.5,0.5,p-1,p-1);for(let i=0;i<14;i++){g.fillStyle='rgba(40,38,34,.05)';g.fillRect(r()*p,r()*p,2+r()*30,1+r()*3)}});
  mkPat('acker',128,10,(g,p,r)=>{g.fillStyle='#8a7a55';g.fillRect(0,0,p,p);for(let y=0;y<p;y+=4){g.fillStyle=y%8?'#7d6d4a':'#94845e';g.fillRect(0,y,p,2)}speck(g,500,p,r,['#6f6242','#9a8b63','#7f9a4a'],1.2)});
  mkPat('acker2',128,10,(g,p,r)=>{g.fillStyle='#93a84e';g.fillRect(0,0,p,p);for(let y=0;y<p;y+=4){g.fillStyle=y%8?'#86a046':'#a2b65a';g.fillRect(0,y,p,2)}speck(g,400,p,r,['#7d9640','#b0c066','#c9c07a'],1.2)});
  mkPat('lot',128,4,(g,p,r)=>{g.fillStyle=C.lot;g.fillRect(0,0,p,p);speck(g,900,p,r,['#5d6168','#54585e','#60646a'],1.3);for(let i=0;i<3;i++){g.fillStyle='rgba(20,20,22,.12)';g.beginPath();g.ellipse(r()*p,r()*p,6+r()*10,3+r()*6,r()*3,0,7);g.fill()}});
  mkPat('path',64,3,(g,p,r)=>{g.fillStyle=C.path;g.fillRect(0,0,p,p);speck(g,300,p,r,['#c9bfa3','#e6ddc4','#bdb398'],1.4)});
}
const patCache=new WeakMap();
function pat(g,name,fallback){
  if(!patOK)return fallback;let m=patCache.get(g);if(!m){m={};patCache.set(g,m)}
  if(m[name])return m[name];const P=PAT[name];const p=g.createPattern(P.c,'repeat');const s=P.world/P.c.width;p.setTransform(new DOMMatrix([s,0,0,s,0,0]));m[name]=p;return p;
}
function drawAirfield(g,x0,y0,x1,y1,detail){
  const A=W.airport;if(!A||x1<A.apron[0]-360||x0>1600||y0>430||y1<0)return;
  g.save();g.lineCap='butt';
  // taxiway centre lines (yellow) and edge lines
  g.strokeStyle='#e8b923';g.lineWidth=detail?0.3:0.8;for(const t of A.taxis){g.beginPath();polyPath(g,t);g.stroke()}
  g.strokeStyle='#e8b923';g.lineWidth=0.25;for(const st of A.stands){const c=Math.cos(st.a),s2=Math.sin(st.a);g.beginPath();g.moveTo(st.x-c*st.len*0.7,st.y-s2*st.len*0.7);g.lineTo(st.x+c*st.len*0.55,st.y+s2*st.len*0.55);g.stroke();
    g.beginPath();g.moveTo(st.x+c*st.len*0.42-s2*2.5,st.y+s2*st.len*0.42+c*2.5);g.lineTo(st.x+c*st.len*0.42+s2*2.5,st.y+s2*st.len*0.42-c*2.5);g.stroke()}
  for(const r of A.runways){const y=r.y,hw=r.w/2;
    g.fillStyle='#f2efe6';
    g.fillRect(r.x0+1,y-hw+0.5,r.x1-r.x0-2,0.35);g.fillRect(r.x0+1,y+hw-0.85,r.x1-r.x0-2,0.35);          // edge lines
    for(let x=r.x0+40;x<r.x1-40;x+=14)g.fillRect(x,y-0.18,7,0.36);                                       // centre dashes
    for(const[ex,dir]of[[r.x0,1],[r.x1,-1]]){for(let k=-5;k<=5;k++){if(!k)continue;g.fillRect(dir>0?ex+3:ex-15,y+k*1.1-0.35,12,0.55)}   // piano keys
      for(const o of[-3.2,3.2])g.fillRect(dir>0?ex+50:ex-62,y+o-0.6,12,1.2);                              // aiming points
      for(const o of[-4,-2.5,2.5,4])g.fillRect(dir>0?ex+80:ex-86,y+o-0.3,6,0.6)}
    if(detail){g.font='bold 5px sans-serif';g.textAlign='center';g.textBaseline='middle';for(const[ex,ang,txt]of[[r.x0+27,Math.PI/2,r.name[0]],[r.x1-27,-Math.PI/2,r.name[1]]]){g.save();g.translate(ex,y);g.rotate(ang);g.fillText(txt,0,0);g.restore()}}
    // rubber at the touchdown zones
    if(detail){for(const ex of[r.x0+70,r.x1-70]){g.fillStyle='rgba(20,20,22,.25)';g.fillRect(ex-30,y-3,60,6)}}}
  // apron: stand numbers and service road
  if(detail){g.fillStyle='#f2efe6';g.font='bold 2.4px sans-serif';g.textAlign='center';A.stands.forEach((st,i)=>{g.fillText(String(101+i),st.x+Math.cos(st.a)*st.len*0.62,st.y+Math.sin(st.a)*st.len*0.62)});
    g.strokeStyle='rgba(242,239,230,.9)';g.lineWidth=0.18;g.setLineDash([2,2]);const ap=A.apron;g.beginPath();g.moveTo(ap[0]+2,ap[1]+2);g.lineTo(ap[0]+2,ap[3]-2);g.stroke();g.setLineDash([])}
  g.restore();
}
function drawBaseField(g,x0,y0,x1,y1,detail){
  const B=W.base;if(!B||x1<B.x0||x0>B.x1||y1<B.y0||y0>B.y1)return;const r=B.runway,y=r.y,hw=r.w/2;g.save();
  g.fillStyle='#f2efe6';g.fillRect(r.x0+1,y-hw+0.5,r.x1-r.x0-2,0.35);g.fillRect(r.x0+1,y+hw-0.85,r.x1-r.x0-2,0.35);for(let x=r.x0+40;x<r.x1-40;x+=14)g.fillRect(x,y-0.18,7,0.36);
  for(const[ex,dir]of[[r.x0,1],[r.x1,-1]])for(let k=-6;k<=6;k++){if(!k)continue;g.fillRect(dir>0?ex+3:ex-15,y+k*1.1-0.35,12,0.55)}
  g.strokeStyle='#e8b923';g.lineWidth=detail?0.3:0.8;for(const t of B.taxis){g.beginPath();polyPath(g,t);g.stroke()}
  if(detail){g.fillStyle='rgba(242,239,230,.85)';for(const[x0b,,x1b]of B.shelters){g.fillRect((x0b+x1b)/2-0.15,1338,0.3,18)}
    // helipad-style marking and a big H on the tank park
    g.strokeStyle='rgba(242,239,230,.8)';g.lineWidth=0.3;for(const t of B.tanks)g.strokeRect(t.x-3.5,t.y-6,7,12)}
  g.restore()}
function drawGround(g,x0,y0,size,k,detail){
  const x1=x0+size,y1=y0+size;
  g.setTransform(k,0,0,k,-x0*k,-y0*k);
  const P=(n,f)=>detail?pat(g,n,f):f;
  g.fillStyle=P('grass',C.grass);g.fillRect(x0,y0,size,size);
  for(const z of W.draw.zones){if(!hit(z.bb,x0,y0,x1,y1))continue;
    if(z.t==='plazaLine'){g.strokeStyle=P('plaza',C.plaza);g.lineWidth=z.w;g.lineCap='round';g.lineJoin='round';g.beginPath();polyPath(g,z.pts);g.stroke();continue}
    if(z.t==='taxi'){g.strokeStyle=P('asphalt',C.road);g.lineWidth=z.w;g.lineCap='round';g.beginPath();polyPath(g,z.pts);g.stroke();continue}
    if(z.t==='acker'){const ac=(z.pts[0][0]*3+z.pts[0][1])%3<1.5?'acker':'acker2';g.save();g.beginPath();polyPath(g,z.pts);g.closePath();g.clip();const cx=(z.pts[0][0]+z.pts[2][0])/2,cy=(z.pts[0][1]+z.pts[2][1])/2;g.translate(cx,cy);g.rotate(z.ang||0);g.fillStyle=P(ac,ac==='acker'?'#8a7a55':'#93a84e');g.fillRect(-400,-400,800,800);g.restore();continue}
    g.fillStyle=z.t==='park'?P('park',C.park):z.t==='field'?P('field',C.field):z.t==='bank'?P('bank',C.bank):z.t==='runway'?P('asphalt',C.road):z.t==='apron'?P('concrete','#a4a49e'):P('plaza',C.plaza);g.beginPath();polyPath(g,z.pts);g.closePath();g.fill()}
  if(detail){g.strokeStyle=P('path',C.path);g.lineWidth=2.4;g.lineCap='round';for(const p of parkPaths){if(!hit(p.bb,x0,y0,x1,y1))continue;g.beginPath();polyPath(g,p.pts);g.stroke()}}
  for(const l of W.lots){if(!hit(l.bb,x0,y0,x1,y1))continue;g.fillStyle=P('lot',C.lot);g.beginPath();polyPath(g,l.pts);g.closePath();g.fill()}
  g.save();g.globalCompositeOperation='destination-out';g.fillStyle='#000';for(const w of W.draw.water){g.beginPath();polyPath(g,w.outer);g.closePath();for(const h of w.holes){polyPath(g,h);g.closePath()}g.fill('evenodd')}
  if(W.rail&&W.rail.cut){const C=W.rail.cut;g.fillRect(C.x0,C.y0,C.x1-C.x0,C.y1-C.y0)}   // the railway cutting is open: you look down into it
  g.restore();
  // soft contact shadow ("ambient occlusion") around building footprints, then the footprints
  g.lineJoin='round';
  if(detail){for(const[w,a]of[[5,0.07],[3,0.1],[1.6,0.14]]){g.strokeStyle='rgba(10,12,16,'+a+')';g.lineWidth=w;g.beginPath();for(const b of W.buildings){if(!hit(b.bb,x0,y0,x1,y1))continue;polyPath(g,b.pts);g.closePath()}g.stroke()}}
  g.fillStyle=C.base;g.beginPath();for(const b of W.buildings){if(!hit(b.bb,x0,y0,x1,y1))continue;polyPath(g,b.pts);g.closePath()}g.fill();
  g.lineCap='round';g.lineJoin='round';
  const vis=W.edges.filter(e=>hit(e.bb,x0,y0,x1,y1));
  for(const e of vis){g.strokeStyle=e.bridge?'#b3aea4':P('walk',C.walk);g.lineWidth=e.w+2*e.walk;g.beginPath();polyPath(g,e.pts);g.stroke()}
  g.fillStyle=P('walk',C.walk);for(const n of W.nodes)if(n.circle&&n.x>x0-14&&n.x<x1+14&&n.y>y0-14&&n.y<y1+14){g.beginPath();g.arc(n.x,n.y,12.5,0,7);g.fill()}
  for(const e of vis){g.strokeStyle=C.curb;g.lineWidth=e.w+0.6;g.beginPath();polyPath(g,e.pts);g.stroke()}
  for(const e of vis){g.strokeStyle=e.bridge?P('bridge',C.bridge):P('asphalt',C.road);g.lineWidth=e.w;g.beginPath();polyPath(g,e.pts);g.stroke()}
  g.fillStyle=P('asphalt',C.road);for(const n of W.nodes)if(n.circle&&n.x>x0-14&&n.x<x1+14&&n.y>y0-14&&n.y<y1+14){g.beginPath();g.arc(n.x,n.y,9,0,7);g.fill()}
  for(const rb of[W.RB,W.SG])if(rb){if(rb.x>x0-30&&rb.x<x1+30&&rb.y>y0-30&&rb.y<y1+30){g.fillStyle=C.curb;g.beginPath();g.arc(rb.x,rb.y,rb.r-3.7,0,7);g.fill();g.fillStyle=P('park',C.park);g.beginPath();g.arc(rb.x,rb.y,rb.r-4.4,0,7);g.fill();g.fillStyle=P('plaza',C.plaza);g.beginPath();g.arc(rb.x,rb.y,rb===W.SG?16:6,0,7);g.fill()}}
  for(const B of W.bridges||[]){if(B.x<x0-60||B.x>x1+60||B.y<y0-60||B.y>y1+60)continue;g.save();g.translate(B.x,B.y);g.transform(B.ux,B.uy,B.ox,B.oy,0,0);const L=B.ow+B.owalk+3,hw=B.uw;
    g.fillStyle=P('asphalt',C.road);g.fillRect(-L,-hw,2*L,2*hw);g.fillStyle='#f2efe6';for(const o of[-hw+0.5,hw-0.8])g.fillRect(-L,o,2*L,0.3);for(const o of[-hw/2,hw/2])for(let a=-L;a<L;a+=9)g.fillRect(a,o-0.12,4.5,0.24);g.restore()}
  drawAirfield(g,x0,y0,x1,y1,detail);drawBaseField(g,x0,y0,x1,y1,detail);
  if(!detail)return;
  const r=rnd((x0*3+y0*5)|0);
  // gutters along the kerbs
  g.lineCap='butt';g.strokeStyle='rgba(15,16,18,.22)';g.lineWidth=0.45;
  for(const e of vis){if(e.bridge)continue;for(const o of[-(e.w/2-0.25),e.w/2-0.25]){g.beginPath();polyPath(g,offsetLine(e.pts,o));g.stroke()}}
  // asphalt patches, tyre wear and cracks
  for(const e of vis){if(e.len<20)continue;for(let i=0;i<e.len/22;i++){const p=W.pointAt(e.pts,e.cum,r()*e.len);if(p.x<x0-5||p.x>x1+5||p.y<y0-5||p.y>y1+5)continue;
      const t=r();if(t<0.5){g.fillStyle=r()<0.5?'rgba(30,32,36,.35)':'rgba(95,98,104,.3)';g.save();g.translate(p.x+(r()-0.5)*e.w*0.6,p.y+(r()-0.5)*e.w*0.6);g.rotate(Math.atan2(p.ty,p.tx));g.fillRect(-1-r()*2,-0.5-r(),2+r()*4,1+r()*2);g.restore()}
      else if(t<0.85){g.strokeStyle='rgba(20,21,24,.45)';g.lineWidth=0.06;g.beginPath();let x=p.x+(r()-0.5)*e.w*0.7,y=p.y+(r()-0.5)*e.w*0.7;g.moveTo(x,y);for(let k=0;k<4;k++){x+=(r()-0.5)*1.6;y+=(r()-0.5)*1.6;g.lineTo(x,y)}g.stroke()}
      else{const o=(r()<0.5?-1:1)*e.w/4;const x=p.x-p.ty*o,y=p.y+p.tx*o;g.fillStyle='#34363a';g.beginPath();g.arc(x,y,0.34,0,7);g.fill();g.strokeStyle='#5c5f64';g.lineWidth=0.05;g.beginPath();g.arc(x,y,0.26,0,7);g.stroke()}}
    // tyre tracks in the lanes
    if(e.lanes>=1&&!e.oneway){g.strokeStyle='rgba(25,26,29,.12)';g.lineWidth=0.7;for(const o of[-e.w/4-0.75,-e.w/4+0.75,e.w/4-0.75,e.w/4+0.75]){g.beginPath();polyPath(g,offsetLine(e.pts,o));g.stroke()}}}
  // markings
  g.strokeStyle=C.mark;g.globalAlpha=0.92;
  for(const e of vis){
    if(e.oneway)continue;const s0=e.clearA+0.6,s1=e.len-e.clearB-0.6;if(s1-s0<3)continue;const line=subLine(e,s0,s1);
    if(e.lanes===1){g.lineWidth=0.14;g.setLineDash([3,5]);g.beginPath();polyPath(g,line);g.stroke();g.setLineDash([])}
    else{g.lineWidth=0.13;for(const o of[-0.16,0.16]){g.beginPath();polyPath(g,offsetLine(line,o));g.stroke()}g.setLineDash([3,6]);for(const o of[-e.w/4,e.w/4]){g.beginPath();polyPath(g,offsetLine(line,o));g.stroke()}g.setLineDash([])}
  }
  g.fillStyle=C.mark;
  for(const z of W.zebras){if(z.x<x0-10||z.x>x1+10||z.y<y0-10||z.y>y1+10)continue;g.save();g.translate(z.x,z.y);g.rotate(Math.atan2(z.ty,z.tx));for(let q=-z.w/2+0.55;q<=z.w/2-0.4;q+=1.0)g.fillRect(-1.3,q-0.25,2.6,0.5);g.restore()}
  for(const n of W.nodes){if(!n.light||n.x<x0-20||n.x>x1+20||n.y<y0-20||n.y>y1+20)continue;
    for(const ei of n.edges){const e=W.edges[ei];const d=e.a===n.id?e.F:e.B;const s=n.r+3.6;if(s>e.len/2)continue;const p=W.pointAt(d.pts,d.cum,s);const nx=-p.ty,ny=p.tx;
      g.strokeStyle=C.mark;g.lineWidth=0.4;g.beginPath();g.moveTo(p.x-nx*0.2,p.y-ny*0.2);g.lineTo(p.x-nx*(e.w/2-0.2),p.y-ny*(e.w/2-0.2));g.stroke()}}
  g.globalAlpha=1;
  g.strokeStyle='rgba(240,237,228,.85)';g.lineWidth=0.12;
  for(const l of W.lots){if(!hit(l.bb,x0,y0,x1,y1))continue;const P0=l.pts[0];for(let q=0.15;q<=l.w;q+=2.9){const ax=P0[0]+l.tx*q+l.nx*(l.d-5.6),ay=P0[1]+l.ty*q+l.ny*(l.d-5.6);g.beginPath();g.moveTo(ax,ay);g.lineTo(ax+l.nx*5,ay+l.ny*5);g.stroke()}}
}
let overview=null;
function buildOverview(){const N=Q.overview||4096;const c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d');drawGround(g,0,0,W.MAP,N/W.MAP,false);
  const sm=document.createElement('canvas');sm.width=sm.height=1536;sm.getContext('2d').drawImage(c,0,0,1536,1536);overview=sm;R3.overview=sm;return c}

/* ---------- ground chunks ---------- */
const CHUNK=100;
const chunkTex=new Map(),chunkMeshes=[];
let chunkCv=null;const chunkFree=[];
function chunkTexture(i,j){const key=i*100+j;let t=chunkTex.get(key);if(t){chunkTex.delete(key);chunkTex.set(key,t);return t}
  const px=Q.chunkPx;if(!chunkCv){chunkCv=document.createElement('canvas');chunkCv.width=chunkCv.height=px}
  const g=chunkCv.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,px,px);drawGround(g,i*CHUNK,j*CHUNK,CHUNK,px/CHUNK,true);
  if(chunkTex.size>=Q.cache){const k=chunkTex.keys().next().value;t=chunkTex.get(k);chunkTex.delete(k)}
  else{t=new THREE.CanvasTexture(chunkCv);t.anisotropy=maxAniso;t.minFilter=THREE.LinearMipmapLinearFilter}
  t.image=chunkCv;t.needsUpdate=true;if(renderer.initTexture)renderer.initTexture(t);chunkTex.set(key,t);return t}
function updateChunks(force){
  const f=camFocus();const need=[];if(!force&&camAlt>45)return;   // from high up the detailed overview is enough
  const ax=f.x+Math.sin(cam.yaw)*55,ay=f.y-Math.cos(cam.yaw)*55;
  const i0=Math.floor((ax-190)/CHUNK),i1=Math.floor((ax+190)/CHUNK),j0=Math.floor((ay-190)/CHUNK),j1=Math.floor((ay+190)/CHUNK);
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){if(i<0||j<0||i*CHUNK>=W.MAP||j*CHUNK>=W.MAP)continue;const cx=(i+0.5)*CHUNK,cy=(j+0.5)*CHUNK;const d=hypot(cx-ax,cy-ay);if(d<205)need.push({i,j,d})}
  need.sort((a,b)=>a.d-b.d);
  let k=0,budget=force?99:Q.budget;
  for(const n of need){if(k>=chunkMeshes.length)break;const key=n.i*100+n.j;const m=chunkMeshes[k];
    if(m.userData.key!==key){if(!chunkTex.has(key)){if(budget<=0)continue;budget--}m.material.map=chunkTexture(n.i,n.j);m.material.needsUpdate=true;m.position.set((n.i+0.5)*CHUNK,0.03,(n.j+0.5)*CHUNK);m.userData.key=key}
    m.visible=true;k++}
  for(;k<chunkMeshes.length;k++){chunkMeshes[k].visible=false;chunkMeshes[k].userData.key=-1}
}
function camFocus(){return cam.target||{x:600,y:640}}
function detailTexture(){
  // tiling grain multiplied over the ground for close-up crispness
  const n=128,c=document.createElement('canvas');c.width=c.height=n;const g=c.getContext('2d');const img=g.createImageData(n,n);const r=rnd(31);
  const v=new Float32Array(n*n);for(let i=0;i<n*n;i++)v[i]=r();
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){let s=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)s+=v[((y+dy+n)%n)*n+(x+dx+n)%n];s=s/9*0.6+v[y*n+x]*0.4;const b=Math.round(clamp(s,0,1)*255);const i=(y*n+x)*4;img.data[i]=img.data[i+1]=img.data[i+2]=b;img.data[i+3]=255}
  g.putImageData(img,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=maxAniso;return t}
function groundMaterial(){
  const m=new THREE.MeshLambertMaterial({alphaTest:0.5,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
  m.onBeforeCompile=sh=>{sh.uniforms.uDetail=U.detail;sh.fragmentShader='uniform sampler2D uDetail;\n'+sh.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n#ifdef USE_MAP\ndiffuseColor.rgb*=0.9+0.2*texture2D(uDetail,vUv*44.0).r;\n#endif')};
  m.customProgramCacheKey=()=>'ground';return m;
}
let waterMat=null;
function waterDistanceTexture(){
  // distance to the shore in 2 m cells (chamfer transform) for colour depth and foam
  const N=600,s=W.MAP/N,d=new Float32Array(N*N);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const g=W.waterMask[Math.floor(y*s+1)*W.MAP+Math.floor(x*s+1)];d[y*N+x]=g?1e6:0}
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;if(!d[i])continue;let v=d[i];if(x>0)v=Math.min(v,d[i-1]+1);if(y>0)v=Math.min(v,d[i-N]+1);if(x>0&&y>0)v=Math.min(v,d[i-N-1]+1.414);if(x<N-1&&y>0)v=Math.min(v,d[i-N+1]+1.414);d[i]=v}
  for(let y=N-1;y>=0;y--)for(let x=N-1;x>=0;x--){const i=y*N+x;if(!d[i])continue;let v=d[i];if(x<N-1)v=Math.min(v,d[i+1]+1);if(y<N-1)v=Math.min(v,d[i+N]+1);if(x<N-1&&y<N-1)v=Math.min(v,d[i+N+1]+1.414);if(x>0&&y<N-1)v=Math.min(v,d[i+N-1]+1.414);d[i]=v}
  const data=new Uint8Array(N*N*4);for(let i=0;i<N*N;i++){const v=Math.round(clamp(d[i]*s/24,0,1)*255);data[i*4]=data[i*4+1]=data[i*4+2]=v;data[i*4+3]=255}
  const t=new THREE.DataTexture(data,N,N,THREE.RGBAFormat);t.magFilter=t.minFilter=THREE.LinearFilter;t.needsUpdate=true;return t;
}
function buildGround(){
  const ov=buildOverview();const t=new THREE.CanvasTexture(ov);t.anisotropy=maxAniso;renderer.initTexture&&renderer.initTexture(t);t.image={width:ov.width,height:ov.height};ov.width=ov.height=1;
  const base=new THREE.Mesh(new THREE.PlaneGeometry(W.MAP,W.MAP),new THREE.MeshLambertMaterial({map:t,alphaTest:0.5}));base.rotation.x=-Math.PI/2;base.position.set(W.MAP/2,-0.1,W.MAP/2);base.receiveShadow=true;scene.add(base);
  // the green beyond the map edge: a frame around the map (not under it, so holes in the ground, like the railway cutting, stay open)
  for(const[cx,cz,w,d]of[[W.MAP/2,-1000,6000,2000],[W.MAP/2,W.MAP+1000,6000,2000],[-1000,W.MAP/2,2000,W.MAP],[W.MAP+1000,W.MAP/2,2000,W.MAP]]){const outer=new THREE.Mesh(new THREE.PlaneGeometry(w,d),lam('#7a9f50'));outer.rotation.x=-Math.PI/2;outer.position.set(cx,-0.2,cz);scene.add(outer)}
  U.detail.value=detailTexture();
  for(let i=0;i<20;i++){const m=new THREE.Mesh(new THREE.PlaneGeometry(CHUNK,CHUNK),groundMaterial());m.rotation.x=-Math.PI/2;m.receiveShadow=true;m.visible=false;m.userData.key=-1;m.renderOrder=1;scene.add(m);chunkMeshes.push(m)}
  // the Isar: animated waves, sun glints, sky reflection, foam along the banks
  const uni=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{deep:{value:new THREE.Color('#22636b')},shallow:{value:new THREE.Color('#4f9f9b')},sky:{value:new THREE.Color('#bcd6ea')},sunDir:{value:new THREE.Vector3(0,1,0)},sunCol:{value:new THREE.Color('#ffffff')},night:{value:0},dist:{value:null}}]);
  uni.time=U.time;uni.dist.value=waterDistanceTexture();
  waterMat=new THREE.ShaderMaterial({uniforms:uni,fog:true,side:THREE.DoubleSide,
    vertexShader:'varying vec3 vW;\n#include <fog_pars_vertex>\nvoid main(){vec4 wp=modelMatrix*vec4(position,1.0);vW=wp.xyz;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
    fragmentShader:`uniform float time;uniform vec3 deep;uniform vec3 shallow;uniform vec3 sky;uniform vec3 sunDir;uniform vec3 sunCol;uniform float night;uniform sampler2D dist;varying vec3 vW;
#include <fog_pars_fragment>
float H(vec2 p){p.y+=time*1.4;return sin(p.x*0.31+time*1.3)*0.5+sin(p.y*0.43-time*1.1+p.x*0.12)*0.4+sin((p.x+p.y)*0.97+time*2.6)*0.18+sin((p.x*1.9-p.y*1.3)-time*3.4)*0.1+sin((p.x*3.7+p.y*2.9)+time*4.1)*0.05;}
void main(){vec2 p=vW.xz;float d=texture2D(dist,p/1600.0).r;
  vec3 n=normalize(vec3(H(p-vec2(0.35,0.0))-H(p+vec2(0.35,0.0)),0.9,H(p-vec2(0.0,0.35))-H(p+vec2(0.0,0.35))));
  vec3 v=normalize(cameraPosition-vW);float fres=pow(1.0-max(dot(n,v),0.0),3.0);
  vec3 col=mix(shallow,deep,smoothstep(0.0,0.7,d));col=mix(col,sky,0.18+0.55*fres);
  vec3 r=reflect(-v,n);float sp=pow(max(dot(r,normalize(sunDir)),0.0),140.0);col+=sunCol*sp*1.6;
  float foam=(1.0-smoothstep(0.0,0.09,d))*(0.55+0.45*sin(d*90.0-time*2.2+p.y*0.05));col=mix(col,vec3(0.9,0.93,0.92)*(1.0-0.6*night),clamp(foam,0.0,1.0)*0.55);
  gl_FragColor=vec4(col,1.0);
#include <fog_fragment>
}`});
  for(const w of W.draw.water){const sh=new THREE.Shape(w.outer.map(p=>new THREE.Vector2(p[0],p[1])));for(const h of w.holes)sh.holes.push(new THREE.Path(h.map(p=>new THREE.Vector2(p[0],p[1]))));
    const g=new THREE.ShapeGeometry(sh);g.rotateX(Math.PI/2);const m=new THREE.Mesh(g,waterMat);m.position.y=-0.04;scene.add(m)}
}

/* ---------- buildings ---------- */
// facade textures: one window bay (3.1 m × 3.2 m). Alpha 0.5 marks glass (lit at night, reflects the sky by day).
function glass(g,x,y,w,h,top,bot){g.clearRect(x,y,w,h);const gr=g.createLinearGradient(0,y,0,y+h);gr.addColorStop(0,top);gr.addColorStop(1,bot);g.fillStyle=gr;g.globalAlpha=0.5;g.fillRect(x,y,w,h);g.globalAlpha=1}
function facadeTex(style){
  const F=Q.facade||256;return canvasTex(F,F,(g)=>{g.scale(F/128,F/128);const w=128,h=128;const r=rnd(style*13+5);
    if(style===0){g.fillStyle='#f6f1e8';g.fillRect(0,0,w,h);g.fillStyle='#e3d9c8';g.fillRect(0,118,w,10);g.fillStyle='#ece4d6';g.fillRect(34,12,60,9);g.fillStyle='#d8ccb6';g.fillRect(30,20,68,4);
      g.fillStyle='#fbfaf6';g.fillRect(38,26,52,72);glass(g,43,31,42,62,'#4d6378','#26313d');g.fillStyle='#fbfaf6';g.fillRect(62,31,4,62);g.fillRect(43,49,42,4);g.fillStyle='#d9cfbd';g.fillRect(32,98,64,6);g.fillStyle='rgba(0,0,0,.08)';g.fillRect(32,104,64,3)}
    else if(style===1){g.fillStyle='#f3f3f0';g.fillRect(0,0,w,h);speck(g,300,128,r,['rgba(0,0,0,.035)','rgba(255,255,255,.05)'],2);g.fillStyle='#ffffff';g.fillRect(26,30,76,60);glass(g,30,34,68,52,'#53697d','#2a3440');g.fillStyle='#ffffff';g.fillRect(62,34,4,52);g.fillStyle='#c9c9c4';g.fillRect(24,90,80,5);
      g.fillStyle='rgba(60,60,60,.25)';g.fillRect(30,34,68,6)}
    else if(style===2){g.fillStyle='#e9ecef';g.fillRect(0,0,w,h);glass(g,0,26,w,102,'#6f8aa3','#2f4052');g.fillStyle='#d5dade';for(const x of[0,63,124])g.fillRect(x,26,4,102);g.fillStyle='#c4cad0';g.fillRect(0,22,w,4)}
    else{g.fillStyle='#ffffff';g.fillRect(0,0,w,h);g.fillStyle='rgba(0,0,0,.13)';for(let y=0;y<h;y+=8){g.fillRect(0,y,w,1);const o=(y/8)%2?0:8;for(let x=o;x<w;x+=16)g.fillRect(x,y,1,8)}speck(g,200,128,r,['rgba(0,0,0,.07)','rgba(255,255,255,.12)'],3);
      g.fillStyle='#f4f1ea';g.fillRect(36,24,56,70);glass(g,40,28,48,62,'#50667a','#27323e');g.fillStyle='#f4f1ea';g.fillRect(62,28,4,62);g.fillStyle='#e6e0d4';g.fillRect(32,94,64,6);g.fillStyle='#efe9dd';g.fillRect(32,18,64,6)}
  },true);
}
// ground-floor shop fronts: 4 variants stacked vertically (each 128 px = 3.8 m); one bay = 4 m
function shopTex(){
  const F=(Q.facade||256)/128;return canvasTex(128*F,512*F,(g)=>{g.scale(F,F);const w=128,h=512;const r=rnd(21);
    const awn=['#b8352c','#2f6b4f','#1f4f8a','#c58b2b','#6b3a75','#2b2b30'];
    for(let k=0;k<4;k++){const y0=k*128;g.fillStyle='#d9d3c7';g.fillRect(0,y0,w,128);g.fillStyle='#b9b2a5';g.fillRect(0,y0+118,w,10);
      const ac=awn[Math.floor(r()*awn.length)];
      if(k===0){g.fillStyle='#2a2d33';g.fillRect(6,y0+14,116,16);g.fillStyle='#e8d9a8';g.fillRect(14,y0+19,60,6);glass(g,8,y0+36,112,80,'#8aa1b3','#3b4b5a');g.fillStyle='#2a2d33';g.fillRect(62,y0+36,4,80)}
      else if(k===1){for(let i=0;i<8;i++){g.fillStyle=i%2?ac:'#f1ede2';g.fillRect(4+i*15,y0+16,15,14)}g.fillStyle='rgba(0,0,0,.25)';g.fillRect(4,y0+30,120,4);glass(g,10,y0+38,66,76,'#7d95a8','#36444f');g.fillStyle='#5b4632';g.fillRect(84,y0+38,32,80);glass(g,90,y0+44,20,40,'#7d95a8','#36444f')}
      else if(k===2){g.fillStyle='#8f9296';g.fillRect(8,y0+30,112,88);g.fillStyle='rgba(0,0,0,.18)';for(let y=y0+33;y<y0+118;y+=5)g.fillRect(8,y,112,1);g.fillStyle='#3a3d42';g.fillRect(8,y0+20,112,10);g.fillStyle='#d8d3c6';g.fillRect(16,y0+23,40,4)}
      else{g.fillStyle='#3a2a20';g.fillRect(6,y0+12,116,104);glass(g,12,y0+20,104,90,'#9b8a6d','#3b3127');g.fillStyle='#3a2a20';g.fillRect(44,y0+20,4,90);g.fillRect(80,y0+20,4,90);g.fillStyle=ac;g.fillRect(4,y0+6,120,8)}}
  },true);
}
function roofTileTex(){return canvasTex(128,128,(g)=>{g.scale(2,2);const w=64,h=64;const r=rnd(9);g.fillStyle='#ffffff';g.fillRect(0,0,w,h);for(let row=0;row<4;row++){const y=row*16,o=(row%2)*8;for(let x=-8;x<w;x+=16){const v=225+Math.floor(r()*30);g.fillStyle='rgb('+v+','+v+','+v+')';g.fillRect(x+o+1,y,14,14)}g.fillStyle='rgba(0,0,0,.35)';g.fillRect(0,y+14,w,2)}},true)}
function gravelTex(){return canvasTex(128,128,(g,w,h)=>{const r=rnd(3);g.fillStyle='#ffffff';g.fillRect(0,0,w,h);speck(g,2400,128,r,['#d9d9d9','#c4c4c4','#efefef','#b8b8b8'],1.6)},true)}
const nightShader=(kind)=>sh=>{
  sh.uniforms.uLit=U.lit;sh.uniforms.uNightK=U.nightK;sh.uniforms.uShopK=U.shopK;sh.uniforms.uSkyRefl=U.skyRefl;
  sh.vertexShader='attribute float aSeed;\nvarying float vSeed;\n'+sh.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvSeed=aSeed;');
  const em=kind==='shop'
    ?'totalEmissiveRadiance+=wGlass*(vec3(1.0,0.82,0.55)*uShopK*0.85*step(0.25,hh(vec2(floor(vUv.x),vSeed)))+uSkyRefl);'
    :'vec2 cell=floor(vUv);float rn=hh(cell+vSeed*91.7);float on=step(rn,uLit*(0.6+0.8*hh(vec2(vSeed,3.1))));vec3 wc=mix(vec3(1.0,0.8,0.5),vec3(0.78,0.86,1.0),step(0.8,hh(cell*1.7+vSeed)));totalEmissiveRadiance+=wGlass*(on*wc*uNightK*0.95+uSkyRefl);';
  sh.fragmentShader='uniform float uLit;uniform float uNightK;uniform float uShopK;uniform vec3 uSkyRefl;varying float vSeed;\nfloat hh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n'+sh.fragmentShader
    .replace('#include <color_fragment>','#include <color_fragment>\nfloat wGlass=1.0-step(0.75,texelColor.a);diffuseColor.rgb=mix(diffuseColor.rgb,texelColor.rgb,wGlass);diffuseColor.a=1.0;')
    .replace('#include <emissivemap_fragment>',em);
};
let wallMats=[],shopMat,roofTileMat,roofFlatMat,trimMat;
function newAcc(){const a={};for(const k of['w0','w1','w2','w3','shop'])a[k]={p:[],n:[],u:[],c:[],s:[]};for(const k of['rt','rf'])a[k]={p:[],n:[],u:[],c:[]};a.trim={p:[],n:[],c:[]};return a}
function quadTo(B,a,b,c,d,n,col,uv,seed,colTop){ // a,b,c,d counter-clockwise seen from outside; uv: [[u,v]x4]; colTop tints c,d
  for(const i of[0,1,2,0,2,3]){const v=[a,b,c,d][i];const cc=colTop&&i>=2?colTop:col;B.p.push(v[0],v[1],v[2]);B.n.push(n[0],n[1],n[2]);B.c.push(cc.r,cc.g,cc.b);if(B.u)B.u.push(uv?uv[i][0]:0,uv?uv[i][1]:0);if(B.s)B.s.push(seed||0)}
}
function boxTo(B,cx,cy,cz,lx,ly,lz,ry,col){const g=new THREE.BoxGeometry(lx,ly,lz).toNonIndexed();g.applyMatrix4(tm(cx,cy,cz,ry));const pa=g.attributes.position.array,na=g.attributes.normal.array;for(let k=0;k<pa.length;k+=3){B.p.push(pa[k],pa[k+1],pa[k+2]);B.n.push(na[k],na[k+1],na[k+2]);B.c.push(col.r,col.g,col.b)}g.dispose()}
function addBuildingGeo(acc,b){
  const P=b.pts,h=b.h;let cx=0,cy=0;for(const p of P){cx+=p[0];cy+=p[1]}cx/=4;cy/=4;
  const r=rnd(Math.floor(b.seed*1e6)+7);
  const wc=new THREE.Color(b.wall),rc=new THREE.Color(b.roof),trimC=wc.clone().multiplyScalar(0.86),darkC=wc.clone().multiplyScalar(0.62);
  const style=b.style||0,WB=acc['w'+style];
  const shopFront=b.street&&style!==2&&h>9&&(style===0?r()<0.85:r()<0.5)&&!b.noShop;
  const gf=shopFront?3.8:0;const shopRow=Math.floor(r()*4);
  for(let i=0;i<4;i++){const a=P[i],c=P[(i+1)%4];let nx=-(c[1]-a[1]),ny=c[0]-a[0];const len=hypot(nx,ny)||1;nx/=len;ny/=len;const mx=(a[0]+c[0])/2-cx,my=(a[1]+c[1])/2-cy;let A=a,Cc=c;if(nx*mx+ny*my<0){nx=-nx;ny=-ny;A=c;Cc=a}
    // keep the outward winding consistent: walk A->Cc so that the normal points outwards
    const u1=Math.max(1,Math.round(len/3.1)),shade=0.94+0.06*nx;const col=wc.clone().multiplyScalar(shade);
    const n=[nx,0,ny];
    if(gf>0){const us=Math.max(1,Math.round(len/4));const v0=1-(shopRow+1)/4+0.002,v1=1-shopRow/4-0.002;
      quadTo(acc.shop,[A[0],0,A[1]],[Cc[0],0,Cc[1]],[Cc[0],gf,Cc[1]],[A[0],gf,A[1]],n,col.clone().multiplyScalar(0.74),[[0,v0],[us,v0],[us,v1],[0,v1]],b.seed,col);
      // band above the shops
      const o=0.18;quadTo(acc.trim,[A[0]+nx*o,gf-0.05,A[1]+ny*o],[Cc[0]+nx*o,gf-0.05,Cc[1]+ny*o],[Cc[0]+nx*o,gf+0.35,Cc[1]+ny*o],[A[0]+nx*o,gf+0.35,A[1]+ny*o],n,trimC);
      quadTo(acc.trim,[A[0],gf+0.35,A[1]],[A[0]+nx*o,gf+0.35,A[1]+ny*o],[Cc[0]+nx*o,gf+0.35,Cc[1]+ny*o],[Cc[0],gf+0.35,Cc[1]],[0,1,0],trimC)}
    else{const o=0.06;quadTo(acc.trim,[A[0]+nx*o,0,A[1]+ny*o],[Cc[0]+nx*o,0,Cc[1]+ny*o],[Cc[0]+nx*o,0.7,Cc[1]+ny*o],[A[0]+nx*o,0.7,A[1]+ny*o],n,darkC)}
    const v1=(h-gf)/3.2;
    if(gf>0)quadTo(WB,[A[0],gf,A[1]],[Cc[0],gf,Cc[1]],[Cc[0],h,Cc[1]],[A[0],h,A[1]],n,col.clone().multiplyScalar(0.94),[[0,0],[u1,0],[u1,v1],[0,v1]],b.seed,col.clone().multiplyScalar(1.03));
    else{const yb=Math.min(3.2,h*0.5),vb=yb/3.2;   // darker towards the ground, like ambient occlusion
      quadTo(WB,[A[0],0,A[1]],[Cc[0],0,Cc[1]],[Cc[0],yb,Cc[1]],[A[0],yb,A[1]],n,col.clone().multiplyScalar(0.7),[[0,0],[u1,0],[u1,vb],[0,vb]],b.seed,col);
      quadTo(WB,[A[0],yb,A[1]],[Cc[0],yb,Cc[1]],[Cc[0],h,Cc[1]],[A[0],h,A[1]],n,col,[[0,vb],[u1,vb],[u1,v1],[0,v1]],b.seed,col.clone().multiplyScalar(1.04))}
    // cornice for old buildings
    if(style===0||style===3){const o=0.32,y0=h-0.55;quadTo(acc.trim,[A[0]+nx*o,y0,A[1]+ny*o],[Cc[0]+nx*o,y0,Cc[1]+ny*o],[Cc[0]+nx*o,h,Cc[1]+ny*o],[A[0]+nx*o,h,A[1]+ny*o],n,trimC);
      quadTo(acc.trim,[A[0],y0,A[1]],[Cc[0],y0,Cc[1]],[Cc[0]+nx*o,y0,Cc[1]+ny*o],[A[0]+nx*o,y0,A[1]+ny*o],[0,-1,0],darkC)}
  }
  const pushRoof=(B,q,col,uvf)=>{const ax=q[1][0]-q[0][0],ay=q[1][1]-q[0][1],az=q[1][2]-q[0][2],bx=q[2][0]-q[0][0],by=q[2][1]-q[0][1],bz=q[2][2]-q[0][2];let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;const l=hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;if(ny<0){nx=-nx;ny=-ny;nz=-nz;q=[q[0],q[2],q[1]]}for(const v of q){B.p.push(v[0],v[1],v[2]);B.n.push(nx,ny,nz);B.c.push(col.r,col.g,col.b);const uv=uvf(v);B.u.push(uv[0],uv[1])}};
  if(b.pitched){
    let Qd=P;const A=hypot(P[1][0]-P[0][0],P[1][1]-P[0][1]),B=hypot(P[2][0]-P[1][0],P[2][1]-P[1][1]);if(B>A)Qd=[P[1],P[2],P[3],P[0]];
    const LA=Math.max(A,B),SB=Math.min(A,B),dx=(Qd[1][0]-Qd[0][0])/LA,dy=(Qd[1][1]-Qd[0][1])/LA,rh=SB*0.42;const ins=Math.min(SB/2,LA/2-0.2);
    const m03=[(Qd[0][0]+Qd[3][0])/2,(Qd[0][1]+Qd[3][1])/2],m12=[(Qd[1][0]+Qd[2][0])/2,(Qd[1][1]+Qd[2][1])/2];
    const R0=[m03[0]+dx*ins,h+rh,m03[1]+dy*ins],R1=[m12[0]-dx*ins,h+rh,m12[1]-dy*ins];const v=i=>[Qd[i][0],h,Qd[i][1]];
    const uvf=p=>[(p[0]*dx+p[2]*dy)/1.2,(-p[0]*dy+p[2]*dx)/0.8+p[1]*0.9];
    const c1=rc.clone().multiplyScalar(1.06),c2=rc.clone().multiplyScalar(0.84),c3=rc.clone().multiplyScalar(0.95);
    pushRoof(acc.rt,[v(0),v(1),R1],c1,uvf);pushRoof(acc.rt,[v(0),R1,R0],c1,uvf);pushRoof(acc.rt,[v(2),v(3),R0],c2,uvf);pushRoof(acc.rt,[v(2),R0,R1],c2,uvf);pushRoof(acc.rt,[v(1),v(2),R1],c3,uvf);pushRoof(acc.rt,[v(3),v(0),R0],c3,uvf);
    // chimneys
    const nch=r()<0.75?1+Math.floor(r()*2):0;const chC=new THREE.Color(r()<0.5?'#8c4a3a':'#9a9a96');
    for(let k=0;k<nch;k++){const t=0.2+r()*0.6,side=(r()<0.5?-1:1)*SB*0.22;const px=R0[0]+(R1[0]-R0[0])*t-dy*side,pz=R0[2]+(R1[2]-R0[2])*t+dx*side;const by=h+rh*(1-Math.abs(side)/(SB/2));boxTo(acc.trim,px,by+0.5,pz,0.7,1.6,0.7,0,chC)}
  }else{
    const v=i=>[P[i][0],h,P[i][1]],uvf=p=>[p[0]/3,p[2]/3];pushRoof(acc.rf,[v(0),v(1),v(2)],rc,uvf);pushRoof(acc.rf,[v(0),v(2),v(3)],rc,uvf);
    // parapet
    const ph=0.75,ins=0.28,pc=wc.clone().multiplyScalar(0.9),inner=P.map(p=>{const dx=cx-p[0],dy=cy-p[1],l=hypot(dx,dy)||1;return[p[0]+dx/l*ins*1.41,p[1]+dy/l*ins*1.41]});
    for(let i=0;i<4;i++){let a=P[i],c=P[(i+1)%4],ia=inner[i],ic=inner[(i+1)%4];let nx=-(c[1]-a[1]),ny=c[0]-a[0];const l=hypot(nx,ny)||1;nx/=l;ny/=l;const mx=(a[0]+c[0])/2-cx,my=(a[1]+c[1])/2-cy;if(nx*mx+ny*my<0){nx=-nx;ny=-ny;[a,c]=[c,a];[ia,ic]=[ic,ia]}
      quadTo(acc.trim,[a[0],h,a[1]],[c[0],h,c[1]],[c[0],h+ph,c[1]],[a[0],h+ph,a[1]],[nx,0,ny],pc);
      quadTo(acc.trim,[ic[0],h,ic[1]],[ia[0],h,ia[1]],[ia[0],h+ph,ia[1]],[ic[0],h+ph,ic[1]],[-nx,0,-ny],pc.clone().multiplyScalar(0.8));
      quadTo(acc.trim,[a[0],h+ph,a[1]],[c[0],h+ph,c[1]],[ic[0],h+ph,ic[1]],[ia[0],h+ph,ia[1]],[0,1,0],pc.clone().multiplyScalar(1.05))}
    // rooftop units, vents and the odd solar panel
    const n=Math.floor(r()*3)+(h>30?2:0);
    for(let i=0;i<n;i++){const u=0.22+r()*0.56,vv=0.22+r()*0.56;const x=P[0][0]+(P[1][0]-P[0][0])*u+(P[3][0]-P[0][0])*vv,z=P[0][1]+(P[1][1]-P[0][1])*u+(P[3][1]-P[0][1])*vv;const s=1.2+r()*1.6;
      const ang=Math.atan2(P[1][1]-P[0][1],P[1][0]-P[0][0]);
      if(r()<0.3){boxTo(acc.trim,x,h+0.35,z,s*1.6,0.12,s,-ang,new THREE.Color('#2d3a52'))}else boxTo(acc.trim,x,h+0.5,z,s,0.9+r(),s*0.8,-ang,new THREE.Color(r()<0.5?'#a3a9af':'#8a8f95'))}
  }
}
function accMeshes(acc,shadow){
  const out=[];
  const mk=(B,mat,uv,seed)=>{if(!B.p.length)return;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(B.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(B.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(B.c,3));if(uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(B.u,2));if(seed)g.setAttribute('aSeed',new THREE.Float32BufferAttribute(B.s,1));g.computeBoundingSphere();
    const m=new THREE.Mesh(g,mat);m.castShadow=shadow;m.receiveShadow=true;scene.add(m);out.push(m)};
  for(let s=0;s<4;s++)mk(acc['w'+s],wallMats[s],true,true);
  mk(acc.shop,shopMat,true,true);mk(acc.rt,roofTileMat,true);mk(acc.rf,roofFlatMat,true);mk(acc.trim,trimMat,false);
  return out;
}
function buildBuildings(){
  for(let s=0;s<4;s++){const m=new THREE.MeshLambertMaterial({map:facadeTex(s),vertexColors:true});m.onBeforeCompile=nightShader('wall');m.customProgramCacheKey=()=>'wall';wallMats.push(m)}
  const st=shopTex();st.wrapT=THREE.ClampToEdgeWrapping;shopMat=new THREE.MeshLambertMaterial({map:st,vertexColors:true});shopMat.onBeforeCompile=nightShader('shop');shopMat.customProgramCacheKey=()=>'shop';
  roofTileMat=new THREE.MeshLambertMaterial({map:roofTileTex(),vertexColors:true});roofFlatMat=new THREE.MeshLambertMaterial({map:gravelTex(),vertexColors:true});trimMat=new THREE.MeshLambertMaterial({vertexColors:true});
  const SEC=150,secs=new Map();
  for(const b of W.buildings){const k=Math.floor(b.cx/SEC)*100+Math.floor(b.cy/SEC);let a=secs.get(k);if(!a)secs.set(k,a=newAcc());addBuildingGeo(a,b)}
  for(const a of secs.values())accMeshes(a,true);
  // shop signs
  for(const s of W.shops){const lbl=s.k==='waffen'?'WAFFEN':'BROTZEIT';const sp=iconLabel(s.k,lbl,'#ffc61a',1.7);sp.position.set(s.x,4.8,s.y);scene.add(sp);s.sprite=sp}
}
function texturedBox(x0,z0,x1,z1,h,color,y0,style){
  const acc=newAcc();addBuildingGeo(acc,{pts:[[x0,z0],[x1,z0],[x1,z1],[x0,z1]],h,wall:color,roof:shadeHex(color,-0.25),pitched:false,seed:0.5,style:style||0,street:false,noShop:true});
  const ms=accMeshes(acc,true);for(const m of ms)m.position.y=y0||0;return{m:ms[0]};
}

/* ---------- landmarks ---------- */
function addMesh(geo,mat,x,y,z,o){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);if(o&&o.ry)m.rotation.y=o.ry;if(o&&o.rx)m.rotation.x=o.rx;if(o&&o.rz)m.rotation.z=o.rz;m.castShadow=!(o&&o.noShadow);m.receiveShadow=true;scene.add(m);return m}
function gable(x0,z0,x1,z1,y,h,color){const L=x1-x0,Wd=z1-z0;const s=Wd/Math.SQRT2;const m=addMesh(new THREE.BoxGeometry(L,s,s),lam(color),(x0+x1)/2,y,(z0+z1)/2,{rx:Math.PI/4});m.scale.y=h/(Wd/2);return m}
function onion(x,y,z,r,col){addMesh(new THREE.CylinderGeometry(r*0.9,r*0.9,r*1.3,8),lam('#a0634c'),x,y,z);const s=addMesh(new THREE.SphereGeometry(r,10,8),lam(col),x,y+r*1.3,z);s.scale.y=1.25;addMesh(new THREE.ConeGeometry(r*0.25,r*1.6,6),lam(col),x,y+r*2.8,z)}
let wheel=null;const wheelLights=[];
// roof prism along x without faces that coincide with the walls (no z-fighting)
function prismRoof(cx,cz,len,wid,y,h,mat,over){over=over||0.6;const sh=new THREE.Shape();sh.moveTo(-wid/2-over,0);sh.lineTo(wid/2+over,0);sh.lineTo(0,h);sh.closePath();
  const g=new THREE.ExtrudeGeometry(sh,{depth:len+over*2,bevelEnabled:false});g.translate(0,0,-(len+over*2)/2);g.rotateY(Math.PI/2);const m=addMesh(g,mat,cx,y+0.02,cz);return m}
function ruhmeshalle(halls){
  const st=lam('#d9d0bc'),dk=lam('#b8ae98');
  halls.forEach(([x0,z0,x1,z1],k)=>{const w=x1-x0,d=z1-z0,cx=(x0+x1)/2,cz=(z0+z1)/2;
    addMesh(new THREE.BoxGeometry(w+1,1.2,d+1),dk,cx,0.6,cz);                              // podium
    addMesh(new THREE.BoxGeometry(k?w:2,8,k?2:d),st,k?cx:x0+1,5.2,k?(k===1?z0+1:z1-1):cz); // back wall
    addMesh(new THREE.BoxGeometry(w+0.6,1.4,d+0.6),st,cx,9.9,cz);                              // entablature
    addMesh(new THREE.BoxGeometry(w+0.2,0.5,d+0.2),dk,cx,10.85,cz);
    const colG=new THREE.CylinderGeometry(0.42,0.5,8,10);
    if(k===0){for(let z=z0+1.6;z<=z1-1.6;z+=2.6)addMesh(colG,st,x1-0.6,5.2,z)}
    else{const fz=k===1?z1-0.6:z0+0.6;for(let x=x0+3.5;x<=x1-0.8;x+=2.6)addMesh(colG,st,x,5.2,fz)}});
  // broad stairs down to the Wiesn
  for(let i=0;i<5;i++)addMesh(new THREE.BoxGeometry(2,0.25*(5-i),24),lam('#cfc6b2'),150+i*2,0.125*(5-i),862);
}
function festzelt(x,y,w,d,name,i){
  const wallTex=canvasTex(128,64,(g)=>{g.fillStyle='#f1ead8';g.fillRect(0,0,128,64);g.fillStyle='#7a4f2e';g.fillRect(0,46,128,18);g.fillStyle='#2a5fb0';g.fillRect(0,40,128,4);
    for(let k=0;k<4;k++){g.fillStyle='#ffe7b0';g.fillRect(8+k*32,12,18,22);g.strokeStyle='#5a3a22';g.lineWidth=2;g.strokeRect(8+k*32,12,18,22);g.beginPath();g.moveTo(17+k*32,12);g.lineTo(17+k*32,34);g.stroke()}},true);
  wallTex.repeat.set(w/8,1);
  const walls=new THREE.Mesh(new THREE.BoxGeometry(w,6,d),[lam('#efe8d6'),lam('#efe8d6'),lam('#efe8d6'),lam('#efe8d6'),new THREE.MeshLambertMaterial({map:wallTex}),new THREE.MeshLambertMaterial({map:wallTex})]);
  walls.position.set(x,3,y);walls.castShadow=walls.receiveShadow=true;scene.add(walls);
  const stripe=canvasTex(64,64,(g)=>{for(let k=0;k<8;k++){g.fillStyle=k%2?'#ffffff':(i===1?'#b8352c':'#2a5fb0');g.fillRect(0,k*8,64,8)}},true);stripe.repeat.set(1,0.25);
  prismRoof(x,y,w,d,6,d*0.32,new THREE.MeshLambertMaterial({map:stripe}),0.9);
  // decorated entrance facade with tower and sign at the east end
  const fx=x+w/2+0.05;
  const facade=new THREE.Shape();facade.moveTo(-6,0);facade.lineTo(6,0);facade.lineTo(6,9);facade.lineTo(3,9);facade.lineTo(0,12.5);facade.lineTo(-3,9);facade.lineTo(-6,9);facade.closePath();
  const fg=new THREE.ExtrudeGeometry(facade,{depth:0.6,bevelEnabled:false});fg.rotateY(Math.PI/2);addMesh(fg,lam('#e9dcc0'),fx+0.95,0,y);
  const sign=labelSprite(name,'rgba(42,95,176,.92)','#ffffff',1.5);sign.position.set(fx+1.9,7.3,y);scene.add(sign);
  for(const sd of[-1,1]){addMesh(new THREE.BoxGeometry(2.4,13,2.4),lam('#e9dcc0'),fx+1.3,6.5,y+sd*7.6);addMesh(new THREE.ConeGeometry(1.9,3,4),lam('#7a3a2a'),fx+1.3,14.5,y+sd*7.6,{ry:Math.PI/4});
    addMesh(new THREE.CylinderGeometry(0.06,0.06,4,4),lam('#888'),fx+1.3,17.8,y+sd*7.6);addMesh(new THREE.BoxGeometry(0.05,1.1,1.8),lam(sd>0?'#ffffff':'#2a5fb0'),fx+1.3,19,y+sd*7.6+0.9)}
  addMesh(new THREE.BoxGeometry(0.3,3.6,5),lam('#3a2716'),fx+1.3,1.8,y);
  // beer garden in front of the long side
  const bench=new THREE.BoxGeometry(5,0.75,0.8),seat=new THREE.BoxGeometry(5,0.45,0.3);const bm=lam('#8a5a33');
  for(let k=0;k<Math.floor(w/7);k++)for(const r of[0,1]){const bx=x-w/2+4+k*7,bz=y+d/2+3+r*2.6;addMesh(bench,bm,bx,0.38,bz);addMesh(seat,bm,bx,0.23,bz-0.7);addMesh(seat,bm,bx,0.23,bz+0.7)}
}
function riesenrad(x,y){
  wheel=new THREE.Group();const st=lam('#f2f0ea'),R0=17,N=24;
  for(const z of[-1.3,1.3]){const t=new THREE.Mesh(new THREE.TorusGeometry(R0,0.32,6,64),st);t.position.z=z;wheel.add(t);const t2=new THREE.Mesh(new THREE.TorusGeometry(R0-1.6,0.16,4,64),st);t2.position.z=z;wheel.add(t2)}
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.1,3.6,14),lam('#c9c6bd'));hub.rotation.x=Math.PI/2;wheel.add(hub);
  for(let i=0;i<N*2;i++){const a=i/(N*2)*Math.PI*2;for(const z of[-1.3,1.3]){const sp=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,R0,4),st);sp.position.set(Math.cos(a)*R0/2,Math.sin(a)*R0/2,z*0.6);sp.rotation.z=a-Math.PI/2;sp.rotation.x=z>0?-0.08:0.08;wheel.add(sp)}}
  for(let i=0;i<N;i++){const a=i/N*Math.PI*2;const cb=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.2,2.6),st);cb.position.set(Math.cos(a)*R0,Math.sin(a)*R0,0);wheel.add(cb);
    const gd=new THREE.Group();gd.position.set(Math.cos(a)*R0,Math.sin(a)*R0,0);gd.userData.gondola=true;
    const col=['#c0392b','#2e86c1','#f1c40f','#27ae60','#8e44ad','#e67e22'][i%6];
    const cab=new THREE.Mesh(new THREE.BoxGeometry(1.9,1.7,1.6),lam(col));cab.position.y=-1.6;gd.add(cab);
    const win=new THREE.Mesh(new THREE.BoxGeometry(1.95,0.7,1.3),lam('#dfeaf2',{emissive:'#26303a'}));win.position.y=-1.4;gd.add(win);
    const rf=new THREE.Mesh(new THREE.ConeGeometry(1.35,0.6,4),lam(col));rf.position.y=-0.5;rf.rotation.y=Math.PI/4;gd.add(rf);
    const hang=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.6,0.1),st);hang.position.y=-0.1;gd.add(hang);wheel.add(gd)}
  // light bulbs along both rims
  const bulbG=new THREE.SphereGeometry(0.14,5,4);const bm=new THREE.MeshBasicMaterial({color:'#ffe9a8'});const n=96;const im=new THREE.InstancedMesh(bulbG,bm,n*2);let k=0;
  for(const z of[-1.45,1.45])for(let i=0;i<n;i++){const a=i/n*Math.PI*2;im.setMatrixAt(k++,M4().makeTranslation(Math.cos(a)*(R0+0.35),Math.sin(a)*(R0+0.35),z))}wheel.add(im);wheelLights.push(im);
  wheel.position.set(x,20,y);wheel.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh)o.castShadow=true});scene.add(wheel);
  // A-frame supports on both sides, cabin at the base
  for(const dz of[-3.2,3.2])for(const dx of[-7.5,7.5]){const len=Math.hypot(dx,20);const leg=addMesh(new THREE.CylinderGeometry(0.28,0.4,len,6),st,x+dx/2,10,y+dz);leg.rotation.z=Math.atan2(dx,20)}
  addMesh(new THREE.CylinderGeometry(0.3,0.3,6.6,6),st,x,20,y,{rx:Math.PI/2});
  addMesh(new THREE.BoxGeometry(10,3,5),lam('#b8352c'),x,1.5,y+8);addMesh(new THREE.BoxGeometry(10.6,0.4,5.6),lam('#f2f0ea'),x,3.2,y+8);
  const sg=labelSprite('RIESENRAD','rgba(184,53,44,.9)','#fff',1.1);sg.position.set(x,4.6,y+8);scene.add(sg);
}
function uniBuildings(L){
  for(const[x0,z0,x1,z1,side]of L.blds){texturedBox(x0,z0,x1,z1,19,'#e2cc98');prismRoof((x0+x1)/2,(z0+z1)/2,x1-x0-1.5,z1-z0-1.5,19,4,lam('#6f7c86'),0.2);
    const fx=side==='w'?x1+0.6:x0-0.6,cz=(z0+z1)/2;addMesh(new THREE.BoxGeometry(1.4,23,20),lam('#e8d4a2'),fx,11.5,cz);
    const arches=canvasTex(128,64,(g)=>{g.fillStyle='#e8d4a2';g.fillRect(0,0,128,64);g.fillStyle='#3a3226';for(let k=0;k<5;k++){g.beginPath();g.moveTo(8+k*24,64);g.lineTo(8+k*24,30);g.arc(18+k*24,30,10,Math.PI,0);g.lineTo(28+k*24,64);g.fill()}});
    const ap=new THREE.Mesh(new THREE.PlaneGeometry(18,6),new THREE.MeshLambertMaterial({map:arches}));ap.position.set(fx+(side==='w'?0.72:-0.72),3,cz);ap.rotation.y=side==='w'?Math.PI/2:-Math.PI/2;scene.add(ap);
    addMesh(new THREE.BoxGeometry(1.8,1,22),lam('#cdb886'),fx,23.4,cz)}
  const sg=labelSprite('LUDWIG-MAXIMILIANS-UNIVERSITÄT','rgba(30,40,60,.85)','#f3e6c4',1.3);sg.position.set(490,26,366);scene.add(sg);
  for(const[fx,fz]of L.founts){const b=addMesh(new THREE.CylinderGeometry(3.2,3.4,0.8,20),lam('#cfc8b6'),fx,0.4,fz);void b;
    const w=new THREE.Mesh(new THREE.CylinderGeometry(2.9,2.9,0.1,20),new THREE.MeshPhongMaterial({color:'#4f8fb0',shininess:120,envMap:envCube,reflectivity:0.5,combine:THREE.MixOperation,transparent:true,opacity:0.88}));w.position.set(fx,0.72,fz);scene.add(w);
    addMesh(new THREE.CylinderGeometry(0.35,0.5,1.4,8),lam('#cfc8b6'),fx,1,fz);fountains.push({x:fx,y:fz,top:1.9,r:2.6})}
}
function dorfkirche(x,y){
  const wall=lam('#f1ece0');addMesh(new THREE.BoxGeometry(16,8,10),wall,x+1,4,y);prismRoof(x+1,y,16,10,8,4.5,lam('#9c4b3a'),0.5);
  addMesh(new THREE.BoxGeometry(4.6,20,4.6),wall,x-8.5,10,y);onion(x-8.5,20,y,2.3,'#4f7a52');
  const clock=new THREE.Mesh(new THREE.CircleGeometry(0.9,16),lam('#2a2a2a'));clock.position.set(x-10.82,16,y);clock.rotation.y=-Math.PI/2;scene.add(clock);
}
/* ---------- aircraft ---------- */
const LIVERY={isar:{body:'#f4f5f7',tail:'#1f4f8a',stripe:'#1f4f8a',eng:'#1f4f8a',name:'ISAR AIR'},alpen:{body:'#f4f5f7',tail:'#c8102e',stripe:'#c8102e',eng:'#d9dadc',name:'ALPENFLUG'},
  bavaria:{body:'#f4f5f7',tail:'#5aa9e6',stripe:'#5aa9e6',eng:'#f4f5f7',name:'BAVARIA JET'},edelweiss:{body:'#f4f5f7',tail:'#3d3a8c',stripe:'#e0a526',eng:'#3d3a8c',name:'ENZIAN'},
  nordlicht:{body:'#1b2740',tail:'#33c48d',stripe:'#33c48d',eng:'#1b2740',name:'NORDLICHT'},cargo:{body:'#f4f5f7',tail:'#f28c28',stripe:'#6b6e73',eng:'#f28c28',name:'MUC CARGO'},
  privat:{body:'#1d1f24',tail:'#c9a227',stripe:'#c9a227',eng:'#2a2c31',belly:'#26282d',name:'ISAR ONE'},luftwaffe:{body:'#7d8790',tail:'#6c757d',stripe:'#2f3338',eng:'#5b6269',belly:'#9aa3ab',name:''}};
const planeCache=new Map();
const PLANE_T={narrow:{len:38,span:35,r:2.0,eng:2,er:1.0,el:4.6},wide:{len:64,span:62,r:3.0,eng:2,er:1.65,el:7},jumbo:{len:70,span:64,r:3.2,eng:4,er:1.25,el:5.2},
  regio:{len:27,span:27,r:1.35,eng:2,er:0.55,el:4.2,prop:true,high:true},cessna:{len:8.3,span:11,r:0.62,eng:0,prop:true,high:true,nose:true,small:true},
  bizjet:{len:15,span:13.5,r:0.85,eng:2,er:0.42,el:2.5,rear:true,ttail:true,cy:1.95},fighter:{len:15.5,span:10,r:0.75,small:true,fighter:true,cy:1.9}};
function planeDims(type){const T=PLANE_T[type]||PLANE_T.narrow;return{T,cy:T.cy||(T.small?1.15:T.r+(T.high?1.0:1.7))}}
// smooth engine pod made by rotating a profile (front lip, fat middle, tapered exhaust)
function nacelleGeo(R,L){const pts=[[0.001,-L*0.62],[R*0.32,-L*0.6],[R*0.5,-L*0.5],[R*0.72,-L*0.32],[R*0.95,-L*0.05],[R,L*0.18],[R*0.98,L*0.4],[R*0.9,L*0.5],[R*0.8,L*0.47]].map(p=>new THREE.Vector2(p[0],p[1]));
  const g=new THREE.LatheGeometry(pts,18);g.rotateZ(-Math.PI/2);return g}
function planeGeometry(type,liv){
  const key=type+liv;let g=planeCache.get(key);if(g)return g;const Lv=LIVERY[liv]||LIVERY.isar;const P=[];
  const{T,cy}=planeDims(type);if(T.fighter){g=fighterGeometry(Lv,cy);planeCache.set(key,g);return g}const r=T.r,len=T.len;const add=(geo,color,m)=>P.push({g:geo,color,m});
  const noseL=T.small?1.4:2.3*r,tailL=T.small?3.2:3.6*r,Lb=len-noseL-tailL,bx=(noseL-tailL)/2*-1*-1*0+(tailL-noseL)/2;   // body centre so that nose..tail spans [-len/2, len/2]
  const xN=bx+Lb/2,xT=bx-Lb/2;
  // fuselage, nose and upswept tail cone
  const fus=new THREE.CylinderGeometry(r,r,Lb,20);fus.rotateZ(Math.PI/2);add(fus,Lv.body,tm(bx,cy,0));
  const nose=new THREE.SphereGeometry(r,20,12,0,Math.PI*2,0,Math.PI/2);nose.rotateZ(-Math.PI/2);add(nose,Lv.body,tm(xN,cy-r*0.08,0,0,noseL/r,0.95,1));
  const tc=new THREE.CylinderGeometry(r*0.18,r,tailL,20);tc.rotateZ(Math.PI/2);tc.translate(-tailL/2,0,0);add(tc,Lv.body,tm(xT,cy,0,0,1,1,1,-0.09));
  if(type==='jumbo'){const hump=new THREE.CylinderGeometry(r*0.72,r*0.72,len*0.26,16);hump.rotateZ(Math.PI/2);add(hump,Lv.body,tm(xN-len*0.13,cy+r*0.5,0));const hn=new THREE.SphereGeometry(r*0.72,14,8,0,Math.PI*2,0,Math.PI/2);hn.rotateZ(-Math.PI/2);add(hn,Lv.body,tm(xN,cy+r*0.5,0,0,1.6,1,1))}
  // belly and cheat line, window band, cockpit
  for(const sd of[1,-1]){
    if(!T.small){add(new THREE.BoxGeometry(Lb*0.9,r*0.085,0.04),'#2a3140',tm(bx+r*0.5,cy+r*0.34,sd*r*0.945));add(new THREE.BoxGeometry(Lb+noseL*0.4,r*0.11,0.04),Lv.stripe,tm(bx-noseL*0.1,cy-r*0.08,sd*r*0.997))}
    else add(new THREE.BoxGeometry(1.6,0.42,0.04),'#2a3140',tm(xN-0.9,cy+0.32,sd*r*0.86));
    add(new THREE.BoxGeometry(noseL*0.32,r*0.22,0.05),'#1b2330',tm(xN+noseL*0.48,cy+r*0.36,sd*r*0.52,sd*-0.5,1,1,1,-0.32))}
  const belly=new THREE.CylinderGeometry(r*0.985,r*0.985,Lb*0.98,20,1,true,Math.PI*0.6,Math.PI*0.8);belly.rotateZ(Math.PI/2);add(belly,Lv.belly||(liv==='nordlicht'?'#2b3956':'#dfe3e8'),tm(bx,cy-0.01,0));
  // wings: swept, tapered, slight dihedral via two halves; winglets on jets
  const wingShape=(span,root,tip,sweep,sg,th)=>{const sh=new THREE.Shape();sh.moveTo(root*0.5,0);sh.lineTo(root*0.5-sweep,span*sg);sh.lineTo(root*0.5-sweep-tip,span*sg);sh.lineTo(-root*0.5,0);sh.closePath();const g=new THREE.ExtrudeGeometry(sh,{depth:th,bevelEnabled:false});g.rotateX(Math.PI/2);return g};
  const half=T.span/2,root=T.small?1.5:len*0.19,wy=T.high?cy+r*0.92:cy-r*0.55,sweep=T.prop?root*0.06:root*0.78,th=T.small?0.12:Math.max(0.28,r*0.15);
  const wingX=T.small?xN-2.6:bx+len*0.06;
  for(const sd of[1,-1]){const w=wingShape(half-r*0.5,root,root*(T.prop?0.6:0.3),sweep,sd,th);add(w,Lv.body,tm(wingX,wy+th/2,sd*r*0.5,0,1,1,1,0));
    if(!T.prop){add(new THREE.BoxGeometry(root*0.3*0.9,r*0.75,0.12),Lv.tail,tm(wingX+root*0.5-sweep-root*0.15,wy+r*0.34,sd*(half-0.05),0,1,1,1,-0.35))}
    if(T.small)add(new THREE.BoxGeometry(0.08,1.0,0.08),'#c9ced3',tm(wingX-0.2,cy+0.1,sd*1.4,0,1,1,1,0));}
  if(!T.high){const fair=new THREE.SphereGeometry(r*0.9,14,8);add(fair,Lv.body,tm(wingX-root*0.05,cy-r*0.45,0,0,root*0.62/r,0.55,1.02))}
  // engines: lathe pods on pylons (jets) or slim nacelles with propellers (turboprop)
  if(T.rear){for(const sd of[1,-1]){const er=T.er,el=T.el,ex=xT-tailL*0.12,ez=sd*(r+er*1.15),ey=cy+r*0.3;add(nacelleGeo(er,el),Lv.eng,tm(ex,ey,ez));
      const fan=new THREE.CircleGeometry(er*0.78,18);fan.rotateY(Math.PI/2);add(fan,'#4a4f57',tm(ex+el*0.44,ey,ez));add(new THREE.BoxGeometry(el*0.45,0.14,er*1.3),Lv.body,tm(ex,ey,sd*(r+er*0.35)))}}   // engines on the rear fuselage
  if(T.eng&&!T.rear){const fr=T.eng===4?[0.2,0.36]:[T.prop?0.2:0.165];
    for(const sd of[1,-1])for(const f of fr){const ez=sd*T.span*f,frac=(Math.abs(ez)-r*0.5)/(half-r*0.5),lead=wingX+root*0.5-sweep*frac;
      const er=T.er,el=T.el;const ex=T.prop?lead-el*0.25:lead+el*0.05,ey=T.high?wy-er*0.15:wy-er*1.15;
      add(nacelleGeo(er,el),Lv.eng,tm(ex,ey,ez));
      if(!T.prop){const fan=new THREE.CircleGeometry(er*0.78,18);fan.rotateY(Math.PI/2);add(fan,'#4a4f57',tm(ex+el*0.44,ey,ez));const sp=new THREE.ConeGeometry(er*0.22,er*0.45,12);sp.rotateZ(-Math.PI/2);add(sp,'#c9ced3',tm(ex+el*0.48,ey,ez));
        add(new THREE.BoxGeometry(el*0.75,Math.abs(wy-ey)-er*0.6,0.22),Lv.body,tm(ex+el*0.05,(wy+ey+er*0.6)/2,ez));
        const ex2=new THREE.ConeGeometry(er*0.32,el*0.3,12);ex2.rotateZ(Math.PI/2);add(ex2,'#7d838b',tm(ex-el*0.66,ey,ez))}
      else{const sp=new THREE.ConeGeometry(er*0.45,er*1.2,12);sp.rotateZ(-Math.PI/2);add(sp,'#d9dde2',tm(ex+el*0.55,ey,ez))}}}
  if(T.nose){const sp=new THREE.ConeGeometry(0.22,0.5,12);sp.rotateZ(-Math.PI/2);add(sp,'#d9dde2',tm(len/2+0.15,cy,0))}
  // tail fin with dorsal fillet, stabilisers
  const fh=T.small?1.5:T.span*(T.prop?0.22:0.25),fr2=T.small?1.6:tailL*0.95;const fin=new THREE.Shape();fin.moveTo(fr2*0.15,0);fin.lineTo(-fr2*0.55,fh);fin.lineTo(-fr2*0.95,fh);fin.lineTo(-fr2*1.02,0);fin.closePath();
  const fth=T.small?0.12:0.36;const fg=new THREE.ExtrudeGeometry(fin,{depth:fth,bevelEnabled:false});fg.translate(0,0,-fth/2);const finX=xT-tailL*0.1;add(fg,Lv.tail,tm(finX,cy+r*0.6,0));
  const dor=new THREE.Shape();dor.moveTo(fr2*0.9,0);dor.lineTo(fr2*0.15,fh*0.22);dor.lineTo(fr2*0.15,0);dor.closePath();const dg=new THREE.ExtrudeGeometry(dor,{depth:fth,bevelEnabled:false});dg.translate(0,0,-fth/2);add(dg,Lv.tail,tm(finX,cy+r*0.6,0));
  const tt=(T.prop&&!T.small)||T.ttail;const stY=tt?cy+r*0.6+fh*0.95:cy+r*0.3,stX=tt?finX-fr2*0.7:xT-tailL*0.62;
  for(const sd of[1,-1]){const st=wingShape(T.small?1.7:T.span*0.17,T.small?0.9:tailL*0.36,T.small?0.6:tailL*0.15,T.small?0.15:tailL*0.32,sd,T.small?0.08:0.22);add(st,tt?Lv.tail:Lv.body,tm(stX,stY,sd*(tt?0.1:r*0.2)))}
  // landing gear
  const wheel=(x,z,wr,w)=>{const wg=new THREE.CylinderGeometry(wr,wr,w||0.35,12);wg.rotateX(Math.PI/2);add(wg,'#141416',tm(x,wr,z))};const grey='#9aa0a6';
  if(T.small){add(new THREE.BoxGeometry(0.08,0.7,0.08),grey,tm(xN-0.4,0.45,0));wheel(xN-0.4,0,0.22,0.15);for(const sd of[1,-1]){add(new THREE.BoxGeometry(0.1,0.1,1.0),grey,tm(xN-2.8,0.55,sd*0.6));wheel(xN-2.8,sd*1.05,0.26,0.16)}}
  else{const ng=xN-noseL*0.1;add(new THREE.BoxGeometry(0.2,cy-r+0.2,0.2),grey,tm(ng,(cy-r)/2+0.3,0));wheel(ng,0.25,0.42);wheel(ng,-0.25,0.42);
    const mz=T.high?r*0.95:Math.min(T.span*0.12,r*1.6);for(const sd of[1,-1]){const gx=wingX-root*0.3;add(new THREE.BoxGeometry(0.32,cy-r+0.5,0.32),grey,tm(gx,(cy-r)/2+0.45,sd*mz));for(const dx of(T.len>50?[-0.7,0.7]:[0]))for(const dz of[-0.3,0.3])wheel(gx+dx,sd*mz+dz,T.len>50?0.65:0.55)}}
  g=mergeGeos(P);planeCache.set(key,g);return g;
}
// fighter jet: slim fuselage with pointed nose, bubble canopy, side intakes, delta wings, twin canted fins, missiles on the wings
function fighterGeometry(Lv,cy){const P=[];const add=(geo,color,m)=>P.push({g:geo,color,m});
  const fus=new THREE.CylinderGeometry(0.78,0.7,9.4,16);fus.rotateZ(Math.PI/2);add(fus,Lv.body,tm(0.2,cy,0));
  const nose=new THREE.ConeGeometry(0.78,3.6,16);nose.rotateZ(-Math.PI/2);add(nose,Lv.body,tm(6.7,cy,0));
  const tip=new THREE.ConeGeometry(0.18,0.8,8);tip.rotateZ(-Math.PI/2);add(tip,'#3a3e44',tm(8.7,cy,0));
  const noz=new THREE.CylinderGeometry(0.7,0.55,1.4,14);noz.rotateZ(Math.PI/2);add(noz,'#4a4e54',tm(-5.2,cy,0));
  const hole=new THREE.CircleGeometry(0.5,14);hole.rotateY(-Math.PI/2);add(hole,'#141518',tm(-5.92,cy,0));
  const can=new THREE.SphereGeometry(1,14,10,0,Math.PI*2,0,Math.PI/2);add(can,'#22303f',tm(3.4,cy+0.45,0,0,1.7,0.62,0.52));
  add(new THREE.BoxGeometry(2.2,0.5,0.06),Lv.belly||Lv.body,tm(2.6,cy+0.62,0));
  for(const sd of[1,-1]){add(new THREE.BoxGeometry(3.6,0.9,0.5),Lv.body,tm(0.8,cy-0.1,sd*0.9));const ih=new THREE.BoxGeometry(0.05,0.7,0.36);add(ih,'#141518',tm(2.63,cy-0.1,sd*0.9))}
  const wing=(span,root,tip2,sweep,sg,th)=>{const sh=new THREE.Shape();sh.moveTo(root*0.5,0);sh.lineTo(root*0.5-sweep,span*sg);sh.lineTo(root*0.5-sweep-tip2,span*sg);sh.lineTo(-root*0.5,0);sh.closePath();const g=new THREE.ExtrudeGeometry(sh,{depth:th,bevelEnabled:false});g.rotateX(Math.PI/2);return g};
  for(const sd of[1,-1]){add(wing(4.4,6.4,0.9,5.2,sd,0.14),Lv.body,tm(-1.2,cy-0.05,sd*0.7));
    add(wing(1.9,2.0,0.7,1.3,sd,0.1),Lv.body,tm(-5.0,cy-0.05,sd*0.55));
    const fin=new THREE.Shape();fin.moveTo(0.6,0);fin.lineTo(-1.2,2.5);fin.lineTo(-2.1,2.5);fin.lineTo(-2.4,0);fin.closePath();const fg=new THREE.ExtrudeGeometry(fin,{depth:0.1,bevelEnabled:false});fg.translate(0,0,-0.05);fg.rotateX(-sd*0.32);add(fg,Lv.tail,tm(-3.0,cy+0.45,sd*0.55));
    const ms=new THREE.CylinderGeometry(0.1,0.1,2.8,8);ms.rotateZ(Math.PI/2);add(ms,'#e8e8e2',tm(-1.6,cy-0.3,sd*3.3));const mt=new THREE.ConeGeometry(0.1,0.35,8);mt.rotateZ(-Math.PI/2);add(mt,'#c0392b',tm(-0.03,cy-0.3,sd*3.3));
    add(new THREE.BoxGeometry(0.1,0.1,1.0),'#9aa0a6',tm(-1.2,cy-0.85,sd*0.85));const wg=new THREE.CylinderGeometry(0.34,0.34,0.22,12);wg.rotateX(Math.PI/2);add(wg,'#141416',tm(-1.2,0.34,sd*1.25))}
  add(new THREE.BoxGeometry(0.12,cy-0.5,0.12),'#9aa0a6',tm(4.6,(cy-0.5)/2+0.3,0));{const wg=new THREE.CylinderGeometry(0.28,0.28,0.18,12);wg.rotateX(Math.PI/2);add(wg,'#141416',tm(4.6,0.28,0))}
  return mergeGeos(P)}
const planeMat=new THREE.MeshPhongMaterial({vertexColors:true,shininess:70,specular:new THREE.Color('#666'),side:THREE.DoubleSide});
function nameDecal(liv,len,r,cy){const Lv=LIVERY[liv]||LIVERY.isar;const k='dec'+liv;let m=matCache.get(k);if(!m){m=new THREE.MeshBasicMaterial({map:canvasTex(256,48,(g)=>{g.fillStyle=liv==='nordlicht'?'#e8f7f0':Lv.tail;g.font='bold 34px Bungee, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(Lv.name,128,26)}),transparent:true,depthWrite:false});matCache.set(k,m)}
  const grp=new THREE.Group();for(const sd of[1,-1]){const pl=new THREE.Mesh(new THREE.PlaneGeometry(len*0.3,len*0.034),m);pl.position.set(len*0.1,cy+r*0.62,sd*(r*0.8+0.05));pl.rotation.x=sd*-0.65;if(sd<0)pl.rotation.y=Math.PI;grp.add(pl)}return grp}
const propBladeGeo=new THREE.BoxGeometry(0.06,1,0.16);const propDiscMat=new THREE.MeshBasicMaterial({color:'#2a2b2e',transparent:true,opacity:0.18,depthWrite:false,side:THREE.DoubleSide});
// helicopter model: police (blue/white) or your armed one (olive, stub wings with gun and rocket pods)
function makeHeliModel(o){const g=new THREE.Group();const hb=lam(o.body),hw=lam(o.belly),hd=lam('#1c1d20');
  const body=new THREE.Mesh(new THREE.SphereGeometry(1.6,14,10),hb);body.scale.set(1.7,1,1);g.add(body);
  const belly=new THREE.Mesh(new THREE.SphereGeometry(1.55,14,10,0,Math.PI*2,Math.PI/2,Math.PI/2),hw);belly.scale.set(1.68,0.9,0.98);belly.position.y=-0.05;g.add(belly);
  const canopy=new THREE.Mesh(new THREE.SphereGeometry(1.1,12,8,0,Math.PI*2,0,Math.PI/2),new THREE.MeshPhongMaterial({color:'#223042',shininess:120,envMap:envCube,reflectivity:0.6,combine:THREE.MixOperation}));canopy.position.set(1.4,0.2,0);canopy.scale.set(1.1,0.9,1);g.add(canopy);
  const boom=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.4,5,8),hb);boom.rotation.z=Math.PI/2;boom.position.set(-4.2,0.35,0);g.add(boom);
  const fin=new THREE.Mesh(new THREE.BoxGeometry(0.9,1.4,0.12),hb);fin.position.set(-6.5,1,0);g.add(fin);
  for(const z of[-0.9,0.9]){const sk=new THREE.Mesh(new THREE.BoxGeometry(3.6,0.1,0.1),hd);sk.position.set(0.2,-1.55,z);g.add(sk);for(const x of[-0.8,1]){const st=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.6,0.08),hd);st.position.set(x,-1.25,z);g.add(st)}}
  if(o.armed){for(const sd of[-1,1]){const w=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.12,1.5),hb);w.position.set(0.1,-0.35,sd*2.1);g.add(w);
      const pod=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.28,1.8,10),hd);pod.rotation.z=Math.PI/2;pod.position.set(0.2,-0.6,sd*2.6);g.add(pod);
      const gun=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,1.6,6),lam('#3a3b3e'));gun.rotation.z=Math.PI/2;gun.position.set(1.4,-0.62,sd*2.6);g.add(gun)}
    const chin=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,1.4,6),lam('#3a3b3e'));chin.rotation.z=Math.PI/2;chin.position.set(2.9,-0.9,0);g.add(chin)}
  const rotor=new THREE.Group();for(let i=0;i<4;i++){const bl=new THREE.Mesh(new THREE.BoxGeometry(6.2,0.05,0.32),hd);bl.position.x=3.1;const arm=new THREE.Group();arm.rotation.y=i*Math.PI/2;arm.add(bl);rotor.add(arm)}
  const disc=new THREE.Mesh(new THREE.CircleGeometry(6.3,32),new THREE.MeshBasicMaterial({color:'#222',transparent:true,opacity:0.12,depthWrite:false,side:THREE.DoubleSide}));disc.rotation.x=-Math.PI/2;rotor.add(disc);rotor.position.y=1.75;g.add(rotor);rotor.userData.disc=disc;
  const tail=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.04,0.16),hd);tail.position.set(-6.5,1.1,0.12);tail.rotation.x=Math.PI/2;g.add(tail);
  const blink=new THREE.Mesh(new THREE.SphereGeometry(0.16,6,4),redOn);blink.position.set(-6.9,1.75,0);g.add(blink);
  g.traverse(m=>{if(m.isMesh)m.castShadow=true});return{g,rotor,tail,blink}}
function planeObject(type,liv){const{T,cy}=planeDims(type);const grp=new THREE.Group();const m=new THREE.Mesh(planeGeometry(type,liv),planeMat);m.castShadow=true;m.receiveShadow=true;grp.add(m);
  if(!T.small)grp.add(nameDecal(liv,T.len,T.r,cy));
  // propellers as separate parts so they can spin
  grp.userData.props=[];if(T.prop){const pos=[];if(T.nose)pos.push([T.len/2+0.05,cy,0,0.95]);else{const half=T.span/2,root=T.len*0.19,wy=cy+T.r*0.92,wingX=(3.6*T.r-2.3*T.r)/2+T.len*0.06;for(const sd of[1,-1]){const ez=sd*T.span*0.2,frac=(Math.abs(ez)-T.r*0.5)/(half-T.r*0.5),lead=wingX+root*0.5-root*0.06*frac;pos.push([lead-T.el*0.25+T.el*0.62,wy-T.er*0.15,ez,T.er*3.2])}}
    for(const[x,y,z,rad]of pos){const hub=new THREE.Group();hub.position.set(x,y,z);for(let k=0;k<(T.nose?2:4);k++){const b=new THREE.Mesh(propBladeGeo,lam('#222428'));b.scale.set(1,rad,1);b.position.y=rad/2;const arm=new THREE.Group();arm.rotation.x=k/(T.nose?2:4)*Math.PI*2;arm.add(b);hub.add(arm)}
      const disc=new THREE.Mesh(new THREE.CircleGeometry(rad,24),propDiscMat);disc.rotation.y=Math.PI/2;disc.visible=false;hub.add(disc);hub.userData.disc=disc;grp.add(hub);grp.userData.props.push(hub)}}
  return grp}
let planeObjs=[];const jetObjs=[];
function airportBuild(A){
  const glass='#9fb4c4';
  for(const t of A.terminals){const[x0,z0,x1,z1]=t.box;texturedBox(x0,z0,x1,z1,15,glass,0,2);addMesh(new THREE.BoxGeometry(x1-x0+4,0.8,z1-z0+2),lam('#d8dcdf'),(x0+x1)/2-1,15.4,(z0+z1)/2);
    const sg=labelSprite(t.name.toUpperCase(),'rgba(20,32,52,.9)','#ffffff',1.6);sg.position.set(x0-3,18,(z0+z1)/2);scene.add(sg);
    addMesh(new THREE.BoxGeometry(4,0.5,z1-z0),lam('#c9ced3'),x0-2,6,(z0+z1)/2)}
  {const[x0,z0,x1,z1]=A.satellite;texturedBox(x0,z0,x1,z1,12,glass,0,2);addMesh(new THREE.BoxGeometry(x1-x0+2,0.7,z1-z0+2),lam('#d8dcdf'),(x0+x1)/2,12.3,(z0+z1)/2)}
  for(const b of A.garages){texturedBox(b[0],b[1],b[2],b[3],16,'#b9bcbf',0,1);const sg=labelSprite('P20 · PARKHAUS','rgba(31,79,138,.9)','#fff',1.1);sg.position.set((b[0]+b[2])/2,19,(b[1]+b[3])/2);scene.add(sg)}
  {const b=A.hotel;texturedBox(b[0],b[1],b[2],b[3],26,'#aebdcb',0,2)}
  // MAC forum: glass roof on four masts
  {const[x0,z0,x1,z1]=A.mac;const g=new THREE.PlaneGeometry(x1-x0,z1-z0,16,12);g.rotateX(-Math.PI/2);const pos=g.attributes.position;for(let i=0;i<pos.count;i++){const u=pos.getX(i)/((x1-x0)/2),v=pos.getZ(i)/((z1-z0)/2);pos.setY(i,(u*u-v*v)*2.2)}g.computeVertexNormals();
    const roof=new THREE.Mesh(g,new THREE.MeshPhongMaterial({color:'#e9f1f6',transparent:true,opacity:0.55,side:THREE.DoubleSide,shininess:90,depthWrite:false}));roof.position.set((x0+x1)/2,22,(z0+z1)/2);roof.renderOrder=6;scene.add(roof);
    for(const[x,z]of[[x0,z0],[x1,z0],[x0,z1],[x1,z1]])addMesh(new THREE.CylinderGeometry(0.4,0.5,24,8),lam('#d0d4d8'),x,12,z);
    const sg=labelSprite('MUNICH AIRPORT CENTER','rgba(20,32,52,.85)','#fff',1.1);sg.position.set((x0+x1)/2,25,(z0+z1)/2);scene.add(sg)}
  // tower
  {const t=A.tower;addMesh(new THREE.CylinderGeometry(1.8,2.6,52,14),lam('#e6e8ea'),t.x,26,t.y);addMesh(new THREE.CylinderGeometry(5.2,3.2,3,10),lam('#d0d4d8'),t.x,53.5,t.y);
    addMesh(new THREE.CylinderGeometry(5.6,5.0,3.4,10),new THREE.MeshPhongMaterial({color:'#2a3d52',shininess:120,envMap:envCube,reflectivity:0.6,combine:THREE.MixOperation}),t.x,56.7,t.y);
    addMesh(new THREE.CylinderGeometry(6,6,0.7,10),lam('#e6e8ea'),t.x,58.8,t.y);addMesh(new THREE.CylinderGeometry(0.15,0.15,8,4),lam('#c43'),t.x,63,t.y)}
  // hangars with barrel roofs
  A.hangars.forEach(([x0,z0,x1,z1],hi)=>{const w=x1-x0,d=z1-z0;
    if(hi===1){openShed(x0,z0,x1,z1,14,'#c9ced3','#aab2ba',0.28,true);const sg=labelSprite('DEIN HANGAR','rgba(31,79,138,.9)','#ffc61a',1.0);sg.position.set((x0+x1)/2,22,z1);scene.add(sg);return}
    addMesh(new THREE.BoxGeometry(w,14,d),lam('#c9ced3'),(x0+x1)/2,7,(z0+z1)/2);
    const rf=new THREE.CylinderGeometry(d/2,d/2,w,20,1,false,0,Math.PI);rf.rotateZ(Math.PI/2);rf.rotateX(-Math.PI/2);const m=addMesh(rf,lam('#aab2ba'),(x0+x1)/2,14,(z0+z1)/2);m.scale.y=0.28;
    addMesh(new THREE.BoxGeometry(w-6,11,0.3),lam('#5d6670'),(x0+x1)/2,5.5,z1+0.2)});
  // jet bridges
  const jb=lam('#cdd2d6');
  for(const st of A.stands){const c=Math.cos(st.a);if(st.type==='wide'||st.x>1540||st.y<60)continue;const face=c<0?(st.x<1420?1352:1486):1468;const nose=st.x+c*st.len*0.42;const doorX=nose-c*4;const len=Math.abs(doorX-face);
    const z=st.y-(st.type==='regio'?2.8:3.4);addMesh(new THREE.BoxGeometry(len,2.6,2.6),jb,(face+doorX)/2,4.6,z);addMesh(new THREE.BoxGeometry(0.5,3.3,0.5),lam('#777'),doorX-c*1.6,1.65,z)}
  airportFence(A);
  // parked aircraft
  for(const st of A.stands){const o=planeObject(st.type,st.liv);o.position.set(st.x,0,st.y);o.rotation.y=-st.a;scene.add(o)}
  // runway edge lights (night)
  const pts=[];for(const r of A.runways){for(let x=r.x0;x<=r.x1;x+=16)for(const o of[-r.w/2-0.6,r.w/2+0.6])pts.push([x,0.25,r.y+o,0]);for(let k=-6;k<=6;k++){pts.push([r.x0-0.8,0.25,r.y+k*1.1,1]);pts.push([r.x1+0.8,0.25,r.y+k*1.1,2])}}
  for(const t of A.taxis)for(let i=0;i+1<t.length;i++){const[a,b]=[t[i],t[i+1]];const L=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let d=0;d<L;d+=12)pts.push([a[0]+(b[0]-a[0])*d/L,0.2,a[1]+(b[1]-a[1])*d/L,3])}
  const cols=['#fff6d8','#3dff6a','#ff3b3b','#3a7bff'];const lg=new THREE.SphereGeometry(0.22,5,4);
  for(let k=0;k<4;k++){const list=pts.filter(p=>p[3]===k);const im=new THREE.InstancedMesh(lg,new THREE.MeshBasicMaterial({color:cols[k]}),list.length);list.forEach((p,i)=>im.setMatrixAt(i,M4().makeTranslation(p[0],p[1],p[2])));im.frustumCulled=false;scene.add(im);runwayLights.push(im)}
  // apron vehicles: tugs and baggage carts next to the parked planes
  const tug=lam('#f2c400'),cart=lam('#8a9096');for(const st of A.stands){const c=Math.cos(st.a);const bx=st.x-c*st.len*0.2,bz=st.y+7;addMesh(new THREE.BoxGeometry(2.6,1.3,1.6),tug,bx,0.65,bz);for(let k=1;k<=2;k++)addMesh(new THREE.BoxGeometry(2.2,1.1,1.4),cart,bx-c*3.2*k,0.75,bz)}
}
const runwayLights=[];let gateBoom=null,gateAng=0,gateBoom2=null,gateAng2=0;const sheds=[];
// a hall that is open to the south (+z): two side walls, back wall, barrel roof; interior lights; the roof hides while you are inside
function openShed(x0,z0,x1,z1,h,wallC,roofC,flat,lights){const w=x1-x0,d=z1-z0,cx=(x0+x1)/2,cz=(z0+z1)/2,wm=lam(wallC);
  addMesh(new THREE.BoxGeometry(2,h,d),wm,x0+1,h/2,cz);addMesh(new THREE.BoxGeometry(2,h,d),wm,x1-1,h/2,cz);addMesh(new THREE.BoxGeometry(w,h,2),wm,cx,h/2,z0+1);
  addMesh(new THREE.BoxGeometry(w,1.4,0.6),wm,cx,h-0.7,z1-0.3);
  const roof=new THREE.Group();const rf=new THREE.CylinderGeometry(d/2,d/2,w,20,1,false,0,Math.PI);rf.rotateZ(Math.PI/2);rf.rotateX(-Math.PI/2);const m=new THREE.Mesh(rf,lam(roofC,{side:THREE.DoubleSide}));m.scale.y=flat;m.castShadow=true;roof.add(m);
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(w,d),lam('#6d737a'));ceil.rotation.x=Math.PI/2;roof.add(ceil);roof.position.set(cx,h,cz);scene.add(roof);
  if(lights)for(let x=x0+6;x<x1-4;x+=10){const l=new THREE.Mesh(new THREE.BoxGeometry(3,0.15,0.5),new THREE.MeshBasicMaterial({color:'#fff6dc'}));l.position.set(x,h-0.4,cz);roof.add(l);l.position.sub(roof.position)}
  sheds.push({x0:x0+2,z0:z0+2,x1:x1-2,z1,roof})}
function fenceRun(poly,gaps,H,label){
  const tex=canvasTex(64,64,(g)=>{g.clearRect(0,0,64,64);g.strokeStyle='rgba(170,178,186,0.95)';g.lineWidth=2.2;for(let k=-64;k<128;k+=12){g.beginPath();g.moveTo(k,0);g.lineTo(k+64,64);g.stroke();g.beginPath();g.moveTo(k+64,0);g.lineTo(k,64);g.stroke()}g.fillStyle='rgba(120,126,132,1)';g.fillRect(0,0,64,3)},true);
  const pos=[],uv=[],posts=[];const inGap=(x,y)=>gaps.some(q=>x>=q[0]&&x<=q[2]&&y>=q[1]&&y<=q[3]);
  for(let k=0;k+1<poly.length;k++){const a=poly[k],b=poly[k+1];const L=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(let d0=0;d0<L-0.01;d0+=3.5){const d1=Math.min(L,d0+3.5),x0=a[0]+(b[0]-a[0])*d0/L,y0=a[1]+(b[1]-a[1])*d0/L,x1=a[0]+(b[0]-a[0])*d1/L,y1=a[1]+(b[1]-a[1])*d1/L;if(inGap((x0+x1)/2,(y0+y1)/2))continue;const l=d1-d0;
      pos.push(x0,0,y0, x1,0,y1, x1,H,y1, x0,0,y0, x1,H,y1, x0,H,y0);uv.push(0,0, l/2.2,0, l/2.2,1, 0,0, l/2.2,1, 0,1);posts.push([x0,y0])}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();tex.wrapS=THREE.RepeatWrapping;tex.wrapT=THREE.ClampToEdgeWrapping;
  const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({map:tex,transparent:true,alphaTest:0.35,side:THREE.DoubleSide}));m.receiveShadow=true;scene.add(m);
  const pg=new THREE.CylinderGeometry(0.06,0.07,H+0.25,6);pg.translate(0,(H+0.25)/2,0);const im=new THREE.InstancedMesh(pg,lam('#7c838b'),posts.length);posts.forEach((q,i)=>im.setMatrixAt(i,M4().makeTranslation(q[0],0,q[1])));scene.add(im);
  // barbed wire on top
  const wire=[];for(let k=0;k+1<poly.length;k++){const a=poly[k],b=poly[k+1];wire.push(new THREE.Vector3(a[0],H+0.25,a[1]),new THREE.Vector3(b[0],H+0.25,b[1]))}const wg=new THREE.BufferGeometry().setFromPoints(wire);scene.add(new THREE.LineSegments(wg,new THREE.LineBasicMaterial({color:'#5a5f66'})))}
function baseBuild(B){
  const wall='#a9a58f',bar='#8f8b74';
  for(const b of B.barracks){texturedBox(b[0],b[1],b[2],b[3],9.5,wall,0,1);addMesh(new THREE.BoxGeometry(b[2]-b[0]+1,0.5,b[3]-b[1]+1),lam('#5d6351'),(b[0]+b[2])/2,9.7,(b[1]+b[3])/2)}
  {const b=B.hq;texturedBox(b[0],b[1],b[2],b[3],12.5,'#b4b09a',0,2);addMesh(new THREE.CylinderGeometry(0.1,0.1,8,6),lam('#ccc'),b[2]-4,16,b[1]+4);const fl=new THREE.Mesh(new THREE.PlaneGeometry(2.4,1.4),new THREE.MeshBasicMaterial({map:canvasTex(48,28,(g)=>{g.fillStyle='#111';g.fillRect(0,0,48,10);g.fillStyle='#d42a22';g.fillRect(0,9,48,10);g.fillStyle='#f2c400';g.fillRect(0,18,48,10)}),side:THREE.DoubleSide}));fl.position.set(b[2]-2.8,19.2,b[1]+4);scene.add(fl)}
  {const b=B.guard;addMesh(new THREE.BoxGeometry(b[2]-b[0],3.4,b[3]-b[1]),lam('#d8d4c2'),(b[0]+b[2])/2,1.7,(b[1]+b[3])/2);addMesh(new THREE.BoxGeometry(b[2]-b[0]+1.4,0.35,b[3]-b[1]+1.4),lam('#4f5546'),(b[0]+b[2])/2,3.6,(b[1]+b[3])/2)}
  for(const[x0,z0,x1,z1]of B.shelters)openShed(x0,z0,x1,z1,6.5,'#9c9a8c','#8a8878',0.16,true);
  // watchtowers at the corners
  for(const[x,z]of[[B.x0+4,B.y0+4],[B.x1-4,B.y0+4],[B.x0+4,B.y1-4],[B.x1-4,B.y1-4]]){for(const[dx,dz]of[[-1,-1],[1,-1],[-1,1],[1,1]])addMesh(new THREE.CylinderGeometry(0.12,0.14,9,6),lam('#6a6d5c'),x+dx*1.2,4.5,z+dz*1.2);addMesh(new THREE.BoxGeometry(3.4,2,3.4),lam('#7c7f6c'),x,10,z);addMesh(new THREE.ConeGeometry(2.8,1.4,4),lam('#4f5546'),x,11.7,z,{ry:Math.PI/4})}
  fenceRun(B.fence,[[B.gate.x0-0.5,B.gate.y-1,B.gate.x1+1.5,B.gate.y+1],[B.hole.x-1,B.hole.y0-0.5,B.hole.x+1,B.hole.y1+1.5]],3.2);
  // gate: red-white barrier across the north entrance
  const boomTex=canvasTex(64,8,(g)=>{for(let k=0;k<8;k++){g.fillStyle=k%2?'#ffffff':'#d42a22';g.fillRect(k*8,0,8,8)}});
  gateBoom2=new THREE.Group();const bm=new THREE.Mesh(new THREE.BoxGeometry(B.gate.x1-B.gate.x0+2,0.18,0.18),new THREE.MeshLambertMaterial({map:boomTex}));bm.position.x=(B.gate.x1-B.gate.x0+2)/2;gateBoom2.add(bm);gateBoom2.position.set(B.gate.x0-0.5,1.05,B.gate.y-0.3);scene.add(gateBoom2);
  addMesh(new THREE.BoxGeometry(0.6,1.2,0.6),lam('#e8e2d0'),B.gate.x0-0.8,0.6,B.gate.y-0.3);
  const sg=labelSprite('FLIEGERHORST ISARTAL · MILITÄRISCHER SICHERHEITSBEREICH','rgba(40,48,32,.92)','#f2e9c8',0.85);sg.position.set(B.gate.x,6,B.gate.y-3);scene.add(sg);
  const lb=labelSprite('Fliegerhorst','rgba(20,22,26,.72)','#fff',2);lb.position.set(1740,30,1320);scene.add(lb)}
function airportFence(A){
  // chain-link panels (one geometry with UVs) on steel posts, with a lifting barrier at the gate
  const tex=canvasTex(64,64,(g)=>{g.clearRect(0,0,64,64);g.strokeStyle='rgba(170,178,186,0.95)';g.lineWidth=2.2;for(let k=-64;k<128;k+=12){g.beginPath();g.moveTo(k,0);g.lineTo(k+64,64);g.stroke();g.beginPath();g.moveTo(k+64,0);g.lineTo(k,64);g.stroke()}g.fillStyle='rgba(120,126,132,1)';g.fillRect(0,0,64,3)},true);
  const H=2.8,pos=[],uv=[],posts=[];
  for(let k=0;k+1<A.fence.length;k++){const a=A.fence[k],b=A.fence[k+1];const L=Math.hypot(b[0]-a[0],b[1]-a[1]);const ux=(b[0]-a[0])/L,uy=(b[1]-a[1])/L;
    // split around the gate
    const parts=[];const gx=A.gate.x;if(Math.abs(a[0]-gx)<0.5&&Math.abs(b[0]-gx)<0.5){const lo=Math.min(a[1],b[1]),hi=Math.max(a[1],b[1]);const s0=a[1]<b[1];
      const g0=A.gate.y0-0.5,g1=A.gate.y1+1.5;const seg=(y0,y1)=>parts.push([gx,y0,gx,y1]);if(s0){seg(a[1],g0);seg(g1,b[1])}else{seg(a[1],g1);seg(g0,b[1])}}else parts.push([a[0],a[1],b[0],b[1]]);
    for(const[x0,y0,x1,y1]of parts){const l=Math.hypot(x1-x0,y1-y0);if(l<0.5)continue;
      pos.push(x0,0,y0, x1,0,y1, x1,H,y1, x0,0,y0, x1,H,y1, x0,H,y0);uv.push(0,0, l/2.2,0, l/2.2,1, 0,0, l/2.2,1, 0,1);
      for(let d=0;d<=l;d+=3.5)posts.push([x0+(x1-x0)*d/l,y0+(y1-y0)*d/l])}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
  tex.wrapS=THREE.RepeatWrapping;tex.wrapT=THREE.ClampToEdgeWrapping;
  const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({map:tex,transparent:true,alphaTest:0.35,side:THREE.DoubleSide,depthWrite:true}));m.receiveShadow=true;scene.add(m);
  const pg=new THREE.CylinderGeometry(0.06,0.07,H+0.25,6);pg.translate(0,(H+0.25)/2,0);const im=new THREE.InstancedMesh(pg,lam('#7c838b'),posts.length);posts.forEach((q,i)=>im.setMatrixAt(i,M4().makeTranslation(q[0],0,q[1])));im.castShadow=true;scene.add(im);
  // gate: guard hut, posts and the red-white barrier
  const gx=A.gate.x,gy0=A.gate.y0-0.5,gy1=A.gate.y1+1.5;
  addMesh(new THREE.BoxGeometry(3,2.8,3),lam('#d8dcdf'),gx-3.5,1.4,gy0-3);addMesh(new THREE.BoxGeometry(3.4,0.3,3.4),lam('#5d6670'),gx-3.5,2.95,gy0-3);
  addMesh(new THREE.BoxGeometry(0.6,1.2,0.6),lam('#e8e2d0'),gx,0.6,gy0-0.3);
  const boomTex=canvasTex(64,8,(g)=>{for(let k=0;k<8;k++){g.fillStyle=k%2?'#ffffff':'#d42a22';g.fillRect(k*8,0,8,8)}});
  gateBoom=new THREE.Group();const bm=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.16,gy1-gy0),new THREE.MeshLambertMaterial({map:boomTex}));bm.position.z=(gy1-gy0)/2;gateBoom.add(bm);gateBoom.position.set(gx,1.05,gy0-0.3);scene.add(gateBoom);
  const sg=labelSprite('FLUGHAFEN · NUR BERECHTIGTE','rgba(20,32,52,.9)','#fff',0.8);sg.position.set(gx-3.5,4.2,gy0-3);scene.add(sg);
}
function activitySigns(){
  // race starts: a chequered ring on the road with two flags and a sign
  if(W.raceDefs){const tex=canvasTex(256,256,(g)=>{g.clearRect(0,0,256,256);const N=24;for(let k=0;k<N;k++){for(let j=0;j<2;j++){g.beginPath();const a0=k/N*Math.PI*2,a1=(k+1)/N*Math.PI*2,r0=j?112:96,r1=j?126:112;g.arc(128,128,r1,a0,a1);g.arc(128,128,r0,a1,a0,true);g.closePath();g.fillStyle=(k+j)%2?'#111':'#f4f4f4';g.fill()}}});
    const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3});
    for(const r of W.raceDefs){const m=new THREE.Mesh(new THREE.PlaneGeometry(16,16),mat);m.rotation.x=-Math.PI/2;m.position.set(r.x,0.07,r.y);m.renderOrder=2;scene.add(m);
      for(const sd of[-1,1]){addMesh(new THREE.CylinderGeometry(0.06,0.06,4,6),lam('#ddd'),r.x+sd*7.6,2,r.y);const fl=new THREE.Mesh(new THREE.PlaneGeometry(1.2,0.8),new THREE.MeshBasicMaterial({map:canvasTex(32,24,(g)=>{for(let i=0;i<4;i++)for(let j=0;j<3;j++){g.fillStyle=(i+j)%2?'#111':'#fff';g.fillRect(i*8,j*8,8,8)}}),side:THREE.DoubleSide}));fl.position.set(r.x+sd*7.6+0.6,3.6,r.y);scene.add(fl)}
      const sg=labelSprite('RENNEN · '+r.name.toUpperCase(),'rgba(14,16,19,.85)','#ffc61a',0.9);sg.position.set(r.x,5,r.y);scene.add(sg)}}
  if(W.bank){const b=W.bank;const sg=labelSprite('ISARBANK','rgba(20,40,70,.92)','#e8c96a',1.5);sg.position.set(b.x,b.b.h+3,b.y);scene.add(sg);
    for(const sd of[-1,1]){const fx=b.b.front,tx=-fx.ny,ty=fx.nx;addMesh(new THREE.CylinderGeometry(0.35,0.4,7,10),lam('#e6dfcd'),b.x-fx.nx*1.2+tx*sd*2.4,3.5,b.y-fx.ny*1.2+ty*sd*2.4)}}
  if(W.casino){const c=W.casino;const tex=canvasTex(512,128,(g)=>{g.fillStyle='#14081c';g.fillRect(0,0,512,128);g.strokeStyle='#ff4fd8';g.lineWidth=6;g.strokeRect(6,6,500,116);g.font='64px Bungee, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillStyle='#ffe36a';g.shadowColor='#ff4fd8';g.shadowBlur=18;g.fillText('SPIELBANK',256,66)});
    const m=new THREE.Mesh(new THREE.PlaneGeometry(14,3.5),new THREE.MeshBasicMaterial({map:tex}));const f=c.b.front;m.position.set(c.x-f.nx*1.0,9,c.y-f.ny*1.0);m.rotation.y=Math.atan2(-f.nx,-f.ny)+Math.PI;scene.add(m);
    const carpet=new THREE.Mesh(new THREE.PlaneGeometry(2.2,5),lam('#8e1b2c'));carpet.rotation.x=-Math.PI/2;carpet.rotation.z=-Math.atan2(f.ny,f.nx)+Math.PI/2;carpet.position.set(c.x,0.06,c.y);scene.add(carpet)}
}
// Forschungszentrum Garching: ESO's round building, the "Atom-Ei" and the FRM II chimney, signs on the institutes
function campusBuild(C){
  {const e=C.eso;addMesh(new THREE.CylinderGeometry(e.r,e.r,10.5,40),lam('#e4e2dc'),e.x,5.25,e.y);addMesh(new THREE.CylinderGeometry(e.r+0.4,e.r+0.4,1,40),lam('#9aa3ab'),e.x,10.8,e.y);
    addMesh(new THREE.CylinderGeometry(e.r*0.55,e.r*0.55,10.7,28),lam('#4a6b4c'),e.x,5.4,e.y);for(let k=0;k<3;k++)addMesh(new THREE.CylinderGeometry(e.r+0.05,e.r+0.05,0.9,40,1,true),lam('#3a4f68',{side:THREE.DoubleSide}),e.x,2.5+k*3,e.y);
    const sg=labelSprite('ESO · Europäische Südsternwarte','rgba(20,32,52,.88)','#fff',1.0);sg.position.set(e.x,15,e.y);scene.add(sg)}
  {const e=C.ei;const g=new THREE.SphereGeometry(e.r,28,18);const m=addMesh(g,new THREE.MeshPhongMaterial({color:'#ecebe6',shininess:40}),e.x,6,e.y);m.scale.set(1,1.3,1);addMesh(new THREE.CylinderGeometry(e.r+0.6,e.r+0.6,1.2,28),lam('#b9b6ae'),e.x,0.6,e.y);
    const sg=labelSprite('Atom-Ei','rgba(20,22,26,.8)','#fff',1.0);sg.position.set(e.x,20,e.y);scene.add(sg)}
  addMesh(new THREE.CylinderGeometry(1.4,1.9,46,16),lam('#d2d5d8'),1703,23,971);addMesh(new THREE.CylinderGeometry(1.45,1.45,1.2,16),lam('#c0392b'),1703,44,971);
  for(const b of C.buildings){const sg=labelSprite(b.name,'rgba(0,101,189,.9)','#fff',0.8);sg.position.set(b.x,b.h+3.5,b.y);scene.add(sg)}
  const sg=labelSprite('FORSCHUNGSZENTRUM GARCHING','rgba(0,101,189,.92)','#fff',1.2);sg.position.set(1740,7,906);scene.add(sg)}
// railway: station building (front + concourse), open glass hall over the platforms, tracks with sleepers, catenary, tunnel portal
function railwayBuild(Rr,box){
  const[x0,z0,x1,z1]=box,hx0=Rr.hall[0],hx1=Rr.hall[2],hz0=Rr.hall[1],hz1=Rr.hall[3],stone='#b9b2a5';
  texturedBox(x0,z0,x1,hz0-2,18,stone);texturedBox(hx1,hz0-2,x1,z1,18,stone);
  // hall: columns and a translucent barrel roof, open to the west
  for(let x=hx0+4;x<hx1;x+=13)for(const z of[hz0+0.6,hz1-0.6,648])addMesh(new THREE.CylinderGeometry(0.35,0.45,10,8),lam('#59626b'),x,5,z);
  {const g=new THREE.CylinderGeometry(1,1,1,24,1,true,0,Math.PI);const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({color:'#9fc2d6',transparent:true,opacity:0.5,side:THREE.DoubleSide,depthWrite:false}));m.rotation.set(0,0,Math.PI/2);m.scale.set((hz1-hz0)/2,hx1-hx0,6);m.position.set((hx0+hx1)/2,10,(hz0+hz1)/2);m.renderOrder=6;scene.add(m);
    for(let x=hx0;x<=hx1;x+=13){const rib=new THREE.Mesh(new THREE.TorusGeometry(1,0.012,4,24,Math.PI),lam('#4d555d'));rib.rotation.set(0,Math.PI/2,0);rib.scale.set((hz1-hz0)/2,6,1);rib.position.set(x,10,(hz0+hz1)/2);scene.add(rib)}}
  const sg=labelSprite('MÜNCHEN HBF','rgba(20,40,90,.9)','#fff',1.6);sg.position.set(hx0+2,14,648);scene.add(sg);
  // platforms with a white edge line
  for(const[a,b,c,d]of Rr.platforms){addMesh(new THREE.BoxGeometry(c-a,0.4,d-b),lam('#b7b3aa'),(a+c)/2,0.2,(b+d)/2);for(const z of[b+0.25,d-0.25])addMesh(new THREE.BoxGeometry(c-a,0.02,0.18),lam('#f2efe6'),(a+c)/2,0.41,z,{noShadow:true});
    for(let x=a+12;x<c-8;x+=24){addMesh(new THREE.BoxGeometry(0.15,2.6,0.15),lam('#3d4248'),x,1.7,(b+d)/2);const sb=labelSprite('Gleis '+(Rr.platforms.indexOf(Rr.platforms.find(p=>p[1]===b))*2+1)+' · '+(Rr.platforms.indexOf(Rr.platforms.find(p=>p[1]===b))*2+2),'rgba(20,40,90,.9)','#fff',0.45);sb.position.set(x,3.3,(b+d)/2);scene.add(sb)}}
  // tracks: ballast, sleepers (instanced), two rails each
  const C=Rr.cut,ang=Math.atan2(C.depth,C.x1-C.x0-3),sx=C.x1;
  const sl=[];for(const y of Rr.tracks){addMesh(new THREE.BoxGeometry(Rr.buffer-sx+2,0.12,4.2),lam('#8a8378'),(sx+Rr.buffer)/2,0.06,y,{noShadow:true});for(let x=C.x0;x<Rr.buffer;x+=0.9)sl.push([x,y]);
    for(const o of[-0.72,0.72])addMesh(new THREE.BoxGeometry(Rr.buffer-sx+1,0.14,0.08),lam('#6d6f72'),(sx+Rr.buffer)/2,0.24,y+o,{noShadow:true});
    {const len=(C.x1-C.x0)/Math.cos(ang);for(const o of[-0.72,0.72]){const m=addMesh(new THREE.BoxGeometry(len,0.14,0.08),lam('#6d6f72'),(C.x0+C.x1)/2,railDepth((C.x0+C.x1)/2)+0.24,y+o,{noShadow:true});m.rotation.z=ang}}
    addMesh(new THREE.BoxGeometry(0.8,1.0,3.2),lam('#c43b2e'),Rr.buffer+0.4,0.5,y)}   // buffer stop
  {const g=new THREE.BoxGeometry(0.22,0.1,2.6);const im=new THREE.InstancedMesh(g,lam('#5a4a3c'),sl.length);sl.forEach((q,i)=>im.setMatrixAt(i,M4().makeTranslation(q[0],0.16+railDepth(q[0]),q[1])));scene.add(im)}
  // catenary masts and wires between the tunnel and the hall
  for(let x=C.x1+6;x<hx0;x+=22){for(const z of[Rr.y0+1.5,Rr.y1-1.5])addMesh(new THREE.CylinderGeometry(0.15,0.18,8,6),lam('#7c838b'),x,4,z);addMesh(new THREE.BoxGeometry(0.2,0.25,Rr.y1-Rr.y0-3),lam('#7c838b'),x,7.6,(Rr.y0+Rr.y1)/2)}
  {const pts=[];for(const y of Rr.tracks)pts.push(new THREE.Vector3(C.x0,6.2-C.depth,y),new THREE.Vector3(C.x1,6.2,y),new THREE.Vector3(C.x1,6.2,y),new THREE.Vector3(Rr.buffer,6.2,y));scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#3a3d40'})))}
  cuttingBuild(Rr);buildTrains()}
let trainObjs=[];const trainClip=[new THREE.Plane(new THREE.Vector3(1,0,0),-121.3)];
function trainCarGeo(type,end){const P=[];const ice=type==='ice',L=ice?19.4:16.6,Wd=3.0,H=ice?3.9:4.6,body=ice?'#f2f2ef':'#c8102e',add=(g,c,m)=>P.push({g,color:c,m});
  if(end){add(taperBox(L,H-0.6,Wd,ice?5.5:1.6,0,0.25),body,tm(0,0.6,0))}else add(new THREE.BoxGeometry(L,H-0.6,Wd),body,tm(0,0.6+(H-0.6)/2,0));
  add(new THREE.BoxGeometry(end?L*0.7:L-0.6,0.25,Wd-0.5),'#8d9196',tm(end?-L*0.15:0,H+0.02,0));
  for(const sd of[1,-1]){const z=sd*(Wd/2+0.005);
    if(ice){add(new THREE.BoxGeometry(end?L*0.62:L-2,0.75,0.02),'#1c2430',tm(end?-L*0.16:0,2.35,z));add(new THREE.BoxGeometry(end?L*0.75:L-0.4,0.18,0.02),'#d42a22',tm(end?-L*0.1:0,1.55,z))}
    else{for(const y of[1.55,3.15])add(new THREE.BoxGeometry(end?L*0.8:L-2,0.8,0.02),'#1c2430',tm(end?-L*0.06:0,y,z));for(const x of[-L*0.3,L*0.3])add(new THREE.BoxGeometry(1.3,2.0,0.03),'#e9e7e1',tm(x,1.5,z))}}
  if(end&&ice)add(new THREE.BoxGeometry(1.2,0.7,Wd-0.6),'#1c2430',tm(L/2-3.2,H-1.1,0,0,1,1,1,-0.5));if(end&&!ice)add(new THREE.BoxGeometry(0.05,1.0,Wd-0.6),'#1c2430',tm(L/2+0.01,3.0,0));
  for(const x of[-L*0.36,L*0.36])add(new THREE.BoxGeometry(3,0.6,Wd-0.4),'#2a2c30',tm(x,0.45,0));
  return mergeGeos(P)}
function buildTrains(){const mat=new THREE.MeshLambertMaterial({vertexColors:true,clippingPlanes:trainClip,clipShadows:true});const G={};for(const t of['ice','rb'])G[t]={mid:trainCarGeo(t,false),end:trainCarGeo(t,true)};
  trainObjs=(S.trains||[]).map(tr=>{const g=new THREE.Group();const cars=[];for(let k=0;k<tr.cars;k++){const end=k===0||k===tr.cars-1;const m=new THREE.Mesh(end?G[tr.type].end:G[tr.type].mid,mat);m.castShadow=true;if(k===tr.cars-1&&tr.cars>1)m.rotation.y=Math.PI;g.add(m);cars.push(m)}g.visible=false;scene.add(g);return{g,cars}})}
function syncTrains(){const T=S.trains||[];trainObjs.forEach((o,i)=>{const tr=T[i];o.g.visible=!!(tr&&tr.vis&&tr.xe>W.rail.portal);if(!o.g.visible)return;o.cars.forEach((m,k)=>{const x=tr.xe-(k+0.5)*tr.carLen,h=tr.carLen/2;const y0=railDepth(x-h),y1=railDepth(x+h);m.position.set(x,0.25+(y0+y1)/2,tr.y);m.rotation.z=(m.rotation.y?-1:1)*Math.atan2(y1-y0,tr.carLen)})})}
// Autobahn: guard rails on both sides, a concrete barrier in the middle, blue signs at the exits
function motorwayBuild(){
  const rail=[],posts=[],wall=[];
  const quad=(arr,a,b,y0,y1)=>arr.push(a[0],y0,a[1], b[0],y0,b[1], b[0],y1,b[1], a[0],y0,a[1], b[0],y1,b[1], a[0],y1,a[1]);
  // the barriers come from the world (they are solid there, so what you see is what you hit)
  for(const B of W.mwBarriers||[]){for(let i=1;i<B.pts.length;i++){const p0=B.pts[i-1],p1=B.pts[i];if(B.kind==='rail'){quad(rail,p0,p1,0.5,0.85);quad(rail,p0,p1,0.18,0.42)}else quad(wall,p0,p1,0,0.9)}
    if(B.kind==='rail')for(let i=0;i<B.pts.length;i+=2)posts.push(B.pts[i])}
  const mk=(arr,mat)=>{if(!arr.length)return;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));g.computeVertexNormals();const m=new THREE.Mesh(g,mat);m.receiveShadow=true;scene.add(m)};
  mk(rail,new THREE.MeshLambertMaterial({color:'#b8bec4',side:THREE.DoubleSide}));mk(wall,new THREE.MeshLambertMaterial({color:'#c9c7bf',side:THREE.DoubleSide}));
  const pg=new THREE.BoxGeometry(0.12,0.9,0.12);pg.translate(0,0.45,0);const im=new THREE.InstancedMesh(pg,lam('#8a9096'),posts.length);posts.forEach((q,i)=>im.setMatrixAt(i,M4().makeTranslation(q[0],0,q[1])));scene.add(im);
  // blue gantry signs over the slip roads and at the junctions
  const sign=(x,y,t)=>{const sg=labelSprite(t,'rgba(31,79,154,.97)','#ffffff',0.85);sg.position.set(x,6.6,y);scene.add(sg);for(const d of[-3,3])addMesh(new THREE.CylinderGeometry(0.11,0.11,6,6),lam('#9aa0a6'),x+d,3,y)};
  for(const e of W.edges){if(!e.name)continue;const m=/^Ausfahrt (.+) \((1|2)\)$/.exec(e.name);if(!m)continue;const na=W.nodes[e.a],nb=W.nodes[e.b];const n=na.edges.some(i=>W.edges[i].mw)?na:nb,o=n===na?nb:na;
    const x=n.x+(o.x-n.x)*0.35,y=n.y+(o.y-n.y)*0.35;sign(x,y,(m[2]==='1'?'↘ ':'↗ ')+'Ausfahrt '+m[1])}
  for(const B of W.bridges||[])bridgeBuild(B);
  sign(1300,1046,'A92 · Garching · Fliegerhorst');sign(1300,1078,'A92 · Garching · Fliegerhorst');sign(1272,585,'A99 · München-Süd');sign(1700,1060,'Ende der Autobahn');
}
function bridgeBuild(B){
  // follows the road's own centre line: cross-sections every 1.5 m, deck over the Autobahn, embankments with grass slopes on the ramps
  const top=B.ow+B.owalk,L=B.uw+3+B.ramp,deck=B.uw+3,pos=[],col=[],cA=new THREE.Color(C.road),cW=new THREE.Color(C.walk),cG=new THREE.Color('#6f9a4e'),cC=new THREE.Color('#bab5aa'),cM=new THREE.Color('#e9e6dc');
  const tri=(a,b,c,k)=>{pos.push(...a,...b,...c);for(let i=0;i<3;i++)col.push(k.r,k.g,k.b)};const quad=(a,b,c,d,k)=>{tri(a,b,c,k);tri(a,c,d,k)};
  const S=s=>{const p=W.pointAt(B.line,B.cum,s);const h=W.bridgeProfile(B,s)+0.03;return{x:p.x,y:p.y,nx:-p.ty,ny:p.tx,h}};
  const P=(q,off,h)=>[q.x+q.nx*off,h,q.y+q.ny*off];
  for(let s=B.sc-L;s<B.sc+L-0.01;s+=1.5){const A=S(s),C=S(Math.min(B.sc+L,s+1.5)),onDeck=Math.abs(s+0.75-B.sc)<deck;
    quad(P(A,-B.ow,A.h),P(A,B.ow,A.h),P(C,B.ow,C.h),P(C,-B.ow,C.h),cA);
    for(const o of[-0.12,0.12])quad(P(A,o-0.07,A.h+0.01),P(A,o+0.07,A.h+0.01),P(C,o+0.07,C.h+0.01),P(C,o-0.07,C.h+0.01),cM);   // centre line
    for(const sd of[-1,1]){quad(P(A,sd*B.ow,A.h+0.12),P(A,sd*top,A.h+0.12),P(C,sd*top,C.h+0.12),P(C,sd*B.ow,C.h+0.12),cW);
      if(onDeck)quad(P(A,sd*top,A.h-1.2),P(C,sd*top,C.h-1.2),P(C,sd*top,C.h+1.05),P(A,sd*top,A.h+1.05),cC);   // deck edge with parapet
      else{quad(P(A,sd*top,A.h),P(C,sd*top,C.h),P(C,sd*(top+C.h*1.6),0),P(A,sd*(top+A.h*1.6),0),cG);if(A.h>0.3)quad(P(A,sd*top,A.h+0.9),P(C,sd*top,C.h+0.9),P(C,sd*top,C.h),P(A,sd*top,A.h),cC)}}
    if(onDeck)quad(P(A,-top,A.h-1.2),P(A,top,A.h-1.2),P(C,top,C.h-1.2),P(C,-top,C.h-1.2),cC)}
  for(const sd of[-1,1]){const q=S(B.sc+sd*deck);quad(P(q,-top-q.h*1.6,0),P(q,top+q.h*1.6,0),P(q,top,q.h),P(q,-top,q.h),cC)}   // abutments
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.computeVertexNormals();
  const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}));m.castShadow=true;m.receiveShadow=true;scene.add(m)}
// railway cutting west of the Hauptbahnhof: the ground is cut open there (see drawGround); a sloping trough with retaining walls leads into the tunnel
function railDepth(x){const C=W.rail&&W.rail.cut;if(!C||x>=C.x1)return 0;return -C.depth*Math.min(1,(C.x1-x)/(C.x1-C.x0-3))}
function cuttingBuild(Rr){const C=Rr.cut,L=C.x1-C.x0,ang=Math.atan2(C.depth,L-3);
  {const g=new THREE.PlaneGeometry(L,C.y1-C.y0,24,1);g.rotateX(-Math.PI/2);const pa=g.attributes.position;for(let i=0;i<pa.count;i++){const x=pa.getX(i)+(C.x0+C.x1)/2;pa.setY(i,railDepth(x)-0.15)}g.computeVertexNormals();const m=new THREE.Mesh(g,lam('#80796e'));m.position.set((C.x0+C.x1)/2,0,(C.y0+C.y1)/2);m.receiveShadow=true;scene.add(m)}
  // retaining walls along both sides (from the trough floor up to a parapet) and the tunnel face
  for(const z of[C.y0,C.y1]){const g=new THREE.PlaneGeometry(L,1,24,1);const pa=g.attributes.position;for(let i=0;i<pa.count;i++){const x=pa.getX(i)+(C.x0+C.x1)/2;pa.setY(i,pa.getY(i)>0?1.0:railDepth(x)-0.2)}g.computeVertexNormals();const m=new THREE.Mesh(g,lam('#a8a296',{side:THREE.DoubleSide}));m.position.set((C.x0+C.x1)/2,0,z);scene.add(m);
    addMesh(new THREE.BoxGeometry(L,0.3,0.5),lam('#bdb7ab'),(C.x0+C.x1)/2,1.05,z)}
  addMesh(new THREE.BoxGeometry(1.2,C.depth+1.6,C.y1-C.y0+1),lam('#a39d92'),C.x0-0.6,(1-C.depth)/2+0.2,(C.y0+C.y1)/2);
  for(const y of Rr.tracks)addMesh(new THREE.BoxGeometry(0.2,5.2,4.4),new THREE.MeshBasicMaterial({color:'#0b0c0e'}),C.x0+0.02,-C.depth+2.6,y);
  const lb=labelSprite('Bahntunnel','rgba(20,40,90,.85)','#fff',0.6);lb.position.set(C.x0,3,(C.y0+C.y1)/2);scene.add(lb)}
// the Monopteros hill: a smooth grassy mound with a gravel path and steps up the south side
function hillBuild(H){const g=new THREE.RingGeometry(0.01,H.r,64,16);const pa=g.attributes.position;for(let i=0;i<pa.count;i++){const x=pa.getX(i),y=pa.getY(i);pa.setZ(i,W.hillAt(H.x+x,H.y-y)+0.05)}g.rotateX(-Math.PI/2);g.computeVertexNormals();
  const m=new THREE.Mesh(g,lam('#5f9447'));m.position.set(H.x,0,H.y);m.receiveShadow=true;scene.add(m);
  const step=lam('#d8cfb8');for(let d=H.r-1;d>6.5;d-=0.9){const z=H.y+d,h=W.hillAt(H.x,z);addMesh(new THREE.BoxGeometry(3,0.25,0.9),step,H.x,h+0.05,z,{noShadow:true})}
  for(let a=0;a<6.28;a+=0.12){const r=7.2,x=H.x+Math.cos(a)*r,z=H.y+Math.sin(a)*r;addMesh(new THREE.BoxGeometry(1.0,0.06,1.0),step,x,W.hillAt(x,z)+0.04,z,{noShadow:true,ry:-a})}}
function buildLandmarks(){
  const before=new Set(matCache.values());activitySigns();
  for(const L of W.landmarks){
    switch(L.k){
      case'frauenkirche':{const[n0,n1,n2,n3]=L.nave;addMesh(new THREE.BoxGeometry(n2-n0,22,n3-n1),lam('#9c5c46'),(n0+n2)/2,11,(n1+n3)/2);gable(n0,n1,n2,n3,22,12,'#6f3a2c');
        for(const t of L.towers){const cx=(t[0]+t[2])/2,cz=(t[1]+t[3])/2;addMesh(new THREE.BoxGeometry(t[2]-t[0],48,t[3]-t[1]),lam('#a3654e'),cx,24,cz);onion(cx,48,cz,4.4,'#4f8a6e')}
        const lb=labelSprite('Frauenkirche','rgba(20,22,26,.72)','#fff',2.2);lb.position.set(L.x,66,L.y);scene.add(lb);break}
      case'rathaus':{const[x0,z0,x1,z1]=L.box;texturedBox(x0,z0,x1,z1,20,'#8e877a');gable(x0,z0,x1,z1,20,8,'#4f4b45');const[t0,t1,t2,t3]=L.tower;addMesh(new THREE.BoxGeometry(t2-t0,46,t3-t1),lam('#857e72'),(t0+t2)/2,23,(t1+t3)/2);addMesh(new THREE.ConeGeometry(5,16,4),lam('#3f5c4f'),(t0+t2)/2,54,(t1+t3)/2,{ry:Math.PI/4});
        for(let x=x0+4;x<x1;x+=7){addMesh(new THREE.ConeGeometry(0.8,4,4),lam('#7a7366'),x,22,z1)}break}
      case'siegestor':{const mat=lam('#d8d1c0');for(const[a,b]of[[504,509],[512.5,515],[525,527.5],[531,536]])addMesh(new THREE.BoxGeometry(b-a,15,8),mat,(a+b)/2,7.5,300);addMesh(new THREE.BoxGeometry(34,6,9),mat,520,18,300);addMesh(new THREE.BoxGeometry(36,1,10),lam('#c4bca9'),520,15.2,300);
        addMesh(new THREE.BoxGeometry(6,4,3),lam('#556a5a'),520,23,300);for(const dx of[-2.5,-0.8,0.8,2.5])addMesh(new THREE.BoxGeometry(0.8,2.4,1.2),lam('#556a5a'),520+dx,22.2,302);break}
      case'engel':{addMesh(new THREE.BoxGeometry(8,4,8),lam('#cfc8b6'),L.x,2,L.y);addMesh(new THREE.CylinderGeometry(1.5,1.8,28,12),lam('#e0d9c7'),L.x,18,L.y);addMesh(new THREE.CylinderGeometry(2.4,1.6,1.6,12),lam('#cfc8b6'),L.x,32.6,L.y);
        const gold=lam('#d6b13c',{emissive:'#3a2a00'});addMesh(new THREE.ConeGeometry(0.9,3.2,8),gold,L.x,35,L.y);addMesh(new THREE.SphereGeometry(0.45,8,6),gold,L.x,37,L.y);addMesh(new THREE.BoxGeometry(0.2,2.2,3.4),gold,L.x-0.3,35.8,L.y,{rz:0.2});break}
      case'maximilianeum':{const[x0,z0,x1,z1]=L.box;texturedBox(x0,z0,x1,z1,20,'#c9a98a');for(let z=z0+3;z<z1-2;z+=4.4)addMesh(new THREE.BoxGeometry(1.2,14,2.2),lam('#e0cdb3'),x0-0.4,7,z);addMesh(new THREE.CylinderGeometry(6,7,10,12),lam('#c9a98a'),(x0+x1)/2,25,(z0+z1)/2);addMesh(new THREE.SphereGeometry(6,12,8,0,Math.PI*2,0,Math.PI/2),lam('#5d7f6a'),(x0+x1)/2,30,(z0+z1)/2);break}
      case'museum':{const[x0,z0,x1,z1]=L.box;texturedBox(x0,z0,x1,z1,18,'#cfc6b6');const[t0,t1,t2,t3]=L.tower;addMesh(new THREE.BoxGeometry(t2-t0,48,t3-t1),lam('#c6bdac'),(t0+t2)/2,24,(t1+t3)/2);addMesh(new THREE.ConeGeometry(7.5,9,4),lam('#5a5f63'),(t0+t2)/2,52.5,(t1+t3)/2,{ry:Math.PI/4});break}
      case'olympiaturm':{addMesh(new THREE.CylinderGeometry(2.2,4.5,118,16),lam('#d3d6da'),L.x,59,L.y);addMesh(new THREE.CylinderGeometry(10,9,9,20),lam('#c3c7cc'),L.x,112,L.y);addMesh(new THREE.CylinderGeometry(9,10,3,20),lam('#8f969d'),L.x,118,L.y);addMesh(new THREE.CylinderGeometry(0.6,0.9,32,8),lam('#d84b3c'),L.x,135,L.y);break}
      case'stadion':{
        const shp=new THREE.Shape();const o=W.ellipse(L.x,L.y,L.rx,L.ry,48);shp.moveTo(o[0][0],o[0][1]);for(const p of o.slice(1))shp.lineTo(p[0],p[1]);const hole=new THREE.Path();const ii=W.ellipse(L.x,L.y,40,28,48);hole.moveTo(ii[0][0],ii[0][1]);for(const p of ii.slice(1))hole.lineTo(p[0],p[1]);shp.holes.push(hole);
        const g=new THREE.ExtrudeGeometry(shp,{depth:11,bevelEnabled:false});g.rotateX(Math.PI/2);g.translate(0,11,0);addMesh(g,lam('#bfc1bf'),0,0,0);
        addMesh(new THREE.CylinderGeometry(1,1,0.2,40),lam('#5d9a43'),L.x,0.12,L.y).scale.set(38,1,26);
        const roof=new THREE.PlaneGeometry(130,80,14,8);const pa=roof.attributes.position;for(let i=0;i<pa.count;i++){const x=pa.getX(i),y=pa.getY(i);pa.setZ(i,6*Math.sin(x/16)*Math.cos(y/14)+(y/80)*6)}roof.computeVertexNormals();
        const rm=new THREE.Mesh(roof,new THREE.MeshLambertMaterial({color:'#bfe0ea',transparent:true,opacity:0.42,side:THREE.DoubleSide,depthWrite:false}));rm.rotation.x=-Math.PI/2;rm.position.set(L.x-40,26,L.y+10);rm.rotation.z=0.25;scene.add(rm);
        for(const[dx,dz]of[[-95,-20],[-60,40],[10,-38],[-20,60]])addMesh(new THREE.CylinderGeometry(0.5,0.8,34,6),lam('#c9ced3'),L.x+dx*0.6,17,L.y+dz*0.6,{rz:0.15});
        break}
      case'bmw':{const silver=lam('#bcc3cb'),band=lam('#7d858e');for(const[dx,dy]of[[-7,-7],[7,-7],[-7,7],[7,7]]){addMesh(new THREE.CylinderGeometry(6.4,6.4,66,24),silver,L.x+dx,33,L.y+dy);addMesh(new THREE.CylinderGeometry(6.6,6.6,1.2,24),band,L.x+dx,40,L.y+dy)}
        addMesh(new THREE.CylinderGeometry(15,15,4,24),band,L.x,68,L.y);addMesh(new THREE.CylinderGeometry(10,7,10,24),lam('#d7dbe0'),L.bowl[0],5,L.bowl[1]);break}
      case'arena':{
        const tex=canvasTex(128,64,(g,w,h)=>{g.fillStyle='#e8eef2';g.fillRect(0,0,w,h);g.strokeStyle='#b8c4cc';g.lineWidth=3;for(let i=-2;i<6;i++){g.beginPath();g.moveTo(i*32,0);g.lineTo(i*32+64,h);g.stroke();g.beginPath();g.moveTo(i*32+64,0);g.lineTo(i*32,h);g.stroke()}},true);tex.repeat.set(14,2);
        const g=new THREE.CylinderGeometry(1,0.93,1,48,4,true);const pa=g.attributes.position;for(let i=0;i<pa.count;i++){const y=pa.getY(i);const k=1+0.06*Math.cos(y*Math.PI);pa.setX(i,pa.getX(i)*k);pa.setZ(i,pa.getZ(i)*k)}g.computeVertexNormals();
        const m=addMesh(g,new THREE.MeshLambertMaterial({map:tex,side:THREE.DoubleSide,emissive:'#3a0d0d'}),L.x,22,L.y);m.scale.set(L.rx,44,L.ry);
        const ring=new THREE.RingGeometry(0.62,1,48);const rm=addMesh(ring,lam('#dfe6ea',{side:THREE.DoubleSide}),L.x,44,L.y,{rx:-Math.PI/2});rm.scale.set(L.rx,L.ry,1);
        addMesh(new THREE.CylinderGeometry(1,1,0.3,40),lam('#5c9a45'),L.x,0.4,L.y).scale.set(L.rx*0.55,1,L.ry*0.5);break}
      case'chinaturm':{const wood=lam('#8a5a3c'),roof=lam('#3f6d4b');for(let i=0;i<5;i++){const s=9-i*1.5,y=i*5;addMesh(new THREE.BoxGeometry(s*0.75,4,s*0.75),wood,L.x,y+2,L.y);const r=addMesh(new THREE.ConeGeometry(s*0.85,2.2,4),roof,L.x,y+4.6,L.y,{ry:Math.PI/4});void r}addMesh(new THREE.ConeGeometry(0.3,3,6),lam('#d6b13c'),L.x,27,L.y);break}
      case'monopteros':{const st=lam('#e9e3d3'),y0=W.hill?W.hill.h-0.4:0;if(W.hill)hillBuild(W.hill);addMesh(new THREE.CylinderGeometry(6.5,7,1.6,24),st,L.x,y0+0.8,L.y);for(let i=0;i<10;i++){const a=i/10*Math.PI*2;addMesh(new THREE.CylinderGeometry(0.35,0.35,7,8),st,L.x+Math.cos(a)*5,y0+5,L.y+Math.sin(a)*5)}addMesh(new THREE.CylinderGeometry(5.8,5.8,1,24),st,L.x,y0+9,L.y);addMesh(new THREE.SphereGeometry(5.6,16,8,0,Math.PI*2,0,Math.PI/2),lam('#d9d2c0'),L.x,y0+9.4,L.y);break}
      case'bavaria':{const br=lam('#5d6b56');addMesh(new THREE.BoxGeometry(9,8,9),lam('#cfc6b2'),L.x,4,L.y);addMesh(new THREE.CylinderGeometry(1.4,2.2,13,10),br,L.x,14.5,L.y);addMesh(new THREE.SphereGeometry(1.1,10,8),br,L.x,21.8,L.y);addMesh(new THREE.BoxGeometry(0.4,5,0.4),br,L.x+1.6,23,L.y,{rz:-0.3});addMesh(new THREE.BoxGeometry(3,2,1.5),br,L.x+2,9,L.y+2.5);
        ruhmeshalle(L.hall);break}
      case'riesenrad':riesenrad(L.x,L.y);break;
      case'tents':{const names=['Isarbräu-Festzelt','Alpenrosen-Halle','Löwenhof-Zelt'];L.tents.forEach((t,i)=>festzelt(t[0],t[1],t[2],t[3],names[i%3],i));break}
      case'uni':uniBuildings(L);break;
      case'kirche':dorfkirche(L.x,L.y);break;
      case'airport':airportBuild(L.A);break;
      case'base':baseBuild(L.B);break;
      case'campus':campusBuild(L.C);break;
      case'hbf':{const[x0,z0,x1,z1]=L.box;if(!W.rail){texturedBox(x0,z0,x1,z0+16,18,'#b9b2a5');texturedBox(x0,z0+16,x0+14,z1,18,'#b9b2a5');addMesh(new THREE.BoxGeometry(x1-x0-14,12,z1-z0-16),lam('#9aa4ab'),(x0+14+x1)/2,6,(z0+16+z1)/2);
        const hall=new THREE.CylinderGeometry(1,1,1,16,1,false,0,Math.PI);const h=addMesh(hall,new THREE.MeshLambertMaterial({color:'#8fb1c4',transparent:true,opacity:0.75}),(x0+14+x1)/2,12,(z0+16+z1)/2,{rz:Math.PI/2});h.rotation.set(0,0,Math.PI/2);h.scale.set(8,x1-x0-14,(z1-z0-16)/2)}
        else railwayBuild(W.rail,L.box);
        const lb=labelSprite('Hauptbahnhof','rgba(20,22,26,.72)','#fff',2);lb.position.set((x0+x1)/2,26,(z0+z1)/2);scene.add(lb);break}
      case'maibaum':{const tex=canvasTex(32,128,(g)=>{for(let i=-4;i<12;i++){g.fillStyle=i%2?'#ffffff':'#2a6fd1';g.beginPath();g.moveTo(0,i*16);g.lineTo(32,i*16-16);g.lineTo(32,i*16);g.lineTo(0,i*16+16);g.fill()}},true);tex.repeat.set(1,8);
        addMesh(new THREE.CylinderGeometry(0.25,0.4,28,8),new THREE.MeshLambertMaterial({map:tex}),L.x,14,L.y);for(let i=0;i<4;i++){addMesh(new THREE.BoxGeometry(5,0.2,0.2),lam('#e9e2c8'),L.x,10+i*4,L.y,{ry:i*0.8})}addMesh(new THREE.ConeGeometry(1.2,1.6,8),lam('#3e7d3e'),L.x,28.5,L.y);break}
      case'mariensaeule':{const st=lam('#d9d2c0'),mar=lam('#bfb7a6');addMesh(new THREE.BoxGeometry(5.4,1.0,5.4),mar,L.x,0.5,L.y);addMesh(new THREE.BoxGeometry(3.4,3.2,3.4),st,L.x,2.6,L.y);
        for(const[dx,dz]of[[1,1],[1,-1],[-1,1],[-1,-1]]){addMesh(new THREE.BoxGeometry(0.9,1.4,0.9),mar,L.x+dx*2.2,1.7,L.y+dz*2.2);addMesh(new THREE.SphereGeometry(0.45,8,6),lam('#3c3a36'),L.x+dx*2.2,2.7,L.y+dz*2.2)}
        addMesh(new THREE.CylinderGeometry(0.55,0.7,13,12),lam('#9a3f38'),L.x,10.7,L.y);addMesh(new THREE.BoxGeometry(1.5,0.8,1.5),st,L.x,17.6,L.y);
        const gold=lam('#e2bb45',{emissive:'#4a3500'});addMesh(new THREE.ConeGeometry(0.55,2.2,8),gold,L.x,19.1,L.y);addMesh(new THREE.SphereGeometry(0.3,8,6),gold,L.x,20.4,L.y);addMesh(new THREE.TorusGeometry(0.42,0.06,4,14),gold,L.x,20.8,L.y,{rx:Math.PI/2});
        for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;addMesh(new THREE.BoxGeometry(0.4,0.7,0.9),lam('#4e5a52'),L.x+Math.cos(a)*1.9,4.6,L.y+Math.sin(a)*1.9,{ry:-a})}
        const r=new THREE.Mesh(new THREE.RingGeometry(3.2,9.5,40),lam('#b8b2a4',{side:THREE.DoubleSide}));r.rotation.x=-Math.PI/2;r.position.set(L.x,0.13,L.y);r.receiveShadow=true;r.renderOrder=2;scene.add(r);break}
      case'brunnen':{const st=lam('#c9c2b0');const basin=new THREE.CylinderGeometry(2.8,3.0,0.9,8,1,true);const b=addMesh(basin,lam('#c9c2b0',{side:THREE.DoubleSide}),L.x,0.45,L.y);void b;addMesh(new THREE.CylinderGeometry(3.05,3.05,0.14,8),st,L.x,0.92,L.y).scale.set(1,1,1);
        const wat=new THREE.Mesh(new THREE.CylinderGeometry(2.7,2.7,0.1,8),new THREE.MeshPhongMaterial({color:'#4f8fb0',shininess:120,specular:new THREE.Color('#ffffff'),envMap:envCube,reflectivity:0.5,combine:THREE.MixOperation,transparent:true,opacity:0.88}));wat.position.set(L.x,0.72,L.y);scene.add(wat);
        addMesh(new THREE.CylinderGeometry(0.45,0.7,2.6,8),st,L.x,1.6,L.y);addMesh(new THREE.CylinderGeometry(1.1,0.5,0.4,10),st,L.x,2.9,L.y);for(let i=0;i<3;i++){const a=i/3*Math.PI*2;addMesh(new THREE.BoxGeometry(0.9,0.4,0.3),lam('#4b6b5f'),L.x+Math.cos(a)*0.8,1.3,L.y+Math.sin(a)*0.8,{ry:-a})}
        addMesh(new THREE.BoxGeometry(0.5,1.2,0.4),lam('#4b6b5f'),L.x,3.7,L.y);
        fountains.push({x:L.x,y:L.y,top:3.2,r:2.4});break}
      case'xmas':{const wood=lam('#7a4a2c'),roofM=lam('#8a2a22'),snow=lam('#f4f6f8');const bulbs=[];
        for(const s of L.stalls){const[x,y,w,d]=s;addMesh(new THREE.BoxGeometry(w,2.4,d),wood,x,1.2,y);gable(x-w/2-0.3,y-d/2-0.4,x+w/2+0.3,y+d/2+0.4,2.4,1.4,pickXmas(x));
          addMesh(new THREE.BoxGeometry(w-0.4,0.12,0.5),lam('#5a3420'),x,1.1,y+(y>640?-d/2-0.2:d/2+0.2));addMesh(new THREE.BoxGeometry(w-0.6,0.8,0.05),lam('#ffe1a3',{emissive:'#7a5a20'}),x,1.6,y+(y>640?-d/2-0.01:d/2+0.01));
          for(let i=0;i<7;i++)bulbs.push([x-w/2+0.2+i*(w-0.4)/6,2.45,y+(y>640?-d/2-0.42:d/2+0.42)]);
          const sign=labelSprite(['Glühwein','Lebkuchen','Bratwurst','Krippen','Maroni','Christbaumkugeln','Gebrannte Mandeln','Holzspielzeug','Kerzen','Stollen','Punsch','Strohsterne'][Math.floor(x*7+y)%12],'rgba(60,20,14,.85)','#ffe1a3',0.8);sign.position.set(x,3.9,y);scene.add(sign)}
        const T0=L.tree;addMesh(new THREE.CylinderGeometry(0.4,0.6,3,8),lam('#5a3a24'),T0.x,1.5,T0.y);const fir=lam('#1f4d2e');
        for(let i=0;i<5;i++){const r=4.2-i*0.75,y=3+i*2.6;addMesh(new THREE.ConeGeometry(r,3.6,10),fir,T0.x,y+1.6,T0.y);for(let k=0;k<12;k++){const a=k/12*Math.PI*2+i;bulbs.push([T0.x+Math.cos(a)*r*0.82,y+0.4,T0.y+Math.sin(a)*r*0.82])}}
        addMesh(new THREE.OctahedronGeometry(0.7),lam('#ffd75a',{emissive:'#a07a00'}),T0.x,17.8,T0.y);
        const bg=new THREE.SphereGeometry(0.11,6,4);const bm=new THREE.InstancedMesh(bg,new THREE.MeshBasicMaterial({color:'#ffd27a'}),bulbs.length);bulbs.forEach((b,i)=>{bm.setMatrixAt(i,M4().makeTranslation(b[0],b[1],b[2]))});bm.frustumCulled=false;scene.add(bm);xmasBulbs=bm;
        const glowG=new THREE.PlaneGeometry(1.1,1.1);xmasGlow=new THREE.InstancedMesh(glowG,new THREE.MeshBasicMaterial({map:canvasTex(32,32,(g)=>{const gr=g.createRadialGradient(16,16,0,16,16,16);gr.addColorStop(0,'rgba(255,214,140,1)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,32,32)}),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0}),bulbs.length);
        xmasGlow.userData.pts=bulbs;xmasGlow.frustumCulled=false;xmasGlow.renderOrder=7;scene.add(xmasGlow);void snow;break}
      case'stalls':{for(const s of L.stalls){const[x,y,w,d]=s;addMesh(new THREE.BoxGeometry(w,2.6,d),lam('#e3d6bd'),x+w/2,1.3,y+d/2);gable(x-0.3,y-0.3,x+w+0.3,y+d+0.3,2.6,1.6,pickCol(x))}break}
    }
  }
  for(const m of matCache.values())if(!before.has(m)&&m.emissive)landmarkMats.add(m);
  // zone pads: tinted area with a bold border and corner marks (mapped once onto the lot, no tiling)
  for(const z of W.zones){if(z.kind==='home')continue;const col=ZCOL[z.kind]||'#ffc61a';
    lotPad(z.lot,col);
    const name={werkstatt:'WERKSTATT',lack:'LACKIEREREI',hehler:'HEHLER',safe:'VERSTECK',klinik:'KLINIK · NOTARZT',feuerwache:'FEUERWACHE',depot:'MVG-BUSDEPOT',brauerei:'BRAUEREI'}[z.kind]||z.kind.toUpperCase();const sp=iconLabel(z.kind,name,col,2.3);sp.position.set(z.x,6.5,z.y);scene.add(sp)}
}
const ZCOL={werkstatt:'#3b82ff',lack:'#e0457b',hehler:'#ff7a1a',safe:'#3ddc84',klinik:'#f2f2f2',feuerwache:'#e8402e',depot:'#2a6fd1',brauerei:'#e0a526'};
function pickXmas(x){return['#8a2a22','#2f5a3a','#7a2a3e','#6b3a22'][Math.floor(x/7)%4]}
let xmasBulbs=null,xmasGlow=null;const fountains=[];
function pickCol(x){return['#c94a3a','#2f6db5','#3a8a52','#d9a42a'][Math.floor(x)%4]}



/* ---------- homes: signs at the door, marked garages for the ones you own ---------- */
const propVis=[];
function fmt$(v){return'$'+v.toLocaleString('de-DE')}
R3.refreshProps=function(){
  for(const o of propVis){scene.remove(o);if(o.material){if(o.material.map)o.material.map.dispose();o.material.dispose()}}propVis.length=0;
  const G=S.G;
  for(const p of W.properties){const own=G.owned&&G.owned.has(p.id);
    const sp=own?iconLabel('home',G.home===p.id?'ZUHAUSE':p.name.toUpperCase(),'#ffc61a',2.2):iconLabel('sale','ZU VERKAUFEN · '+fmt$(p.price),'#f1ede2',2.0);sp.position.set(p.x,(p.b?p.b.h+(p.b.pitched?6:2.5):5.6),p.y);scene.add(sp);propVis.push(sp);
    if(own&&p.hangar){const gs=iconLabel('garage','DEIN HANGAR','#ffc61a',2.0);gs.position.set(p.gx,9,p.gy);scene.add(gs);propVis.push(gs)}
    if(own&&p.lot){propVis.push(lotPad(p.lot,'#ffc61a'));const gs=iconLabel('garage','GARAGE','#ffc61a',2.0);gs.position.set(p.gx,6.2,p.gy);scene.add(gs);propVis.push(gs)}
    // a little door glow so homes are easy to find
    const ring=new THREE.Mesh(new THREE.RingGeometry(0.9,1.2,28),new THREE.MeshBasicMaterial({color:own?'#ffc61a':'#c8ccd2',transparent:true,opacity:0.8,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(p.x,0.13,p.y);ring.renderOrder=4;scene.add(ring);propVis.push(ring)}
};
R3.dropPed=function(id){const o=pedObjs.get(id);if(o){scene.remove(o.g);if(o.pool)scene.remove(o.pool);pedObjs.delete(id)}};

/* ---------- props (instanced) ---------- */
const propInst={};let lampHeadMat=null,poolMat=null;
function swayMat(base){
  const m=base;m.onBeforeCompile=sh=>{sh.uniforms.uTime=U.time;sh.uniforms.uSway=U.sway;sh.vertexShader='uniform float uTime;uniform float uSway;\n'+sh.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat ph=instanceMatrix[3].x*0.21+instanceMatrix[3].z*0.17;float k=max(position.y+1.6,0.0)*uSway;transformed.x+=sin(uTime*1.6+ph)*0.05*k;transformed.z+=cos(uTime*1.3+ph*1.3)*0.04*k;\n#endif')};
  m.customProgramCacheKey=()=>'sway';return m;
}
function buildProps(){
  const SEC=200,groups=new Map();
  const trees=W.props.filter(p=>p.k==='tree');
  const trunkG=new THREE.CylinderGeometry(0.16,0.26,3.2,6);trunkG.translate(0,1.6,0);
  // leafy crown: three overlapping blobs
  const canG=mergeGeos([{g:new THREE.IcosahedronGeometry(1.75,0),color:'#ffffff',m:tm(0,0.1,0)},{g:new THREE.IcosahedronGeometry(1.25,0),color:'#e8e8e8',m:tm(0.95,-0.35,0.35)},{g:new THREE.IcosahedronGeometry(1.2,0),color:'#f2f2f2',m:tm(-0.75,-0.25,-0.6)},{g:new THREE.IcosahedronGeometry(1.0,0),color:'#dcdcdc',m:tm(0.1,0.95,-0.2)}]);
  const conG=mergeGeos([{g:new THREE.ConeGeometry(1.7,3.0,7),color:'#ffffff',m:tm(0,-0.6,0)},{g:new THREE.ConeGeometry(1.25,2.6,7),color:'#eeeeee',m:tm(0,0.9,0)},{g:new THREE.ConeGeometry(0.75,1.8,7),color:'#e2e2e2',m:tm(0,2.2,0)}]);
  canG.computeVertexNormals();conG.computeVertexNormals();
  const trunkM=lam('#6b4f36'),canM=swayMat(new THREE.MeshLambertMaterial({vertexColors:true})),conM=swayMat(new THREE.MeshLambertMaterial({vertexColors:true}));
  const use=Q.trees;
  for(const t of trees){if(use<1&&t.hue>use)continue;const k=Math.floor(t.x/SEC)*100+Math.floor(t.y/SEC);let a=groups.get(k);if(!a)groups.set(k,a=[]);a.push(t)}
  const m=M4(),col=new THREE.Color(),q=new THREE.Quaternion(),e=new THREE.Euler();
  R3.treeSecs=[];
  for(const[k,list]of groups){
    const conif=list.filter(t=>(W.at(t.x,t.y)===W.TY.PARK&&((t.hue*1000)%1)<0.28)||(t.forest&&((t.hue*1000)%1)<0.7)),leafy=list.filter(t=>!conif.includes(t));
    const tr=new THREE.InstancedMesh(trunkG,trunkM,list.length),cn=new THREE.InstancedMesh(canG,canM,Math.max(1,leafy.length)),cf=new THREE.InstancedMesh(conG,conM,Math.max(1,conif.length));
    list.forEach((t,i)=>{const s=t.s;m.compose(new THREE.Vector3(t.x,0,t.y),q.setFromEuler(e.set(0,t.hue*6,0)),new THREE.Vector3(s,s,s));tr.setMatrixAt(i,m)});
    leafy.forEach((t,i)=>{const s=t.s;m.compose(new THREE.Vector3(t.x,3.9*s,t.y),q.setFromEuler(e.set(t.hue*0.4,t.hue*9,0)),new THREE.Vector3(s*1.05,s*0.95,s*1.05));cn.setMatrixAt(i,m);
      col.setHSL(0.22+t.hue*0.1,0.38+t.hue*0.18,0.25+t.hue*0.1);cn.setColorAt(i,col)});
    conif.forEach((t,i)=>{const s=t.s;m.compose(new THREE.Vector3(t.x,3.4*s,t.y),q.setFromEuler(e.set(0,t.hue*9,0)),new THREE.Vector3(s,s*1.15,s));cf.setMatrixAt(i,m);col.setHSL(0.36+t.hue*0.04,0.35,0.2+t.hue*0.06);cf.setColorAt(i,col)});
    if(!leafy.length)cn.count=0;if(!conif.length)cf.count=0;
    tr.castShadow=cn.castShadow=cf.castShadow=true;cn.receiveShadow=cf.receiveShadow=true;tr.frustumCulled=cn.frustumCulled=cf.frustumCulled=false;scene.add(tr,cn,cf);
    R3.treeSecs.push({x:(Math.floor(k/100)+0.5)*SEC,y:(k%100+0.5)*SEC,meshes:[tr,cn,cf]});
  }
  // street furniture
  const lampG=mergeGeos([{g:new THREE.CylinderGeometry(0.07,0.11,6,6),color:'#3d4249',m:tm(0,3,0)},{g:new THREE.CylinderGeometry(0.16,0.2,0.5,6),color:'#30343a',m:tm(0,0.25,0)},{g:new THREE.BoxGeometry(1.6,0.09,0.09),color:'#3d4249',m:tm(0.8,6,0)},{g:new THREE.BoxGeometry(0.62,0.12,0.36),color:'#3d4249',m:tm(1.55,6.0,0)}]);
  const hydG=mergeGeos([{g:new THREE.CylinderGeometry(0.16,0.2,0.75,8),color:'#c4282d',m:tm(0,0.38,0)},{g:new THREE.SphereGeometry(0.17,8,6),color:'#c4282d',m:tm(0,0.78,0)},{g:new THREE.CylinderGeometry(0.05,0.05,0.5,6),color:'#a8a8a8',m:tm(0,0.5,0,0,1,1,1,Math.PI/2)}]);
  const binG=mergeGeos([{g:new THREE.CylinderGeometry(0.28,0.25,0.95,10),color:'#4c6555',m:tm(0,0.48,0)},{g:new THREE.CylinderGeometry(0.3,0.3,0.06,10),color:'#2f3d34',m:tm(0,0.98,0)}]);
  const vmat=new THREE.MeshLambertMaterial({vertexColors:true});
  const wood='#8a5a33',metal='#3a3d42';
  const benchG=mergeGeos([{g:new THREE.BoxGeometry(1.8,0.07,0.5),color:wood,m:tm(0,0.46,0)},{g:new THREE.BoxGeometry(1.8,0.4,0.06),color:wood,m:tm(0,0.78,-0.23)},{g:new THREE.BoxGeometry(0.08,0.46,0.5),color:metal,m:tm(-0.75,0.23,0)},{g:new THREE.BoxGeometry(0.08,0.46,0.5),color:metal,m:tm(0.75,0.23,0)}]);
  const planterG=mergeGeos([{g:new THREE.BoxGeometry(1.2,0.6,1.2),color:'#a7a49c',m:tm(0,0.3,0)},{g:new THREE.IcosahedronGeometry(0.55,0),color:'#4f7d3a',m:tm(0,0.75,0,0,1,0.55,1)},{g:new THREE.IcosahedronGeometry(0.2,0),color:'#d84b6b',m:tm(0.25,0.95,0.15)},{g:new THREE.IcosahedronGeometry(0.18,0),color:'#f2c94c',m:tm(-0.2,0.92,-0.2)}]);
  const bollardG=mergeGeos([{g:new THREE.CylinderGeometry(0.11,0.13,0.9,8),color:'#4a4d52',m:tm(0,0.45,0)},{g:new THREE.CylinderGeometry(0.115,0.115,0.08,8),color:'#e9e9e2',m:tm(0,0.72,0)}]);
  const bikeParts=[{g:new THREE.BoxGeometry(2.0,0.06,0.06),color:metal,m:tm(0,0.55,0)}];
  for(const x of[-0.65,0,0.65]){const col=['#c0392b','#2c6e9e','#2f7a3e'][Math.round(x/0.65)+1];for(const z of[-0.5,0.5]){const tg=new THREE.TorusGeometry(0.32,0.03,4,14);bikeParts.push({g:tg,color:'#202124',m:tm(x,0.34,z,Math.PI/2)})}bikeParts.push({g:new THREE.BoxGeometry(0.05,0.05,0.95),color:col,m:tm(x,0.55,0)},{g:new THREE.BoxGeometry(0.05,0.35,0.05),color:col,m:tm(x,0.55,0.2)},{g:new THREE.BoxGeometry(0.4,0.04,0.04),color:metal,m:tm(x,0.85,-0.4,Math.PI/2)})}
  const bikesG=mergeGeos(bikeParts);
  const tableG=mergeGeos([{g:new THREE.CylinderGeometry(0.45,0.45,0.05,12),color:'#e9e6df',m:tm(0,0.75,0)},{g:new THREE.CylinderGeometry(0.05,0.05,2.4,6),color:metal,m:tm(0,1.2,0)},{g:new THREE.BoxGeometry(0.42,0.45,0.42),color:'#6b4a2e',m:tm(0.75,0.23,0)},{g:new THREE.BoxGeometry(0.42,0.45,0.42),color:'#6b4a2e',m:tm(-0.75,0.23,0)},{g:new THREE.BoxGeometry(0.42,0.45,0.42),color:'#6b4a2e',m:tm(0,0.23,0.75)}]);
  const canopyG=new THREE.ConeGeometry(1.5,0.5,8);canopyG.translate(0,2.35,0);
  const KINDS={lamp:[lampG],hydrant:[hydG],bin:[binG],bench:[benchG],planter:[planterG],bollard:[bollardG],bikes:[bikesG],parasol:[tableG,canopyG]};
  for(const kind in KINDS){
    const list=W.props.filter(p=>p.k===kind);if(!list.length)continue;propInst[kind]=[];
    KINDS[kind].forEach((geo,gi)=>{const canopy=kind==='parasol'&&gi===1;const im=new THREE.InstancedMesh(geo,canopy?new THREE.MeshLambertMaterial({color:'#ffffff'}):vmat,list.length);
      list.forEach((p,i)=>{p.ii=i;setPropMatrix(im,p,false);if(canopy)im.setColorAt(i,new THREE.Color(['#b8352c','#f1ede2','#2f6b4f','#1f4f8a','#c58b2b'][i%5]))});
      im.castShadow=kind!=='bollard';im.receiveShadow=true;im.frustumCulled=false;scene.add(im);propInst[kind].push(im)});
  }
  // lamp glass and the pools of light they throw at night
  const lamps=W.props.filter(p=>p.k==='lamp');
  lampHeadMat=new THREE.MeshBasicMaterial({color:'#8d8b80'});
  const head=new THREE.InstancedMesh(new THREE.BoxGeometry(0.5,0.05,0.28),lampHeadMat,lamps.length);head.frustumCulled=false;scene.add(head);propInst.lampHead=head;
  const poolTex=canvasTex(64,64,(g)=>{const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,214,150,1)');gr.addColorStop(0.45,'rgba(255,196,120,.45)');gr.addColorStop(1,'rgba(255,180,100,0)');g.fillStyle=gr;g.fillRect(0,0,64,64)});
  poolMat=new THREE.MeshBasicMaterial({map:poolTex,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-8});
  const pg=new THREE.PlaneGeometry(11,11);pg.rotateX(-Math.PI/2);
  const pools=new THREE.InstancedMesh(pg,poolMat,lamps.length);pools.frustumCulled=false;pools.renderOrder=4;scene.add(pools);propInst.pool=pools;
  lamps.forEach((p,i)=>{p.hi=i;setLampExtras(p,false)});
}
function setLampExtras(p,broken){
  const m=M4();const yaw=Math.atan2(p.ny,p.nx);const hx=p.x+Math.cos(yaw)*1.55,hz=p.y+Math.sin(yaw)*1.55;
  if(broken)m.makeScale(0,0,0);else m.compose(new THREE.Vector3(hx,5.93,hz),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,-yaw,0)),new THREE.Vector3(1,1,1));
  propInst.lampHead.setMatrixAt(p.hi,m);propInst.lampHead.instanceMatrix.needsUpdate=true;
  if(broken)m.makeScale(0,0,0);else m.makeTranslation(hx,0.14,hz);propInst.pool.setMatrixAt(p.hi,m);propInst.pool.instanceMatrix.needsUpdate=true;
}
function setPropMatrix(im,p,broken){
  const m=M4();const yaw=p.k==='lamp'?Math.atan2(p.ny,p.nx):(p.a||0);
  if(!broken)m.compose(new THREE.Vector3(p.x,0,p.y),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,-yaw,0)),new THREE.Vector3(1,1,1));
  else{const f=p.fall||0;m.compose(new THREE.Vector3(p.x,0.15,p.y),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,-f,Math.PI/2*-0.98,'YXZ')),new THREE.Vector3(1,1,1));if(p.k!=='lamp')m.compose(new THREE.Vector3(p.x,0.1,p.y),new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,-f,0,'YXZ')),new THREE.Vector3(1,1,1))}
  im.setMatrixAt(p.ii,m);im.instanceMatrix.needsUpdate=true;
}
R3.onProp=p=>{const ims=propInst[p.k];if(ims)for(const im of ims)setPropMatrix(im,p,true);if(p.k==='lamp'&&p.hi!==undefined)setLampExtras(p,true)};
R3.resetProps=()=>{for(const p of W.props){const ims=propInst[p.k];if(ims&&p.ii!==undefined)for(const im of ims)setPropMatrix(im,p,false);if(p.k==='lamp'&&p.hi!==undefined)setLampExtras(p,false)}};

/* ---------- traffic lights ---------- */
let lightHeads=null;const lightList=[];
function buildLights(){
  for(const n of W.nodes){if(!n.light)continue;for(const ei of n.edges){const e=W.edges[ei];const d=e.a===n.id?e.F:e.B;const s=n.r+1.2;if(s>e.len/2)continue;const p=W.pointAt(d.pts,d.cum,s);
    const ox=-p.ty,oy=p.tx;const off=-(e.w/2+0.9);lightList.push({x:p.x+ox*off,y:p.y+oy*off,n,ang:e.a===n.id?e.dirA:e.dirB,face:Math.atan2(p.ty,p.tx)})}}
  const poleG=mergeGeos([{g:new THREE.CylinderGeometry(0.08,0.1,3.4,6),color:'#30343a',m:tm(0,1.7,0)},{g:new THREE.BoxGeometry(0.3,1,0.36),color:'#22252a',m:tm(0,3.6,0)},{g:new THREE.BoxGeometry(0.06,1.1,0.5),color:'#f2f2f2',m:tm(-0.17,3.6,0)}]);
  const poles=new THREE.InstancedMesh(poleG,new THREE.MeshLambertMaterial({vertexColors:true}),lightList.length);
  lightHeads=new THREE.InstancedMesh(new THREE.BoxGeometry(0.12,0.28,0.26),new THREE.MeshBasicMaterial({color:'#ffffff'}),lightList.length);
  const m=M4();lightList.forEach((l,i)=>{m.compose(new THREE.Vector3(l.x,0,l.y),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,-l.face,0)),new THREE.Vector3(1,1,1));poles.setMatrixAt(i,m);
    m.compose(new THREE.Vector3(l.x+Math.cos(l.face)*0.17,3.6,l.y+Math.sin(l.face)*0.17),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,-l.face,0)),new THREE.Vector3(1,1,1));lightHeads.setMatrixAt(i,m);lightHeads.setColorAt(i,new THREE.Color('#22d36b'))});
  poles.frustumCulled=lightHeads.frustumCulled=false;poles.castShadow=true;scene.add(poles,lightHeads);
}
const LCOL={g:new THREE.Color('#2bff7a'),y:new THREE.Color('#ffc21a'),r:new THREE.Color('#ff2a1a')};
let lightT=0;
function updateLights(dt){lightT-=dt;if(lightT>0||!lightHeads)return;lightT=0.25;lightList.forEach((l,i)=>lightHeads.setColorAt(i,LCOL[S.lightState(l.n,l.ang)]));lightHeads.instanceColor.needsUpdate=true}

/* ---------- phones & pickups & markers ---------- */
const phoneMeshes=[],pickupMeshes=[],pkgMeshes=[],pigeons=[];let heliG,heliRotor,heliTail,heliBlink,heliCone,heliPool,pigeonMesh,fountainParts;let beacon,beaconRing,beacon2,arrow3d,playerRing,wpBeacon,playerMark;
function buildMarkers(){
  const boothG=mergeGeos([{g:new THREE.BoxGeometry(0.9,2.3,0.9),color:'#5d6168',m:tm(0,1.15,0)},{g:new THREE.BoxGeometry(0.95,0.35,0.95),color:'#2fb56c',m:tm(0,2.35,0)},{g:new THREE.BoxGeometry(0.6,0.8,0.05),color:'#cfe9da',m:tm(0,1.4,0.47)}]);
  const vm=new THREE.MeshLambertMaterial({vertexColors:true});
  const bm=new THREE.MeshBasicMaterial({color:'#3ddc84',transparent:true,opacity:0.35,depthWrite:false,side:THREE.DoubleSide});
  for(const ph of W.phones){const g=new THREE.Group();const b=new THREE.Mesh(boothG,vm);b.castShadow=true;g.add(b);const beam=new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.4,9,16,1,true),bm);beam.position.y=4.5;g.add(beam);g.position.set(ph.x,0,ph.y);g.userData.beam=beam;scene.add(g);phoneMeshes.push({ph,g})}
  const icon=(bg,fn)=>canvasTex(64,64,(g)=>{g.fillStyle=bg;g.fillRect(0,0,64,64);fn(g)});
  const icons={health:icon('#f1f3f4',g=>{g.fillStyle='#d62e2e';g.fillRect(26,10,12,44);g.fillRect(10,26,44,12)}),armor:icon('#2f5db0',g=>{g.fillStyle='#dfe7f5';g.beginPath();g.moveTo(32,8);g.lineTo(54,18);g.lineTo(50,44);g.lineTo(32,56);g.lineTo(14,44);g.lineTo(10,18);g.fill()}),
    pistol:icon('#c9a227',g=>{g.fillStyle='#3a2c00';g.fillRect(12,22,40,10);g.fillRect(16,30,10,20)}),smg:icon('#3b3f47',g=>{g.fillStyle='#ffc61a';g.fillRect(8,24,48,10);g.fillRect(20,32,8,18);g.fillRect(36,32,6,12)}),
    shotgun:icon('#7a4a2a',g=>{g.fillStyle='#f0d9b5';g.fillRect(6,26,52,8);g.fillRect(40,32,14,12)}),grenade:icon('#3e5a33',g=>{g.fillStyle='#cfe0b8';g.beginPath();g.arc(32,36,14,0,7);g.fill();g.fillRect(28,14,8,10)})};
  for(const p of W.pickups){const m=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.8,0.8),new THREE.MeshLambertMaterial({map:icons[p.k],emissive:'#333'}));m.castShadow=true;m.position.set(p.x,0.9,p.y);scene.add(m);pickupMeshes.push({p,m})}
  const ym=new THREE.MeshBasicMaterial({color:'#ffc61a',transparent:true,opacity:0.3,depthWrite:false,side:THREE.DoubleSide});
  beacon=new THREE.Mesh(new THREE.CylinderGeometry(3,3,40,24,1,true),ym);beacon.position.y=20;beacon.visible=false;scene.add(beacon);
  beacon2=new THREE.Mesh(new THREE.CylinderGeometry(2,2,24,20,1,true),new THREE.MeshBasicMaterial({color:'#ffc61a',transparent:true,opacity:0.14,depthWrite:false,side:THREE.DoubleSide}));beacon2.position.y=12;beacon2.visible=false;scene.add(beacon2);
  beaconRing=new THREE.Mesh(new THREE.RingGeometry(2.6,3.2,32),new THREE.MeshBasicMaterial({color:'#ffc61a',transparent:true,opacity:0.9,side:THREE.DoubleSide}));beaconRing.rotation.x=-Math.PI/2;beaconRing.position.y=0.15;beaconRing.visible=false;scene.add(beaconRing);
  const ag=new THREE.ConeGeometry(0.7,2.2,4);ag.rotateZ(-Math.PI/2);arrow3d=new THREE.Mesh(ag,new THREE.MeshLambertMaterial({color:'#ffc61a',emissive:'#5a4300'}));arrow3d.visible=false;scene.add(arrow3d);
  // marker that shows through buildings when the player is hidden behind them
  playerMark=new THREE.Sprite(new THREE.SpriteMaterial({map:canvasTex(64,64,(g)=>{g.fillStyle='#ffc61a';g.strokeStyle='rgba(0,0,0,.85)';g.lineWidth=5;g.beginPath();g.moveTo(10,14);g.lineTo(54,14);g.lineTo(32,52);g.closePath();g.fill();g.stroke()}),depthTest:false,transparent:true}));
  playerMark.scale.set(1.6,1.6,1);playerMark.renderOrder=30;playerMark.visible=false;scene.add(playerMark);
  wpBeacon=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.2,30,20,1,true),new THREE.MeshBasicMaterial({color:'#c48bff',transparent:true,opacity:0.22,depthWrite:false,side:THREE.DoubleSide}));wpBeacon.visible=false;scene.add(wpBeacon);
  // stunt ramps
  const rampMat=new THREE.MeshLambertMaterial({map:canvasTex(64,64,(g)=>{g.fillStyle='#d8a21c';g.fillRect(0,0,64,64);g.fillStyle='#1d1d1f';for(let i=-2;i<6;i++){g.beginPath();g.moveTo(i*16,0);g.lineTo(i*16+8,0);g.lineTo(i*16+40,64);g.lineTo(i*16+32,64);g.fill()}},true)});
  for(const r of W.ramps){const sh=new THREE.Shape();sh.moveTo(-r.len/2,0);sh.lineTo(r.len/2,r.h);sh.lineTo(r.len/2,0);sh.closePath();const g=new THREE.ExtrudeGeometry(sh,{depth:r.wid,bevelEnabled:false});g.translate(0,0,-r.wid/2);
    const m=new THREE.Mesh(g,[lam('#4a4d52'),rampMat]);m.position.set(r.x,0.02,r.y);m.rotation.y=-r.a;m.castShadow=m.receiveShadow=true;scene.add(m)}
  // hidden packages: white paper bags with a blue-white band
  const bagG=mergeGeos([{g:new THREE.BoxGeometry(0.5,0.62,0.34),color:'#f1ece0',m:tm(0,0.31,0)},{g:new THREE.BoxGeometry(0.52,0.14,0.36),color:'#2a6fd1',m:tm(0,0.46,0)},{g:new THREE.BoxGeometry(0.3,0.05,0.05),color:'#c9b48a',m:tm(0,0.66,0)}]);
  const bagM=new THREE.MeshLambertMaterial({vertexColors:true,emissive:'#202020'});
  for(const p of W.packages){const m=new THREE.Mesh(bagG,bagM);m.position.set(p.x,0,p.y);m.castShadow=true;scene.add(m);pkgMeshes.push({p,m})}
  const sp=new THREE.MeshBasicMaterial({color:'#bfe3ff',transparent:true,opacity:0.18,depthWrite:false,side:THREE.DoubleSide});
  for(const pm of pkgMeshes){const b=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,5,10,1,true),sp);b.position.set(pm.p.x,2.5,pm.p.y);scene.add(b);pm.beam=b}
  // police helicopter
  {const H=makeHeliModel({body:'#1f3c88',belly:'#eef1f4'});heliG=H.g;heliRotor=H.rotor;heliTail=H.tail;heliBlink=H.blink}
  heliG.traverse(o=>{if(o.isMesh)o.castShadow=true});heliG.visible=false;scene.add(heliG);
  const coneTex=canvasTex(32,128,(g)=>{const gr=g.createLinearGradient(0,0,0,128);gr.addColorStop(0,'rgba(255,255,240,.0)');gr.addColorStop(1,'rgba(255,255,235,.55)');g.fillStyle=gr;g.fillRect(0,0,32,128)});
  heliCone=new THREE.Mesh(new THREE.CylinderGeometry(0.5,7,1,24,1,true),new THREE.MeshBasicMaterial({map:coneTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,opacity:0.5}));heliCone.renderOrder=7;scene.add(heliCone);heliCone.visible=false;
  heliPool=new THREE.Mesh(new THREE.CircleGeometry(7,32),new THREE.MeshBasicMaterial({map:canvasTex(64,64,(g)=>{const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,235,.9)');gr.addColorStop(0.7,'rgba(255,255,235,.5)');gr.addColorStop(1,'rgba(255,255,235,0)');g.fillStyle=gr;g.fillRect(0,0,64,64)}),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));heliPool.rotation.x=-Math.PI/2;heliPool.renderOrder=4;scene.add(heliPool);heliPool.visible=false;
  // pigeons: small instanced flock per spot
  const pg=mergeGeos([{g:new THREE.SphereGeometry(0.13,6,4),color:'#8a8f98',m:tm(0,0.14,0,0,1.4,1,1)},{g:new THREE.SphereGeometry(0.08,6,4),color:'#5c6570',m:tm(0.17,0.24,0)},{g:new THREE.BoxGeometry(0.14,0.03,0.4),color:'#7b808a',m:tm(-0.02,0.2,0)}]);
  const PN=W.pigeons.length*9;pigeonMesh=new THREE.InstancedMesh(pg,new THREE.MeshLambertMaterial({vertexColors:true}),PN);pigeonMesh.frustumCulled=false;scene.add(pigeonMesh);
  const pr2=rnd(77);for(const[x,y]of W.pigeons)for(let i=0;i<9;i++){const a=pr2()*6.28,d=0.4+pr2()*2.6;pigeons.push({hx:x+Math.cos(a)*d,hy:y+Math.sin(a)*d,x:x+Math.cos(a)*d,y:y+Math.sin(a)*d,z:0,a:pr2()*6.28,fly:0,vx:0,vy:0,ph:pr2()*10})}
  // spray for the fountain
  fountainParts=[];
  playerRing=new THREE.Mesh(new THREE.RingGeometry(0.55,0.7,24),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0.6}));playerRing.rotation.x=-Math.PI/2;playerRing.position.y=0.12;scene.add(playerRing);
}

/* ---------- cars ---------- */
const carGeoCache=new Map();
let paintMat,glassMat,darkMat,lightMat,carMats;
const tailOff=new THREE.MeshLambertMaterial({color:'#6e1416'}),tailOn=new THREE.MeshBasicMaterial({color:'#ff2a1f'}),revOn=new THREE.MeshBasicMaterial({color:'#ffffff'});
const blueOn=new THREE.MeshBasicMaterial({color:'#5aa2ff'}),blueOff=new THREE.MeshLambertMaterial({color:'#1d3a78'}),redOn=new THREE.MeshBasicMaterial({color:'#ff3b30'});
let beamMat,glareMat,tailGlowMat,sirenGlowB,sirenGlowR,beamGeo,glareGeo,tailGlowGeo,sirenGeo;
function buildCarMaterials(){
  paintMat=new THREE.MeshPhongMaterial({vertexColors:true,shininess:90,specular:new THREE.Color('#5a5a5a'),envMap:envCube,reflectivity:0.2,combine:THREE.MixOperation});
  glassMat=new THREE.MeshPhongMaterial({vertexColors:true,shininess:120,specular:new THREE.Color('#9aa4ad'),envMap:envCube,reflectivity:0.55,combine:THREE.MixOperation});
  darkMat=new THREE.MeshLambertMaterial({vertexColors:true});
  lightMat=new THREE.MeshPhongMaterial({vertexColors:true,shininess:60,emissive:new THREE.Color('#222222')});
  carMats=[paintMat,glassMat,darkMat,lightMat];
  const beamTex=canvasTex(64,128,(g)=>{const gr=g.createLinearGradient(0,128,0,0);gr.addColorStop(0,'rgba(255,240,200,.95)');gr.addColorStop(0.4,'rgba(255,236,190,.4)');gr.addColorStop(1,'rgba(255,230,180,0)');g.fillStyle=gr;g.beginPath();g.moveTo(26,128);g.lineTo(38,128);g.lineTo(64,0);g.lineTo(0,0);g.closePath();g.fill();
    const s=g.createLinearGradient(0,0,64,0);s.addColorStop(0,'rgba(0,0,0,1)');s.addColorStop(0.3,'rgba(0,0,0,0)');s.addColorStop(0.7,'rgba(0,0,0,0)');s.addColorStop(1,'rgba(0,0,0,1)');g.globalCompositeOperation='destination-out';g.fillStyle=s;g.fillRect(0,0,64,128)});
  const dot=(c)=>canvasTex(32,32,(g)=>{const gr=g.createRadialGradient(16,16,0,16,16,16);gr.addColorStop(0,c);gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,32,32)});
  const add={transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0};
  beamMat=new THREE.MeshBasicMaterial(Object.assign({map:beamTex},add));glareMat=new THREE.MeshBasicMaterial(Object.assign({map:dot('rgba(255,248,225,1)')},add));
  tailGlowMat=new THREE.MeshBasicMaterial(Object.assign({map:dot('rgba(255,40,30,1)')},add));
  sirenGlowB=new THREE.MeshBasicMaterial(Object.assign({map:dot('rgba(70,140,255,1)')},add,{opacity:0.8}));sirenGlowR=new THREE.MeshBasicMaterial(Object.assign({map:dot('rgba(255,50,40,1)')},add,{opacity:0.8}));
  beamGeo=new THREE.PlaneGeometry(7,16);beamGeo.rotateX(-Math.PI/2);beamGeo.rotateY(-Math.PI/2);beamGeo.translate(8.2,0,0);
  glareGeo=new THREE.PlaneGeometry(1.1,1.1);tailGlowGeo=new THREE.PlaneGeometry(0.9,0.9);sirenGeo=new THREE.PlaneGeometry(9,9);sirenGeo.rotateX(-Math.PI/2);
}
function shadeHex(hex,f){const c=new THREE.Color(hex);if(f<0)c.multiplyScalar(1+f);else c.lerp(new THREE.Color('#ffffff'),f);return'#'+c.getHexString()}
function lookKey(c){const u=c.up;if(!u)return'';return(u.spoiler?'s'+u.spoiler:'')+(u.kit?'k':'')+(u.stripes?'t':'')+(u.rims?'r'+u.rims:'')+(u.tint?'g':'')}
function carKey(c){const dmg=c.dead?'d':c.hp<c.maxHp*0.4?'h':'';return c.type+c.color+dmg+(c.cop?'p':'')+(c.label||'')+lookKey(c)}
function carGeometry(c){
  const key=carKey(c);let g=carGeoCache.get(key);if(g)return g;
  const t=c.t,L=t.len,Wd=t.wid,H=t.ht,dead=c.dead,worn=!dead&&c.hp<c.maxHp*0.4;
  const U=c.up||{},body=dead?'#2a2724':worn?shadeHex(c.color,-0.25):c.color,glassC=dead?'#111214':U.tint?'#0b0e12':'#2b3946',dark='#18191c',chrome=U.rims==='b'?'#1f2023':U.rims==='g'?'#d4a82a':'#9ca3aa';
  const P=[];const B=(x,y,z,lx,ly,lz,col,grp)=>P.push({g:new THREE.BoxGeometry(lx,ly,lz),color:col,m:tm(x,y,z),grp});
  const T=(x,y,z,L2,H2,W2,inF,inB,inS,col,grp)=>P.push({g:taperBox(L2,H2,W2,inF,inB,inS),color:col,m:tm(x,y,z),grp});
  const ty=c.type;
  const wheel=(x,z,r,w)=>{const wg=new THREE.CylinderGeometry(r,r,w,12);wg.rotateX(Math.PI/2);P.push({g:wg,color:'#141416',m:tm(x,r,z),grp:2});const rg=new THREE.CylinderGeometry(r*0.58,r*0.58,w+0.02,8);rg.rotateX(Math.PI/2);P.push({g:rg,color:dead?'#333':chrome,m:tm(x,r,z),grp:3})};
  const heads=(x,y,zo)=>{if(!dead){B(x,y,zo,0.06,0.14,0.34,'#fff8dc',3);B(x,y,-zo,0.06,0.14,0.34,'#fff8dc',3)}};
  if(ty==='motorrad'){
    wheel(0.72,0,0.33,0.13);wheel(-0.72,0,0.33,0.15);
    B(0,0.58,0,1.15,0.16,0.2,dark,2);T(0.12,0.62,0,0.72,0.3,0.36,0.18,0.12,0.06,body,0);B(-0.4,0.84,0,0.72,0.12,0.3,'#1a1a1a',2);
    B(0.66,0.78,0,0.08,0.66,0.09,chrome,3);B(0.58,1.1,0,0.08,0.06,0.72,dark,2);B(-0.78,0.72,0,0.42,0.1,0.22,body,0);B(-0.2,0.42,0.14,0.7,0.12,0.1,chrome,3);
    if(!dead)B(0.8,0.95,0,0.1,0.14,0.18,'#fff8dc',3);
    g=mergeGeos(P);carGeoCache.set(key,g);return g;
  }
  if(ty==='miltruck'){const cl=0.55,cabL=2.2,olive=body,tarp=dead?'#2a2724':'#5c6447';
    T(L/2-cabL/2,cl,0,cabL,H-cl-0.55,Wd,0.3,0,0.06,olive,0);T(L/2-cabL/2+0.3,cl+1.2,0,cabL-0.7,0.75,Wd-0.12,0.35,0,0.06,glassC,1);
    B(-cabL/2,cl+0.45,0,L-cabL,0.4,Wd,dark,2);B(-cabL/2,cl+1.6,0,L-cabL-0.1,1.9,Wd-0.05,tarp,0);
    for(let x=-L/2+0.8;x<L/2-cabL-0.2;x+=1.3)for(const sd of[1,-1])B(x,cl+1.6,sd*(Wd/2-0.01),0.08,1.9,0.03,shadeHex(tarp,-0.2),0);
    B(L/2+0.01,cl+0.35,0,0.08,0.35,Wd-0.1,dark,2);heads(L/2+0.03,cl+0.7,Wd/2-0.35);
    for(const x of[L/2-1.2,-L/2+1.3,-L/2+2.5])for(const sd of[1,-1])wheel(x,sd*(Wd/2-0.22),0.55,0.4);
    g=mergeGeos(P);carGeoCache.set(key,g);return g}
  if(ty==='bus'||ty==='bierlaster'||ty==='feuerwehr'){
    const cl=0.42;
    if(ty==='bus'){T(0,cl,0,L,H-cl,Wd,0.2,0.05,0.03,body,0);
      for(const sd of[1,-1]){B(0.25,cl+1.6,sd*(Wd/2+0.004),L-1.6,0.95,0.02,glassC,1);B(0,cl+0.55,sd*(Wd/2+0.004),L-0.4,0.18,0.02,'#f2f2f2',0)}
      B(L/2+0.004,cl+1.45,0,0.02,1.35,Wd-0.3,glassC,1);B(L/2+0.006,H-0.28,0,0.02,0.3,Wd*0.62,'#f7c600',3);
      B(L/2-1.7,cl+1.05,Wd/2+0.01,1.15,2.0,0.02,'#26292e',2);B(-0.4,cl+1.05,Wd/2+0.01,1.15,2.0,0.02,'#26292e',2);B(0,H+0.03,0,L-0.8,0.08,Wd-0.4,'#e6e6e6',0);
      for(const x of[L/2-2.2,-L/2+2.4])for(const sd of[1,-1])wheel(x,sd*(Wd/2-0.18),0.5,0.32)}
    else{
      const cabC=ty==='feuerwehr'?body:'#1f4f8a',cabL=2.3;
      T(L/2-cabL/2,cl,0,cabL,H-cl-0.3,Wd,0.35,0,0.05,cabC,0);T(L/2-cabL/2+0.25,cl+1.25,0,cabL-0.6,1.0,Wd-0.1,0.4,0,0.06,glassC,1);
      if(ty==='bierlaster'){B(-cabL/2+0.05,cl+1.5,0,L-cabL-0.2,2.7,Wd,body,0);for(const sd of[1,-1]){for(let i=0;i<8;i++)B(-cabL/2-L/2+cabL+0.6+i*0.72,cl+1.5,sd*(Wd/2+0.006),0.62,0.62,0.02,i%2?'#2a6fd1':'#f2efe4',0);B(-cabL/2+0.05,cl+2.55,sd*(Wd/2+0.006),L-cabL-0.4,0.18,0.02,'#2a6fd1',0)}}
      else{B(-cabL/2+0.05,cl+1.3,0,L-cabL-0.2,2.3,Wd,body,0);for(const sd of[1,-1]){B(-cabL/2,cl+0.85,sd*(Wd/2+0.006),L-cabL,0.16,0.02,'#f2f2f2',0);for(let i=0;i<3;i++)B(-cabL/2-1.6+i*1.6,cl+1.65,sd*(Wd/2+0.006),1.3,1.1,0.02,'#a9adb3',3)}
        for(const sd of[1,-1])B(-0.5,H+0.12,sd*0.45,L-1.4,0.1,0.1,'#c7ccd2',3);for(let x=-L/2+0.9;x<L/2-1.6;x+=0.55)B(x,H+0.12,0,0.06,0.08,0.9,'#c7ccd2',3)}
      for(const x of[L/2-1.25,-L/2+1.5,-L/2+2.7])for(const sd of[1,-1])wheel(x,sd*(Wd/2-0.2),0.5,0.32)}
    B(L/2+0.01,cl+0.3,0,0.06,0.3,Wd-0.1,dark,2);heads(L/2+0.02,cl+0.6,Wd/2-0.35);
    g=mergeGeos(P);carGeoCache.set(key,g);return g;
  }
  const sport=ty==='sport'||ty==='super',suv=ty==='suv'||ty==='polsuv',van=ty==='transporter'||ty==='krankenwagen';
  const clear=ty==='super'?0.2:sport?0.26:suv?0.46:0.32,bh=ty==='super'?0.42:sport?0.5:suv?0.7:0.58;   // ground clearance, body height
  if(van){
    const tall=ty==='krankenwagen';
    T(0,clear,0,L,1.05,Wd,0.25,0.05,0.04,body,0);
    B(tall?-0.5:-0.35,clear+1.05+(tall?0.9:0.55),0,L-(tall?1.4:0.9),tall?1.8:1.1,Wd-0.04,body,0);
    T(L/2-0.62,clear+1.05,0,0.9,1.0,Wd-0.12,0.55,0,0.08,glassC,1);
    if(!tall){B(-0.35,clear+1.5,Wd/2-0.01,L*0.12,0.5,0.03,glassC,1);B(-0.35,clear+1.5,-(Wd/2-0.01),L*0.12,0.5,0.03,glassC,1)}
    else{for(const sd of[1,-1]){B(-0.2,clear+0.95,sd*(Wd/2+0.005),L-0.4,0.26,0.02,'#d42a22',0);B(-0.2,clear+1.32,sd*(Wd/2+0.005),L-0.4,0.08,0.02,'#f2b705',0)}B(-0.7,H+0.01,0,1.0,0.02,0.28,'#d42a22',0);B(-0.7,H+0.01,0,0.28,0.02,1.0,'#d42a22',0)}
  }else{
    T(0,clear,0,L,bh,Wd,ty==='super'?0.5:0.22,0.12,0.06,body,0);                                // lower body
    const cl=ty==='super'?L*0.34:sport?L*0.4:suv?L*0.56:L*0.5,cx=ty==='super'?-L*0.12:sport?-L*0.08:suv?-L*0.06:-L*0.05,chh=H-clear-bh-0.06;
    T(cx,clear+bh,0,cl,chh,Wd-0.12,cl*(suv?0.22:0.36),cl*(suv?0.08:0.2),suv?0.1:0.16,glassC,1);               // glasshouse
    T(cx-cl*0.04,clear+bh+chh-0.02,0,cl*(suv?0.68:0.5),0.07,Wd-0.48,0.05,0.05,0.04,dead?'#333':shadeHex(body,0.05),0); // roof
    B(cx+cl*0.02,clear+bh+chh*0.5,Wd/2-0.17,0.12,chh*0.9,0.04,body,0);B(cx+cl*0.02,clear+bh+chh*0.5,-(Wd/2-0.17),0.12,chh*0.9,0.04,body,0); // B-pillars
    if(sport)B(-L/2+0.22,clear+bh+(ty==='super'?0.3:0.18),0,0.3,0.06,Wd-0.16,dark,2),B(-L/2+0.3,clear+bh+0.1,Wd/2-0.3,0.06,0.22,0.06,dark,2),B(-L/2+0.3,clear+bh+0.1,-(Wd/2-0.3),0.06,0.22,0.06,dark,2);
    if(ty==='super')for(const sd of[1,-1])B(-L*0.1,clear+0.3,sd*(Wd/2+0.004),L*0.22,0.2,0.02,dark,2);
    if(suv)for(const sd of[1,-1])B(cx,H+0.05,sd*(Wd/2-0.3),cl*0.7,0.05,0.05,dark,2);
  }
  // bumpers, grille, skirts, mirrors, plates
  B(L/2-0.04,clear+0.12,0,0.14,0.24,Wd-0.06,dark,2);B(-L/2+0.04,clear+0.12,0,0.14,0.24,Wd-0.06,dark,2);
  B(L/2-0.005,clear+0.36,0,0.04,0.14,Wd*0.42,dark,2);
  B(0,clear+0.04,Wd/2-0.02,L*0.6,0.1,0.04,dark,2);B(0,clear+0.04,-(Wd/2-0.02),L*0.6,0.1,0.04,dark,2);
  if(!van){const mx=sport?L*0.12:L*0.15,my=clear+bh+0.12;B(mx,my,Wd/2+0.08,0.14,0.1,0.16,body,0);B(mx,my,-(Wd/2+0.08),0.14,0.1,0.16,body,0)}
  B(L/2+0.01,clear+0.15,0,0.02,0.11,0.5,'#e9e9e2',3);B(-L/2-0.01,clear+0.2,0,0.02,0.11,0.5,'#e9e9e2',3);
  // door seams
  B(L*0.05,clear+bh*0.55,Wd/2+0.002,0.03,bh*0.75,0.01,shadeHex(body,-0.35),0);B(L*0.05,clear+bh*0.55,-(Wd/2+0.002),0.03,bh*0.75,0.01,shadeHex(body,-0.35),0);
  // wheels with rims
  const wr=suv?0.4:0.34;for(const sx of[1,-1])for(const sz of[1,-1])wheel(sx*(L/2-0.82),sz*(Wd/2-0.1),wr,suv?0.3:0.24);
  heads(L/2-0.02,clear+0.38,Wd/2-0.28);
  if(c.cop&&!dead&&(ty==='polizei'||ty==='polsuv')){B(0,clear+0.38,Wd/2+0.004,L*0.82,0.16,0.02,'#2a5bd7',0);B(0,clear+0.38,-Wd/2-0.004,L*0.82,0.16,0.02,'#2a5bd7',0);B(L*0.3,clear+bh+0.002,0,L*0.3,0.01,Wd*0.5,'#2a5bd7',0)}
  if(ty==='taxi'&&!dead)B(-L*0.06,H+0.13,0,0.35,0.22,0.7,'#f7d24a',3);
  if(c.label==='SEK'&&!dead){B(0,2.46,0,L*0.6,0.03,Wd*0.6,'#e9eef5',0)}
  // workshop looks: spoiler / GT wing, body kit, racing stripes
  if(!van){const top=clear+bh,carbon='#141518';
    if(U.spoiler===1)T(-L/2+0.3,top,0,0.5,0.07,Wd-0.3,0.0,0.12,0.02,dead?dark:body,0);
    if(U.spoiler===2){for(const sd of[1,-1])B(-L/2+0.42,top+0.2,sd*(Wd/2-0.42),0.12,0.4,0.06,carbon,2);T(-L/2+0.4,top+0.4,0,0.62,0.07,Wd-0.12,0.08,0.02,0,carbon,2);for(const sd of[1,-1])B(-L/2+0.4,top+0.42,sd*(Wd/2-0.05),0.66,0.2,0.03,dead?dark:body,0)}
    if(U.kit){B(L/2+0.06,clear+0.02,0,0.3,0.05,Wd+0.04,carbon,2);for(const sd of[1,-1])B(0,clear+0.05,sd*(Wd/2+0.03),L*0.62,0.13,0.07,shadeHex(body,-0.3),0);B(-L/2-0.04,clear+0.06,0,0.18,0.1,Wd-0.3,carbon,2);for(const zz of[-0.45,-0.15,0.15,0.45])B(-L/2-0.08,clear+0.1,zz*Wd/1.8,0.16,0.12,0.03,carbon,2);
      for(const sx of[1,-1])for(const sz of[1,-1])B(sx*(L/2-0.82),clear+0.42,sz*(Wd/2+0.01),0.95,0.08,0.06,carbon,2)}
    if(U.stripes&&!dead){const sc=new THREE.Color(body).getHSL({h:0,s:0,l:0}).l>0.55?'#17181b':'#f4f2ea';const cl2=ty==='super'?L*0.34:sport?L*0.4:suv?L*0.56:L*0.5,cx2=ty==='super'?-L*0.12:sport?-L*0.08:suv?-L*0.06:-L*0.05,chh2=H-clear-bh-0.06;
      for(const zz of[-0.16,0.16]){B(cx2+cl2/2+(L/2-cx2-cl2/2)/2,top+0.006,zz,L/2-cx2-cl2/2,0.012,0.18,sc,0);B(cx2-cl2/2+(-L/2-cx2+cl2/2)/2,top+0.006,zz,cx2-cl2/2+L/2,0.012,0.18,sc,0);B(cx2-cl2*0.04,top+chh2+0.056,zz,cl2*(suv?0.68:0.5),0.012,0.18,sc,0)}}}
  g=mergeGeos(P);carGeoCache.set(key,g);return g;
}
const riderGeo=mergeGeos([{g:new THREE.BoxGeometry(0.34,0.62,0.44),color:'#ffffff',m:tm(-0.25,1.25,0,0,1,1,1,-0.35)},{g:new THREE.BoxGeometry(0.5,0.16,0.14),color:'#ffffff',m:tm(0.12,1.28,0.2,0,1,1,1,-0.5)},{g:new THREE.BoxGeometry(0.5,0.16,0.14),color:'#ffffff',m:tm(0.12,1.28,-0.2,0,1,1,1,-0.5)},
  {g:new THREE.BoxGeometry(0.5,0.18,0.16),color:'#2a3048',m:tm(-0.05,0.86,0.17)},{g:new THREE.BoxGeometry(0.5,0.18,0.16),color:'#2a3048',m:tm(-0.05,0.86,-0.17)},{g:new THREE.BoxGeometry(0.14,0.5,0.14),color:'#2a3048',m:tm(0.2,0.62,0.22)},{g:new THREE.BoxGeometry(0.14,0.5,0.14),color:'#2a3048',m:tm(0.2,0.62,-0.22)},
  {g:new THREE.SphereGeometry(0.19,10,8),color:'#1d1f22',m:tm(-0.08,1.7,0)}]);
const tailGeo=mergeGeos([{g:new THREE.BoxGeometry(0.06,0.14,0.34),color:'#fff',m:tm(0,0,0.62)},{g:new THREE.BoxGeometry(0.06,0.14,0.34),color:'#fff',m:tm(0,0,-0.62)}]);
const barGeoL=new THREE.BoxGeometry(0.3,0.16,0.55),barGeoR=new THREE.BoxGeometry(0.3,0.16,0.55);
// crash damage: bend the body where it was hit (front/back pushed in, hood buckled, doors dented), scrape the paint, shatter glass
const dentKey=c=>{const d=c.dmg;if(!d||c.t.bike)return'';const q=[0,1,2,3].map(i=>Math.round(d[i]*6));return q.some(v=>v>0)?'|'+q.join('')+Math.round((d[4]||0)*3)+Math.round((d[5]||0)*3):''};
function dentGeometry(base,c){
  const g=base.clone(),pos=g.attributes.position,col=g.attributes.color.clone();g.setAttribute('color',col);const d=c.dmg,L2=c.t.len/2,W2=c.t.wid/2,H=c.t.ht;
  const zf=Math.min(c.t.len*0.34,1.7),zs=W2*0.85,seed=(c.id|0)*7.13+1;
  const hsh=(x,y,z)=>{const v=Math.sin(Math.round(x*16)*12.9898+Math.round(y*16)*78.233+Math.round(z*16)*37.719+seed)*43758.5453;return v-Math.floor(v)-0.5};
  let glassS=-1,glassE=-1;for(const gr of g.groups)if(gr.materialIndex===1){glassS=gr.start;glassE=gr.start+gr.count}
  for(let i=0;i<pos.count;i++){const x0=pos.getX(i),y0=pos.getY(i),z0=pos.getZ(i);let x=x0,y=y0,z=z0,scr=0;const yr=Math.max(0,Math.min(1,y0/H)),h=hsh(x0,y0,z0),h2=hsh(z0,x0,y0);
    if(d[0]>0&&x0>L2-zf){const t=(x0-(L2-zf))/zf,k=d[0]*t;x-=k*0.85*t;y-=d[0]*0.34*t*yr;y+=h*0.22*k;z+=h2*0.16*k;z*=1-d[0]*0.07*t;scr=Math.max(scr,k)}
    if(d[1]>0&&x0<-L2+zf){const t=(-L2+zf-x0)/zf,k=d[1]*t;x+=k*0.7*t;y-=d[1]*0.24*t*yr;y+=h*0.18*k;z+=h2*0.14*k;z*=1-d[1]*0.06*t;scr=Math.max(scr,k)}
    if(d[2]>0&&z0<-W2+zs){const t=(-W2+zs-z0)/zs,b=Math.exp(-Math.pow((x0/L2-(d[4]||0))/0.5,2)),k=d[2]*t*b;z+=k*0.46;y-=k*0.1;x+=h*0.14*k;y+=h2*0.11*k;scr=Math.max(scr,k)}
    if(d[3]>0&&z0>W2-zs){const t=(z0-(W2-zs))/zs,b=Math.exp(-Math.pow((x0/L2-(d[5]||0))/0.5,2)),k=d[3]*t*b;z-=k*0.46;y-=k*0.1;x+=h*0.14*k;y+=h2*0.11*k;scr=Math.max(scr,k)}
    pos.setXYZ(i,x,y,z);
    if(scr>0.05){const isGlass=i>=glassS&&i<glassE;if(isGlass&&scr>0.35){const w=0.55+h*0.3;col.setXYZ(i,w,w*1.03,w*1.06)}else if(!isGlass){const f=1-Math.min(0.42,scr*0.45)+h*0.08*scr;col.setXYZ(i,col.getX(i)*f,col.getY(i)*f,col.getZ(i)*f)}}}
  g.computeVertexNormals();g.computeBoundingSphere();return g}
function carBodyGeo(c){const base=carGeometry(c);return dentKey(c)?dentGeometry(base,c):base}
const carObjs=new Map();
function carObj(c){
  let o=carObjs.get(c.id);
  const key=carKey(c)+dentKey(c);
  if(o&&o.key!==key){if(o.dented)o.body.geometry.dispose();o.body.geometry=carBodyGeo(c);o.dented=!!dentKey(c);o.key=key;if(o.barL&&(c.dead||!((c.cop&&!c.mil)||c.t.emerg))){o.g.remove(o.barL,o.barR,o.sirB,o.sirR);o.barL=o.barR=null}}
  if(o)return o;
  const g=new THREE.Group();const body=new THREE.Mesh(carBodyGeo(c),carMats);body.castShadow=true;body.receiveShadow=true;g.add(body);
  const clear=c.type==='sport'?0.26:0.32;
  const tail=new THREE.Mesh(tailGeo,tailOff);tail.position.set(-c.t.len/2-0.01,clear+0.42,0);tail.scale.set(1,1,(c.t.wid/2-0.3)/0.62);g.add(tail);
  // night lights
  const beam=new THREE.Mesh(beamGeo,beamMat);beam.position.set(c.t.len/2-0.2,0.12,0);beam.renderOrder=4;g.add(beam);
  const gl1=new THREE.Mesh(glareGeo,glareMat),gl2=new THREE.Mesh(glareGeo,glareMat);gl1.position.set(c.t.len/2+0.05,clear+0.4,c.t.wid/2-0.28);gl2.position.set(c.t.len/2+0.05,clear+0.4,-(c.t.wid/2-0.28));gl1.rotation.y=gl2.rotation.y=Math.PI/2;g.add(gl1,gl2);
  const tg1=new THREE.Mesh(tailGlowGeo,tailGlowMat),tg2=new THREE.Mesh(tailGlowGeo,tailGlowMat);tg1.position.set(-c.t.len/2-0.06,clear+0.42,c.t.wid/2-0.3);tg2.position.set(-c.t.len/2-0.06,clear+0.42,-(c.t.wid/2-0.3));tg1.rotation.y=tg2.rotation.y=-Math.PI/2;g.add(tg1,tg2);
  if(c.t.bike){g.remove(tail,beam,gl1,gl2,tg1,tg2);tail.position.set(-1.0,0.8,0);tail.scale.set(1,0.4,0.16);body.add(tail);beam.position.set(0.9,0.12,0);beam.scale.set(0.8,1,0.5);body.add(beam);
    gl1.position.set(0.86,0.95,0);body.add(gl1);tg1.position.set(-1.03,0.8,0);tg1.scale.set(0.6,0.6,0.6);body.add(tg1)}
  const lights=c.t.bike?[beam,gl1,tg1]:[beam,gl1,gl2,tg1,tg2];
  let barL=null,barR=null,sirB=null,sirR=null;if((c.cop&&!c.mil)||c.t.emerg){barL=new THREE.Mesh(barGeoL,blueOff);barR=new THREE.Mesh(barGeoR,blueOff);const y=c.t.ht+0.1;barL.position.set(-c.t.len*0.04,y,0.32);barR.position.set(-c.t.len*0.04,y,-0.32);g.add(barL,barR);
    sirB=new THREE.Mesh(sirenGeo,sirenGlowB);sirB.position.set(0,0.16,2.2);sirR=new THREE.Mesh(sirenGeo,c.t.emerg?sirenGlowB:sirenGlowR);sirR.position.set(0,0.16,-2.2);sirB.renderOrder=sirR.renderOrder=4;g.add(sirB,sirR)}
  let bomb=null;if(c.bomb){bomb=new THREE.Mesh(new THREE.SphereGeometry(0.22,8,6),redOn);bomb.position.set(0,c.t.ht+0.25,0);g.add(bomb)}
  let rider=null;if(c.t.bike){rider=new THREE.Mesh(riderGeo,new THREE.MeshLambertMaterial({vertexColors:true,color:'#c0392b'}));rider.castShadow=true;body.add(rider)}
  scene.add(g);o={g,body,tail,barL,barR,sirB,sirR,bomb,key,lights,rider,dented:!!dentKey(c)};carObjs.set(c.id,o);return o;
}
const neonGeo=new THREE.PlaneGeometry(2,2);neonGeo.rotateX(-Math.PI/2);const neonMats={};
function neonMat(k){return neonMats[k]||(neonMats[k]=new THREE.MeshBasicMaterial({map:canvasTex(64,64,(g)=>{const gr=g.createRadialGradient(32,32,2,32,32,32);const c=k==='p'?'255,60,200':'60,170,255';gr.addColorStop(0,'rgba('+c+',1)');gr.addColorStop(0.55,'rgba('+c+',.55)');gr.addColorStop(1,'rgba('+c+',0)');g.fillStyle=gr;g.fillRect(0,0,64,64)}),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}))}
const blobMat=new THREE.MeshBasicMaterial({color:'#000',transparent:true,opacity:0.3,depthWrite:false});const blobGeo=new THREE.CircleGeometry(1,20);blobGeo.rotateX(-Math.PI/2);
function poseHeliVeh(c,alive){
  alive.add(c.id);let o=carObjs.get(c.id);
  if(!o||o.key!=='heli'){if(o){scene.remove(o.g);if(o.blob)scene.remove(o.blob)}const H=makeHeliModel({body:'#3b4a3a',belly:'#2c352b',armed:true});H.g.position.y=1.65;const g=new THREE.Group();g.add(H.g);scene.add(g);o={g,key:'heli',H,spin:0,plane:true};carObjs.set(c.id,o)}
  o.g.visible=true;o.g.position.set(c.x-Math.cos(c.a)*0,(c.z||0)-(c.sink?Math.min(4,c.sink*2):0),c.y);o.g.rotation.set(c.roll||0,-c.a,c.pitch||0,'YZX');
  const thr=c.dead?0.3:c.remote?((c.z||0)>0.5?1:0.4):(c.thr||0);o.spin+=thr*40*(1/60);o.H.rotor.rotation.y=o.spin;o.H.tail.rotation.z=o.spin*1.4;
  const fast=thr>0.5;o.H.rotor.userData.disc.visible=fast;for(const a of o.H.rotor.children)if(a!==o.H.rotor.userData.disc)a.visible=!fast||Math.floor(o.spin*3)%2===0;
  o.H.blink.visible=Math.floor(S.G.time*2)%2===0;
  if(c.dead){o.g.traverse(m=>{if(m.isMesh&&m.material&&m.material.color&&!m.userData.burnt){m.material=m.material.clone();m.material.color.multiplyScalar(0.25);m.userData.burnt=true}})}
}
function tankGeos(col,dead){const body=dead?'#2a2724':col,dark='#22251d',wh='#2d3027',H=[],Tu=[];const a=(arr,geo,color,m)=>arr.push({g:geo,color,m});
  a(H,new THREE.BoxGeometry(6.9,0.9,2.4),body,tm(0,0.95,0));a(H,taperBox(7.5,0.65,3.5,1.1,0.35,0.05),body,tm(0,1.35,0));
  for(const sd of[1,-1]){a(H,new THREE.BoxGeometry(7.3,1.0,0.78),dark,tm(0,0.55,sd*1.38));for(let k=0;k<6;k++){const w=new THREE.CylinderGeometry(0.4,0.4,0.82,12);w.rotateX(Math.PI/2);a(H,w,wh,tm(-2.8+k*1.12,0.45,sd*1.38))}
    a(H,new THREE.BoxGeometry(6.8,0.45,0.08),body,tm(-0.1,1.12,sd*1.8));a(H,new THREE.BoxGeometry(0.5,0.12,0.5),'#d9cc7a',tm(3.55,1.45,sd*1.25))}
  a(Tu,taperBox(3.8,0.95,2.9,0.7,0.25,0.3),body,tm(0.1,0,0));a(Tu,new THREE.BoxGeometry(1.2,0.45,0.95),body,tm(-1.1,1.1,0.55));a(Tu,new THREE.CylinderGeometry(0.4,0.42,0.3,12),dark,tm(-0.4,1.05,-0.6));
  const bar=new THREE.CylinderGeometry(0.11,0.15,5.0,10);bar.rotateZ(-Math.PI/2);a(Tu,bar,body,tm(4.3,0.5,0));const mz=new THREE.CylinderGeometry(0.18,0.18,0.5,10);mz.rotateZ(-Math.PI/2);a(Tu,mz,dark,tm(6.7,0.5,0));
  a(Tu,new THREE.BoxGeometry(1.4,0.5,0.12),dark,tm(-1.6,0.55,1.48));a(Tu,new THREE.BoxGeometry(1.4,0.5,0.12),dark,tm(-1.6,0.55,-1.48));
  return{hull:mergeGeos(H),tur:mergeGeos(Tu)}}
const tankCache=new Map();
function poseTankVeh(c,alive){
  alive.add(c.id);const key='tank'+c.color+(c.dead?'d':'');let o=carObjs.get(c.id);
  if(!o||o.key!==key){if(o)scene.remove(o.g);let G2=tankCache.get(key);if(!G2){G2=tankGeos(c.color,c.dead);tankCache.set(key,G2)}const g=new THREE.Group();const hull=new THREE.Mesh(G2.hull,pedMat);hull.castShadow=true;hull.receiveShadow=true;g.add(hull);
    const tur=new THREE.Group();const tm2=new THREE.Mesh(G2.tur,pedMat);tm2.castShadow=true;tur.add(tm2);tur.position.set(-0.3,1.95,0);g.add(tur);scene.add(g);o={g,key,tur};carObjs.set(c.id,o)}
  const sinkY=c.sink?-Math.min(1.8,c.sink*1.2):0;o.g.position.set(c.x,sinkY+(c.z||0),c.y);o.g.rotation.set(0,-c.a,0);o.tur.rotation.y=-(c.tur||0);
}
function posePlaneVeh(c,alive){
  if(c.t.plane.heli){poseHeliVeh(c,alive);return}
  alive.add(c.id);const cls=c.cls||c.t.plane.cls,key='pl'+cls+(c.liv||'isar');let o=carObjs.get(c.id);
  if(!o||o.key!==key){if(o){scene.remove(o.g);if(o.blob)scene.remove(o.blob)}const g=planeObject(cls,c.liv||'isar');scene.add(g);const blob=new THREE.Mesh(blobGeo,blobMat.clone());blob.renderOrder=3;scene.add(blob);o={g,key,blob,plane:true,spin:0};carObjs.set(c.id,o)}
  o.g.visible=!c.dead||!!c.wreck;o.blob.visible=!c.dead&&(c.z||0)>30;
  o.g.position.set(c.x,(c.z||0)-(c.sink?Math.min(4,c.sink*2):0),c.y);o.g.rotation.set(c.roll||0,-c.a,c.pitch||0,'YZX');
  const thr=c.driver==='player'||c.remote?Math.max(c.thr||0,Math.min(1,(c.spd||0)/30)):0;o.spin+=(thr*45+(thr>0?8:0))*(1/60);
  for(const h of o.g.userData.props){h.rotation.x=o.spin;const fast=thr>0.25;h.userData.disc.visible=fast;for(const a of h.children)if(a!==h.userData.disc)a.visible=!fast}
  if(o.blob.visible){const z=c.z||0,sc=c.t.len*0.3;o.blob.scale.set(sc,1,sc*0.7);o.blob.position.set(c.x,0.12,c.y);o.blob.rotation.y=-c.a;o.blob.material.opacity=clamp(0.22-z/1400,0.06,0.2)}
}
function poseCar(c,alive){
  if(c.t.plane){posePlaneVeh(c,alive);return}
  if(c.t.tank){poseTankVeh(c,alive);return}
  alive.add(c.id);const o=carObj(c);
  const sinkY=c.sink?-Math.min(1.8,c.sink*1.2):0;o.g.position.set(c.x,sinkY+(c.z||0)+W.hillAt(c.x,c.y)+(c.layer==='low'?0:W.bridgeH(c.x,c.y)),c.y);
  const pitch=c.air?clamp(c.vz*0.035,-0.45,0.4):(c.pitch||0);o.g.rotation.set(c.sink?Math.min(0.5,c.sink*0.4):0,-c.a,pitch);
  o.body.rotation.x=c.t.bike?clamp((c.av||0)*Math.abs(c.vf||0)*0.05,-0.55,0.55):clamp(-(c.vl||0)*0.012,-0.08,0.08);
  if(o.rider){o.rider.visible=!!(c.driver||c.remote)&&!c.dead;if(o.rider.visible)o.rider.material.color.set(c.driver==='player'?S.player.shirt:c.remote?'#ff8a1c':['#c0392b','#2c3e70','#1d1f22','#5b6b4a'][c.id%4])}
  if(c.alarm>0){const on=Math.floor(S.G.time*4)%2===0;for(const l of o.lights)l.visible=on;if(on){glareMat.opacity=Math.max(glareMat.opacity,0.8)}}
  o.body.rotation.z=clamp(-(c.acc||0)*0.004,-0.03,0.03);
  o.tail.material=c.dead?tailOff:c.rev?revOn:c.brake?tailOn:tailOff;
  const lit=!c.dead&&!c.sink&&(c.driver||c.remote)&&ENV.night+ENV.rain*0.4>0.12;
  for(const l of o.lights)l.visible=!!lit;
  if(lit){const k=c.brake?1.6:1;for(const j of o.lights.length===3?[2]:[3,4])if(o.lights[j])o.lights[j].scale.setScalar(k)}
  if(o.barL){const on=c.siren&&Math.floor(S.G.time*8)%2===0;o.barL.material=c.siren?(on?blueOn:blueOff):blueOff;o.barR.material=c.siren?(!on?blueOn:blueOff):blueOff;
    o.sirB.visible=!!c.siren&&on;o.sirR.visible=!!c.siren&&!on;const k=0.35+0.65*ENV.night;sirenGlowB.opacity=sirenGlowR.opacity=0.75*k}
  if(o.bomb)o.bomb.visible=Math.floor(S.G.time*4)%2===0;
  {const nn=c.up&&c.up.neon;if(nn&&!o.neon){o.neon=new THREE.Mesh(neonGeo,neonMat(nn));o.neon.scale.set(c.t.len*0.62,1,c.t.wid*0.75);o.neon.position.y=0.06;o.neon.renderOrder=3;o.g.add(o.neon);o.neonC=nn}
   if(o.neon){if(o.neonC!==nn&&nn){o.neon.material=neonMat(nn);o.neonC=nn}o.neon.visible=!!nn&&!c.dead&&!c.sink;if(o.neon.visible)o.neon.material.opacity=0.35+0.6*ENV.night}}
  if(c.burn>0&&!o.burnTint){o.burnTint=true}
}
function syncCars(){
  const f=camFocus();const alive=new Set();
  for(const c of S.cars){if(Math.abs(c.x-f.x)>230||Math.abs(c.y-f.y)>230)continue;poseCar(c,alive)}
  for(const c of IH.remote.cars){if(Math.abs(c.x-f.x)>300||Math.abs(c.y-f.y)>300)continue;poseCar(c,alive)}
  for(const[id,o]of carObjs){if(!alive.has(id)){scene.remove(o.g);if(o.blob)scene.remove(o.blob);if(o.dented)o.body.geometry.dispose();carObjs.delete(id)}}
}

/* ---------- peds ---------- */
const pedGeoCache=new Map();const pedMat=new THREE.MeshLambertMaterial({vertexColors:true});
const SKIN=['#e9c3a0','#c99a72','#8d5a3b','#f1d0b4'];
const PANTS=['#2a3550','#3b3b40','#5a4a3a','#24262b','#4a5a6e','#6b5b45'];
function pedLook(p){const idn=typeof p.id==='number'?p.id:(p.skin||0);
  return{skin:p.kind==='cop'?(p.mil?SKIN[idn%4]:'#e2b99a'):SKIN[idn%4],pants:p.mil?'#3f4a33':p.kind==='cop'?'#1a2840':p.kind==='player'?'#2d3a56':PANTS[idn%PANTS.length],shoe:p.kind==='cop'?'#111':['#222','#3a2a1e','#ddd','#444'][idn%4],
    long:p.kind==='cop'||p.kind==='player'||idn%3===0,female:p.kind==='civ'&&idn%2===1,idn}}
const cyl=(rt,rb,h,seg)=>new THREE.CylinderGeometry(rt,rb,h,seg||8);
function pedGeometry(p){
  const L=pedLook(p);const key='b'+p.shirt+p.hair+p.kind+L.skin+L.pants+L.female+(p.mil?'m':'');let g=pedGeoCache.get(key);if(g)return g;
  const sk=L.skin,P=[];const add=(geo,color,m)=>P.push({g:geo,color,m});
  add(cyl(0.135,0.15,0.2,10),L.pants,tm(0,0.97,0,0,0.75,1,1.3));                                   // hips
  const tor=cyl(L.female?0.165:0.185,L.female?0.14:0.155,0.56,12);add(tor,p.shirt,tm(0,1.33,0,0,0.62,1,1.18));       // torso
  for(const sd of[1,-1])add(new THREE.SphereGeometry(0.095,8,6),p.shirt,tm(0,1.56,sd*0.2));            // shoulders
  add(cyl(0.05,0.058,0.12,8),sk,tm(0,1.64,0));                                                      // neck
  add(new THREE.SphereGeometry(0.112,14,10),sk,tm(0.005,1.775,0,0,0.96,1.12,0.9));                // head
  add(new THREE.BoxGeometry(0.04,0.05,0.035),sk,tm(0.112,1.76,0));                                  // nose
  for(const sd of[1,-1]){add(new THREE.BoxGeometry(0.012,0.018,0.025),'#1d1a18',tm(0.103,1.795,sd*0.042));add(new THREE.SphereGeometry(0.025,6,4),sk,tm(-0.005,1.77,sd*0.102))}
  if(p.mil){add(new THREE.SphereGeometry(0.142,14,8,0,Math.PI*2,0,Math.PI*0.52),'#3d4a32',tm(-0.005,1.8,0,0,1.05,0.95,1.02));add(cyl(0.15,0.15,0.03,14),'#343f2b',tm(-0.005,1.79,0));
    add(new THREE.BoxGeometry(0.3,0.32,0.4),'#3f4a33',tm(0,1.36,0));add(cyl(0.165,0.165,0.05,12),'#2a2f22',tm(0,1.06,0,0,0.75,1,1.3))}
  else if(p.kind==='cop'){add(cyl(0.122,0.118,0.08,14),'#14223a',tm(-0.005,1.885,0));add(new THREE.BoxGeometry(0.11,0.015,0.2),'#0d1626',tm(0.1,1.852,0));add(new THREE.BoxGeometry(0.04,0.03,0.06),'#d6b13c',tm(0.115,1.89,0));
    add(new THREE.BoxGeometry(0.02,0.06,0.07),'#d6b13c',tm(0.115,1.42,0.09));add(cyl(0.165,0.165,0.05,12),'#111',tm(0,1.06,0,0,0.75,1,1.3))}
  else{add(new THREE.SphereGeometry(0.122,14,8,0,Math.PI*2,0,Math.PI*0.55),p.hair,tm(-0.012,1.79,0,0,1,1.02,0.97));
    if(L.female)add(new THREE.BoxGeometry(0.07,0.26,0.2),p.hair,tm(-0.08,1.67,0));else add(new THREE.BoxGeometry(0.05,0.08,0.18),p.hair,tm(-0.085,1.74,0))}
  if(p.kind==='player'){add(cyl(0.165,0.165,0.05,12),'#2a2a2e',tm(0,1.06,0,0,0.75,1,1.3));add(new THREE.BoxGeometry(0.02,0.42,0.02),'#d8d8d8',tm(0.118,1.33,0))}
  if(L.female&&p.kind==='civ'&&L.idn%4===1)add(cyl(0.16,0.24,0.36,12),p.shirt,tm(0,0.9,0,0,0.8,1,1.2));  // skirt
  g=mergeGeos(P);pedGeoCache.set(key,g);return g;
}
function limbGeometry(kind,a,b,c){const key=kind+a+b+c;let g=pedGeoCache.get(key);if(g)return g;const P=[];const add=(geo,color,m)=>P.push({g:geo,color,m});
  if(kind==='uarm'){add(cyl(0.062,0.055,0.31,8),a,tm(0,-0.155,0));add(new THREE.SphereGeometry(0.054,8,6),a,tm(0,-0.31,0))}
  else if(kind==='farm'){add(cyl(0.052,0.045,0.28,8),c?a:b,tm(0,-0.14,0));add(new THREE.SphereGeometry(0.055,8,6),b,tm(0.005,-0.31,0,0,0.9,1.15,0.8))}
  else if(kind==='thigh'){add(cyl(0.09,0.074,0.46,8),a,tm(0,-0.23,0));add(new THREE.SphereGeometry(0.074,8,6),a,tm(0,-0.46,0))}
  else{add(cyl(0.071,0.058,0.42,8),a,tm(0,-0.21,0));add(new THREE.BoxGeometry(0.26,0.085,0.115),b,tm(0.05,-0.42,0));add(new THREE.SphereGeometry(0.06,8,5),b,tm(0.155,-0.42,0,0,0.9,0.75,1))}
  g=mergeGeos(P);pedGeoCache.set(key,g);return g}
const WGEO={
  pistol:mergeGeos([{g:new THREE.BoxGeometry(0.05,0.24,0.045),color:'#1b1b1e',m:tm(0.02,-0.72,0)},{g:new THREE.BoxGeometry(0.1,0.05,0.04),color:'#26262a',m:tm(-0.03,-0.64,0)}]),
  shotgun:mergeGeos([{g:new THREE.BoxGeometry(0.06,0.9,0.05),color:'#2a2a2c',m:tm(0.03,-0.82,0)},{g:new THREE.BoxGeometry(0.08,0.3,0.06),color:'#6b4a2e',m:tm(0.03,-0.42,0)}]),
  mp:mergeGeos([{g:new THREE.BoxGeometry(0.07,0.52,0.05),color:'#1b1b1e',m:tm(0.03,-0.8,0)},{g:new THREE.BoxGeometry(0.16,0.05,0.04),color:'#1b1b1e',m:tm(-0.05,-0.74,0)}]),
  rifle:mergeGeos([{g:new THREE.BoxGeometry(0.055,1.15,0.05),color:'#2d2f2a',m:tm(0.03,-0.82,0)},{g:new THREE.BoxGeometry(0.09,0.35,0.06),color:'#5a4530',m:tm(0.03,-0.36,0)},{g:cyl(0.03,0.03,0.22,6),color:'#111',m:tm(0.09,-0.9,0)}]),
  bat:mergeGeos([{g:cyl(0.055,0.03,0.85,8),color:'#b88a55',m:tm(0,-1.02,0)}]),
  grenade:mergeGeos([{g:new THREE.SphereGeometry(0.06,8,6),color:'#3e5a33',m:tm(0,-0.68,0)}]),
  molotov:mergeGeos([{g:cyl(0.035,0.045,0.18,8),color:'#5c8a3a',m:tm(0,-0.7,0)},{g:new THREE.BoxGeometry(0.03,0.07,0.03),color:'#e8e2d0',m:tm(0,-0.82,0)}])};
const WKIND=[null,'pistol','shotgun','mp','grenade','bat','rifle','molotov'];
const pedObjs=new Map();const bloodGeo=new THREE.CircleGeometry(1,20);bloodGeo.rotateX(-Math.PI/2);const bloodMat=new THREE.MeshBasicMaterial({color:'#5a0d0d',transparent:true,opacity:0.78,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
function pedObj(p){
  let o=pedObjs.get(p.id);if(o)return o;const L=pedLook(p);
  const g=new THREE.Group();const torso=new THREE.Group();g.add(torso);const body=new THREE.Mesh(pedGeometry(p),pedMat);body.castShadow=true;torso.add(body);
  // two-segment legs: thigh pivots at the hip, shin at the knee
  const tg=limbGeometry('thigh',L.pants,L.shoe,0),sg=limbGeometry('shin',L.pants,L.shoe,0);
  const mkLeg=(z)=>{const t=new THREE.Mesh(tg,pedMat);t.position.set(0,0.92,z);const s=new THREE.Mesh(sg,pedMat);s.position.y=-0.46;t.add(s);t.castShadow=true;t.shin=s;g.add(t);return t};
  const l1=mkLeg(0.095),l2=mkLeg(-0.095);
  const ug=limbGeometry('uarm',p.shirt,L.skin,L.long?1:0),fg=limbGeometry('farm',p.shirt,L.skin,L.long?1:0);
  const mkArm=(z)=>{const u=new THREE.Mesh(ug,pedMat);u.position.set(0,1.52,z);const f=new THREE.Mesh(fg,pedMat);f.position.y=-0.31;u.add(f);u.fore=f;torso.add(u);return u};
  const a1=mkArm(0.255),a2=mkArm(-0.255);   // limbs below the hip and the arms don't cast shadows: invisible from above, saves draw calls
  let gun=null;if(p.kind!=='civ'){gun=new THREE.Mesh(WGEO.pistol,pedMat);gun.visible=false;gun.position.y=0.31;a1.fore.add(gun)}
  let wave=null;if(p.wave){wave=new THREE.Mesh(new THREE.RingGeometry(0.8,1.05,24),new THREE.MeshBasicMaterial({color:'#ffc61a',side:THREE.DoubleSide}));wave.rotation.x=-Math.PI/2;wave.position.y=0.1;g.add(wave)}
  scene.add(g);o={g,torso,body,l1,l2,a1,a2,gun,wave,pool:null,wk:null};pedObjs.set(p.id,o);return o;
}
// one stride of hip flexion (+ = thigh forward) and knee flexion in degrees, from typical gait data
const GAIT=(()=>{const K={wh:[[0,22],[0.12,18],[0.3,4],[0.5,-10],[0.6,-12],[0.7,-2],[0.85,20]],wk:[[0,4],[0.12,16],[0.3,6],[0.5,8],[0.62,38],[0.72,60],[0.85,30],[0.95,6]],
    rh:[[0,28],[0.1,16],[0.3,-12],[0.38,-16],[0.5,0],[0.65,38],[0.8,44],[0.92,34]],rk:[[0,18],[0.1,36],[0.3,20],[0.42,52],[0.55,105],[0.68,95],[0.8,55],[0.93,20]]};
  const out={};for(const k in K){const pts=K[k],n=pts.length,N=128,tab=new Float32Array(N);
    for(let i=0;i<N;i++){const t=i/N;let j=n-1;for(let q=0;q<n;q++)if(pts[q][0]<=t)j=q;const p1=pts[j],p2=pts[(j+1)%n],p0=pts[(j-1+n)%n],p3=pts[(j+2)%n];
      const t1=p1[0],t2=j+1<n?p2[0]:1+p2[0];const u=(t-t1)/(t2-t1);const u2=u*u,u3=u2*u;   // Catmull-Rom through the keys (periodic)
      tab[i]=0.5*((2*p1[1])+(-p0[1]+p2[1])*u+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*u2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*u3)}
    out[k]=t=>{const x=t*N,i=Math.floor(x)%N,f=x-Math.floor(x);return tab[i]+(tab[(i+1)%N]-tab[i])*f}}
  return out})();
function posePed(o,p,isPlayer){posePed0(o,p,isPlayer);const hz=W.hillAt(p.x,p.y)+W.bridgeH(p.x,p.y);if(hz){o.g.position.y+=hz;if(o.pool)o.pool.position.y+=hz}}   // walking up the Monopteros hill
function posePed0(o,p,isPlayer){
  o.g.position.set(p.x,0,p.y);o.g.rotation.set(0,-p.a,0);o.torso.rotation.set(0,0,0);o.torso.position.set(0,0,0);
  for(const a of[o.a1,o.a2]){a.rotation.set(0,0,0);a.fore.rotation.set(0,0,0)}
  if(p.state==='sit'){   // pillion passenger: thighs forward, shins down, hands on the driver's hips
    o.g.position.set(p.x,p.sitZ-0.92,p.y);if(o.pool){scene.remove(o.pool);o.pool=null}
    for(const l of[o.l1,o.l2]){l.rotation.set(0,0,1.35);l.shin.rotation.set(0,0,-1.5)}o.l1.rotation.x=0.12;o.l2.rotation.x=-0.12;
    o.a1.rotation.set(0.15,0,0.75);o.a2.rotation.set(-0.15,0,0.75);o.a1.fore.rotation.set(0,0,0.5);o.a2.fore.rotation.set(0,0,0.5);o.torso.rotation.set(0,0,-0.12);if(o.gun)o.gun.visible=false;return}
  if(p.state==='down'||p.state==='dead'){
    o.g.rotation.set(0,-p.a,Math.PI/2*0.97,'YZX');o.g.position.y=0.13;o.l1.rotation.set(0.12,0,0.05);o.l2.rotation.set(-0.15,0,-0.08);o.l1.shin.rotation.set(0,0,-0.25);o.l2.shin.rotation.set(0,0,-0.05);o.a1.rotation.set(-1.25,0,0.25);o.a2.rotation.set(1.1,0,-0.2);if(o.gun)o.gun.visible=false;
    if(p.state==='dead'){if(!o.pool){o.pool=new THREE.Mesh(bloodGeo,bloodMat);o.pool.renderOrder=3;scene.add(o.pool)}const k=Math.min(1,(p.deadT||0)/6);o.pool.scale.setScalar(0.35+k*0.9);o.pool.position.set(p.x-Math.cos(p.a)*0.7,0.03,p.y-Math.sin(p.a)*0.7)}
    return}
  if(o.pool){scene.remove(o.pool);o.pool=null}
  const sp=p.spdNow||0,moving=sp>0.25,run=sp>3.6;const ph=p.anim||0;
  // gait from motion-capture-like keyframe curves (hip and knee angle over one stride), blended from walking to running
  // by speed. Contact at t=0; the knee flexes after toe-off and reaches forward bent, extending only just before contact,
  // which avoids the stiff "marching" look. Arms swing against the legs; the hips follow the planted foot.
  const tt=((ph/6.2832)%1+1)%1;const bl=moving?smooth(2.2,4.6,sp):0,ampW=moving?clamp(0.45+sp/2.6,0.45,1):0,ampR=clamp(0.82+(sp-4)/14,0.82,1.12);
  const leg=(o2,t)=>{const hip=(GAIT.wh(t)*(1-bl)*ampW+GAIT.rh(t)*bl*ampR)*0.01745,kn=(GAIT.wk(t)*(1-bl)*ampW+GAIT.rk(t)*bl*ampR)*0.01745+0.04;
    o2.rotation.set(0,0,hip);o2.shin.rotation.set(0,0,-kn);return[0.46*Math.cos(hip)+0.465*Math.cos(hip-kn),hip]};
  const[h1,hp1]=moving?leg(o.l1,tt):[0.925,0],[h2,hp2]=moving?leg(o.l2,(tt+0.5)%1):[0.925,0];
  if(!moving){o.l1.rotation.set(0,0,0.02);o.l2.rotation.set(0,0,-0.02);o.l1.shin.rotation.set(0,0,-0.05);o.l2.shin.rotation.set(0,0,-0.05)}
  const lean=moving?0.03+bl*0.16:0;
  const aK=0.55+bl*0.35,aBias=bl*0.15;
  o.a1.rotation.set(0.07,0,aBias-aK*(hp1-0.12*bl)+lean*0.4);o.a2.rotation.set(-0.07,0,aBias-aK*(hp2-0.12*bl)+lean*0.4);
  const elb=0.18+bl*1.2;o.a1.fore.rotation.set(0,0,elb+Math.max(0,-hp1)*0.4);o.a2.fore.rotation.set(0,0,elb+Math.max(0,-hp2)*0.4);
  o.torso.rotation.set(0,(hp2-hp1)*0.22,-lean);
  // lean pivots at the hip joint (not at the ground), so the hips stay on top of the legs
  o.torso.position.set(-Math.sin(lean)*0.95,(1-Math.cos(lean))*0.95,0);
  o.g.position.y=moving?Math.max(h1,h2)-0.925:0;
  if(p.state==='wave'){o.a1.rotation.set(-2.6+Math.sin(S.G.time*8)*0.3,0,0);o.a1.fore.rotation.set(0,0,0.5)}
  // weapon in hand
  const w=isPlayer?S.player.weapon:p.remote?p.weapon:p.mil?6:(p.kind==='cop'&&S.stars()>=2?(S.stars()>=4?3:1):0);const wk=WKIND[w]||null;
  if(o.gun){o.gun.visible=!!wk;if(wk&&o.wk!==wk){o.gun.geometry=WGEO[wk];o.wk=wk}}
  const punch=isPlayer?S.player.punch:0,thr=isPlayer?S.player.throwT:0;
  if(wk==='bat'){o.a1.fore.rotation.set(0,0,0);if(punch>0){const u=1-punch/0.3;o.a1.rotation.set(0,1.3-u*2.6,1.25)}else{o.a1.rotation.set(0,0.15,0.35)}}
  else if(wk==='grenade'||wk==='molotov'){if(thr>0){const u=1-thr/0.35;o.a1.rotation.set(0,0,2.9-u*1.6)}}
  else if(wk){const two=wk!=='pistol';o.a1.rotation.set(0,two?0.12:0.22,1.5);o.a1.fore.rotation.set(0,0,0);if(two){o.a2.rotation.set(0,-0.62,1.3);o.a2.fore.rotation.set(0,0,0.35)}o.torso.rotation.z=0;o.torso.rotation.y=0;o.torso.position.set(0,0,0)}
  else if(punch>0){const u=1-punch/0.18;o.a1.rotation.set(0,0.2,Math.sin(u*Math.PI)*1.6);o.a1.fore.rotation.set(0,0,0.9*(1-Math.sin(u*Math.PI)))}
  if(o.wave)o.wave.visible=!!p.wave&&p.state==='wave';
}
function syncPeds(){
  const f=camFocus();const alive=new Set();
  for(const p of S.peds){if(Math.abs(p.x-f.x)>140||Math.abs(p.y-f.y)>140)continue;alive.add(p.id);posePed(pedObj(p),p,false)}
  for(const p of IH.remote.peds){if(Math.abs(p.x-f.x)>220||Math.abs(p.y-f.y)>220)continue;alive.add(p.id);posePed(pedObj(p),p,false)}
  // passengers: hidden inside cars and aircraft, sitting on the pillion of a motorbike
  const sitOn=(ped,car,seat)=>{if(!car||!car.t||!car.t.bike)return;const o=pedObj(ped);alive.add(ped.id);const u=-0.55,ca=Math.cos(car.a),sa=Math.sin(car.a);
    ped.x=car.x+ca*u;ped.y=car.y+sa*u;ped.a=car.a;ped.state='sit';ped.sitZ=(car.z||0)+0.98;posePed(o,ped,false);ped.state='walk'};
  for(const r of(IH.remote.riders||[]))sitOn(r.ped,r.car,r.seat);
  const P=S.player;
  if(S.G.state!=='menu'&&P.ride&&P.rideCar&&P.rideCar.t.bike){const proxy=P._sitProxy||(P._sitProxy=Object.assign({},P,{id:P.id+'_sit',kind:'player'}));proxy.shirt=P.shirt;proxy.weapon=P.weapon;sitOn(proxy,P.rideCar,P.ride.seat)}
  if(S.G.state!=='menu'&&!P.inCar&&!P.ride){alive.add(P.id);const o=pedObj(P);posePed(o,P,true);P.throwT=Math.max(0,(P.throwT||0)-1/60)}
  for(const[id,o]of pedObjs){if(!alive.has(id)){scene.remove(o.g);if(o.pool)scene.remove(o.pool);pedObjs.delete(id)}}
}

/* ---------- particles ---------- */
const PMAX=1400;
function makePoints(additive){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(PMAX*3),3));g.setAttribute('rgba',new THREE.BufferAttribute(new Float32Array(PMAX*4),4));g.setAttribute('size',new THREE.BufferAttribute(new Float32Array(PMAX),1));g.setDrawRange(0,0);
  const m=new THREE.ShaderMaterial({uniforms:{scale:{value:600}},transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,
    vertexShader:'attribute float size;attribute vec4 rgba;varying vec4 vC;uniform float scale;void main(){vC=rgba;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=max(1.0,size*scale/-mv.z);gl_Position=projectionMatrix*mv;}',
    fragmentShader:'varying vec4 vC;void main(){vec2 d=gl_PointCoord-0.5;float r=length(d);if(r>0.5)discard;float a=vC.a*smoothstep(0.5,0.12,r);gl_FragColor=vec4(vC.rgb,a);}'});
  const pts=new THREE.Points(g,m);pts.frustumCulled=false;pts.renderOrder=5;scene.add(pts);return pts;
}
let ptsN,ptsA;
const tmpC=new THREE.Color();
function syncParticles(){
  const f=camFocus();const lk=1-0.55*ENV.night;
  const fill=(pts,pred)=>{const pa=pts.geometry.attributes.position.array,ca=pts.geometry.attributes.rgba.array,sa=pts.geometry.attributes.size.array;let n=0;
    const put=(x,y,z,r,g,b,a,s)=>{if(n>=PMAX)return;pa[n*3]=x;pa[n*3+1]=z;pa[n*3+2]=y;ca[n*4]=r;ca[n*4+1]=g;ca[n*4+2]=b;ca[n*4+3]=a;sa[n]=s;n++};
    pred(put);pts.geometry.setDrawRange(0,n);pts.geometry.attributes.position.needsUpdate=true;pts.geometry.attributes.rgba.needsUpdate=true;pts.geometry.attributes.size.needsUpdate=true};
  fill(ptsN,put=>{for(const p of S.parts){if(Math.abs(p.x-f.x)>160||Math.abs(p.y-f.y)>160)continue;const a=p.life/p.max;
    if(p.k==='smoke')put(p.x,p.y,p.z,0.75*lk,0.75*lk,0.75*lk,a*0.5,p.size*2);else if(p.k==='smokeD')put(p.x,p.y,p.z,0.18,0.17,0.16,a*0.6,p.size*2);
    else if(p.k==='drop')put(p.x,p.y,p.z,0.8*lk,0.92*lk,1*lk,a*0.9,p.size*2);else if(p.k==='deb'){tmpC.set(p.col||'#333');put(p.x,p.y,p.z,tmpC.r*lk,tmpC.g*lk,tmpC.b*lk,Math.min(1,a*2),p.size*2)}}});
  fill(ptsA,put=>{for(const p of S.parts){if(Math.abs(p.x-f.x)>160||Math.abs(p.y-f.y)>160)continue;const a=p.life/p.max;
    if(p.k==='fire')put(p.x,p.y,p.z,1,0.55+0.3*a,0.15,a,p.size*2);else if(p.k==='spark')put(p.x,p.y,p.z,1,0.85,0.4,a,0.22);else if(p.k==='flash')put(p.x,p.y,p.z,1,0.9,0.6,a,p.size*2);else if(p.k==='boom'){put(p.x,p.y,p.z,1,0.75,0.3,a,p.size*2);put(p.x,p.y,p.z+1,1,0.95,0.7,a,p.size)}}
    for(const b of S.bullets)put(b.x,b.y,b.z===undefined?1.2:b.z,1,0.9,0.5,0.9,0.3);
    for(const sh of S.shells||[]){put(sh.x,sh.y,sh.z,1,0.8,0.4,1,sh.missile?0.9:0.7);if(sh.missile)put(sh.x-sh.vx*0.01,sh.y-sh.vy*0.01,sh.z-sh.vz*0.01,1,0.5,0.15,0.9,1.4)}});
}
/* ---------- rain ---------- */
let rainMesh=null;
function buildRain(){
  const N=2200,pos=new Float32Array(N*2*3),end=new Float32Array(N*2);const r=rnd(44);
  for(let i=0;i<N;i++){const x=(r()-0.5)*110,z=(r()-0.5)*110,y=r();for(let k=0;k<2;k++){pos[(i*2+k)*3]=x;pos[(i*2+k)*3+1]=y;pos[(i*2+k)*3+2]=z;end[i*2+k]=k}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aEnd',new THREE.BufferAttribute(end,1));
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:U.time,center:{value:new THREE.Vector3()},amount:{value:0},col:{value:new THREE.Color('#c9d4e0')}},
    vertexShader:'attribute float aEnd;uniform float time;uniform vec3 center;varying float vA;void main(){float H=45.0;float y=mod(position.y*H-time*24.0,H);vec3 p=vec3(center.x+position.x,y+aEnd*1.1,center.z+position.z);p.x+=aEnd*0.15;vA=aEnd;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0);}',
    fragmentShader:'uniform float amount;uniform vec3 col;varying float vA;void main(){gl_FragColor=vec4(col,amount*0.35*(0.3+vA));}'});
  rainMesh=new THREE.LineSegments(g,m);rainMesh.frustumCulled=false;rainMesh.renderOrder=6;scene.add(rainMesh);
}
function updateRain(){if(!rainMesh)return;const a=ENV.rain;rainMesh.visible=a>0.03;if(!rainMesh.visible)return;const u=rainMesh.material.uniforms;u.amount.value=a;u.center.value.set(lookPos.x,0,lookPos.z);u.col.value.set(ENV.night>0.5?'#7f8b9c':'#c9d4e0')}

/* ---------- skids, decals, grenades ---------- */
let skidMesh,skidN=-1,skidLen=0;const SKMAX=1200;
function buildSkids(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(SKMAX*18),3));g.setDrawRange(0,0);skidMesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:'#111214',transparent:true,opacity:0.32,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4}));skidMesh.frustumCulled=false;skidMesh.renderOrder=3;scene.add(skidMesh)}
function syncSkids(){const sk=S.skids;if(sk.length===skidLen&&sk[0]===skidN)return;skidLen=sk.length;skidN=sk[0];const a=skidMesh.geometry.attributes.position.array;let n=0;
  for(const s of sk){if(n>=SKMAX)break;const dx=s[2]-s[0],dy=s[3]-s[1],l=hypot(dx,dy)||1;const nx=-dy/l*0.11,ny=dx/l*0.11;const y=0.1;const q=[[s[0]+nx,s[1]+ny],[s[2]+nx,s[3]+ny],[s[2]-nx,s[3]-ny],[s[0]-nx,s[1]-ny]];const o=n*18;
    const v=(i,k)=>{a[o+k*3]=q[i][0];a[o+k*3+1]=y;a[o+k*3+2]=q[i][1]};v(0,0);v(1,1);v(2,2);v(0,3);v(2,4);v(3,5);n++}
  skidMesh.geometry.setDrawRange(0,n*6);skidMesh.geometry.attributes.position.needsUpdate=true}
const decalMeshes=[];let decalSeen=0,decalTex=null;
function syncDecals(){if(S.decals.length===decalSeen&&decalMeshes.length===S.decals.length)return;decalSeen=S.decals.length;
  if(!decalTex)decalTex=canvasTex(64,64,(g)=>{const gr=g.createRadialGradient(32,32,4,32,32,32);gr.addColorStop(0,'rgba(18,16,14,.95)');gr.addColorStop(0.6,'rgba(25,22,20,.6)');gr.addColorStop(1,'rgba(30,28,26,0)');g.fillStyle=gr;g.fillRect(0,0,64,64)});
  while(decalMeshes.length<S.decals.length){const m=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:decalTex,transparent:true,depthWrite:false}));m.rotation.x=-Math.PI/2;m.renderOrder=3;scene.add(m);decalMeshes.push(m)}
  S.decals.forEach((d,i)=>{const m=decalMeshes[i];m.position.set(d.x,0.11,d.y);m.scale.set(d.r*1.2,d.r,1);m.rotation.z=d.a||0;m.visible=true});for(let i=S.decals.length;i<decalMeshes.length;i++)decalMeshes[i].visible=false}
const grenadeMeshes=[];
const molMat=lam('#5c8a3a',{emissive:'#402000'}),grenMat=lam('#3e5a33');
function syncGrenades(){while(grenadeMeshes.length<S.grenades.length){const m=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.12,0.36,8),grenMat);scene.add(m);grenadeMeshes.push(m)}grenadeMeshes.forEach((m,i)=>{const g=S.grenades[i];m.visible=!!g;if(g){m.position.set(g.x,g.z,g.y);m.material=g.molotov?molMat:grenMat;m.rotation.set(S.G.time*9,0,S.G.time*7);if(g.molotov&&Math.random()<0.5)S.parts.push({k:'fire',x:g.x,y:g.y,z:g.z+0.2,vx:0,vy:0,vz:0.5,life:0.2,max:0.2,size:0.3})}})}

/* ---------- camera ---------- */
let camPos=new THREE.Vector3(600,60,700),lookPos=new THREE.Vector3(600,0,640),shake=0,lastDist=90,camHD=60,shadowSpan=0;
R3.shake=v=>{shake=Math.min(1.2,shake+v)};
let camAlt=0,camPrev=null;const _sF=new THREE.Vector3(),_sR=new THREE.Vector3(),_sU=new THREE.Vector3(),_sC=new THREE.Vector3();
function updateCamera(dt){
  const P=S.player,G=S.G;let tx,ty,vx=0,vy=0,heading=null,speed=0;
  if(G.state==='menu'){const t=cam.target;tx=t.x;ty=t.y;vx=t.vx||0;vy=t.vy||0;heading=t.a}
  else if(P.inCar||P.rideCar){const c=P.inCar||P.rideCar;tx=c.x;ty=c.y;vx=c.vx;vy=c.vy;heading=c.a;speed=hypot(vx,vy);if(c.t.plane){camAlt=lerp(camAlt,c.z||0,1-Math.exp(-3*dt));speed=Math.min(speed,60)}}
  else{tx=P.x;ty=P.y;vx=P.vx;vy=P.vy;if(hypot(vx,vy)>1)heading=P.a}
  const chase=IH.settings.cam==='chase'&&G.state!=='menu';
  // follow camera with free look (swipe outside the joystick): the follow direction (cam.base) turns behind you,
  // a swipe adds an offset (cam.look / cam.lookP). In vehicles the offset springs back after a moment of driving,
  // on foot a swipe turns the camera for good and pauses the auto-follow for a few seconds.
  if(cam.base===undefined)cam.base=cam.yaw;cam.look=cam.look||0;cam.lookP=cam.lookP||0;cam.lookHold=(cam.lookHold||0)-dt;cam.freeT=(cam.freeT||0)-dt;
  const inVeh=!!(P.inCar||P.rideCar)&&G.state!=='menu';
  if(chase&&heading!==null&&!(!inVeh&&cam.freeT>0)){const want=heading+Math.PI/2;let d=want-cam.base;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;cam.base+=d*(1-Math.exp(-(inVeh?3.2:1.6)*dt))}
  else if(!chase){let d=-cam.base;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;cam.base+=d*(1-Math.exp(-4*dt));cam.look=0;cam.lookP=0}
  if(chase&&inVeh&&cam.lookHold<=0&&speed>3){const k=Math.exp(-2.2*dt);cam.look*=k;cam.lookP*=k}
  if(chase&&!inVeh&&cam.lookHold<=0)cam.lookP*=Math.exp(-0.8*dt);
  cam.yaw=cam.base+cam.look;
  const veh=P.inCar||P.rideCar,foot=!veh&&G.state!=='menu';const zoom=IH.settings.zoom||1;
  const pc=veh&&veh.t.plane?veh:null;if(!pc)camAlt=lerp(camAlt,0,1-Math.exp(-3*dt));
  const az=pc?(cam.airZoom||1)*(pc.type==='kampfjet'?1.3:1):1;   // aircraft: pinch zoom (two fingers); the fast fighter sits a bit further away by default
  let dist=chase?(foot?12:pc?(pc.t.len*0.9+14)*az:16+speed*0.3):(foot?66:G.state==='menu'?150:(pc?(80+pc.t.len*1.2+camAlt*0.5)*az:92+speed*1.25))*zoom;dist=Math.min(dist,chase?(pc?70*Math.max(1,az):32):(pc?260*Math.max(1,az):170));
  lastDist=lerp(lastDist,dist,1-Math.exp(-1.5*dt));if(cam.snap){lastDist=dist}
  const pitch=chase?clamp((foot?0.42:0.36)+cam.lookP,0.08,1.05):G.state==='menu'?0.85:1.13;
  const ahead=chase?0:Math.min(18,speed*0.45);
  const sp=hypot(vx,vy)||1;
  const lx=tx+(sp>1?vx/sp*ahead:0),ly=ty+(sp>1?vy/sp*ahead:0);
  const fx=Math.sin(cam.yaw),fy=-Math.cos(cam.yaw);
  let hd=Math.cos(pitch)*lastDist;
  if(chase&&!(pc&&camAlt>3)){let free=hd;for(let s=1.5;s<=hd;s+=0.75){const g=W.at(lx-fx*s,ly-fy*s);if(g===W.TY.BUILD||g===W.TY.SOLID){free=Math.max(2.2,s-1.4);break}}camHD=Math.min(lerp(camHD,free,1-Math.exp(-8*dt)),free);hd=camHD}else camHD=hd;
  const pv=P.inCar||null,hz=pc?0:W.hillAt(tx,ty)+(pv&&pv.layer==='low'?0:W.bridgeH(tx,ty));
  const want=new THREE.Vector3(lx-fx*hd,Math.sin(pitch)*lastDist+(chase?1.5:0)+camAlt+hz,ly-fy*hd);
  const wantLook=new THREE.Vector3(lx+(chase?fx*6:0),(chase?1.4:0)+camAlt*(chase?1:0.85)+hz,ly+(chase?fy*6:0));
  // fast aircraft: carry the camera along with the vehicle first, so the smoothing only acts on the offset (no lag that loses the plane)
  if(pc&&camPrev&&!cam.snap){const mx=tx-camPrev.x,my=ty-camPrev.y;if(Math.abs(mx)+Math.abs(my)<40){camPos.x+=mx;camPos.z+=my;lookPos.x+=mx;lookPos.z+=my}}camPrev={x:tx,y:ty};
  const k=cam.snap?1:1-Math.exp(-6*dt);camPos.lerp(want,k);lookPos.lerp(wantLook,k);cam.snap=false;
  camera.position.copy(camPos);if(shake>0.01){camera.position.x+=(Math.random()-0.5)*shake*0.8;camera.position.y+=(Math.random()-0.5)*shake*0.5;camera.position.z+=(Math.random()-0.5)*shake*0.8;shake*=Math.exp(-5*dt)}
  camera.lookAt(lookPos);
  cam.target=G.state==='menu'?cam.target:{x:tx,y:ty};
  // sun follows the view; shadow frustum covers what the camera sees
  const span=chase?70:clamp(lastDist*0.78,48,130);if(sun.castShadow&&Math.abs(span-shadowSpan)>4){shadowSpan=span;const sc=sun.shadow.camera;sc.left=-span;sc.right=span;sc.top=span;sc.bottom=-span;sc.updateProjectionMatrix()}
  // sun and shadow camera follow the view, snapped to whole shadow-map texels in light space: shadows don't shimmer or jump while you move
  {const sd=ENV.sunDir;_sF.set(-sd.x,-sd.y,-sd.z).normalize();_sR.set(0,1,0).cross(_sF);if(_sR.lengthSq()<1e-6)_sR.set(1,0,0);_sR.normalize();_sU.copy(_sF).cross(_sR);
   _sC.set(lookPos.x,0,lookPos.z);if(sun.castShadow&&shadowSpan>0){const tx=2*shadowSpan/sun.shadow.mapSize.x;const a=Math.round(_sC.dot(_sR)/tx)*tx,b=Math.round(_sC.dot(_sU)/tx)*tx,d=_sC.dot(_sF);_sC.copy(_sR).multiplyScalar(a).addScaledVector(_sU,b).addScaledVector(_sF,d)}
   sun.target.position.copy(_sC);sun.position.set(_sC.x+sd.x*180,_sC.y+sd.y*180,_sC.z+sd.z*180)}
  if(R3.camOverride){const o=typeof R3.camOverride==="function"?R3.camOverride():R3.camOverride;camera.position.set(o[0],o[1],o[2]);camera.lookAt(o[3],o[4],o[5])}
  if(skyMesh)skyMesh.position.copy(camera.position);
}

/* ---------- per-frame update ---------- */
let riesT=0;
function updateMarkers(dt){
  const G=S.G,m=S.mission,P=S.player;const t=G.time;
  for(const{ph,g}of phoneMeshes){const ready=(ph.cd||0)<=0&&!m.active&&G.state==='play';g.userData.beam.visible=ready;if(ready)g.userData.beam.material.opacity=0.22+0.15*Math.sin(t*4)}
  for(const{p,m:mesh}of pickupMeshes){mesh.visible=(p.cd||0)<=0;mesh.rotation.y=t*1.6;mesh.position.y=0.9+Math.sin(t*3+p.x)*0.15}
  const at=!m.active&&((IH.act&&IH.act.target?IH.act.target():null)||(IH.story&&IH.story.target?IH.story.target():null));
  const hasT=(m.active&&m.tx!==null&&m.tx!==undefined||!!at)&&G.state==='play'&&!(IH.story&&IH.story.active);const mtx=at?at.x:m.tx,mty=at?at.y:m.ty;
  beacon.visible=beaconRing.visible=hasT;
  if(hasT){const tz=!at&&m.tz?m.tz:0;beacon.position.set(mtx,20+tz,mty);beaconRing.position.set(mtx,tz?tz:0.15,mty);const s=(tz?4.2:1)*(1+0.15*Math.sin(t*5));beaconRing.scale.set(s,s,1)}   // air rings for flight missions
  const nxt=(m.active&&m.type==='rennen'&&m.cps&&m.cps[m.cpi+1])||(at&&at.next);beacon2.visible=!!nxt&&G.state==='play';if(nxt)beacon2.position.set(nxt.x,12,nxt.y);
  const src=P.inCar||P;
  arrow3d.visible=hasT&&hypot(mtx-src.x,mty-src.y)>25;   // points at the shown target (story/act targets too, not a stale mission target)
  if(arrow3d.visible){const a=Math.atan2(mty-src.y,mtx-src.x);arrow3d.position.set(src.x,(P.inCar?P.inCar.t.ht:1.8)+2.2+Math.sin(t*4)*0.2,src.y);arrow3d.rotation.set(0,-a,0)}
  const wp=IH.waypoint;wpBeacon.visible=!!wp&&G.state==='play';if(wp)wpBeacon.position.set(wp.x,15,wp.y);
  {let hidden=false;if(G.state==='play'&&IH.settings.cam!=='chase'){const dx=camPos.x-src.x,dz=camPos.z-src.y,l=hypot(dx,dz)||1;for(let d=1.5;d<=11;d+=1.5)if(W.at(src.x+dx/l*d,src.y+dz/l*d)===W.TY.BUILD){hidden=true;break}}
   playerMark.visible=hidden;if(hidden)playerMark.position.set(src.x,(P.inCar?P.inCar.t.ht:1.8)+1.6+Math.sin(t*5)*0.15,src.y)}
  playerRing.visible=G.state==='play'&&!P.inCar&&!P.ride;playerRing.position.set(P.x,0.12+W.hillAt(P.x,P.y),P.y);
  for(const pm of pkgMeshes){const got=S.G.pkgs&&S.G.pkgs.has(pm.p.i);pm.m.visible=!got;pm.beam.visible=!got&&hypot(pm.p.x-src.x,pm.p.y-src.y)<40;if(!got){pm.m.rotation.y=t*1.2+pm.p.i;pm.m.position.y=0.15+Math.sin(t*2.5+pm.p.i)*0.1}}
  updateHeli(dt,t);updatePigeons(dt,src);
  for(const im of runwayLights)im.visible=ENV.night>0.08||ENV.rain>0.4;
  if(gateBoom){const want=W.airport.gateOpen?-1.35:0;gateAng+=(want-gateAng)*Math.min(1,dt*4);gateBoom.rotation.x=gateAng}
  if(gateBoom2&&W.base){const want=W.base.broken?0.25:W.base.gateOpen?1.35:0;gateAng2+=(want-gateAng2)*Math.min(1,dt*4);gateBoom2.rotation.z=gateAng2}
  syncTrains();
  for(const sh of sheds){const inside=src.x>sh.x0-1&&src.x<sh.x1+1&&src.y>sh.z0-1&&src.y<sh.z1+0.5&&(src.z||0)<6;sh.roof.visible=!inside}
  {const J=S.jets||[];while(jetObjs.length<J.length){const o=planeObject('fighter','luftwaffe');scene.add(o);jetObjs.push(o)}jetObjs.forEach((o,i)=>{const j=J[i];o.visible=!!j;if(j){o.position.set(j.x,j.z,j.y);o.rotation.set(j.roll||0,-j.a,j.pitch||0,'YZX')}})}
  {const PL=S.planes||[];while(planeObjs.length<PL.length)planeObjs.push(null);PL.forEach((p,i)=>{let o=planeObjs[i];if(!o||o.userData.key!==p.type+p.liv){if(o)scene.remove(o);o=planeObject(p.type,p.liv);o.userData.key=p.type+p.liv;scene.add(o);planeObjs[i]=o}
    o.visible=p.vis;if(p.vis){o.position.set(p.x,p.z,p.y);o.rotation.set(p.roll||0,-p.a,p.pitch||0,'YZX')}});for(let i=PL.length;i<planeObjs.length;i++)if(planeObjs[i])planeObjs[i].visible=false}
  if(xmasGlow){const on=ENV.night>0.15||ENV.rain>0.4;xmasGlow.material.opacity=on?0.9:0.25;const m=M4(),q=camera.quaternion,v=new THREE.Vector3(),sc=new THREE.Vector3(1,1,1);xmasGlow.userData.pts.forEach((b,i)=>{const tw=0.75+0.25*Math.sin(t*3+i*1.7);sc.set(tw,tw,tw);m.compose(v.set(b[0],b[1],b[2]),q,sc);xmasGlow.setMatrixAt(i,m)});xmasGlow.instanceMatrix.needsUpdate=true}
  for(const im of wheelLights)im.visible=ENV.night>0.12||ENV.rain>0.5;
  if(wheel){riesT+=dt*0.08;wheel.rotation.z=riesT;for(const ch of wheel.children)if(ch.userData.gondola)ch.rotation.z=-riesT}
  const f=camFocus();for(const s of R3.treeSecs){const tr=330+camAlt*2.2;const vis=Math.abs(s.x-f.x)<tr&&Math.abs(s.y-f.y)<tr;for(const mm of s.meshes)mm.visible=vis&&mm.count>0}
}
function updateHeli(dt,t){
  const h=S.heli;const on=h&&h.on;heliG.visible=on;heliCone.visible=heliPool.visible=on&&!h.down;if(!on){return}
  heliG.position.set(h.x,h.z,h.y);heliG.rotation.set(clamp(-(h.vy*Math.cos(h.a)-h.vx*Math.sin(h.a))*0.01,-0.2,0.2),-h.a,clamp(-hypot(h.vx,h.vy)*0.006,-0.22,0));
  heliRotor.rotation.y+=dt*42;heliTail.rotation.z+=dt*60;heliBlink.visible=Math.floor(t*2)%2===0;
  // the searchlight locks onto you only while the crew sees you, otherwise it sweeps the streets below
  const P=S.player,tg=P.inCar||P;const wx=h.sees?tg.x:h.x+Math.cos(t*0.9)*22+h.vx*1.2,wy=h.sees?tg.y:h.y+Math.sin(t*1.27)*22+h.vy*1.2;
  if(h.lx===undefined){h.lx=wx;h.ly=wy}const kk=1-Math.exp(-(h.sees?8:2.5)*dt);h.lx+=(wx-h.lx)*kk;h.ly+=(wy-h.ly)*kk;const px=lerp(h.x,h.lx,0.92),py=lerp(h.y,h.ly,0.92);
  const dx=px-h.x,dz=py-h.y,hh=h.z-0.6,len=Math.hypot(dx,dz,hh);heliCone.scale.set(1,len,1);heliCone.position.set((h.x+px)/2,(h.z-0.6)/2,(h.y+py)/2);
  heliCone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-dx,hh,-dz).normalize());
  const nt=ENV.night;heliCone.material.opacity=0.12+0.5*nt;heliPool.material.opacity=0.25+0.75*nt;heliPool.position.set(px,0.16,py)}
function updatePigeons(dt,src){
  if(!pigeonMesh)return;const m=M4(),q=new THREE.Quaternion(),e=new THREE.Euler(),v=new THREE.Vector3(),sc=new THREE.Vector3(1,1,1);const P=S.player;
  const scare=[];scare.push({x:src.x,y:src.y,r:P.inCar?9:4.5});for(const c of S.cars)if(!c.dead&&Math.abs(c.vf||0)>3&&Math.abs(c.x-src.x)<90&&Math.abs(c.y-src.y)<90)scare.push({x:c.x,y:c.y,r:7});for(const p of S.parts)if(p.k==='boom'){scare.push({x:p.x,y:p.y,r:30});break}
  const T=S.G.time;
  pigeons.forEach((b,i)=>{
    if(b.fly<=0){for(const s of scare)if(Math.abs(s.x-b.x)<s.r&&Math.abs(s.y-b.y)<s.r&&hypot(s.x-b.x,s.y-b.y)<s.r){const a=Math.atan2(b.y-s.y,b.x-s.x)+(Math.random()-0.5);b.fly=6+Math.random()*4;b.vx=Math.cos(a)*8;b.vy=Math.sin(a)*8;b.a=a;break}}
    if(b.fly>0){b.fly-=dt;const up=b.fly>3?1:-1;b.z=clamp(b.z+up*dt*(up>0?5:2.2),0,9);if(b.fly<=3){const dx=b.hx-b.x,dy=b.hy-b.y,d=hypot(dx,dy)||1;b.vx+=(dx/d*6-b.vx)*dt*1.5;b.vy+=(dy/d*6-b.vy)*dt*1.5;b.a=Math.atan2(b.vy,b.vx)}
      b.x+=b.vx*dt;b.y+=b.vy*dt;if(b.fly<=0||(b.fly<3&&b.z<=0.01&&hypot(b.hx-b.x,b.hy-b.y)<1.5)){b.fly=0;b.z=0}}
    else{const k=Math.sin(T*0.7+b.ph);if(k>0.97){b.a+=dt*3}b.x+=Math.cos(b.a)*dt*0.25*(k>0.3?1:0);b.y+=Math.sin(b.a)*dt*0.25*(k>0.3?1:0);if(hypot(b.x-b.hx,b.y-b.hy)>3){b.a=Math.atan2(b.hy-b.y,b.hx-b.x)}}
    const flap=b.fly>0?Math.sin(T*30+i)*0.5:0;const peck=b.fly>0?0:Math.max(0,Math.sin(T*3+b.ph*3))*0.35;
    e.set(flap,-b.a,-peck);q.setFromEuler(e);m.compose(v.set(b.x,b.z,b.y),q,sc);pigeonMesh.setMatrixAt(i,m)});
  pigeonMesh.instanceMatrix.needsUpdate=true;
  // fountain spray
  if(S.G.state!=='menu')for(const f of fountains){if(Math.abs(f.x-src.x)>90||Math.abs(f.y-src.y)>90)continue;for(let k=0;k<2;k++){const a=Math.random()*6.28,sp=1.2+Math.random()*0.6;S.parts.push({k:'drop',x:f.x+Math.cos(a)*0.4,y:f.y+Math.sin(a)*0.4,z:f.top,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,vz:2.6,life:0.75,max:0.75,size:0.12,grav:1})}}
}
/* ---------- resolution adaptation ---------- */
let pr=1,frameAcc=0,frameN=0;
function adapt(dt){if(dt<=0)return;frameAcc+=dt;frameN++;if(frameN>=90){const avg=frameAcc/frameN;frameAcc=0;frameN=0;if(avg>0.027&&pr>0.8){pr=Math.max(0.8,pr-0.15);renderer.setPixelRatio(pr);R3.resize()}else if(avg<0.0135&&pr<R3.maxPR){pr=Math.min(R3.maxPR,pr+0.1);renderer.setPixelRatio(pr);R3.resize()}}}

R3.init=function(canvas){
  Q=QUAL[(IH.settings&&IH.settings.quality)||'hoch']||QUAL.hoch;
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.localClippingEnabled=true;
  maxAniso=Math.min(16,renderer.capabilities.getMaxAnisotropy());
  R3.maxPR=Math.min(window.devicePixelRatio||1,Q.prMax);pr=Math.min(R3.maxPR,Q.prStart);renderer.setPixelRatio(pr);
  renderer.shadowMap.enabled=Q.shadow>0;renderer.shadowMap.type=THREE.PCFShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#b2cde0');scene.fog=new THREE.Fog('#b2cde0',230,600);
  camera=new THREE.PerspectiveCamera(38,1,0.5,2600);
  hemi=new THREE.HemisphereLight('#e8f2ff','#77745f',0.66);scene.add(hemi);
  sun=new THREE.DirectionalLight('#fff0d6',0.8);sun.castShadow=Q.shadow>0;if(sun.castShadow){sun.shadow.mapSize.set(Q.shadow,Q.shadow);const sc=sun.shadow.camera;sc.near=10;sc.far=480;sun.shadow.bias=-0.0006;sun.shadow.normalBias=0.04}
  scene.add(sun,sun.target);
  buildPatterns();envUpdate(0);buildSky();buildEnvCube();buildCarMaterials();
  buildGround();buildBuildings();buildLandmarks();motorwayBuild();buildProps();buildLights();buildMarkers();buildSkids();buildRain();R3.refreshProps();
  ptsN=makePoints(false);ptsA=makePoints(true);
  envUpdate(0);R3.resize();
};
R3.resize=function(){const w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w/h<1?58:w/h<1.4?44:38;camera.updateProjectionMatrix();const s=h*renderer.getPixelRatio()/2/Math.tan(camera.fov*Math.PI/360);ptsN.material.uniforms.scale.value=s;ptsA.material.uniforms.scale.value=s};
let envT=0;
let frameNo=0;const fogBase=[230,600];
R3.frame=function(dt){
  U.time.value+=dt>0?dt:0.0;envT-=dt;if(envT<=0||dt===0){envUpdate(Math.max(dt,0.25));envT=0.25}
  updateCamera(dt);updateChunks();syncCars();syncPeds();syncParticles();syncSkids();syncDecals();syncGrenades();updateLights(dt);updateMarkers(dt);updateRain();
  frameNo++;if(renderer.shadowMap.enabled){renderer.shadowMap.autoUpdate=true}
  if(scene.fog){scene.fog.near=fogBase[0]+camAlt*1.4;scene.fog.far=fogBase[1]+camAlt*2.6}
  renderer.render(scene,camera);adapt(dt);
};
R3.prewarm=function(){updateCamera(0);updateChunks(true)};
R3.project=function(x,y,z){const v=new THREE.Vector3(x,z||0,y).project(camera);return{x:(v.x+1)/2*window.innerWidth,y:(1-v.y)/2*window.innerHeight,behind:v.z>1}};
R3.info=()=>({calls:renderer.info.render.calls,tris:renderer.info.render.triangles,pr,tod:ENV.tod,rain:ENV.rain});
})(window));
