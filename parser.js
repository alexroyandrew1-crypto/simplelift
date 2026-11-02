// ===== PASTE-PARSER HOOK =====
// parseTextPlan(text) -> {plan, unparsed:[lines], skipped:[lines]}. Rule-based today.
// To use a real AI parser later, replace the body with a backend call returning the same shape (caller awaits it).
async function parseTextPlan(text){return ruleParse(text)}

const DAYWORDS=/^(day\s*\d+|week\s*\d+|(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\b|workout\s*[a-z0-9]\b|session\s*\d+|(upper|lower|push|pull|legs?|full[\s-]?body|chest|back|arms|shoulders)(\s+(day|body|[a-z])){0,2}\s*[:\-]?\s*$)/i;
const SKIPSEC=/^(warm[\s-]?ups?|cool[\s-]?downs?|stretch(es|ing)?|tips?|notes?|progression|scaling|nutrition|equipment|total\b|time\b|estimated|why\b|summary|benefits|mobility|cardio|form\b|safety|faq|recovery tips|how to|instructions)/i;
const FINSEC=/^(finisher|optional|bonus|burnout)\b/i;
const MAINSEC=/^(main( workout| lifts?| sets?| circuit)?|(the )?workout|exercises|working sets|circuit|strength)\b/i;
const NOTELINE=/^(focus|time|tempo|goal|note|tips?|cues?|form|why|target|muscles?( worked)?|equipment|alt(ernative)?s?|sub(stitute)?s?)\s*:/i;
const CHATTER=/^(let me know|hope this|feel free|if you|want me|would you|happy to|good luck|enjoy|this workout|this plan|this routine|expect\b|here'?s|here is|sure[,!])/i;
const SETS=[
  /(\d{1,2})\s*(?:sets?\s*)?(?:x|by)\s*(\d{1,3})(?:\s*(?:-|to)\s*(\d{1,3}))?\s*(?:reps?|rep)?/i,
  /(\d{1,2})\s*sets?\s*(?:of|,|:|-)?\s*(\d{1,3})(?:\s*(?:-|to)\s*(\d{1,3}))?\s*(?:reps?)?/i
];
function clean(l){return l.replace(/[×✕✖]/g,'x').replace(/[–—−]/g,'-').replace(/\*\*|__|`/g,'').replace(/^\s*(?:[-*•·▪►>#]+|\(?\d{1,2}[.)]|[a-z][.)](?=\s))\s*/i,'').replace(/\s+/g,' ').trim()}
function restSec(s){
  const m=s.match(/rest(?:ing)?\s*(?:for|:|-)?\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(seconds?|secs?|s\b|minutes?|mins?|m\b|')?/i)||s.match(/(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(seconds?|secs?|s\b|minutes?|mins?|m\b)\s*rest/i);
  if(!m)return null;let v=+(m[2]||m[1]);if(/^m|'/i.test(m[3]||'')||(!m[3]&&v<6))v*=60;return{sec:Math.round(v),txt:m[0]}}
const noParen=s=>s.replace(/\([^)]*\)?/g,'').replace(/\s+/g,' ').trim();
// "Flat Bench Press (Barbell or Dumbbell)" -> {name:'Flat Bench Press', note:'Barbell or Dumbbell'}; "A (x) OR B (y)" -> A, note "or B (y)"
function splitName(raw){
  let n=raw.replace(/[\s:,\-]+$/,'').trim(),notes=[];
  const parts=n.split(/\s+(?:OR|\/)\s+/);
  if(parts.length>1&&noParen(parts[0]).split(' ').length>1){n=parts[0];notes.push('or '+parts.slice(1).join(' or '))}
  const ps=[...n.matchAll(/\(([^)]*)\)/g)].map(m=>m[1].trim()).filter(Boolean);
  if(ps.length){notes.unshift(...ps);n=noParen(n)}
  return{name:n.replace(/[\s:,\-]+$/,'').trim(),note:notes.join(' · ')}}
function nameLike(l){const s=noParen(l).replace(/[:\-]\s*$/,'');return s.length>=3&&s.length<=60&&/^[A-Za-z]/.test(s)&&!/[.!?;]$/.test(l.trim())&&!/:/.test(s)&&s.split(' ').length<=8&&!/\d+\s*(min|sec|%)/i.test(s)}
function tableRow(l){ // "| Bench Press | 4 | 8-10 | 90s |" -> "Bench Press 4x8-10 rest 90s"
  if(!/^\|.*\|/.test(l.trim()))return l;const c=l.split('|').map(x=>x.trim()).filter(x=>x!=='');
  if(c.length>=3&&/^\d{1,2}$/.test(c[1])&&/^\d{1,3}(\s*[-–]\s*\d{1,3})?/.test(c[2]))return `${c[0]} ${c[1]}x${c[2]}${c[3]&&/\d/.test(c[3])?' rest '+c[3]:''}`;
  return ''}
function ruleParse(text){
  const lines=String(text||'').split(/\r?\n/);
  const days=[];let cur=null,last=null,mode='main',pending=null;const unparsed=[],skipped=[];let defRest=null,title='',titleNote='',first=true;
  const newDay=(name,rest)=>{cur={id:Store.uid(),name:name.slice(0,40)||'Day',rest:!!rest,exercises:[]};days.push(cur);last=null;pending=null;return cur};
  const addNote=(e,t)=>{if(!t)return;e.note=((e.note?e.note+' · ':'')+t).slice(0,200)};
  const flush=()=>{if(pending){if(last)addNote(last,pending);else skipped.push(pending);pending=null}};
  const mk=(nm,sets,lo,hi,rest,note)=>{const sp=splitName(nm),L0=libFind(sp.name),L=L0||libFuzzy(sp.name);if(!cur)newDay('Day 1',false);
    last={id:Store.uid(),name:L0?L0.name:(/[A-Z]/.test(sp.name)?sp.name:sp.name.replace(/\b\w/g,c=>c.toUpperCase())),sets:Math.min(sets,10),repMin:lo,repMax:hi,weight:'',rest:rest||defRest||(L&&!L.compound?60:90),note:''};
    addNote(last,sp.note);addNote(last,note);cur.exercises.push(last);return last};
  for(const raw0 of lines){
    const raw=tableRow(raw0);const l=clean(raw);if(!l||/^[-=_*~.|: ]{2,}$/.test(l))continue;
    const wasFirst=first;first=false;
    const head=l.replace(/[:\-–]+\s*$/,'').trim(),hp=noParen(head),short=hp.split(' ').length<=7&&hp.length<70&&!/:\s*\S/.test(head);
    let sm=null;for(const r of SETS){sm=l.match(r);if(sm)break}
    if(!sm&&CHATTER.test(l)){flush();skipped.push(l);continue}
    if(!sm&&DAYWORDS.test(head)){flush();newDay(head,/\b(rest|off|recovery)\b/i.test(head));mode='main';continue}
    if(!sm&&/^(rest|off|recovery)(\s*day)?\s*:?$/i.test(l)){flush();newDay('Rest',true);mode='main';continue}
    if(!sm&&short&&SKIPSEC.test(hp)){flush();mode='skip';last=null;skipped.push(l);continue}
    if(!sm&&short&&FINSEC.test(hp)){flush();mode='fin';last=null;skipped.push(l);continue}
    if(!sm&&MAINSEC.test(hp)&&hp.length<80){flush();mode='main';const r=restSec(head);if(r)defRest=r.sec;continue}
    if(!sm&&/:$/.test(l)&&head.length<40&&/\b(day|push|pull|legs?|upper|lower|body|chest|back|arms)\b/i.test(head)){flush();newDay(head,/\b(rest|off|recovery)\b/i.test(head));mode='main';continue}
    if(mode==='skip'){skipped.push(l);continue}
    if(mode==='fin'){ // best effort: name line -> 2-round finisher; following lines -> notes
      if(!last&&nameLike(l)){mk(l,2,10,20,null,'Optional finisher');continue}
      if(last){const rd=l.match(/(\d{1,2})\s*(rounds?|sets?)/i);if(rd)last.sets=Math.min(+rd[1],10);const r=restSec(l);if(r)last.rest=r.sec;addNote(last,l);continue}
      skipped.push(l);continue}
    if(sm){
      let name=l.slice(0,sm.index).replace(/[\s:,(\-–]+$/,'').trim();
      let after=l.slice(sm.index+sm[0].length);
      if(!name&&pending){name=pending;pending=null}
      if(!name){const m2=after.match(/^[\s:,\-]*([A-Za-z][A-Za-z '()\/&-]{2,})/);if(m2){name=m2[1].trim();after=after.slice(m2[0].length)}}
      flush();
      if(!name||noParen(name).length>60||/^\d/.test(name)){unparsed.push(raw0.trim());continue}
      const r=restSec(l);if(r)after=after.replace(r.txt,'');
      let lo=+sm[2],hi=+(sm[3]||sm[2]);if(hi<lo)[lo,hi]=[hi,lo];
      const note=after.replace(/^[\s,.;:)\-]+|[\s,.;:(\-]+$/g,'').replace(/^reps?\b\s*/i,'').trim();
      mk(name,+sm[1],lo,hi,r?r.sec:null,note.slice(0,140));continue}
    if(wasFirst&&l.length<100){title=noParen(head);const p=head.match(/\(([^)]*)\)/);if(p)titleNote=p[1];continue} // first line = plan title
    if(/^rest\b/i.test(l)&&restSec(l)){flush();defRest=restSec(l).sec;continue} // "Rest 45-60 seconds between sets"
    if(/^total\b/i.test(l)){skipped.push(l);continue}
    if(NOTELINE.test(l)){flush();if(last)addNote(last,l);else skipped.push(l);continue}
    if(nameLike(l)){flush();pending=l;continue}
    if(pending){skipped.push(pending);pending=null}
    if(last){addNote(last,l);continue}
    skipped.push(l); // intro prose etc.
  }
  flush();
  const kept=days.filter(d=>d.rest||d.exercises.length);
  if(kept.length===1&&/^Day 1$/.test(kept[0].name)){const m=(title||'').match(/\b(full[\s-]?body|upper body|lower body|push|pull|legs?|upper|lower|chest|back|arms|shoulders|core|glutes)\b/i);if(m)kept[0].name=m[1].replace(/\b\w/g,c=>c.toUpperCase()).replace(/^Leg$/,'Legs')}
  const plan={id:Store.uid(),name:(title||'Pasted plan').slice(0,50),created:Date.now(),next:0,days:kept};
  if(titleNote)plan.notes=titleNote;
  return{plan,unparsed,skipped};
}
function libFuzzy(n){const k=n.toLowerCase().replace(/\bdb\b/g,'dumbbell').replace(/s\b/g,'').trim();return LIBRARY.find(x=>{const y=x.name.toLowerCase().replace(/s\b/g,'');return y===k||y.endsWith(' '+k)})}
