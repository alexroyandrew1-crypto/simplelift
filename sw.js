// Simple Lift service worker (v27). Opens from the cache first, so the app starts instantly even on bad gym Wi-Fi.
// Updates: each release changes this file (cache name), so the browser installs the new version in the background.
// It then WAITS, and the page shows "Update available — tap to refresh"; tapping it sends 'skipWaiting'.
// (Revalidation happens per version, never file by file, so old and new files are never mixed.)
// Language files (lang-xx.js) are cached on first use in the versioned cache. On each update the new version
// re-downloads the languages the old cache had, so a non-English phone stays translated offline after updating.
// OCR files (big, rarely change) are cache-first in their own cache and cached on first use.
const C='simplelift-v27',OCR='simplelift-ocr-1';
const FILES=['./','index.html','config.js','legal.js','i18n.js','style.css','library.js','store.js','generator.js','parser.js','changes.js','oldimport.js','ocr.js','watch.js','sync.js','app.js','manifest.json','icon.svg','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil((async()=>{const c=await caches.open(C);await c.addAll(FILES.map(f=>new Request(f,{cache:'reload'})));
  const langs=new Set();for(const k of await caches.keys())if(k!==C&&/^simplelift-v\d+$/.test(k))for(const r of await (await caches.open(k)).keys()){const m=new URL(r.url).pathname.match(/lang-([a-z]{2})\.js$/);if(m)langs.add(m[1])}
  for(const l of langs)await c.add(new Request('lang-'+l+'.js',{cache:'reload'})).catch(()=>{});
  // Pages from v20 and older have no "Update available" bar, so take over right away for them (they show their own reload bar).
  const old=(await caches.keys()).some(k=>/^simplelift-v(\d+)$/.test(k)&&+k.slice(12)<=20);if(old)self.skipWaiting()})())});
self.addEventListener('message',e=>{if(e.data==='skipWaiting')self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{const keep=[C,OCR];for(const k of await caches.keys())if(!keep.includes(k))await caches.delete(k);await self.clients.claim()})())});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==location.origin)return;
  if(url.pathname.includes('/ocr/')){e.respondWith(caches.open(OCR).then(async c=>{const hit=await c.match(req);if(hit)return hit;const res=await fetch(req);if(res.ok)c.put(req,res.clone());return res}));return}
  e.respondWith((async()=>{const c=await caches.open(C);
    const hit=(await c.match(req,{ignoreSearch:true}))||(req.mode==='navigate'?await c.match('index.html'):null);if(hit)return hit;
    try{const res=await fetch(req);if(res.ok)c.put(req,res.clone());return res}catch(err){return Response.error()}})());
});
