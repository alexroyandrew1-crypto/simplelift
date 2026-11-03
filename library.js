// Built-in exercise library. m=muscle, e=equipment, c=compound, x=areas to avoid if injured (s=shoulder,b=back,k=knee)
const LIB_RAW=`Barbell Bench Press|chest|barbell|1|s
Incline Barbell Bench Press|chest|barbell|1|s
Dumbbell Bench Press|chest|dumbbell|1|
Incline Dumbbell Press|chest|dumbbell|1|
Dumbbell Fly|chest|dumbbell|0|s
Machine Chest Press|chest|machine|1|
Pec Deck|chest|machine|0|
Cable Crossover|chest|cable|0|
Low-to-High Cable Fly|chest|cable|0|
Push-Up|chest|bodyweight|1|
Incline Push-Up|chest|bodyweight|1|
Dips|chest|bodyweight|1|s
Barbell Overhead Press|shoulders|barbell|1|sb
Seated Dumbbell Shoulder Press|shoulders|dumbbell|1|s
Machine Shoulder Press|shoulders|machine|1|s
Dumbbell Lateral Raise|shoulders|dumbbell|0|
Cable Lateral Raise|shoulders|cable|0|
Machine Lateral Raise|shoulders|machine|0|
Rear Delt Fly|shoulders|dumbbell|0|
Reverse Pec Deck|shoulders|machine|0|
Face Pull|shoulders|cable|0|
Pike Push-Up|shoulders|bodyweight|1|s
Barbell Row|back|barbell|1|b
Dumbbell Row|back|dumbbell|1|
Chest-Supported Dumbbell Row|back|dumbbell|1|
Seated Cable Row|back|cable|1|
Lat Pulldown|back|cable|1|
Close-Grip Lat Pulldown|back|cable|1|
Machine Row|back|machine|1|
Assisted Pull-Up|back|machine|1|
Pull-Up|back|bodyweight|1|s
Chin-Up|back|bodyweight|1|
Inverted Row|back|bodyweight|1|
Straight-Arm Pulldown|back|cable|0|
Deadlift|back|barbell|1|bk
Rack Pull|back|barbell|1|b
Back Extension|back|bodyweight|0|b
Barbell Curl|biceps|barbell|0|
EZ-Bar Curl|biceps|barbell|0|
Dumbbell Curl|biceps|dumbbell|0|
Hammer Curl|biceps|dumbbell|0|
Incline Dumbbell Curl|biceps|dumbbell|0|
Cable Curl|biceps|cable|0|
Machine Preacher Curl|biceps|machine|0|
Triceps Pushdown|triceps|cable|0|
Overhead Cable Triceps Extension|triceps|cable|0|
Skull Crusher|triceps|barbell|0|
Dumbbell Overhead Triceps Extension|triceps|dumbbell|0|s
Close-Grip Bench Press|triceps|barbell|1|s
Machine Triceps Extension|triceps|machine|0|
Bench Dip|triceps|bodyweight|0|s
Diamond Push-Up|triceps|bodyweight|1|
Barbell Back Squat|quads|barbell|1|bk
Front Squat|quads|barbell|1|bk
Goblet Squat|quads|dumbbell|1|k
Leg Press|quads|machine|1|k
Hack Squat|quads|machine|1|k
Leg Extension|quads|machine|0|k
Bulgarian Split Squat|quads|dumbbell|1|k
Dumbbell Lunge|quads|dumbbell|1|k
Walking Lunge|quads|bodyweight|1|k
Bodyweight Squat|quads|bodyweight|1|k
Step-Up|quads|dumbbell|1|k
Romanian Deadlift|hamstrings|barbell|1|b
Dumbbell Romanian Deadlift|hamstrings|dumbbell|1|b
Lying Leg Curl|hamstrings|machine|0|
Seated Leg Curl|hamstrings|machine|0|
Nordic Curl|hamstrings|bodyweight|0|k
Hip Thrust|glutes|barbell|1|
Glute Bridge|glutes|bodyweight|0|
Cable Pull-Through|glutes|cable|0|
Hip Abduction Machine|glutes|machine|0|
Dumbbell Hip Thrust|glutes|dumbbell|1|
Standing Calf Raise|calves|machine|0|
Seated Calf Raise|calves|machine|0|
Dumbbell Calf Raise|calves|dumbbell|0|
Bodyweight Calf Raise|calves|bodyweight|0|
Plank|core|bodyweight|0|
Cable Crunch|core|cable|0|b
Hanging Knee Raise|core|bodyweight|0|
Dead Bug|core|bodyweight|0|
Pallof Press|core|cable|0|
Ab Wheel Rollout|core|bodyweight|0|b
Bicycle Crunch|core|bodyweight|0|`;
const LOWER=['quads','hamstrings','glutes','calves'];
const LIBRARY=LIB_RAW.split('\n').map(l=>{const[n,m,e,c,x]=l.split('|');return{name:n,muscle:m,equip:e,compound:c==='1',avoid:x||'',lower:LOWER.includes(m)}});
// ===== Per-exercise default rest (seconds) =====
// Used ONLY when a workout doesn't say a rest for an exercise. An explicit rest (pasted, typed, imported) always wins.
// Format stays backward compatible: LIB_RAW is unchanged; each entry just gains a `rest` field.
const REST_FALLBACK=typeof DEFAULT_REST_SEC!=='undefined'?DEFAULT_REST_SEC:120; // global fallback (config.js): 2 min
const REST_BY_NAME={ // heavy compounds
 'Barbell Bench Press':180,'Incline Barbell Bench Press':150,'Close-Grip Bench Press':150,'Barbell Overhead Press':150,'Barbell Row':150,
 'Deadlift':210,'Rack Pull':180,'Romanian Deadlift':150,'Barbell Back Squat':210,'Front Squat':180,'Hack Squat':180,'Leg Press':180,
 'Hip Thrust':150,'Dumbbell Hip Thrust':120,'Bulgarian Split Squat':120,'Dumbbell Romanian Deadlift':120,'Goblet Squat':90,
 'Dumbbell Bench Press':120,'Incline Dumbbell Press':120,'Seated Dumbbell Shoulder Press':120,'Machine Shoulder Press':90,'Machine Chest Press':90,
 'Dumbbell Row':90,'Chest-Supported Dumbbell Row':90,'Seated Cable Row':90,'Lat Pulldown':90,'Close-Grip Lat Pulldown':90,'Machine Row':90,
 'Assisted Pull-Up':90,'Pull-Up':120,'Chin-Up':120,'Dips':90,'Dumbbell Lunge':90,'Walking Lunge':90,'Step-Up':90,
 // isolation
 'Face Pull':45,'Dumbbell Lateral Raise':45,'Cable Lateral Raise':45,'Machine Lateral Raise':45,'Rear Delt Fly':45,'Reverse Pec Deck':45,
 'Standing Calf Raise':60,'Seated Calf Raise':45,'Dumbbell Calf Raise':45,'Bodyweight Calf Raise':45,'Leg Extension':60,'Lying Leg Curl':60,'Seated Leg Curl':60,
 'Skull Crusher':75,'Nordic Curl':90
};
const restDefaultOf=x=>REST_BY_NAME[x.name]||(x.muscle==='core'?60:x.equip==='bodyweight'?60:x.compound?90:60);
LIBRARY.forEach(x=>{x.rest=restDefaultOf(x)});
const REST_ALIASES={ // normalized alias -> bank name
 'squat':'Barbell Back Squat','back squat':'Barbell Back Squat','bench press':'Barbell Bench Press','bench':'Barbell Bench Press','flat bench press':'Barbell Bench Press',
 'incline bench press':'Incline Barbell Bench Press','incline smith machine press':'Incline Barbell Bench Press','smith machine bench press':'Barbell Bench Press',
 'ohp':'Barbell Overhead Press','overhead press':'Barbell Overhead Press','military press':'Barbell Overhead Press','shoulder press':'Seated Dumbbell Shoulder Press',
 'bent over row':'Barbell Row','barbell bent over row':'Barbell Row','pendlay row':'Barbell Row','t bar row':'Barbell Row','chest supported t bar row':'Barbell Row','seal row':'Chest-Supported Dumbbell Row',
 'rdl':'Romanian Deadlift','barbell romanian deadlift':'Romanian Deadlift','stiff leg deadlift':'Romanian Deadlift','conventional deadlift':'Deadlift',
 'barbell hip thrust':'Hip Thrust','glute bridge':'Glute Bridge','split squat':'Bulgarian Split Squat','lunge':'Dumbbell Lunge',
 'lat pulldown':'Lat Pulldown','pulldown':'Lat Pulldown','lat focused pulldown':'Lat Pulldown','heavy lat pulldown':'Lat Pulldown','weighted pull up':'Pull-Up','pullup':'Pull-Up','chinup':'Chin-Up',
 'single arm cable row':'Seated Cable Row','cable row':'Seated Cable Row','pullover':'Straight-Arm Pulldown','dumbbell pullover':'Straight-Arm Pulldown',
 'lateral raise':'Dumbbell Lateral Raise','side raise':'Dumbbell Lateral Raise','upright row':'Dumbbell Lateral Raise','dumbbell upright row':'Dumbbell Lateral Raise','rear delt flye':'Rear Delt Fly','rear delt fly':'Rear Delt Fly',
 'calf raise':'Standing Calf Raise','hamstring curl':'Lying Leg Curl','leg curl':'Lying Leg Curl','standing hamstring curl':'Lying Leg Curl','lying hamstring curl':'Lying Leg Curl',
 'tricep extension':'Overhead Cable Triceps Extension','overhead cable tricep extension':'Overhead Cable Triceps Extension','overhead rope extension':'Overhead Cable Triceps Extension',
 'pushdown':'Triceps Pushdown','tricep pushdown':'Triceps Pushdown','skullcrusher':'Skull Crusher','tricep dip':'Dips','dip':'Dips',
 'bicep curl':'Dumbbell Curl','curl':'Dumbbell Curl','standing barbell bicep curl':'Barbell Curl','preacher curl':'Machine Preacher Curl','spider curl':'Dumbbell Curl',
 'cable hammer curl':'Hammer Curl','incline dumbbell bicep curl':'Incline Dumbbell Curl','chest press':'Machine Chest Press','seated chest press machine':'Machine Chest Press',
 'push up':'Push-Up','pushup':'Push-Up','crunch':'Cable Crunch','sit up':'Bicycle Crunch','leg raise':'Hanging Knee Raise'
};
const restNorm=s=>String(s||'').toLowerCase().replace(/\([^)]*\)?/g,' ').replace(/\bdb\b/g,'dumbbell').replace(/\bbb\b/g,'barbell').replace(/\bkb\b/g,'kettlebell')
  .replace(/\btriceps\b/g,'tricep').replace(/\bbiceps\b/g,'bicep').replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(Boolean)
  .map(w=>w.length>3&&/[^s]s$/.test(w)?w.slice(0,-1):w).join(' ').trim();
