// Chimes, text size, language, startup, and the service worker.
'use strict';
/* ---------- rest timer alert (v27) ---------- */
const ALERT_KEY='simplelift_alert',ALERTS=['vib','snd','both','off'];
function alertGet(){const v=localStorage.getItem(ALERT_KEY);return ALERTS.includes(v)?v:'vib'}
function restDone(){if(!timer)return;const sid=timer.sid;stopTimer();if(typeof Live!=='undefined')Live.push();if(!restOn())return;const a=db().active;if(sid&&(!a||a.id!==sid))return;restAlarm();toast(t('timer.over'))}
let actx=null;
// Three short Web Audio chimes. Set logged is one high tick, rest start is two descending notes,
// rest end is the longer rising alarm. Scheduled only after the context is running, which is what
// iOS and Android need or the notes land in the past and never play.
function audioCtx(){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;actx=actx||new C();return actx}
function unlockAudio(){try{const c=audioCtx();if(!c)return;if(c.state==='suspended')c.resume();
  const b=c.createBuffer(1,1,22050),s=c.createBufferSource();s.buffer=b;s.connect(c.destination);s.start(0)}catch(e){}}
function tone(c,t0,freq,dur,peak){const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(freq,t0);
  g.gain.setValueAtTime(0.0001,t0);g.gain.exponentialRampToValueAtTime(peak,t0+.02);g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
  o.connect(g).connect(c.destination);o.start(t0);o.stop(t0+dur+.03)}
function scheduleChime(c,kind,t0){
  if(kind==='set'){tone(c,t0,1318.5,.11,.2);return .14}
  if(kind==='start'){tone(c,t0,659.3,.16,.22);tone(c,t0+.15,523.3,.2,.18);return .4}
  tone(c,t0,880,.22,.35);tone(c,t0+.28,880,.22,.35);tone(c,t0+.56,1175,.22,.35);return .82}
function playChimes(kinds,gap){try{const c=audioCtx();if(!c)return false;const run=()=>{let t=c.currentTime+.03;kinds.forEach(k=>{const d=scheduleChime(c,k,t);window.__chimes=(window.__chimes||[]).concat(k);t+=d+(gap||.3)});window.__beeps=(window.__beeps||0)+kinds.length};if(c.state==='suspended')c.resume().then(run);else run();return true}catch(e){return false}}
function playChime(kind,delay){try{const c=audioCtx();if(!c)return false;const run=()=>{scheduleChime(c,kind,c.currentTime+.03+(delay||0));window.__chimes=(window.__chimes||[]).concat(kind);window.__beeps=(window.__beeps||0)+1};if(c.state==='suspended')c.resume().then(run);else run();return true}catch(e){return false}}
function beep(){return playChime('end')}
function tap(){window.__taps=(window.__taps||0)+1;
  try{const H=window.Capacitor&&Capacitor.Plugins&&Capacitor.Plugins.Haptics;if(H&&H.vibrate){H.vibrate({duration:80});return true}}catch(e){}
  try{return !!(navigator.vibrate&&navigator.vibrate(80))}catch(e){return false}}
function buzz(){window.__buzz=(window.__buzz||0)+1;
  try{const H=window.Capacitor&&Capacitor.Plugins&&Capacitor.Plugins.Haptics;if(H&&H.vibrate){H.vibrate({duration:600});return true}}catch(e){}
  try{return !!(navigator.vibrate&&navigator.vibrate([300,120,300,120,300]))}catch(e){return false}}
