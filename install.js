// 2Isar2Heat – install gate. On phones and tablets the game only runs as an installed app (started from the
// home screen, full screen, no browser bars). Opened in the browser, it shows an install screen instead:
// Android gets a one-tap install button (the browser's install prompt), iPhone/iPad get step-by-step
// instructions for Safari's "Zum Home-Bildschirm". The screen has no close button and the game does not boot
// behind it. Desktop browsers are not gated.
(function(){
'use strict';
const ua=navigator.userAgent||'';
const iOS=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const android=/Android/i.test(ua);
const mobile=iOS||android||!!(navigator.userAgentData&&navigator.userAgentData.mobile);
const mm=q=>{try{return matchMedia(q).matches}catch(e){return false}};
const standalone=navigator.standalone===true||mm('(display-mode: standalone)')||mm('(display-mode: fullscreen)')||mm('(display-mode: minimal-ui)')||document.referrer.startsWith('android-app://');
const blocked=mobile&&!standalone;
window.IH_GATE={blocked,iOS,android,standalone};
// Android: keep the browser's install prompt for our button
let bip=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();bip=e;if(window.IH_GATE.ready)window.IH_GATE.ready()});
window.addEventListener('appinstalled',()=>{bip=null;if(window.IH_GATE.installed)window.IH_GATE.installed()});
if(!blocked)return;

const css=`
:host{all:initial}
[hidden]{display:none!important}
#gate{position:fixed;inset:0;z-index:2147483000;background:radial-gradient(120% 90% at 50% 0%,#1f2a3a 0%,#0e1013 62%);color:#f1ede2;display:flex;
  font-family:'Barlow Condensed','Arial Narrow',system-ui,sans-serif;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;
  padding:calc(env(safe-area-inset-top,0px) + 20px) 18px calc(env(safe-area-inset-bottom,0px) + 28px)}
#gate.iph{padding-bottom:calc(env(safe-area-inset-bottom,0px) + 84px)}
#gate *{box-sizing:border-box}
#gate .card{width:100%;max-width:560px;margin:auto}
#gate .head{display:flex;align-items:center;gap:16px;margin-bottom:18px}
#gate .head img{width:76px;height:76px;border-radius:18px;box-shadow:0 6px 22px rgba(0,0,0,.45);flex:none}
#gate h1{font-family:'Bungee',Impact,'Arial Black',sans-serif;font-weight:400;font-size:28px;line-height:1.05;margin:0;color:#ffc61a;letter-spacing:.5px}
#gate .sub{margin:4px 0 0;font-size:18px;color:#a3a9b2;font-weight:600;line-height:1.2}
#gate .why{font-size:19px;line-height:1.3;margin:0 0 18px;font-weight:600}
#gate ol{list-style:none;margin:0;padding:0;display:grid;gap:10px}
#gate li{display:flex;gap:14px;align-items:center;background:rgba(255,255,255,.06);border:1px solid rgba(241,237,226,.14);border-radius:14px;padding:12px 14px;font-size:19px;line-height:1.25;font-weight:600}
#gate li .n{flex:none;width:34px;height:34px;border-radius:50%;background:#ffc61a;color:#0e1013;display:flex;align-items:center;justify-content:center;font-family:'Bungee',Impact,sans-serif;font-size:17px}
#gate li b{color:#fff}#gate li small{display:block;color:#a3a9b2;font-size:16px;margin-top:3px}
#gate .ico{display:inline-flex;vertical-align:-6px;width:28px;height:28px;align-items:center;justify-content:center;background:#f1ede2;border-radius:7px;margin:0 3px}
#gate .ico svg{width:20px;height:20px}
#gate .btn{display:block;width:100%;border:0;border-radius:16px;padding:18px 20px;font-family:'Bungee',Impact,sans-serif;font-size:21px;background:#ffc61a;color:#0e1013;margin:6px 0 14px;box-shadow:0 6px 0 #a87f00}
#gate .btn:active{transform:translateY(3px);box-shadow:0 3px 0 #a87f00}
#gate .btn[disabled]{opacity:.55}
#gate .note{font-size:16px;color:#a3a9b2;line-height:1.3;margin:14px 0 0;font-weight:600}
#gate .ok{background:rgba(61,220,132,.14);border:1px solid rgba(61,220,132,.5);border-radius:14px;padding:14px;font-size:19px;font-weight:700;margin-top:6px}
#gate .warn{background:rgba(255,65,54,.14);border:1px solid rgba(255,65,54,.55);border-radius:14px;padding:12px 14px;font-size:18px;font-weight:700;margin-bottom:14px}
#gate .pointer{position:fixed;z-index:2147483001;font-size:44px;color:#ffc61a;filter:drop-shadow(0 3px 6px rgba(0,0,0,.6));pointer-events:none;animation:gbob 1s ease-in-out infinite alternate}
#gate .pointer.down{left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 4px);transform:translateX(-50%)}
#gate .pointer.up{right:70px;top:calc(env(safe-area-inset-top,0px) + 2px)}
@keyframes gbob{from{translate:0 0}to{translate:0 10px}}
#gate .pointer.up{animation-name:gbobu}@keyframes gbobu{from{translate:0 0}to{translate:0 -10px}}
@media (min-width:700px) and (min-height:560px){#gate h1{font-size:34px}#gate li{font-size:21px}}`;
const SHARE='<svg viewBox="0 0 24 24" fill="none" stroke="#1a73e8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M7.5 7.5 12 3l4.5 4.5"/><path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2"/></svg>';
const ADD='<svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>';
const DOTS='<svg viewBox="0 0 24 24" fill="#111"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
const MORE='<svg viewBox="0 0 24 24" fill="#111"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';