const _restIdx=(()=>{const m=new Map();LIBRARY.forEach(x=>m.set(restNorm(x.name),x));for(const[a,n]of Object.entries(REST_ALIASES)){const x=LIBRARY.find(y=>y.name===n);if(x&&!m.has(restNorm(a)))m.set(restNorm(a),x)}return m})();
function restEntry1(k){if(!k)return null;if(_restIdx.has(k))return _restIdx.get(k);
  const k2=k.replace(/^(seated|standing|lying|incline|decline|single arm|one arm|weighted|heavy|machine|cable|dumbbell|barbell)\s+/,'');if(k2!==k){const r=restEntry1(k2);if(r)return r}
  const kw=k.split(' ');let best=null,bs=0; // fuzzy: share of bank-name tokens present in query
  for(const[n,x]of _restIdx){const nw=n.split(' ');const hit=nw.filter(w=>kw.includes(w)).length;if(!hit)continue;const sc=hit/nw.length+hit/kw.length*0.5;if(hit===nw.length&&sc>bs){bs=sc;best=x}}
  return best}
// restLookup(name) -> bank entry or null. "A or B" / "A / B": first alternative found in the bank wins.
function restLookup(name){const alts=String(name||'').replace(/\([^)]*\)?/g,' ').split(/\s+(?:or)\s+|\s*\/\s*/i).map(restNorm).filter(Boolean);
  for(const a of alts){const r=restEntry1(a);if(r)return r}return null}
