/* Isar Heat 2 — world generation (units: metres; x = east, y = south) */
(window.IH_MODS=window.IH_MODS||[]).push(()=>(function(root){
'use strict';
const IH=root.IH=root.IH||{};

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
let rng=mulberry32(0x15A2026);const rngOut=mulberry32(0x6A2C);   // rngOut: everything added outside the city later, so the city itself never changes
const R=(a,b)=>a+(b-a)*rng(),RI=(a,b)=>Math.floor(a+(b-a+1)*rng()),pickR=a=>a[Math.floor(rng()*a.length)];
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const smooth=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
const hypot=Math.hypot;

const MAP=2000;   // city 0–1200; to the east the airport and Hallbergmoos, around it open country
const TY={GRASS:0,ROAD:1,WALK:2,BUILD:3,WATER:4,BRIDGE:5,PARK:6,PLAZA:7,LOT:8,BANK:9,RAIL:10,SOLID:11,FIELD:12};
const RES=99;
const grid=new Uint8Array(MAP*MAP);
const cross=new Uint8Array(MAP*MAP);     // zebra crossing cells
const waterMask=new Uint8Array(MAP*MAP);
const airside=new Uint8Array(MAP*MAP);   // inside the airport fence
function at(x,y){x=Math.floor(x);y=Math.floor(y);return(x<0||y<0||x>=MAP||y>=MAP)?TY.SOLID:grid[y*MAP+x]}

/* ---------- rasterisers ---------- */
function fillPoly(pts,f){
  let y0=1e9,y1=-1e9;for(const p of pts){if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1]}
  y0=Math.max(0,Math.floor(y0));y1=Math.min(MAP-1,Math.ceil(y1));
  const xs=[];
  for(let y=y0;y<=y1;y++){
    const cy=y+0.5;xs.length=0;
    for(let i=0,n=pts.length;i<n;i++){const a=pts[i],b=pts[(i+1)%n];if((a[1]<=cy&&b[1]>cy)||(b[1]<=cy&&a[1]>cy))xs.push(a[0]+(cy-a[1])/(b[1]-a[1])*(b[0]-a[0]))}
    xs.sort((a,b)=>a-b);
    for(let k=0;k+1<xs.length;k+=2){const xa=Math.max(0,Math.ceil(xs[k]-0.5)),xb=Math.min(MAP-1,Math.floor(xs[k+1]-0.5));for(let x=xa;x<=xb;x++)f(y*MAP+x,x,y)}
  }
}
function fillCircle(cx,cy,r,f){const x0=Math.max(0,Math.floor(cx-r)),x1=Math.min(MAP-1,Math.ceil(cx+r)),y0=Math.max(0,Math.floor(cy-r)),y1=Math.min(MAP-1,Math.ceil(cy+r));for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const dx=x+0.5-cx,dy=y+0.5-cy;if(dx*dx+dy*dy<=r*r)f(y*MAP+x,x,y)}}
function fillThick(pts,hw,f,caps){
  for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];const dx=b[0]-a[0],dy=b[1]-a[1],l=hypot(dx,dy)||1;const nx=-dy/l*hw,ny=dx/l*hw;fillPoly([[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]],f)}
  for(let i=caps?0:1;i<(caps?pts.length:pts.length-1);i++)fillCircle(pts[i][0],pts[i][1],hw,f);
}
const set=(v,allow)=>i=>{if(!allow||allow(grid[i]))grid[i]=v};
function ellipse(cx,cy,rx,ry,n,rot){const out=[];rot=rot||0;const c=Math.cos(rot),s=Math.sin(rot);for(let i=0;i<n;i++){const t=i/n*Math.PI*2,x=Math.cos(t)*rx,y=Math.sin(t)*ry;out.push([cx+x*c-y*s,cy+x*s+y*c])}return out}
function rect(x0,y0,x1,y1){return[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]}
function pip(p,poly){let ins=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a[1]>p[1])!==(b[1]>p[1]))&&(p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]))ins=!ins}return ins}

/* ---------- polylines ---------- */
function densify(pts,step){const out=[pts[0]];for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];const l=hypot(b[0]-a[0],b[1]-a[1]);const n=Math.max(1,Math.ceil(l/step));for(let k=1;k<=n;k++)out.push([a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n])}return out}
function catmull(ctrl,closed,step){
  const P=closed?ctrl.concat([ctrl[0]]):ctrl;const out=[];const n=ctrl.length;
  const g=i=>closed?ctrl[(i+n)%n]:ctrl[clamp(i,0,n-1)];
  const segs=closed?n:n-1;
  for(let i=0;i<segs;i++){const p0=g(i-1),p1=g(i),p2=g(i+1),p3=g(i+2);const l=hypot(p2[0]-p1[0],p2[1]-p1[1]);const m=Math.max(2,Math.ceil(l/step));
    for(let k=0;k<m;k++){const t=k/m,t2=t*t,t3=t2*t;const f=(a,b,c,d)=>0.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);out.push([f(p0[0],p1[0],p2[0],p3[0]),f(p0[1],p1[1],p2[1],p3[1])])}}
  out.push(closed?[out[0][0],out[0][1]]:[ctrl[n-1][0],ctrl[n-1][1]]);void P;
  return out;
}
function cumLen(pts){const c=[0];for(let i=1;i<pts.length;i++)c.push(c[i-1]+hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));return c}
function pointAt(pts,cum,s){
  const L=cum[cum.length-1];s=clamp(s,0,L);
  let lo=0,hi=cum.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(cum[m]<=s)lo=m;else hi=m}
  const a=pts[lo],b=pts[hi]||a,seg=(cum[hi]-cum[lo])||1,t=(s-cum[lo])/seg;
  const tx=(b[0]-a[0])/seg,ty=(b[1]-a[1])/seg;
  return{x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,tx,ty};
}

/* ---------- the river ---------- */
const riverX=y=>830+22*Math.sin(y/150)+9*Math.sin(y/57);
const islandF=y=>smooth((y-785)/40)*smooth((960-y)/40);
const riverHalf=y=>23+37*islandF(y);
const islandHalf=y=>33*smooth((y-815)/25)*smooth((935-y)/25);
const westX=y=>riverX(y)-riverHalf(y)-32,eastX=y=>riverX(y)+riverHalf(y)+32;
function riverPoly(extra){const L=[],Rr=[];for(let y=-20;y<=MAP+20;y+=6){L.push([riverX(y)-riverHalf(y)-extra,y]);Rr.push([riverX(y)+riverHalf(y)+extra,y])}return L.concat(Rr.reverse())}
function islandPoly(){const L=[],Rr=[];for(let y=815;y<=935;y+=4){const h=Math.max(0.01,islandHalf(y));L.push([riverX(y)-h,y]);Rr.push([riverX(y)+h,y])}return L.concat(Rr.reverse())}

/* ---------- zones ---------- */
grid.fill(TY.GRASS);
const draw={zones:[],water:[],paths:[]};   // vector data for the ground textures
const egEast=[];for(let y=125;y<=500;y+=10)egEast.push([riverX(y)-riverHalf(y)-16,y]);
const ENGLISCHER=[[595,125]].concat(egEast).concat([[600,500]]);
const OLYMPIA=[[90,92],[362,92],[362,250],[270,284],[150,316],[90,350]];
const parks=[ENGLISCHER,OLYMPIA];
for(const p of parks){fillPoly(p,set(TY.PARK));draw.zones.push({t:'park',pts:p})}
const WIESN=ellipse(290,865,108,66,48);
fillPoly(WIESN,set(TY.FIELD));draw.zones.push({t:'field',pts:WIESN});
const plazas=[
  rect(478,615,565,668),             // Marienplatz
  rect(408,586,493,640),             // Frauenplatz
  rect(568,670,628,718),             // Viktualienmarkt
  rect(330,604,352,672),             // Bahnhofplatz
  rect(498,486,545,512),             // Odeonsplatz
  ellipse(1080,112,110,92,40),       // Arena
  ellipse(190,190,82,66,36),         // Olympiastadion
  ellipse(420,166,46,40,28),         // BMW
];
for(const p of plazas){fillPoly(p,set(TY.PLAZA));draw.zones.push({t:'plaza',pts:p})}
const KAUFINGER=[[364,650],[420,647],[480,643]];
fillThick(KAUFINGER,8,set(TY.PLAZA),true);draw.zones.push({t:'plazaLine',pts:KAUFINGER,w:16});
// reserved landmark footprints (no streets, no generic buildings)
const reserved=[rect(205,606,330,674),rect(872,566,942,636),circleR(300,245,16),rect(126,826,158,896),rect(450,332,510,400),rect(530,332,590,400)];
function circleR(x,y,r){return ellipse(x,y,r,r,20)}
for(const p of reserved)fillPoly(p,set(RES));
// river, banks, island, lakes
fillPoly(riverPoly(14),set(TY.BANK,t=>t===TY.GRASS||t===TY.PARK));
fillPoly(riverPoly(0),set(TY.WATER));
const ISL=islandPoly();fillPoly(ISL,set(TY.PLAZA));
const lakes=[ellipse(680,150,40,20,28),ellipse(255,262,55,16,28)];
for(const l of lakes)fillPoly(l,set(TY.WATER));
draw.water.push({outer:riverPoly(0),holes:[ISL]});for(const l of lakes)draw.water.push({outer:l,holes:[]});
draw.zones.push({t:'bank',pts:riverPoly(14)});
for(let i=0;i<MAP*MAP;i++)waterMask[i]=grid[i]===TY.WATER?1:0;

/* ---------- road skeleton ---------- */
const roads=[];
function road(name,pts,o){o=o||{};const r={name,pts:densify(pts,o.step||10),w:o.w||7.5,lanes:o.lanes||1,walk:o.walk===undefined?3.5:o.walk,oneway:!!o.oneway,closed:!!o.closed,major:o.major!==false,infill:!!o.infill,alley:!!o.alley,noai:!!o.noai,country:!!o.country,suburb:!!o.suburb,own:!!o.own,motorway:!!o.motorway,once:!!o.once,ramp:!!o.ramp,over:o.over||null};roads.push(r);return r}
const RING_A=(()=>{const x0=360,x1=690,y0=480,y1=780,r=55,pts=[];const arc=(cx,cy,a0)=>{for(let k=0;k<=6;k++){const a=a0+k/6*Math.PI/2;pts.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r])}};
  arc(x1-r,y0+r,-Math.PI/2);arc(x1-r,y1-r,0);arc(x0+r,y1-r,Math.PI/2);arc(x0+r,y0+r,Math.PI);pts.push([pts[0][0],pts[0][1]]);return pts})();
road('Altstadtring',RING_A,{w:14,lanes:2,closed:true,alley:true});
const SG={x:520,y:300,r:24};
road('Ludwigstraße',[[520,486],[520,SG.y+SG.r]],{w:10,walk:5,alley:true});
{const p=[];for(let k=0;k<=28;k++){const a=-k/28*Math.PI*2;p.push([SG.x+Math.cos(a)*SG.r,SG.y+Math.sin(a)*SG.r])}road('Siegestor-Kreisel',p,{w:8,oneway:true,closed:true,step:6,walk:3})}
road('Leopoldstraße',[[520,SG.y-SG.r],[521,180],[523,40]],{w:10,walk:5,alley:true});
const RB={x:eastX(520),y:520,r:22};
const rbPts=[];for(let k=0;k<=24;k++){const a=-k/24*Math.PI*2;rbPts.push([RB.x+Math.cos(a)*RB.r,RB.y+Math.sin(a)*RB.r])}
road('Friedensengel-Kreisel',rbPts,{w:8,oneway:true,closed:true,step:6,walk:3});
road('Prinzregentenstraße',[[682,521],[760,520],[RB.x-RB.r,520]],{w:14,lanes:2,alley:true});
road('Prinzregentenstraße Ost',[[RB.x+RB.r,520],[1000,518],[1190,512]],{w:14,lanes:2,alley:true});
{const n=[];for(let y=104;y<RB.y-RB.r-14;y+=12)n.push([eastX(y),y]);n.push([RB.x,RB.y-RB.r]);road('Isarufer Ost Nord',n,{w:8,alley:true});
 const s=[[RB.x,RB.y+RB.r]];for(let y=RB.y+RB.r+14;y<=1192;y+=12)s.push([eastX(y),y]);road('Isarufer Ost',s,{w:8,alley:true});
 const w=[];for(let y=513;y<=1192;y+=12)w.push([westX(y),y]);road('Isarufer West',w,{w:8,alley:true})}
