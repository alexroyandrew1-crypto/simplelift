// Rest timer, legal gate, and watch-settings form state.
'use strict';
/* ---------- rest timer ---------- */
// v24: finishing the last set of an exercise glides to the next exercise that still has sets to do (or to Finish).
// The target lands below the sticky header and above every bar floating at the bottom (rest timer, Finish bar, tabs).
const AUTO_NEXT_MS=300;
function bottomBars(){let lim=innerHeight;for(const el of document.querySelectorAll('.sessfoot,nav#tabs')){const r=el.getBoundingClientRect();
  const st=getComputedStyle(el);if(!r.height||st.display==='none'||st.visibility==='hidden')continue;if(r.bottom>=innerHeight-2||st.position==='fixed'||st.position==='sticky')lim=Math.min(lim,r.top)}return lim}
function autoNext(j){
  if(route.v!=='session'||!db().active)return;const ae=document.activeElement;if(ae&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))return;
  const ex=db().active.exercises;let n=-1;for(let i=j+1;i<ex.length;i++)if(ex[i].sets.some(x=>!x.done)){n=i;break}
  const reduce=matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches,behavior=reduce?'auto':'smooth';
  const hdr=($('header')||{getBoundingClientRect:()=>({bottom:0})}).getBoundingClientRect().bottom,lim=bottomBars(),gap=8;
  if(n<0){const f=$('[data-act="finish"]');if(!f)return;const r=f.getBoundingClientRect();if(r.top>=hdr&&r.bottom<=innerHeight)return;
    scrollTo({top:document.documentElement.scrollHeight,behavior});return}
  if(db().active&&db().active.focus!==n){db().active.focus=n;Store.save(true)}
  const card=$(`.ex-card[data-ex="${n}"]`);if(!card)return;const r=card.getBoundingClientRect();
  if(r.top>=hdr+gap/2&&r.bottom<=lim)return; // already fully visible between header and bottom bars
  // align the card top under the header; if it fits in the free band, that also keeps its bottom above the bars
  const y=scrollY+r.top-hdr-gap;scrollTo({top:Math.max(0,y),behavior})}
function startTimer(sec){if(!restOn()||!db().active)return;const s=Math.max(1,Math.round(+sec||0));runTimer(Date.now()+s*1000,s*1000);startCue()}
// v29: optional buzz and chime when a rest starts (only from a set tick, never on restore). Both off by default.
// If the set-logged chime also plays, the rest-start chime follows it so the two stay distinct.
function startCue(){const st=db().settings;if('startDing' in st){delete st.startDing;Store.save()}if(st.startBuzz)tap();if(chimeOn('start'))playChime('start',chimeOn('set')?0.24:0)}
function runTimer(end,totalMs){const sid=db().active&&db().active.id;if(timer)clearInterval(timer.h);
  const known=totalMs||(db().active&&db().active.restTotal)||Math.max(1000,end-Date.now());
  timer={end,sid,total:known};timer.h=setInterval(renderTimer,250);saveRest();renderTimer()}
function stopTimer(){const sid=timer&&timer.sid;if(timer)clearInterval(timer.h);timer=null;const a=db().active;if(!sid||(a&&a.id===sid))saveRest();renderTimer()}
// The rest end time and the full rest length live on the active workout, so a reload still drains the border from the right place.
function saveRest(){const a=db().active;if(!a)return;if(timer&&timer.sid&&timer.sid!==a.id)return;const v=timer?timer.end:null,tot=timer?timer.total:null;
  if((a.restEnd||null)!==v||(a.restTotal||null)!==tot){a.restEnd=v;a.restTotal=tot;Store.save(true)}}
function resumeRest(){
  const a=db().active;
  if(!restOn()||!a){if(timer)stopTimer();else paintFrame();return}
  if(timer&&timer.sid&&timer.sid!==a.id)stopTimer();
  const re=a.restEnd||0;
  if(timer&&timer.sid===a.id){renderTimer();return} // a live countdown alarms itself; don't clear it from a redraw
  if(!(re>Date.now())){if(a.restEnd){a.restEnd=null;a.restTotal=null;Store.save(true)}paintFrame();return}
  runTimer(re,a.restTotal||(re-Date.now()))}
function paintFrame(){let f=$('#appframe');
  if(!f){f=document.createElement('div');f.id='appframe';f.setAttribute('aria-hidden','true');document.body.appendChild(f)}
  if(!timer){f.style.setProperty('--rest-pct','0');f.classList.remove('live');document.body.classList.remove('resting');return}
  const left=Math.max(0,timer.end-Date.now()),pct=timer.total>0?Math.max(0,Math.min(100,left/timer.total*100)):0;
  f.classList.add('live');f.style.setProperty('--rest-pct',pct.toFixed(2));document.body.classList.add('resting')}
