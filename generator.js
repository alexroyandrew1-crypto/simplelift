// ===== AI HOOK =====
// generatePlan(answers) returns a plan object. Today it uses rules/templates.
// To plug in a real AI backend later, replace the body with e.g.
//   const r = await fetch('/api/generate-plan',{method:'POST',body:JSON.stringify(answers)}); return await r.json();
// (the caller already awaits it). Keep the returned shape identical to Store plans.
// answers: {goal, experience, days:2-7, minutes:20..120, equipment:'full'|'machines'|'dumbbells'|'bodyweight',
//           injuries:'free text', focus:['chest',...]}
// v17: AI first (signed-in + verified accounts, server -> xAI Grok API; see parser.js aiRequest), rule-based fallback on ANY failure.
async function generatePlan(answers,opts){
  const a=answers||{};
  const r=await aiRequest('/ai/plan',{answers:{goal:a.goal,experience:a.experience,days:+a.days||3,minutes:+a.minutes||45,equipment:a.equipment,injuries:String(a.injuries||'').slice(0,500),focus:a.focus||[],changes:String(a.changes||'').slice(0,500)}},opts&&opts.signal);
  if(r.ok){const plan=aiToPlan(r.j.plan,{avoid:parseInjuries(a.injuries).codes});if(plan.days.some(d=>d.exercises.length))return plan;lastAI=aiNote(null,'bad')}
  return rulePlan(answers)}

