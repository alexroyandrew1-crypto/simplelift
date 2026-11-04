// ===== Garmin watch link (manual copy/paste codes) =====
// Plan -> watch:  SL1~Title~Name,sets,reps,weightLb,restSec~...   (reps/weights may be "/" per-set lists; read by simplelift-garmin/source/Workout.mc)
// Watch -> app:   SR1~Title~N@w1/w2/...~N@w~...  one item per exercise in the same order; N = sets checked on the watch
//                 (always the first N, the watch checks sets in order), weights in lb, a single weight means all sets.
const wClean=s=>String(s||'').replace(/[~,@\/]/g,' ').replace(/\s+/g,' ').trim().slice(0,40);
const toLb=v=>Math.round(U()==='kg'?(+v||0)/0.4536:(+v||0));
const fromLb=v=>U()==='kg'?Math.round(v*0.4536/2.5)*2.5:v;
const tKey=s=>wClean(s).replace(/\s+/g,'').toLowerCase();
const joinPer=a=>a.every(x=>x===a[0])?String(a[0]):a.join('/');
function watchCode(plan,i){
  const d=plan.days[i],a=db().active,live=a&&a.planId===plan.id&&a.dayIndex===i;
  const title=wClean(d.name)||'Workout';
  const items=d.exercises.filter(e=>e.name.trim()).map((e,j)=>{
    let reps,ws,n;
    const le=live?a.exercises.find(x=>x.name===e.name):null;
    if(le){n=le.sets.length;reps=le.sets.map(s=>+s.r||+e.repMin||8);ws=le.sets.map(s=>toLb(s.w))}
    else{n=Math.max(1,Math.min(10,+e.sets||3));const g=suggest(e);reps=Array(n).fill(+e.repMin||8);ws=Array(n).fill(toLb(g.w))}
    return [wClean(e.name),n,joinPer(reps),joinPer(ws),Math.round(restOf(e))].join(',')});
  return {code:['SL1',title,...items].join('~'),title,names:d.exercises.filter(e=>e.name.trim()).map(e=>e.name)}}
function parseResult(t){
  const m=String(t||'').replace(/\s+/g,'').match(/SR1~[^\s]*/i);if(!m)return null;
  const p=m[0].split('~');if(p.length<3)return null;
  const ex=p.slice(2).map(x=>{const q=x.match(/^(\d{1,2})@([\d\/]+)$/);if(!q)return null;return{n:+q[1],w:q[2].split('/').map(Number)}});
  if(ex.some(x=>!x))return null;return{title:p[1],ex}}
// Apply a watch result: fills the matching in-progress workout, or logs it as a finished workout so progression picks it up.
function applyResult(r){
  const link=db().watch||{};const plan=Store.plan(link.planId)||Store.activePlan();if(!plan)throw new Error(t('wr.noPlan'));
  let i=link.planId===plan.id&&plan.days[link.dayIndex]&&tKey(plan.days[link.dayIndex].name)===tKey(r.title)?link.dayIndex:plan.days.findIndex(d=>tKey(d.name)===tKey(r.title));
  if(i<0)throw new Error(t('wr.noDay',{title:r.title}));
  const day=plan.days[i],exs=day.exercises.filter(e=>e.name.trim());
  if(exs.length!==r.ex.length)throw new Error(t('wr.count',{a:r.ex.length,day:day.name,b:exs.length}));
  const wAt=(x,k)=>fromLb(x.w[Math.min(k,x.w.length-1)]);
  let a=db().active;
  if(a&&a.planId===plan.id&&a.dayIndex===i){let c=0;
    a.exercises.forEach(le=>{const j=exs.findIndex(e=>e.name===le.name);if(j<0)return;const x=r.ex[j];
      le.sets.forEach((s,k)=>{s.w=wAt(x,k);if(k<x.n){if(!s.done)c++;s.done=true;s.ws='m'}else if(!s.done)s.ws='c'})});
    Store.save();return{mode:'live',msg:t('wr.live',{n:c})}}
  const out=exs.map((e,j)=>{const x=r.ex[j];return{name:e.name,oldId:e.oldId,type:e.type,lower:exType(e)==='lower',sets:[...Array(x.n)].map((_,k)=>({w:+wAt(x,k)||0,r:+e.repMin||8}))}}).filter(e=>e.sets.length);
  if(!out.length)throw new Error(t('wr.none'));
  Store.addHistory({id:Store.uid(),date:Date.now(),planId:plan.id,planName:plan.name,dayName:day.name,units:U(),minutes:0,fromWatch:true,exercises:out});
  if(plan.next===i)plan.next=(i+1)%plan.days.length;Store.upsertPlan(plan);
  return{mode:'log',msg:t('wr.log',{day:day.name,n:out.reduce((s,e)=>s+e.sets.length,0)})}}