function renderTimer(){let el=$('#timer');
  if(timer&&timer.sid&&db().active&&timer.sid!==db().active.id){stopTimer();return}
  if(timer&&timer.end<=Date.now()){restDone();return} // fires even off the workout screen or right after the screen turns back on
  paintFrame();
  if(!timer){if(el)el.remove();return}
  const left=Math.max(0,Math.ceil((timer.end-Date.now())/1000));
  if(!el){el=document.createElement('div');el.id='timer';el.className='timer';el.setAttribute('role','timer');document.body.appendChild(el)}
  if(el.dataset.lang!==I18N.lang()){el.dataset.lang=I18N.lang();
    el.innerHTML=`<b id="tl"></b><span class="row"><button class="btn sm" data-act="t15" aria-label="+${t('unit.sec',{n:15})}">+${t('unit.sec',{n:15})}</button><button class="btn sm" data-act="tskip">${t('timer.skip')}</button></span>`}
  const tl=el.querySelector('#tl');if(tl)tl.textContent=restTxt(left);
  el.setAttribute('aria-label',t('timer.remain',{t:restTxt(left)}));
  if(left<=0)restDone()}
function linkLine(){if(typeof Live==='undefined')return '';const on=!!(Live.wear||Live.bt);return `<div class="mut" id="linkLine">${on?t('link.connected'):t('link.offline')}</div>`}
function pairErr(x){if(!x||x.offline||x.code==='network')return t('pair.needNet');
  const c=String(x.code||'');
  if(x.status===401||c==='unauthorized')return t('pair.signIn');
  if(c==='expired'||c==='code_expired'||x.status===410)return t('pair.expired');
  if(c==='bad_code'||c==='not_found'||c==='unknown_code'||x.status===404||x.status===400)return t('pair.bad');
  if(x.status===429)return t('sy.429');
  return t('pair.failPlain')}
function rememberExperience(){const x=ai&&ai.a&&ai.a.experience;if(x==='beginner'||x==='intermediate'||x==='advanced'){db().settings.experience=x;Store.save()}}
function saveExerciseRest(session,ex,sec){ex.rest=sec;delete ex.restAuto;
  const plan=session&&Store.plan(session.planId),day=plan&&plan.days[session.dayIndex];
  const pe=day&&day.exercises.find(x=>(ex.id&&x.id===ex.id)||String(x.name||'').toLowerCase()===String(ex.name||'').toLowerCase());
  if(pe){pe.rest=sec;delete pe.restAuto;Store.upsertPlan(plan)}
  Store.save()}

/* ---------- events ---------- */
const errMsg=x=>x&&x.message||String(x);
let authFrom='';
/* ---------- terms & health disclaimer (v25) ---------- */
const TERMS_KEY='simplelift_terms';
function legalAcc(){try{const a=JSON.parse(localStorage.getItem(TERMS_KEY)||'null');return a&&a.v?a:null}catch(e){return null}}
const legalOK=()=>{const a=legalAcc();return!!a&&a.v===LEGAL.v};
function legalAccText(){const a=legalAcc();if(!a)return '—';let d=a.at;try{d=new Intl.DateTimeFormat(I18N.locale(),{dateStyle:'medium'}).format(new Date(a.at))}catch(e){}return t('lg.acceptedOn',{v:esc(a.v),d:esc(d)})}
function legalLinks(cur){return `<div class="doclinks">${['terms','health','privacy'].filter(k=>k!==cur).map(k=>`<button type="button" class="doclink" data-act="legalDoc" data-doc="${k}"><span>${t('lg.'+k)}</span><span class="chev" aria-hidden="true">›</span></button>`).join('')}</div>`}
function legalNotice(){const prev=legalAcc();
  return `<section class="card ack" id="legalGate"><div class="ack-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/></svg></div>
    <h2 id="gateTitle">${t('lg.title')}</h2>
    ${prev?`<div class="note warn">${t('lg.changed')}</div>`:''}<p class="mut">${t('lg.intro')}</p>
    ${legalLinks()}${I18N.lang()!=='en'?`<div class="mut mt2">${t('lg.enNote')}</div>`:''}
    <label class="gate-chk"><input type="checkbox" id="gateChk"${gate.chk?' checked':''}> <span>${t('lg.agree')}</span></label>
    <div class="gate-msg" id="gateMsg" role="alert">${gate.msg?esc(gate.msg):''}</div>
    <button class="btn acc full" data-act="gateYes">${t('lg.accept')}</button>
    <button class="btn full" data-act="gateNo">${t('lg.decline')}</button></section>`}
function homeHub(){
  const ico={plans:'<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    history:'<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
    watch:'<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 6V4h6v2M9 18v2h6v-2"/></svg>',
    settings:'<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></svg>'};
  const tile=(act,label,svg,extra='')=>`<button class="hub" data-act="${act}"${extra}>${svg}<span>${label}</span></button>`;
  return `<div class="hubs" aria-label="${tA('nav.main')}">${tile('goPlans',t('tab.plans'),ico.plans)}${tile('goHistory',t('tab.history'),ico.history)}${tile('pair',t('watch.pair'),ico.watch)}${tile('goSettings',t('tab.settings'),ico.settings)}</div>`}