road('Maximilianstraße',[[686,600],[760,600],[eastX(600)+4,600]],{w:9,walk:4});
{const yb=838;road('Zweibrückenstraße',[[684,712],[722,775],[westX(yb)+2,yb-6],[westX(yb)-6,yb],[eastX(yb)+6,yb],[980,880],[1190,952]],{w:14,lanes:2})}
{const yb=995;road('Reichenbachstraße',[[575,776],[630,860],[690,950],[westX(yb)+2,yb],[eastX(yb)+4,yb],[952,1060],[992,1192]],{w:9})}
const MR_CTRL=[[100,640],[150,420],[290,300],[450,232],[640,196],[860,214],[1040,330],[1085,600],[1030,900],[860,1078],[640,1112],[420,1092],[220,1012],[96,860]];
const MRING=catmull(MR_CTRL,true,14);
road('Mittlerer Ring',MRING,{w:15,lanes:2,closed:true,step:14});
road('Frankfurter Ring',[[60,110],[400,110],[700,110],[1004,112]],{w:9});
road('Dachauer Straße',[[372,500],[300,420],[200,345],[110,262],[62,120]],{w:9});
road('Arnulfstraße',[[364,596],[250,590],[120,575],[14,570]],{w:14,lanes:2});
road('Bayerstraße',[[364,684],[240,690],[120,700],[14,720]],{w:14,lanes:2});
road('Lindwurmstraße',[[430,776],[445,860],[430,960],[400,1060],[370,1192]],{w:9});
const BAVARIA=ellipse(290,865,128,88,40);BAVARIA.push([BAVARIA[0][0],BAVARIA[0][1]]);
road('Bavariaring',BAVARIA,{w:8,closed:true,alley:true});
road('Lerchenauer Straße',[[332,104],[334,230],[336,300]],{w:8});
road('Theatinerstraße',[[505,476],[505,575]],{w:7});
road('Dienerstraße',[[565,476],[565,612]],{w:7});
road('Maxburgstraße',[[355,560],[512,560]],{w:7});
road('Tal',[[566,652],[630,657],[694,662]],{w:8});
road('Sendlinger Straße',[[500,668],[450,725],[432,782]],{w:7});
road('Hofgartenstraße',[[545,505],[700,505]],{w:7});
road('Theresienhöhe',[[290,781],[289,684]],{w:8});
road('Wiesn-Zufahrt',[[414,866],[452,861]],{w:7});
road('Hansastraße',[[290,949],[293,1060]],{w:8});
road('Herzog-Wilhelm-Straße',[[364,720],[420,722],[452,724]],{w:7});
// out of town: Erdinger Landstraße to Hallbergmoos, the Flughafen-Zubringer and the airport loop
road('Erdinger Landstraße',[[1190,512],[1260,522],[1340,516],[1420,500],[1500,494],[1560,498],[1600,500]],{w:9,country:true,walk:2,once:true});
for(const y of[460,500,540,580])road('Hallbergmoos',[[1600,y],[1640,y],[1680,y],[1720,y],[1760,y]],{w:7,suburb:true,walk:2.5});
for(const x of[1600,1640,1680,1720,1760])road('Hallbergmoos',[[x,460],[x,500],[x,540],[x,580]],{w:7,suburb:true,walk:2.5});
road('Flughafen-Zubringer',[[1600,460],[1602,430],[1604,400],[1604,360],[1606,340]],{w:12,lanes:2,country:true,walk:1});
road('Terminalstraße',[[1606,340],[1650,338],[1668,320],[1668,180],[1650,162],[1612,162],[1596,180],[1596,320],[1606,340]],{w:10,country:true,closed:true,walk:3});
road('Zentralallee',[[1596,250],[1668,250]],{w:8,country:true,walk:3});
road('Fliegerhorststraße',[[1720,580],[1724,700],[1734,820],[1744,950],[1750,1080],[1750,1170]],{w:9,country:true,walk:1,once:true});
const MAJOR_COUNT=roads.length;

/* ---------- infill districts ---------- */
const districts=[
  {name:'Maxvorstadt',poly:[[140,370],[505,352],[505,470],[365,474],[140,545]],ang:0.04,sp:72,style:'mid'},
  {name:'Neuhausen',poly:[[18,360],[142,368],[142,560],[18,566]],ang:0.32,sp:70,style:'mid'},
  {name:'Westend',poly:[[18,705],[352,700],[356,768],[18,768]],ang:-0.12,sp:62,style:'mid'},
  {name:'Glockenbach',poly:[[452,795],[738,798],[738,1012],[452,1045]],ang:0.62,sp:70,style:'mid'},
  {name:'Haidhausen',poly:[[952,546],[1190,540],[1190,958],[905,995],[905,668],[952,650]],ang:-0.22,sp:78,style:'mid'},
  {name:'Bogenhausen',poly:[[905,226],[1190,226],[1190,494],[905,494]],ang:0.18,sp:84,style:'out'},
  {name:'Sendling',poly:[[18,972],[396,972],[396,1192],[18,1192]],ang:0.0,sp:80,style:'out'},
  {name:'Giesing',poly:[[900,1004],[1190,980],[1190,1192],[900,1192]],ang:0.38,sp:74,style:'out'},
  {name:'Milbertshofen',poly:[[346,120],[510,120],[510,214],[346,268]],ang:0.0,sp:62,style:'out'},
  {name:'Lehel',poly:[[700,560],[735,560],[735,770],[700,770]],ang:0,sp:999,style:'mid'},
];
// buffer around majors so infill streets never run alongside them
const majorBuf=new Uint8Array(MAP*MAP);
for(let i=0;i<MAJOR_COUNT;i++){const r=roads[i];fillThick(r.pts,r.w/2+r.walk+16,(k)=>{majorBuf[k]=1},true)}
function clipConvex(p0,d,poly){ // returns [tmin,tmax] of line p0+t*d inside convex poly (CCW or CW)
  let t0=-1e9,t1=1e9;const n=poly.length;
  let area=0;for(let i=0;i<n;i++){const a=poly[i],b=poly[(i+1)%n];area+=a[0]*b[1]-b[0]*a[1]}const sg=area>0?1:-1;
  for(let i=0;i<n;i++){const a=poly[i],b=poly[(i+1)%n];const ex=b[0]-a[0],ey=b[1]-a[1];
    const nx=-ey*sg,ny=ex*sg; // inward normal
    const num=(p0[0]-a[0])*nx+(p0[1]-a[1])*ny,den=d[0]*nx+d[1]*ny;
    if(Math.abs(den)<1e-9){if(num<0)return null;continue}
    const t=-num/den;if(den>0)t0=Math.max(t0,t);else t1=Math.min(t1,t)}
  return t0<t1?[t0,t1]:null;
}
const badForStreet=t=>t===TY.PARK||t===TY.FIELD||t===TY.PLAZA||t===TY.BANK||t===TY.WATER||t===RES;
for(const D of districts){
  const cx=D.poly.reduce((s,p)=>s+p[0],0)/D.poly.length,cy=D.poly.reduce((s,p)=>s+p[1],0)/D.poly.length;
  for(const fam of[0,1]){
    const a=D.ang+fam*Math.PI/2,d=[Math.cos(a),Math.sin(a)],pr=[-d[1],d[0]];
    let lo=1e9,hi=-1e9;for(const p of D.poly){const k=(p[0]-cx)*pr[0]+(p[1]-cy)*pr[1];lo=Math.min(lo,k);hi=Math.max(hi,k)}
    for(let k=lo+D.sp*R(0.35,0.75);k<hi-D.sp*0.3;k+=D.sp*R(0.82,1.2)){
      const p0=[cx+pr[0]*k,cy+pr[1]*k];const c=clipConvex(p0,d,D.poly);if(!c)continue;
      const tA=c[0]-6,tB=c[1]+6;
      // walk, cutting at excluded cells and long runs inside major buffers
      let run=[],bufRun=0;
      const flush=()=>{if(run.length>=2){const L=hypot(run[run.length-1][0]-run[0][0],run[run.length-1][1]-run[0][1]);if(L>=28)road(D.name,[run[0],run[run.length-1]],{w:7,infill:true,major:false,step:10})}run=[]};
      for(let t=tA;t<=tB;t+=2){
        const x=p0[0]+d[0]*t,y=p0[1]+d[1]*t;
        if(x<6||y<6||x>MAP-6||y>MAP-6){flush();continue}
        const g=grid[Math.floor(y)*MAP+Math.floor(x)];
        if(badForStreet(g)){flush();continue}
        if(majorBuf[Math.floor(y)*MAP+Math.floor(x)]){bufRun+=2;if(bufRun>34){flush();continue}}else bufRun=0;
        run.push([x,y]);
      }
      flush();
    }
  }
}

/* ---------- graph construction ---------- */
function buildGraph(){
  const segs=[];
  roads.forEach((r,ri)=>{r.splits=[];for(let i=0;i<r.pts.length-1;i++)segs.push({ri,i,a:r.pts[i],b:r.pts[i+1]})});
  const CS=40,hash=new Map();
  segs.forEach((s,si)=>{const x0=Math.floor(Math.min(s.a[0],s.b[0])/CS),x1=Math.floor(Math.max(s.a[0],s.b[0])/CS),y0=Math.floor(Math.min(s.a[1],s.b[1])/CS),y1=Math.floor(Math.max(s.a[1],s.b[1])/CS);for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const k=y*1000+x;let l=hash.get(k);if(!l)hash.set(k,l=[]);l.push(si)}});
  const seen=new Set();
  for(const list of hash.values()){
    for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
      const A=segs[list[i]],B=segs[list[j]];
      if(roads[A.ri].over===roads[B.ri].name||roads[B.ri].over===roads[A.ri].name)continue;   // a bridge: no junction
      if(A.ri===B.ri){const r=roads[A.ri];const n=r.pts.length-1;const d=Math.abs(A.i-B.i);if(d<=1||(r.closed&&d===n-1))continue}
      const key=list[i]<list[j]?list[i]*100000+list[j]:list[j]*100000+list[i];if(seen.has(key))continue;seen.add(key);
      const px=A.a[0],py=A.a[1],rx=A.b[0]-px,ry=A.b[1]-py,qx=B.a[0],qy=B.a[1],sx=B.b[0]-qx,sy=B.b[1]-qy;
      const den=rx*sy-ry*sx;if(Math.abs(den)<1e-9)continue;
      const t=((qx-px)*sy-(qy-py)*sx)/den,u=((qx-px)*ry-(qy-py)*rx)/den;
      if(t<-1e-6||t>1+1e-6||u<-1e-6||u>1+1e-6)continue;
      const x=px+rx*t,y=py+ry*t;
      roads[A.ri].splits.push({s:A.i+clamp(t,0,1),x,y});roads[B.ri].splits.push({s:B.i+clamp(u,0,1),x,y});
    }
  }
  // snap free endpoints onto nearby roads (T-junctions that stop short)
  roads.forEach((r,ri)=>{if(r.closed)return;for(const end of[0,r.pts.length-1]){const p=r.pts[end];let best=null;
    const k0x=Math.floor(p[0]/CS),k0y=Math.floor(p[1]/CS);
    for(let y=k0y-1;y<=k0y+1;y++)for(let x=k0x-1;x<=k0x+1;x++){const l=hash.get(y*1000+x);if(!l)continue;for(const si of l){const s=segs[si];if(s.ri===ri||(roads[s.ri].own&&!r.own))continue;const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],L2=dx*dx+dy*dy||1;const t=clamp(((p[0]-s.a[0])*dx+(p[1]-s.a[1])*dy)/L2,0,1);const qx=s.a[0]+dx*t,qy=s.a[1]+dy*t;const d=hypot(qx-p[0],qy-p[1]);if(d<7&&(!best||d<best.d))best={d,s,t,qx,qy}}}
    if(best&&best.d>0.5){roads[best.s.ri].splits.push({s:best.s.i+best.t,x:best.qx,y:best.qy});r.pts[end]=[best.qx,best.qy];r.splits.push({s:end,x:best.qx,y:best.qy})}}});
  roads.forEach(r=>{const n=r.pts.length-1;r.splits.push({s:0,x:r.pts[0][0],y:r.pts[0][1]},{s:n,x:r.pts[n][0],y:r.pts[n][1]})});
  // nodes
  const nodes=[],NH=new Map(),NC=6;
  function nodeFor(x,y){const kx=Math.floor(x/NC),ky=Math.floor(y/NC);for(let yy=ky-1;yy<=ky+1;yy++)for(let xx=kx-1;xx<=kx+1;xx++){const l=NH.get(yy*1000+xx);if(l)for(const id of l){const n=nodes[id];if(hypot(n.x-x,n.y-y)<4)return id}}
    const id=nodes.length;nodes.push({id,x,y,edges:[]});const k=ky*1000+kx;let l=NH.get(k);if(!l)NH.set(k,l=[]);l.push(id);return id}
  const edges=[];
  roads.forEach((r,ri)=>{
    r.splits.sort((a,b)=>a.s-b.s);
    const sp=[];for(const s of r.splits){if(sp.length&&s.s-sp[sp.length-1].s<1e-4)continue;sp.push(s)}
    for(const s of sp)s.node=nodeFor(s.x,s.y);
    for(let k=0;k<sp.length-1;k++){
      const A=sp[k],B=sp[k+1];if(A.node===B.node&&!(r.closed&&sp.length===2))continue;
      const pts=[[nodes[A.node].x,nodes[A.node].y]];
      for(let i=Math.floor(A.s)+1;i<B.s-1e-6;i++)if(i>A.s+1e-6)pts.push(r.pts[i]);
      pts.push([nodes[B.node].x,nodes[B.node].y]);
      const cum=cumLen(pts);const len=cum[cum.length-1];if(len<1.5)continue;
      edges.push({id:edges.length,road:ri,a:A.node,b:B.node,pts,cum,len,w:r.w,lanes:r.lanes,walk:r.walk,oneway:r.oneway,infill:r.infill,name:r.name,alley:r.alley,alive:true,mw:r.motorway,ramp:r.ramp});
    }
  });
  return{nodes,edges};
}
/* ---------- out of town (added last): Autobahn ring, Garching with the research campus ---------- */
// A99: east of the city from north to south, then along the south edge to the west; the A92 branches off east to Garching / the air base
// A99 starts at an interchange with the Erdinger Landstraße (east of Bogenhausen) and runs south, then west along the southern edge of the city
road('A99',[[1272,600],[1272,1180],[1262,1240],[1222,1268],[1140,1272],[600,1272],[18,1272]],{w:17,lanes:2,walk:0,country:true,own:true,motorway:true,step:12});
road('A99 Nord',[[1272,40],[1272,600]],{w:17,lanes:2,walk:0,country:true,own:true,motorway:true,step:12,over:'Erdinger Landstraße'});   // the Erdinger Landstraße crosses on a bridge
const RAMP={w:7,country:true,own:true,walk:0,ramp:true};
road('A99 Anschluss West',smoothPts([[1272,600],[1266,575],[1250,548],[1228,517.43]],3),RAMP);road('A99 Anschluss Ost',smoothPts([[1272,600],[1278,575],[1294,548],[1316,517.8]],3),RAMP);
// A92 joins the A99 with two curved branches (an "Autobahndreieck") and ends at the Fliegerhorststraße
road('A92',[[1330,1062],[1400,1064],[1560,1064],[1749,1064]],{w:15,lanes:2,walk:0,country:true,own:true,motorway:true,step:12});
road('A92 Dreieck Nord',smoothPts([[1330,1062],[1305,1052],[1285,1035],[1272,1005]],3),{w:9,country:true,own:true,walk:0,ramp:true});road('A92 Dreieck Süd',smoothPts([[1330,1062],[1305,1072],[1285,1089],[1272,1120]],3),{w:9,country:true,own:true,walk:0,ramp:true});
// exits like the real thing: the town road ends at a junction next to the Autobahn, slip roads leave and join at a shallow angle on both sides
const EXITS=[['Bogenhausen',[1184,220],[1232,220],'v'],['Haidhausen',[1194,773],[1232,773],'v'],['Giesing',[985,1194],[985,1232],'h'],['Sendling',[345,1198],[345,1232],'h'],['Westend',[136,1198],[136,1232],'h']];
// a smooth curve through the points (Catmull-Rom), sampled about every `step` metres
function smoothPts(P,step){const out=[];for(let i=0;i+1<P.length;i++){const p0=P[Math.max(0,i-1)],p1=P[i],p2=P[i+1],p3=P[Math.min(P.length-1,i+2)];const n=Math.max(1,Math.ceil(hypot(p2[0]-p1[0],p2[1]-p1[1])/step));
  for(let k=0;k<n;k++){const t=k/n,t2=t*t,t3=t2*t;const f=(a,b,c,d)=>0.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);out.push([f(p0[0],p1[0],p2[0],p3[0]),f(p0[1],p1[1],p2[1],p3[1])])}}out.push(P[P.length-1]);return out}
