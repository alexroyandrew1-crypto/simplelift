// ===== AI HOOK =====
// generatePlan(answers) returns a plan object. Today it uses rules/templates.
// To plug in a real AI backend later, replace the body with e.g.
//   const r = await fetch('/api/generate-plan',{method:'POST',body:JSON.stringify(answers)}); return normalizePlan(await r.json());
// (the caller already awaits it). Keep the returned shape identical to Store plans.
// answers: {goal:'strength'|'muscle'|'general'|'fatloss', experience:'beginner'|'intermediate'|'advanced',
//           days:2-6, minutes:30|45|60|75, equipment:'full'|'machines'|'dumbbells'|'bodyweight',
//           avoid:['shoulder','back','knee'], focus:['chest',...]}
async function generatePlan(answers){return rulePlan(answers)}

const EQUIP={full:['barbell','dumbbell','machine','cable','bodyweight'],machines:['machine','cable','bodyweight'],dumbbells:['dumbbell','bodyweight'],bodyweight:['bodyweight']};
const T={
  full:['quads','chest','back','hamstrings','shoulders','back','biceps','triceps','core'],
  upper:['chest','back','shoulders','back','chest','triceps','biceps','shoulders'],
  lower:['quads','hamstrings','glutes','quads','calves','core','hamstrings'],
  push:['chest','shoulders','chest','triceps','shoulders','triceps','chest'],
  pull:['back','back','shoulders','biceps','back','biceps','core'],
  legs:['quads','hamstrings','glutes','calves','quads','core','hamstrings']
};
const SPLITS={
  2:[['Full Body A','full'],['Full Body B','full']],
  3:[['Full Body A','full'],['Full Body B','full'],['Full Body C','full']],
  3.1:[['Push','push'],['Pull','pull'],['Legs','legs']],
  4:[['Upper A','upper'],['Lower A','lower'],['Upper B','upper'],['Lower B','lower']],
  5:[['Upper','upper'],['Lower','lower'],['Push','push'],['Pull','pull'],['Legs','legs']],
  6:[['Push A','push'],['Pull A','pull'],['Legs A','legs'],['Push B','push'],['Pull B','pull'],['Legs B','legs']]
};
const WEEK={2:'WRRWRRR',3:'WRWRWRR',4:'WWRWWRR',5:'WWWRWWR',6:'WWWWWWR'};
function rulePlan(a){
  const days=Math.min(6,Math.max(2,+a.days||3));
  const split=SPLITS[days===3&&a.experience!=='beginner'?3.1:days];
  const eq=EQUIP[a.equipment]||EQUIP.full;
  const av=(a.avoid||[]).map(x=>x[0]);
  const count={30:4,45:5,60:6,75:7}[a.minutes]||5;
  const ok=LIBRARY.filter(x=>eq.includes(x.equip)&&!av.some(c=>x.avoid.includes(c)));
  const scheme=(c)=>{
    if(a.goal==='strength')return c?[4,4,6,180]:[3,8,10,90];
    if(a.goal==='muscle')return c?[3,6,10,120]:[3,10,15,60];
    if(a.goal==='fatloss')return c?[3,10,12,75]:[3,12,15,45];
    return c?[3,8,12,90]:[3,10,15,60];
  };
  const out=[];let wi=0;const variant={};
  for(const ch of WEEK[days]){
    if(ch==='R'){out.push({id:Store.uid(),name:'Rest',rest:true,exercises:[]});continue}
    const[name,tpl]=split[wi++];
    let slots=T[tpl].slice();
    const focus=(a.focus||[]).filter(f=>slots.includes(f)||tpl==='full');
    slots=[...slots.slice(0,2),...focus,...slots.slice(2)].slice(0,count);
    const used=new Set();const ex=[];
    slots.forEach((m,i)=>{
      const cands=ok.filter(x=>x.muscle===m&&!used.has(x.name)).sort((p,q)=>(q.compound-p.compound)*(i<3?1:-1));
      if(!cands.length)return;
      const v=variant[tpl+m+i]=(variant[tpl+m+i]??-1)+1;
      const pick=cands[(v*2)%cands.length]||cands[0];used.add(pick.name);
      let[s,lo,hi,r]=scheme(pick.compound);
      if(a.experience==='beginner')s=Math.max(2,s-1);if(a.experience==='advanced'&&pick.compound)s++;
      if(pick.equip==='bodyweight'&&pick.muscle!=='core'){lo=Math.max(lo,8);hi=Math.max(hi,15)}
      if(pick.name==='Plank'){lo=30;hi=60}
      ex.push({id:Store.uid(),name:pick.name,sets:s,repMin:lo,repMax:hi,weight:'',rest:r,note:pick.name==='Plank'?'Seconds, not reps':''});
    });
    // fallback: if equipment/injury filters left the day thin, fill with any allowed exercise for this day's muscles
    const want=Math.min(count,4);
    for(const x of ok){if(ex.length>=want)break;if(T[tpl].includes(x.muscle)&&!used.has(x.name)){used.add(x.name);const[s,lo,hi,r]=scheme(x.compound);ex.push({id:Store.uid(),name:x.name,sets:s,repMin:x.name==='Plank'?30:Math.max(lo,x.equip==='bodyweight'?8:0),repMax:x.name==='Plank'?60:Math.max(hi,x.equip==='bodyweight'?15:0),weight:'',rest:r,note:x.name==='Plank'?'Seconds, not reps':''})}}
    out.push({id:Store.uid(),name,rest:false,exercises:ex});
  }
  const gl={strength:'Strength',muscle:'Muscle',general:'Fitness',fatloss:'Lean'}[a.goal]||'Fitness';
  return{id:Store.uid(),name:`${gl} · ${days} days/week`,created:Date.now(),next:0,days:out};
}