function build(){
  // the gate lives in a shadow root so none of the game's styles leak into it
  const host=document.createElement('div');host.id='gateHost';host.style.cssText='position:fixed;inset:0;z-index:2147483000';const sr=host.attachShadow?host.attachShadow({mode:'open'}):host;
  const st=document.createElement('style');st.textContent=css;sr.appendChild(st);
  const g=document.createElement('div');g.id='gate';g.setAttribute('role','dialog');g.setAttribute('aria-modal','true');g.setAttribute('aria-label','2Isar2Heat installieren');
  const ipad=iOS&&(/iPad/.test(ua)||navigator.platform==='MacIntel');
  const inApp=/FBAN|FBAV|Instagram|Line\/|Snapchat|TikTok|musical_ly|LinkedInApp|GSA\//.test(ua);
  const otherIOS=/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const samsung=/SamsungBrowser/i.test(ua),firefox=/Firefox/i.test(ua);
  let body='';
  const head=`<div class="head"><img src="apple-touch-icon.png" alt=""><div><h1>2Isar2Heat</h1><p class="sub">Nur als App vom Home-Bildschirm spielbar</p></div></div>
    <p class="why">Installiere das Spiel einmal auf deinem ${iOS?(ipad?'iPad':'iPhone'):'Gerät'}. Danach startet es wie eine richtige App – im Vollbild, ohne Browserleisten und mit Ton.</p>`;
  if(iOS){
    if(inApp)body+=`<p class="warn">Du bist in einem App-Browser. Tippe auf <span class="ico">${MORE}</span> bzw. das Menü und wähle „In Safari öffnen“. Dann geht es hier weiter.</p>`;
    body+=`<ol>
      <li><span class="n">1</span><span>Tippe auf <b>Teilen</b> <span class="ico">${SHARE}</span><small>${otherIOS?'In Chrome/Firefox: das Teilen-Symbol neben bzw. in der Adressleiste.':ipad?'Oben rechts neben der Adressleiste.':'Unten in der Leiste von Safari.'} Nicht zu sehen? Erst auf <span class="ico">${MORE}</span> tippen, dann auf „Teilen“.</small></span></li>
      <li><span class="n">2</span><span>Nach unten scrollen und <b>„Zum Home-Bildschirm“</b> <span class="ico">${ADD}</span> wählen.<small>Steht es nicht in der Liste? Ganz unten auf „Aktionen bearbeiten …“ tippen und es hinzufügen.</small></span></li>
      <li><span class="n">3</span><span><b>„Als Web-App öffnen“</b> eingeschaltet lassen und oben rechts auf <b>„Hinzufügen“</b> tippen.</span></li>
      <li><span class="n">4</span><span>2Isar2Heat über das <b>neue Symbol auf deinem Home-Bildschirm</b> starten.</span></li>
    </ol>
    <p class="note">Diese Seite kannst du danach schließen. Spielstand und Einstellungen liegen in der App.</p>`;
  }else{
    body+=`<button class="btn" id="gateInstall" type="button" disabled>Wird vorbereitet …</button>
      <div id="gateManual" hidden><ol>
        <li><span class="n">1</span><span>${samsung?'Tippe unten auf <b>☰ Menü</b>.':'Tippe oben rechts auf <b>Menü</b> <span class="ico">'+DOTS+'</span>.'}</span></li>
        <li><span class="n">2</span><span>Wähle <b>${samsung?'„Seite hinzufügen zu“ → „Startbildschirm“':firefox?'„Installieren“':'„App installieren“'}</b>${samsung||firefox?'':' bzw. <b>„Zum Startbildschirm hinzufügen“</b>'}.</span></li>
        <li><span class="n">3</span><span>Mit <b>„Installieren“</b> bestätigen.</span></li>
        <li><span class="n">4</span><span>2Isar2Heat über das <b>neue Symbol auf dem Startbildschirm</b> starten.</span></li>
      </ol></div>
      <div id="gateDone" class="ok" hidden>Installiert! Öffne 2Isar2Heat jetzt über das Symbol auf deinem Startbildschirm.</div>
      <p class="note">Schon installiert? Dann starte das Spiel einfach über das Symbol auf dem Startbildschirm.</p>`;
  }
  g.innerHTML=`<div class="card">${head}${body}</div>`;
  if(iOS&&!inApp&&!otherIOS){const p=document.createElement('div');p.className='pointer '+(ipad?'up':'down');p.textContent=ipad?'↑':'↓';g.appendChild(p);if(!ipad)g.classList.add('iph')}
  sr.appendChild(g);document.body.appendChild(host);
  // keep everything behind the gate inert
  for(const el of document.body.children)if(el!==host&&el.tagName!=='SCRIPT'&&el.tagName!=='STYLE'){try{el.inert=true}catch(e){}el.setAttribute('aria-hidden','true')}
  if(!iOS){
    const btn=g.querySelector('#gateInstall'),man=g.querySelector('#gateManual'),done=g.querySelector('#gateDone');
    const ready=()=>{if(!bip)return;btn.disabled=false;btn.textContent='Jetzt installieren';btn.hidden=false;man.hidden=true};
    window.IH_GATE.ready=ready;window.IH_GATE.installed=()=>{btn.hidden=true;man.hidden=true;done.hidden=false};
    btn.addEventListener('click',async()=>{if(!bip){man.hidden=false;return}const e=bip;bip=null;btn.disabled=true;
      try{await e.prompt();const c=await e.userChoice;if(c&&c.outcome==='accepted')window.IH_GATE.installed();else{btn.textContent='Jetzt installieren';btn.disabled=true;man.hidden=false}}catch(err){man.hidden=false;btn.hidden=true}});
    ready();
    // no prompt from the browser (already installed, unsupported browser, …): show the manual steps
    setTimeout(()=>{if(!bip&&done.hidden){btn.hidden=true;man.hidden=false}},3500);
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();
})();