// slip roads curve out of the town road and run alongside the Autobahn before they merge in at a shallow angle (one-way: off-ramp before, on-ramp after)
for(const[n,c,p0,o]of EXITS){road('Ausfahrt '+n,[c,p0],{w:9,country:true,own:true,walk:0});
  const prof=[[-40,0],[-34.5,3],[-28,10],[-21,23],[-15.5,40],[-11.5,58],[-8.8,76],[-6.6,92],[-3.5,104],[0,114]];   // [offset from the Autobahn centre (town side), distance along]
  for(const sd of[-1,1]){let pts=smoothPts(prof.map(([q,t])=>o==='v'?[1272+q,p0[1]+sd*t]:[p0[0]+sd*t,1272+q]),3);pts[0]=p0;
    const off=o==='v'?sd<0:sd>0;if(off)pts=pts.slice().reverse();   // right-hand traffic: you leave before the junction and join after it
    road('Ausfahrt '+n+(sd<0?' (1)':' (2)'),pts,{w:6.5,country:true,own:true,walk:0,ramp:true,oneway:true})}}
// Garching: a small town east of the Fliegerhorststraße
for(const y of[700,740,780,820])road('Garching',[[1712,y],[1780,y],[1830,y],[1880,y]],{w:7,suburb:true,walk:2.5,own:true});
for(const x of[1780,1830,1880])road('Garching',[[x,700],[x,740],[x,780],[x,820]],{w:7,suburb:true,walk:2.5,own:true});
// Forschungszentrum Garching: campus road west of the Fliegerhorststraße
road('Lichtenbergstraße',[[1548,900],[1600,900],[1680,900],[1760,900]],{w:8,country:true,own:true,walk:2});
road('Boltzmannstraße',[[1600,812],[1600,900],[1600,1000]],{w:8,country:true,own:true,walk:2});
let G=buildGraph();
function relink(){for(const n of G.nodes)n.edges=[];for(const e of G.edges)if(e.alive){G.nodes[e.a].edges.push(e.id);if(e.b!==e.a)G.nodes[e.b].edges.push(e.id)}}
relink();
// prune short dead-end spurs (overshoots)
for(let it=0;it<6;it++){let ch=false;for(const e of G.edges){if(!e.alive)continue;const da=G.nodes[e.a].edges.length,db=G.nodes[e.b].edges.length;if((da===1||db===1)&&e.len<(e.infill?55:26)){e.alive=false;ch=true}}relink();if(!ch)break}
// thin out some infill streets for longer blocks and T-junctions
for(const e of G.edges){if(!e.alive||!e.infill)continue;if(rng()<0.16){const da=G.nodes[e.a].edges.length,db=G.nodes[e.b].edges.length;if(da>=3&&db>=3){e.alive=false;relink()}}}
// keep only the largest connected component
{const comp=new Int32Array(G.nodes.length).fill(-1);let best=-1,bestN=0,cid=0;
 for(const n of G.nodes){if(comp[n.id]>=0||!n.edges.length)continue;let cnt=0;const st=[n.id];comp[n.id]=cid;while(st.length){const v=st.pop();cnt++;for(const ei of G.nodes[v].edges){const e=G.edges[ei];const o=e.a===v?e.b:e.a;if(comp[o]<0){comp[o]=cid;st.push(o)}}}if(cnt>bestN){bestN=cnt;best=cid}cid++}
 for(const e of G.edges)if(e.alive&&comp[e.a]!==best)e.alive=false;relink()}
// compact
{const map=new Map();const nodes=[];for(const n of G.nodes)if(n.edges.length){map.set(n.id,nodes.length);nodes.push({id:nodes.length,x:n.x,y:n.y,edges:[]})}
 const edges=[];for(const e of G.edges)if(e.alive){e.id=edges.length;e.a=map.get(e.a);e.b=map.get(e.b);edges.push(e)}
 G={nodes,edges};relink()}
const nodes=G.nodes,edges=G.edges;
// node geometry
for(const n of nodes){
  let mw=0;for(const ei of n.edges)mw=Math.max(mw,edges[ei].w/2);
  n.deg=n.edges.length;
  n.r=n.deg>=3?mw+2.5:0;
  n.round=n.edges.some(ei=>edges[ei].oneway);
  n.light=null;
  if(n.deg>=3&&!n.round){const big=n.edges.some(ei=>edges[ei].lanes>=2),out=n.edges.some(ei=>roads[edges[ei].road].own);if(out){if(n.edges.some(ei=>roads[edges[ei].road].motorway)){}else if(n.deg>=4)n.light={axis:0,off:rngOut()*30}}else if(big||n.deg>=4){n.light={axis:0,off:R(0,30)}}}   // out of town: own random numbers; no traffic lights on the Autobahn
}
for(const n of nodes){if(n.light){const e=edges[n.edges[0]];const p=e.a===n.id?e.pts[1]:e.pts[e.pts.length-2];n.light.axis=Math.atan2(p[1]-n.y,p[0]-n.x)}}
for(const e of edges){
  e.clearA=nodes[e.a].r;e.clearB=nodes[e.b].r;
  if(e.clearA+e.clearB>e.len-2){const k=(e.len-2)/(e.clearA+e.clearB+1e-6);e.clearA*=k;e.clearB*=k}
  e.F={pts:e.pts,cum:e.cum};const rp=e.pts.slice().reverse();e.B={pts:rp,cum:cumLen(rp)};
  // direction leaving each node (for light grouping & markings)
  e.dirA=Math.atan2(e.pts[1][1]-e.pts[0][1],e.pts[1][0]-e.pts[0][0]);
  const m=e.pts.length;e.dirB=Math.atan2(e.pts[m-2][1]-e.pts[m-1][1],e.pts[m-2][0]-e.pts[m-1][0]);
  e.bridge=false;for(let s=0;s<e.len;s+=3){const p=pointAt(e.pts,e.cum,s);if(waterMask[Math.floor(p.y)*MAP+Math.floor(p.x)]){e.bridge=true;break}}
}
for(const n of nodes){let near=false;for(let dy=-7;dy<=7&&!near;dy++)for(let dx=-7;dx<=7;dx++){if(dx*dx+dy*dy>49)continue;const g=at(n.x+dx,n.y+dy);if(g===TY.PLAZA||g===TY.BUILD||g===TY.SOLID||g===RES){near=true;break}}n.circle=n.edges.filter(ei=>!roads[edges[ei].road].own).length===1&&!near}   // (roads added outside the city don't count: the turning circles stay as they were)
const deadEnds=nodes.filter(n=>n.circle);

/* ---------- paint roads ---------- */
const walkable=t=>t===TY.GRASS||t===TY.PARK||t===TY.BANK||t===TY.WALK||t===TY.FIELD;
const isOwn=e=>roads[e.road].own;
function paintWalk(e){fillThick(e.pts,e.w/2+e.walk,(i)=>{const g=grid[i];if(waterMask[i]){if(g!==TY.BRIDGE)grid[i]=TY.WALK}else if(walkable(g))grid[i]=TY.WALK},true)}
function paintRoad(e){fillThick(e.pts,e.w/2,(i)=>{if(grid[i]===RES)return;grid[i]=waterMask[i]?TY.BRIDGE:TY.ROAD},true)}
for(const e of edges)if(!isOwn(e))paintWalk(e);   // roads outside the city are painted later, after the city's buildings
for(const n of deadEnds)fillCircle(n.x,n.y,12.5,(i)=>{if(walkable(grid[i]))grid[i]=TY.WALK});
for(const e of edges)if(!isOwn(e))paintRoad(e);
for(const n of deadEnds)fillCircle(n.x,n.y,9,(i)=>{if(!waterMask[i]&&grid[i]!==RES)grid[i]=TY.ROAD});
// roundabout island
fillCircle(RB.x,RB.y,RB.r-4.5,set(TY.PLAZA));fillCircle(SG.x,SG.y,SG.r-4.5,set(TY.PLAZA));
// bridge railings
for(let y=1;y<MAP-1;y++)for(let x=1;x<MAP-1;x++){const i=y*MAP+x;if(grid[i]!==TY.WATER)continue;
  for(const j of[i-1,i+1,i-MAP,i+MAP]){const g=grid[j];if(waterMask[j]&&(g===TY.BRIDGE||g===TY.WALK)){grid[i]=TY.RAIL;break}}}
// zebra crossings: a strip across each street just outside its junction
const zebras=[];
for(const e of edges){if(roads[e.road].own&&roads[e.road].country)continue;for(const end of['a','b']){const n=nodes[e[end]];if(n.deg<3||n.round)continue;if(n.edges.some(ei=>roads[edges[ei].road].own&&roads[edges[ei].road].country))continue;
  const d=end==='a'?e.F:e.B;const s=n.r+1.8;if(s+2>e.len/2)continue;const p=pointAt(d.pts,d.cum,s);
  zebras.push({x:p.x,y:p.y,tx:p.tx,ty:p.ty,w:e.w});
  const nx=-p.ty,ny=p.tx;for(let k=-e.w/2;k<=e.w/2;k+=0.5)for(let a=-1.4;a<=1.4;a+=0.5){const x=Math.floor(p.x+nx*k+p.tx*a),y=Math.floor(p.y+ny*k+p.ty*a);if(x>=0&&y>=0&&x<MAP&&y<MAP)cross[y*MAP+x]=1}}}

