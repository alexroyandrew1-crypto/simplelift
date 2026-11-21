// Shell: helpers, navigation, and the render pass. Classic script so live.js can call these globals.
'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const db=()=>Store.db;
const U=()=>db().settings.units;
const step=lower=>U()==='kg'?(lower?5:2.5):(lower?10:5); // progression only; +/- buttons stay 2.5 kg / 5 lb
const KG_PER_LB=0.45359237;
// Store a precise conversion (not 0.5-rounded) so 100 lb → kg → lb is 100, not 100.5.
// 100 lb * 0.45359237 = 45.359237 kg; display uses fmtW (nearest 0.5 → 45.5). IEEE dust under 1e-9 is snapped.
function convW(n,from,to){if(from===to||n===''||n==null)return n;n=+n;if(!isFinite(n)||n===0)return n;
  const x=from==='lb'&&to==='kg'?n*KG_PER_LB:from==='kg'&&to==='lb'?n/KG_PER_LB:n;
  return Math.abs(x-Math.round(x*2)/2)<1e-9?Math.round(x*2)/2:x}
function fmtW(n){if(n===''||n==null)return n;n=+n;if(!isFinite(n))return n;return Math.round(n*2)/2}
function convertAllUnits(from,to){if(from===to)return;
  const walkEx=e=>{if(!e)return;if('weight' in e)e.weight=convW(e.weight,from,to);
    if(e.sugg&&typeof e.sugg==='object'&&'w' in e.sugg)e.sugg.w=convW(e.sugg.w,from,to);
    if(Array.isArray(e.sets))e.sets.forEach(s=>{if(!s)return;if('w' in s)s.w=convW(s.w,from,to);if('sw' in s)s.sw=convW(s.sw,from,to)})};
  const walkPlan=p=>p&&(p.days||[]).forEach(d=>(d.exercises||[]).forEach(walkEx));
  const src=db();
  const clone=JSON.parse(JSON.stringify({plans:src.plans,active:src.active,history:src.history,draft:(typeof draft!=='undefined'&&draft)?draft:null}));
  (clone.plans||[]).forEach(walkPlan);
  if(clone.active)(clone.active.exercises||[]).forEach(walkEx);
  (clone.history||[]).forEach(w=>{(w.exercises||[]).forEach(walkEx);if(w.units===from)w.units=to});
  if(clone.draft)walkPlan(clone.draft);
  // commit the converted clone only if the walk finished (throws leave the live db untouched)
  src.plans=clone.plans;src.active=clone.active;src.history=clone.history;
  if(typeof draft!=='undefined'&&draft&&clone.draft){Object.keys(draft).forEach(k=>delete draft[k]);Object.assign(draft,clone.draft)}}
const fmtDate=t=>new Date(t).toLocaleDateString(I18N.locale(),{weekday:'short',month:'short',day:'numeric'});
const tA=(k,v)=>esc(t(k,v)); // translated text for HTML attributes
const num=n=>I18N.num(n);
const isLower=n=>!!libFind(n)?.lower;

/* ---------- toasts + sheets (replace alert/confirm) ---------- */
function toast(m,kind){const t=$('#toast');t.textContent=m;t.className='show'+(kind?' '+kind:'');clearTimeout(t._h);
  t._h=setTimeout(()=>t.classList.remove('show'),Math.min(6000,Math.max(1800,String(m).length*55)))}
