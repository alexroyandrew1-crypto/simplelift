'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const db=()=>Store.db;
const U=()=>db().settings.units;
const step=lower=>U()==='kg'?(lower?5:2.5):(lower?10:5);
const fmtDate=t=>new Date(t).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),1800)};
const isLower=n=>!!libFind(n)?.lower;

let route={v:'home',p:{}},stack=[],draft=null,ai=null,timer=null;
function go(v,p={},push=true){if(push)stack.push(route);route={v,p};render();scrollTo(0,0)}
function tab(v){stack=[];route={v,p:{}};render();scrollTo(0,0)}
function back(){route=stack.pop()||{v:'home',p:{}};render()}
$('#back').onclick=back;
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{if(db().active&&b.dataset.tab==='home'){tab('home');return}tab(b.dataset.tab)});

const TITLES={home:'Simple Lift',plans:'My Plans',editor:'Edit Plan',day:'Edit Day',ai:'Build with AI',aiprompt:'Use My Own AI',aipaste:'Paste AI Answer',paste:'Copy a Workout',chooser:'New Plan',session:'Workout',history:'History',hist:'Workout',progress:'Progress',settings:'Settings'};
function render(){
  const v=route.v;$('#title').textContent=TITLES[v]||'Simple Lift';
  $('#back').style.visibility=stack.length?'visible':'hidden';
  const root={home:'home',plans:'plans',editor:'plans',day:'plans',ai:'home',aiprompt:'home',aipaste:'home',paste:'home',chooser:'home',session:'home',history:'history',hist:'history',progress:'progress',settings:'settings'}[v];
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===root));
  const m=$('#view');m.style.animation='none';m.offsetHeight;m.style.animation='';
  m.innerHTML=VIEWS[v](route.p);
  renderTimer();
}

/* ---------- helpers ---------- */
function nextDayIndex(plan){if(!plan||!plan.days.some(d=>!d.rest&&d.exercises.length))return -1;
  let i=(plan.next||0)%plan.days.length;for(let k=0;k<plan.days.length;k++){const d=plan.days[(i+k)%plan.days.length];if(!d.rest&&d.exercises.length)return(i+k)%plan.days.length}return -1}
const repTxt=e=>e.repMin===e.repMax?e.repMin:`${e.repMin}–${e.repMax}`;
const restTxt=s=>s>=60?`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`:`${s}s`;