/* ---------- landmarks (3D descriptions + footprints) ---------- */
const landmarks=[];
function stamp(poly,v){fillPoly(poly,(i)=>{grid[i]=v})}
function L(o){landmarks.push(o);return o}
// Frauenkirche: nave + two towers at the west end
L({k:'frauenkirche',name:'Frauenkirche',x:452,y:612,nave:[425,600,488,624],towers:[[418,600,432,610],[418,614,432,624]]});
stamp(rect(425,600,488,624),TY.BUILD);stamp(rect(418,600,432,610),TY.BUILD);stamp(rect(418,614,432,624),TY.BUILD);
L({k:'rathaus',name:'Neues Rathaus',x:521,y:600,box:[488,586,555,613],tower:[516,592,528,604]});stamp(rect(488,586,555,613),TY.BUILD);
L({k:'siegestor',name:'Siegestor',x:520,y:300});
stamp(rect(504,296,509,304),TY.SOLID);stamp(rect(512.5,296,515,304),TY.SOLID);stamp(rect(525,296,527.5,304),TY.SOLID);stamp(rect(531,296,536,304),TY.SOLID);
L({k:'uni',name:'Ludwig-Maximilians-Universität',x:470,y:366,blds:[[452,334,488,398,'w'],[552,334,588,398,'e']],founts:[[498,352],[498,380],[541,366]]});
stamp(rect(452,334,488,398),TY.BUILD);stamp(rect(552,334,588,398),TY.BUILD);for(const[fx,fy]of[[498,352],[498,380],[541,366]])fillCircle(fx,fy,3.2,i=>{grid[i]=TY.SOLID});
L({k:'engel',name:'Friedensengel',x:RB.x,y:RB.y});fillCircle(RB.x,RB.y,3.4,i=>{grid[i]=TY.SOLID});
L({k:'maximilianeum',name:'Maximilianeum',x:906,y:600,box:[876,572,938,630]});stamp(rect(876,572,938,630),TY.BUILD);
{const ix=riverX(878);L({k:'museum',name:'Deutsches Museum',x:ix,y:878,box:[ix-24,852,ix+22,906],tower:[ix+10,856,ix+20,866]});stamp(rect(ix-24,852,ix+22,906),TY.BUILD)}
L({k:'olympiaturm',name:'Olympiaturm',x:300,y:245});fillCircle(300,245,5,i=>{grid[i]=TY.SOLID});
{const S=L({k:'stadion',name:'Olympiastadion',x:190,y:190,rx:58,ry:44});
 for(let y=140;y<=240;y++)for(let x=125;x<=255;x++){const u=(x+0.5-190)/58,v=(y+0.5-190)/44,o=u*u+v*v,ui=(x+0.5-190)/40,vi=(y+0.5-190)/28,ii=ui*ui+vi*vi;if(o<=1&&ii>1&&Math.abs(y+0.5-190)>5)grid[y*MAP+x]=TY.BUILD;else if(ii<=1)grid[y*MAP+x]=TY.FIELD}void S}
L({k:'bmw',name:'BMW-Vierzylinder',x:418,y:160,bowl:[448,182]});
for(const[dx,dy]of[[-7,-7],[7,-7],[-7,7],[7,7]])fillCircle(418+dx,160+dy,6.5,i=>{grid[i]=TY.BUILD});fillCircle(448,182,10,i=>{grid[i]=TY.BUILD});
L({k:'arena',name:'Allianz Arena',x:1080,y:112,rx:60,ry:52});fillPoly(ellipse(1080,112,60,52,40),i=>{grid[i]=TY.BUILD});
L({k:'chinaturm',name:'Chinesischer Turm',x:655,y:300});stamp(rect(650,295,660,305),TY.BUILD);
L({k:'monopteros',name:'Monopteros',x:615,y:420});fillCircle(615,420,5,i=>{grid[i]=TY.SOLID});
L({k:'bavaria',name:'Bavaria',x:145,y:862,hall:[[128,834,135,890],[128,834,150,841],[128,883,150,890]]});stamp(rect(141,858,149,866),TY.SOLID);stamp(rect(128,834,135,890),TY.BUILD);stamp(rect(128,834,150,841),TY.BUILD);stamp(rect(128,883,150,890),TY.BUILD);
L({k:'riesenrad',name:'Riesenrad',x:330,y:830});stamp(rect(326,826,334,834),TY.SOLID);
const tents=[[245,880,40,22],[300,905,36,20],[350,875,38,22]];for(const t of tents){stamp(rect(t[0]-t[2]/2,t[1]-t[3]/2,t[0]+t[2]/2,t[1]+t[3]/2),TY.BUILD)}
L({k:'tents',tents});
L({k:'hbf',name:'Hauptbahnhof',x:268,y:640,box:[208,608,328,672]});stamp(rect(208,608,328,672),TY.BUILD);
L({k:'maibaum',x:598,y:694});fillCircle(598,694,0.8,i=>{grid[i]=TY.SOLID});
const stalls=[];for(let i=0;i<7;i++){const x=575+(i%4)*13+R(-1,1),y=678+Math.floor(i/4)*24+R(-1,1);if(Math.abs(x-598)<6&&Math.abs(y-694)<6)continue;stalls.push([x,y,R(6,8),R(4,5)]);stamp(rect(x,y,x+stalls[stalls.length-1][2],y+stalls[stalls.length-1][3]),TY.BUILD)}
L({k:'stalls',stalls});
// leftover reserved cells become plaza
for(let i=0;i<MAP*MAP;i++)if(grid[i]===RES)grid[i]=TY.PLAZA;

/* ---------- Flughafen München ---------- */
const airport=(()=>{
  const A={runways:[{x0:1618,x1:1938,y:80,w:14,name:['08L','26R']},{x0:1618,x1:1938,y:380,w:14,name:['08R','26L']}],
    taxis:[[[1640,100],[1930,100]],[[1640,360],[1930,360]],[[1646,80],[1646,124]],[[1782,80],[1782,124]],[[1924,80],[1924,124]],[[1646,336],[1646,380]],[[1782,336],[1782,380]],[[1924,336],[1924,380]],[[1760,124],[1760,336]],[[1646,100],[1646,124]]],
    apron:[1702,122,1936,338],terminals:[{box:[1680,140,1702,236],name:'Terminal 2'},{box:[1680,244,1702,340],name:'Terminal 1'}],satellite:[1818,170,1836,290],
    tower:{x:1640,y:226,r:3.4},mac:[1612,262,1656,300],garages:[[1608,168,1656,200]],hotel:[1608,306,1656,332],hangars:[[1770,18,1820,56],[1832,18,1882,56]],hangarApron:[1764,56,1890,70],stands:[]};
  const set2=v=>(i)=>{const g=grid[i];if(g===TY.GRASS||g===TY.FIELD||g===TY.PARK)grid[i]=v};
  fillPoly(rect(1582,4,1998,420),set2(TY.FIELD));                         // mown airfield grass, no trees
  for(const r of A.runways){fillPoly(rect(r.x0,r.y-r.w/2,r.x1,r.y+r.w/2),set2(TY.PLAZA));draw.zones.push({t:'runway',pts:rect(r.x0,r.y-r.w/2,r.x1,r.y+r.w/2),rw:r})}
  for(const t of A.taxis){fillThick(t,4.5,set2(TY.PLAZA),true);draw.zones.push({t:'taxi',pts:t,w:9})}
  const ap=A.apron;fillPoly(rect(ap[0],ap[1],ap[2],ap[3]),set2(TY.PLAZA));draw.zones.push({t:'apron',pts:rect(ap[0],ap[1],ap[2],ap[3])});
  const ha=A.hangarApron;fillPoly(rect(ha[0],ha[1],ha[2],ha[3]),set2(TY.PLAZA));draw.zones.push({t:'apron',pts:rect(ha[0],ha[1],ha[2],ha[3])});
  {const m=A.mac;fillPoly(rect(m[0],m[1],m[2],m[3]),set2(TY.PLAZA));draw.zones.push({t:'plaza',pts:rect(m[0],m[1],m[2],m[3])})}
  for(const t of A.terminals)stamp(rect(...t.box),TY.BUILD);stamp(rect(...A.satellite),TY.BUILD);
  for(const b of A.garages.concat([A.hotel],[A.hangars[0]]))stamp(rect(...b),TY.BUILD);
  // your hangar (the east one) is open at the front: walls left, right and at the back, you can drive and taxi in
  {const[x0,y0,x1,y1]=A.hangars[1];fillPoly(rect(x0,y0,x1,y1),(i)=>{grid[i]=TY.PLAZA});for(const r of[[x0,y0,x0+2,y1],[x1-2,y0,x1,y1],[x0,y0,x1,y0+2]])stamp(rect(...r),TY.BUILD);A.openHangar={x0:x0+2,y0:y0+2,x1:x1-2,y1,h:19};draw.zones.push({t:'apron',pts:rect(x0+2,y0+2,x1-2,y1)})}
  fillCircle(A.tower.x,A.tower.y,A.tower.r,i=>{grid[i]=TY.SOLID});
  // parked aircraft: nose to the building, fuselage and engines block the way, cars fit under the wings
  const LIV=['isar','alpen','bavaria','edelweiss','nordlicht','cargo'];let li=0;
  const stand=(x,y,a,type)=>{const T={narrow:{len:38,span:35},wide:{len:64,span:62},regio:{len:27,span:27}}[type];const st={x,y,a,type,len:T.len,span:T.span,liv:LIV[li++%LIV.length]};A.stands.push(st);
    const c=Math.cos(a),s2=Math.sin(a);fillThick([[x-c*T.len*0.46,y-s2*T.len*0.46],[x+c*T.len*0.48,y+s2*T.len*0.48]],T.len>50?3.2:2.1,(i)=>{grid[i]=TY.SOLID},false);
    for(const sd of[-1,1]){const ex=x+c*T.len*0.08-s2*sd*T.span*(T.len>50?0.18:0.17),ey=y+s2*T.len*0.08+c*sd*T.span*(T.len>50?0.18:0.17);fillCircle(ex,ey,T.len>50?1.8:1.2,(i)=>{grid[i]=TY.SOLID})}};
  for(const y of[160,200,280,320])stand(1702+4+19,y,Math.PI,'narrow');
  for(const y of[192,232,270])stand(1818-4-19,y,0,'narrow');
  for(const y of[196,266])stand(1836+4+32,y,Math.PI,'wide');
  stand(1745,40,Math.PI/2,'regio');
  // aircraft you can fly: small plane at the hangars, turboprop and airliner on the apron
  A.flyable=[{id:'f1',type:'cessna',liv:'bavaria',x:1802,y:63,a:0},{id:'f2',type:'regio',liv:'isar',x:1915,y:320,a:Math.PI},{id:'f3',type:'jet',liv:'nordlicht',x:1905,y:150,a:Math.PI/2}];
  A.fence=[[1585,8],[1995,8],[1995,412],[1614,412],[1614,352],[1677,352],[1677,150],[1585,150],[1585,8]];A.gate={x:1677,y0:237,y1:243,cells:[]};
  for(let k=0;k+1<A.fence.length;k++){const a=A.fence[k],b=A.fence[k+1];const L2=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let d=0;d<=L2;d+=0.5){const x=Math.floor(a[0]+(b[0]-a[0])*d/L2),y=Math.floor(a[1]+(b[1]-a[1])*d/L2);
    const inGate=Math.abs(x-A.gate.x)<=1&&y>=A.gate.y0&&y<=A.gate.y1;const i=y*MAP+x;if(inGate){if(!A.gate.cells.includes(i))A.gate.cells.push(i);continue}if(grid[i]!==TY.ROAD)grid[i]=TY.RAIL}}
  for(const i of A.gate.cells)grid[i]=TY.RAIL;   // closed until a player drives up
  fillPoly(A.fence,(i)=>{airside[i]=1});
  L({k:'airport',name:'Flughafen München',x:1650,y:250,A});
  return A})();
/* ---------- Fliegerhorst Isartal: military air base south-east of the city ---------- */
// fenced (compound 2), one gate in the north (opens for the military and the police), a gap in the fence in the south-west corner
const roofs=[];if(airport.openHangar)roofs.push(airport.openHangar);
const base=(()=>{
  const B={x0:1520,y0:1180,x1:1960,y1:1470,name:'Fliegerhorst Isartal',gate:{x:1750,y:1180,x0:1745,x1:1755,cells:[]},hole:{x:1520,y0:1440,y1:1442},
    runway:{x0:1560,x1:1935,y:1432,w:18,name:['09','27']},apron:[1590,1338,1762,1358],road:[1744,1180,1756,1338],tankPark:[1768,1196,1868,1244],
    shelters:[[1598,1300,1628,1338],[1648,1300,1678,1338],[1698,1300,1728,1338]],barracks:[[1538,1198,1600,1216],[1538,1228,1600,1246],[1612,1198,1680,1216]],hq:[1792,1262,1872,1288],guard:[1759,1186,1767,1194],
    taxis:[[[1663,1358],[1663,1432]],[[1600,1432],[1600,1400],[1640,1380],[1663,1380]]]};
  const fld=(i)=>{const g=grid[i];if(g===TY.GRASS||g===TY.FIELD||g===TY.PARK)grid[i]=TY.FIELD};
  fillPoly(rect(B.x0,B.y0,B.x1,B.y1),fld);
  const R=B.runway;fillPoly(rect(R.x0,R.y-R.w/2,R.x1,R.y+R.w/2),(i)=>{grid[i]=TY.PLAZA});draw.zones.push({t:'runway',pts:rect(R.x0,R.y-R.w/2,R.x1,R.y+R.w/2),rw:R});
  for(const t of B.taxis){fillThick(t,5,(i)=>{grid[i]=TY.PLAZA},true);draw.zones.push({t:'taxi',pts:t,w:10})}
  for(const r of[B.apron,B.road,B.tankPark]){fillPoly(rect(...r),(i)=>{grid[i]=TY.PLAZA});draw.zones.push({t:'apron',pts:rect(...r)})}
  for(const b of B.barracks.concat([B.hq,B.guard]))stamp(rect(...b),TY.BUILD);
  // aircraft shelters: concrete arches open to the south, a fighter jet inside each
  B.jets=[];B.tanks=[];for(const[x0,y0,x1,y1]of B.shelters){fillPoly(rect(x0,y0,x1,y1),(i)=>{grid[i]=TY.PLAZA});for(const r of[[x0,y0,x0+2,y1],[x1-2,y0,x1,y1],[x0,y0,x1,y0+2]])stamp(rect(...r),TY.BUILD);roofs.push({x0:x0+2,y0:y0+2,x1:x1-2,y1,h:9});draw.zones.push({t:'apron',pts:rect(x0+2,y0+2,x1-2,y1)});B.jets.push({x:(x0+x1)/2,y:y0+19,a:Math.PI/2})}
  for(let k=0;k<3;k++)B.tanks.push({x:B.tankPark[0]+16+k*22,y:B.tankPark[1]+24,a:Math.PI/2});
  B.trucks=[{x:B.tankPark[2]-10,y:B.tankPark[1]+12,a:Math.PI/2}];
  // posts of the guards (on foot)
  B.posts=[[1746,1172],[1756,1172],[1760,1214],[1640,1360],[1700,1360],[1830,1296],[1570,1230],[1880,1420]];
  B.fence=[[B.x0,B.y0],[B.x1,B.y0],[B.x1,B.y1],[B.x0,B.y1],[B.x0,B.y0]];
  for(let k=0;k+1<B.fence.length;k++){const a=B.fence[k],b=B.fence[k+1];const L2=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let d=0;d<=L2;d+=0.5){const x=Math.floor(a[0]+(b[0]-a[0])*d/L2),y=Math.floor(a[1]+(b[1]-a[1])*d/L2);const i=y*MAP+x;
    if(y===B.gate.y&&x>=B.gate.x0&&x<=B.gate.x1){if(!B.gate.cells.includes(i))B.gate.cells.push(i);continue}
    if(x===B.hole.x&&y>=B.hole.y0&&y<=B.hole.y1)continue;
    if(grid[i]!==TY.ROAD)grid[i]=TY.RAIL}}
  for(const i of B.gate.cells)grid[i]=TY.RAIL;
  fillPoly(B.fence,(i)=>{airside[i]=2});
  L({k:'base',name:B.name,x:1750,y:1320,B});
  return B})();
