// ===== PASTE-PARSER HOOK =====
// parseTextPlan(text) -> {plan, unparsed:[lines], skipped:[lines]}. Rule-based today.
// To use a real AI parser later, replace the body with a backend call returning the same shape (caller awaits it).
// v17: AI first (signed-in + verified accounts, via the Simple Lift server -> xAI Grok API), rule-based fallback on ANY failure.
async function parseTextPlan(text){
  const r=await aiRequest('/ai/parse',{text:String(text||'').slice(0,AI_TEXT_MAX)});
  if(r.ok){const plan=aiToPlan(r.j.plan);if(plan.days.some(d=>d.exercises.length))return{plan,unparsed:r.j.unparsed||[],skipped:[]};lastAI=aiNote(null,'bad')}
  return ruleParse(text)}
// v19: photo import with Grok vision (paid accounts). Returns {plan,unparsed,skipped} or null = caller falls back to on-device OCR.
// lastAI.note is reworded for photos ("...so I read the picture on your phone"). An aborted request (Cancel) returns null with lastAI.cancelled.
// v22: dataUrls can be one picture or an array (max MAX_PICS, pages of one plan) -> ONE request, counted as one AI use.
const MAX_PICS=6;
async function parseImagePlan(dataUrls,signal){
  const list=(Array.isArray(dataUrls)?dataUrls:[dataUrls]).slice(0,MAX_PICS);
  const r=await aiRequest('/ai/parse-image',list.length===1?{image:list[0],mime:'image/jpeg'}:{images:list,mime:'image/jpeg'},signal);
  if(r.ok){const plan=aiToPlan(r.j.plan);if(plan.days.some(d=>d.exercises.length))return{plan,unparsed:r.j.unparsed||[],skipped:[]};lastAI=aiNote(null,'bad')}
  if(signal&&signal.aborted){lastAI={ai:false,note:'',cancelled:true};return null}
  lastAI.note=photoNote(lastAI.note);return null}
// photo import wording: same reasons as aiNote, but the fallback is on-phone text reading instead of the built-in builder
const photoNote=n=>{const w=n&&lastAI&&lastAI.why;return !n?t('aiph.fail'):['limit','offline','paid','bad'].includes(w)?t('aiph.'+w):n};

// ===== AI client (shared by generatePlan + parseTextPlan) =====
// lastAI = {ai:true,remaining} after an AI result, or {ai:false,note} after a fallback (note '' = nothing worth showing).
let lastAI=null;const AI_TEXT_MAX=6000;
function aiNote(remaining,why){
  if(why===null)return{ai:true,remaining};
  const n=['signin','verify','limit','offline','paid','bad'].includes(why)?t('ai.'+why):'';
  return{ai:false,note:n,why:n?why:'',remaining:why==='limit'?0:remaining}}
// '' = AI can be tried; otherwise the reason it can't (none|signin|verify|offline). No network.
function aiPrecheck(){
  if(typeof API_URL!=='string'||!API_URL||typeof Sync==='undefined'||typeof fetch!=='function')return 'none';
  const a=Sync.a;if(!a.token)return 'signin';if(a.verified===false)return 'verify';if(a.plan==='free')return 'paid';
  if(typeof navigator!=='undefined'&&navigator.onLine===false)return 'offline';return ''}
async function aiRequest(path,body,signal){
  lastAI=aiNote(null,'');lastAI.ai=false;
  try{
    const why=aiPrecheck();if(why){lastAI=aiNote(null,why);return{ok:false}}
    const a=Sync.a;
    const ctl=typeof AbortController==='function'?new AbortController():null;const t=ctl&&setTimeout(()=>ctl.abort(),50000);
    if(ctl&&signal){if(signal.aborted)ctl.abort();else signal.addEventListener('abort',()=>ctl.abort())}
    const r=await fetch(API_URL.replace(/\/+$/,'')+path,{method:'POST',signal:ctl&&ctl.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+a.token},body:JSON.stringify(Object.assign({},body,{lang:typeof I18N==='object'?I18N.lang():'en'}))}).finally(()=>t&&clearTimeout(t));
    const j=await r.json().catch(()=>({}));
    if(r.ok&&j&&j.plan&&Array.isArray(j.plan.days)){lastAI=aiNote(j.remaining,null);return{ok:true,j}}
    if(j.error==='not_paid'&&Sync.set)Sync.set({plan:'free'});lastAI=aiNote(j.remaining,r.status===429&&j.error==='limit'?'limit':j.error==='not_paid'?'paid':j.error==='unverified'?'verify':r.status===401?'signin':j.error==='ai_unavailable'?'':'bad');return{ok:false}
  }catch(e){lastAI=aiNote(null,typeof navigator!=='undefined'&&navigator.onLine===false?'offline':'bad');return{ok:false}}}