// restFor(name) -> default rest seconds from the bank, else DEFAULT_REST_SEC (120).
function restFor(name){const x=restLookup(name);return x?x.rest:REST_FALLBACK}
// hasRest(v): true when a rest value was actually given (0 is a valid explicit value, e.g. supersets).
const hasRest=v=>v!==null&&v!==undefined&&v!==''&&!Number.isNaN(+v);
// The ONE place defaults are applied: fills rest only where it's missing. Never touches a given number.
function fillRest(ex){if(ex&&!hasRest(ex.rest)){ex.rest=restFor(ex.name);ex.restAuto=true}return ex}
// Read-time: effective rest for timers/watch without mutating stored data.
const restOf=ex=>hasRest(ex&&ex.rest)?+ex.rest:restFor(ex&&ex.name);
function libFind(name){const k=(name||'').trim().toLowerCase();return LIBRARY.find(x=>x.name.toLowerCase()===k)}
// Extra joint tags (h=hip, e=elbow, w=wrist, n=neck, a=ankle) added on top of s/b/k above.
const EXTRA_AVOID={h:['Barbell Back Squat','Front Squat','Goblet Squat','Deadlift','Romanian Deadlift','Dumbbell Romanian Deadlift','Hip Thrust','Dumbbell Hip Thrust','Bulgarian Split Squat','Dumbbell Lunge','Walking Lunge','Step-Up','Leg Press','Hack Squat','Hip Abduction Machine','Cable Pull-Through'],
 e:['Skull Crusher','Dips','Bench Dip','Close-Grip Bench Press','Dumbbell Overhead Triceps Extension','Overhead Cable Triceps Extension','Barbell Curl','EZ-Bar Curl','Chin-Up','Diamond Push-Up','Machine Preacher Curl'],
 w:['Push-Up','Incline Push-Up','Diamond Push-Up','Pike Push-Up','Barbell Curl','Front Squat','Dips','Bench Dip','Plank','Ab Wheel Rollout','Skull Crusher','Barbell Bench Press','Close-Grip Bench Press'],
 n:['Barbell Overhead Press','Barbell Back Squat','Deadlift','Rack Pull','Pull-Up','Cable Crunch','Bicycle Crunch'],
 a:['Barbell Back Squat','Front Squat','Goblet Squat','Bulgarian Split Squat','Dumbbell Lunge','Walking Lunge','Step-Up','Standing Calf Raise','Seated Calf Raise','Dumbbell Calf Raise','Bodyweight Calf Raise','Hack Squat','Bodyweight Squat']};