// compounds behind a fence with one gate: 1 airport, 2 air base. out/inn = a point in front of and behind the gate
const compounds=[null,{gate:{x:airport.gate.x,y:(airport.gate.y0+airport.gate.y1)/2},out:{x:airport.gate.x-15,y:(airport.gate.y0+airport.gate.y1)/2},inn:{x:airport.gate.x+15,y:(airport.gate.y0+airport.gate.y1)/2}},
  {gate:{x:base.gate.x,y:base.gate.y},out:{x:base.gate.x,y:base.gate.y-14},inn:{x:base.gate.x,y:base.gate.y+16},near:40}];   // near: the access road ends just before the gate
function roofAt(x,y){for(const r of roofs)if(x>=r.x0&&x<=r.x1&&y>=r.y0&&y<=r.y1)return r;return null}
// farmland around the city edge
for(const r of[[1250,600,1450,780],[1480,640,1700,800],[1790,460,1980,640],[1250,820,1500,1000],[1600,900,1950,1150],[1220,1220,1400,1380],[60,1230,280,1380],[450,1240,640,1400],[920,1230,1120,1360],[1250,1500,1500,1700],[100,1500,330,1700],[700,1500,950,1750],[1700,1600,1950,1900],[300,1800,600,1950],[1250,40,1420,200]]){
  fillPoly(rect(...r),(i)=>{if(grid[i]===TY.GRASS)grid[i]=TY.FIELD});draw.zones.push({t:'acker',pts:rect(...r),ang:((r[0]*7+r[1])%4)*0.4})}
// Hallbergmoos: a church on the square
L({k:'kirche',name:'Hallbergmoos',x:1700,y:520});stamp(rect(1692,512,1708,528),TY.BUILD);
/* ---------- buildings along streets ---------- */
const RING_POLY=RING_A,MR_POLY=MRING;
const WALLS=['#d9cfbd','#cdb99a','#bfc3c6','#e6dcc6','#ab9c88','#d3c9ba','#a7aeb3','#dbc6a3','#e5d1a8','#c7ab8b','#e0c9b9','#b9c2b0'];
const ROOF_FLAT=['#7d8188','#8e9196','#6c7179','#9b9384','#5f636a','#a3a7a9'];
const ROOF_TILE=['#9c4b3a','#a95b44','#8b4033','#97513e','#7e3f35'];
const buildings=[],lots=[];
function styleAt(x,y){
  if(x>1200||y>1200)return{w:[9,12],d:[8,11],h:[6,8.5],pitch:0.95,gap:[4,9],lotP:0,tall:0,fill:0,zone:'out'};   // Hallbergmoos: detached houses
  if(pip([x,y],RING_POLY))return{w:[9,16],d:[12,18],h:[15,24],pitch:0.62,gap:[0,0],lotP:0.025,tall:0,fill:0.55,zone:'alt'};
  if(pip([x,y],MR_POLY))return{w:[12,22],d:[12,20],h:[14,22],pitch:0.32,gap:[0,1.5],lotP:0.07,tall:0.02,fill:0.35,zone:'mid'};
  return{w:[14,26],d:[12,20],h:[8,17],pitch:0.12,gap:[2,7],lotP:0.09,tall:0.05,fill:0.18,zone:'out'};
}
function addBuilding(quad,h,pitched,front,cx,cy,zone,street){
  // facade style: 0 Altbau, 1 Nachkrieg/Putz, 2 Büro/Glas, 3 Backstein
  const r=rng();let style=zone==='alt'?(r<0.8?0:1):zone==='mid'?(r<0.35?0:r<0.75?1:r<0.9?3:2):(r<0.15?0:r<0.6?1:r<0.8?3:2);
  if(h>30)style=2;
  const b={pts:quad,h,wall:pickR(WALLS),roof:pitched?pickR(ROOF_TILE):pickR(ROOF_FLAT),pitched,cx,cy,front,seed:rng(),style,street:!!street};
  if(style===3)b.wall=pickR(['#a0523d','#9a4a36','#b0654b','#8e4632','#a85c44']);
  if(style===2)b.wall=pickR(['#c9ced3','#b8c0c8','#d6d9dc','#9fa9b3']);
  buildings.push(b);return b}
function quadCells(q){let ok=0,bad=0,bld=0;fillPoly(q,(i)=>{const g=grid[i];if(g===TY.GRASS)ok++;else if(g===TY.BUILD)bld++;else bad++});return{ok,bad,bld}}
function placeAlong(e,second){
  if(e.bridge||e.oneway||roads[e.road].country)return;if(second&&roads[e.road].suburb)return;
  if(roads[e.road].own){const keep=rng;rng=rngOut;try{placeAlong2(e,second)}finally{rng=keep}return}placeAlong2(e,second)}
function placeAlong2(e,second){
  for(const side of[1,-1]){
    const off=e.w/2+e.walk+0.4+(second?R(20,26):0);
    let s=e.clearA+(e.clearA?5:2);const sEnd=e.len-e.clearB-(e.clearB?5:2);
    while(s<sEnd-6){
      const p=pointAt(e.pts,e.cum,s);const st=styleAt(p.x,p.y);
      const wantLot=!second&&rng()<st.lotP;
      let bw=wantLot?R(24,34):R(st.w[0],st.w[1]);if(s+bw>sEnd)bw=sEnd-s;if(bw<6)break;
      const q=pointAt(e.pts,e.cum,s+bw);let tx=q.x-p.x,ty=q.y-p.y;const tl=hypot(tx,ty)||1;tx/=tl;ty/=tl;
      const nx=-ty*side,ny=tx*side;
      const asLot=wantLot&&bw>=20;
      let bd=asLot?R(18,22):R(st.d[0],st.d[1]);
      let placed=false;
      for(let tries=0;tries<2&&!placed;tries++){
        const P0=[p.x+nx*off,p.y+ny*off],P1=[P0[0]+tx*bw,P0[1]+ty*bw],P2=[P1[0]+nx*bd,P1[1]+ny*bd],P3=[P0[0]+nx*bd,P0[1]+ny*bd];
        const quad=[P0,P1,P2,P3];const c=quadCells(quad);
        if(c.bad===0&&c.bld<=(c.ok+c.bld)*0.08&&c.ok>20){
          if(asLot){fillPoly(quad,(i)=>{if(grid[i]===TY.GRASS)grid[i]=TY.LOT});
            const lot={pts:quad,slots:[],front:{x:(P0[0]+P1[0])/2,y:(P0[1]+P1[1])/2},nx,ny,tx,ty,cx:(P0[0]+P2[0])/2,cy:(P0[1]+P2[1])/2,w:bw,d:bd};
            for(let k=1.6;k<bw-1.6;k+=2.9)lot.slots.push({x:P0[0]+tx*k+nx*(bd-3.2),y:P0[1]+ty*k+ny*(bd-3.2),a:Math.atan2(-ny,-nx)});
            lots.push(lot);
          }else{
            fillPoly(quad,(i)=>{if(grid[i]===TY.GRASS)grid[i]=TY.BUILD});
            let h=R(st.h[0],st.h[1])*(second?0.8:1);if(!second&&rng()<st.tall)h=R(34,62);
            const pitched=h<30&&rng()<st.pitch;
            addBuilding(quad,h,pitched,{x:(P0[0]+P1[0])/2,y:(P0[1]+P1[1])/2,nx:-nx,ny:-ny},(P0[0]+P2[0])/2,(P0[1]+P2[1])/2,st.zone,true);
          }
          placed=true;s+=bw+R(st.gap[0],st.gap[1]);
        }else if(tries===0)bd*=0.6;
      }
      if(!placed)s+=2.5;
    }
  }
}
for(const e of edges)if(!isOwn(e))placeAlong(e,false);
{const onceSeen=new Set();for(const e of edges){const r=roads[e.road];if(r.own)continue;if(r.once){if(onceSeen.has(e.road))continue;onceSeen.add(e.road)}if(rng()<0.7)placeAlong(e,true)}}
/* ---------- spatial index for edges ---------- */
const ECS=24,ehash=new Map();
for(const e of edges)for(let i=0;i<e.pts.length-1;i++){const a=e.pts[i],b=e.pts[i+1];const x0=Math.floor((Math.min(a[0],b[0])-10)/ECS),x1=Math.floor((Math.max(a[0],b[0])+10)/ECS),y0=Math.floor((Math.min(a[1],b[1])-10)/ECS),y1=Math.floor((Math.max(a[1],b[1])+10)/ECS);for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const k=y*1000+x;let l=ehash.get(k);if(!l)ehash.set(k,l=[]);l.push(e.id*1000+i)}}
function nearestEdge(x,y,maxD,filter){
  const kx=Math.floor(x/ECS),ky=Math.floor(y/ECS);let best=null;const r=Math.ceil((maxD||30)/ECS);
  for(let yy=ky-r;yy<=ky+r;yy++)for(let xx=kx-r;xx<=kx+r;xx++){const l=ehash.get(yy*1000+xx);if(!l)continue;
    for(const code of l){const e=edges[Math.floor(code/1000)],i=code%1000;if(filter&&!filter(e))continue;const a=e.pts[i],b=e.pts[i+1];const dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy||1;const t=clamp(((x-a[0])*dx+(y-a[1])*dy)/L2,0,1);const px=a[0]+dx*t,py=a[1]+dy*t;const d=hypot(px-x,py-y);
      if(d<=(maxD||30)&&(!best||d<best.d))best={d,e,s:e.cum[i]+t*Math.sqrt(L2),x:px,y:py,tx:dx/Math.sqrt(L2),ty:dy/Math.sqrt(L2)}}}
  return best;
}
// courtyard and back buildings fill the remaining grass inside blocks
for(let y=8;y<MAP-8;y+=7)for(let x=8;x<MAP-8;x+=7){
  if(grid[y*MAP+x]!==TY.GRASS)continue;const st=styleAt(x,y);if(rng()>st.fill)continue;   // (outside the city fill is 0: nothing gets built there)
  const ne=nearestEdge(x,y,90,e=>!isOwn(e));if(!ne)continue;
  const tx=ne.tx,ty=ne.ty,nx=-ty,ny=tx,bw=R(9,17),bd=R(9,15),m=2;
  const c=[x-tx*bw/2-nx*bd/2,y-ty*bw/2-ny*bd/2];const Q=(a,b)=>[c[0]+tx*a+nx*b,c[1]+ty*a+ny*b];
  const cc=quadCells([Q(-m,-m),Q(bw+m,-m),Q(bw+m,bd+m),Q(-m,bd+m)]);if(cc.bad>0||cc.bld>0)continue;
  const quad=[Q(0,0),Q(bw,0),Q(bw,bd),Q(0,bd)];fillPoly(quad,(i)=>{if(grid[i]===TY.GRASS)grid[i]=TY.BUILD});
  addBuilding(quad,R(st.h[0],st.h[1])*0.85,rng()<st.pitch,{x,y,nx:0,ny:1},x,y,st.zone,false);
}