// Server plan (already validated + clamped there) -> exact Store plan shape. Library names are used when they match; missing rest -> library default.
function aiToPlan(p,extra){
  const n=(v,lo,hi,d)=>{v=Math.round(+v);return isFinite(v)?Math.max(lo,Math.min(hi,v)):d};
  const days=(Array.isArray(p&&p.days)?p.days:[]).slice(0,7).map((d,i)=>{const ex=(Array.isArray(d.exercises)?d.exercises:[]).slice(0,12).filter(e=>e&&typeof e.name==='string'&&e.name.trim()).map(e=>{
      const nm=String(e.name).trim().slice(0,60),L=libFind(nm)||libFuzzy(nm);
      return fillRest({id:Store.uid(),name:L?L.name:nm,sets:n(e.sets,1,10,3),repMin:n(e.repMin,1,100,8),repMax:Math.max(n(e.repMin,1,100,8),n(e.repMax,1,100,10)),weight:'',rest:hasRest(e.rest)?n(e.rest,0,600,90):null,note:String(e.note||'').slice(0,200)})});
    const rest=!!d.rest&&!ex.length;return{id:Store.uid(),name:String(d.name||'').slice(0,40)||(rest?t('g.rest'):t('g.day',{n:i+1})),rest,exercises:rest?[]:ex,_est:rest?0:n(d.estMinutes,0,240,0)}});
  const est=days.filter(d=>!d.rest&&d._est).map(d=>`${d.name} ~${d._est} min`);days.forEach(d=>delete d._est);
  const notes=[String(p&&p.notes||'').slice(0,400),est.length?t('g.est',{list:est.join(' · ')}):''].filter(Boolean).join('\n');
  const plan=Object.assign({id:Store.uid(),name:String(p&&p.name||t('g.aiPlan')).slice(0,50),created:Date.now(),next:0},notes?{notes}:{},extra||{},{days});
  return plan}