function restAlarm(kind=alertGet()){if(kind==='vib'||kind==='both')buzz();if(kind==='snd'||kind==='both')beep()}
// Mobile browsers stay silent until a tap resumes the audio context. Unlock on every tap so a later chime can play.
document.addEventListener('pointerdown',()=>{unlockAudio()},{capture:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')renderTimer()});
// v29: the rest timer can be switched off entirely (a synced setting; on unless set to false)
const restOn=()=>db().settings.restTimer!==false;
// v29: one Rest timer card. The start buzz is a synced setting (default off). Chimes and the end vibration
// stay on this phone, like the end chime (simplelift_alert: vib|snd|both|off, default vib).
const CHIME_KEY={start:'simplelift_chime_start',set:'simplelift_chime_set'};
function chimeOn(kind){try{return localStorage.getItem(CHIME_KEY[kind])==='1'}catch(e){return false}}
function chimeSet(kind,on){try{if(on)localStorage.setItem(CHIME_KEY[kind],'1');else localStorage.removeItem(CHIME_KEY[kind])}catch(e){}}
const endGet=()=>{const a=alertGet();return{vib:a==='vib'||a==='both',snd:a==='snd'||a==='both'}};
function endSet(vib,snd){const v=vib&&snd?'both':vib?'vib':snd?'snd':'off';if(v==='vib')localStorage.removeItem(ALERT_KEY);else localStorage.setItem(ALERT_KEY,v)}
function alertCard(){const on=restOn(),st=db().settings;if('startDing' in st){delete st.startDing;Store.save()}const e=endGet();
  const sw=(act,k,v,lbl,name)=>`<button class="chip ${v?'on':''}" data-act="${act}" data-k="${k}" aria-pressed="${v}" aria-label="${name||lbl}: ${v?t('on'):t('off')}">${lbl}</button>`;
  const row=(id,title,a,b)=>`<div class="between rtrow" id="${id}"><div>${title}</div><div class="row" style="gap:6px">${a}${b}</div></div>`;
  return `<div class="card" id="restCard"><div class="between"><div><h3>⏱️ ${t('rt.title')}</h3><div class="mut">${t('rt.hint')}</div></div><button class="chip ${on?'on':''}" data-act="restT" aria-pressed="${on}">${on?t('on'):t('off')}</button></div>`+
   (on?row('rtStart',t('rs.title'),sw('startT','startBuzz',!!st.startBuzz,t('rs.buzz')),'')+
    row('rtStartChime',t('rs.startChime'),sw('startChime','chime',chimeOn('start'),t('rs.ding'),t('rs.startChime')),'')+
    row('rtEnd',t('rt.end'),sw('endT','snd',e.snd,t('rs.ding')),sw('endT','vib',e.vib,t('rs.buzz')))+
    row('rtSetChime',t('rs.setChime'),sw('setChime','chime',chimeOn('set'),t('rs.ding'),t('rs.setChime')),'')+
    `<button type="button" class="btn full" data-act="chimeTest">${t('ra.test')}</button>`:'')+`</div>`}
ACT.restT=()=>{db().settings.restTimer=!restOn();Store.save();if(!restOn())stopTimer();render()};
ACT.startT=b=>{const k=b.dataset.k;if(k!=='startBuzz')return;const st=db().settings;st[k]=!st[k];Store.save();render();if(st[k])tap()};
ACT.startChime=()=>{const on=!chimeOn('start');chimeSet('start',on);render();if(on)playChime('start')};
ACT.setChime=()=>{const on=!chimeOn('set');chimeSet('set',on);render();if(on)playChime('set')};
ACT.chimeTest=()=>playChimes(['set','start','end'],.32);
ACT.endT=b=>{const k=b.dataset.k;if(k!=='vib'&&k!=='snd')return;const e=endGet();e[k]=!e[k];endSet(e.vib,e.snd);render();if(e[k])(k==='vib'?buzz:beep)()};
/* ---------- text size (v26) ---------- */
const FS_KEY='simplelift_fs',FS={s:.86,m:.93,l:1.06,xl:1.16};
function fsGet(){const v=localStorage.getItem(FS_KEY);return FS[v]?v:'m'}
function applyFs(){const h=document.documentElement,v=fsGet();h.style.setProperty('--fs',String(FS[v]));for(const k in FS)h.classList.toggle('fs-'+k,k===v)}
function fsCard(){const c=fsGet();
  return `<div class="card" id="fsCard"><h3 id="fsT">🔠 ${t('fs.title')}</h3><div class="seg" role="group" aria-labelledby="fsT">${Object.keys(FS).map(k=>`<button data-act="setFs" data-v="${k}" aria-pressed="${k===c}">${t('fs.'+k)}</button>`).join('')}</div><div class="fs-prev" id="fsPrev">${t('fs.preview')}</div></div>`}
ACT.setFs=b=>{const v=b.dataset.v;if(!FS[v])return;if(v==='m')localStorage.removeItem(FS_KEY);else localStorage.setItem(FS_KEY,v);applyFs();
  document.querySelectorAll('#fsCard .seg button').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.v===v)))};