// now the roads outside the city (Autobahn, Garching, campus) and the houses along them
const mwMask=new Uint8Array(MAP*MAP),mwBarriers=[],bridges=[];
const campus={buildings:[],eso:{x:1565,y:960,r:13},ei:{x:1650,y:985,r:8}};
{const keep=rng;rng=rngOut;try{
  for(const e of edges)if(isOwn(e))paintWalk(e);for(const e of edges)if(isOwn(e))paintRoad(e);
  for(const e of edges)if(e.mw)fillThick(e.pts,e.w/2,(i)=>{mwMask[i]=1},true);
  // bridges: the Autobahn passes under these roads
  for(const r of roads){if(!r.over)continue;const o=roads.find(q=>q.name===r.over);if(!o)continue;
    for(let i=0;i+1<r.pts.length;i++)for(let j=0;j+1<o.pts.length;j++){const a=r.pts[i],b=r.pts[i+1],c=o.pts[j],d=o.pts[j+1];const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],den=rx*sy-ry*sx;if(Math.abs(den)<1e-9)continue;
      const t=((c[0]-a[0])*sy-(c[1]-a[1])*sx)/den,u=((c[0]-a[0])*ry-(c[1]-a[1])*rx)/den;if(t<0||t>1||u<0||u>1)continue;const lu=hypot(rx,ry),lo=hypot(sx,sy);
      {const cum=cumLen(o.pts);bridges.push({x:a[0]+rx*t,y:a[1]+ry*t,ux:rx/lu,uy:ry/lu,uw:r.w/2,ox:sx/lo,oy:sy/lo,ow:o.w/2,owalk:o.walk,deck:6,ramp:22,name:o.name,line:o.pts,cum,sc:cum[j]+u*lo})}}}
  const inBridge=(x,y,m)=>bridges.some(B=>{const dx=x-B.x,dy=y-B.y,au=dx*B.ux+dy*B.uy,ao=dx*B.ox+dy*B.oy;return Math.abs(ao)<B.uw+3+(m||0)&&Math.abs(au)<B.ow+B.owalk+4+(m||0)});
  // guard rails and the concrete barrier in the middle: solid; gaps only where a slip road or another road meets the Autobahn
  {const near=(x,y,r)=>{const ne=nearestEdge(x,y,r,e=>!e.mw);return!!ne&&ne.d<r};const nodeNear=(x,y,r)=>nodes.some(n=>n.edges.length>=3&&Math.abs(n.x-x)<r&&Math.abs(n.y-y)<r&&hypot(n.x-x,n.y-y)<r);
   for(const e of edges){if(!e.mw)continue;for(const side of[1,-1,0]){let cur=null;const flush=()=>{if(cur&&cur.pts.length>1)mwBarriers.push(cur);cur=null};
     for(let d=0;d<=e.len;d+=2){const p=pointAt(e.pts,e.cum,Math.min(d,e.len));const nx=-p.ty,ny=p.tx,off=side?side*(e.w/2+0.7):0,x=p.x+nx*off,y=p.y+ny*off;
       const gap=inBridge(x,y,2)?false:side?near(x,y,e.w/2+3)||nodeNear(x,y,10):nodeNear(p.x,p.y,13)||e.bridge&&false;
       if(gap){flush();continue}if(!cur)cur={kind:side?'rail':'wall',pts:[]};cur.pts.push([x,y])}flush()}}
   for(const b of mwBarriers)fillThick(b.pts,b.kind==='rail'?0.6:0.65,(i,x,y)=>{if(inBridge(x,y))return;   // under a bridge the barriers are only drawn: the cars up on the bridge cross there (the game keeps the two levels apart)
if(!waterMask[i]||grid[i]===TY.BRIDGE)grid[i]=TY.SOLID},false)}
  // the field south of Garching makes room for the research campus
  {const z=draw.zones.find(z=>z.t==='acker'&&z.pts[0][0]===1600&&z.pts[0][1]===900);if(z){fillPoly(rect(1540,900,1950,925),(i)=>{if(grid[i]===TY.FIELD)grid[i]=TY.GRASS});fillPoly(rect(1540,900,1780,1150),(i)=>{if(grid[i]===TY.FIELD)grid[i]=TY.GRASS});z.pts=rect(1780,925,1950,1150);z.bb=null}}
  // Garching: church on the square
  L({k:'kirche',name:'Garching',x:1855,y:760});stamp(rect(1847,752,1863,768),TY.BUILD);
  // Forschungszentrum Garching: TUM institutes, MPQ, ESO, the "Atom-Ei" (old research reactor) and FRM II
  const C=[{r:[1612,812,1700,846],h:17,name:'TUM Physik-Department',wall:'#d9d4c8',style:1},{r:[1612,856,1662,888],h:14,name:'TUM Chemie',wall:'#cfc8b8',style:1},
    {r:[1612,912,1700,958],h:21,name:'TUM Maschinenwesen',style:2},{r:[1545,806,1590,842],h:15,name:'MPQ · Max-Planck-Institut für Quantenoptik',style:2,wall:'#bfc6cc'},
    {r:[1545,852,1590,884],h:12,name:'Walther-Meißner-Institut',style:3},{r:[1682,966,1708,994],h:22,name:'FRM II',wall:'#d8dbdd',style:1}];
  for(const q of C){const quad=rect(...q.r);fillPoly(quad,(i)=>{grid[i]=TY.BUILD});const cx=(q.r[0]+q.r[2])/2,cy=(q.r[1]+q.r[3])/2;const b=addBuilding(quad,q.h,false,{x:cx,y:q.r[1],nx:0,ny:-1},cx,cy,'out',false);b.style=q.style;if(q.wall)b.wall=q.wall;b.campus=q.name;campus.buildings.push({name:q.name,x:cx,y:cy,h:q.h})}
  fillCircle(campus.eso.x,campus.eso.y,campus.eso.r,(i)=>{grid[i]=TY.BUILD});fillCircle(campus.ei.x,campus.ei.y,campus.ei.r,(i)=>{grid[i]=TY.BUILD});
  fillPoly(rect(1612,890,1700,896),(i)=>{if(grid[i]===TY.GRASS)grid[i]=TY.PLAZA});draw.zones.push({t:'plaza',pts:rect(1606,848,1700,856)});
  L({k:'campus',name:'Forschungszentrum Garching',x:1620,y:900,C:campus});
  for(const e of edges)if(isOwn(e))placeAlong(e,false);for(const e of edges)if(isOwn(e)&&rngOut()<0.7)placeAlong(e,true);
}finally{rng=keep}}
/* ---------- trees & street furniture ---------- */
const props=[];
function addProp(p){props.push(p)}
const okTree=(x,y)=>{const g=at(x,y);return g===TY.PARK||g===TY.GRASS||g===TY.BANK||g===TY.WALK||g===TY.PLAZA||g===TY.FIELD};
const treeAt=new Set();const FOREST=[[1300,440,60],[1480,300,70],[1500,880,90],[1900,880,80],[1330,1090,80],[1760,1350,100],[380,1460,100],[760,1300,70],[1060,1480,90],[1200,1300,55],[1100,1800,120],[1850,1750,90],[500,1850,90],[1890,480,40],[1560,1050,60]];
function tree(x,y,s){const k=Math.floor(x/3)*1000+Math.floor(y/3);if(treeAt.has(k))return;treeAt.add(k);addProp({k:'tree',x,y,r:0.45,s:s||R(0.8,1.25),hue:rng()})}
for(let y=2;y<MAP-2;y+=3)for(let x=2;x<MAP-2;x+=3){
  const g=grid[y*MAP+x];const h=rng();
  if(g===TY.PARK&&h<0.11)tree(x+R(-1,1),y+R(-1,1));
  else if(g===TY.GRASS&&(x>1200||y>1200)){const inF=FOREST.some(f=>(x-f[0])**2+(y-f[1])**2<f[2]*f[2]);if(h<0.008||(inF&&h<0.16)){tree(x+R(-1,1),y+R(-1,1),R(0.9,1.4));if(inF&&props.length&&props[props.length-1].k==='tree')props[props.length-1].forest=true}}
  else if(g===TY.GRASS&&h<0.035){let near=false;for(const[dx,dy]of[[3,0],[-3,0],[0,3],[0,-3]])if(at(x+dx,y+dy)===TY.BUILD||at(x+dx,y+dy)===TY.ROAD)near=true;if(!near)tree(x+R(-1,1),y+R(-1,1))}
  else if(g===TY.BANK&&h<0.025)tree(x,y,R(0.7,1));
}
for(const e of edges){
  if(e.oneway)continue;
  const lampStep=e.lanes>=2?26:32;
  for(const side of[1,-1]){
    const offC=e.w/2+0.7;
    for(let s=e.clearA+4;s<e.len-e.clearB-4;s+=lampStep){const p=pointAt(e.pts,e.cum,s);const nx=-p.ty*side,ny=p.tx*side;const x=p.x+nx*offC,y=p.y+ny*offC;if(at(x,y)!==TY.WALK&&!e.bridge)continue;addProp({k:'lamp',x,y,nx:-nx,ny:-ny,r:0.25})}
    if(e.alley&&!e.bridge){for(let s=e.clearA+10;s<e.len-e.clearB-6;s+=12){const p=pointAt(e.pts,e.cum,s);const nx=-p.ty*side,ny=p.tx*side;const off=e.w/2+e.walk-1.0;const x=p.x+nx*off,y=p.y+ny*off;if(at(x,y)===TY.WALK)tree(x,y,R(0.85,1.1))}}
    for(let s=e.clearA+8;s<e.len-e.clearB-8;s+=R(40,90)){const p=pointAt(e.pts,e.cum,s);const nx=-p.ty*side,ny=p.tx*side;const off=e.w/2+(rng()<0.5?0.9:e.walk-0.8);const x=p.x+nx*off,y=p.y+ny*off;if(at(x,y)!==TY.WALK)continue;addProp({k:rng()<0.5?'hydrant':'bin',x,y,r:0.35})}
  }
}
// Wiesn & plaza decor: benches as bins? keep tidy

/* ---------- special places ---------- */
function nearestCell(x,y,pred,maxR){maxR=maxR||120;const cx=Math.floor(x),cy=Math.floor(y);for(let r=0;r<maxR;r++){let best=null,bd=1e9;for(let yy=cy-r;yy<=cy+r;yy++)for(let xx=cx-r;xx<=cx+r;xx++){if(Math.max(Math.abs(xx-cx),Math.abs(yy-cy))!==r)continue;if(pred(at(xx,yy),xx,yy)){const d=(xx-cx)**2+(yy-cy)**2;if(d<bd){bd=d;best={x:xx+0.5,y:yy+0.5}}}}if(best)return best}return{x,y}}
const isWalk=t=>t===TY.WALK||t===TY.PLAZA;
function nearestLot(x,y,used){let best=null,bd=1e9;for(const l of lots){if(used.includes(l))continue;const d=hypot(l.cx-x,l.cy-y);if(d<bd){bd=d;best=l}}return best}
const usedLots=[];
const zones=[];
function zone(kind,name,x,y){const l=nearestLot(x,y,usedLots);if(!l)return null;usedLots.push(l);const z={kind,name,lot:l,x:l.cx,y:l.cy,r:Math.min(l.w,l.d)/2+1};l.slots=kind==='home'||kind==='hehler'||kind==='safe'?l.slots.slice(0,Math.min(3,l.slots.length)):kind==='klinik'?l.slots.slice(0,Math.min(2,l.slots.length)):[];if(kind==='klinik')for(const sl of l.slots)sl.depot='krankenwagen';zones.push(z);return z}
zone('home','Deine Garage',705,600);
zone('werkstatt','Werkstatt Westend',220,740);
zone('werkstatt','Werkstatt Haidhausen',1010,690);
zone('hehler','Hehler',150,520);
zone('safe','Versteck Giesing',990,1100);
zone('lack','Lackiererei Glockenbach',600,880);
zone('lack','Lackiererei Maxvorstadt',400,430);
// depots for the job vehicles
zone('klinik','Klinikum Innenstadt',470,870);
zone('feuerwache','Hauptfeuerwache',590,760);
zone('depot','MVG-Betriebshof',120,620);
zone('brauerei','Brauerei am Nockherberg',960,1060);
const shopDefs=[['waffen','Büchsenmacher',190,735],['waffen','Waffen Huber',1060,780],['imbiss','Viktualienmarkt-Stand',590,705],['imbiss','Wiesn-Brotzeit',330,812],['imbiss','Olympia-Kiosk',265,215]];
const shops=[];
for(const[k,name,x,y]of shopDefs){
  let b=null,bd=1e9;for(const bb of buildings){const d=hypot(bb.front.x-x,bb.front.y-y);if(d<bd){bd=d;b=bb}}
  let door;
  if(b&&bd<60){door={x:b.front.x+b.front.nx*1.8,y:b.front.y+b.front.ny*1.8};b.shop=k;b.shopName=name}
  else door=nearestCell(x,y,isWalk);
  const c=nearestCell(door.x,door.y,isWalk,10);
  shops.push({k,name,x:c.x,y:c.y,b});
}
/* ---------- properties: a free starter flat and five homes for sale, each with its own parking lot ---------- */
const PROP_DEFS=[
  ['lehel','Startwohnung Lehel',0,null,3,0],
  ['giesing','Wohnung Giesing',2500,[930,1120],2,0],
  ['westend','Wohnung Westend',5000,[110,735],2,0],
  ['haidhausen','Altbau Haidhausen',9000,[1080,760],3,0],
  ['olympia','Penthouse Olympiadorf',15000,[260,330],3,250],
  ['bogenhausen','Villa Bogenhausen',30000,[1040,330],4,600],
];
const properties=[];
for(const[id,name,price,anchor,nslots,income]of PROP_DEFS){
  let lot;if(!anchor){lot=zones.find(z=>z.kind==='home').lot}else{lot=nearestLot(anchor[0],anchor[1],usedLots);if(!lot)continue;usedLots.push(lot)}
  lot.slots=lot.slots.slice(0,Math.min(nslots,lot.slots.length));for(const sl of lot.slots)sl.prop=id;
  let b=null,bd=1e9;for(const bb of buildings){if(!bb.street||bb.shop||bb.property)continue;const d=hypot(bb.front.x-lot.front.x,bb.front.y-lot.front.y);if(d<bd){bd=d;b=bb}}
  let door;if(b&&bd<70){b.property=id;door=nearestCell(b.front.x+b.front.nx*1.6,b.front.y+b.front.ny*1.6,t=>t===TY.WALK||t===TY.PLAZA,12)}else door=nearestCell(lot.front.x,lot.front.y,t=>t===TY.WALK,20);
  properties.push({id,name,price,income,slots:lot.slots.length,lot,b,x:door.x,y:door.y,gx:lot.cx,gy:lot.cy,gr:Math.min(lot.w,lot.d)/2+1.5});
}
// the hangar at the airport: buy it and your private jet waits inside, an armed helicopter on the apron in front
properties.push({id:'hangar',name:'Hangar am Flughafen',price:40000,income:0,slots:2,hangar:true,lot:null,b:null,x:1857,y:58.5,gx:1857,gy:64,gr:0,
  fleet:[{type:'kampfheli',x:1840,y:64.5,a:Math.PI/2},{type:'privatjet',x:1857,y:35,a:Math.PI/2}]});