const EQUIP={full:['barbell','dumbbell','machine','cable','bodyweight'],machines:['machine','cable','bodyweight'],dumbbells:['dumbbell','bodyweight'],bodyweight:['bodyweight']};
const T={
  full:['quads','chest','back','hamstrings','shoulders','back','biceps','triceps','core','glutes','calves'],
  upper:['chest','back','shoulders','back','chest','triceps','biceps','shoulders','triceps','biceps','core'],
  lower:['quads','hamstrings','glutes','quads','calves','core','hamstrings','glutes','core','calves'],
  push:['chest','shoulders','chest','triceps','shoulders','triceps','chest','shoulders','triceps','core'],
  pull:['back','back','shoulders','biceps','back','biceps','core','shoulders','back','biceps'],
  legs:['quads','hamstrings','glutes','calves','quads','core','hamstrings','glutes','core','calves'],
  recovery:['core','glutes','core','calves']
};
const SPLITS={
  2:[['Full Body A','full'],['Full Body B','full']],
  3:[['Full Body A','full'],['Full Body B','full'],['Full Body C','full']],
  3.1:[['Push','push'],['Pull','pull'],['Legs','legs']],
  4:[['Upper A','upper'],['Lower A','lower'],['Upper B','upper'],['Lower B','lower']],
  5:[['Upper','upper'],['Lower','lower'],['Push','push'],['Pull','pull'],['Legs','legs']],
  6:[['Push A','push'],['Pull A','pull'],['Legs A','legs'],['Push B','push'],['Pull B','pull'],['Legs B','legs']],
  7:[['Push A','push'],['Pull A','pull'],['Legs A','legs'],['Push B','push'],['Pull B','pull'],['Legs B','legs']]
};
// W=workout, R=rest, A=active recovery (light core/mobility day)
const WEEK={2:'WRRWRRR',3:'WRWRWRR',4:'WWRWWRR',5:'WWWRWWR',6:'WWWWWWR',7:'WWWAWWW'};
const WD=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
// exercises per session length; sets multiplier
const SIZE={20:[3,2],30:[4,3],45:[5,3],60:[6,3],75:[7,3],90:[8,4],105:[9,4],120:[10,4]};
function rulePlan(a){
  const days=Math.min(7,Math.max(2,+a.days||3));
  const split=SPLITS[days===3&&a.experience!=='beginner'?3.1:days];
  const eq=EQUIP[a.equipment]||EQUIP.full;
  const inj=parseInjuries(a.injuries);const av=inj.codes;
  const mins=+a.minutes||45;const[count,baseSets]=SIZE[mins]||SIZE[45];
  const ok=LIBRARY.filter(x=>eq.includes(x.equip)&&!av.some(c=>x.avoid.includes(c)));
  const scheme=(c)=>{
    let r;if(a.goal==='strength')r=c?[4,4,6,180]:[3,8,10,90];
    else if(a.goal==='muscle')r=c?[3,6,10,120]:[3,10,15,60];
    else if(a.goal==='fatloss')r=c?[3,10,12,75]:[3,12,15,45];
    else r=c?[3,8,12,90]:[3,10,15,60];
    r[0]=Math.max(2,r[0]+(baseSets-3));if(mins<=30)r[3]=Math.min(r[3],60);return r};
  const mk=(x,i)=>{let[s,lo,hi,r]=scheme(x.compound);
    // Per-exercise library default; strength goal never shortens it, fat-loss never lengthens it, short sessions cap at 60s.
    const bank=restFor(x.name);r=a.goal==='strength'?Math.max(r,bank):a.goal==='fatloss'?Math.min(r,bank):bank;if(mins<=30)r=Math.min(r,60);
    if(a.experience==='beginner')s=Math.max(2,s-1);if(a.experience==='advanced'&&x.compound)s++;
    if(x.equip==='bodyweight'&&x.muscle!=='core'){lo=Math.max(lo,8);hi=Math.max(hi,15)}
    if(x.name==='Plank'){lo=30;hi=60}
    return{id:Store.uid(),name:x.name,sets:s,repMin:lo,repMax:hi,weight:'',rest:r,note:x.name==='Plank'?'Seconds, not reps':''}};
  const out=[];let wi=0;const variant={};
  [...WEEK[days]].forEach((ch,di)=>{
    const wd=WD[di];
    if(ch==='R'){out.push({id:Store.uid(),name:wd+' · Rest',rest:true,exercises:[]});return}
    let name,tpl;if(ch==='A'){name='Active Recovery';tpl='recovery'}else[name,tpl]=split[wi++];
    let slots=T[tpl].slice();
    const n=ch==='A'?Math.min(4,count):count;
    if(ch!=='A'){const focus=(a.focus||[]).filter(f=>slots.includes(f)||tpl==='full');slots=[...slots.slice(0,2),...focus,...slots.slice(2)]}
    slots=slots.slice(0,n);
    const used=new Set();const ex=[];
    slots.forEach((m,i)=>{
      const cands=ok.filter(x=>x.muscle===m&&!used.has(x.name)&&(ch!=='A'||x.equip==='bodyweight'||x.equip==='cable')).sort((p,q)=>(q.compound-p.compound)*(i<3?1:-1));
      if(!cands.length)return;
      const v=variant[tpl+m+i]=(variant[tpl+m+i]??-1)+1;
      const pick=cands[(v*2)%cands.length]||cands[0];used.add(pick.name);ex.push(mk(pick,i));
    });
    // fallback: if filters left the day thin, fill with any allowed exercise for this day's muscles
    for(const x of ok){if(ex.length>=n)break;if(T[tpl].includes(x.muscle)&&!used.has(x.name)){used.add(x.name);ex.push(mk(x))}}
    if(ch==='A')ex.forEach(e=>{e.sets=2;e.rest=45;e.note=(e.note?e.note+' · ':'')+'Easy effort. Add a 20–30 min walk or bike.'});
    // short sessions: pair accessories as supersets
    if(mins<=30&&ch!=='A')for(let i=ex.length%2?1:0;i+1<ex.length;i+=2){ex[i].note=(ex[i].note?ex[i].note+' · ':'')+'Superset with next, no rest between';ex[i].rest=0}
    out.push({id:Store.uid(),name:wd+' · '+name,rest:false,exercises:ex});
  });
  const gl={strength:'Strength',muscle:'Muscle',general:'Fitness',fatloss:'Lean'}[a.goal]||'Fitness';
  const notes=[`${days} days/week · ${mins} min sessions`];
  if(a.injuries&&a.injuries.trim())notes.push(`Injuries/areas to avoid: "${a.injuries.trim()}"`+(inj.words.length?` (avoiding: ${inj.words.join(', ')})`:' (no known body part recognized)'));
  return{id:Store.uid(),name:`${gl} · ${days} days/week`,created:Date.now(),next:0,notes:notes.join('\n'),avoid:inj.codes,days:out};
}
