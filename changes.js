// ===== CHANGE-REQUEST HOOK =====
// applyChangeRequest(plan, text) -> {plan, changes:[...], notUnderstood:[...]}.
// Rule-based for now (applyChangeRequest). To use a real AI backend later, replace the body with an API call
// returning the same shape; the caller already awaits it.

const MUSCLE_WORDS={chest:/^(chest|pecs?|pectorals?)$/,back:/^(back|lats?|upper back)$/,shoulders:/^(shoulders?|delts?|deltoids?)$/,
 biceps:/^(biceps?|bis|arms?)$/,triceps:/^(triceps?|tris)$/,quads:/^(quads?|quadriceps|legs?|thighs?|leg day)$/,hamstrings:/^(hamstrings?|hams?)$/,
 glutes:/^(glutes?|butt|booty|bum)$/,calves:/^(calf|calves)$/,core:/^(abs?|core|abdominals?|stomach|obliques?)$/};
function muscleOf(w){w=w.trim().toLowerCase().replace(/^(my|the|some|more|extra)\s+/,'').replace(/\s+(work|exercises?|training|volume)$/,'');for(const[m,re]of Object.entries(MUSCLE_WORDS))if(re.test(w))return m;return null}
const norm=s=>String(s).toLowerCase().replace(/\bdb\b/g,'dumbbell').replace(/\bbb\b/g,'barbell').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean).map(w=>w.replace(/(es|s)$/,(m)=>w.length>4?'':m));
function matchEx(plan,q){const qw=norm(q).filter(w=>!['the','my','a','an','all','exercise','exercises'].includes(w));if(!qw.length)return[];const hits=[];
  plan.days.forEach((d,di)=>d.exercises.forEach((e,ei)=>{const ew=norm(e.name);if(qw.every(w=>ew.some(x=>x.startsWith(w)||w.startsWith(x))))hits.push({d,di,e,ei})}));return hits}
function dayRef(plan,s){if(!s)return null;s=s.trim().toLowerCase();let m=s.match(/day\s*(\d+)/);if(m){const w=plan.days.filter(d=>!d.rest);return w[+m[1]-1]||plan.days[+m[1]-1]||null}
  return plan.days.find(d=>d.name.toLowerCase().includes(s.replace(/^(the|my)\s+/,'').replace(/\s*day$/,'')))||null}
function exFromName(n,muscleHint){const L=libFind(n)||libFuzzyName(n);const name=L?L.name:n.trim().replace(/\b\w/g,c=>c.toUpperCase());
  return{id:Store.uid(),name,sets:3,repMin:L&&L.compound?8:10,repMax:L&&L.compound?12:15,weight:'',rest:restFor(n),restAuto:true,note:''}}
function pickFor(plan,muscle){const have=new Set(plan.days.flatMap(d=>d.exercises.map(e=>e.name)));
  const eqUsed=new Set(plan.days.flatMap(d=>d.exercises.map(e=>libFind(e.name)?.equip).filter(Boolean)));
  const av=plan.avoid||[];const c=LIBRARY.filter(x=>x.muscle===muscle&&!have.has(x.name)&&!av.some(k=>x.avoid.includes(k)));return c.find(x=>!eqUsed.size||eqUsed.has(x.equip))||c[0]||null}