for(const[c,names]of Object.entries(EXTRA_AVOID))names.forEach(n=>{const x=libFind(n);if(x&&!x.avoid.includes(c))x.avoid+=c});
// Free-text injury keywords -> joint codes
const INJURY_WORDS=[
 ['s','shoulder',/\b(shoulders?|rotator|cuff|labrum|ac joint|delts?|impingement|frozen)\b/i],
 ['b','back',/\b(back|spine|spinal|disc|discs|lumbar|sciatica|herniat\w*|bulging|si joint|lower back|slipped)\b/i],
 ['k','knee',/\b(knees?|acl|mcl|pcl|meniscus|patella\w*|kneecap|jumper'?s knee)\b/i],
 ['h','hip',/\b(hips?|groin|hip flexor|labral|pelvis|it band)\b/i],
 ['e','elbow',/\b(elbows?|tennis elbow|golfer'?s elbow|tendonitis in (my )?elbow|forearm)\b/i],
 ['w','wrist',/\b(wrists?|carpal|hand)\b/i],
 ['n','neck',/\b(neck|cervical|whiplash|trap strain)\b/i],
 ['a','ankle',/\b(ankles?|achilles|foot|feet|plantar|shin splints?)\b/i]];
function parseInjuries(text){const t=String(text||'');if(/^\s*(none|no|n\/a|nothing|nope)?\s*\.?\s*$/i.test(t))return{codes:[],words:[]};
  const r=INJURY_WORDS.filter(([,, re])=>re.test(t));return{codes:r.map(x=>x[0]),words:r.map(x=>x[1])}}
function libFuzzyName(n){const k=String(n||'').toLowerCase().replace(/\bdb\b/g,'dumbbell').replace(/\bbb\b/g,'barbell').replace(/s\b/g,'').trim();if(!k)return null;
  return LIBRARY.find(x=>x.name.toLowerCase()===k)||LIBRARY.find(x=>{const y=x.name.toLowerCase().replace(/s\b/g,'');return y===k||y.endsWith(' '+k)})||LIBRARY.find(x=>x.name.toLowerCase().replace(/s\b/g,'').includes(k))}

// ===== Suggested starting weight (lb) for a brand-new exercise with no history and no weight typed in =====
// Conservative beginner numbers; dumbbells are per hand. Returns 0 for bodyweight moves. Edit START_RULES to tune.
const START_RULES=[ // [regex on name, barbell, dumbbell, machine/cable]
 [/romanian|rdl|stiff/,95,30,60],[/deadlift/,135,40,90],[/hip thrust|glute bridge/,95,40,90],[/front squat/,65,25,90],[/squat|hack/,95,25,90],
 [/leg press/,140,140,140],[/lunge|split squat|step[\s-]?up/,65,20,60],[/leg (curl|extension)|hamstring curl/,50,20,50],[/calf/,95,30,90],
 [/incline.*(press|bench)|(press|bench).*incline/,75,25,60],[/bench|chest press|floor press/,95,30,60],[/fly|flye|pec deck|crossover/,40,15,40],
 [/overhead|shoulder press|military|arnold|ohp/,65,20,50],[/lateral|rear delt|reverse fly/,30,10,20],[/face pull/,30,15,30],[/upright row|shrug/,65,30,50],
 [/pulldown|pull-down/,70,25,70],[/row/,75,30,70],[/curl/,40,20,30],[/skull|tricep|triceps|pushdown|kickback|extension/,40,15,35],
 [/woodchop|pallof|crunch|ab /,0,15,30]];
const BW_RE=/push[\s-]?ups?|pull[\s-]?ups?|chin[\s-]?ups?|\bdips?\b|plank|crunch|sit[\s-]?ups?|leg raise|burpee|mountain|bodyweight|air squat|hanging|dead bug|bird dog|superman|jumping|drop set/;
function startWeight(name,units){
  const n=String(name||'').toLowerCase();if(!n.trim())return 0;
  const L=libFind(name)||libFuzzyName(name);
  let eq=/\b(db|dumbbells?|kettlebell|kb)\b/.test(n)?'dumbbell':/\b(barbell|bb|smith|ez)\b/.test(n)?'barbell':/\b(cable|machine|band|pulldown|leg press|pec deck)\b/.test(n)?'machine':L?L.equip:'';
  if(eq==='bodyweight'||(BW_RE.test(n)&&!/weighted|cable|machine|assisted/.test(n)))return 0;
  if(eq==='cable')eq='machine';
  const r=START_RULES.find(x=>x[0].test(n));
  let lb=r?(eq==='dumbbell'?r[2]:eq==='machine'?r[3]:eq==='barbell'?r[1]:r[1]||r[2]):(eq==='dumbbell'?20:eq==='barbell'?65:eq==='machine'?50:0);
  if(!r&&!eq)lb=0;
  if(!lb)return 0;
  return units==='kg'?Math.max(2.5,Math.round(lb*0.4536/2.5)*2.5):lb}
