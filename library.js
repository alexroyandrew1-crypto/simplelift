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
