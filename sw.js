/* 2Isar2Heat service worker: network first (updates show up right away), cache as offline fallback */
const CACHE='2isar2heat-v29';
const CORE=['./','index.html','config.js','account.js','three.min.js','world.js','sim.js','render.js','net.js','activities.js','radio.js','story.js','install.js','main.js','manifest.webmanifest','Bungee-Regular.ttf','BarlowCondensed-SemiBold.ttf','BarlowCondensed-Bold.ttf','icon-192.png','icon-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).catch(()=>{}).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin)return;
  e.respondWith(fetch(r).then(res=>{if(res&&res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp))}return res}).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match('index.html'))));
});
