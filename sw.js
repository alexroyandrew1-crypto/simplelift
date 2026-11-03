// Simple Lift service worker. Network-first for the app's own code (so updates show up right away),
// cache fallback when offline. OCR files (big, rarely change) are cache-first and cached on first use.
const C='simplelift-v19';
const FILES=['./','index.html','config.js','style.css','library.js','store.js','generator.js','parser.js','changes.js','oldimport.js','ocr.js','watch.js','sync.js','app.js','manifest.json','icon.svg','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(FILES.map(f=>new Request(f,{cache:'reload'})))))});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{const keep=[C,'simplelift-ocr-1'];for(const k of await caches.keys())if(!keep.includes(k))await caches.delete(k);await self.clients.claim()})())});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==location.origin)return;
  if(url.pathname.includes('/ocr/')){e.respondWith(caches.open('simplelift-ocr-1').then(async c=>{const hit=await c.match(req);if(hit)return hit;const res=await fetch(req);if(res.ok)c.put(req,res.clone());return res}));return}
  e.respondWith((async()=>{try{const res=await fetch(req,{cache:'no-cache'});if(res.ok){const c=await caches.open(C);c.put(req,res.clone())}return res}
    catch(err){return (await caches.match(req,{ignoreSearch:true}))||(req.mode==='navigate'?await caches.match('index.html'):Response.error())}})());
});
