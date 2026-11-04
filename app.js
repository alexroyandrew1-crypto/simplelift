'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const db=()=>Store.db;
const U=()=>db().settings.units;
const step=lower=>U()==='kg'?(lower?5:2.5):(lower?10:5);
const fmtDate=t=>new Date(t).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
const isLower=n=>!!libFind(n)?.lower;
const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;

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
      if(a.run){const lbl=b.textContent;b.disabled=true;b.textContent='Working…';const r=await a.run(o);if(r!==true){o.querySelector('.sheet-err').textContent=r||'Something went wrong.';b.disabled=false;b.textContent=lbl;return}}
      done(a.v)});
    document.body.appendChild(o);(o.querySelector('input')||o.querySelector('[data-sv]')).focus()})}
const ask=(title,msg,ok,okCls='acc',cancel='Cancel')=>sheet({title,msg,actions:[{v:1,label:ok,cls:okCls},{v:0,label:cancel}]}).then(v=>v===1);
const info=(title,msg)=>sheet({title,msg,actions:[{v:1,label:'OK',cls:'acc'}]});

/* ---------- routing ---------- */
let route={v:'home',p:{}},stack=[],draft=null,draftSnap='',ai=null,timer=null;
const snap=p=>JSON.stringify(p,(k,v)=>k[0]==='_'?undefined:v);
function openDraft(p){draft=p;draftSnap=snap(p)}
const draftDirty=()=>!!draft&&(!!draft._new||snap(draft)!==draftSnap);
async function guard(){if(!draftDirty())return true;
  const ok=await ask('Discard changes?',draft._new&&route.v==='editor'?"This new plan isn't saved yet. Leave without saving it?":'You have unsaved changes. Leave without saving them?','Discard changes','bad','Keep editing');
  if(ok)draftSnap=snap(draft);return ok}
function go(v,p={},push=true){if(push)stack.push(route);route={v,p};render();scrollTo(0,0)}
function pop(){route=stack.pop()||{v:'home',p:{}};render();scrollTo(0,0)}
async function back(){if((route.v==='editor'||(route.v==='day'&&route.p.direct))&&!await guard())return;pop()}
async function tab(v){if((route.v==='editor'||route.v==='day')&&!await guard())return;stack=[];route={v,p:{}};render();scrollTo(0,0)}
$('#back').onclick=back;
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>tab(b.dataset.tab));