const DAYWORDS=/^(day\s*\d+|week\s*\d+|(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\b|workout\s*[a-z0-9]\b|session\s*\d+|(upper|lower|push|pull|legs?|full[\s-]?body|chest|back|arms|shoulders)(\s+(day|body|[a-z])){0,2}\s*[:\-]?\s*$)/i;
const SKIPSEC=/^(key\b|principles?\b|guidelines?\b|rules\b|takeaways?\b|important\b|final (notes?|tips?|thoughts?)|general\b|questions?\b|important|warm[\s-]?ups?|cool[\s-]?downs?|stretch(es|ing)?|tips?|notes?|progression|scaling|nutrition|equipment|total\b|time\b|estimated|why\b|summary|benefits|mobility|cardio|form\b|safety|faq|recovery tips|how to|instructions)/i;
const FINSEC=/^(finisher|optional|bonus|burnout)\b/i;
const MAINSEC=/^((workout|training|exercise|program)\s+(breakdown|details|plan)|breakdown\b|main( workout| lifts?| sets?| circuit)?|(the )?workout|exercises|working sets|circuit|strength)\b/i;
const NOTELINE=/^(focus|time|tempo|goal|note|tips?|cues?|form|why|target|muscles?( worked)?|equipment|alt(ernative)?s?|sub(stitute)?s?)\s*:/i;
const CHATTER=/^(let me know|hope this|feel free|if you|want me|would you|happy to|good luck|enjoy|this workout|this plan|this routine|expect\b|here'?s|here is|sure[,!])/i;
const SETS=[
  /(\d{1,2})\s*(?:sets?\s*)?(?:x|by)\s*(\d{1,3})(?:\s*(?:-|to)\s*(\d{1,3}))?\s*(?:reps?|rep)?/i,
  /(\d{1,2})\s*sets?\s*(?:of|,|:|-)?\s*(\d{1,3})(?:\s*(?:-|to)\s*(\d{1,3}))?\s*(?:reps?)?/i
];
// Day heading in any common form -> {name,key,rest} or null. Examples:
// "Day 1: Push A (Chest & Shoulder Focus)", "Push A:", "Push A: Chest & Shoulders (Heavy...)", "Monday - Pull", "Pull B: Upper Back...",
// "Legs", "Push Day", "Day 7: Rest & Recovery", "Rest", "Off", "Recovery". key = short id used to match an overview list to its breakdown.
const SPLITW='(?:push|pull|legs?|leg day|upper(?: body)?|lower(?: body)?|full[\\s-]?body|chest|back|arms|shoulders|glutes|core|hamstrings|quads|posterior chain|rest|off|recovery|active recovery|cardio)';
const HEAD_RE=new RegExp('^'+SPLITW+'(?:\\s*(?:&|and|\\/|\\+)\\s*'+SPLITW+')?(?:\\s+(?:day|workout|session))?(?:\\s+(?:[a-d]|[1-9]|i{1,3}|iv))?(?:\\s+(?:day|workout))?\\s*(?:$|(?::|\\(|\\s+-\\s)\\s*(.*)$)','i');
const DAYPFX=/^(day\s*\d+|week\s*\d+\s*day\s*\d+|(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?|workout\s*[a-z0-9]|session\s*\d+)\b\s*(?:[:\-.)]\s*(.*))?$/i;
const RESTW=/^(rest|off|recovery|active recovery)\b(?!.*\d+\s*x\s*\d)/i;
function dayKey(s){return noParen(String(s)).toLowerCase().split(/\s*[:\-]\s*/)[0].replace(/\b(day|workout|session|focus)\b/g,' ').replace(/[^a-z0-9& ]/g,' ').replace(/\s+/g,' ').trim()}
function dayHead(l){
  if(/[.!?]$/.test(l)&&l.length>40)return null;if(l.length>90)return null;
  let m=l.match(DAYPFX);
  if(m){const rest2=(m[2]||'').trim();if(/\d+\s*x\s*\d/i.test(rest2))return null;const lbl=noParen(rest2).replace(/[:\-]+$/,'').trim();
    return{name:noParen(l).replace(/[:\-]+$/,'').trim().slice(0,40),key:lbl?dayKey(lbl):dayKey(m[1]),rest:!lbl?false:RESTW.test(lbl)||/^(rest|off)\b|\brest day\b/i.test(lbl)}}
  if(RESTW.test(l)&&restSec(l))return null; // "Rest: 90 seconds between sets" is a rest time, not a rest day
  m=l.match(HEAD_RE);
  if(m){const nm=noParen(l.split(/\s*:\s*/)[0]).replace(/[\-]+$/,'').trim();return{name:nm.slice(0,40),key:dayKey(nm),rest:RESTW.test(nm)}}
  return null}
function clean(l){return l.replace(/[×✕✖]/g,'x').replace(/[–—−]/g,'-').replace(/\*\*|__|`/g,'').replace(/^\s*(?:[-*•·▪►>#]+|\(?\d{1,2}[.)]|[a-z][.)](?=\s))\s*/i,'').replace(/\s+/g,' ').replace(/\b(\d{1,2})\s*(?:-|to)\s*(\d{1,2})(\s*sets?\b)/i,(a,x,y,z)=>Math.max(+x,+y)+z).trim()} // "3-4 sets" -> 4 sets (upper bound, same rule as rest ranges)
// restSec(line) -> {sec,txt} or null. Explicit rest wins over any library default.
// Accepts: "rest 90s", "rest: 2 min", "90 sec rest", "1:30 rest", "rest 1:30", "rest 2-3 min", "60-90s rest", "2 minutes of rest", "rest period 90 seconds", "R: 90s".
// Ranges use the UPPER bound consistently ("rest 2-3 min" -> 180, "60-90s rest" -> 90).
function restSec(s){
  const mm=s.match(/(?:\brest(?:ing)?(?:\s*period)?\s*(?:for|:|-|=)?\s*(?:\d{1,2}:\d{2}\s*-\s*)?(\d{1,2}):(\d{2}))|(?:(?:\d{1,2}:\d{2}\s*-\s*)?(\d{1,2}):(\d{2})\s*(?:min(?:utes?)?\s*)?(?:of\s*)?rest\b)/i);
  if(mm){const a=mm[1]||mm[3],b=mm[2]||mm[4];return{sec:(+a)*60+(+b),txt:mm[0]}}
  const m=s.match(/\b(?:rest(?:ing)?(?:\s*period)?|r)\s*(?:for|:|-|=)?\s*(\d+(?:\.\d+)?)(?:\s*(?:-|to)\s*(\d+(?:\.\d+)?))?\s*(seconds?|secs?|s\b|minutes?|mins?|m\b|')?/i)||s.match(/(\d+(?:\.\d+)?)(?:\s*(?:-|to)\s*(\d+(?:\.\d+)?))?\s*(seconds?|secs?|s\b|minutes?|mins?|m\b|')\s*(?:of\s*)?(?:rest|break)/i);
  if(!m)return null;if(/^r$/i.test(m[0].trim().split(/[\s:]/)[0])&&!m[3])return null;let v=+(m[2]||m[1]);if(/^m|'/i.test(m[3]||'')||(!m[3]&&v<6))v*=60;return{sec:Math.round(v),txt:m[0]}}
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
    last={id:Store.uid(),name:L0?L0.name:(/[A-Z]/.test(sp.name)?sp.name:sp.name.replace(/\b\w/g,c=>c.toUpperCase())),sets:Math.min(sets,10),repMin:lo,repMax:hi,weight:'',rest:hasRest(rest)?rest:hasRest(defRest)?defRest:null,note:''} // null = not given; filled once at the end;
    addNote(last,sp.note);addNote(last,note);cur.exercises.push(last);return last};
  for(const raw0 of lines){
    const raw=tableRow(raw0);const l=clean(raw);if(!l||/^[-=_*~.|: ]{2,}$/.test(l))continue;
    const wasFirst=first;first=false;
    const head=l.replace(/[:\-–]+\s*$/,'').trim(),hp=noParen(head),short=hp.split(' ').length<=7&&hp.length<70&&!/:\s*\S/.test(head);
    let sm=null;for(const r of SETS){sm=l.match(r);if(sm)break}
    if(!sm&&!title){const pm=l.match(/^(?:plan|program|routine)\s*(?:name)?\s*:\s*(.{2,60})$/i);if(pm){title=noParen(pm[1]);first=false;continue}}
    if(!sm&&CHATTER.test(l)){flush();skipped.push(l);continue}
    const dh=!sm&&!(mode==='skip'&&!DAYPFX.test(head))?dayHead(head):null;
    if(dh){flush();const d=newDay(dh.name,dh.rest);d._key=dh.key;mode='main';continue}
    if(sm&&cur&&cur.rest){newDay('Day '+(days.length+1),false)} // exercises never land on a rest day
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
      const note=after.replace(/^[\s,.;:)\-]+|[\s,.;:(\-]+$/g,'').replace(/^reps?\b\s*/i,'').trim().replace(/^\((.*)\)$/,'$1');
      mk(name,+sm[1],lo,hi,r?r.sec:null,note.slice(0,140));continue}
    if(wasFirst&&l.length<100){title=noParen(head).replace(/^(plan|program|routine)\s*(name)?\s*:\s*/i,'');const p=head.match(/\(([^)]*)\)/);if(p)titleNote=p[1];continue} // first line = plan title
    if(/^rest\b/i.test(l)&&restSec(l)){flush();defRest=restSec(l).sec;continue} // "Rest 45-60 seconds between sets"
    if(/^total\b/i.test(l)){skipped.push(l);continue}
    if(NOTELINE.test(l)){flush();if(last)addNote(last,l);else skipped.push(l);continue}
    if(nameLike(l)){flush();pending=l;continue}
    if(pending){skipped.push(pending);pending=null}
    if(last){addNote(last,l);continue}
    skipped.push(l); // intro prose etc.
  }
  flush();
  // Single place library defaults are applied: only where the text gave no rest (rest===null). Explicit values are never touched.
  days.forEach(d=>d.exercises.forEach(fillRest));
  let kept=days.filter(d=>d.rest||d.exercises.length);
  // Overview list ("Day 1: Push A", ... "Day 7: Rest") followed by named sections ("Push A: ..."): order days by the overview,
  // fill each from its section by name, keep rest days. A section may be reused (Push, Pull, Rest, Push, Pull, Rest).
  const ov=days.filter(d=>!d.exercises.length&&d._key!==undefined),secs=days.filter(d=>d.exercises.length);
  if(ov.length>=2&&secs.length){const find=k=>secs.find(s=>s._key===k)||secs.find(s=>s._key&&k&&(s._key.startsWith(k+' ')||k.startsWith(s._key+' ')));
    const work=ov.filter(d=>!d.rest);if(work.length&&work.every(d=>find(d._key))){const used=new Set();
      kept=ov.map(d=>{if(d.rest)return{id:Store.uid(),name:d.name,rest:true,exercises:[]};const s=find(d._key);const again=used.has(s);used.add(s);
        return{id:Store.uid(),name:d.name,rest:false,exercises:s.exercises.map(e=>again?Object.assign({},e,{id:Store.uid()}):e)}});
      secs.filter(s=>!used.has(s)).forEach(s=>kept.push(s))}}
  kept.forEach(d=>delete d._key);
  if(kept.length===1&&/^Day 1$/.test(kept[0].name)){const m=(title||'').match(/\b(full[\s-]?body|upper body|lower body|push|pull|legs?|upper|lower|chest|back|arms|shoulders|core|glutes)\b/i);if(m)kept[0].name=m[1].replace(/\b\w/g,c=>c.toUpperCase()).replace(/^Leg$/,'Legs')}
  const plan={id:Store.uid(),name:(title||'Pasted plan').slice(0,50),created:Date.now(),next:0,days:kept};
  if(titleNote)plan.notes=titleNote;
  return{plan,unparsed,skipped};
}
function libFuzzy(n){const k=n.toLowerCase().replace(/\bdb\b/g,'dumbbell').replace(/s\b/g,'').trim();return LIBRARY.find(x=>{const y=x.name.toLowerCase().replace(/s\b/g,'');return y===k||y.endsWith(' '+k)})}