const workDays=p=>p.days.filter(d=>!d.rest);
function applyChangeRequest(plan,text){
  plan=JSON.parse(JSON.stringify(plan));const changes=[],bad=[];
  const parts=String(text||'').split(/[\n.;!?,]+|\s+and\s+(?=(?:swap|replace|switch|change|remove|drop|delete|no|add|more|less|fewer|make|get rid|put|use)\b)|\s+also\s+/i).map(s=>s.trim()).filter(Boolean);
  for(let p of parts){p=p.replace(/^(please|can you|could you|i('d| would) like( to)?|i want( to)?|let'?s|also|and|then)\s+/i,'').replace(/\s+please$/i,'').trim();let m,done=false;
    // swap / replace
    if((m=p.match(/^(?:swap|replace|switch|change|sub(?:stitute)?)\s+(?:out\s+)?(.+?)\s+(?:for|with|to|into)\s+(.+)$/i))){
      const hits=matchEx(plan,m[1]);if(hits.length){const nx=exFromName(m[2]);hits.forEach(h=>{const old=h.e.name;Object.assign(h.e,{name:nx.name});if(libFind(nx.name))h.e.rest=nx.rest});changes.push(`Swapped ${hits[0].e&&m[1].trim()} → ${nx.name} (${hits.length} place${hits.length>1?'s':''})`);done=true}
      else bad.push(`"${p}": couldn't find "${m[1].trim()}" in the plan`),done=true}
    else if((m=p.match(/^(?:use|do)\s+(.+?)\s+instead of\s+(.+)$/i))){
      const hits=matchEx(plan,m[2]);if(hits.length){const nx=exFromName(m[1]);hits.forEach(h=>h.e.name=nx.name);changes.push(`Swapped ${m[2].trim()} → ${nx.name} (${hits.length} place${hits.length>1?'s':''})`)}else bad.push(`"${p}": couldn't find "${m[2].trim()}" in the plan`);done=true}
    // remove
    else if((m=p.match(/^(?:remove|drop|delete|no|no more|without|get rid of|take out|cut|skip)\s+(?:the\s+|all\s+)?(.+?)(?:\s+from\s+(.+))?$/i))){
      const scope=m[2]?dayRef(plan,m[2]):null;let hits=matchEx(plan,m[1]);if(scope)hits=hits.filter(h=>h.d===scope);
      const mus=muscleOf(m[1]);
      if(hits.length){hits.sort((a,b)=>b.ei-a.ei).forEach(h=>h.d.exercises.splice(h.ei,1));changes.push(`Removed ${m[1].trim()} (${hits.length} place${hits.length>1?'s':''})`)}
      else if(mus){let n=0;plan.days.forEach(d=>{if(scope&&d!==scope)return;const before=d.exercises.length;d.exercises=d.exercises.filter(e=>libFind(e.name)?.muscle!==mus);n+=before-d.exercises.length});
        n?changes.push(`Removed ${n} ${mus} exercise${n>1?'s':''}`):bad.push(`"${p}": no ${mus} exercises to remove`)}
      else bad.push(`"${p}": couldn't find "${m[1].trim()}" in the plan`);done=true}
    // shorter / longer
    else if(/\b(shorter|quicker|faster|less time|too long|cut down)\b/i.test(p)){let n=0;workDays(plan).forEach(d=>{if(d.exercises.length>2){d.exercises.pop();n++}});changes.push(`Made workouts shorter: removed the last exercise from ${n} day${n===1?'':'s'}`);done=true}
    else if(/\b(longer|more time|too short)\b/i.test(p)){let n=0;workDays(plan).forEach(d=>{const ms=d.exercises.map(e=>libFind(e.name)?.muscle).filter(Boolean);const x=ms.length&&pickFor(plan,ms[n%ms.length]);if(x){d.exercises.push(exFromName(x.name));n++}});changes.push(`Made workouts longer: added an exercise to ${n} day${n===1?'':'s'}`);done=true}
    else if(/\b(more|extra|add (a|one|an)?\s*)\s*sets?\b/i.test(p)){workDays(plan).forEach(d=>d.exercises.forEach(e=>e.sets=Math.min(8,+e.sets+1)));changes.push('Added 1 set to every exercise');done=true}
    else if(/\b(fewer|less)\s+sets?\b/i.test(p)){workDays(plan).forEach(d=>d.exercises.forEach(e=>e.sets=Math.max(1,+e.sets-1)));changes.push('Removed 1 set from every exercise');done=true}
    else if(/\b(heavier|strength|lower reps|fewer reps)\b/i.test(p)){workDays(plan).forEach(d=>d.exercises.forEach(e=>{e.repMin=Math.max(3,e.repMin-3);e.repMax=Math.max(e.repMin,e.repMax-3)}));changes.push('Lowered rep ranges by 3 (heavier weights)');done=true}
    else if(/\b(more reps|higher reps|lighter)\b/i.test(p)){workDays(plan).forEach(d=>d.exercises.forEach(e=>{e.repMin+=3;e.repMax+=3}));changes.push('Raised rep ranges by 3 (lighter weights)');done=true}
    // more / less muscle
    else if((m=p.match(/^(?:more|extra|add more|increase|focus on|bigger)\s+(.+)$/i))&&muscleOf(m[1])){const mus=muscleOf(m[1]);let n=0;
      let targets=workDays(plan).filter(d=>d.exercises.some(e=>libFind(e.name)?.muscle===mus));if(!targets.length)targets=workDays(plan).slice(0,2);
      targets.forEach(d=>{const x=pickFor(plan,mus);if(x){d.exercises.push(exFromName(x.name));n++;changes.push(`Added ${x.name} to ${d.name}`)}});if(!n)bad.push(`"${p}": no more ${mus} exercises available`);done=true}
    else if((m=p.match(/^(?:less|fewer|reduce|decrease)\s+(.+)$/i))&&muscleOf(m[1])){const mus=muscleOf(m[1]);let n=0;
      workDays(plan).forEach(d=>{for(let i=d.exercises.length-1;i>=0;i--)if(libFind(d.exercises[i].name)?.muscle===mus){changes.push(`Removed ${d.exercises[i].name} from ${d.name}`);d.exercises.splice(i,1);n++;break}});if(!n)bad.push(`"${p}": no ${mus} exercises to remove`);done=true}
    // add
    else if((m=p.match(/^(?:add|put|include|throw in)\s+(?:some\s+|a\s+|an\s+)?(.+?)(?:\s+(?:to|on|in|into)\s+(.+))?$/i))){
      const what=m[1].replace(/\s+(exercises?|work)$/i,''),mus=muscleOf(what);const scope=m[2]?dayRef(plan,m[2]):null;
      if(m[2]&&!scope){bad.push(`"${p}": couldn't find day "${m[2].trim()}"`);done=true}
      else if(mus){let targets=scope?[scope]:workDays(plan).filter(d=>!d.exercises.some(e=>libFind(e.name)?.muscle===mus));if(!scope&&mus!=='core')targets=targets.slice(0,2);
        if(!targets.length)targets=workDays(plan).slice(0,1);
        targets.forEach(d=>{const x=pickFor(plan,mus);if(x){d.exercises.push(exFromName(x.name));changes.push(`Added ${x.name} to ${d.name}`)}});done=true}
      else{const L=libFind(what)||libFuzzyName(what);const d=scope||(L&&workDays(plan).find(d=>d.exercises.some(e=>libFind(e.name)?.muscle===L.muscle)))||workDays(plan)[0];
        if(!d){bad.push(`"${p}": there's no workout day to add it to`)}else if(!L&&what.split(' ').length>5){bad.push(`"${p}"`)}else{const nx=exFromName(what);d.exercises.push(nx);changes.push(`Added ${nx.name} to ${d.name}`+(L?'':' (not in the library, check sets/reps)'))}done=true}}
    if(!done)bad.push(`"${p}"`);
  }
  return{plan,changes,notUnderstood:bad};
}