// sheet({title,msg,html,actions:[{v,label,cls,run}]}) -> Promise<v|null>. run(el) may return true (close) or an error string.
let sheetVals={};
function sheet({title,msg,html,actions}){
  document.querySelectorAll('.sheet-bg').forEach(x=>x.remove());
  const o=document.createElement('div');o.className='sheet-bg';
  o.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="shT"><h3 id="shT">${esc(title)}</h3>${msg?`<div class="sheet-msg">${esc(msg)}</div>`:''}${html||''}
    <div class="sheet-err" role="alert"></div><div class="sheet-acts">${actions.map((a,i)=>`<button class="btn full ${a.cls||''}" data-sv="${i}">${esc(a.label)}</button>`).join('')}</div></div>`;
  return new Promise(res=>{let kd;
    const done=v=>{sheetVals={};o.querySelectorAll('input[name]').forEach(i=>sheetVals[i.name]=i.type==='checkbox'?i.checked:i.value);o.remove();document.removeEventListener('keydown',kd);res(v)};
    kd=e=>{if(e.key==='Escape')done(null)};document.addEventListener('keydown',kd);
    o.addEventListener('click',async e=>{if(e.target===o){done(null);return}const b=e.target.closest('[data-sv]');if(!b||b.disabled)return;const a=actions[+b.dataset.sv];
      if(a.run){const lbl=b.textContent;b.disabled=true;b.textContent=t('working');const r=await a.run(o);if(r!==true){o.querySelector('.sheet-err').textContent=r||t('err.generic');b.disabled=false;b.textContent=lbl;return}}
      done(a.v)});
    document.body.appendChild(o);(o.querySelector('input')||o.querySelector('[data-sv]')).focus()})}
const ask=(title,msg,ok,okCls='acc',cancel=t('cancel'))=>sheet({title,msg,actions:[{v:1,label:ok,cls:okCls},{v:0,label:cancel}]}).then(v=>v===1);
const info=(title,msg)=>sheet({title,msg,actions:[{v:1,label:t('ok'),cls:'acc'}]});

/* ---------- routing ---------- */
let route={v:'home',p:{}},stack=[],draft=null,draftSnap='',ai=null,timer=null;
const snap=p=>JSON.stringify(p,(k,v)=>k[0]==='_'?undefined:v);
function openDraft(p){draft=p;draftSnap=snap(p)}
const draftDirty=()=>!!draft&&(!!draft._new||snap(draft)!==draftSnap);
async function guard(){if(!draftDirty())return true;
  const ok=await ask(t('guard.title'),draft._new&&route.v==='editor'?t('guard.newPlan'):t('guard.unsaved'),t('guard.discard'),'bad',t('guard.keep'));
  if(ok)draftSnap=snap(draft);return ok}
/* ---------- v28: plan-creation flow (guided wizard / paste) keeps its answers until saved, cancelled or started over ---------- */
const FLOW_KEY='simplelift_flow';
function flowGet(){try{return JSON.parse(localStorage.getItem(FLOW_KEY))||{}}catch(e){return{}}}
function flowSet(o){const f=Object.assign(flowGet(),o);for(const k in f)if(f[k]==null)delete f[k];try{if(Object.keys(f).length)localStorage.setItem(FLOW_KEY,JSON.stringify(f));else localStorage.removeItem(FLOW_KEY)}catch(e){}}
function saveFlow(){if(route.v==='ai'&&ai)flowSet({ai:ai.step||aiHasAnswers()?{step:ai.step,a:ai.a}:null,at:'ai'});else if(route.v==='paste')flowSet({paste:route.p.text||'',at:'paste'})}
  // Back to the chooser (or another Plans screen) keeps the draft, same as the AI wizard; save / cancel / start-over still clear it
const freshAI=()=>({step:0,a:{injuries:'',focus:[]}});
const aiHasAnswers=()=>!!ai&&Object.entries(ai.a).some(([k,v])=>Array.isArray(v)?v.length:v!==''&&v!=null);
// Android system back / browser back: one history entry stands for "there is somewhere to go back to"
let backArmed=false;
const canBack=()=>stack.length>0||(route.v==='ai'&&!!ai&&ai.step>0);
function armBack(){
  // Also arm while a workout is in progress on any other page, so system Back returns to that
  // workout again (tab() clears the in-app stack, which used to make Back fall through to Today).
  const want=canBack()||(!!db().active&&route.v!=='session'&&route.v!=='home');
  if(want&&!backArmed){try{history.pushState({sl:1},'')}catch(e){}backArmed=true}}
addEventListener('popstate',()=>{backArmed=false;const sh=document.querySelector('.sheet-bg,.sheet');if(sh){armBack();return}back().then(armBack)});
function go(v,p={},push=true){if(!legalOK()&&v!=='legal'&&v!=='home'){toast(t('lg.ackFirst'));return}if(push){route.scroll=window.scrollY||0;stack.push(route)}route={v,p};afterNav()}
// v30: tab() clears the in-app stack but leaves the browser Back sentinel. Back then had nowhere
// to go and opened Today, which draws the plan (no checks) while the rest interval keeps alarming.
function pop(){
  if(stack.length)route=stack.pop();
  else if(db().active&&route.v!=='session'&&route.v!=='home')route={v:'session',p:{}};
  else route={v:'home',p:{}};
  afterNav()}
async function back(){if(route.v==='ai'&&ai&&ai.step>0){ACT.aiPrev();return} // one wizard step back, answers kept
  // back from a new plan to the wizard / paste screen it came from: not leaving the flow, the answers are still there
  const toFlow=route.v==='editor'&&draft&&draft._new&&stack.length&&/^(ai|paste)$/.test(stack[stack.length-1].v);
  if(!toFlow&&(route.v==='editor'||(route.v==='day'&&route.p.direct))&&!await guard())return;if(toFlow)draftSnap=snap(draft);pop()}
async function tab(v){if(!legalOK()){toast(t('lg.ackFirst'));if(route.v!=='home'){stack=[];route={v:'home',p:{}};afterNav()}return}if((route.v==='editor'||route.v==='day')&&!await guard())return;stack=[];if(v==='home'&&db().active)v='session'; // v27: Today returns to the running workout
  const fl=flowGet(); // v28: Plans returns to an unfinished new plan
  if(v==='plans'&&ROOT[route.v]!=='plans'&&fl.at){stack=[{v:'plans',p:{}},{v:'chooser',p:{}}];if(fl.at==='ai'){ai=fl.ai||freshAI();route={v:'ai',p:{}}}else route={v:'paste',p:{text:fl.paste||''}};afterNav();return}
  route={v,p:{}};afterNav()}
$('#back').onclick=back;
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>tab(b.dataset.tab));

const TITLES={legal:'lg.legal',home:'tab.today',plans:'tab.plans',day:'title.editDay',ai:'title.newPlan',paste:'title.paste',watch:'title.watch',account:'title.account',pair:'title.pair',chooser:'title.newPlan',session:'title.workout',history:'tab.history',hist:'title.workout',settings:'tab.settings',watchSettings:'title.watchSettings'};
const ROOT={legal:'settings',home:'home',session:'home',plans:'plans',editor:'plans',day:'plans',chooser:'plans',ai:'plans',paste:'plans',history:'history',hist:'history',settings:'settings',account:'settings',pair:'settings',watch:'settings',watchSettings:'settings'};
function render(){
  if(!legalOK()&&route.v!=='legal'&&route.v!=='home'){route={v:'home',p:{}};stack=[]}
  document.body.classList.toggle('need-ack',!legalOK());
  let v=route.v;if(!VIEWS[v]){v=route.v=v==='progress'?'history':'home'}
  $('#title').textContent=!legalOK()&&v==='home'?'Simple Lift':v==='legal'?t({terms:'lg.terms',health:'lg.health',privacy:'lg.privacy'}[route.p.doc]||'lg.legal'):v==='editor'?t(draft&&draft._new?'title.newPlan':'title.editPlan'):v==='day'&&route.p.direct?t('title.editDay'):TITLES[v]?t(TITLES[v]):'Simple Lift';
  $('#back').style.visibility=stack.length?'visible':'hidden';
  const root=v==='watch'&&db().active?'home':ROOT[v];
  document.querySelectorAll('#tabs button').forEach(b=>{const on=b.dataset.tab===root;b.classList.toggle('on',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  const m=$('#view');m.style.animation='none';m.offsetHeight;m.style.animation='';
  m.innerHTML=VIEWS[v](route.p);
  resumeRest();renderGate();saveFlow();armBack();updateNet();
  afterNav.v=route.v;
}
// Entering the workout from another page scrolls to the exercise you were on. Re-rendering a set does not.
function afterNav(){
  const y=+route.scroll||0;
  const entered=route.v==='session'&&afterNav.v!=='session';
  render();
  // A fresh screen opens at the top. Back (in-app or the browser) returns to the scroll that was saved on the way in.
  if(entered)scrollToFocus();
  else if(route.v!=='session')scrollTo(0,y);
  const pin=route.v==='pair'&&$('#pairIn');if(pin)pin.focus();
}
function scrollToFocus(){
  const a=db().active;if(!a||route.v!=='session')return;
  const card=document.querySelector(`.ex-card[data-ex="${a.focus|0}"]`);if(!card)return;
  const hdr=($('header')||{getBoundingClientRect:()=>({bottom:0})}).getBoundingClientRect().bottom;
  const pick=document.querySelector('#modePicker');
  const extra=pick?pick.getBoundingClientRect().height+8:0;
  scrollTo({top:Math.max(0,scrollY+card.getBoundingClientRect().top-hdr-extra-8),behavior:'auto'});
}
function noteFocus(j){const a=db().active;if(a&&j>=0&&a.exercises&&j<a.exercises.length)a.focus=j}

/* ---------- helpers ---------- */
function nextDayIndex(plan){if(!plan||!plan.days.some(d=>!d.rest&&d.exercises.length))return -1;
  let i=(plan.next||0)%plan.days.length;for(let k=0;k<plan.days.length;k++){const d=plan.days[(i+k)%plan.days.length];if(!d.rest&&d.exercises.length)return(i+k)%plan.days.length}return -1}
const repTxt=e=>e.repMin===e.repMax?e.repMin:`${e.repMin}–${e.repMax}`;
const restTxt=s=>s>=60?`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`:t('unit.sec',{n:s});
const AI_TAG='<span class="tag ai">✨ AI</span>';
const isPaidLocked=w=>['paid','signin','verify'].includes(w);

