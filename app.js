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

const TITLES={home:'Simple Lift',plans:'My Plans',editor:'Edit Plan',day:'Edit Day',ai:'Build with AI',session:'Workout',history:'History',hist:'Workout',progress:'Progress',settings:'Settings'};
function render(){
  const v=route.v;$('#title').textContent=TITLES[v]||'Simple Lift';
  $('#back').style.visibility=stack.length?'visible':'hidden';
  const root={home:'home',plans:'plans',editor:'plans',day:'plans',ai:'home',session:'home',history:'history',hist:'history',progress:'progress',settings:'settings'}[v];
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
home(){
  const a=db().active;const plan=Store.activePlan();let h='';
  if(a)h+=`<button class="big acc" data-act="resume">Resume workout<small>${esc(a.dayName)} · in progress</small></button>`;
  else if(plan){const i=nextDayIndex(plan);
    if(i>=0){const d=plan.days[i];h+=`<div class="card"><div class="mut">Next workout · ${esc(plan.name)}</div><h2>${esc(d.name)}</h2>
      <div class="mut">${d.exercises.length} exercises · ${d.exercises.reduce((s,e)=>s+(+e.sets||0),0)} sets</div>
      <div style="margin:10px 0">${d.exercises.map(e=>`<div class="between"><span>${esc(e.name)}</span><span class="mut">${e.sets}×${repTxt(e)}</span></div>`).join('')}</div>
      <button class="btn acc full" data-act="start" data-i="${i}">Start workout</button></div>`}
    h+=`<div class="card"><div class="between"><h3>${esc(plan.name)}</h3><button class="btn sm" data-act="editActive">Edit</button></div>
      <div class="chips" style="margin-top:6px">${plan.days.map((d,j)=>`<button class="chip ${j===i?'on':''}" data-act="start" data-i="${j}" ${d.rest||!d.exercises.length?'disabled':''}>${esc(d.name)}</button>`).join('')}</div>
      <div class="mut" style="margin-top:8px">Tap any day to start it instead.</div></div>`}
  h+=`<button class="big" data-act="newPlan">✎ Build my own plan<small>Pick your days and exercises</small></button>
      <button class="big" data-act="ai">✦ Build with AI<small>Answer a few questions, get a plan made for you</small></button>`;
  return h;
},
plans(){
  const ps=db().plans;
  return (ps.length?ps.map(p=>`<div class="card"><div class="between"><div><h3>${esc(p.name)}</h3><div class="mut">${p.days.filter(d=>!d.rest).length} workout days · ${p.days.length} total</div></div>
    ${p.id===db().activePlanId?'<span class="tag">Active</span>':`<button class="btn sm" data-act="activate" data-id="${p.id}">Use</button>`}</div>
    <div class="row" style="margin-top:10px"><button class="btn grow" data-act="edit" data-id="${p.id}">Edit</button><button class="btn" data-act="dup" data-id="${p.id}">Copy</button><button class="btn bad" data-act="delPlan" data-id="${p.id}">Delete</button></div></div>`).join('')
    :`<div class="card mut">No plans yet. Create one below.</div>`)+
    `<button class="big" data-act="newPlan">✎ Build my own plan</button><button class="big" data-act="ai">✦ Build with AI</button>`;
},
editor(){
  const p=draft;
  return `<label>Plan name</label><input data-bind="name" value="${esc(p.name)}" placeholder="My plan">
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
  <div class="grid2" style="margin-top:10px"><button class="btn" data-act="dayDup">Duplicate day</button><button class="btn bad" data-act="dayDel">Delete day</button></div>
  <button class="btn acc full" data-act="back">Done</button>`;
},
ai(){
  const S=AI_STEPS,s=S[ai.step];
  const val=ai.a[s.key];
  const on=v=>s.multi?(val||[]).includes(v):val==v;
  return `<div class="mut">Step ${ai.step+1} of ${S.length}</div><div class="progress"><i style="width:${(ai.step+1)/S.length*100}%"></i></div>
  <h2>${esc(s.q)}</h2>${s.hint?`<div class="mut">${esc(s.hint)}</div>`:''}
  <div style="margin-top:12px">${s.opts.map(([v,l,d])=>`<button class="big ${on(v)?'acc':''}" style="padding:16px 18px;font-size:17px" data-act="aiPick" data-v="${esc(v)}">${esc(l)}${d?`<small>${esc(d)}</small>`:''}</button>`).join('')}</div>
  <div class="grid2">${ai.step?'<button class="btn" data-act="aiPrev">Back</button>':'<span></span>'}
  ${s.multi?`<button class="btn acc" data-act="aiNext">${ai.step===S.length-1?'Build my plan':'Next'}</button>`:''}</div>`;
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
      <div class="step"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="w" data-d="-1">−</button><input type="number" inputmode="decimal" data-bind="set.${j}.${k}.w" value="${esc(s.w)}"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="w" data-d="1">+</button></div>
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
  <div class="card"><h3>Your data</h3><div class="mut">Everything is stored on this device only. Back it up to move it to another phone.</div>
  <button class="btn full" data-act="export">Export data (JSON)</button><button class="btn full" data-act="import">Import data</button><input type="file" id="file" accept="application/json,.json" hidden>
  <button class="btn bad full" data-act="reset">Reset all data</button></div>
  <div class="card"><h3>About</h3><div class="mut">Simple Lift v1 · free, no ads, no account needed. Works offline. Add it to your home screen from your browser menu.</div></div>`;
}};

const AI_STEPS=[
 {key:'goal',q:'What is your main goal?',opts:[['muscle','Build muscle','Size and shape'],['strength','Get stronger','Lift heavier'],['general','General fitness','Feel good, stay healthy'],['fatloss','Lose fat','Keep muscle, burn more']]},
 {key:'experience',q:'How long have you been lifting?',opts:[['beginner','Beginner','Under 1 year'],['intermediate','Intermediate','1–3 years'],['advanced','Advanced','3+ years']]},
 {key:'days',q:'How many days a week can you train?',opts:[[2,'2 days'],[3,'3 days'],[4,'4 days'],[5,'5 days'],[6,'6 days']]},
 {key:'minutes',q:'How long is each session?',opts:[[30,'30 minutes'],[45,'45 minutes'],[60,'60 minutes'],[75,'75 minutes']]},
 {key:'equipment',q:'What equipment do you have?',opts:[['full','Full gym'],['machines','Machines & cables only'],['dumbbells','Dumbbells only'],['bodyweight','Bodyweight only']]},
 {key:'avoid',multi:1,q:'Any injuries or areas to avoid?',hint:'Pick all that apply, or none.',opts:[['shoulder','Shoulder'],['back','Lower back'],['knee','Knee'],['none','None']]},
 {key:'focus',multi:1,q:'Any muscles you want to focus on?',hint:'Optional. Pick up to 3.',opts:[['chest','Chest'],['back','Back'],['shoulders','Shoulders'],['biceps','Arms (biceps)'],['triceps','Arms (triceps)'],['quads','Legs (quads)'],['glutes','Glutes'],['core','Core']]}
];

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
    const last=Store.lastFor(e.name),lower=isLower(e.name);
    let w=e.weight===''||e.weight==null?'':+e.weight,r=+e.repMin||8,sugg='',lastTxt='';
    if(last&&last.sets.length){const top=Math.max(...last.sets.map(s=>+s.w||0));w=top;r=+last.sets[0].r||r;
      lastTxt=last.sets.map(s=>`${s.w||0}×${s.r}`).join(', ');
      if(last.sets.length>=+e.sets&&last.sets.every(s=>+s.r>=+e.repMax)&&top>0){w=top+step(lower);r=+e.repMin;sugg=`You hit ${e.repMax} reps on every set last time. Try ${w} ${U()}.`}}
    return{name:e.name,lower,repMin:+e.repMin,repMax:+e.repMax,rest:+e.rest||60,note:e.note,last:lastTxt,sugg,sets:[...Array(Math.max(1,+e.sets||1))].map(()=>({w,r,done:false}))}});
  if(!ex.length){toast('Add exercises to this day first');return}
  db().active={id:Store.uid(),planId:plan.id,planName:plan.name,dayIndex:i,dayName:d.name,started:Date.now(),exercises:ex};Store.save();go('session');
}
function finishWorkout(){
  const a=db().active;
  const exs=a.exercises.map(e=>({name:e.name,lower:e.lower,sets:e.sets.filter(s=>s.done).map(s=>({w:+s.w||0,r:+s.r||0}))})).filter(e=>e.sets.length);
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
   const isNew=draft._new;delete draft._new;Store.upsertPlan(draft);if(isNew)Store.setActive(draft.id);toast('Plan saved');stack=[];go(isNew?'home':'plans',{},false)},
 toggleRest:()=>{const d=draft.days[route.p.i];d.rest=!d.rest;if(!d.rest&&!d.exercises.length)d.exercises.push(newEx());render()},
 exAdd:()=>{draft.days[route.p.i].exercises.push(newEx());render();const ins=document.querySelectorAll('[data-ac]');ins[ins.length-1]?.focus()},
 exDel:b=>{draft.days[route.p.i].exercises.splice(+b.dataset.j,1);render()},
 exUp:b=>{swap(draft.days[route.p.i].exercises,+b.dataset.j,+b.dataset.j-1);render()},exDown:b=>{swap(draft.days[route.p.i].exercises,+b.dataset.j,+b.dataset.j+1);render()},
 dayDup:()=>{const d=clone(draft.days[route.p.i]);d.id=Store.uid();d.name+=' copy';d.exercises.forEach(e=>e.id=Store.uid());draft.days.splice(route.p.i+1,0,d);back()},
 dayDel:()=>{if(confirm('Delete this day?')){draft.days.splice(route.p.i,1);back()}},
 back:()=>back(),
 ai:()=>{ai={step:0,a:{avoid:[],focus:[]}};go('ai')},
 aiPick:async b=>{const s=AI_STEPS[ai.step];let v=b.dataset.v;if(typeof s.opts[0][0]==='number')v=+v;
   if(s.multi){let arr=ai.a[s.key];if(v==='none')arr=[];else{arr=arr.includes(v)?arr.filter(x=>x!==v):[...arr,v];if(s.key==='focus'&&arr.length>3)arr.shift()}ai.a[s.key]=arr;render();return}
   ai.a[s.key]=v;ai.step++;render()},
 aiPrev:()=>{ai.step--;render()},
 aiNext:async()=>{if(ai.step<AI_STEPS.length-1){ai.step++;render();return}
   draft=await generatePlan(ai.a);draft._new=1;stack=[{v:'home',p:{}}];go('editor',{},false);toast('Plan ready. Tweak anything, then save.')},
 stp:b=>{const s=db().active.exercises[+b.dataset.j].sets[+b.dataset.k],f=b.dataset.f,d=+b.dataset.d;
   const inc=f==='w'?(U()==='kg'?2.5:5):1;s[f]=Math.max(0,Math.round(((+s[f]||0)+d*inc)*10)/10);Store.save();
   b.parentNode.querySelector('input').value=s[f]},
 setDone:b=>{const e=db().active.exercises[+b.dataset.j],s=e.sets[+b.dataset.k];s.done=!s.done;Store.save();render();if(s.done)startTimer(e.rest)},
 setAdd:b=>{const e=db().active.exercises[+b.dataset.j],l=e.sets[e.sets.length-1];e.sets.push({w:l.w,r:l.r,done:false});Store.save();render()},
 setDel:b=>{db().active.exercises[+b.dataset.j].sets.pop();Store.save();render()},
 finish:finishWorkout,
 discard:()=>{if(confirm('Discard this workout? Nothing will be saved.')){db().active=null;Store.save();stopTimer();tab('home')}},
 t15:()=>{timer.end+=15000;renderTimer()},tskip:stopTimer,
 openHist:b=>go('hist',{id:b.dataset.id}),
 delHist:b=>{if(confirm('Delete this workout from history?')){Store.deleteHistory(b.dataset.id);back()}},
 wk:b=>{route.p.off=Math.max(0,+b.dataset.o);render()},
 units:b=>{db().settings.units=b.dataset.v;Store.save();render()},
 export:()=>{const blob=new Blob([Store.exportJSON()],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`simplelift-backup-${new Date().toISOString().slice(0,10)}.json`;a.click()},
 import:()=>{const f=$('#file');f.onchange=()=>{const r=new FileReader();r.onload=()=>{try{Store.importJSON(r.result);toast('Data imported');tab('home')}catch(e){alert('Import failed: '+e.message)}};r.readAsText(f.files[0])};f.click()},
 reset:()=>{if(confirm('Erase ALL plans, history and settings on this device?')&&confirm('Are you sure? This cannot be undone.')){Store.reset();stopTimer();tab('home');toast('All data reset')}}
};
document.addEventListener('click',e=>{
  const pick=e.target.closest('[data-pick]');
  if(pick){const j=+pick.dataset.pick,ex=draft.days[route.p.i].exercises[j],L=libFind(pick.dataset.name);ex.name=L.name;
    if(!ex.rest||ex.rest===90)ex.rest=L.compound?120:60;render();return}
  if(!e.target.closest('.ac'))document.querySelectorAll('.aclist').forEach(x=>x.hidden=true);
  const b=e.target.closest('[data-act]');if(b&&!b.disabled&&ACT[b.dataset.act])ACT[b.dataset.act](b,e)});
document.addEventListener('input',e=>{
  const k=e.target.dataset.bind;if(!k)return;const v=e.target.value,parts=k.split('.');
  if(parts[0]==='name')draft.name=v;
  else if(parts[0]==='day')draft.days[route.p.i].name=v;
  else if(parts[0]==='ex'){const ex=draft.days[route.p.i].exercises[+parts[1]],f=parts[2];ex[f]=['sets','repMin','repMax','rest'].includes(f)?(v===''?'':+v):f==='weight'?(v===''?'':+v):v;
    if(f==='name')showAC(+parts[1],v)}
  else if(parts[0]==='set'){const s=db().active.exercises[+parts[1]].sets[+parts[2]];s[parts[3]]=v===''?'':+v;Store.save()}
});
function showAC(j,q){const box=$('#ac'+j);q=q.trim().toLowerCase();
  if(!q){box.hidden=true;return}
  const words=q.split(/\s+/);
  const m=LIBRARY.filter(x=>{const s=(x.name+' '+x.muscle+' '+x.equip).toLowerCase();return words.every(w=>s.includes(w))}).slice(0,8);
  if(!m.length||(m.length===1&&m[0].name.toLowerCase()===q)){box.hidden=true;return}
  box.innerHTML=m.map(x=>`<div data-pick="${j}" data-name="${esc(x.name)}">${esc(x.name)} <small>· ${esc(x.muscle)} · ${esc(x.equip)}</small></div>`).join('');box.hidden=false}

if(db().active)route={v:'home',p:{}};
render();
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