/* ---------- language ---------- */
function langCard(){const cur=I18N.lang();
  return `<div class="card" id="langCard"><h3>🌐 <label for="langSel">${t('lang.title')}</label></h3><div class="sel-wrap"><select id="langSel" class="sel">
    ${I18N.LANGS.map(([c,n])=>`<option value="${c}" lang="${c}"${c===cur?' selected':''}>${esc(n)}</option>`).join('')}</select></div><div class="mut mt2">${t('lang.hint')}</div></div>`}
// static text that lives in index.html (tab bar, back button)
function applyStatic(){const k={home:'today',plans:'plans',history:'history',settings:'settings'};
  document.querySelectorAll('#tabs button[data-tab]').forEach(b=>{const s=b.querySelector('span');if(s&&k[b.dataset.tab])s.textContent=t('tab.'+k[b.dataset.tab])});
  const bk=$('#back');if(bk)bk.setAttribute('aria-label',t('back'));const nv=$('#tabs');if(nv)nv.setAttribute('aria-label',t('nav.main'))}
ACT.setLang=b=>{I18N.choose(b.value||b.dataset.v).then(()=>{applyStatic();render()})};
applyFs();applyBg();
if(db().active)route={v:'session',p:{}}; // rest timer is resumed from active.restEnd on the first render
else{const fl=flowGet();if(fl.at==='ai'&&fl.ai){ai={step:Math.min(+fl.ai.step||0,AI_STEPS.length),a:fl.ai.a};stack=[{v:'plans',p:{}},{v:'chooser',p:{}}];route={v:'ai',p:{}}}
  else if(fl.at==='paste'){stack=[{v:'plans',p:{}},{v:'chooser',p:{}}];route={v:'paste',p:{text:fl.paste||''}}}} // v28: reopen an unfinished new plan
// v27: write anything typed before the app goes to the background
const flushNow=()=>{const ae=document.activeElement;if(ae&&ae.dataset&&ae.dataset.bind)ae.dispatchEvent(new Event('input',{bubbles:true}));if(db().active)Store.save(true)};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushNow()});addEventListener('pagehide',flushNow);
if(typeof Live!=='undefined')Live.start();
I18N.start(()=>{applyStatic();render()},name=>toast(t('lang.set',{name}))).then(()=>{
  applyStatic();
  if(typeof Live!=='undefined')Live.start();
  render();
  if(route.v==='session')scrollToFocus();
  Sync.soon(800)}); // pull on open (no-op unless signed in)

/* ---------- updates: the service worker serves the cached version instantly; a new version waits until you tap the bar ---------- */
let swReg=null,updTapped=false;
function showUpdateBar(){if($('#updbar'))return;const b=document.createElement('button');b.id='updbar';b.className='updbar';b.textContent=t('upd.bar');
  b.onclick=()=>{updTapped=true;b.textContent=t('upd.updating');const w=swReg&&swReg.waiting;if(w)w.postMessage('skipWaiting');else location.reload()};document.body.appendChild(b)}
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').then(r=>{swReg=r;const chk=()=>{if(r.waiting&&navigator.serviceWorker.controller)showUpdateBar()};chk();
    r.addEventListener('updatefound',()=>{const w=r.installing;if(w)w.addEventListener('statechange',()=>{if(w.state==='installed')chk()})});
    r.update().catch(()=>{});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')r.update().catch(()=>{})})}).catch(()=>{});
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updTapped)location.reload()})}