let gate={doc:null,msg:'',chk:false};
function renderGate(){const g=$('#gate');if(g)g.remove();document.body.classList.remove('gated')}
/* Watch settings live on the account. Saving PUTs them; the watch reads them on its next sync. */
const WS_KEYS=['chime','vibration','autoDetectSets','showHr','repDetect','saveActivity'];
let watchSet=null,watchSetSeq=0;
function watchSettingsFrom(raw){
  const d={chime:true,vibration:true,autoDetectSets:false,showHr:true,repDetect:true,saveActivity:true,restAlert:0,rev:0};
  const s=raw&&typeof raw==='object'?raw:{};
  const out={};
  WS_KEYS.forEach(k=>{out[k]=typeof s[k]==='boolean'?s[k]:d[k]});
  out.restAlert=s.restAlert===0||s.restAlert===1||s.restAlert===2?s.restAlert:0;
  out.rev=Number.isFinite(+s.rev)?Math.trunc(+s.rev):0;
  return out;
}
function watchSettingsBody(s){const o={restAlert:s.restAlert};WS_KEYS.forEach(k=>{o[k]=!!s[k]});return o}
function watchSettingsSame(a,b){return !!a&&!!b&&WS_KEYS.every(k=>!!a[k]===!!b[k])&&a.restAlert===b.restAlert}
function ensureWatchSettings(){
  if(watchSet)return;
  const seq=++watchSetSeq;
  watchSet={state:'load',settings:null,err:''};
  Sync.getWatchSettings().then(j=>{
    if(seq!==watchSetSeq)return;
    watchSet={state:'ready',settings:watchSettingsFrom(j&&j.watchSettings),err:''};
    if(route.v==='watchSettings')render();
  }).catch(e=>{
    if(seq!==watchSetSeq)return;
    watchSet={state:'err',settings:null,err:(e&&e.message)||t('ws.loadFail')};
    if(route.v==='watchSettings')render();
  });
}
function watchSettingsForm(){
  const s=watchSet.settings,busy=watchSet.state==='save',dis=busy?' disabled':'';
  const row=(key,title,hint)=>`<div class="between rtrow" id="ws-${key}"><div><b>${title}</b>${hint?`<div class="mut">${hint}</div>`:''}</div><button type="button" class="chip ${s[key]?'on':''}" data-act="wsToggle" data-k="${key}" aria-pressed="${!!s[key]}" aria-label="${esc(title)}: ${s[key]?t('on'):t('off')}"${dis}>${s[key]?t('on'):t('off')}</button></div>`;
  const alert=s.restAlert===1||s.restAlert===2?s.restAlert:0;
  const seg=[0,1,2].map(n=>`<button type="button" role="radio" data-act="wsAlert" data-v="${n}" aria-checked="${alert===n}" aria-pressed="${alert===n}"${dis}>${t('ws.alert'+n)}</button>`).join('');
  const when=s.rev?`<div class="mut" id="wsRev">${t('ws.updated',{d:esc(new Date(s.rev).toLocaleString(I18N.locale()))})}</div>`:`<div class="mut" id="wsWait">${t('ws.waiting')}</div>`;
  return `<div class="card" id="wsCard"><h3>${t('title.watchSettings')}</h3><div class="mut" id="wsHint">${t('ws.hint')}</div>${when}`+
    row('chime',t('ws.chime'),t('ws.chimeHint'))+row('vibration',t('ws.vibration'),'')+
    row('autoDetectSets',t('ws.auto'),t('ws.autoHint'))+row('showHr',t('ws.hr'),'')+
    row('repDetect',t('ws.reps'),t('ws.repsHint'))+row('saveActivity',t('ws.save'),'')+
    `</div><div class="card" id="wsAlert"><h3 id="wsAlertT">${t('ws.alert')}</h3><div class="seg modes" role="radiogroup" aria-labelledby="wsAlertT">${seg}</div></div>`;
}
async function pushWatchSettings(next){
  const prev=watchSet&&watchSet.settings;
  const seq=++watchSetSeq;
  watchSet={state:'save',settings:next,err:''};
  if(route.v==='watchSettings')render();
  try{
    const j=await Sync.putWatchSettings(watchSettingsBody(next));
    if(seq!==watchSetSeq)return;
    const got=watchSettingsFrom(j&&j.watchSettings);
    watchSet={state:'ready',settings:got,err:''};
    toast(watchSettingsSame(got,next)?t('ws.saved'):t('ws.newer'));
    if(typeof Live!=='undefined'&&Live.keepSettings){Live.keepSettings(Object.assign({t:'settings',src:'p'},got));if(Live.pushSettings)Live.pushSettings()}
  }catch(e){
    if(seq!==watchSetSeq)return;
    watchSet={state:'ready',settings:prev,err:''};
    toast((e&&e.message)||t('ws.fail'),'err');
  }
  if(route.v==='watchSettings')render();
}
