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