/* ---------- views ---------- */
const VIEWS={
chooser(){return chooserHTML()},
home(){
  const a=db().active;const plan=Store.activePlan();let h='';
  if(a)h+=`<button class="big acc" data-act="resume">Resume workout<small>${esc(a.dayName)} · in progress</small></button>`;
  if(plan)return h+workoutHome(plan);
  if(0){const i=nextDayIndex(plan);
    if(i>=0){const d=plan.days[i];h+=`<div class="card"><div class="mut">Next workout · ${esc(plan.name)}</div><h2>${esc(d.name)}</h2>
      <div class="mut">${d.exercises.length} exercises · ${d.exercises.reduce((s,e)=>s+(+e.sets||0),0)} sets</div>
      <div style="margin:10px 0">${d.exercises.map(e=>`<div class="between"><span>${esc(e.name)}</span><span class="mut">${e.sets}×${repTxt(e)}</span></div>`).join('')}</div>
      <button class="btn acc full" data-act="start" data-i="${i}">Start workout</button></div>`}
    h+=`<div class="card"><div class="between"><h3>${esc(plan.name)}</h3><button class="btn sm" data-act="editActive">Edit</button></div>
      <div class="chips" style="margin-top:6px">${plan.days.map((d,j)=>`<button class="chip ${j===i?'on':''}" data-act="start" data-i="${j}" ${d.rest||!d.exercises.length?'disabled':''}>${esc(d.name)}</button>`).join('')}</div>
      <div class="mut" style="margin-top:8px">Tap any day to start it instead.</div></div>`}
  h+=`<h2 style="margin:8px 0 0">Create your plan</h2><button class="big" data-act="newPlan">✎ Build my own plan<small>Pick your days and exercises</small></button>
      <button class="big" data-act="ai">✦ Build with AI<small>Answer a few questions, get a plan made for you</small></button>
      <button class="big" data-act="paste">📷 Copy a workout from text or picture<small>Paste text or snap a photo or screenshot of a plan</small></button>`;
  return h;
},
plans(){
  const ps=db().plans;
  return (ps.length?ps.map(p=>`<div class="card"><div class="between"><div><h3>${esc(p.name)}</h3><div class="mut">${p.days.filter(d=>!d.rest).length} workout days · ${p.days.length} total</div></div>
    ${p.id===db().activePlanId?'<span class="tag">Active</span>':`<button class="btn sm" data-act="activate" data-id="${p.id}">Use</button>`}</div>
    <div class="row" style="margin-top:10px"><button class="btn grow" data-act="edit" data-id="${p.id}">Edit</button><button class="btn" data-act="dup" data-id="${p.id}">Copy</button><button class="btn bad" data-act="delPlan" data-id="${p.id}">Delete</button></div></div>`).join('')
    :`<div class="card mut">No plans yet. Create one below.</div>`)+
    `<h3 style="margin:18px 0 0">+ New plan</h3><button class="big" data-act="newPlan">✎ Build my own plan<small>Pick your days and exercises</small></button>
      <button class="big" data-act="ai">✦ Build with AI<small>Answer a few questions, get a plan made for you</small></button>
      <button class="big" data-act="paste">📷 Copy a workout from text or picture<small>Paste text or snap a photo or screenshot of a plan</small></button>`;
},
editor(){
  const p=draft;
  const I=p._issues;const iss=I?`<div class="card" style="border:1px solid ${I.unparsed.length?'#7c5a1d':'#24492f'}"><b>${I.count} exercises found in ${I.days} day${I.days===1?'':'s'}.</b> Check them below, fix anything, then save.
    ${I.unparsed.length?`<div style="margin-top:8px;color:#fbbf24">I couldn't understand ${I.unparsed.length} line${I.unparsed.length===1?'':'s'}:</div><ul class="mut" style="margin:4px 0;padding-left:18px">${I.unparsed.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="mut">Add those yourself with "+ Add exercise" if you need them.</div>`:''}
    ${I.skipped.length?`<div class="mut" style="margin-top:6px">Skipped ${I.skipped.length} warm-up, cool-down or tips line${I.skipped.length===1?'':'s'}.</div>`:''}</div>`:'';
  const CR=p._cr;const req=`<div class="card"><h3>Request changes</h3><div class="mut">Tell me what to change in plain words, e.g. "swap squats for leg press, add abs, make it shorter, add hammer curls to day 2". Or edit anything by hand below.</div>
    <textarea id="crText" rows="3" style="margin-top:10px" placeholder="e.g. replace bench press with dumbbell press, more chest, no calf raises"></textarea><button class="btn acc full" data-act="applyCR">Apply changes</button>
    ${CR?`<div style="margin-top:10px">${CR.changes.length?`<b>What changed:</b><ul style="margin:4px 0;padding-left:18px">${CR.changes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<b>Nothing was changed.</b>'}
    ${CR.notUnderstood.length?`<div style="color:#fbbf24">I couldn't understand or do:</div><ul class="mut" style="margin:4px 0;padding-left:18px">${CR.notUnderstood.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="mut">Try "swap X for Y", "remove X", "add X to day 2", "more chest", "make it shorter".</div>`:''}</div>`:''}</div>`;
  return iss+req+`<label>Plan name</label><input data-bind="name" value="${esc(p.name)}" placeholder="My plan">
  <label>Plan notes</label><textarea data-bind="notes" rows="2" placeholder="Optional">${esc(p.notes||'')}</textarea>
  <h3 style="margin:18px 0 4px">Days</h3><div class="mut">Tap a day to edit its exercises. Use arrows to reorder.</div>
  ${p.days.map((d,i)=>`<div class="card"><div class="row"><div class="grow" data-act="openDay" data-i="${i}" style="cursor:pointer">
    <h3>${esc(d.name)} ${d.rest?'<span class="tag">Rest</span>':''}</h3>
    <div class="mut">${d.rest?'Recovery day':d.exercises.length?esc(d.exercises.map(e=>e.name).join(', ')):'No exercises yet'}</div></div>
    <div style="display:flex;flex-direction:column"><button class="icon-btn" style="font-size:18px" data-act="dayUp" data-i="${i}" aria-label="Move up">▲</button><button class="icon-btn" style="font-size:18px" data-act="dayDown" data-i="${i}" aria-label="Move down">▼</button></div></div></div>`).join('')}
  <div class="grid2"><button class="btn" data-act="addDay">+ Workout day</button><button class="btn" data-act="addRest">+ Rest day</button></div>
  <button class="btn acc full" data-act="savePlan">Save plan</button>`;
},
day({i}){
  const d=draft.days[i];if(!d)return'';
  return `<label>Day name</label><input data-bind="day.name" value="${esc(d.name)}">
  <div class="between" style="margin-top:12px"><span>Rest day</span><button class="chip ${d.rest?'on':''}" data-act="toggleRest">${d.rest?'Yes':'No'}</button></div>
  ${d.rest?'':d.exercises.map((e,j)=>`<div class="ex">
    <div class="ac"><label>Exercise</label><input data-bind="ex.${j}.name" data-ac="${j}" value="${esc(e.name)}" placeholder="Start typing… e.g. Bench" autocomplete="off"><div class="aclist" id="ac${j}" hidden></div></div>
    <div class="grid3"><div><label>Sets</label><input type="number" inputmode="numeric" min="1" data-bind="ex.${j}.sets" value="${esc(e.sets)}"></div>
    <div><label>Reps min</label><input type="number" inputmode="numeric" data-bind="ex.${j}.repMin" value="${esc(e.repMin)}"></div>
    <div><label>Reps max</label><input type="number" inputmode="numeric" data-bind="ex.${j}.repMax" value="${esc(e.repMax)}"></div></div>
    <div class="grid2"><div><label>Start weight (${U()}) · optional</label><input type="number" inputmode="decimal" data-bind="ex.${j}.weight" value="${esc(e.weight)}"></div>
    <div><label>Rest (seconds)</label><input type="number" inputmode="numeric" data-bind="ex.${j}.rest" value="${esc(e.rest)}"></div></div>
    <label>Note</label><input data-bind="ex.${j}.note" value="${esc(e.note)}" placeholder="Optional">
    <div class="row" style="margin-top:10px"><button class="btn sm" data-act="exUp" data-j="${j}">▲</button><button class="btn sm" data-act="exDown" data-j="${j}">▼</button><span class="grow"></span><button class="btn sm bad" data-act="exDel" data-j="${j}">Remove</button></div></div>`).join('')}
  ${d.rest?'':'<button class="btn full" data-act="exAdd">+ Add exercise</button>'}
  ${route.p.direct?`<div class="card"><h3>Day color</h3><div class="chips">${COLORS.map(c=>`<button class="swatch ${dayColor(d)===c?'on':''}" style="background:${c}" data-act="setColor" data-c="${c}" aria-label="Color ${c}"></button>`).join('')}
    <label class="swatch custom" title="Custom color" style="background:${esc(dayColor(d))}"><input type="color" id="customColor" value="${esc(dayColor(d))}"></label></div>
    <button class="btn full" data-act="colorAll">Apply this color to all days</button></div>`:''}
  <div class="grid2" style="margin-top:10px"><button class="btn" data-act="dayDup">Duplicate day</button><button class="btn bad" data-act="dayDel">Delete day</button></div>
  <button class="btn acc full" data-act="${route.p.direct?'saveDay':'back'}">${route.p.direct?'Save workout':'Done'}</button>`;
},
ai(){
  const S=AI_STEPS,s=S[ai.step];
  const val=ai.a[s.key];
  const on=v=>s.multi?(val||[]).includes(v):val==v;
  return `<div class="mut">Step ${ai.step+1} of ${S.length}</div><div class="progress"><i style="width:${(ai.step+1)/S.length*100}%"></i></div>
  <h2>${esc(s.q)}</h2>${s.hint?`<div class="mut">${esc(s.hint)}</div>`:''}
  ${s.text?`<textarea id="aiText" rows="4" style="margin-top:12px" placeholder="e.g. bad right shoulder, lower back pain">${esc(val||'')}</textarea><div id="injHint" class="mut" style="margin-top:6px">${injHint(val)}</div>`:''}
  <div style="margin-top:12px;${s.grid?'display:grid;grid-template-columns:1fr 1fr;column-gap:8px':''}">${s.opts.map(([v,l,d])=>`<button class="big ${on(v)?'acc':''}" style="padding:16px 18px;font-size:17px" data-act="aiPick" data-v="${esc(v)}">${esc(l)}${d?`<small>${esc(d)}</small>`:''}</button>`).join('')}</div>
  <div class="grid2">${ai.step?'<button class="btn" data-act="aiPrev">Back</button>':'<span></span>'}
  ${s.multi||s.text?(ai.step===S.length-1?'<span></span>':`<button class="btn acc" data-act="aiNext">Next</button>`):''}</div>
  ${ai.step===S.length-1?`<h3 style="margin-top:18px">How should I make your plan?</h3>
  <button class="big acc" data-act="aiNext">⚡ Quick build<small>Made instantly on your phone from built-in rules</small></button>
  <button class="big" data-act="aiOwn">💬 Use my own AI chat (free)<small>Copy a ready-made prompt into ChatGPT, Grok, Gemini or any chat AI, then paste its answer back</small></button>`:''}`;
},
aiprompt(){const pr=buildAIPrompt(ai.a,ai.changes||'');
  return `<div class="card"><b>3 quick steps</b><ol style="margin:8px 0 0 18px;padding:0;line-height:1.6"><li>Tap <b>Copy prompt</b>.</li><li>Paste it into ChatGPT, Grok, Gemini or any chat AI.</li><li>Copy its whole answer and paste it back here on the next screen.</li></ol></div>
  <label class="mut" for="aiChanges">Any changes you want? (optional)</label>
  <textarea id="aiChanges" rows="2" placeholder="e.g. no deadlifts, more arms, Fridays short">${esc(ai.changes||'')}</textarea>
  <label class="mut" for="aiPrompt" style="display:block;margin-top:10px">Your prompt</label>
  <textarea id="aiPrompt" rows="12" readonly style="font-size:13px">${esc(pr)}</textarea>
  <button class="btn acc full" data-act="aiCopy">📋 Copy prompt</button>
  <button class="btn full" data-act="aiToPaste">Next: paste the AI's answer →</button>
  <div class="mut" style="margin-top:10px"><b>How it works:</b> Simple Lift sends nothing anywhere. Your AI chat only sees what you paste into it. There's no account or key, and it's free on any chat AI's free plan.</div>`},
aipaste(){
  return `<div class="mut">Paste the AI's whole answer below. You'll see your plan next and can fix anything before saving.</div>
  <textarea id="pasteText" rows="16" style="margin-top:10px" placeholder="Plan: My Plan&#10;Day 1: Push&#10;Barbell Bench Press — 3 sets x 8-10 reps — rest 90s&#10;...">${esc(route.p.text||'')}</textarea>
  <button class="btn acc full" data-act="parse">Make my plan</button>
  <button class="btn full" data-act="back">← Back to the prompt</button>`},
paste(){
  return `<div class="row" style="gap:8px;margin-bottom:10px"><button class="btn grow" data-act="pickPic">🖼 Choose a picture</button><button class="btn grow" data-act="takePic">📷 Take a photo</button></div>
  <input type="file" id="picFile" accept="image/*" hidden><input type="file" id="camFile" accept="image/*" capture="environment" hidden>
  <div id="ocrBox" class="card" hidden><div class="between"><b id="ocrMsg">Reading text…</b><span id="ocrPct" class="mut"></span></div><div class="progress"><i id="ocrBar" style="width:0"></i></div><div class="mut">Reading happens on your phone. Nothing is uploaded.</div></div>
  <div class="mut">Or paste a workout plan copied from anywhere. Day headings like "Day 1 - Push" or "Monday: Legs" and lines like "Bench press 4x8-10" work best. You'll see a preview before anything is saved. After reading a picture, check the text below and fix any mistakes.</div>
  <textarea id="pasteText" rows="14" style="margin-top:12px" placeholder="Day 1 - Push&#10;Bench press 4x8-10&#10;Overhead press 3 sets of 8-12, rest 90s&#10;&#10;Day 2 - Rest&#10;&#10;Day 3 - Legs&#10;Squats 3x8-12">${esc(route.p.text||'')}</textarea>
  <button class="btn acc full" data-act="parse">Make my plan</button>`;
},
session(){
  const a=db().active;if(!a)return'<div class="card">No workout in progress.</div>';
  const done=a.exercises.reduce((s,e)=>s+e.sets.filter(x=>x.done).length,0),tot=a.exercises.reduce((s,e)=>s+e.sets.length,0);
  return `<div class="between"><h2 style="margin:0">${esc(a.dayName)}</h2><span class="mut">${done}/${tot} sets</span></div>
  <div class="progress"><i style="width:${tot?done/tot*100:0}%"></i></div>
  ${a.exercises.map((e,j)=>`<div class="card"><div class="between"><h3>${esc(e.name)}</h3><span class="mut">${repTxt(e)} reps · rest ${restTxt(e.rest)}</span></div>
    ${e.note?`<div class="mut">${esc(e.note)}</div>`:''}${e.last?`<div class="mut">Last: ${esc(e.last)}</div>`:''}${e.sugg?`<div class="sugg">↑ ${esc(e.sugg)}</div>`:''}
    <div class="set mut" style="font-size:12px;margin-bottom:-4px"><span>Set</span><span>${U()}</span><span>Reps</span><span></span></div>
    ${e.sets.map((s,k)=>`<div class="set"><span class="mut">${k+1}</span>
      <div class="step"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="w" data-d="-1">−</button><input type="number" inputmode="decimal" data-bind="set.${j}.${k}.w" class="${s.ws==='s'?'sugw':''}" value="${esc(s.w)}"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="w" data-d="1">+</button></div>
      <div class="step"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="r" data-d="-1">−</button><input type="number" inputmode="numeric" data-bind="set.${j}.${k}.r" value="${esc(s.r)}"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="r" data-d="1">+</button></div>
      <button class="done ${s.done?'on':''}" data-act="setDone" data-j="${j}" data-k="${k}" aria-label="Mark set done">✓</button></div>`).join('')}
    <div class="row"><button class="btn sm" data-act="setAdd" data-j="${j}">+ Set</button>${e.sets.length>1?`<button class="btn sm" data-act="setDel" data-j="${j}">− Set</button>`:''}</div></div>`).join('')}
  <button class="btn acc full" data-act="finish">Finish workout</button><button class="btn bad full" data-act="discard">Discard workout</button>`;
},
history(){
  const h=db().history.slice().sort((a,b)=>b.date-a.date);
  if(!h.length)return'<div class="card mut">No workouts yet. Finish one and it shows up here.</div>';
  return h.map(w=>`<div class="card" data-act="openHist" data-id="${w.id}" style="cursor:pointer"><div class="between"><div><div class="mut">${fmtDate(w.date)}</div><h3>${esc(w.dayName)}</h3></div><span>›</span></div>
    <div class="mut">${w.exercises.length} exercises · ${sets(w)} sets · ${Math.round(vol(w)).toLocaleString()} ${esc(w.units)} volume${w.minutes?` · ${w.minutes} min`:''}</div></div>`).join('');
},
hist({id}){
  const w=db().history.find(x=>x.id===id);if(!w)return'<div class="card">Not found.</div>';
  return `<div class="mut">${fmtDate(w.date)} · ${esc(w.planName||'')}</div><h2>${esc(w.dayName)}</h2>
  ${w.exercises.map(e=>`<div class="card"><h3>${esc(e.name)}</h3>${e.sets.map((s,k)=>`<div class="between"><span class="mut">Set ${k+1}</span><span>${esc(s.w||0)} ${esc(w.units)} × ${esc(s.r)}</span></div>`).join('')||'<div class="mut">No sets logged</div>'}</div>`).join('')}
  <button class="btn bad full" data-act="delHist" data-id="${w.id}">Delete this workout</button>`;
},
progress({off=0}){
  const ws=weekStart(Date.now())-off*7*864e5;
  const wk=t=>db().history.filter(h=>h.date>=t&&h.date<t+7*864e5);
  const cur=wk(ws),prev=wk(ws-7*864e5);
  const plan=Store.activePlan();const planned=plan?plan.days.filter(d=>!d.rest&&d.exercises.length).length:0;
  const V=cur.reduce((s,w)=>s+vol(w),0),PV=prev.reduce((s,w)=>s+vol(w),0),S=cur.reduce((s,w)=>s+sets(w),0);
  const weeks=[...Array(8)].map((_,i)=>{const t=ws-(7-i)*7*864e5;return{t,v:wk(t).reduce((s,w)=>s+vol(w),0),n:wk(t).length}});
  const mx=Math.max(1,...weeks.map(x=>x.v));
  const best=list=>{const m={};list.forEach(w=>w.exercises.forEach(e=>e.sets.forEach(s=>{const b=m[e.name];const w1=+s.w||0,r=+s.r||0;if(!b||w1>b.w||(w1===b.w&&r>b.r))m[e.name]={w:w1,r}})));return m};
  const bc=best(cur),bp=best(prev);
  const end=new Date(ws+6*864e5);
  const pct=PV?Math.round((V-PV)/PV*100):null;
  return `<div class="between"><button class="btn" data-act="wk" data-o="${off+1}">‹</button><div style="text-align:center"><b>${off===0?'This week':off===1?'Last week':'Week of'}</b><div class="mut">${new Date(ws).toLocaleDateString(undefined,{month:'short',day:'numeric'})} – ${end.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</div></div><button class="btn" data-act="wk" data-o="${off-1}" ${off<=0?'disabled style="opacity:.3"':''}>›</button></div>
  <div class="grid3" style="margin-top:12px">
   <div class="card" style="margin:0"><div class="stat">${cur.length}<span class="mut" style="font-size:14px">/${planned||'–'}</span></div><div class="mut">Workouts</div></div>
   <div class="card" style="margin:0"><div class="stat">${S}</div><div class="mut">Sets</div></div>
   <div class="card" style="margin:0"><div class="stat" style="font-size:20px">${Math.round(V).toLocaleString()}</div><div class="mut">Volume ${U()}${pct!==null?` <span style="color:${pct>=0?'var(--acc)':'var(--bad)'}">${pct>=0?'+':''}${pct}%</span>`:''}</div></div></div>
  <div class="card"><h3>Volume, last 8 weeks</h3><div class="bars">${weeks.map((w,i)=>`<div class="${i===7?'cur':''}"><i style="height:${w.v/mx*100}%"></i>${new Date(w.t).toLocaleDateString(undefined,{month:'numeric',day:'numeric'})}</div>`).join('')}</div></div>
  <div class="card"><h3>Best sets this week</h3>${Object.keys(bc).length?Object.entries(bc).map(([n,b])=>{const p=bp[n];let ch='<span class="mut">new</span>';
    if(p){const d=b.w-p.w,dr=b.r-p.r;ch=d>0?`<span style="color:var(--acc)">+${d} ${U()}</span>`:d<0?`<span style="color:var(--bad)">${d} ${U()}</span>`:dr>0?`<span style="color:var(--acc)">+${dr} reps</span>`:dr<0?`<span style="color:var(--bad)">${dr} reps</span>`:'<span class="mut">same</span>'}
    return `<div class="between" style="padding:6px 0;border-bottom:1px solid #262a33"><span>${esc(n)}</span><span>${b.w} × ${b.r} · ${ch}</span></div>`}).join(''):'<div class="mut">No workouts logged this week.</div>'}</div>`;
},
settings(){
  return `<div class="card"><h3>Units</h3><div class="chips"><button class="chip ${U()==='lb'?'on':''}" data-act="units" data-v="lb">lb</button><button class="chip ${U()==='kg'?'on':''}" data-act="units" data-v="kg">kg</button></div>
  <div class="mut" style="margin-top:6px">Changes labels and progression steps. Saved numbers are not converted.</div></div>
  <div class="card"><div class="between"><div><h3 style="margin:0">Copy weight to later sets</h3><div class="mut">Changing a set's weight also fills in the sets after it that aren't done yet.</div></div><button class="chip ${db().settings.copyWeight!==false?'on':''}" data-act="copyW">${db().settings.copyWeight!==false?'On':'Off'}</button></div></div>
  <div class="card"><h3>Background</h3><div class="mut">Pick one of ours or use a photo from your phone.</div>
   <div class="bggrid"><button class="bgopt ${bgSettings().kind==='none'?'on':''}" data-act="bgNone">None</button>
   ${Object.entries(BGS).map(([k,v])=>`<button class="bgopt ${bgSettings().kind==='preset'&&bgSettings().id===k?'on':''}" style="background:${v}" data-act="bgPreset" data-id="${k}" aria-label="${k}"><span>${k}</span></button>`).join('')}
   <button class="bgopt ${bgSettings().kind==='custom'?'on':''}" data-act="bgPhoto" ${localStorage.getItem(BG_KEY)?`style="background:center/cover url('${localStorage.getItem(BG_KEY)}')"`:''}><span>📷 My photo</span></button></div>
   <input type="file" id="bgFile" accept="image/*" hidden>
   <label>Dim background: <b id="dimv">${Math.round(bgSettings().dim*100)}%</b></label><input type="range" id="dim" min="0" max="85" value="${Math.round(bgSettings().dim*100)}" style="padding:0">
  </div>
  <div class="card"><h3>Your data</h3><div class="mut">Everything is stored on this device only. Back it up to move it to another phone.</div>
  <button class="btn full" data-act="export">Export data (JSON)</button><button class="btn full" data-act="import">Import data</button><input type="file" id="file" accept="application/json,.json" hidden>
  <button class="btn full" data-act="importOld">Import history from my old workout app</button>
  <div class="mut" style="margin-top:6px">Works only on the same phone and browser where you used the old app. Your old app's data is never changed.</div>
  <button class="btn bad full" data-act="reset">Reset all data</button></div>
  <div class="card"><h3>About</h3><div class="mut">Simple Lift v${esc(APP_VERSION)} · free. No ads, no tracking, no account needed. Works offline. Add it to your home screen from your browser menu.</div></div>
  <div class="card" id="support" style="background:transparent;border:1px solid #262a33"><h3 style="font-size:16px">Support</h3><div class="mut">I made Simple Lift to be completely free, with no ads, and I'm trying to keep it free forever. If you ever want to chip in, it's totally optional and appreciated, but never expected.</div>
  ${/^https:\/\//.test(DONATE_URL)?`<a class="btn sm" style="display:inline-block;margin-top:10px;text-decoration:none" href="${esc(DONATE_URL)}" target="_blank" rel="noopener">Donate (optional)</a>`:''}</div>`;
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

function injHint(t){const r=parseInjuries(t);return t&&t.trim()?(r.words.length?`Understood: <b style="color:var(--acc)">${r.words.map(esc).join(', ')}</b>. Exercises that load these areas will be left out.`:"I didn't recognize a body part. Try words like shoulder, back, knee, hip, elbow, wrist, neck or ankle."):''}
function dayColor(d){return d&&d.color||'#4ade80'}
function workoutHome(plan){
  let sel=route.p.sel;if(sel==null||!plan.days[sel]){sel=nextDayIndex(plan);if(sel<0)sel=0}
  const d=plan.days[sel],c=dayColor(d);
  const tabs=`<div class="daytabs">${plan.days.map((x,j)=>`<button class="daytab ${j===sel?'on':''}" style="--dc:${esc(dayColor(x))}" data-act="selDay" data-i="${j}">${esc(x.name)}${x.rest?' 💤':''}</button>`).join('')}</div>`;
  if(!d)return tabs;
  let body=`<div class="card" style="border-top:4px solid ${esc(c)}"><div class="between"><div><div class="mut">${esc(plan.name)}${j0(plan,sel)}</div><h2 style="margin:2px 0">${esc(d.name)}</h2></div>
    <div style="display:flex;flex-direction:column;gap:6px"><button class="btn sm" data-act="editWorkout" data-i="${sel}">✎ Edit workout</button><button class="btn sm" data-act="chooser">+ New plan</button></div></div>`;
  if(d.rest)body+=`<div style="text-align:center;padding:24px 0"><div style="font-size:44px">💤</div><h3>Rest day</h3><div class="mut">Recover, stretch, go for a walk. Next workout tomorrow.</div></div></div>`;
  else if(!d.exercises.length)body+=`<div class="mut" style="padding:12px 0">No exercises yet. Tap "Edit workout" to add some.</div></div>`;
  else body+=`<div class="mut">${d.exercises.length} exercises · ${d.exercises.reduce((s,e)=>s+(+e.sets||0),0)} sets</div>
    <div style="margin:10px 0">${d.exercises.map(e=>{const g=suggest(e);return `<div class="between" style="padding:7px 0;border-bottom:1px solid #262a33"><span>${esc(e.name)}<br><small class="mut">${esc(g.t)}</small></span><span style="text-align:right">${e.sets}×${repTxt(e)}<br><small style="color:${esc(c)}">${g.w?esc(g.w)+' '+U():''}</small></span></div>`}).join('')}</div>
    <button class="btn full" style="background:${esc(c)};color:#0b0d10" data-act="start" data-i="${sel}">Start workout</button></div>`;
  return tabs+body+`<button class="btn full" data-act="chooser">+ New plan</button>`;
}
function j0(plan,sel){return sel===nextDayIndex(plan)?' · up next':''}
// Recommended weight: same rules as the original app's sug(): no history -> start weight ("Starting estimate" / "Bodyweight");
// last session hit top of rep range on all planned sets -> +5 (upper/db) or +10 (lower) lb; otherwise repeat weight.
function exType(e){return e.type||(isLower(e.name)?'lower':'upper')}
function suggest(e){const l=Store.lastFor(e.name,e.oldId);const start=e.weight===''||e.weight==null?0:+e.weight;
  if(!l||!l.sets.length){if(start)return{w:start,t:'Starting estimate',last:null};
    const g=startWeight(e.name,U());return{w:g,t:g?'Suggested start':'Bodyweight',last:null,guess:1}}
  const w=Math.max(...l.sets.map(s=>+s.w||0));const top=l.sets.length>=+e.sets&&l.sets.every(s=>+s.r>=+e.repMax);
  if(top&&w>0){const inc=step(exType(e)==='lower');return{w:w+inc,t:`Hit top of range last time → +${inc} ${U()}`,last:l,up:1}}
  return{w,t:'Repeat weight, aim for more reps',last:l}}
const chooserHTML=()=>`<div class="mut">Pick how you want to make your new plan. Your current plans stay saved.</div>`+`<button class="big" data-act="newPlan">✎ Build my own plan<small>Pick your days and exercises</small></button>
      <button class="big" data-act="ai">✦ Build with AI<small>Answer a few questions, get a plan made for you</small></button>
      <button class="big" data-act="paste">📷 Copy a workout from text or picture<small>Paste text or snap a photo or screenshot of a plan</small></button>`;
async function runOCR(file){const box=$('#ocrBox');box.hidden=false;const set=(p,m)=>{$('#ocrBar').style.width=Math.round(p*100)+'%';$('#ocrPct').textContent=Math.round(p*100)+'%';$('#ocrMsg').textContent=m+'…'};
  try{const t=await imageToText(file,set);const ta=$('#pasteText');ta.value=(ta.value.trim()?ta.value.trim()+'\n\n':'')+t;route.p.text=ta.value;$('#ocrMsg').textContent='Done. Check the text below, then tap "Make my plan".';$('#ocrPct').textContent='';ta.focus()}
  catch(e){box.hidden=true;alert('Picture reading failed: '+(e&&e.message||e))}}
/* ---------- data helpers ---------- */
const vol=w=>w.exercises.reduce((s,e)=>s+e.sets.reduce((a,x)=>a+(+x.w||0)*(+x.r||0),0),0);
const sets=w=>w.exercises.reduce((s,e)=>s+e.sets.length,0);
function weekStart(t){const d=new Date(t);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getTime()}
const newEx=()=>({id:Store.uid(),name:'',sets:3,repMin:8,repMax:12,weight:'',rest:90,note:''});
const clone=o=>JSON.parse(JSON.stringify(o));
function blankPlan(){return{id:Store.uid(),name:'My Plan',created:Date.now(),next:0,days:[{id:Store.uid(),name:'Day 1',rest:false,exercises:[newEx()]}]}}
const swap=(a,i,j)=>{if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]]};

function startWorkout(i){
  const plan=Store.activePlan(),d=plan.days[i];
  const ex=d.exercises.filter(e=>e.name.trim()).map(e=>{
    const g=suggest(e),last=g.last,lower=exType(e)==='lower';
    const w=g.w||'',r=g.up||!last?(+e.repMin||8):(+last.sets[0].r||+e.repMin||8);
    const lastTxt=last?last.sets.map(s=>`${s.w||0}×${s.r}`).join(', '):'',sugg=g.guess&&g.w?`Suggested start: ${g.w} ${U()} · a beginner estimate, edit if too light or heavy`:`Recommended: ${g.w?g.w+' '+U():'bodyweight'} · ${g.t}`;
    return{oldId:e.oldId,type:e.type,name:e.name,lower,repMin:+e.repMin,repMax:+e.repMax,rest:+e.rest||60,note:e.note,last:lastTxt,sugg,sets:[...Array(Math.max(1,+e.sets||1))].map(()=>({w,r,done:false,ws:'s'}))}});
  if(!ex.length){toast('Add exercises to this day first');return}
  db().active={id:Store.uid(),planId:plan.id,planName:plan.name,dayIndex:i,dayName:d.name,started:Date.now(),exercises:ex};Store.save();go('session');
}
function finishWorkout(){
  const a=db().active;
  const exs=a.exercises.map(e=>({name:e.name,oldId:e.oldId,type:e.type,lower:e.lower,sets:e.sets.filter(s=>s.done).map(s=>({w:+s.w||0,r:+s.r||0}))})).filter(e=>e.sets.length);
  if(!exs.length&&!confirm('No sets are marked done. Finish anyway? Nothing will be saved.'))return;
  if(exs.length)Store.addHistory({id:a.id,date:Date.now(),planId:a.planId,planName:a.planName,dayName:a.dayName,units:U(),minutes:Math.round((Date.now()-a.started)/6e4),exercises:exs});
  const p=Store.plan(a.planId);if(p){p.next=(a.dayIndex+1)%p.days.length;Store.upsertPlan(p)}
  db().active=null;Store.save();stopTimer();stack=[];toast(exs.length?'Workout saved 💪':'Workout closed');go('history',{},false);
}

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
const ACT={
 resume:()=>go('session'),start:b=>startWorkout(+b.dataset.i),
 newPlan:()=>{draft=blankPlan();draft._new=1;go('editor')},
 editActive:()=>{draft=clone(Store.activePlan());go('editor')},
 edit:b=>{draft=clone(Store.plan(b.dataset.id));go('editor')},
 dup:b=>{const p=clone(Store.plan(b.dataset.id));p.id=Store.uid();p.name+=' (copy)';Store.upsertPlan(p);render()},
 activate:b=>{Store.setActive(b.dataset.id);toast('Active plan changed');render()},
 delPlan:b=>{if(confirm('Delete this plan? Your history is kept.')){Store.deletePlan(b.dataset.id);render()}},
 openDay:b=>go('day',{i:+b.dataset.i}),
 dayUp:b=>{swap(draft.days,+b.dataset.i,+b.dataset.i-1);render()},dayDown:b=>{swap(draft.days,+b.dataset.i,+b.dataset.i+1);render()},
 addDay:()=>{draft.days.push({id:Store.uid(),name:'Day '+(draft.days.filter(d=>!d.rest).length+1),rest:false,exercises:[newEx()]});go('day',{i:draft.days.length-1})},
 addRest:()=>{draft.days.push({id:Store.uid(),name:'Rest',rest:true,exercises:[]});render()},
 savePlan:()=>{if(!draft.name.trim())draft.name='My Plan';draft.days.forEach(d=>d.exercises=d.exercises.filter(e=>e.name.trim()));
   if(!draft.days.length){toast('Add at least one day');return}
   const isNew=draft._new;delete draft._new;delete draft._issues;delete draft._cr;Store.upsertPlan(draft);if(isNew)Store.setActive(draft.id);toast('Plan saved');stack=[];go(isNew?'home':'plans',{},false)},
 toggleRest:()=>{const d=draft.days[route.p.i];d.rest=!d.rest;if(!d.rest&&!d.exercises.length)d.exercises.push(newEx());render()},
 exAdd:()=>{draft.days[route.p.i].exercises.push(newEx());render();const ins=document.querySelectorAll('[data-ac]');ins[ins.length-1]?.focus()},
 exDel:b=>{draft.days[route.p.i].exercises.splice(+b.dataset.j,1);render()},
 exUp:b=>{swap(draft.days[route.p.i].exercises,+b.dataset.j,+b.dataset.j-1);render()},exDown:b=>{swap(draft.days[route.p.i].exercises,+b.dataset.j,+b.dataset.j+1);render()},
 dayDup:()=>{const d=clone(draft.days[route.p.i]);d.id=Store.uid();d.name+=' copy';d.exercises.forEach(e=>e.id=Store.uid());draft.days.splice(route.p.i+1,0,d);back()},
 dayDel:()=>{if(confirm('Delete this day?')){draft.days.splice(route.p.i,1);back()}},
 back:()=>back(),
 selDay:b=>{route.p.sel=+b.dataset.i;render();document.querySelector('.daytab.on')?.scrollIntoView({inline:'center',block:'nearest'})},
 editWorkout:b=>{draft=clone(Store.activePlan());go('day',{i:+b.dataset.i,direct:1})},
 setColor:b=>{draft.days[route.p.i].color=b.dataset.c;render()},
 colorAll:()=>{const c=dayColor(draft.days[route.p.i]);draft.days.forEach(d=>d.color=c);toast('Color applied to all days')},
 saveDay:()=>{draft.days.forEach(d=>d.exercises=d.exercises.filter(e=>e.name.trim()));Store.upsertPlan(draft);toast('Workout saved');const i=route.p.i;back();route.p.sel=Math.min(i,draft.days.length-1);render();scrollTo(0,0)},
 bgNone:()=>{setBg({kind:'none'});render()},
 bgPreset:b=>{setBg({kind:'preset',id:b.dataset.id});render()},
 bgPhoto:()=>{const f=$('#bgFile');f.value='';f.onchange=async()=>{try{const u=await loadBgFile(f.files[0]);try{localStorage.setItem(BG_KEY,u)}catch(e){throw new Error('Not enough space on this device to save that picture. Try a smaller one.')}setBg({kind:'custom'});toast('Background set');render()}catch(e){alert(e.message)}};f.click()},
 importOld:async()=>{const r=await importOldApp();showOldResult(r,true)},
 paste:()=>go('paste'),
 chooser:()=>go('chooser'),
 pickPic:()=>{const f=$('#picFile');f.value='';f.onchange=()=>f.files[0]&&runOCR(f.files[0]);f.click()},
 takePic:()=>{const f=$('#camFile');f.value='';f.onchange=()=>f.files[0]&&runOCR(f.files[0]);f.click()},
 applyCR:async()=>{const t=$('#crText').value;if(!t.trim()){toast('Type a change first');return}const r=await requestPlanChanges(draft,t);
   const keep={_new:draft._new,_issues:draft._issues};draft=Object.assign(r.plan,keep);draft._cr={changes:r.changes,notUnderstood:r.notUnderstood};render();
   setTimeout(()=>document.querySelector('#crText')?.closest('.card').scrollIntoView({block:'start'}),30)},
 parse:async()=>{const t=$('#pasteText').value;if(!t.trim()){toast('Paste text or choose a picture first');return}route.p.text=t;
   const r=await parseTextPlan(t);if(!r.plan.days.length){alert("I couldn't find any exercises in that text. Try lines like 'Bench press 4x8-10'.");return}
   draft=r.plan;draft._new=1;draft._issues={unparsed:r.unparsed,skipped:r.skipped,days:r.plan.days.filter(d=>!d.rest).length,count:r.plan.days.reduce((s,d)=>s+d.exercises.length,0)};go('editor')},
 ai:()=>{ai={step:0,a:{injuries:'',focus:[]}};go('ai')},
 aiOwn:()=>{const tx=$('#aiText');if(tx)ai.a[AI_STEPS[ai.step].key]=tx.value;go('aiprompt')},
 aiCopy:async()=>{const ta=$('#aiPrompt');ta.focus();ta.select();ta.setSelectionRange(0,ta.value.length);let ok=false;
   try{await navigator.clipboard.writeText(ta.value);ok=true}catch(e){try{ok=document.execCommand('copy')}catch(_){}}
   toast(ok?'Prompt copied. Paste it into your AI chat.':'Text selected. Long-press it and tap Copy.')},
 aiToPaste:()=>go('aipaste'),
 aiPick:async b=>{const s=AI_STEPS[ai.step];let v=b.dataset.v;if(typeof s.opts[0][0]==='number')v=+v;
   if(s.multi){let arr=ai.a[s.key];if(v==='none')arr=[];else{arr=arr.includes(v)?arr.filter(x=>x!==v):[...arr,v];if(s.key==='focus'&&arr.length>3)arr.shift()}ai.a[s.key]=arr;render();return}
   ai.a[s.key]=v;ai.step++;render()},
 aiPrev:()=>{const tx=$('#aiText');if(tx)ai.a[AI_STEPS[ai.step].key]=tx.value;ai.step--;render()},
 aiNext:async()=>{const tx=$('#aiText');if(tx)ai.a[AI_STEPS[ai.step].key]=tx.value;if(ai.step<AI_STEPS.length-1){ai.step++;render();return}
   draft=await generatePlan(ai.a);draft._new=1;stack=[{v:'home',p:{}}];go('editor',{},false);toast('Plan ready. Tweak anything, then save.')},
 stp:(b,e,mult=1)=>{if(e&&e.type==='click'&&holdUntil>Date.now())return; // pointer already handled it
   const s=db().active.exercises[+b.dataset.j].sets[+b.dataset.k],f=b.dataset.f,d=+b.dataset.d;
   const inc=(f==='w'?(U()==='kg'?2.5:5):1)*mult;s[f]=Math.max(0,Math.round(((+s[f]||0)+d*inc)*10)/10);Store.save();
   b.parentNode.querySelector('input').value=s[f];if(f==='w'){s.ws='m';b.parentNode.querySelector('input').classList.remove('sugw');cascadeW(+b.dataset.j,+b.dataset.k);Store.save()}},
 setDone:b=>{const e=db().active.exercises[+b.dataset.j],s=e.sets[+b.dataset.k];s.done=!s.done;if(s.done&&s.ws==='s')s.ws='m';Store.save();render();if(s.done)startTimer(e.rest)},
 setAdd:b=>{const e=db().active.exercises[+b.dataset.j],l=e.sets[e.sets.length-1];e.sets.push({w:l.w,r:l.r,done:false,ws:l.ws==='s'?'s':'c'});Store.save();render()},
 setDel:b=>{db().active.exercises[+b.dataset.j].sets.pop();Store.save();render()},
 finish:finishWorkout,
 discard:()=>{if(confirm('Discard this workout? Nothing will be saved.')){db().active=null;Store.save();stopTimer();tab('home')}},
 t15:()=>{timer.end+=15000;renderTimer()},tskip:stopTimer,
 openHist:b=>go('hist',{id:b.dataset.id}),
 delHist:b=>{if(confirm('Delete this workout from history?')){Store.deleteHistory(b.dataset.id);back()}},
 wk:b=>{route.p.off=Math.max(0,+b.dataset.o);render()},
 copyW:()=>{db().settings.copyWeight=db().settings.copyWeight===false;Store.save();render()},
 units:b=>{db().settings.units=b.dataset.v;db().settings.unitsChosen=true;Store.save();render()},
 export:()=>{const blob=new Blob([Store.exportJSON()],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`simplelift-backup-${new Date().toISOString().slice(0,10)}.json`;a.click()},
 import:()=>{const f=$('#file');f.onchange=()=>{const r=new FileReader();r.onload=()=>{try{Store.importJSON(r.result);applyBg();toast('Data imported');tab('home')}catch(e){alert('Import failed: '+e.message)}};r.readAsText(f.files[0])};f.click()},
 reset:()=>{if(confirm('Erase ALL plans, history and settings on this device?')&&confirm('Are you sure? This cannot be undone.')){Store.reset();localStorage.removeItem(BG_KEY);applyBg();stopTimer();tab('home');toast('All data reset')}}
};
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
    if(!ex.rest||ex.rest===90)ex.rest=L.compound?120:60;render();return}
  if(!e.target.closest('.ac'))document.querySelectorAll('.aclist').forEach(x=>x.hidden=true);
  const b=e.target.closest('[data-act]');if(b&&!b.disabled&&ACT[b.dataset.act])ACT[b.dataset.act](b,e)});