const phoneDefs=[[520,671],[345,630],[532,330],[1000,700],[335,205],[600,905],[200,742],[880,1060],[1000,400]];
const phones=phoneDefs.map(([x,y])=>{const c=nearestCell(x,y,t=>t===TY.WALK);return{x:c.x,y:c.y}});
const placesDef=[['Flughafen München',1650,250],['Hallbergmoos',1680,520],['Universität',505,366],['Marienplatz',520,668],['Hauptbahnhof',345,640],['Siegestor',530,320],['Friedensengel',RB.x,RB.y+30],['Maximilianeum',864,640],['Deutsches Museum',riverX(860),846],['Olympiapark',336,200],['BMW-Welt',440,212],['Allianz Arena',1010,112],['Theresienwiese',290,790],['Viktualienmarkt',600,668],['Chinesischer Turm',610,300],['Sendlinger Tor',432,780],['Isartor',690,662],['Odeonsplatz',520,490],['Giesinger Berg',960,1080],['Haidhausen',1040,700],['Bogenhausen',1000,380],['Westend',150,740],['Schwabing',515,180],['Glockenbachviertel',600,920],['Garching',1830,760],['Forschungszentrum Garching',1620,900],['Fliegerhorst Isartal',1750,1170]];
const places=placesDef.map(([name,x,y])=>{const c=nearestCell(x,y,t=>t===TY.WALK||t===TY.PLAZA||t===TY.ROAD);return{name,x:c.x,y:c.y}});
const pickupKinds=['health','health','health','health','health','armor','armor','armor','pistol','pistol','pistol','pistol','smg','smg','shotgun','grenade','health','pistol'];
const pickups=pickupKinds.map(k=>{for(let i=0;i<50;i++){const x=R(60,MAP-60),y=R(60,MAP-60);const g=at(x,y);if(g===TY.WALK||g===TY.PLAZA||g===TY.PARK){return{k,x:Math.floor(x)+0.5,y:Math.floor(y)+0.5}}}return null}).filter(Boolean);

function roadPts(name){const r=roads.find(r=>r.name===name);return r?r.pts:null}

/* ---------- online activities: bank, casino, race starts ---------- */
function pickBuilding(x,y,minH){let best=null,bd=1e9;for(const b of buildings){if(!b.street||b.h<minH||b.property!==undefined||b.bank||b.casino)continue;const d=hypot(b.cx-x,b.cy-y);if(d<bd){bd=d;best=b}}return best}
function doorOf(b){return nearestCell(b.front.x+b.front.nx*1.6,b.front.y+b.front.ny*1.6,t=>t===TY.WALK||t===TY.PLAZA,12)}
const bank=(()=>{const b=pickBuilding(468,566,14);if(!b)return null;b.bank=true;b.wall='#d9d2c0';b.style=0;const d=doorOf(b);
  // two more service doors on the other corners of the block (alarm panel, camera room)
  const terms=[{x:d.x,y:d.y,name:'Tresorschloss'}];const cs=b.pts.map(p=>{const dx=p[0]-b.cx,dy=p[1]-b.cy,l=hypot(dx,dy)||1;return nearestCell(p[0]+dx/l*2.2,p[1]+dy/l*2.2,t=>t===TY.WALK||t===TY.PLAZA||t===TY.GRASS||t===TY.LOT,10)}).filter(Boolean);
  cs.sort((a,c)=>hypot(c.x-d.x,c.y-d.y)-hypot(a.x-d.x,a.y-d.y));if(cs[0])terms.push({x:cs[0].x,y:cs[0].y,name:'Alarmanlage'});if(cs[1])terms.push({x:cs[1].x,y:cs[1].y,name:'Kameraraum'});
  return{b,x:d.x,y:d.y,terms,name:'Isarbank'}})();
const casino=(()=>{const b=pickBuilding(532,236,12);if(!b)return null;b.casino=true;b.style=2;b.wall='#3a2a4a';const d=doorOf(b);return{b,x:d.x,y:d.y,name:'Spielbank Isar'}})();
const raceDefs=[
  {id:'ring',name:'Altstadtring-Rallye',x:600,y:481,road:'Altstadtring',laps:1},
  {id:'leo',name:'Leopold-Sprint',x:521,y:262,via:[[521,180],[523,60],[700,110],[1000,112]]},
  {id:'muc',name:'Flughafen-Run',x:1640,y:560,pts:[[1640,540],[1620,500],[1600,470],[1602,420],[1604,370],[1606,340],[1650,338],[1668,300],[1668,252],[1692,240],[1730,240],[1750,270],[1760,320],[1782,360],[1800,380],[1870,380],[1934,380]]}];
/* ---------- life on the squares ---------- */
const drng=mulberry32(0xD3C0);
const DR=(a,b)=>a+(b-a)*drng();
const xmas=(()=>{const d=new Date(),m=d.getMonth(),day=d.getDate();return(m===10&&day>=20)||(m===11&&day<=24)})();
const openCell=g=>g===TY.PLAZA||g===TY.WALK;
function freeAt(x,y,r){for(let yy=Math.floor(y-r);yy<=y+r;yy++)for(let xx=Math.floor(x-r);xx<=x+r;xx++){if(!openCell(at(xx,yy)))return false}for(const p of props)if(Math.abs(p.x-x)<r+0.8&&Math.abs(p.y-y)<r+0.8)return false;return true}
function deco(k,x,y,a,r){if(!freeAt(x,y,r))return false;props.push({k,x,y,a:a||0,r,deco:true});return true}
// Marienplatz: column with the Virgin Mary, the fish fountain in front of the town hall
L({k:'mariensaeule',name:'Mariensäule',x:521,y:640});fillCircle(521,640,1.9,i=>{grid[i]=TY.SOLID});
L({k:'brunnen',name:'Fischbrunnen',x:543,y:624});fillCircle(543,624,2.7,i=>{grid[i]=TY.SOLID});
const market=[];
if(xmas){
  // Christkindlmarkt: rows of wooden huts and a big tree
  for(const[y0,xs]of[[659,[484,491,498,505,535,542,549,556]],[630,[486,493,500,507]]]){for(const x of xs){market.push([x,y0,3.6,2.4]);stamp(rect(x-1.8,y0-1.2,x+1.8,y0+1.2),TY.SOLID)}}
  L({k:'xmas',stalls:market,tree:{x:516,y:624}});fillCircle(516,624,2.2,i=>{grid[i]=TY.SOLID});
}
// benches, flower tubs, bollards, bike racks and café terraces
const PLAZA_RECTS=[[478,615,565,668],[408,586,493,640],[568,670,628,718],[330,604,352,672],[498,486,545,512]];
for(const[x0,y0,x1,y1]of PLAZA_RECTS){
  const area=(x1-x0)*(y1-y0);
  for(let i=0;i<area/110;i++){const x=DR(x0+3,x1-3),y=DR(y0+3,y1-3);const k=drng();
    if(k<0.35)deco('bench',x,y,drng()<0.5?0:Math.PI/2,0.9);else if(k<0.6)deco('planter',x,y,0,0.7);else if(k<0.78)deco('bikes',x,y,drng()<0.5?0:Math.PI/2,1.0);else deco('bollard',x,y,0,0.3)}
  // bollards where the square meets a street
  for(let x=x0;x<=x1;x+=3)for(const y of[y0-1,y1+1]){if(at(x,y+(y<y0?2:-2))===TY.PLAZA&&(at(x,y)===TY.ROAD||at(x,y-(y<y0?1:-1))===TY.ROAD))deco('bollard',x,y+(y<y0?2:-2),0,0.3)}
}
// café terraces (Viktualienmarkt and Odeonsplatz always, Marienplatz outside the Christmas season)
const cafes=[[600,712,5],[512,505,4],[530,506,3]];if(!xmas)cafes.push([500,662,6],[545,662,5]);
for(const[cx,cy,n]of cafes)for(let i=0;i<n;i++)deco('parasol',cx+(i%3)*3.6-3.6+DR(-0.4,0.4),cy-Math.floor(i/3)*3.6+DR(-0.4,0.4),drng()*6,1.0);
// Kaufingerstraße: the pedestrian street gets benches, tubs and bikes
for(let x=372;x<476;x+=9){const y=650-(x-364)*0.06+(drng()<0.5?-4.5:4.5);const k=drng();deco(k<0.4?'bench':k<0.7?'planter':'bikes',x,y,0,0.8)}
// benches in the parks
for(let i=0,n=0;i<400&&n<70;i++){const x=DR(40,1160),y=DR(40,1160);if(at(x,y)!==TY.PARK)continue;let nearPath=false;for(const[dx,dy]of[[3,0],[-3,0],[0,3],[0,-3]])if(at(x+dx,y+dy)!==TY.PARK)nearPath=true;if(nearPath)continue;props.push({k:'bench',x,y,a:drng()*6,r:0.9,deco:true});n++}
// groups of people that hang around at the sights
const crowds=[{x:521,y:631,r:9,n:14,face:-Math.PI/2},{x:452,y:632,r:6,n:7,face:-Math.PI/2},{x:598,y:702,r:9,n:12,face:0},{x:521,y:498,r:7,n:8,face:-Math.PI/2},{x:342,y:640,r:5,n:7,face:Math.PI},{x:430,y:648,r:12,n:10,face:0}];
if(xmas)crowds.push({x:520,y:652,r:12,n:18,face:Math.PI/2});
// pigeons
const pigeons=[[515,650],[532,640],[600,694],[515,498],[452,628]];

/* ---------- stunt ramps ---------- */
const ramps=[];
{const fast=g=>g===TY.ROAD||g===TY.WALK||g===TY.PLAZA||g===TY.FIELD||g===TY.LOT||g===TY.BRIDGE;const solid=g=>g===TY.BUILD||g===TY.SOLID||g===TY.RAIL;
 for(let i=0;i<20000&&ramps.length<8;i++){const x=DR(40,1160),y=DR(40,1160);const g0=at(x,y);if(g0!==TY.PLAZA&&g0!==TY.FIELD&&g0!==TY.LOT&&g0!==TY.WALK)continue;if(hypot(x-521,y-640)<50||hypot(x-SG.x,y-SG.y)<34||x>1200)continue;const a=drng()*Math.PI*2,c=Math.cos(a),s2=Math.sin(a);
   if(ramps.some(r=>hypot(r.x-x,r.y-y)<140))continue;let ok=true,nf=0,n=0;
   for(let d=-45;d<=48&&ok;d+=2)for(const o of[-2.2,0,2.2]){const px=x+c*d-s2*o,py=y+s2*d+c*o;const g=at(px,py);if(solid(g)){ok=false;break}if(d<0){n++;if(fast(g))nf++}if(d>=-3&&d<=4&&g===TY.ROAD){ok=false;break}}
   if(ok&&nf/n>0.75)ramps.push({i:ramps.length,x,y,a,len:6,wid:4,h:1.5})}}

/* ---------- hidden packages: 30 Weißwurst bags ---------- */
const packages=[];
for(let i=0;i<20000&&packages.length<30;i++){const x=Math.floor(DR(30,1170))+0.5,y=Math.floor(DR(30,1170))+0.5;const g=at(x,y);if(!(g===TY.WALK||g===TY.PARK||g===TY.GRASS||g===TY.PLAZA||g===TY.BANK))continue;
  let road=false,bld=false;for(let dy=-6;dy<=6&&!road;dy+=2)for(let dx=-6;dx<=6;dx+=2){const q=at(x+dx,y+dy);if(q===TY.ROAD)road=true;if(q===TY.BUILD)bld=true}
  if(road||!bld)continue;if(packages.some(p=>hypot(p.x-x,p.y-y)<70))continue;packages.push({i:packages.length,x,y})}

