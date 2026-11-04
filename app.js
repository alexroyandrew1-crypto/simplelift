'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const db=()=>Store.db;
const U=()=>db().settings.units;
const step=lower=>U()==='kg'?(lower?5:2.5):(lower?10:5);
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
function go(v,p={},push=true){if(push)stack.push(route);route={v,p};render();scrollTo(0,0)}
function pop(){route=stack.pop()||{v:'home',p:{}};render();scrollTo(0,0)}
async function back(){if((route.v==='editor'||(route.v==='day'&&route.p.direct))&&!await guard())return;pop()}
async function tab(v){if((route.v==='editor'||route.v==='day')&&!await guard())return;stack=[];route={v,p:{}};render();scrollTo(0,0)}
$('#back').onclick=back;
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>tab(b.dataset.tab));

const TITLES={home:'tab.today',plans:'tab.plans',day:'title.editDay',ai:'title.newPlan',paste:'title.paste',watch:'title.watch',account:'title.account',pair:'title.pair',chooser:'title.newPlan',session:'title.workout',history:'tab.history',hist:'title.workout',settings:'tab.settings'};
const ROOT={home:'home',session:'home',plans:'plans',editor:'plans',day:'plans',chooser:'plans',ai:'plans',paste:'plans',history:'history',hist:'history',settings:'settings',account:'settings',pair:'settings',watch:'settings'};
function render(){
  let v=route.v;if(!VIEWS[v]){v=route.v=v==='progress'?'history':'home'}
  $('#title').textContent=v==='editor'?t(draft&&draft._new?'title.newPlan':'title.editPlan'):v==='day'&&route.p.direct?t('title.editDay'):TITLES[v]?t(TITLES[v]):'Simple Lift';
  $('#back').style.visibility=stack.length?'visible':'hidden';
  const root=v==='watch'&&db().active?'home':ROOT[v];
  document.querySelectorAll('#tabs button').forEach(b=>{const on=b.dataset.tab===root;b.classList.toggle('on',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  const m=$('#view');m.style.animation='none';m.offsetHeight;m.style.animation='';
  m.innerHTML=VIEWS[v](route.p);
  renderTimer();
}

/* ---------- helpers ---------- */
function nextDayIndex(plan){if(!plan||!plan.days.some(d=>!d.rest&&d.exercises.length))return -1;
  let i=(plan.next||0)%plan.days.length;for(let k=0;k<plan.days.length;k++){const d=plan.days[(i+k)%plan.days.length];if(!d.rest&&d.exercises.length)return(i+k)%plan.days.length}return -1}
const repTxt=e=>e.repMin===e.repMax?e.repMin:`${e.repMin}–${e.repMax}`;
const restTxt=s=>s>=60?`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`:t('unit.sec',{n:s});
const AI_TAG='<span class="tag ai">✨ AI</span>';
const isPaidLocked=w=>['paid','signin','verify'].includes(w);

/* ---------- views ---------- */
const VIEWS={
chooser(){return `<div class="mut">${t('chooser.intro')}</div>`+createOpts()},
home(){
  const a=db().active,plan=Store.activePlan();let h=backupNag();
  if(a)h+=`<button class="big acc" data-act="resume">${t('home.resume')}<small>${t('home.inProgress',{day:esc(a.dayName)})}</small></button>`;
  if(plan)return h+todayHTML(plan);
  if(db().plans.length)return h+`<div class="card empty"><h2>${t('home.pickPlan')}</h2><div class="mut">${t('home.pickPlanHint')}</div><button class="btn acc full" data-act="goPlans">${t('home.goPlans')}</button></div>`;
  return h+`<div class="card empty"><div class="empty-ico" aria-hidden="true">🏋️</div><h2>${t('home.noPlan')}</h2><div class="mut">${t('home.noPlanHint')}</div>
    <button class="btn acc full" data-act="chooser">${t('plans.new')}</button>
    ${typeof API_URL==='string'&&API_URL&&!Sync.a.token?`<div class="mut mt3">${t('home.haveAcct')}</div><div class="row mt2"><button class="btn" data-act="account" data-mode="in" data-from="home">${t('ac.signIn')}</button><button class="btn" data-act="account" data-mode="up" data-from="home">${t('ac.create')}</button></div>`:''}</div>`;
},
plans(){
  const ps=db().plans;
  return `<button class="btn acc full" data-act="chooser">${t('plans.new')}</button>`+(ps.length?ps.map(p=>{const tr=p.days.filter(d=>!d.rest).length,rs=p.days.length-tr;
    return `<div class="card"><div class="between"><div class="grow"><h3>${esc(p.name)}</h3><div class="mut">${t('n.trainingDay',{n:tr})}${rs?` · ${t('n.restDay',{n:rs})}`:''}</div></div>
    ${p.id===db().activePlanId?`<span class="tag">${t('plans.active')}</span>`:`<button class="btn sm" data-act="activate" data-id="${p.id}">${t('plans.use')}</button>`}</div>
    <div class="row mt3"><button class="btn grow" data-act="edit" data-id="${p.id}">${t('edit')}</button><button class="btn" data-act="dup" data-id="${p.id}">${t('copy')}</button><button class="btn bad" data-act="delPlan" data-id="${p.id}">${t('delete')}</button></div></div>`}).join('')
    :`<div class="card empty"><div class="empty-ico" aria-hidden="true">📋</div><h3>${t('plans.none')}</h3><div class="mut">${t('plans.noneHint')}</div></div>`);
},
editor(){
  const p=draft;
  const I=p._issues;const iss=I?`<div class="card issues ${I.unparsed.length?'warn':'good'}"><b>${t('ed.found',{ex:t('n.exercise',{n:I.count}),days:t('n.day',{n:I.days})})}</b> ${t('ed.checkBelow')}
    ${I.unparsed.length?`<div class="warn-txt mt2">${t('ed.unparsed',{n:I.unparsed.length})}</div><ul class="mut list">${I.unparsed.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="mut">${t('ed.addYourself')}</div>`:''}
    ${I.skipped.length?`<div class="mut mt2">${t('ed.skipped',{n:I.skipped.length})}</div>`:''}</div>`:'';
  const CR=p._cr;const req=`<details class="card"${CR?' open':''}><summary><b>${t('cr.title')}</b> <span class="mut">· ${t('optionalLc')}</span></summary><div class="mut mt2">${t('cr.hint')}</div>
    <label for="crText">${t('cr.label')}</label><textarea id="crText" rows="3" placeholder="${tA('cr.ph')}"></textarea><button class="btn acc full" data-act="applyCR">${t('cr.apply')}</button>
    ${CR?`<div class="mt3">${CR.changes.length?`<b>${t('cr.changed')}</b><ul class="list">${CR.changes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:`<b>${t('cr.nothing')}</b>`}
    ${CR.notUnderstood.length?`<div class="warn-txt">${t('cr.notDone')}</div><ul class="mut list">${CR.notUnderstood.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="mut">${t('cr.try')}</div>`:''}</div>`:''}</details>`;
  const A=p._ai;const aiN=A&&(A.ai||A.note)?`<div class="mut ainote">${A.ai?`${AI_TAG} ${t('ai.madeWith')}${A.remaining!=null?` · ${t('ai.left',{n:A.remaining})}`:''}`:`ⓘ ${esc(A.note)}`}</div>`:'';
  return aiN+iss+`<label for="plName">${t('ed.name')}</label><input id="plName" data-bind="name" value="${esc(p.name)}" placeholder="${tA('ed.namePh')}">
  <label for="plNotes">${t('ed.notes')}</label><textarea id="plNotes" data-bind="notes" rows="2" placeholder="${tA('optional')}">${esc(p.notes||'')}</textarea>
  <h3 class="sec-sm">${t('ed.days')}</h3><div class="mut">${t('ed.daysHint')}</div>
  ${p.days.map((d,i)=>`<div class="card dayrow" style="--dc:${esc(dayColor(d))}"><div class="row"><button class="grow plain" data-act="openDay" data-i="${i}">
    <h3>${esc(d.name)} ${d.rest?`<span class="tag">${t('rest')}</span>`:''}</h3>
    <span class="mut">${d.rest?t('ed.recovery'):d.exercises.length?esc(d.exercises.map(e=>e.name).join(', ')):t('ed.noEx')}</span></button>
    <div class="col"><button class="icon-btn sm" data-act="dayUp" data-i="${i}" aria-label="${tA('ed.moveUp',{name:d.name})}">▲</button><button class="icon-btn sm" data-act="dayDown" data-i="${i}" aria-label="${tA('ed.moveDown',{name:d.name})}">▼</button></div></div></div>`).join('')}
  <div class="grid2"><button class="btn" data-act="addDay">${t('ed.addDay')}</button><button class="btn" data-act="addRest">${t('ed.addRest')}</button></div>
  ${req}${foot(`<button class="btn acc" data-act="savePlan">${t('ed.save')}</button>`)}`;
},
day({i,direct}){
  const d=draft.days[i];if(!d)return'';
  return `<label for="dName">${t('day.name')}</label><input id="dName" data-bind="day.name" value="${esc(d.name)}">
  <div class="between mt3"><span>${t('day.rest')}</span><button class="chip ${d.rest?'on':''}" data-act="toggleRest" aria-pressed="${!!d.rest}">${d.rest?t('yes'):t('no')}</button></div>
  ${d.rest?'':d.exercises.map((e,j)=>`<div class="ex">
    <div class="ac"><label for="exn${j}">${t('day.exercise')}</label><input id="exn${j}" data-bind="ex.${j}.name" data-ac="${j}" value="${esc(e.name)}" placeholder="${tA('day.exPh')}" autocomplete="off"><div class="aclist" id="ac${j}" hidden></div></div>
    <div class="grid3"><div><label for="exs${j}">${t('sets')}</label><input id="exs${j}" type="number" inputmode="numeric" min="1" data-bind="ex.${j}.sets" value="${esc(e.sets)}"></div>
    <div><label for="exa${j}">${t('day.repMin')}</label><input id="exa${j}" type="number" inputmode="numeric" data-bind="ex.${j}.repMin" value="${esc(e.repMin)}"></div>
    <div><label for="exb${j}">${t('day.repMax')}</label><input id="exb${j}" type="number" inputmode="numeric" data-bind="ex.${j}.repMax" value="${esc(e.repMax)}"></div></div>
    <div class="grid2"><div><label for="exw${j}">${t('day.startW',{u:U()})}</label><input id="exw${j}" type="number" inputmode="decimal" data-bind="ex.${j}.weight" value="${esc(e.weight)}"></div>
    <div><label for="exr${j}">${t('day.restSec')}</label><input id="exr${j}" type="number" inputmode="numeric" data-bind="ex.${j}.rest" value="${esc(e.rest)}" placeholder="${restFor(e.name)}"></div></div>
    <label for="exo${j}">${t('day.note')}</label><input id="exo${j}" data-bind="ex.${j}.note" value="${esc(e.note)}" placeholder="${tA('optional')}">
    <div class="row mt3"><button class="btn sm" data-act="exUp" data-j="${j}" aria-label="${tA('day.exUp')}">▲</button><button class="btn sm" data-act="exDown" data-j="${j}" aria-label="${tA('day.exDown')}">▼</button><span class="grow"></span><button class="btn sm bad" data-act="exDel" data-j="${j}">${t('remove')}</button></div></div>`).join('')}
  ${d.rest?'':`<button class="btn full" data-act="exAdd">${t('day.addEx')}</button>`}
  <div class="card"><h3>${t('day.colour')}</h3><div class="chips">${COLORS.map(c=>`<button class="swatch ${dayColor(d)===c?'on':''}" style="background:${c}" data-act="setColor" data-c="${c}" aria-label="${tA('day.colourN',{c})}" aria-pressed="${dayColor(d)===c}"></button>`).join('')}
    <label class="swatch custom" title="${tA('day.custom')}" style="background:${esc(dayColor(d))}"><input type="color" id="customColor" value="${esc(dayColor(d))}" aria-label="${tA('day.custom')}"></label></div>
    <button class="btn full" data-act="colorAll">${t('day.colourAll')}</button></div>
  <div class="grid2 mt3"><button class="btn" data-act="dayDup">${t('day.dup')}</button><button class="btn bad" data-act="dayDel">${t('day.del')}</button></div>
  ${foot(direct?`<button class="btn" data-act="back">${t('cancel')}</button>`:'',`<button class="btn acc" data-act="${direct?'saveDay':'back'}">${direct?t('day.save'):t('done')}</button>`)}`;
},
ai(){
  const S=AI_STEPS,N=S.length+1,n=ai.step+1;
  const head=`<div class="between"><span class="wiz-step">${t('wiz.step',{n,N})}</span>${n<N?`<span class="mut">${n===6||n===7?t('optional'):''}</span>`:''}</div><div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="${N}" aria-valuenow="${n}"><i style="width:${n/N*100}%"></i></div>`;
  if(ai.step>=S.length){const busy=ai.busy,locked=isPaidLocked(aiPrecheck());
    const aiB=locked?`<button class="big ghost locked" data-act="aiBuild">🔒 ✨ ${t('wiz.buildAI')}<small>${t('wiz.paidMore')}</small></button>`
      :`<button class="big acc" data-act="aiBuild">✨ ${t('wiz.buildAI')}<small>${t('wiz.tailored')}</small></button>`;
    const qB=`<button class="big ${locked?'acc':'ghost'}" data-act="aiQuick">⚡ ${t('wiz.quick')}<small>${t('wiz.instant')}</small></button>`;
    return head+`<h2>${t('wiz.ready')}</h2><div class="card recap"><div class="mut">${t('wiz.yourPlan')}</div><b>${esc(aiGoalLine(ai.a))}</b><div class="mut mt1">${esc(aiSummary(ai.a))}</div></div>
    ${busy?`<div class="card center busy"><div class="spin"></div><b>${t('wiz.building')}</b><div class="mut mt1">${t('wiz.takes')}</div><button class="btn full" data-act="aiCancel">${t('cancel')}</button></div>`
    :`${ai.msg?`<div class="card note">${esc(ai.msg)}</div>`:''}${locked?qB+aiB:aiB+qB}${foot(`<button class="btn" data-act="aiPrev">${t('back')}</button>`)}`}`}
  const s=S[ai.step],val=ai.a[s.key],on=v=>s.multi?(val||[]).includes(v):val==v,q=t('q.'+s.key),hint=s.hint?t('qh.'+s.key):'';
  return head+`<h2>${esc(q)}</h2>${hint?`<div class="mut">${esc(hint)}</div>`:''}
  ${s.text?`<label for="aiText" class="sr">${esc(q)}</label><textarea id="aiText" class="mt3" rows="4" placeholder="${tA('wiz.injPh')}">${esc(val||'')}</textarea><div id="injHint" class="mut mt2" aria-live="polite">${injHint(val)}</div>`:''}
  <div class="opts${s.grid?' g2':''}">${s.opts.map(([v,d])=>`<button class="big opt ${on(v)?'on':''}" data-act="aiPick" data-v="${esc(v)}" aria-pressed="${on(v)}">${esc(optLabel(s.key,v))}${d?`<small>${esc(t('od.'+s.key+'.'+v))}</small>`:''}</button>`).join('')}</div>
  ${foot(`<button class="btn" data-act="aiPrev">${ai.step?t('back'):t('cancel')}</button>`,`<button class="btn acc" data-act="aiNext">${t('next')}</button>`)}`;
},
account(){const m=route.p.mode||'in',up=m==='up',a=Sync.a,em=esc(route.p.email||a.email||'');
  const note=`<div class="mut mt2" id="acNote" role="alert">${esc(route.p.note||'')}</div>`;
  const codeIn=`<label for="acCode">${t('ac.code')}</label><input id="acCode" class="codein" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456">`;
  if(m==='verify')return `<div class="card"><h3>${t('ac.checkEmail')}</h3><div>${t('ac.enterCode')}</div><div class="mut">${t('ac.sentTo',{email:esc(a.email||'')})}</div>${codeIn}
  <button class="btn acc full" data-act="acVerify">${t('ac.verify')}</button>
  <div class="row mt2"><button class="btn" data-act="acResend">${t('ac.resend')}</button><button class="btn" data-act="acOut">${t('ac.signOut')}</button></div>${note}</div>
  <div class="mut">${t('ac.untilVerify')}</div>`;
  if(m==='forgot')return `<div class="card"><h3>${t('ac.forgot')}</h3><div class="mut">${t('ac.forgotHint')}</div>
  <label for="acEmail">${t('ac.email')}</label><input id="acEmail" type="email" autocomplete="email" placeholder="you@example.com" value="${em}">
  <button class="btn acc full" data-act="acForgot">${t('ac.sendCode')}</button>
  <button class="btn full" data-act="account" data-mode="in">${t('ac.backSignIn')}</button>${note}</div>`;
  if(m==='reset')return `<div class="card"><h3>${t('ac.setNew')}</h3><div class="mut">${t('ac.resetSent',{email:em||t('ac.thatEmail')})}</div>${codeIn}
  <label for="acPw">${t('ac.newPw')}</label><input id="acPw" type="password" autocomplete="new-password">
  <button class="btn acc full" data-act="acReset" data-email="${em}">${t('ac.saveNew')}</button>
  <div class="row mt2"><button class="btn" data-act="acForgot" data-email="${em}">${t('ac.resend')}</button><button class="btn" data-act="account" data-mode="in">${t('ac.backSignIn')}</button></div>${note}</div>
  <div class="mut">${t('ac.resetNote')}</div>`;
  return `<div class="card"><h3>${up?t('ac.createTitle'):t('ac.signIn')}</h3>
  <label for="acEmail">${t('ac.email')}</label><input id="acEmail" type="email" autocomplete="email" placeholder="you@example.com" value="${em}">
  <label for="acPw">${up?t('ac.pw8'):t('ac.pw')}</label><input id="acPw" type="password" autocomplete="${up?'new-password':'current-password'}">
  <button class="btn acc full" data-act="acSubmit" data-mode="${up?'up':'in'}">${up?t('ac.create'):t('ac.signIn')}</button>
  ${up?'':`<div class="right"><button type="button" class="linkbtn" data-act="acForgotGo">${t('ac.forgotQ')}</button></div>`}
  <button class="btn full" data-act="account" data-mode="${up?'in':'up'}">${up?t('ac.haveAccount'):t('ac.createInstead')}</button>${note}</div>
  <div class="mut">${t('ac.stored')}${up?' '+t('ac.storedUp'):''} ${t('privacy.geo')}</div>`},
pair(){return `<div class="card center"><h3>⌚ ${t('pair.title')}</h3><div id="pairCode" class="pair-code">······</div><div class="mut" id="pairNote" aria-live="polite">${t('pair.getting')}</div></div>
  <div class="card"><ol class="mut steps"><li>${t('pair.s1')}</li><li>${t('pair.s2')}</li><li>${t('pair.s3')}</li></ol>
  <div class="mut mt2">${t('pair.once')}</div></div>`},
watch(){const plan=Store.plan(route.p.planId)||Store.activePlan();if(!plan)return `<div class="card mut">${t('w.noPlan')}</div>`;
  const i=Math.min(route.p.i|0,plan.days.length-1),c=watchCode(plan,i);
  db().watch={planId:plan.id,dayIndex:i,title:c.title,at:Date.now()};Store.save();
  const auto=Sync.on()?t('w.autoOn'):t('w.autoOff');
  return `<div class="card"><h3>⌚ ${t('w.send',{day:esc(plan.days[i].name)})}</h3>
  <label for="watchCode" class="sr">${t('w.code')}</label><textarea id="watchCode" class="code" rows="4" readonly>${esc(c.code)}</textarea>
  <button class="btn acc full" data-act="watchCopy">📋 ${t('w.copy')}</button>
  <ol class="mut steps mt2"><li>${t('w.s1')}</li><li>${t('w.s2')}</li><li>${t('w.s3')}</li></ol>
  <div class="mut mt2">${U()==='kg'?t('w.lbKg'):t('w.lb')}${db().active?' '+t('w.inProgress'):''}</div></div>
  <div class="card"><h3>↩ ${t('w.import')}</h3><div class="mut">${t('w.importHint')}</div>
  <label for="watchRes" class="sr">${t('w.result')}</label><textarea id="watchRes" class="code mt2" rows="3" placeholder="SR1~Push~4@95/95/105/105~3@65"></textarea>
  <button class="btn full" data-act="watchImport">${t('w.importBtn')}</button></div>
  <div class="mut"><b>${t('w.backup')}</b> ${auto}</div>`},
paste(){
  const w=aiPrecheck();const note=w===''?`<div class="mut ainote">${AI_TAG} ${t('p.aiOn')}</div>`:isPaidLocked(w)?`<div class="mut ainote">✨ ${t('p.aiPaid')}</div>`:'';
  return `<div class="mut">${t('p.intro')}</div>
  <div class="grid2 mt3"><button class="btn" data-act="pickPic">🖼 ${t('p.choose')}</button><button class="btn" data-act="takePic">📷 ${t('p.take')}</button></div>
  <input type="file" id="picFile" accept="image/*" multiple hidden><input type="file" id="camFile" accept="image/*" capture="environment" hidden>
  <div id="picTray">${trayHTML()}</div>
  ${note}
  <div id="ocrBox" class="card" hidden aria-live="polite"><div class="between"><b id="ocrMsg">${t('p.reading')}</b><span id="ocrPct" class="mut"></span></div><div class="progress"><i id="ocrBar" style="width:0"></i></div><div class="mut" id="ocrSub">${t('p.onPhone')}</div><button class="btn full" id="ocrCancel" data-act="ocrCancel" hidden>${t('cancel')}</button></div>
  <label for="pasteText">${t('p.text')}</label>
  <textarea id="pasteText" rows="14" placeholder="${tA('p.ph').replace(/\n/g,'&#10;')}">${esc(route.p.text||'')}</textarea>
  <div class="mut mt2">${t('p.tip')}</div>
  ${foot(`<button class="btn acc" data-act="parse">${w===''?'✨ '+t('p.makeAI'):t('p.make')}</button>`)}`;
},
session(){
  const a=db().active;if(!a)return`<div class="card">${t('s.none')}</div>`;
  const done=a.exercises.reduce((s,e)=>s+e.sets.filter(x=>x.done).length,0),tot=a.exercises.reduce((s,e)=>s+e.sets.length,0);
  return `<div class="between"><h2 class="m0">${esc(a.dayName)}</h2><span class="mut">${t('s.progress',{done,tot})}</span></div>
  <div class="progress"><i style="width:${tot?done/tot*100:0}%"></i></div>
  ${a.exercises.map((e,j)=>`<div class="card"><div class="between"><h3>${esc(e.name)}</h3><span class="mut">${t('s.repsRest',{reps:repTxt(e),rest:restTxt(e.rest)})}</span></div>
    ${e.note?`<div class="mut">${esc(e.note)}</div>`:''}${e.last?`<div class="mut">${t('s.last',{v:esc(e.last)})}</div>`:''}${e.sugg?`<div class="sugg">↑ ${esc(e.sugg)}</div>`:''}
    <div class="set set-head" aria-hidden="true"><span>${t('s.set')}</span><span>${U()}</span><span>${t('reps')}</span><span>${t('done')}</span></div>
    ${e.sets.map((s,k)=>{const L=tA('s.setN',{name:e.name,n:k+1});return `<div class="set"><span class="mut">${k+1}</span>
      <div class="step"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="w" data-d="-1" aria-label="${tA('s.lessW')}, ${L}">−</button><input type="number" inputmode="decimal" data-bind="set.${j}.${k}.w" class="${s.ws==='s'?'sugw':''}" value="${esc(s.w)}" aria-label="${L}, ${tA('s.weightIn',{u:U()})}"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="w" data-d="1" aria-label="${tA('s.moreW')}, ${L}">+</button></div>
      <div class="step"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="r" data-d="-1" aria-label="${tA('s.fewerR')}, ${L}">−</button><input type="number" inputmode="numeric" data-bind="set.${j}.${k}.r" value="${esc(s.r)}" aria-label="${L}, ${tA('reps')}"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="r" data-d="1" aria-label="${tA('s.moreR')}, ${L}">+</button></div>
      <button class="done ${s.done?'on':''}" data-act="setDone" data-j="${j}" data-k="${k}" aria-label="${L}, ${tA('done')}" aria-pressed="${!!s.done}">✓</button></div>`}).join('')}
    <div class="row"><button class="btn sm" data-act="setAdd" data-j="${j}">+ ${t('s.set')}</button>${e.sets.length>1?`<button class="btn sm" data-act="setDel" data-j="${j}">− ${t('s.set')}</button>`:''}</div></div>`).join('')}
  <div class="sessfoot"><button class="btn" data-act="sessMenu" aria-label="${tA('s.more')}">⋯</button><button class="btn acc grow" data-act="finish">${t('s.finish')}</button></div>`;
},
history({off=0}){
  const h=db().history.slice().sort((a,b)=>b.date-a.date);
  if(!h.length)return`<div class="card empty"><div class="empty-ico" aria-hidden="true">📈</div><h3>${t('h.none')}</h3><div class="mut">${t('h.noneHint')}</div>
    ${Store.activePlan()?`<button class="btn acc full" data-act="goToday">${t('h.goToday')}</button>`:''}</div>`;
  return progressHTML(off)+`<h2 class="sec">${t('h.workouts')}</h2>`+h.map(w=>`<button class="card plain hrow" data-act="openHist" data-id="${w.id}"><div class="between"><div><div class="mut">${fmtDate(w.date)}</div><h3>${esc(w.dayName)}</h3></div><span aria-hidden="true">›</span></div>
    <div class="mut">${t('n.exercise',{n:w.exercises.length})} · ${t('n.set',{n:sets(w)})} · ${t('h.volume',{v:num(Math.round(vol(w))),u:esc(w.units)})}${w.minutes?` · ${t('unit.min',{n:w.minutes})}`:''}</div></button>`).join('');
},
hist({id}){
  const w=db().history.find(x=>x.id===id);if(!w)return`<div class="card">${t('h.notFound')}</div>`;
  return `<div class="mut">${fmtDate(w.date)} · ${esc(w.planName||'')}</div><h2>${esc(w.dayName)}</h2>
  ${w.exercises.map(e=>`<div class="card"><h3>${esc(e.name)}</h3>${e.sets.map((s,k)=>`<div class="between"><span class="mut">${t('s.set')} ${k+1}</span><span>${esc(s.w||0)} ${esc(w.units)} × ${esc(s.r)}</span></div>`).join('')||`<div class="mut">${t('h.noSets')}</div>`}</div>`).join('')}
  <button class="btn bad full" data-act="delHist" data-id="${w.id}">${t('h.del')}</button>`;
},
settings(){
  const bs=bgSettings(),on=Sync.on(),img=localStorage.getItem(BG_KEY),plan=Store.activePlan();
  const S=(id,t,b)=>`<section aria-labelledby="sec-${id}"><h2 class="sec" id="sec-${id}">${t}</h2>${b}</section>`;
  const acct=accountCard()||`<div class="card mut">${t('set.noAccounts')}</div>`;
  const work=`<div class="card"><h3>${t('set.units')}</h3><div class="chips"><button class="chip ${U()==='lb'?'on':''}" data-act="units" data-v="lb" aria-pressed="${U()==='lb'}">lb</button><button class="chip ${U()==='kg'?'on':''}" data-act="units" data-v="kg" aria-pressed="${U()==='kg'}">kg</button></div>
    <div class="mut mt2">${t('set.unitsHint')}</div></div>
    <div class="card"><div class="between"><div><h3>${t('set.copyW')}</h3><div class="mut">${t('set.copyWHint')}</div></div><button class="chip ${db().settings.copyWeight!==false?'on':''}" data-act="copyW" aria-pressed="${db().settings.copyWeight!==false}">${db().settings.copyWeight!==false?t('on'):t('off')}</button></div></div>`;
  const look=langCard()+`<div class="card"><h3>${t('set.bg')}</h3><div class="mut">${t('set.bgHint')}</div>
   <div class="bggrid"><button class="bgopt ${bs.kind==='none'?'on':''}" data-act="bgNone" aria-pressed="${bs.kind==='none'}">${t('set.none')}</button>
   ${Object.entries(BGS).map(([k,v])=>`<button class="bgopt ${bs.kind==='preset'&&bs.id===k?'on':''}" style="background:${v}" data-act="bgPreset" data-id="${k}" aria-label="${tA('bg.'+k)}" aria-pressed="${bs.kind==='preset'&&bs.id===k}"><span>${t('bg.'+k)}</span></button>`).join('')}
   <button class="bgopt ${bs.kind==='custom'?'on':''}" data-act="bgPhoto" ${img?`style="background:center/cover url('${img}')"`:''}><span>📷 ${t('set.photo')}</span></button></div>
   <input type="file" id="bgFile" accept="image/*" hidden>
   <label for="dim">${t('set.dim')} <b id="dimv">${Math.round(bs.dim*100)}%</b></label><input type="range" id="dim" class="range" min="0" max="85" value="${Math.round(bs.dim*100)}"></div>`;
  const data=`<div class="card"><h3>${t('set.data')}</h3><div class="mut">${on?t('set.dataSynced',{email:esc(Sync.a.email||'')}):t('set.dataLocal')}</div>
    <button class="btn full" data-act="export">${t('set.export')}</button><button class="btn full" data-act="import">${t('set.restore')}</button><input type="file" id="file" accept="application/json,.json" hidden>
    <details class="more"><summary>${t('set.old')}</summary><div class="mut mt2">${t('set.oldHint')}</div>
    <button class="btn full" data-act="importOld">${t('set.old')}</button></details>
    <button class="btn bad full" data-act="reset">${t('set.reset')}</button></div>`;
  const watch=`<div class="card"><h3>${t('set.garmin')}</h3><div class="mut">${on?t('set.garminOn'):t('set.garminOff')}</div>
    ${on?`<button class="btn acc full" data-act="pair">⌚ ${t('title.pair')}</button>`:''}
    ${plan?`<button class="btn full" data-act="watch" data-i="${Math.max(0,nextDayIndex(plan))}">${t('set.manual')}</button>`:`<div class="mut mt2">${t('set.planFirst')}</div>`}</div>`;
  const about=`<div class="card"><h3>Simple Lift v${esc(APP_VERSION)}</h3><div class="mut">${t('set.about')}</div>
    <div class="mut mt3">${t('set.free')}</div>
    <div class="row wrap mt2">${/^https:\/\//.test(DONATE_URL)?`<a class="btn sm" href="${esc(DONATE_URL)}" target="_blank" rel="noopener noreferrer">${t('set.donate')}</a>`:''}
    ${/^[^@\s]+@[^@\s]+$/.test(SUPPORT_EMAIL)?`<a class="btn sm" href="mailto:${esc(SUPPORT_EMAIL)}?subject=Simple%20Lift%20support">${t('set.email')}</a>`:''}
    ${typeof API_URL==='string'&&API_URL?`<a class="btn sm" href="${esc(API_URL.replace(/\/+$/,''))}/privacy" target="_blank" rel="noopener noreferrer">${t('set.privacy')}</a>`:''}</div>
    ${/^[^@\s]+@[^@\s]+$/.test(SUPPORT_EMAIL)?`<div class="mut mt2">${t('set.bugs',{email:esc(SUPPORT_EMAIL)})}</div>`:''}</div>`;
  return S('acct',t('sec.acct'),acct)+S('work',t('sec.work'),work)+S('look',t('sec.look'),look)+S('data',t('sec.data'),data)+S('watch',t('sec.watch'),watch)+S('about',t('sec.about'),about);
}};

const BGS={
 aurora:'radial-gradient(ellipse at 20% 10%,#1f7a4d 0,transparent 55%),radial-gradient(ellipse at 80% 30%,#1e3a8a 0,transparent 50%),linear-gradient(160deg,#0b1020,#05070c)',
 sunset:'linear-gradient(170deg,#3b0d2e 0%,#7c2d12 45%,#f59e0b 100%)',
 ocean:'radial-gradient(circle at 70% 20%,#0ea5e9 0,transparent 45%),linear-gradient(180deg,#082f49,#020617)',
 steel:'repeating-linear-gradient(135deg,#1c2028 0 14px,#171a21 14px 28px)',
 forest:'radial-gradient(circle at 30% 80%,#166534 0,transparent 50%),linear-gradient(200deg,#052e16,#0a0f0a)',
 ember:'radial-gradient(circle at 50% 110%,#dc2626 0,transparent 55%),radial-gradient(circle at 10% 0,#7c2d12 0,transparent 40%),#0c0a09',
 grape:'linear-gradient(135deg,#2e1065,#701a75 55%,#0f0a1a)',
 grid:'linear-gradient(#ffffff0d 1px,transparent 1px) 0 0/32px 32px,linear-gradient(90deg,#ffffff0d 1px,transparent 1px) 0 0/32px 32px,linear-gradient(180deg,#111827,#030712)'};
const BG_KEY='simplelift_bg_img';
function bgSettings(){return db().settings.bg||{kind:'none',dim:.45}}
function applyBg(){const b=bgSettings();let el=$('#bg');if(!el){el=document.createElement('div');el.id='bg';document.body.prepend(el)}
  let css='';if(b.kind==='preset'&&BGS[b.id])css=BGS[b.id];else if(b.kind==='custom'){const u=localStorage.getItem(BG_KEY);if(u)css=`center/cover no-repeat url("${u}")`}
  el.style.background=css;el.style.setProperty('--dim',css?b.dim:0);document.body.classList.toggle('hasbg',!!css)}
function setBg(o){db().settings.bg=Object.assign(bgSettings(),o);Store.save();applyBg()}
function loadBgFile(file){return new Promise((res,rej)=>{if(!file||!/^image\//.test(file.type))return rej(new Error(t('err.notPic')));
  if(file.size>25e6)return rej(new Error(t('err.picBig')));
  const img=new Image();img.onload=()=>{const sc=Math.min(1,1080/img.width);const c=document.createElement('canvas');c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);let q=.8,u=c.toDataURL('image/jpeg',q);while(u.length>1.4e6&&q>.35){q-=.15;u=c.toDataURL('image/jpeg',q)}
    URL.revokeObjectURL(img.src);if(u.length>1.8e6)return rej(new Error(t('err.picStillBig')));res(u)};
  img.onerror=()=>rej(new Error(t('err.picRead')));img.src=URL.createObjectURL(file)})}
const COLORS=['#4ade80','#60a5fa','#f472b6','#facc15','#fb923c','#a78bfa','#2dd4bf','#f87171'];
// Wizard steps. Questions, hints, option labels and descriptions are translation keys: q.KEY, qh.KEY, o.KEY.VALUE, od.KEY.VALUE.
// opts: [value, hasDescription]
const AI_STEPS=[
 {key:'goal',opts:[['muscle',1],['strength',1],['general',1],['fatloss',1]]},
 {key:'experience',opts:[['beginner',1],['intermediate',1],['advanced',1]]},
 {key:'days',hint:1,opts:[[2],[3],[4],[5],[6],[7]]},
 {key:'minutes',grid:1,opts:[[20],[30],[45],[60],[75],[90],[105],[120]]},
 {key:'equipment',opts:[['full'],['machines'],['dumbbells'],['bodyweight']]},
 {key:'injuries',text:1,hint:1,opts:[]},
 {key:'focus',multi:1,hint:1,opts:[['chest'],['back'],['shoulders'],['biceps'],['triceps'],['quads'],['glutes'],['core']]}
];
function optLabel(k,v){return k==='days'?t('n.day',{n:v}):k==='minutes'?(v===120?t('o.minutes.120'):t('unit.min',{n:v})):t('o.'+k+'.'+v)}
function aiGoalLine(a){const g=['muscle','strength','general','fatloss'].includes(a.goal)?a.goal:'general',x=['beginner','intermediate','advanced'].includes(a.experience)?a.experience:'beginner';return[t('o.goal.'+g),t('o.experience.'+x)].join(' · ')}
function aiSummary(a){const eq=t('sum.eq.'+(['full','machines','dumbbells','bodyweight'].includes(a.equipment)?a.equipment:'full'));
  const w=parseInjuries(a.injuries).words,f=(a.focus||[]).filter(x=>x!=='none');
  return [t('sum.days',{n:+a.days||3}),t('unit.min',{n:+a.minutes||45}),eq,...(w.length?[t('sum.inj',{v:w.slice(0,2).map(x=>t('inj.'+x)).join(t('sum.injAnd'))})]:[]),...(f.length?[t('sum.focus',{v:f.slice(0,2).map(x=>t('sum.f.'+x)).join(' & ')})]:[])].join(', ')}
function injHint(x){const r=parseInjuries(x);return x&&x.trim()?(r.words.length?t('wiz.injOk',{v:`<b class="acc-txt">${r.words.map(x=>esc(t('inj.'+x))).join(', ')}</b>`}):t('wiz.injNone')):''}
function dayColor(d){return d&&d.color||'#4ade80'}
function todayHTML(plan){
  let sel=route.p.sel;if(sel==null||!plan.days[sel]){sel=nextDayIndex(plan);if(sel<0)sel=0}
  const d=plan.days[sel],c=dayColor(d),nx=nextDayIndex(plan);
  const tabs=`<div class="daytabs" role="tablist" aria-label="${tA('t.days',{name:plan.name})}">${plan.days.map((x,j)=>`<button class="daytab ${j===sel?'on':''}" role="tab" aria-selected="${j===sel}" style="--dc:${esc(dayColor(x))}" data-act="selDay" data-i="${j}">${esc(x.name)}${x.rest?' 💤':''}</button>`).join('')}</div>`;
  if(!d)return tabs;
  let body=`<div class="card daycard" style="--dc:${esc(c)}"><div class="between"><div class="grow"><div class="mut">${t('t.plan',{name:esc(plan.name)})}</div><h2 class="dayname">${esc(d.name)} ${sel===nx?`<span class="tag">${t('t.upNext')}</span>`:''}</h2></div>
    <button class="btn sm" data-act="editDay" data-i="${sel}">✎ ${t('title.editDay')}</button></div>`;
  if(d.rest)body+=`<div class="center restbox"><div class="empty-ico" aria-hidden="true">💤</div><h3>${t('day.rest')}</h3><div class="mut">${t('t.restHint')}</div></div></div>`;
  else if(!d.exercises.length)body+=`<div class="mut pad">${t('t.noEx')}</div></div>`;
  else body+=`<div class="mut">${t('n.exercise',{n:d.exercises.length})} · ${t('n.set',{n:d.exercises.reduce((s,e)=>s+(+e.sets||0),0)})}</div>
    <div class="exlist">${d.exercises.map(e=>{const g=suggest(e);return `<div class="between lrow"><span>${esc(e.name)}<br><small class="mut">${esc(sugText(g))}</small></span><span class="right">${e.sets}×${repTxt(e)}<br><small class="dc-txt">${g.w?esc(num(g.w))+' '+U():''}</small></span></div>`}).join('')}</div>
    <button class="btn full dc-btn" data-act="start" data-i="${sel}">${t('t.start')}</button></div>`;
  return tabs+body;
}
// Weekly progress summary (was the Progress tab; now the top of History).
function progressHTML(off){
  const ws=weekStart(Date.now())-off*7*864e5;
  const wk=t=>db().history.filter(h=>h.date>=t&&h.date<t+7*864e5);
  const cur=wk(ws),prev=wk(ws-7*864e5);
  const plan=Store.activePlan();const planned=plan?plan.days.filter(d=>!d.rest&&d.exercises.length).length:0;
  const V=cur.reduce((s,w)=>s+vol(w),0),PV=prev.reduce((s,w)=>s+vol(w),0),S=cur.reduce((s,w)=>s+sets(w),0);
  const weeks=[...Array(8)].map((_,i)=>{const t=ws-(7-i)*7*864e5;return{t,v:wk(t).reduce((s,w)=>s+vol(w),0)}});
  const mx=Math.max(1,...weeks.map(x=>x.v));
  const best=list=>{const m={};list.forEach(w=>w.exercises.forEach(e=>e.sets.forEach(s=>{const b=m[e.name];const w1=+s.w||0,r=+s.r||0;if(!b||w1>b.w||(w1===b.w&&r>b.r))m[e.name]={w:w1,r}})));return m};
  const bc=best(cur),bp=best(prev),end=new Date(ws+6*864e5),pct=PV?Math.round((V-PV)/PV*100):null;
  const md=x=>new Date(x).toLocaleDateString(I18N.locale(),{month:'short',day:'numeric'});
  const ch=(d,u)=>d>0?`<span class="up">+${d} ${u}</span>`:`<span class="down">${d} ${u}</span>`;
  return `<div class="between weeknav"><button class="btn" data-act="wk" data-o="${off+1}" aria-label="${tA('pr.prev')}">‹</button><div class="center"><b>${off===0?t('pr.this'):off===1?t('pr.last'):t('pr.weekOf')}</b><div class="mut">${md(ws)} – ${md(end)}</div></div><button class="btn" data-act="wk" data-o="${off-1}" aria-label="${tA('pr.next')}" ${off<=0?'disabled':''}>›</button></div>
  <div class="grid3 mt3">
   <div class="card stat-card"><div class="stat">${cur.length}<span class="stat-of">/${planned||'–'}</span></div><div class="mut">${t('h.workouts')}</div></div>
   <div class="card stat-card"><div class="stat">${num(S)}</div><div class="mut">${t('sets')}</div></div>
   <div class="card stat-card"><div class="stat stat-sm">${num(Math.round(V))}</div><div class="mut">${t('pr.volume',{u:U()})}${pct!==null?` <span class="${pct>=0?'up':'down'}">${pct>=0?'+':''}${pct}%</span>`:''}</div></div></div>
  <div class="card"><h3>${t('pr.vol8')}</h3><div class="bars" role="img" aria-label="${tA('pr.vol8aria')}">${weeks.map((w,i)=>`<div class="${i===7?'cur':''}"><i style="height:${w.v/mx*100}%"></i>${new Date(w.t).toLocaleDateString(I18N.locale(),{month:'numeric',day:'numeric'})}</div>`).join('')}</div></div>
  <div class="card"><h3>${off===0?t('pr.bestThis'):t('pr.bestThat')}</h3>${Object.keys(bc).length?Object.entries(bc).map(([n,b])=>{const p=bp[n];let c=`<span class="mut">${t('pr.new')}</span>`;
    if(p){const d=b.w-p.w,dr=b.r-p.r;c=d?ch(d,U()):dr?ch(dr,t('reps').toLowerCase()):`<span class="mut">${t('pr.same')}</span>`}
    return `<div class="between lrow"><span>${esc(n)}</span><span>${b.w} × ${b.r} · ${c}</span></div>`}).join(''):`<div class="mut">${off===0?t('pr.noneThis'):t('pr.noneThat')}</div>`}</div>`;
}
function accountCard(){if(typeof API_URL!=='string'||!API_URL)return '';const a=Sync.a;
  if(!a.token)return `<div class="card"><h3>${t('title.account')}</h3><div class="mut">${t('acc.optional')}</div>
  <div class="row mt2"><button class="btn acc" data-act="account" data-mode="up">${t('acc.signUp')}</button><button class="btn" data-act="account" data-mode="in">${t('ac.signIn')}</button></div></div>`;
  if(a.verified===false)return `<div class="card"><h3>${t('title.account')}</h3><div>${esc(a.email||'')}</div><div class="mut">⚠ ${t('acc.unverified')}</div>
  <div class="row wrap mt2"><button class="btn sm acc" data-act="account" data-mode="verify">${t('acc.enterCode')}</button><button class="btn sm" data-act="acOut">${t('ac.signOut')}</button><button class="btn sm bad" data-act="delAcct">${t('acc.del')}</button></div></div>`;
  return `<div class="card"><h3>${t('title.account')}</h3><div>${esc(a.email||'')}</div>${a.plan?`<div class="mut">${t('acc.plan',{v:a.plan==='paid'?t('acc.paid'):t('acc.free')})}</div>`:''}<div class="mut" id="syncStatus">${esc(Sync.status())}</div>
  <div class="row wrap mt2"><button class="btn sm" data-act="acSync">⟳ ${t('acc.syncNow')}</button><button class="btn sm" data-act="acOut">${t('ac.signOut')}</button></div>
  <div class="mut mt2">${t('acc.syncHint')}</div>
  <button class="btn sm bad mt3" data-act="delAcct">${t('acc.del')}…</button></div>`}
// Gentle backup reminder: only without an account, only once workouts exist, at most every 14 days, dismissible.
const NAG_MS=14*864e5;
function backupNag(){const s=db().settings,h=db().history;if(Sync.a.token||!h.length)return'';
  const base=Math.max(s.backupAt||0,s.nagAt||0,Math.min(...h.map(x=>x.date||0)));if(Date.now()-base<NAG_MS)return'';
  return `<div class="card nag" role="status"><b>${t('nag.title')}</b><div class="mut mt1">${t('nag.hint')}</div>
  <div class="row mt2"><button class="btn sm acc" data-act="export">${t('nag.now')}</button><button class="btn sm" data-act="nagLater">${t('nag.later')}</button></div></div>`}
// Recommended weight: same rules as the original app's sug(): no history -> start weight ("Starting estimate" / "Bodyweight");
// last session hit top of rep range on all planned sets -> +5 (upper/db) or +10 (lower) lb; otherwise repeat weight.
function exType(e){return e.type||(isLower(e.name)?'lower':'upper')}
function suggest(e){const l=Store.lastFor(e.name,e.oldId);const start=e.weight===''||e.weight==null?0:+e.weight;
  if(!l||!l.sets.length){if(start)return{w:start,k:'start',last:null};
    const g=startWeight(e.name,U());return{w:g,k:g?'sugStart':'bw',last:null,guess:1}}
  const w=Math.max(...l.sets.map(s=>+s.w||0));const top=l.sets.length>=+e.sets&&l.sets.every(s=>+s.r>=+e.repMax);
  if(top&&w>0){const inc=step(exType(e)==='lower');return{w:w+inc,k:'top',inc,last:l,up:1}}
  return{w,k:'repeat',last:l}}
// Suggestion reason text, in the current language (kept out of suggest() so a language change applies instantly).
const sugText=g=>t('sug.'+g.k,{n:g.inc,u:U()});
const createOpts=()=>`<button class="big" data-act="ai">🧭 ${t('co.guided')}<small>${t('co.guidedHint')}</small></button>
  <button class="big" data-act="newPlan">✎ ${t('co.own')}<small>${t('co.ownHint')}</small></button>
  <button class="big" data-act="paste">📷 ${t('co.copy')}<small>${t('co.copyHint')}</small></button>`;
const foot=(...b)=>{b=b.filter(Boolean);return `<div class="foot${b.length>1?' two':''}">${b.join('')}</div>`};
// v19: paid + verified + online -> the photo goes to Grok vision (/ai/parse-image) and opens straight in the plan preview.
// Any AI failure falls back silently to on-device OCR with a short note; Cancel stops the AI request and keeps you on this screen.
let picCtl=null;
// v22: several pictures at once (pages / screenshots of one plan). Picked pictures wait in a tray until "Read".
let picTray=[];
function trayHTML(){if(!picTray.length)return '';
  return `<div class="card tray"><div class="between"><b>${t('p.trayN',{n:picTray.length})}</b><span class="mut">${t('p.trayMax',{n:MAX_PICS})}</span></div>
  <div class="thumbs mt2">${picTray.map((p,i)=>`<div class="thumb"><img src="${p.url}" alt="${tA('p.picN',{n:i+1})}"><button class="icon-btn rm" data-act="rmPic" data-i="${i}" aria-label="${tA('p.rmPic',{n:i+1})}">×</button></div>`).join('')}</div>
  <div class="grid2 mt2">${picTray.length<MAX_PICS?`<button class="btn" data-act="pickPic">＋ ${t('p.addMore')}</button>`:'<span></span>'}<button class="btn acc" data-act="readPics">${t('p.readN',{n:picTray.length})}</button></div></div>`}
function refreshTray(){const el=$('#picTray');if(el)el.innerHTML=trayHTML()}
function addPics(files){const fs=[...files].filter(f=>f&&/^image\//.test(f.type));const room=MAX_PICS-picTray.length;
  if(fs.length>room)toast(t('p.tooMany',{n:MAX_PICS}));
  fs.slice(0,Math.max(0,room)).forEach(f=>picTray.push({file:f,url:URL.createObjectURL(f)}));refreshTray()}
function clearTray(){picTray.forEach(p=>URL.revokeObjectURL(p.url));picTray=[];refreshTray()}
async function runOCR(files){files=Array.isArray(files)?files:[files];const n=files.length;const box=$('#ocrBox');box.hidden=false;const set=(p,m)=>{$('#ocrBar').style.width=Math.round(p*100)+'%';$('#ocrPct').textContent=Math.round(p*100)+'%';$('#ocrMsg').textContent=m+'…'};
  let note='';
  if(aiPrecheck()===''){
    const ctl=picCtl=new AbortController();$('#ocrCancel').hidden=false;$('#ocrSub').textContent=t('p.sending');
    $('#ocrBar').style.width='35%';$('#ocrBar').classList.add('pulse');$('#ocrPct').textContent='';$('#ocrMsg').textContent=t('p.readingAI');
    let r=null;try{const imgs=[];for(const f of files)imgs.push(await imageToJpeg(f));r=await parseImagePlan(imgs,ctl.signal)}catch(e){lastAI={ai:false,note:photoNote('')}}
    if(picCtl===ctl)picCtl=null;const b=$('#ocrBox');if(!b||route.v!=='paste')return;$('#ocrCancel').hidden=true;$('#ocrBar').classList.remove('pulse');
    if(r){openDraft(r.plan);draft._new=1;draft._ai=Object.assign({},lastAI,{photo:true});draft._issues=issuesOf(r);go('editor');toast(t('p.readOK'));return}
    if(ctl.signal.aborted||(lastAI&&lastAI.cancelled)){b.hidden=true;toast(t('cancelled'));return}
    note=(lastAI&&lastAI.note)||photoNote('');$('#ocrSub').textContent=t('p.onPhone')}
  // free / fallback: read each picture on the phone and join the text in order
  try{const parts=[];for(let i=0;i<n;i++){const pre=n>1?t('p.picOf',{i:i+1,n})+' · ':'';
      try{parts.push(await imageToText(files[i],(p,m)=>set((i+p)/n,pre+m)))}catch(e){if(n===1)throw e;parts.push('')}}
    const txt=parts.filter(Boolean).join('\n\n');if(!txt)throw new Error(t('ocr.noText'));
    const ta=$('#pasteText');ta.value=(ta.value.trim()?ta.value.trim()+'\n\n':'')+txt;route.p.text=ta.value;$('#ocrMsg').textContent=t('p.ocrDone');$('#ocrPct').textContent='';
    if(note)$('#ocrSub').textContent='ⓘ '+note;ta.focus()}
  catch(e){box.hidden=true;info(t('p.ocrFail'),String(e&&e.message||e))}}
const issuesOf=r=>({unparsed:r.unparsed,skipped:r.skipped,days:r.plan.days.filter(d=>!d.rest).length,count:r.plan.days.reduce((s,d)=>s+d.exercises.length,0)});
/* ---------- data helpers ---------- */
const vol=w=>w.exercises.reduce((s,e)=>s+e.sets.reduce((a,x)=>a+(+x.w||0)*(+x.r||0),0),0);
const sets=w=>w.exercises.reduce((s,e)=>s+e.sets.length,0);
function weekStart(t){const d=new Date(t);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getTime()}
// Fill missing rests from the library; refresh ones that were auto-filled (restAuto) in case the name changed. User-entered rests are untouched.
function autoRests(p){p.days.forEach(d=>d.exercises.forEach(e=>{if(e.restAuto)e.rest='';fillRest(e)}))}
const newEx=()=>({id:Store.uid(),name:'',sets:3,repMin:8,repMax:12,weight:'',rest:'',restAuto:true,note:''}); // rest filled from the library when a name is chosen
const clone=o=>JSON.parse(JSON.stringify(o));
function blankPlan(){return{id:Store.uid(),name:t('ed.namePh'),created:Date.now(),next:0,days:[{id:Store.uid(),name:t('dayN',{n:1}),rest:false,exercises:[newEx()]}]}}
const swap=(a,i,j)=>{if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]]};

function startWorkout(i){
  const plan=Store.activePlan(),d=plan.days[i];
  const ex=d.exercises.filter(e=>e.name.trim()).map(e=>{
    const g=suggest(e),last=g.last,lower=exType(e)==='lower';
    const w=g.w||'',r=g.up||!last?(+e.repMin||8):(+last.sets[0].r||+e.repMin||8);
    const lastTxt=last?last.sets.map(s=>`${s.w||0}×${s.r}`).join(', '):'',sugg=g.guess&&g.w?t('sug.guess',{w:num(g.w),u:U()}):t('sug.rec',{w:g.w?num(g.w)+' '+U():t('sug.bwLc'),why:sugText(g)});
    return{oldId:e.oldId,type:e.type,name:e.name,lower,repMin:+e.repMin,repMax:+e.repMax,rest:restOf(e),note:e.note,last:lastTxt,sugg,sets:[...Array(Math.max(1,+e.sets||1))].map(()=>({w,r,done:false,ws:'s'}))}});
  if(!ex.length){toast(t('t.addFirst'));return}
  db().active={id:Store.uid(),planId:plan.id,planName:plan.name,dayIndex:i,dayName:d.name,started:Date.now(),exercises:ex};Store.save();go('session');
}
// Mark every unticked set done, filling blanks with the previous set's weight or the recommended weight, and the rep target.
function fillRemaining(a){const pl=Store.plan(a.planId),day=pl&&pl.days[a.dayIndex];
  a.exercises.forEach(le=>{const pe=day&&day.exercises.find(e=>e.name===le.name);
    le.sets.forEach((st,k)=>{if(st.done)return;
      if(st.w===''||st.w==null){const prev=k>0?le.sets[k-1].w:'';st.w=prev!==''&&prev!=null?prev:(pe?suggest(pe).w:0);st.ws=st.ws||'s'}
      if(st.r===''||st.r==null)st.r=pe?(+pe.repMin||8):8;
      st.done=true})});Store.save()}
async function finishFlow(){const a=db().active;if(!a)return;
  const left=a.exercises.reduce((n,e)=>n+e.sets.filter(x=>!x.done).length,0),done=a.exercises.reduce((n,e)=>n+e.sets.filter(x=>x.done).length,0);
  if(!left)return finishWorkout();
  const acts=[{v:'fill',label:t('fin.fill',{n:left}),cls:'acc'}];
  acts.push(done?{v:'ticked',label:t('fin.ticked',{n:done})}:{v:'close',label:t('fin.close'),cls:'bad'});
  acts.push({v:null,label:t('fin.keep')});
  const v=await sheet({title:t('fin.title'),msg:t('fin.msg',{n:left}),actions:acts});
  if(v==='fill'){fillRemaining(a);finishWorkout()}else if(v==='ticked'||v==='close')finishWorkout()}
function finishWorkout(){
  const a=db().active;if(!a)return;
  const exs=a.exercises.map(e=>({name:e.name,oldId:e.oldId,type:e.type,lower:e.lower,sets:e.sets.filter(s=>s.done).map(s=>({w:+s.w||0,r:+s.r||0}))})).filter(e=>e.sets.length);
  if(exs.length)Store.addHistory({id:a.id,date:Date.now(),planId:a.planId,planName:a.planName,dayName:a.dayName,units:U(),minutes:Math.round((Date.now()-a.started)/6e4),exercises:exs});
  const p=Store.plan(a.planId);if(p){p.next=(a.dayIndex+1)%p.days.length;Store.upsertPlan(p)}
  db().active=null;Store.save();stopTimer();stack=[];toast(exs.length?t('fin.saved'):t('fin.closed'));route={v:'history',p:{}};render();scrollTo(0,0)}
function localReset(){Store.reset();localStorage.removeItem(BG_KEY);applyBg();stopTimer();draft=null}
/* ---------- rest timer ---------- */
function startTimer(sec){timer={end:Date.now()+sec*1000};clearInterval(timer.h);timer.h=setInterval(renderTimer,250);renderTimer()}
function stopTimer(){if(timer)clearInterval(timer.h);timer=null;renderTimer()}
function renderTimer(){let el=$('#timer');
  if(!timer||route.v!=='session'){if(el)el.remove();return}
  const left=Math.max(0,Math.ceil((timer.end-Date.now())/1000));
  if(!el){el=document.createElement('div');el.id='timer';el.className='timer';document.body.appendChild(el);
    el.innerHTML=`<span>${t('rest')} <b id="tl"></b></span><span class="row"><button class="btn sm" data-act="t15">+${t('unit.sec',{n:15})}</button><button class="btn sm" data-act="tskip">${t('timer.skip')}</button></span>`;}
  el.querySelector('#tl').textContent=restTxt(left);
  if(left<=0){navigator.vibrate&&navigator.vibrate([200,100,200]);toast(t('timer.over'));stopTimer()}}

/* ---------- events ---------- */
const errMsg=x=>x&&x.message||String(x);
let authFrom='';
const ACT={
 resume:()=>go('session'),start:b=>startWorkout(+b.dataset.i),
 goPlans:()=>tab('plans'),goToday:()=>tab('home'),
 newPlan:()=>{openDraft(blankPlan());draft._new=1;go('editor')},
 edit:b=>{openDraft(clone(Store.plan(b.dataset.id)));go('editor')},
 dup:b=>{const p=clone(Store.plan(b.dataset.id));p.id=Store.uid();p.name=t('plans.copyName',{name:p.name});p.days.forEach(d=>{d.id=Store.uid()});Store.upsertPlan(p);toast(t('plans.copied'));render()},
 activate:b=>{Store.setActive(b.dataset.id);toast(t('plans.following'));render()},
 delPlan:async b=>{const p=Store.plan(b.dataset.id);if(await ask(t('plans.delQ'),t('plans.delMsg',{name:p?p.name:''}),t('plans.del'),'bad')){Store.deletePlan(b.dataset.id);toast(t('plans.deleted'));render()}},
 openDay:b=>go('day',{i:+b.dataset.i}),
 dayUp:b=>{swap(draft.days,+b.dataset.i,+b.dataset.i-1);render()},dayDown:b=>{swap(draft.days,+b.dataset.i,+b.dataset.i+1);render()},
 addDay:()=>{draft.days.push({id:Store.uid(),name:t('dayN',{n:draft.days.filter(d=>!d.rest).length+1}),rest:false,exercises:[newEx()]});go('day',{i:draft.days.length-1})},
 addRest:()=>{draft.days.push({id:Store.uid(),name:t('rest'),rest:true,exercises:[]});render()},
 savePlan:()=>{if(!draft.name.trim())draft.name=t('ed.namePh');draft.days.forEach(d=>d.exercises=d.exercises.filter(e=>e.name.trim()));autoRests(draft);
   if(!draft.days.length){toast(t('ed.oneDay'));return}
   const isNew=draft._new;delete draft._new;delete draft._issues;delete draft._cr;delete draft._ai;Store.upsertPlan(draft);if(isNew)Store.setActive(draft.id);draftSnap=snap(draft);
   toast(t('ed.saved'));stack=[];go(isNew?'home':'plans',{},false)},
 toggleRest:()=>{const d=draft.days[route.p.i];d.rest=!d.rest;if(!d.rest&&!d.exercises.length)d.exercises.push(newEx());render()},
 exAdd:()=>{draft.days[route.p.i].exercises.push(newEx());render();const ins=document.querySelectorAll('[data-ac]');ins[ins.length-1]?.focus()},
 exDel:b=>{draft.days[route.p.i].exercises.splice(+b.dataset.j,1);render()},
 exUp:b=>{swap(draft.days[route.p.i].exercises,+b.dataset.j,+b.dataset.j-1);render()},exDown:b=>{swap(draft.days[route.p.i].exercises,+b.dataset.j,+b.dataset.j+1);render()},
 // In "Edit day" opened from Today, duplicate/delete save straight away (the same as Save day), so nothing is lost.
 dayDup:()=>{const i=route.p.i,d=clone(draft.days[i]);d.id=Store.uid();d.name=t('day.copyName',{name:d.name});d.exercises.forEach(e=>e.id=Store.uid());draft.days.splice(i+1,0,d);
   if(route.p.direct){commitDay(i+1);toast(t('day.duped'))}else pop()},
 dayDel:async()=>{const i=route.p.i;if(route.p.direct&&draft.days.length===1){toast(t('day.needOne'));return}
   if(!await ask(t('day.delQ'),t('day.delMsg',{name:draft.days[i].name}),t('day.del'),'bad'))return;
   draft.days.splice(i,1);if(route.p.direct){commitDay(Math.max(0,i-1));toast(t('day.deleted'))}else pop()},
 back:()=>back(),
 selDay:b=>{route.p.sel=+b.dataset.i;render();document.querySelector('.daytab.on')?.scrollIntoView({inline:'center',block:'nearest'})},
 editDay:b=>{openDraft(clone(Store.activePlan()));go('day',{i:+b.dataset.i,direct:1})},
 setColor:b=>{draft.days[route.p.i].color=b.dataset.c;render()},
 colorAll:()=>{const c=dayColor(draft.days[route.p.i]);draft.days.forEach(d=>d.color=c);toast(t('day.colourAllDone'))},
 saveDay:()=>{commitDay(route.p.i);toast(t('day.saved'))},
 bgNone:()=>{setBg({kind:'none'});render()},
 bgPreset:b=>{setBg({kind:'preset',id:b.dataset.id});render()},
 bgPhoto:()=>{const f=$('#bgFile');f.value='';f.onchange=async()=>{try{const u=await loadBgFile(f.files[0]);try{localStorage.setItem(BG_KEY,u)}catch(e){throw new Error(t('err.noSpace'))}setBg({kind:'custom'});toast(t('set.bgSet'));render()}catch(e){toast(errMsg(e),'err')}};f.click()},
 importOld:async()=>{const r=await importOldApp();showOldResult(r,true)},
 paste:()=>go('paste'),
 sessMenu:async()=>{const a=db().active;if(!a)return;const v=await sheet({title:t('s.options'),actions:[{v:'watch',label:'⌚ '+t('s.toWatch')},{v:'discard',label:t('s.discard'),cls:'bad'},{v:null,label:t('close')}]});
   if(v==='watch')go('watch',{i:a.dayIndex,planId:a.planId});
   else if(v==='discard'&&await ask(t('s.discardQ'),t('s.discardMsg'),t('s.discard'),'bad',t('fin.keep'))){db().active=null;Store.save();stopTimer();toast(t('s.discarded'));tab('home')}},
 finish:()=>finishFlow(),
 // v22: Today's empty screen also opens sign-in / sign-up; after signing in we return to Today (sync pulls the account's data)
 account:b=>{if(route.v!=='account')authFrom=b.dataset.from||'';go('account',{mode:b.dataset.mode||'in'},route.v!=='account')},
 acSubmit:async b=>{const e=$('#acEmail').value.trim(),p=$('#acPw').value,n=$('#acNote');if(!e||!p){n.textContent=t('ac.needBoth');return}
   b.disabled=true;b.textContent=t('working');try{const j=await Sync.signIn(b.dataset.mode,e,p);
     if(j.verified===false){go('account',{mode:'verify',note:j.mailError?Sync.msg({error:j.mailError}):''},false);return}
     toast(t('ac.signedIn'));stack=[];tab(authFrom==='home'?'home':'settings')}catch(x){n.textContent=errMsg(x);b.disabled=false;b.textContent=b.dataset.mode==='up'?t('ac.create'):t('ac.signIn')}},
 acVerify:async b=>{const c=($('#acCode').value||'').replace(/\D/g,'');if(c.length!==6){$('#acNote').textContent=t('ac.need6');return}
   b.disabled=true;b.textContent=t('ac.checking');try{await Sync.verify(c);toast(t('ac.verified'));stack=[];tab(authFrom==='home'?'home':'settings')}catch(x){$('#acNote').textContent=x.message;b.disabled=false;b.textContent=t('ac.verify')}},
 acResend:async b=>{b.disabled=true;try{await Sync.resend();$('#acNote').textContent=t('ac.newCode')}catch(x){$('#acNote').textContent=x.status===429?t('ac.wait5'):x.message}setTimeout(()=>{b.disabled=false},60000)},
 acForgotGo:b=>{const e=$('#acEmail');go('account',{mode:'forgot',email:e?e.value.trim():''},false)},
 acForgot:async b=>{const el=$('#acEmail'),e=(el?el.value:b.dataset.email||'').trim();if(!e){$('#acNote').textContent=t('ac.needEmail');return}
   b.disabled=true;try{await Sync.forgot(e);go('account',{mode:'reset',email:e,note:route.p.mode==='reset'?t('ac.newCodeIf'):''},false)}catch(x){const n=$('#acNote');if(n)n.textContent=x.status===429?t('ac.wait'):x.message;b.disabled=false}},
 acReset:async b=>{const c=($('#acCode').value||'').replace(/\D/g,''),p=$('#acPw').value,n=$('#acNote');if(c.length!==6){n.textContent=t('ac.need6');return}
   if(p.length<8){n.textContent=t('ac.pwShort');return}
   b.disabled=true;b.textContent=t('saving');try{await Sync.reset(b.dataset.email,c,p);toast(t('ac.pwChanged'));stack=[];tab('settings')}catch(x){n.textContent=x.message;b.disabled=false;b.textContent=t('ac.saveNew')}},
 acOut:async()=>{if(!await ask(t('ac.outQ'),t('ac.outMsg'),t('ac.signOut')))return;await Sync.signOut();stack=[];tab('home')},
 acSync:async()=>{await Sync.now();toast(Sync.a.err||t('acc.synced'))},
 delAcct:async()=>{
   const v=await sheet({title:t('del.title'),msg:t('del.msg'),
     html:`<label for="dPw">${t('del.pw')}</label><input id="dPw" name="pw" type="password" autocomplete="current-password">
       <label for="dCf">${t('del.type')}</label><input id="dCf" name="cf" autocomplete="off" autocapitalize="characters" spellcheck="false">
       <label class="chk"><input type="checkbox" name="wipe"> ${t('del.wipe')}</label>`,
     actions:[{v:'del',label:t('del.btn'),cls:'bad',run:async o=>{const pw=o.querySelector('#dPw').value,cf=o.querySelector('#dCf').value;
       if(cf.trim().toUpperCase()!=='DELETE')return t('del.typeErr');if(!pw)return t('del.pwErr');
       try{await Sync.deleteAccount(pw,'DELETE');return true}catch(x){return errMsg(x)}}},{v:null,label:t('cancel')}]});
   if(v!=='del')return;const wipe=sheetVals.wipe;if(wipe)localReset();stack=[];route={v:'settings',p:{}};render();
   toast(wipe?t('del.doneWipe'):t('del.done'))},
 pair:async()=>{go('pair');try{const j=await Sync.pair();$('#pairCode').textContent=j.code;$('#pairNote').textContent=t('pair.expires')}catch(x){$('#pairNote').textContent=t('pair.fail',{msg:x.message})}},
 watch:b=>go('watch',{i:+b.dataset.i,planId:Store.activePlan()?.id}),
 watchCopy:async()=>{const ta=$('#watchCode');ta.focus();ta.select();let ok=false;try{await navigator.clipboard.writeText(ta.value);ok=true}catch(e){try{ok=document.execCommand('copy')}catch(_){}}toast(ok?t('w.copied'):t('w.selected'))},
 watchImport:async()=>{const r=parseResult($('#watchRes').value);if(!r){toast(t('w.badCode'),'err');return}
   try{const o=applyResult(r);await info(t('w.imported'),o.msg);stack=[];if(o.mode==='live')go('session',{},false);else go('history',{},false)}catch(e){info(t('w.importFail'),errMsg(e))}},
 chooser:()=>go('chooser'),
 ocrCancel:()=>{if(picCtl)picCtl.abort()},
 pickPic:()=>{const f=$('#picFile');f.value='';f.onchange=()=>f.files.length&&addPics(f.files);f.click()},
 takePic:()=>{const f=$('#camFile');f.value='';f.onchange=()=>f.files[0]&&addPics(f.files);f.click()},
 rmPic:b=>{const p=picTray.splice(+b.dataset.i,1)[0];if(p)URL.revokeObjectURL(p.url);refreshTray()},
 readPics:()=>{if(!picTray.length)return;const fs=picTray.map(p=>p.file);clearTray();runOCR(fs)},
 applyCR:async()=>{const t=$('#crText').value;if(!t.trim()){toast(window.t('cr.typeFirst'));return}const r=await applyChangeRequest(draft,t);
   const keep={_new:draft._new,_issues:draft._issues,_ai:draft._ai};draft=Object.assign(r.plan,keep);draft._cr={changes:r.changes,notUnderstood:r.notUnderstood};render();
   setTimeout(()=>document.querySelector('#crText')?.closest('details').scrollIntoView({block:'start'}),30)},
 parse:async b=>{const t=$('#pasteText').value;if(!t.trim()){toast(window.t('p.first'));return}route.p.text=t;
   b.disabled=true;const r=await parseTextPlan(t);b.disabled=false;if(!r.plan.days.length){info(window.t('p.noneTitle'),window.t('p.noneMsg'));return}
   openDraft(r.plan);draft._new=1;draft._ai=lastAI;draft._issues=issuesOf(r);go('editor')},
 ai:()=>{ai={step:0,a:{injuries:'',focus:[]}};go('ai')},
 aiPick:async b=>{const s=AI_STEPS[ai.step];let v=b.dataset.v;if(typeof s.opts[0][0]==='number')v=+v;
   if(s.multi){let arr=ai.a[s.key];if(v==='none')arr=[];else{arr=arr.includes(v)?arr.filter(x=>x!==v):[...arr,v];if(s.key==='focus'&&arr.length>3)arr.shift()}ai.a[s.key]=arr;render();return}
   ai.a[s.key]=v;ai.step++;render();scrollTo(0,0)},
 aiPrev:()=>{if(ai.busy)return;const tx=$('#aiText');if(tx)ai.a[AI_STEPS[ai.step].key]=tx.value;ai.msg='';if(!ai.step){pop();return}ai.step--;render();scrollTo(0,0)},
 aiNext:()=>{const S=AI_STEPS,st=S[ai.step];if(!st)return;const tx=$('#aiText');if(tx)ai.a[st.key]=tx.value;
   if(!st.multi&&!st.text&&ai.a[st.key]==null){toast(t('wiz.pick'));return}
   ai.step++;ai.msg='';render();scrollTo(0,0)},
 aiQuick:()=>{if(ai.busy)return;ai.msg='';openDraft(rulePlan(ai.a));draft._new=1;stack=[{v:'plans',p:{}}];go('editor',{},false);toast(t('wiz.readyQuick'))},
 aiBuild:async()=>{if(ai.busy)return;
   const why=aiPrecheck();if(why){ai.msg=t('wiz.why.'+(['paid','none','offline','verify'].includes(why)?why:'signin'));render();return}
   const ctl=new AbortController();ai.ctl=ctl;ai.busy=true;ai.msg='';render();
   const p=await generatePlan(ai.a,{signal:ctl.signal});if(ai.ctl!==ctl||ctl.signal.aborted)return; // cancelled
   ai.busy=false;ai.ctl=null;openDraft(p);draft._new=1;draft._ai=lastAI;stack=[{v:'plans',p:{}}];go('editor',{},false);
   toast(lastAI&&lastAI.ai?t('wiz.readyAI'):lastAI&&lastAI.note?lastAI.note:t('wiz.readyBuiltin'))},
 aiCancel:()=>{if(ai.ctl)ai.ctl.abort();ai.ctl=null;ai.busy=false;ai.msg='';render();toast(t('cancelled'))},
 stp:(b,e,mult=1)=>{if(e&&e.type==='click'&&holdUntil>Date.now())return; // pointer already handled it
   const s=db().active.exercises[+b.dataset.j].sets[+b.dataset.k],f=b.dataset.f,d=+b.dataset.d;
   const inc=(f==='w'?(U()==='kg'?2.5:5):1)*mult;s[f]=Math.max(0,Math.round(((+s[f]||0)+d*inc)*10)/10);Store.save();
   b.parentNode.querySelector('input').value=s[f];if(f==='w'){s.ws='m';b.parentNode.querySelector('input').classList.remove('sugw');cascadeW(+b.dataset.j,+b.dataset.k);Store.save()}},
 setDone:b=>{const e=db().active.exercises[+b.dataset.j],s=e.sets[+b.dataset.k];s.done=!s.done;if(s.done&&s.ws==='s')s.ws='m';Store.save();render();if(s.done)startTimer(e.rest)},
 setAdd:b=>{const e=db().active.exercises[+b.dataset.j],l=e.sets[e.sets.length-1];e.sets.push({w:l.w,r:l.r,done:false,ws:l.ws==='s'?'s':'c'});Store.save();render()},
 setDel:b=>{db().active.exercises[+b.dataset.j].sets.pop();Store.save();render()},
 t15:()=>{timer.end+=15000;renderTimer()},tskip:stopTimer,
 openHist:b=>go('hist',{id:b.dataset.id}),
 delHist:async b=>{if(await ask(t('h.delQ'),t('h.delMsg'),t('h.delBtn'),'bad')){Store.deleteHistory(b.dataset.id);toast(t('h.deleted'));pop()}},
 wk:b=>{route.p.off=Math.max(0,+b.dataset.o);render()},
 copyW:()=>{db().settings.copyWeight=db().settings.copyWeight===false;Store.save();render()},
 units:b=>{db().settings.units=b.dataset.v;db().settings.unitsChosen=true;Store.save();render()},
 nagLater:()=>{db().settings.nagAt=Date.now();Store.save();render();toast(t('nag.ok'))},
 export:()=>{const blob=new Blob([Store.exportJSON()],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`simplelift-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();
   db().settings.backupAt=Date.now();Store.save();if(route.v==='home')render();toast(t('set.exported'))},
 import:async()=>{if(!await ask(t('rs.q'),t('rs.msg')+(Sync.on()?' '+t('rs.merge'):'')+' '+t('rs.first'),t('rs.choose'),'acc'))return;
   const f=$('#file');f.value='';f.onchange=()=>{if(!f.files[0])return;const r=new FileReader();r.onload=()=>{try{Store.importJSON(r.result);applyBg();toast(t('rs.done'));I18N.applyDoc();tab('home')}catch(e){info(t('rs.fail'),errMsg(e))}};r.readAsText(f.files[0])};f.click()},
 reset:async()=>{
   if(!Sync.on()){if(await ask(t('rst.q'),t('rst.msg'),t('rst.erase'),'bad')){localReset();tab('home');toast(t('rst.done'))}return}
   const v=await sheet({title:t('rst.q'),msg:t('rst.cloudMsg',{email:Sync.a.email||t('rst.yourAcct')}),
     actions:[{v:'all',label:t('rst.all'),cls:'bad'},{v:'local',label:t('rst.local')},{v:null,label:t('cancel')}]});
   if(v==='all'){Store.wipeEverywhere();localStorage.removeItem(BG_KEY);applyBg();stopTimer();draft=null;await Sync.now();tab('home');toast(Sync.a.err?t('rst.later'):t('rst.allDone'))}
   else if(v==='local'){await Sync.signOut();localReset();tab('home');toast(t('rst.localDone'))}}
};
function commitDay(sel){draft.days.forEach(d=>d.exercises=d.exercises.filter(e=>e.name.trim()));autoRests(draft);Store.upsertPlan(draft);draftSnap=snap(draft);
  pop();if(route.v==='home'){route.p.sel=Math.min(sel,draft.days.length-1);render();scrollTo(0,0)}}
// Press-and-hold on +/- : one step on press, repeat after 350ms every 120ms, faster over time, double step after 3s.
let holdUntil=0,holdT=null;
function holdStop(){if(holdT){clearTimeout(holdT);holdT=null}}
document.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-act="stp"]');if(!b||e.button>0)return;
  e.preventDefault();holdStop();const t0=Date.now();ACT.stp(b,null);holdUntil=Date.now()+1e9;
  const tick=()=>{const el=Date.now()-t0;ACT.stp(b,null,el>3000?2:1);holdT=setTimeout(tick,Math.max(60,120-Math.floor((el-350)/1000)*25))};
  holdT=setTimeout(tick,350)});
['pointerup','pointercancel','pointerleave'].forEach(t=>document.addEventListener(t,e=>{if(holdT||holdUntil>Date.now()){holdStop();holdUntil=Date.now()+400}},true));
document.addEventListener('contextmenu',e=>{if(e.target.closest('[data-act="stp"]'))e.preventDefault()});
document.addEventListener('click',e=>{
  const pick=e.target.closest('[data-pick]');
  if(pick){const j=+pick.dataset.pick,ex=draft.days[route.p.i].exercises[j],L=libFind(pick.dataset.name);ex.name=L.name;
    if(!hasRest(ex.rest)||ex.restAuto){ex.rest=L.rest;ex.restAuto=true}render();return}
  if(!e.target.closest('.ac'))document.querySelectorAll('.aclist').forEach(x=>x.hidden=true);
  const b=e.target.closest('[data-act]');if(b&&!b.disabled&&ACT[b.dataset.act])ACT[b.dataset.act](b,e)});
document.addEventListener('change',e=>{if(e.target.id==='customColor'){draft.days[route.p.i].color=e.target.value;render()}});
document.addEventListener('input',e=>{
  if(e.target.id==='dim'){const v=+e.target.value;$('#dimv').textContent=v+'%';setBg({dim:v/100});return}
  if(e.target.id==='aiText'){$('#injHint').innerHTML=injHint(e.target.value);return}
  const k=e.target.dataset.bind;if(!k)return;const v=e.target.value,parts=k.split('.');
  if(parts[0]==='name')draft.name=v;
  else if(parts[0]==='notes')draft.notes=v;
  else if(parts[0]==='day')draft.days[route.p.i].name=v;
  else if(parts[0]==='ex'){const ex=draft.days[route.p.i].exercises[+parts[1]],f=parts[2];ex[f]=['sets','repMin','repMax','rest'].includes(f)?(v===''?'':+v):f==='weight'?(v===''?'':+v):v;if(f==='rest')delete ex.restAuto; // user typed it: never auto-replace
    if(f==='name')showAC(+parts[1],v)}
  else if(parts[0]==='set'){const s=db().active.exercises[+parts[1]].sets[+parts[2]];s[parts[3]]=v===''?'':+v;if(parts[3]==='w'){s.ws='m';e.target.classList.remove('sugw');if(v!=='')cascadeW(+parts[1],+parts[2])}Store.save()}
});
// Set weight state ws: 's' suggested (gray), 'c' copied from an edit (white, can be overwritten), 'm' set by the user (white, protected).
// Copy a set's weight to all LATER sets of the same exercise that aren't marked done or set by the user (Settings toggle, default on).
function cascadeW(j,k){if(db().settings.copyWeight===false)return;const ex=db().active.exercises[j],w=ex.sets[k].w;
  for(let i=k+1;i<ex.sets.length;i++){const t=ex.sets[i];if(t.done||t.ws==='m')continue;t.w=w;t.ws='c';const inp=document.querySelector(`[data-bind="set.${j}.${i}.w"]`);if(inp){inp.value=w;inp.classList.remove('sugw')}}}
function showAC(j,q){const box=$('#ac'+j);q=q.trim().toLowerCase();
  if(!q){box.hidden=true;return}
  const words=q.split(/\s+/);
  const m=LIBRARY.filter(x=>{const s=(x.name+' '+x.muscle+' '+x.equip).toLowerCase();return words.every(w=>s.includes(w))}).slice(0,8);
  if(!m.length||(m.length===1&&m[0].name.toLowerCase()===q)){box.hidden=true;return}
  box.innerHTML=m.map(x=>`<div data-pick="${j}" data-name="${esc(x.name)}">${esc(x.name)} <small>· ${esc(x.muscle)} · ${esc(x.equip)}</small></div>`).join('');box.hidden=false}

function showOldResult(r,manual){
  if(r.workouts||r.plan)info(t('old.title'),t(r.plan?'old.msgPlan':'old.msg',{w:t('n.workout',{n:r.workouts}),s:t('n.set',{n:r.sets})}));
  else if(manual)info(t('set.old'),r.found?t('old.already'):t('old.none'));
  render()}
/* ---------- language ---------- */
function langCard(){const m=I18N.mode(),cur=I18N.lang();
  const chip=(v,label,on,lang)=>`<button class="chip ${on?'on':''}" data-act="setLang" data-v="${v}" aria-pressed="${on}"${lang?` lang="${lang}"`:''}>${esc(label)}</button>`;
  return `<div class="card" id="langCard"><h3>🌐 ${t('lang.title')}</h3><div class="chips">${chip('auto',m==='auto'?t('lang.autoNow',{name:I18N.name(cur)}):t('lang.auto'),m==='auto')}
    ${I18N.LANGS.map(([c,n])=>chip(c,n,m===c,c)).join('')}</div><div class="mut mt2">${t('lang.hint')}</div></div>`}
// static text that lives in index.html (tab bar, back button)
function applyStatic(){const k={home:'today',plans:'plans',history:'history',settings:'settings'};
  document.querySelectorAll('#tabs button[data-tab]').forEach(b=>{const s=b.querySelector('span');if(s&&k[b.dataset.tab])s.textContent=t('tab.'+k[b.dataset.tab])});
  const bk=$('#back');if(bk)bk.setAttribute('aria-label',t('back'));const nv=$('#tabs');if(nv)nv.setAttribute('aria-label',t('nav.main'))}
ACT.setLang=b=>{I18N.choose(b.dataset.v).then(()=>{applyStatic();render()})};
applyBg();
if(db().active)route={v:'home',p:{}};
I18N.start(()=>{applyStatic();render()},name=>toast(t('lang.set',{name}))).then(()=>{
  applyStatic();
  if(!db().oldImportChecked&&oldHasData())importOldApp().then(r=>showOldResult(r,false));
  render();
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
