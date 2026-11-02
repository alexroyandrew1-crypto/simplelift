// Import history from the original workout app (same origin: alexroyandrew1-crypto.github.io).
// Reads its localStorage keys READ-ONLY: wlog_v1 = {exerciseId:[{date:'locale date',sets:[{w,r}]}]},
// wplan_v1 = {days:[{id,name,exercises:[{id,name,sets,reps:[min,max],type:'upper|lower|db',start,rest,note}]}]}.
// Never writes or deletes those keys. Re-running only adds entries not imported before.
const OLD_PLAN_URLS=['../workout/plan.json','/workout/plan.json'];
function oldHasData(){try{const l=JSON.parse(localStorage.getItem('wlog_v1')||'{}');return Object.values(l).some(a=>Array.isArray(a)&&a.length)}catch(e){return false}}
async function oldPlan(){try{const p=JSON.parse(localStorage.getItem('wplan_v1')||'null');if(p&&p.days)return p}catch(e){}
  for(const u of OLD_PLAN_URLS){try{const r=await fetch(u,{cache:'no-cache'});if(r.ok){const p=await r.json();if(p&&p.days)return p}}catch(e){}}return null}
function oldDate(s,i){if(/^\d{4}-\d{2}-\d{2}$/.test(s))return new Date(s+'T12:00').getTime();
  let m=String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(m)return new Date(+m[3],+m[1]-1,+m[2],12).getTime(); // en-US M/D/YYYY (the old app's usual format)
  const t=Date.parse(s);return isNaN(t)?Date.now()-i*864e5:t}
const restToSec=r=>{const m=String(r||'').match(/(\d+(?:\.\d+)?)\s*(s|sec|min|m)?/i);if(!m)return 90;const v=+m[1];return Math.round(/^s/i.test(m[2]||'')?v:v*60)};
async function importOldApp(){
  let log;try{log=JSON.parse(localStorage.getItem('wlog_v1')||'{}')}catch(e){log={}}
  const res={found:false,workouts:0,sets:0,plan:false};
  if(!oldHasData()){Store.db.oldImportChecked=true;Store.save();return res}
  const plan=await oldPlan();const exById={},dayById={};
  if(plan)plan.days.forEach(d=>(d.exercises||[]).forEach(e=>{exById[e.id]=e;dayById[e.id]=d.name}));
  const db=Store.db;db.oldImported=db.oldImported||{};
  // copy the old plan once, so its start weights, rep ranges and ids carry over
  if(plan&&!db.plans.some(p=>p.fromOld)){
    const np={id:Store.uid(),name:'My original plan',fromOld:true,created:Date.now(),next:0,notes:plan.notes||'',days:plan.days.map(d=>({id:Store.uid(),name:d.name,rest:!(d.exercises||[]).length,
      exercises:(d.exercises||[]).map(e=>({id:Store.uid(),oldId:e.id,name:e.name,type:e.type,sets:+e.sets||3,repMin:+(e.reps||[])[0]||8,repMax:+(e.reps||[])[1]||12,weight:e.start||'',rest:restToSec(e.rest),note:e.note||''}))}))};
    db.plans.push(np);if(!db.activePlanId)db.activePlanId=np.id;res.plan=true}
  const groups={};let i=0;
  for(const[id,entries]of Object.entries(log)){if(!Array.isArray(entries))continue;res.found=res.found||entries.length>0;
    entries.forEach((en,k)=>{const key=`${id}|${k}|${en.date}|${JSON.stringify(en.sets)}`;if(db.oldImported[key])return;
      const sets=(en.sets||[]).map(s=>({w:+s.w||0,r:+s.r||0})).filter(s=>s.r>0);if(!sets.length)return;
      const ex=exById[id];(groups[en.date]=groups[en.date]||{day:dayById[id],ex:[]}).ex.push({name:ex?ex.name:'Exercise '+id,oldId:id,type:ex?.type,lower:ex?ex.type==='lower':isLower(ex?.name),sets});
      db.oldImported[key]=1;res.sets+=sets.length})}
  for(const[date,g]of Object.entries(groups)){const hid='old_'+date;let h=db.history.find(x=>x.id===hid);
    if(!h){h={id:hid,date:oldDate(date,i++),planName:'Original workout app',dayName:g.day||'Imported workout',units:'lb',imported:true,exercises:[]};db.history.push(h);res.workouts++}
    h.exercises.push(...g.ex)}
  db.oldImportChecked=true;Store.save();return res}
