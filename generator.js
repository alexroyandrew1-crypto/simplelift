// ===== AI HOOK =====
// generatePlan(answers) returns a plan object. Today it uses rules/templates.
// To plug in a real AI backend later, replace the body with e.g.
//   const r = await fetch('/api/generate-plan',{method:'POST',body:JSON.stringify(answers)}); return await r.json();
// (the caller already awaits it). Keep the returned shape identical to Store plans.
// answers: {goal, experience, days:2-7, minutes:20..120, equipment:'full'|'machines'|'dumbbells'|'bodyweight',
//           injuries:'free text', focus:['chest',...]}
async function generatePlan(answers){return rulePlan(answers)}

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

// ===== "Use my own AI chat" prompt (no server, no key) =====
// Builds a prompt for any chat AI, asking for a reply in the exact format parseTextPlan() reads.
const AI_LABELS={goal:{muscle:'build muscle',strength:'get stronger',general:'general fitness',fatloss:'lose fat while keeping muscle'},
  equipment:{full:'a full gym (barbells, dumbbells, machines, cables)',machines:'machines and cables only (no barbells or free weights)',dumbbells:'dumbbells and a bench only',bodyweight:'bodyweight only (no equipment)'}};
function buildAIPrompt(a,changes){
  const d=+a.days||3,m=+a.minutes||45,inj=(a.injuries||'').trim(),foc=(a.focus||[]).join(', ');
  const L=[];
  L.push(`Write me a weekly weight-training plan. Reply ONLY in the exact format below, so my workout app can read it.`,'');
  L.push('About me:');
  L.push(`- Goal: ${AI_LABELS.goal[a.goal]||a.goal||'general fitness'}`);
  L.push(`- Experience: ${a.experience||'beginner'}`);
  L.push(`- Training days per week: ${d}${d===7?' (make one of them a light active-recovery day)':''}`);
  L.push(`- Session length: about ${m} minutes each, including rest between sets`);
  L.push(`- Equipment: ${AI_LABELS.equipment[a.equipment]||a.equipment||'a full gym'}`);
  L.push(`- Injuries / areas to avoid: ${inj||'none'}`);
  if(foc)L.push(`- Muscles to focus on: ${foc}`);
  if(changes&&changes.trim())L.push('','[Changes I want]',changes.trim(),'[End of changes]');
  L.push('','Rules:');
  L.push(`- Exactly ${d} training days${d<7?` and ${7-d} rest day${7-d>1?'s':''}`:''}, so 7 days in total, in a sensible order.`);
  L.push(`- Fit each training day into about ${m} minutes.`);
  L.push('- Use only the equipment listed. Use common gym exercises with standard names (e.g. "Barbell Bench Press", "Lat Pulldown", "Dumbbell Lateral Raise").');
  if(inj)L.push('- Leave out any exercise that loads the injured areas, and pick safe alternatives.');
  if(changes&&changes.trim())L.push('- Apply everything in [Changes I want].');
  L.push('- Do NOT include weights. Do NOT use tables, bold, or markdown. No intro, no tips, no warm-up, no notes at the end.');
  L.push('- Rest times in seconds. Units are lbs.','');
  L.push('Format (copy it exactly):');
  L.push('Plan: <short plan name>');
  L.push('Day 1: <day name, e.g. Push>');
  L.push('Exercise Name — 3 sets x 8-10 reps — rest 90s');
  L.push('Exercise Name — 3 sets x 10-12 reps — rest 60s');
  L.push('Day 2: Rest');
  L.push('Day 3: <day name>');
  L.push('...');
  L.push('','One exercise per line, nothing else.');
  return L.join('\n')}