const TITLES={home:'Today',plans:'Plans',day:'Edit day',ai:'New plan',paste:'Copy a plan',watch:'Watch',account:'Account',pair:'Pair watch',chooser:'New plan',session:'Workout',history:'History',hist:'Workout',settings:'Settings'};
const ROOT={home:'home',session:'home',plans:'plans',editor:'plans',day:'plans',chooser:'plans',ai:'plans',paste:'plans',history:'history',hist:'history',settings:'settings',account:'settings',pair:'settings',watch:'settings'};
function render(){
  let v=route.v;if(!VIEWS[v]){v=route.v=v==='progress'?'history':'home'}
  $('#title').textContent=v==='editor'?(draft&&draft._new?'New plan':'Edit plan'):v==='day'&&route.p.direct?'Edit day':TITLES[v]||'Simple Lift';
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
const restTxt=s=>s>=60?`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`:`${s}s`;
const AI_TAG='<span class="tag ai">✨ AI</span>';
const isPaidLocked=w=>['paid','signin','verify'].includes(w);

/* ---------- views ---------- */
const VIEWS={
chooser(){return `<div class="mut">How do you want to make your new plan? Your current plans stay saved.</div>`+createOpts()},
home(){
  const a=db().active,plan=Store.activePlan();let h=backupNag();
  if(a)h+=`<button class="big acc" data-act="resume">Resume workout<small>${esc(a.dayName)} · in progress</small></button>`;
  if(plan)return h+todayHTML(plan);
  if(db().plans.length)return h+`<div class="card empty"><h2>Pick a plan</h2><div class="mut">Choose which plan to follow in Plans.</div><button class="btn acc full" data-act="goPlans">Go to Plans</button></div>`;
  return h+`<div class="card empty"><div class="empty-ico" aria-hidden="true">🏋️</div><h2>No plan yet</h2><div class="mut">Make a plan once. Then each training day shows up here with a Start button.</div>
    <button class="btn acc full" data-act="chooser">+ New plan</button></div>`;
},
plans(){
  const ps=db().plans;
  return `<button class="btn acc full" data-act="chooser">+ New plan</button>`+(ps.length?ps.map(p=>{const tr=p.days.filter(d=>!d.rest).length,rs=p.days.length-tr;
    return `<div class="card"><div class="between"><div class="grow"><h3>${esc(p.name)}</h3><div class="mut">${plural(tr,'training day')}${rs?` · ${plural(rs,'rest day')}`:''}</div></div>
    ${p.id===db().activePlanId?'<span class="tag">Active</span>':`<button class="btn sm" data-act="activate" data-id="${p.id}">Use this plan</button>`}</div>
    <div class="row mt3"><button class="btn grow" data-act="edit" data-id="${p.id}">Edit</button><button class="btn" data-act="dup" data-id="${p.id}">Copy</button><button class="btn bad" data-act="delPlan" data-id="${p.id}">Delete</button></div></div>`}).join('')
    :`<div class="card empty"><div class="empty-ico" aria-hidden="true">📋</div><h3>No plans yet</h3><div class="mut">Tap "+ New plan" to answer a few questions, build your own, or copy one from text or a picture.</div></div>`);
},
editor(){
  const p=draft;
  const I=p._issues;const iss=I?`<div class="card issues ${I.unparsed.length?'warn':'good'}"><b>${plural(I.count,'exercise')} found in ${plural(I.days,'day')}.</b> Check them below, fix anything, then save.
    ${I.unparsed.length?`<div class="warn-txt mt2">I couldn't understand ${plural(I.unparsed.length,'line')}:</div><ul class="mut list">${I.unparsed.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="mut">Add those yourself with "+ Add exercise" if you need them.</div>`:''}
    ${I.skipped.length?`<div class="mut mt2">Skipped ${plural(I.skipped.length,'warm-up, cool-down or tips line')}.</div>`:''}</div>`:'';
  const CR=p._cr;const req=`<details class="card"${CR?' open':''}><summary><b>Request changes</b> <span class="mut">· optional</span></summary><div class="mut mt2">Tell me what to change in plain words, e.g. "swap squats for leg press, add abs, make it shorter, add hammer curls to day 2". Or edit anything by hand above.</div>
    <label for="crText">Changes</label><textarea id="crText" rows="3" placeholder="e.g. replace bench press with dumbbell press, more chest, no calf raises"></textarea><button class="btn acc full" data-act="applyCR">Apply changes</button>
    ${CR?`<div class="mt3">${CR.changes.length?`<b>What changed:</b><ul class="list">${CR.changes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<b>Nothing was changed.</b>'}
    ${CR.notUnderstood.length?`<div class="warn-txt">I couldn't understand or do:</div><ul class="mut list">${CR.notUnderstood.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="mut">Try "swap X for Y", "remove X", "add X to day 2", "more chest", "make it shorter".</div>`:''}</div>`:''}</details>`;
  const A=p._ai;const aiN=A&&(A.ai||A.note)?`<div class="mut ainote">${A.ai?`${AI_TAG} Made with AI (Grok)${A.remaining!=null?` · ${A.remaining} AI plan${A.remaining===1?'':'s'} left today`:''}`:`ⓘ ${esc(A.note)}`}</div>`:'';
  return aiN+iss+`<label for="plName">Plan name</label><input id="plName" data-bind="name" value="${esc(p.name)}" placeholder="My plan">
  <label for="plNotes">Plan notes</label><textarea id="plNotes" data-bind="notes" rows="2" placeholder="Optional">${esc(p.notes||'')}</textarea>
  <h3 class="sec-sm">Days</h3><div class="mut">Tap a day to edit its exercises and colour. Use the arrows to reorder.</div>
  ${p.days.map((d,i)=>`<div class="card dayrow" style="--dc:${esc(dayColor(d))}"><div class="row"><button class="grow plain" data-act="openDay" data-i="${i}">
    <h3>${esc(d.name)} ${d.rest?'<span class="tag">Rest</span>':''}</h3>
    <span class="mut">${d.rest?'Recovery day':d.exercises.length?esc(d.exercises.map(e=>e.name).join(', ')):'No exercises yet'}</span></button>
    <div class="col"><button class="icon-btn sm" data-act="dayUp" data-i="${i}" aria-label="Move ${esc(d.name)} up">▲</button><button class="icon-btn sm" data-act="dayDown" data-i="${i}" aria-label="Move ${esc(d.name)} down">▼</button></div></div></div>`).join('')}
  <div class="grid2"><button class="btn" data-act="addDay">+ Training day</button><button class="btn" data-act="addRest">+ Rest day</button></div>
  ${req}${foot('<button class="btn acc" data-act="savePlan">Save plan</button>')}`;
},
day({i,direct}){
  const d=draft.days[i];if(!d)return'';
  return `<label for="dName">Day name</label><input id="dName" data-bind="day.name" value="${esc(d.name)}">
  <div class="between mt3"><span>Rest day</span><button class="chip ${d.rest?'on':''}" data-act="toggleRest" aria-pressed="${!!d.rest}">${d.rest?'Yes':'No'}</button></div>
  ${d.rest?'':d.exercises.map((e,j)=>`<div class="ex">
    <div class="ac"><label for="exn${j}">Exercise</label><input id="exn${j}" data-bind="ex.${j}.name" data-ac="${j}" value="${esc(e.name)}" placeholder="Start typing… e.g. Bench" autocomplete="off"><div class="aclist" id="ac${j}" hidden></div></div>
    <div class="grid3"><div><label for="exs${j}">Sets</label><input id="exs${j}" type="number" inputmode="numeric" min="1" data-bind="ex.${j}.sets" value="${esc(e.sets)}"></div>
    <div><label for="exa${j}">Reps min</label><input id="exa${j}" type="number" inputmode="numeric" data-bind="ex.${j}.repMin" value="${esc(e.repMin)}"></div>
    <div><label for="exb${j}">Reps max</label><input id="exb${j}" type="number" inputmode="numeric" data-bind="ex.${j}.repMax" value="${esc(e.repMax)}"></div></div>
    <div class="grid2"><div><label for="exw${j}">Start weight (${U()}) · optional</label><input id="exw${j}" type="number" inputmode="decimal" data-bind="ex.${j}.weight" value="${esc(e.weight)}"></div>
    <div><label for="exr${j}">Rest (seconds)</label><input id="exr${j}" type="number" inputmode="numeric" data-bind="ex.${j}.rest" value="${esc(e.rest)}" placeholder="${restFor(e.name)}"></div></div>
    <label for="exo${j}">Note</label><input id="exo${j}" data-bind="ex.${j}.note" value="${esc(e.note)}" placeholder="Optional">
    <div class="row mt3"><button class="btn sm" data-act="exUp" data-j="${j}" aria-label="Move exercise up">▲</button><button class="btn sm" data-act="exDown" data-j="${j}" aria-label="Move exercise down">▼</button><span class="grow"></span><button class="btn sm bad" data-act="exDel" data-j="${j}">Remove</button></div></div>`).join('')}
  ${d.rest?'':'<button class="btn full" data-act="exAdd">+ Add exercise</button>'}
  <div class="card"><h3>Day colour</h3><div class="chips">${COLORS.map(c=>`<button class="swatch ${dayColor(d)===c?'on':''}" style="background:${c}" data-act="setColor" data-c="${c}" aria-label="Colour ${c}" aria-pressed="${dayColor(d)===c}"></button>`).join('')}
    <label class="swatch custom" title="Custom colour" style="background:${esc(dayColor(d))}"><input type="color" id="customColor" value="${esc(dayColor(d))}" aria-label="Custom colour"></label></div>
    <button class="btn full" data-act="colorAll">Use this colour for all days</button></div>
  <div class="grid2 mt3"><button class="btn" data-act="dayDup">Duplicate day</button><button class="btn bad" data-act="dayDel">Delete day</button></div>
  ${foot(direct?`<button class="btn" data-act="back">Cancel</button>`:'',`<button class="btn acc" data-act="${direct?'saveDay':'back'}">${direct?'Save day':'Done'}</button>`)}`;
},
ai(){
  const S=AI_STEPS,N=S.length+1,n=ai.step+1;
  const head=`<div class="between"><span class="wiz-step">Step ${n} of ${N}</span>${n<N?`<span class="mut">${n===6||n===7?'Optional':''}</span>`:''}</div><div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="${N}" aria-valuenow="${n}"><i style="width:${n/N*100}%"></i></div>`;
  if(ai.step>=S.length){const busy=ai.busy,locked=isPaidLocked(aiPrecheck());
    const aiB=locked?`<button class="big ghost locked" data-act="aiBuild">🔒 ✨ Build with AI<small>Paid extra · tap to learn more</small></button>`
      :`<button class="big acc" data-act="aiBuild">✨ Build with AI<small>Tailored to your answers, with sets, reps and rest times</small></button>`;
    const qB=`<button class="big ${locked?'acc':'ghost'}" data-act="aiQuick">⚡ Quick build (free)<small>Instant, built into the app</small></button>`;
    return head+`<h2>Ready when you are</h2><div class="card recap"><div class="mut">Your plan</div><b>${esc(aiGoalLine(ai.a))}</b><div class="mut mt1">${esc(aiSummary(ai.a))}</div></div>
    ${busy?`<div class="card center busy"><div class="spin"></div><b>Building your plan…</b><div class="mut mt1">This usually takes 5–20 seconds.</div><button class="btn full" data-act="aiCancel">Cancel</button></div>`
    :`${ai.msg?`<div class="card note">${esc(ai.msg)}</div>`:''}${locked?qB+aiB:aiB+qB}${foot('<button class="btn" data-act="aiPrev">Back</button>')}`}`}
  const s=S[ai.step],val=ai.a[s.key],on=v=>s.multi?(val||[]).includes(v):val==v;
  return head+`<h2>${esc(s.q)}</h2>${s.hint?`<div class="mut">${esc(s.hint)}</div>`:''}
  ${s.text?`<label for="aiText" class="sr">${esc(s.q)}</label><textarea id="aiText" class="mt3" rows="4" placeholder="e.g. bad right shoulder, lower back pain">${esc(val||'')}</textarea><div id="injHint" class="mut mt2" aria-live="polite">${injHint(val)}</div>`:''}
  <div class="opts${s.grid?' g2':''}">${s.opts.map(([v,l,d])=>`<button class="big opt ${on(v)?'on':''}" data-act="aiPick" data-v="${esc(v)}" aria-pressed="${on(v)}">${esc(l)}${d?`<small>${esc(d)}</small>`:''}</button>`).join('')}</div>
  ${foot(`<button class="btn" data-act="aiPrev">${ai.step?'Back':'Cancel'}</button>`,`<button class="btn acc" data-act="aiNext">Next</button>`)}`;
},
account(){const m=route.p.mode||'in',up=m==='up',a=Sync.a,em=esc(route.p.email||a.email||'');
  const note=`<div class="mut mt2" id="acNote" role="alert">${esc(route.p.note||'')}</div>`;
  const codeIn=`<label for="acCode">6-digit code</label><input id="acCode" class="codein" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456">`;
  if(m==='verify')return `<div class="card"><h3>Check your email</h3><div>Enter the 6-digit code we emailed you.</div><div class="mut">Sent to ${esc(a.email||'')}. It expires in 15 minutes. Check your spam folder too.</div>${codeIn}
  <button class="btn acc full" data-act="acVerify">Verify</button>
  <div class="row mt2"><button class="btn" data-act="acResend">Resend code</button><button class="btn" data-act="acOut">Sign out</button></div>${note}</div>
  <div class="mut">Until you verify, your account can't sync or pair a watch. Everything still works on this phone.</div>`;
  if(m==='forgot')return `<div class="card"><h3>Forgot password</h3><div class="mut">Enter your account email. We'll email you a 6-digit code to set a new password.</div>
  <label for="acEmail">Email</label><input id="acEmail" type="email" autocomplete="email" placeholder="you@example.com" value="${em}">
  <button class="btn acc full" data-act="acForgot">Send code</button>
  <button class="btn full" data-act="account" data-mode="in">Back to sign in</button>${note}</div>`;
  if(m==='reset')return `<div class="card"><h3>Set a new password</h3><div class="mut">If ${em||'that email'} has an account, we emailed it a 6-digit code. It expires in 15 minutes.</div>${codeIn}
  <label for="acPw">New password (8+ characters)</label><input id="acPw" type="password" autocomplete="new-password">
  <button class="btn acc full" data-act="acReset" data-email="${em}">Save new password</button>
  <div class="row mt2"><button class="btn" data-act="acForgot" data-email="${em}">Resend code</button><button class="btn" data-act="account" data-mode="in">Back to sign in</button></div>${note}</div>
  <div class="mut">Saving a new password signs out your other devices and your watch. Pair the watch again afterwards.</div>`;
  return `<div class="card"><h3>${up?'Create an account':'Sign in'}</h3>
  <label for="acEmail">Email</label><input id="acEmail" type="email" autocomplete="email" placeholder="you@example.com" value="${em}">
  <label for="acPw">Password${up?' (8+ characters)':''}</label><input id="acPw" type="password" autocomplete="${up?'new-password':'current-password'}">
  <button class="btn acc full" data-act="acSubmit" data-mode="${up?'up':'in'}">${up?'Create account':'Sign in'}</button>
  ${up?'':'<div class="right"><button type="button" class="linkbtn" data-act="acForgotGo">Forgot password?</button></div>'}
  <button class="btn full" data-act="account" data-mode="${up?'in':'up'}">${up?'I already have an account':'Create a new account instead'}</button>${note}</div>
  <div class="mut"><b>What's stored online:</b> your email, a salted password hash, and your Simple Lift data (plans, history, settings). No ads, no trackers, and nothing is shared or sold. If you use the AI features, the answers, text or photos you submit are sent to xAI (Grok API) to make your plan; Simple Lift doesn't store them. You can delete your account any time in Settings → Account &amp; sync.${up?' We email you a 6-digit code to confirm your address. Your email is only used for that and for password resets.':''}</div>`},
pair(){return `<div class="card center"><h3>⌚ Pair your watch</h3><div id="pairCode" class="pair-code">······</div><div class="mut" id="pairNote" aria-live="polite">Getting a code…</div></div>
  <div class="card"><ol class="mut steps"><li>On your phone, open Garmin Connect (or the Connect IQ app): your watch → Activities &amp; Apps → Simple Lift → Settings.</li><li>Enter this code in <b>Pairing code</b> and save.</li><li>Open Simple Lift on the watch while your phone is nearby. It pairs, then downloads your next workout every time it opens and sends your sets back when you finish.</li></ol>
  <div class="mut mt2">The code works once and expires in 10 minutes. The manual code in Settings → Watch still works as a backup.</div></div>`},
watch(){const plan=Store.plan(route.p.planId)||Store.activePlan();if(!plan)return '<div class="card mut">Make a plan first, then you can send a day to your watch.</div>';
  const i=Math.min(route.p.i|0,plan.days.length-1),c=watchCode(plan,i);
  db().watch={planId:plan.id,dayIndex:i,title:c.title,at:Date.now()};Store.save();
  const auto=Sync.on()?'Your watch is set to sync automatically through your account once paired, so you usually don\'t need this.':'Sign in under Settings → Account &amp; sync and pair your watch to have it sync automatically.';
  return `<div class="card"><h3>⌚ Send "${esc(plan.days[i].name)}" to your watch</h3>
  <label for="watchCode" class="sr">Workout code</label><textarea id="watchCode" class="code" rows="4" readonly>${esc(c.code)}</textarea>
  <button class="btn acc full" data-act="watchCopy">📋 Copy code</button>
  <ol class="mut steps mt2"><li>Copy the code.</li><li>On your phone, open Garmin Connect (or the Connect IQ app): your watch → Activities &amp; Apps → Simple Lift → Settings → <b>Workout code</b>, paste it, and save.</li><li>The watch picks it up on its next sync. Open Simple Lift on the watch.</li></ol>
  <div class="mut mt2">Weights are in lb${U()==='kg'?' (converted from kg)':''}${db().active?'. Includes the weights from your workout in progress':''}.</div></div>
  <div class="card"><h3>↩ Import from watch</h3><div class="mut">When you finish on the watch it shows a result code starting with <b>SR1~</b> (also in the app's settings as "Last result"). Type or paste it here to bring the ticked sets and weights back.</div>
  <label for="watchRes" class="sr">Result code</label><textarea id="watchRes" class="code mt2" rows="3" placeholder="SR1~Push~4@95/95/105/105~3@65"></textarea>
  <button class="btn full" data-act="watchImport">Import result</button></div>
  <div class="mut"><b>Manual codes are the backup.</b> ${auto}</div>`},
paste(){
  const w=aiPrecheck();const note=w===''?`<div class="mut ainote">${AI_TAG} Pictures and pasted text are read with AI (Grok).</div>`:isPaidLocked(w)?`<div class="mut ainote">✨ Paid accounts can use AI to read pictures and text.</div>`:'';
  return `<div class="mut">Copy a plan from a picture or from text. You'll see a preview before anything is saved.</div>
  <div class="grid2 mt3"><button class="btn" data-act="pickPic">🖼 Choose a picture</button><button class="btn" data-act="takePic">📷 Take a photo</button></div>
  <input type="file" id="picFile" accept="image/*" hidden><input type="file" id="camFile" accept="image/*" capture="environment" hidden>
  ${note}
  <div id="ocrBox" class="card" hidden aria-live="polite"><div class="between"><b id="ocrMsg">Reading text…</b><span id="ocrPct" class="mut"></span></div><div class="progress"><i id="ocrBar" style="width:0"></i></div><div class="mut" id="ocrSub">Reading happens on your phone. Nothing is uploaded.</div><button class="btn full" id="ocrCancel" data-act="ocrCancel" hidden>Cancel</button></div>
  <label for="pasteText">Plan text</label>
  <textarea id="pasteText" rows="14" placeholder="Day 1 - Push&#10;Bench press 4x8-10&#10;Overhead press 3 sets of 8-12, rest 90s&#10;&#10;Day 2 - Rest&#10;&#10;Day 3 - Legs&#10;Squats 3x8-12">${esc(route.p.text||'')}</textarea>
  <div class="mut mt2">Tip: headings like "Day 1 - Push" and lines like "Bench press 4x8-10" work best. After reading a picture, check the text.</div>
  ${foot(`<button class="btn acc" data-act="parse">${w===''?'✨ Make my plan with AI':'Make my plan'}</button>`)}`;
},
session(){
  const a=db().active;if(!a)return'<div class="card">No workout in progress.</div>';
  const done=a.exercises.reduce((s,e)=>s+e.sets.filter(x=>x.done).length,0),tot=a.exercises.reduce((s,e)=>s+e.sets.length,0);
  return `<div class="between"><h2 class="m0">${esc(a.dayName)}</h2><span class="mut">${done}/${tot} sets</span></div>
  <div class="progress"><i style="width:${tot?done/tot*100:0}%"></i></div>
  ${a.exercises.map((e,j)=>`<div class="card"><div class="between"><h3>${esc(e.name)}</h3><span class="mut">${repTxt(e)} reps · rest ${restTxt(e.rest)}</span></div>
    ${e.note?`<div class="mut">${esc(e.note)}</div>`:''}${e.last?`<div class="mut">Last: ${esc(e.last)}</div>`:''}${e.sugg?`<div class="sugg">↑ ${esc(e.sugg)}</div>`:''}
    <div class="set set-head" aria-hidden="true"><span>Set</span><span>${U()}</span><span>Reps</span><span>Done</span></div>
    ${e.sets.map((s,k)=>{const L=`${esc(e.name)} set ${k+1}`;return `<div class="set"><span class="mut">${k+1}</span>
      <div class="step"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="w" data-d="-1" aria-label="Less weight, ${L}">−</button><input type="number" inputmode="decimal" data-bind="set.${j}.${k}.w" class="${s.ws==='s'?'sugw':''}" value="${esc(s.w)}" aria-label="${L} weight in ${U()}"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="w" data-d="1" aria-label="More weight, ${L}">+</button></div>
      <div class="step"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="r" data-d="-1" aria-label="Fewer reps, ${L}">−</button><input type="number" inputmode="numeric" data-bind="set.${j}.${k}.r" value="${esc(s.r)}" aria-label="${L} reps"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="r" data-d="1" aria-label="More reps, ${L}">+</button></div>
      <button class="done ${s.done?'on':''}" data-act="setDone" data-j="${j}" data-k="${k}" aria-label="${L} done" aria-pressed="${!!s.done}">✓</button></div>`}).join('')}
    <div class="row"><button class="btn sm" data-act="setAdd" data-j="${j}">+ Set</button>${e.sets.length>1?`<button class="btn sm" data-act="setDel" data-j="${j}">− Set</button>`:''}</div></div>`).join('')}
  <div class="sessfoot"><button class="btn" data-act="sessMenu" aria-label="More workout options">⋯</button><button class="btn acc grow" data-act="finish">Finish workout</button></div>`;
},
history({off=0}){
  const h=db().history.slice().sort((a,b)=>b.date-a.date);
  if(!h.length)return`<div class="card empty"><div class="empty-ico" aria-hidden="true">📈</div><h3>No workouts yet</h3><div class="mut">Finish your first workout from Today. It shows up here, along with your weekly sets, volume and best lifts.</div>
    ${Store.activePlan()?'<button class="btn acc full" data-act="goToday">Go to Today</button>':''}</div>`;
  return progressHTML(off)+`<h2 class="sec">Workouts</h2>`+h.map(w=>`<button class="card plain hrow" data-act="openHist" data-id="${w.id}"><div class="between"><div><div class="mut">${fmtDate(w.date)}</div><h3>${esc(w.dayName)}</h3></div><span aria-hidden="true">›</span></div>
    <div class="mut">${plural(w.exercises.length,'exercise')} · ${plural(sets(w),'set')} · ${Math.round(vol(w)).toLocaleString()} ${esc(w.units)} volume${w.minutes?` · ${w.minutes} min`:''}</div></button>`).join('');
},
hist({id}){
  const w=db().history.find(x=>x.id===id);if(!w)return'<div class="card">Not found.</div>';
  return `<div class="mut">${fmtDate(w.date)} · ${esc(w.planName||'')}</div><h2>${esc(w.dayName)}</h2>
  ${w.exercises.map(e=>`<div class="card"><h3>${esc(e.name)}</h3>${e.sets.map((s,k)=>`<div class="between"><span class="mut">Set ${k+1}</span><span>${esc(s.w||0)} ${esc(w.units)} × ${esc(s.r)}</span></div>`).join('')||'<div class="mut">No sets logged</div>'}</div>`).join('')}
  <button class="btn bad full" data-act="delHist" data-id="${w.id}">Delete this workout</button>`;
},
settings(){
  const bs=bgSettings(),on=Sync.on(),img=localStorage.getItem(BG_KEY),plan=Store.activePlan();
  const S=(id,t,b)=>`<section aria-labelledby="sec-${id}"><h2 class="sec" id="sec-${id}">${t}</h2>${b}</section>`;
  const acct=accountCard()||'<div class="card mut">Accounts are turned off in this version. Everything stays on this phone.</div>';
  const work=`<div class="card"><h3>Units</h3><div class="chips"><button class="chip ${U()==='lb'?'on':''}" data-act="units" data-v="lb" aria-pressed="${U()==='lb'}">lb</button><button class="chip ${U()==='kg'?'on':''}" data-act="units" data-v="kg" aria-pressed="${U()==='kg'}">kg</button></div>
    <div class="mut mt2">Changes labels and progression steps. Saved numbers are not converted.</div></div>
    <div class="card"><div class="between"><div><h3>Copy weight to later sets</h3><div class="mut">Changing a set's weight also fills in the sets after it that aren't done yet.</div></div><button class="chip ${db().settings.copyWeight!==false?'on':''}" data-act="copyW" aria-pressed="${db().settings.copyWeight!==false}">${db().settings.copyWeight!==false?'On':'Off'}</button></div></div>`;
  const look=`<div class="card"><h3>Background</h3><div class="mut">Pick one of ours or use a photo from your phone.</div>
   <div class="bggrid"><button class="bgopt ${bs.kind==='none'?'on':''}" data-act="bgNone" aria-pressed="${bs.kind==='none'}">None</button>
   ${Object.entries(BGS).map(([k,v])=>`<button class="bgopt ${bs.kind==='preset'&&bs.id===k?'on':''}" style="background:${v}" data-act="bgPreset" data-id="${k}" aria-label="${k} background" aria-pressed="${bs.kind==='preset'&&bs.id===k}"><span>${k}</span></button>`).join('')}
   <button class="bgopt ${bs.kind==='custom'?'on':''}" data-act="bgPhoto" ${img?`style="background:center/cover url('${img}')"`:''}><span>📷 Photo</span></button></div>
   <input type="file" id="bgFile" accept="image/*" hidden>
   <label for="dim">Dim background: <b id="dimv">${Math.round(bs.dim*100)}%</b></label><input type="range" id="dim" class="range" min="0" max="85" value="${Math.round(bs.dim*100)}"></div>`;
  const data=`<div class="card"><h3>Your data</h3><div class="mut">${on?`Saved on this phone and synced to your account (${esc(Sync.a.email||'')}). A backup file is still a good extra copy.`:'Everything is stored on this phone only. Export a backup to keep a copy or move to another phone.'}</div>
    <button class="btn full" data-act="export">Export backup (JSON)</button><button class="btn full" data-act="import">Restore from backup…</button><input type="file" id="file" accept="application/json,.json" hidden>
    <details class="more"><summary>Import from old app</summary><div class="mut mt2">One-time import of history from the earlier Simple Lift workout page. Works only on the same phone and browser where you used it. The old data is never changed.</div>
    <button class="btn full" data-act="importOld">Import from old app</button></details>
    <button class="btn bad full" data-act="reset">Reset all data…</button></div>`;
  const watch=`<div class="card"><h3>Garmin watch</h3><div class="mut">${on?'Pair once and the watch downloads your next workout and sends your sets back on its own.':'Sign in above to pair your watch and sync it automatically. Without an account you can still use a manual code.'}</div>
    ${on?'<button class="btn acc full" data-act="pair">⌚ Pair watch</button>':''}
    ${plan?`<button class="btn full" data-act="watch" data-i="${Math.max(0,nextDayIndex(plan))}">Manual code (send or import)</button>`:'<div class="mut mt2">Make a plan first to send a day to your watch.</div>'}</div>`;
  const about=`<div class="card"><h3>Simple Lift v${esc(APP_VERSION)}</h3><div class="mut">Free. No ads, no tracking, no account needed. Works offline. Add it to your home screen from your browser menu.</div>
    <div class="mut mt3">I made Simple Lift to be completely free, and I'm trying to keep it free forever. If you ever want to chip in, it's optional and appreciated, never expected.</div>
    <div class="row wrap mt2">${/^https:\/\//.test(DONATE_URL)?`<a class="btn sm" href="${esc(DONATE_URL)}" target="_blank" rel="noopener noreferrer">Donate via PayPal (optional)</a>`:''}
    ${/^[^@\s]+@[^@\s]+$/.test(SUPPORT_EMAIL)?`<a class="btn sm" href="mailto:${esc(SUPPORT_EMAIL)}?subject=Simple%20Lift%20support">Email support</a>`:''}
    ${typeof API_URL==='string'&&API_URL?`<a class="btn sm" href="${esc(API_URL.replace(/\/+$/,''))}/privacy" target="_blank" rel="noopener noreferrer">Privacy policy</a>`:''}</div>
    ${/^[^@\s]+@[^@\s]+$/.test(SUPPORT_EMAIL)?`<div class="mut mt2">Bugs and questions: ${esc(SUPPORT_EMAIL)}</div>`:''}</div>`;
  return S('acct','Account &amp; sync',acct)+S('work','Workout',work)+S('look','Look',look)+S('data','Data',data)+S('watch','Watch',watch)+S('about','About &amp; support',about);
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
function loadBgFile(file){return new Promise((res,rej)=>{if(!file||!/^image\//.test(file.type))return rej(new Error("That file isn't a picture."));
  if(file.size>25e6)return rej(new Error('That picture is too big (over 25 MB). Pick a smaller one.'));
  const img=new Image();img.onload=()=>{const sc=Math.min(1,1080/img.width);const c=document.createElement('canvas');c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);let q=.8,u=c.toDataURL('image/jpeg',q);while(u.length>1.4e6&&q>.35){q-=.15;u=c.toDataURL('image/jpeg',q)}
    URL.revokeObjectURL(img.src);if(u.length>1.8e6)return rej(new Error('That picture is still too big after shrinking it. Try another one.'));res(u)};
  img.onerror=()=>rej(new Error("Couldn't read that picture."));img.src=URL.createObjectURL(file)})}
const COLORS=['#4ade80','#60a5fa','#f472b6','#facc15','#fb923c','#a78bfa','#2dd4bf','#f87171'];
const AI_STEPS=[
 {key:'goal',q:'What is your main goal?',opts:[['muscle','Build muscle','Size and shape'],['strength','Get stronger','Lift heavier'],['general','General fitness','Feel good, stay healthy'],['fatloss','Lose fat','Keep muscle, burn more']]},
 {key:'experience',q:'How long have you been lifting?',opts:[['beginner','Beginner','Under 1 year'],['intermediate','Intermediate','1–3 years'],['advanced','Advanced','3+ years']]},
 {key:'days',q:'How many days a week can you train?',hint:'7 days includes a light active-recovery day.',opts:[[2,'2 days'],[3,'3 days'],[4,'4 days'],[5,'5 days'],[6,'6 days'],[7,'7 days']]},
 {key:'minutes',q:'How long is each session?',grid:1,opts:[[20,'20 min'],[30,'30 min'],[45,'45 min'],[60,'60 min'],[75,'75 min'],[90,'90 min'],[105,'105 min'],[120,'2 hours']]},
 {key:'equipment',q:'What equipment do you have?',opts:[['full','Full gym'],['machines','Machines & cables only'],['dumbbells','Dumbbells only'],['bodyweight','Bodyweight only']]},
 {key:'injuries',text:1,q:'Any injuries or areas to avoid?',hint:'List any injuries or areas to avoid, or leave blank. e.g. "sore left knee, herniated disc"',opts:[]},
 {key:'focus',multi:1,q:'Any muscles you want to focus on?',hint:'Optional. Pick up to 3.',opts:[['chest','Chest'],['back','Back'],['shoulders','Shoulders'],['biceps','Arms (biceps)'],['triceps','Arms (triceps)'],['quads','Legs (quads)'],['glutes','Glutes'],['core','Core']]}
];

function aiGoalLine(a){return[{muscle:'Build muscle',strength:'Get stronger',general:'General fitness',fatloss:'Lose fat'}[a.goal]||'General fitness',{beginner:'Beginner',intermediate:'Intermediate',advanced:'Advanced'}[a.experience]||'Beginner'].join(' · ')}
function aiSummary(a){const eq={full:'full gym',machines:'machines & cables',dumbbells:'dumbbells only',bodyweight:'bodyweight only'}[a.equipment]||'full gym';
  const w=parseInjuries(a.injuries).words,f=(a.focus||[]).filter(x=>x!=='none');
  return [`${+a.days||3} days a week`,`${+a.minutes||45} min`,eq,...(w.length?[w.slice(0,2).join('- and ')+'-friendly']:[]),...(f.length?[f.slice(0,2).join(' & ')+' focus']:[])].join(', ')}
function injHint(t){const r=parseInjuries(t);return t&&t.trim()?(r.words.length?`Understood: <b class="acc-txt">${r.words.map(esc).join(', ')}</b>. Exercises that load these areas will be left out.`:"I didn't recognize a body part. Try words like shoulder, back, knee, hip, elbow, wrist, neck or ankle."):''}
function dayColor(d){return d&&d.color||'#4ade80'}
function todayHTML(plan){
  let sel=route.p.sel;if(sel==null||!plan.days[sel]){sel=nextDayIndex(plan);if(sel<0)sel=0}
  const d=plan.days[sel],c=dayColor(d),nx=nextDayIndex(plan);
  const tabs=`<div class="daytabs" role="tablist" aria-label="Days in ${esc(plan.name)}">${plan.days.map((x,j)=>`<button class="daytab ${j===sel?'on':''}" role="tab" aria-selected="${j===sel}" style="--dc:${esc(dayColor(x))}" data-act="selDay" data-i="${j}">${esc(x.name)}${x.rest?' 💤':''}</button>`).join('')}</div>`;
  if(!d)return tabs;
  let body=`<div class="card daycard" style="--dc:${esc(c)}"><div class="between"><div class="grow"><div class="mut">Plan: ${esc(plan.name)}</div><h2 class="dayname">${esc(d.name)} ${sel===nx?'<span class="tag">Up next</span>':''}</h2></div>
    <button class="btn sm" data-act="editDay" data-i="${sel}">✎ Edit day</button></div>`;
  if(d.rest)body+=`<div class="center restbox"><div class="empty-ico" aria-hidden="true">💤</div><h3>Rest day</h3><div class="mut">Recover, stretch, go for a walk.</div></div></div>`;
  else if(!d.exercises.length)body+=`<div class="mut pad">No exercises yet. Tap "Edit day" to add some.</div></div>`;
  else body+=`<div class="mut">${plural(d.exercises.length,'exercise')} · ${plural(d.exercises.reduce((s,e)=>s+(+e.sets||0),0),'set')}</div>
    <div class="exlist">${d.exercises.map(e=>{const g=suggest(e);return `<div class="between lrow"><span>${esc(e.name)}<br><small class="mut">${esc(g.t)}</small></span><span class="right">${e.sets}×${repTxt(e)}<br><small class="dc-txt">${g.w?esc(g.w)+' '+U():''}</small></span></div>`}).join('')}</div>
    <button class="btn full dc-btn" data-act="start" data-i="${sel}">Start workout</button></div>`;
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
  const md=t=>new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'});
  const ch=(d,u)=>d>0?`<span class="up">+${d} ${u}</span>`:`<span class="down">${d} ${u}</span>`;
  return `<div class="between weeknav"><button class="btn" data-act="wk" data-o="${off+1}" aria-label="Previous week">‹</button><div class="center"><b>${off===0?'This week':off===1?'Last week':'Week of'}</b><div class="mut">${md(ws)} – ${md(end)}</div></div><button class="btn" data-act="wk" data-o="${off-1}" aria-label="Next week" ${off<=0?'disabled':''}>›</button></div>
  <div class="grid3 mt3">
   <div class="card stat-card"><div class="stat">${cur.length}<span class="stat-of">/${planned||'–'}</span></div><div class="mut">Workouts</div></div>
   <div class="card stat-card"><div class="stat">${S}</div><div class="mut">Sets</div></div>
   <div class="card stat-card"><div class="stat stat-sm">${Math.round(V).toLocaleString()}</div><div class="mut">Volume ${U()}${pct!==null?` <span class="${pct>=0?'up':'down'}">${pct>=0?'+':''}${pct}%</span>`:''}</div></div></div>
  <div class="card"><h3>Volume, last 8 weeks</h3><div class="bars" role="img" aria-label="Weekly volume for the last 8 weeks">${weeks.map((w,i)=>`<div class="${i===7?'cur':''}"><i style="height:${w.v/mx*100}%"></i>${new Date(w.t).toLocaleDateString(undefined,{month:'numeric',day:'numeric'})}</div>`).join('')}</div></div>
  <div class="card"><h3>Best sets ${off===0?'this week':'that week'}</h3>${Object.keys(bc).length?Object.entries(bc).map(([n,b])=>{const p=bp[n];let c='<span class="mut">new</span>';
    if(p){const d=b.w-p.w,dr=b.r-p.r;c=d?ch(d,U()):dr?ch(dr,'reps'):'<span class="mut">same</span>'}
    return `<div class="between lrow"><span>${esc(n)}</span><span>${b.w} × ${b.r} · ${c}</span></div>`}).join(''):`<div class="mut">No workouts logged ${off===0?'yet this week. Your best sets will show here.':'that week.'}</div>`}</div>`;
}
function accountCard(){if(typeof API_URL!=='string'||!API_URL)return '';const a=Sync.a;
  if(!a.token)return `<div class="card"><h3>Account</h3><div class="mut">Optional. Sign in to back up your plans and history online, use them on other devices, and sync your Garmin watch automatically. Without an account, everything stays on this phone and nothing is sent anywhere.</div>
  <div class="row mt2"><button class="btn acc" data-act="account" data-mode="up">Sign up</button><button class="btn" data-act="account" data-mode="in">Sign in</button></div></div>`;
  if(a.verified===false)return `<div class="card"><h3>Account</h3><div>${esc(a.email||'')}</div><div class="mut">⚠ Email not verified yet. Enter the 6-digit code we emailed you to turn on sync and watch pairing.</div>
  <div class="row wrap mt2"><button class="btn sm acc" data-act="account" data-mode="verify">Enter code</button><button class="btn sm" data-act="acOut">Sign out</button><button class="btn sm bad" data-act="delAcct">Delete account</button></div></div>`;
  return `<div class="card"><h3>Account</h3><div>${esc(a.email||'')}</div>${a.plan?`<div class="mut">Plan: ${a.plan==='paid'?'Paid (AI features on)':'Free'}</div>`:''}<div class="mut" id="syncStatus">${esc(Sync.status())}</div>
  <div class="row wrap mt2"><button class="btn sm" data-act="acSync">⟳ Sync now</button><button class="btn sm" data-act="acOut">Sign out</button></div>
  <div class="mut mt2">Syncs when the app opens and a few seconds after changes. Works offline and catches up later. Stored online: email, password hash, plans, history, settings.</div>
  <button class="btn sm bad mt3" data-act="delAcct">Delete account…</button></div>`}
// Gentle backup reminder: only without an account, only once workouts exist, at most every 14 days, dismissible.
const NAG_MS=14*864e5;
function backupNag(){const s=db().settings,h=db().history;if(Sync.a.token||!h.length)return'';
  const base=Math.max(s.backupAt||0,s.nagAt||0,Math.min(...h.map(x=>x.date||0)));if(Date.now()-base<NAG_MS)return'';
  return `<div class="card nag" role="status"><b>Keep a backup?</b><div class="mut mt1">Without an account, your history lives only on this phone. A backup file keeps it safe.</div>
  <div class="row mt2"><button class="btn sm acc" data-act="export">Back up now</button><button class="btn sm" data-act="nagLater">Not now</button></div></div>`}
// Recommended weight: same rules as the original app's sug(): no history -> start weight ("Starting estimate" / "Bodyweight");
// last session hit top of rep range on all planned sets -> +5 (upper/db) or +10 (lower) lb; otherwise repeat weight.
function exType(e){return e.type||(isLower(e.name)?'lower':'upper')}
function suggest(e){const l=Store.lastFor(e.name,e.oldId);const start=e.weight===''||e.weight==null?0:+e.weight;
  if(!l||!l.sets.length){if(start)return{w:start,t:'Starting estimate',last:null};
    const g=startWeight(e.name,U());return{w:g,t:g?'Suggested start':'Bodyweight',last:null,guess:1}}
  const w=Math.max(...l.sets.map(s=>+s.w||0));const top=l.sets.length>=+e.sets&&l.sets.every(s=>+s.r>=+e.repMax);
  if(top&&w>0){const inc=step(exType(e)==='lower');return{w:w+inc,t:`Hit top of range last time → +${inc} ${U()}`,last:l,up:1}}
  return{w,t:'Repeat weight, aim for more reps',last:l}}
const createOpts=()=>`<button class="big" data-act="ai">🧭 Guided plan<small>Answer 7 quick questions, then build it free or with AI</small></button>
  <button class="big" data-act="newPlan">✎ Build my own<small>Pick your days and exercises yourself</small></button>
  <button class="big" data-act="paste">📷 Copy from text or a picture<small>Paste a plan, or snap a photo or screenshot of one</small></button>`;
const foot=(...b)=>{b=b.filter(Boolean);return `<div class="foot${b.length>1?' two':''}">${b.join('')}</div>`};
// v19: paid + verified + online -> the photo goes to Grok vision (/ai/parse-image) and opens straight in the plan preview.
// Any AI failure falls back silently to on-device OCR with a short note; Cancel stops the AI request and keeps you on this screen.
let picCtl=null;
async function runOCR(file){const box=$('#ocrBox');box.hidden=false;const set=(p,m)=>{$('#ocrBar').style.width=Math.round(p*100)+'%';$('#ocrPct').textContent=Math.round(p*100)+'%';$('#ocrMsg').textContent=m+'…'};
  let note='';
  if(aiPrecheck()===''){
    const ctl=picCtl=new AbortController();$('#ocrCancel').hidden=false;$('#ocrSub').textContent='Sending the picture to AI (Grok) to read. It is not stored.';
    $('#ocrBar').style.width='35%';$('#ocrBar').classList.add('pulse');$('#ocrPct').textContent='';$('#ocrMsg').textContent='Reading your picture with AI…';
    let r=null;try{r=await parseImagePlan(await imageToJpeg(file),ctl.signal)}catch(e){lastAI={ai:false,note:photoNote('')}}
    if(picCtl===ctl)picCtl=null;const b=$('#ocrBox');if(!b||route.v!=='paste')return;$('#ocrCancel').hidden=true;$('#ocrBar').classList.remove('pulse');
    if(r){openDraft(r.plan);draft._new=1;draft._ai=Object.assign({},lastAI,{photo:true});draft._issues=issuesOf(r);go('editor');toast('Plan read from your picture with AI. Check it, then save.');return}
    if(ctl.signal.aborted||(lastAI&&lastAI.cancelled)){b.hidden=true;toast('Cancelled');return}
    note=(lastAI&&lastAI.note)||photoNote('');$('#ocrSub').textContent='Reading happens on your phone. Nothing is uploaded.'}
  try{const t=await imageToText(file,set);const ta=$('#pasteText');ta.value=(ta.value.trim()?ta.value.trim()+'\n\n':'')+t;route.p.text=ta.value;$('#ocrMsg').textContent='Done. Check the text below, then tap "Make my plan".';$('#ocrPct').textContent='';
    if(note)$('#ocrSub').textContent='ⓘ '+note;ta.focus()}
  catch(e){box.hidden=true;info("Couldn't read the picture",String(e&&e.message||e))}}
const issuesOf=r=>({unparsed:r.unparsed,skipped:r.skipped,days:r.plan.days.filter(d=>!d.rest).length,count:r.plan.days.reduce((s,d)=>s+d.exercises.length,0)});
/* ---------- data helpers ---------- */
const vol=w=>w.exercises.reduce((s,e)=>s+e.sets.reduce((a,x)=>a+(+x.w||0)*(+x.r||0),0),0);
const sets=w=>w.exercises.reduce((s,e)=>s+e.sets.length,0);
function weekStart(t){const d=new Date(t);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getTime()}
// Fill missing rests from the library; refresh ones that were auto-filled (restAuto) in case the name changed. User-entered rests are untouched.
function autoRests(p){p.days.forEach(d=>d.exercises.forEach(e=>{if(e.restAuto)e.rest='';fillRest(e)}))}
const newEx=()=>({id:Store.uid(),name:'',sets:3,repMin:8,repMax:12,weight:'',rest:'',restAuto:true,note:''}); // rest filled from the library when a name is chosen
const clone=o=>JSON.parse(JSON.stringify(o));
function blankPlan(){return{id:Store.uid(),name:'My Plan',created:Date.now(),next:0,days:[{id:Store.uid(),name:'Day 1',rest:false,exercises:[newEx()]}]}}
const swap=(a,i,j)=>{if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]]};

function startWorkout(i){
  const plan=Store.activePlan(),d=plan.days[i];
  const ex=d.exercises.filter(e=>e.name.trim()).map(e=>{
    const g=suggest(e),last=g.last,lower=exType(e)==='lower';
    const w=g.w||'',r=g.up||!last?(+e.repMin||8):(+last.sets[0].r||+e.repMin||8);
    const lastTxt=last?last.sets.map(s=>`${s.w||0}×${s.r}`).join(', '):'',sugg=g.guess&&g.w?`Suggested start: ${g.w} ${U()} · a beginner estimate, edit if too light or heavy`:`Recommended: ${g.w?g.w+' '+U():'bodyweight'} · ${g.t}`;
    return{oldId:e.oldId,type:e.type,name:e.name,lower,repMin:+e.repMin,repMax:+e.repMax,rest:restOf(e),note:e.note,last:lastTxt,sugg,sets:[...Array(Math.max(1,+e.sets||1))].map(()=>({w,r,done:false,ws:'s'}))}});
  if(!ex.length){toast('Add exercises to this day first');return}
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
  const acts=[{v:'fill',label:`Mark ${left===1?'it':'all '+left} done and finish`,cls:'acc'}];
  acts.push(done?{v:'ticked',label:`Save only the ${plural(done,'ticked set')}`}:{v:'close',label:'Close without saving',cls:'bad'});
  acts.push({v:null,label:'Keep going'});
  const v=await sheet({title:'Finish workout?',msg:`${plural(left,'set')} ${left===1?"isn't":"aren't"} ticked yet. Mark ${left===1?'it':'them'} done using the weights and reps shown (recommended weights fill any blanks)?`,actions:acts});
  if(v==='fill'){fillRemaining(a);finishWorkout()}else if(v==='ticked'||v==='close')finishWorkout()}
function finishWorkout(){
  const a=db().active;if(!a)return;
  const exs=a.exercises.map(e=>({name:e.name,oldId:e.oldId,type:e.type,lower:e.lower,sets:e.sets.filter(s=>s.done).map(s=>({w:+s.w||0,r:+s.r||0}))})).filter(e=>e.sets.length);
  if(exs.length)Store.addHistory({id:a.id,date:Date.now(),planId:a.planId,planName:a.planName,dayName:a.dayName,units:U(),minutes:Math.round((Date.now()-a.started)/6e4),exercises:exs});
  const p=Store.plan(a.planId);if(p){p.next=(a.dayIndex+1)%p.days.length;Store.upsertPlan(p)}
  db().active=null;Store.save();stopTimer();stack=[];toast(exs.length?'Workout saved 💪':'Workout closed');route={v:'history',p:{}};render();scrollTo(0,0)}
function localReset(){Store.reset();localStorage.removeItem(BG_KEY);applyBg();stopTimer();draft=null}
/* ---------- rest timer ---------- */
function startTimer(sec){timer={end:Date.now()+sec*1000};clearInterval(timer.h);timer.h=setInterval(renderTimer,250);renderTimer()}
function stopTimer(){if(timer)clearInterval(timer.h);timer=null;renderTimer()}
function renderTimer(){let el=$('#timer');
  if(!timer||route.v!=='session'){if(el)el.remove();return}
  const left=Math.max(0,Math.ceil((timer.end-Date.now())/1000));
  if(!el){el=document.createElement('div');el.id='timer';el.className='timer';document.body.appendChild(el);
    el.innerHTML=`<span>Rest <b id="tl"></b></span><span class="row"><button class="btn sm" data-act="t15">+15s</button><button class="btn sm" data-act="tskip">Skip</button></span>`;}
  el.querySelector('#tl').textContent=restTxt(left);
  if(left<=0){navigator.vibrate&&navigator.vibrate([200,100,200]);toast('Rest over. Next set!');stopTimer()}}

/* ---------- events ---------- */
const errMsg=x=>x&&x.message||String(x);
const ACT={
 resume:()=>go('session'),start:b=>startWorkout(+b.dataset.i),
 goPlans:()=>tab('plans'),goToday:()=>tab('home'),
 newPlan:()=>{openDraft(blankPlan());draft._new=1;go('editor')},
 edit:b=>{openDraft(clone(Store.plan(b.dataset.id)));go('editor')},
 dup:b=>{const p=clone(Store.plan(b.dataset.id));p.id=Store.uid();p.name+=' (copy)';p.days.forEach(d=>{d.id=Store.uid()});Store.upsertPlan(p);toast('Plan copied');render()},
 activate:b=>{Store.setActive(b.dataset.id);toast('Now following this plan');render()},
 delPlan:async b=>{const p=Store.plan(b.dataset.id);if(await ask('Delete this plan?',`"${p?p.name:'This plan'}" will be deleted. Your workout history is kept.`,'Delete plan','bad')){Store.deletePlan(b.dataset.id);toast('Plan deleted');render()}},
 openDay:b=>go('day',{i:+b.dataset.i}),
 dayUp:b=>{swap(draft.days,+b.dataset.i,+b.dataset.i-1);render()},dayDown:b=>{swap(draft.days,+b.dataset.i,+b.dataset.i+1);render()},
 addDay:()=>{draft.days.push({id:Store.uid(),name:'Day '+(draft.days.filter(d=>!d.rest).length+1),rest:false,exercises:[newEx()]});go('day',{i:draft.days.length-1})},
 addRest:()=>{draft.days.push({id:Store.uid(),name:'Rest',rest:true,exercises:[]});render()},
 savePlan:()=>{if(!draft.name.trim())draft.name='My Plan';draft.days.forEach(d=>d.exercises=d.exercises.filter(e=>e.name.trim()));autoRests(draft);
   if(!draft.days.length){toast('Add at least one day');return}
   const isNew=draft._new;delete draft._new;delete draft._issues;delete draft._cr;delete draft._ai;Store.upsertPlan(draft);if(isNew)Store.setActive(draft.id);draftSnap=snap(draft);
   toast('Plan saved');stack=[];go(isNew?'home':'plans',{},false)},
 toggleRest:()=>{const d=draft.days[route.p.i];d.rest=!d.rest;if(!d.rest&&!d.exercises.length)d.exercises.push(newEx());render()},
 exAdd:()=>{draft.days[route.p.i].exercises.push(newEx());render();const ins=document.querySelectorAll('[data-ac]');ins[ins.length-1]?.focus()},
 exDel:b=>{draft.days[route.p.i].exercises.splice(+b.dataset.j,1);render()},
 exUp:b=>{swap(draft.days[route.p.i].exercises,+b.dataset.j,+b.dataset.j-1);render()},exDown:b=>{swap(draft.days[route.p.i].exercises,+b.dataset.j,+b.dataset.j+1);render()},
 // In "Edit day" opened from Today, duplicate/delete save straight away (the same as Save day), so nothing is lost.
 dayDup:()=>{const i=route.p.i,d=clone(draft.days[i]);d.id=Store.uid();d.name+=' copy';d.exercises.forEach(e=>e.id=Store.uid());draft.days.splice(i+1,0,d);
   if(route.p.direct){commitDay(i+1);toast('Day duplicated')}else pop()},
 dayDel:async()=>{const i=route.p.i;if(route.p.direct&&draft.days.length===1){toast('A plan needs at least one day');return}
   if(!await ask('Delete this day?',`"${draft.days[i].name}" and its exercises will be removed from the plan.`,'Delete day','bad'))return;
   draft.days.splice(i,1);if(route.p.direct){commitDay(Math.max(0,i-1));toast('Day deleted')}else pop()},
 back:()=>back(),
 selDay:b=>{route.p.sel=+b.dataset.i;render();document.querySelector('.daytab.on')?.scrollIntoView({inline:'center',block:'nearest'})},
 editDay:b=>{openDraft(clone(Store.activePlan()));go('day',{i:+b.dataset.i,direct:1})},
 setColor:b=>{draft.days[route.p.i].color=b.dataset.c;render()},
 colorAll:()=>{const c=dayColor(draft.days[route.p.i]);draft.days.forEach(d=>d.color=c);toast('Colour used for all days')},
 saveDay:()=>{commitDay(route.p.i);toast('Day saved')},
 bgNone:()=>{setBg({kind:'none'});render()},
 bgPreset:b=>{setBg({kind:'preset',id:b.dataset.id});render()},
 bgPhoto:()=>{const f=$('#bgFile');f.value='';f.onchange=async()=>{try{const u=await loadBgFile(f.files[0]);try{localStorage.setItem(BG_KEY,u)}catch(e){throw new Error('Not enough space on this phone to save that picture. Try a smaller one.')}setBg({kind:'custom'});toast('Background set');render()}catch(e){toast(errMsg(e),'err')}};f.click()},
 importOld:async()=>{const r=await importOldApp();showOldResult(r,true)},
 paste:()=>go('paste'),
 sessMenu:async()=>{const a=db().active;if(!a)return;const v=await sheet({title:'Workout options',actions:[{v:'watch',label:'⌚ Send to watch or import result'},{v:'discard',label:'Discard workout',cls:'bad'},{v:null,label:'Close'}]});
   if(v==='watch')go('watch',{i:a.dayIndex,planId:a.planId});
   else if(v==='discard'&&await ask('Discard this workout?','Nothing from this workout will be saved.','Discard workout','bad','Keep going')){db().active=null;Store.save();stopTimer();toast('Workout discarded');tab('home')}},
 finish:()=>finishFlow(),
 account:b=>go('account',{mode:b.dataset.mode||'in'},route.v!=='account'),
 acSubmit:async b=>{const e=$('#acEmail').value.trim(),p=$('#acPw').value,n=$('#acNote');if(!e||!p){n.textContent='Enter your email and password.';return}
   b.disabled=true;b.textContent='Working…';try{const j=await Sync.signIn(b.dataset.mode,e,p);
     if(j.verified===false){go('account',{mode:'verify',note:j.mailError?Sync.msg({error:j.mailError}):''},false);return}
     toast('Signed in. Your data is syncing.');stack=[];tab('settings')}catch(x){n.textContent=errMsg(x);b.disabled=false;b.textContent=b.dataset.mode==='up'?'Create account':'Sign in'}},
 acVerify:async b=>{const c=($('#acCode').value||'').replace(/\D/g,'');if(c.length!==6){$('#acNote').textContent='Enter the 6-digit code from the email.';return}
   b.disabled=true;b.textContent='Checking…';try{await Sync.verify(c);toast('Email verified. Your data is syncing.');stack=[];tab('settings')}catch(x){$('#acNote').textContent=x.message;b.disabled=false;b.textContent='Verify'}},
 acResend:async b=>{b.disabled=true;try{await Sync.resend();$('#acNote').textContent='New code sent. Check your email (and spam).'}catch(x){$('#acNote').textContent=x.status===429?'Please wait a minute before asking for another code (max 5 an hour).':x.message}setTimeout(()=>{b.disabled=false},60000)},
 acForgotGo:b=>{const e=$('#acEmail');go('account',{mode:'forgot',email:e?e.value.trim():''},false)},
 acForgot:async b=>{const el=$('#acEmail'),e=(el?el.value:b.dataset.email||'').trim();if(!e){$('#acNote').textContent='Enter your email.';return}
   b.disabled=true;try{await Sync.forgot(e);go('account',{mode:'reset',email:e,note:route.p.mode==='reset'?'New code sent, if that email has an account.':''},false)}catch(x){const n=$('#acNote');if(n)n.textContent=x.status===429?'Please wait a minute before asking for another code.':x.message;b.disabled=false}},
 acReset:async b=>{const c=($('#acCode').value||'').replace(/\D/g,''),p=$('#acPw').value,n=$('#acNote');if(c.length!==6){n.textContent='Enter the 6-digit code from the email.';return}
   if(p.length<8){n.textContent='Your new password needs at least 8 characters.';return}
   b.disabled=true;b.textContent='Saving…';try{await Sync.reset(b.dataset.email,c,p);toast('Password changed. You are signed in.');stack=[];tab('settings')}catch(x){n.textContent=x.message;b.disabled=false;b.textContent='Save new password'}},
 acOut:async()=>{if(!await ask('Sign out?','Your data stays on this phone. Sign in again any time to sync.','Sign out'))return;await Sync.signOut();if(route.v==='account'){stack=[];tab('settings')}else render()},
 acSync:async()=>{await Sync.now();toast(Sync.a.err||'Synced')},
 delAcct:async()=>{
   const v=await sheet({title:'Delete your account?',msg:'This permanently deletes your Simple Lift account and everything stored for it online: your email, synced plans and history, watch pairing and AI usage. It cannot be undone.',
     html:`<label for="dPw">Your password</label><input id="dPw" name="pw" type="password" autocomplete="current-password">
       <label for="dCf">Type DELETE to confirm</label><input id="dCf" name="cf" autocomplete="off" autocapitalize="characters" spellcheck="false">
       <label class="chk"><input type="checkbox" name="wipe"> Also erase the plans and history on this phone</label>`,
     actions:[{v:'del',label:'Delete my account',cls:'bad',run:async o=>{const pw=o.querySelector('#dPw').value,cf=o.querySelector('#dCf').value;
       if(cf.trim().toUpperCase()!=='DELETE')return 'Type DELETE in the box to confirm.';if(!pw)return 'Enter your password.';
       try{await Sync.deleteAccount(pw,cf.trim());return true}catch(x){return errMsg(x)}}},{v:null,label:'Cancel'}]});
   if(v!=='del')return;const wipe=sheetVals.wipe;if(wipe)localReset();stack=[];route={v:'settings',p:{}};render();
   toast(wipe?'Account deleted, and this phone was erased.':'Account deleted. Your data is still on this phone.')},
 pair:async()=>{go('pair');try{const j=await Sync.pair();$('#pairCode').textContent=j.code;$('#pairNote').textContent='Expires in 10 minutes'}catch(x){$('#pairNote').textContent='Could not get a code: '+x.message}},
 watch:b=>go('watch',{i:+b.dataset.i,planId:Store.activePlan()?.id}),
 watchCopy:async()=>{const ta=$('#watchCode');ta.focus();ta.select();let ok=false;try{await navigator.clipboard.writeText(ta.value);ok=true}catch(e){try{ok=document.execCommand('copy')}catch(_){}}toast(ok?'Code copied':'Code selected. Long-press it and tap Copy.')},
 watchImport:async()=>{const r=parseResult($('#watchRes').value);if(!r){toast("That doesn't look like a watch result code. It should start with SR1~",'err');return}
   try{const o=applyResult(r);await info('Imported from watch',o.msg);stack=[];if(o.mode==='live')go('session',{},false);else go('history',{},false)}catch(e){info("Couldn't import that code",errMsg(e))}},
 chooser:()=>go('chooser'),
 ocrCancel:()=>{if(picCtl)picCtl.abort()},
 pickPic:()=>{const f=$('#picFile');f.value='';f.onchange=()=>f.files[0]&&runOCR(f.files[0]);f.click()},
 takePic:()=>{const f=$('#camFile');f.value='';f.onchange=()=>f.files[0]&&runOCR(f.files[0]);f.click()},
 applyCR:async()=>{const t=$('#crText').value;if(!t.trim()){toast('Type a change first');return}const r=await applyChangeRequest(draft,t);
   const keep={_new:draft._new,_issues:draft._issues,_ai:draft._ai};draft=Object.assign(r.plan,keep);draft._cr={changes:r.changes,notUnderstood:r.notUnderstood};render();
   setTimeout(()=>document.querySelector('#crText')?.closest('details').scrollIntoView({block:'start'}),30)},
 parse:async b=>{const t=$('#pasteText').value;if(!t.trim()){toast('Paste text or choose a picture first');return}route.p.text=t;
   b.disabled=true;const r=await parseTextPlan(t);b.disabled=false;if(!r.plan.days.length){info('No exercises found',"I couldn't find any exercises in that text. Try lines like \"Bench press 4x8-10\".");return}
   openDraft(r.plan);draft._new=1;draft._ai=lastAI;draft._issues=issuesOf(r);go('editor')},
 ai:()=>{ai={step:0,a:{injuries:'',focus:[]}};go('ai')},
 aiPick:async b=>{const s=AI_STEPS[ai.step];let v=b.dataset.v;if(typeof s.opts[0][0]==='number')v=+v;
   if(s.multi){let arr=ai.a[s.key];if(v==='none')arr=[];else{arr=arr.includes(v)?arr.filter(x=>x!==v):[...arr,v];if(s.key==='focus'&&arr.length>3)arr.shift()}ai.a[s.key]=arr;render();return}
   ai.a[s.key]=v;ai.step++;render();scrollTo(0,0)},
 aiPrev:()=>{if(ai.busy)return;const tx=$('#aiText');if(tx)ai.a[AI_STEPS[ai.step].key]=tx.value;ai.msg='';if(!ai.step){pop();return}ai.step--;render();scrollTo(0,0)},
 aiNext:()=>{const S=AI_STEPS,st=S[ai.step];if(!st)return;const tx=$('#aiText');if(tx)ai.a[st.key]=tx.value;
   if(!st.multi&&!st.text&&ai.a[st.key]==null){toast('Pick one to continue');return}
   ai.step++;ai.msg='';render();scrollTo(0,0)},
 aiQuick:()=>{if(ai.busy)return;ai.msg='';openDraft(rulePlan(ai.a));draft._new=1;stack=[{v:'plans',p:{}}];go('editor',{},false);toast('Plan ready. Tweak anything, then save.')},
 aiBuild:async()=>{if(ai.busy)return;
   const why=aiPrecheck();if(why){ai.msg=why==='paid'?'AI building is a paid extra. Quick build is free and works great.':why==='none'?'AI building is not available in this version.':why==='offline'?"You're offline, so AI can't build a plan right now. Quick build works offline.":why==='verify'?'AI building is a paid extra. Verify your email in Settings → Account & sync first, or use Quick build (free).':'AI building is a paid extra for accounts. Sign in with a verified email in Settings → Account & sync, or use Quick build (free).';render();return}
   const ctl=new AbortController();ai.ctl=ctl;ai.busy=true;ai.msg='';render();
   const p=await generatePlan(ai.a,{signal:ctl.signal});if(ai.ctl!==ctl||ctl.signal.aborted)return; // cancelled
   ai.busy=false;ai.ctl=null;openDraft(p);draft._new=1;draft._ai=lastAI;stack=[{v:'plans',p:{}}];go('editor',{},false);
   toast(lastAI&&lastAI.ai?'AI plan ready. Tweak anything, then save.':lastAI&&lastAI.note?lastAI.note:'Plan ready (built-in builder). Tweak anything, then save.')},
 aiCancel:()=>{if(ai.ctl)ai.ctl.abort();ai.ctl=null;ai.busy=false;ai.msg='';render();toast('Cancelled')},
 stp:(b,e,mult=1)=>{if(e&&e.type==='click'&&holdUntil>Date.now())return; // pointer already handled it
   const s=db().active.exercises[+b.dataset.j].sets[+b.dataset.k],f=b.dataset.f,d=+b.dataset.d;
   const inc=(f==='w'?(U()==='kg'?2.5:5):1)*mult;s[f]=Math.max(0,Math.round(((+s[f]||0)+d*inc)*10)/10);Store.save();
   b.parentNode.querySelector('input').value=s[f];if(f==='w'){s.ws='m';b.parentNode.querySelector('input').classList.remove('sugw');cascadeW(+b.dataset.j,+b.dataset.k);Store.save()}},
 setDone:b=>{const e=db().active.exercises[+b.dataset.j],s=e.sets[+b.dataset.k];s.done=!s.done;if(s.done&&s.ws==='s')s.ws='m';Store.save();render();if(s.done)startTimer(e.rest)},
 setAdd:b=>{const e=db().active.exercises[+b.dataset.j],l=e.sets[e.sets.length-1];e.sets.push({w:l.w,r:l.r,done:false,ws:l.ws==='s'?'s':'c'});Store.save();render()},
 setDel:b=>{db().active.exercises[+b.dataset.j].sets.pop();Store.save();render()},
 t15:()=>{timer.end+=15000;renderTimer()},tskip:stopTimer,
 openHist:b=>go('hist',{id:b.dataset.id}),
 delHist:async b=>{if(await ask('Delete this workout?','It will be removed from your history and progress.','Delete workout','bad')){Store.deleteHistory(b.dataset.id);toast('Workout deleted');pop()}},
 wk:b=>{route.p.off=Math.max(0,+b.dataset.o);render()},
 copyW:()=>{db().settings.copyWeight=db().settings.copyWeight===false;Store.save();render()},
 units:b=>{db().settings.units=b.dataset.v;db().settings.unitsChosen=true;Store.save();render()},
 nagLater:()=>{db().settings.nagAt=Date.now();Store.save();render();toast("OK. I'll remind you in two weeks.")},
 export:()=>{const blob=new Blob([Store.exportJSON()],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`simplelift-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();
   db().settings.backupAt=Date.now();Store.save();if(route.v==='home')render();toast('Backup file saved to your downloads')},
 import:async()=>{if(!await ask('Restore from a backup?',`Restoring replaces ALL plans, history and settings on this phone with the ones in the backup file.${Sync.on()?' Your account copy is merged with it on the next sync.':''} Export a backup first if you're not sure.`,'Choose backup file','acc'))return;
   const f=$('#file');f.value='';f.onchange=()=>{if(!f.files[0])return;const r=new FileReader();r.onload=()=>{try{Store.importJSON(r.result);applyBg();toast('Backup restored');tab('home')}catch(e){info('Restore failed',errMsg(e))}};r.readAsText(f.files[0])};f.click()},
 reset:async()=>{
   if(!Sync.on()){if(await ask('Reset all data?','This erases all plans, history and settings on this phone. It cannot be undone. Export a backup first if you might want them.','Erase everything','bad')){localReset();tab('home');toast('All data reset')}return}
   const v=await sheet({title:'Reset all data?',msg:`You're signed in as ${Sync.a.email||'your account'}, so your data is also in the cloud. Choose what to erase. This cannot be undone.`,
     actions:[{v:'all',label:'Erase this phone and the cloud copy',cls:'bad'},{v:'local',label:'Erase this phone only and sign out'},{v:null,label:'Cancel'}]});
   if(v==='all'){Store.wipeEverywhere();localStorage.removeItem(BG_KEY);applyBg();stopTimer();draft=null;await Sync.now();tab('home');toast(Sync.a.err?'Erased here. The cloud copy will be cleared on the next sync.':'All data erased on this phone and in the cloud')}
   else if(v==='local'){await Sync.signOut();localReset();tab('home');toast('This phone was erased and signed out. Your cloud copy is unchanged.')}}
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
  if(r.workouts||r.plan)info('Imported from your old app',`${plural(r.workouts,'workout')} (${plural(r.sets,'set')})${r.plan?' and your original plan':''}. Your last weights and recommendations now use this history.`);
  else if(manual)info('Import from old app',r.found?'Everything from your old workout app is already imported. Nothing new to add.':"No history from the old workout app was found in this browser. It can only be read on the same phone and browser where you used the old app (alexroyandrew1-crypto.github.io/workout). If you used it on another phone, open Simple Lift there and import it on that phone.");
  render()}
applyBg();
if(db().active)route={v:'home',p:{}};
if(!db().oldImportChecked&&oldHasData())importOldApp().then(r=>showOldResult(r,false));
render();
Sync.soon(800); // pull on open (no-op unless signed in)

/* ---------- updates: the service worker serves the cached version instantly; a new version waits until you tap the bar ---------- */
let swReg=null,updTapped=false;
function showUpdateBar(){if($('#updbar'))return;const b=document.createElement('button');b.id='updbar';b.className='updbar';b.textContent='Update available — tap to refresh';
  b.onclick=()=>{updTapped=true;b.textContent='Updating…';const w=swReg&&swReg.waiting;if(w)w.postMessage('skipWaiting');else location.reload()};document.body.appendChild(b)}
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').then(r=>{swReg=r;const chk=()=>{if(r.waiting&&navigator.serviceWorker.controller)showUpdateBar()};chk();
    r.addEventListener('updatefound',()=>{const w=r.installing;if(w)w.addEventListener('statechange',()=>{if(w.state==='installed')chk()})});
    r.update().catch(()=>{});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')r.update().catch(()=>{})})}).catch(()=>{});
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updTapped)location.reload()})}