document.addEventListener('change',e=>{if(e.target.id==='customColor'){draft.days[route.p.i].color=e.target.value;render()}});
document.addEventListener('input',e=>{
  if(e.target.id==='aiChanges'){ai.changes=e.target.value;const p=$('#aiPrompt');if(p)p.value=buildAIPrompt(ai.a,ai.changes);return}
  if(e.target.id==='dim'){const v=+e.target.value;$('#dimv').textContent=v+'%';setBg({dim:v/100});return}
  if(e.target.id==='aiText'){$('#injHint').innerHTML=injHint(e.target.value);return}
  const k=e.target.dataset.bind;if(!k)return;const v=e.target.value,parts=k.split('.');
  if(parts[0]==='name')draft.name=v;
  else if(parts[0]==='notes')draft.notes=v;
  else if(parts[0]==='day')draft.days[route.p.i].name=v;
  else if(parts[0]==='ex'){const ex=draft.days[route.p.i].exercises[+parts[1]],f=parts[2];ex[f]=['sets','repMin','repMax','rest'].includes(f)?(v===''?'':+v):f==='weight'?(v===''?'':+v):v;
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
  if(r.workouts||r.plan)alert(`Imported from your old workout app: ${r.workouts} workout${r.workouts===1?'':'s'} (${r.sets} sets)${r.plan?' and your original plan':''}. Your last weights and recommendations now use this history.`);
  else if(manual)alert(r.found?'Everything from your old workout app is already imported. Nothing new to add.':"No history from the old workout app was found in this browser. It can only be read on the same phone and browser where you used the old app (at alexroyandrew1-crypto.github.io/workout). If you used it on another phone, open Simple Lift there and import it on that phone.");
  render()}
applyBg();
if(db().active)route={v:'home',p:{}};
if(!db().oldImportChecked&&oldHasData())importOldApp().then(r=>showOldResult(r,false));
render();
if('serviceWorker' in navigator){const had=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(r=>r.update()).catch(()=>{});
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!had||$('#updbar'))return;const b=document.createElement('button');b.id='updbar';b.className='updbar';b.textContent='Simple Lift was updated. Tap to reload';b.onclick=()=>location.reload();document.body.appendChild(b)})}
