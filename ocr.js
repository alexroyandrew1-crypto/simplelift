// ===== PICTURE -> TEXT (OCR) HOOK =====
// imageToText(file, onProgress) -> Promise<string>. Uses self-hosted tesseract.js from ./ocr/ (no CDN, works offline
// after first use thanks to the service worker). To use a real AI vision model later, replace the body with an
// upload to your backend that returns the plan text (or call parseTextPlan-compatible JSON directly).
let _ocrWorker=null;
function loadScript(src){return new Promise((res,rej)=>{if(window.Tesseract)return res();const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error(t('ocr.load')));document.head.appendChild(s)})}
async function prepImage(file){
  if(!file||!/^image\//.test(file.type))throw new Error(t('ocr.notPic'));
  const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error(t('ocr.open')));i.src=URL.createObjectURL(file)});
  // aim for ~1600-2000px on the long side: downscale big phone photos, upscale tiny screenshots
  const long=Math.max(img.width,img.height),sc=long>2000?2000/long:long<1200?1200/long:1;
  const c=document.createElement('canvas');c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
  const x=c.getContext('2d');x.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(img.src);
  const d=x.getImageData(0,0,c.width,c.height),p=d.data;let mn=255,mx=0,sum=0;
  for(let i=0;i<p.length;i+=4){const g=.299*p[i]+.587*p[i+1]+.114*p[i+2];p[i]=g;sum+=g;if(g<mn)mn=g;if(g>mx)mx=g}
  const avg=sum/(p.length/4),inv=avg<110,rng=Math.max(1,mx-mn); // dark-mode screenshots get inverted to dark-on-light
  for(let i=0;i<p.length;i+=4){let g=(p[i]-mn)*255/rng;if(inv)g=255-g;g=g<128?Math.max(0,g*0.6):Math.min(255,g*1.15+10);p[i]=p[i+1]=p[i+2]=g}
  x.putImageData(d,0,0);return c}
async function imageToText(file,onProgress=()=>{}){
  onProgress(0.02,t('ocr.prep'));const canvas=await prepImage(file);
  onProgress(0.05,t('ocr.loading'));await loadScript('ocr/tesseract.min.js');
  if(!_ocrWorker){const base=new URL('ocr/',location.href).href;
    const start=()=>{let w=null;const p=Tesseract.createWorker('eng',1,{workerPath:base+'worker.min.js',corePath:base,langPath:base,gzip:true,workerBlobURL:false,
      errorHandler:e=>console.warn('OCR worker error',e),
      logger:m=>{if(m.status==='recognizing text')onProgress(.3+.7*(m.progress||0),t('ocr.reading'));else onProgress(.05+.25*(m.progress||0),m.status==='loading language traineddata'?t('ocr.model'):t('ocr.starting'))}}).then(x=>w=x);
      // the worker can fail silently (e.g. the 3 MB English model download drops) and never resolve, so stop waiting after a while
      return Promise.race([p,new Promise((_,rej)=>setTimeout(()=>{rej(new Error('timeout'));p.then(x=>x.terminate()).catch(()=>{})},45000))]).catch(e=>{if(w)w.terminate().catch(()=>{});throw e})};
    try{_ocrWorker=await start()}catch(e){
      onProgress(.05,t('ocr.retry'));
      try{if(window.caches)await caches.delete('simplelift-ocr-1')}catch(_){}
      try{_ocrWorker=await start()}catch(e2){_ocrWorker=null;throw new Error(t('ocr.fail'))}}}
  else _ocrWorker.__p=onProgress;
  const r=await _ocrWorker.recognize(canvas);onProgress(1,t('ocr.done'));
  const txt=(r.data.text||'').replace(/[|]/g,'1').replace(/\n{3,}/g,'\n\n').trim();
  if(txt.replace(/\W/g,'').length<6)throw new Error(t('ocr.noText'));
  return txt}
// v19: picture -> small JPEG data URL for AI photo import (max 1600px on the long side, quality 0.8; original colours, no OCR filtering)
async function imageToJpeg(file,max=1600,q=0.8){
  if(!file||!/^image\//.test(file.type))throw new Error(t('ocr.notPic'));
  const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error(t('ocr.open')));i.src=URL.createObjectURL(file)});
  const long=Math.max(img.width,img.height),sc=long>max?max/long:1;
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*sc));c.height=Math.max(1,Math.round(img.height*sc));
  const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(img.src);
  let d=c.toDataURL('image/jpeg',q);if(d.length>5.4e6)d=c.toDataURL('image/jpeg',0.6); // server limit ~4 MB decoded
  return d}