/* ---------- railway into the Hauptbahnhof (from a tunnel in the west; laid out after everything else, so nothing else moves) ---------- */
const rail=(()=>{const Rr={x0:120,portal:122,buffer:309,cut:{x0:121,x1:170,y0:623,y1:671,depth:5.5},y0:620,y1:672,hall:[208,624,312,672],tracks:[630,642,654,666],platforms:[[214,634,306,638],[214,658,306,662]]};
  const hit=(pts)=>pts.some(q=>q[0]>=Rr.x0-1&&q[0]<=Rr.hall[0]+1&&q[1]>=Rr.y0&&q[1]<=Rr.y1);
  // clear the block between the tunnel and the station (buildings, trees, bins)
  for(let i=buildings.length-1;i>=0;i--){const b=buildings[i];if(!hit(b.pts))continue;fillPoly(b.pts,(k)=>{if(grid[k]===TY.BUILD)grid[k]=TY.GRASS});buildings.splice(i,1)}
  for(let i=props.length-1;i>=0;i--){const q=props[i];if(q.x>=Rr.x0-1&&q.x<=Rr.hall[0]+1&&q.y>=Rr.y0-1&&q.y<=Rr.y1+1)props.splice(i,1)}
  for(let i=props.length-1;i>=0;i--){const q=props[i];const ne=nearestEdge(q.x,q.y,16,e=>isOwn(e)&&roads[e.road].country);if(ne&&ne.d<ne.e.w/2+(q.k==='tree'?3.5:1.6))props.splice(i,1)}
  // the hall is open to the west now: the old west wing and hall floor become track bed; the front building (north) and the concourse (east) stay
  fillPoly(rect(Rr.x0,Rr.y0+2,Rr.hall[2],Rr.y1-2),(k)=>{grid[k]=TY.GRASS});
  for(const y of Rr.tracks)fillPoly(rect(Rr.x0,y-2.2,Rr.hall[2],y+2.2),(k)=>{grid[k]=TY.ROAD});
  for(const pf of Rr.platforms)fillPoly(rect(...pf),(k)=>{grid[k]=TY.PLAZA});
  fillPoly(rect(Rr.hall[2]-2,Rr.hall[1],Rr.hall[2],Rr.hall[3]),(k)=>{grid[k]=TY.BUILD});   // buffer wall of the concourse
  fillPoly(rect(Rr.x0-2,Rr.y0,Rr.x0+2,Rr.y1),(k)=>{if(!Rr.tracks.some(y=>Math.abs(Math.floor(k/MAP)+0.5-y)<2.4))grid[k]=TY.SOLID});   // tunnel portal (openings for the tracks)
  roofs.push({x0:Rr.hall[0],y0:Rr.hall[1],x1:Rr.hall[2],y1:Rr.hall[3],h:16});
  // west of the station the tracks dip into a cutting and disappear into the tunnel: the cutting is walled off
  {const C=Rr.cut;fillPoly(rect(C.x0-1,C.y0,C.x1,C.y1),(k)=>{grid[k]=TY.SOLID})}
  draw.zones.push({t:'apron',pts:rect(Rr.x0,Rr.y0,Rr.hall[2],Rr.y1)});
  return Rr})();
/* ---------- Monopteros on its hill in the Englischer Garten (moved a little into the park so the hill fits) ---------- */
const hill=(()=>{const L0=landmarks.find(l=>l.k==='monopteros');if(!L0)return null;const H={x:642,y:420,r:24,h:7};
  fillCircle(L0.x,L0.y,5,(i)=>{if(grid[i]===TY.SOLID)grid[i]=TY.PARK});L0.x=H.x;L0.y=H.y;fillCircle(H.x,H.y,5.2,(i)=>{grid[i]=TY.SOLID});
  for(let i=props.length-1;i>=0;i--){const q=props[i];if(hypot(q.x-H.x,q.y-H.y)<H.r+1)props.splice(i,1)}   // a clean lawn on the hill
  return H})();
// height of a road that crosses the Autobahn on a bridge (ramps up on embankments to the deck); 0 elsewhere
function bridgeProfile(B,s){const a=Math.abs(s-B.sc)-(B.uw+3);if(a>B.ramp)return 0;const k=a<=0?1:1-a/B.ramp;return B.deck*k*k*(3-2*k)}
function bridgeH(x,y){for(const B of bridges){const dx=x-B.x,dy=y-B.y;if(Math.abs(dx)>80||Math.abs(dy)>80)continue;
  // nearest point on the road's own centre line (so the ramps follow its curve)
  let best=1e9,bs=0;const L=B.uw+3+B.ramp+4;for(let i=0;i+1<B.line.length;i++){if(B.cum[i+1]<B.sc-L||B.cum[i]>B.sc+L)continue;const p=B.line[i],q=B.line[i+1],sx=q[0]-p[0],sy=q[1]-p[1],l2=sx*sx+sy*sy||1;const t=clamp(((x-p[0])*sx+(y-p[1])*sy)/l2,0,1);const d=hypot(x-p[0]-sx*t,y-p[1]-sy*t);if(d<best){best=d;bs=B.cum[i]+t*Math.sqrt(l2)}}
  if(best>B.ow+B.owalk+1.5)continue;return bridgeProfile(B,bs)}return 0}
function hillAt(x,y){const H=hill;if(!H)return 0;const dx=x-H.x,dy=y-H.y;if(Math.abs(dx)>H.r||Math.abs(dy)>H.r)return 0;const d=Math.hypot(dx,dy)/H.r;if(d>=1)return 0;const k=1-d*d;return H.h*k*k}
/* ---------- prop spatial grid ---------- */
// obstacle heights for flying (2 m cells): buildings, landmarks, towers
const HC=2,HW=MAP/HC,hgrid=new Uint8Array(HW*HW);
{const hset=(x,y,h)=>{const i=Math.floor(y/HC)*HW+Math.floor(x/HC);if(i>=0&&i<hgrid.length&&hgrid[i]<h)hgrid[i]=Math.min(255,h)};
 for(let y=0;y<MAP;y+=HC)for(let x=0;x<MAP;x+=HC){const g=grid[y*MAP+x];if(g===TY.BUILD)hset(x,y,28);else if(g===TY.SOLID&&!airside[y*MAP+x])hset(x,y,14)}
 for(const b of buildings){const h=Math.round(b.h+(b.pitched?4:1));fillPoly(b.pts,(i,x,y)=>{const k=Math.floor(y/HC)*HW+Math.floor(x/HC);hgrid[k]=Math.min(255,h)})}
 const tall={olympiaturm:[7,190],arena:[0,52],engel:[5,40],mariensaeule:[4,24],siegestor:[0,26],bavaria:[0,22],kirche:[0,28],uni:[0,24],maximilianeum:[0,30],museum:[0,40],chinaturm:[0,26],monopteros:[0,18],bmw:[0,100],riesenrad:[18,40]};
 for(const L of landmarks){const t=tall[L.k];if(!t)continue;if(t[0])fillCircle(L.x,L.y,t[0],(i,x,y)=>hset(x,y,t[1]));else if(t[1])for(let y=L.y-70;y<L.y+70;y+=HC)for(let x=L.x-70;x<L.x+70;x+=HC){const g=at(x,y);if(g===TY.BUILD||g===TY.SOLID){const k=Math.floor(y/HC)*HW+Math.floor(x/HC);if(k>=0&&k<hgrid.length)hgrid[k]=Math.max(hgrid[k]>28?hgrid[k]:0,t[1])}}}
 const fk=landmarks.find(l=>l.k==='frauenkirche');if(fk)for(const r of fk.towers)fillPoly(rect(...r),(i,x,y)=>hset(x,y,99));
 // airport: exact heights of what is actually drawn (the generic 28 m for building cells was far too tall, the parked jets were round blobs)
 const A=airport;if(A){const hard=(r,h)=>fillPoly(rect(...r),(i,x,y)=>{hgrid[Math.floor(y/HC)*HW+Math.floor(x/HC)]=h});
  for(const t of A.terminals)hard(t.box,16);hard(A.satellite,13);for(const b of A.garages)hard(b,17);hard(A.hotel,26);hard(A.hangars[0],19);
  {const[x0,y0,x1,y1]=A.hangars[1];hard([x0,y0,x1,y1],0);for(const r of[[x0,y0,x0+2,y1],[x1-2,y0,x1,y1],[x0,y0,x1,y0+2]])hard(r,19)}
  fillCircle(A.tower.x,A.tower.y,3.2,(i,x,y)=>hset(x,y,60));
  for(const st of A.stands){if(st.fly)continue;const c=Math.cos(st.a),s2=Math.sin(st.a),wide=st.type==='wide',r=wide?3.2:st.type==='regio'?1.6:2.2,fh=wide?10:st.type==='regio'?5:7.5;
    fillThick([[st.x-c*st.len*0.47,st.y-s2*st.len*0.47],[st.x+c*st.len*0.48,st.y+s2*st.len*0.48]],r,(i,x,y)=>hset(x,y,fh),false);                        // fuselage
    fillThick([[st.x-s2*st.span*0.48,st.y+c*st.span*0.48],[st.x+s2*st.span*0.48,st.y-c*st.span*0.48]],1.6,(i,x,y)=>hset(x,y,Math.round(r+2.4)),false);     // wings
    fillThick([[st.x-c*st.len*0.44,st.y-s2*st.len*0.44],[st.x-c*st.len*0.36,st.y-s2*st.len*0.36]],0.6,(i,x,y)=>hset(x,y,fh+(wide?9:6)),false)}}}
{const B=base,hard=(r,h)=>fillPoly(rect(...r),(i,x,y)=>{hgrid[Math.floor(y/HC)*HW+Math.floor(x/HC)]=h});fillPoly(rect(B.x0,B.y0,B.x1,B.y1),(i,x,y)=>{if(grid[i]!==TY.BUILD)hgrid[Math.floor(y/HC)*HW+Math.floor(x/HC)]=0});
  for(const b of B.barracks)hard(b,10);hard(B.hq,13);hard(B.guard,4);for(const[x0,y0,x1,y1]of B.shelters){hard([x0,y0,x1,y1],0);for(const r of[[x0,y0,x0+2,y1],[x1-2,y0,x1,y1],[x0,y0,x1,y0+2]])hard(r,9)}}
if(hill)fillCircle(hill.x,hill.y,hill.r,(i,x,y)=>{const k=Math.floor(y/HC)*HW+Math.floor(x/HC);hgrid[k]=Math.max(hgrid[k],Math.ceil(hillAt(x,y)))});
for(const B of bridges)fillCircle(B.x,B.y,B.ow+B.owalk+2,(i,x,y)=>{const k=Math.floor(y/HC)*HW+Math.floor(x/HC);hgrid[k]=Math.max(hgrid[k],Math.ceil(B.deck+1))});
for(const b of mwBarriers)fillThick(b.pts,0.6,(i,x,y)=>{hgrid[Math.floor(y/HC)*HW+Math.floor(x/HC)]=1},false);   // barriers are low: no 14 m wall for aircraft
{const C=rail.cut;fillPoly(rect(C.x0-1,C.y0,C.x1,C.y1),(i,x,y)=>{hgrid[Math.floor(y/HC)*HW+Math.floor(x/HC)]=1})}
{const C=campus;const set=(cx,cy,r,h)=>fillCircle(cx,cy,r,(i,x,y)=>{hgrid[Math.floor(y/HC)*HW+Math.floor(x/HC)]=h});set(C.eso.x,C.eso.y,C.eso.r,12);set(C.ei.x,C.ei.y,C.ei.r,16)}
function heightAt(x,y){const i=Math.floor(y/HC)*HW+Math.floor(x/HC);return(x<0||y<0||x>=MAP||y>=MAP)?0:hgrid[i]}
const PCS=8,PGW=Math.ceil(MAP/PCS),pgrid=new Array(PGW*PGW);
props.forEach((p,i)=>{p.i=i;const k=Math.floor(p.y/PCS)*PGW+Math.floor(p.x/PCS);(pgrid[k]||(pgrid[k]=[])).push(p)});
function propsNear(x,y,r){const out=[];const x0=Math.max(0,Math.floor((x-r)/PCS)),x1=Math.min(PGW-1,Math.floor((x+r)/PCS)),y0=Math.max(0,Math.floor((y-r)/PCS)),y1=Math.min(PGW-1,Math.floor((y+r)/PCS));for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){const a=pgrid[yy*PGW+xx];if(a)for(const p of a)out.push(p)}return out}

IH.world={MAP,TY,grid,cross,waterMask,airside,at,nodes,edges,roads,buildings,lots,props,propsNear,landmarks,zones,shops,phones,places,pickups,zebras,draw,properties,ramps,packages,crowds,pigeons,xmas,
  riverX,riverHalf,islandHalf,westX,eastX,RB,SG,airport,base,compounds,roofs,roofAt,mwMask,mwBarriers,bridges,bridgeH,bridgeProfile,campus,rail,hill,hillAt,bank,casino,raceDefs,heightAt,pointAt,cumLen,nearestEdge,roadPts,ellipse,tents,RING_POLY,MR_POLY,districts,pip};
IH.util={mulberry32,clamp,hypot,pointAt,cumLen};
})(window));
