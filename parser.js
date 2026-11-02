// ===== PASTE-PARSER HOOK =====
// parseTextPlan(text) -> {plan, unparsed:[lines], skipped:[lines]}. Rule-based today.
// To use a real AI parser later, replace the body with a backend call returning the same shape (caller awaits it).
async function parseTextPlan(text){return ruleParse(text)}

const DAYWORDS=/^(day\s*\d+|week\s*\d+|(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\b|workout\s*[a-z0-9]\b|session\s*\d+|(upper|lower|push|pull|legs?|full[\s-]?body|chest|back|arms|shoulders)(\s+(day|body|[a-z]))?\s*[:\-]?\s*$)/i;
const SKIPSEC=/^(warm[\s-]?up|cool[\s-]?down|stretch|tips?|notes?|optional|finisher|cardio|mobility)\b/i;
const MAINSEC=/^(main( workout| lifts?)?|workout|exercises|the workout)\b/i;
const SETS=[
  /(\d{1,2})\s*(?:sets?\s*)?(?:x|by)\s*(\d{1,3})(?:\s*(?:-|to)\s*(\d{1,3}))?\s*(?:reps?|rep)?/i,
  /(\d{1,2})\s*sets?\s*(?:of|,|:|-)?\s*(\d{1,3})(?:\s*(?:-|to)\s*(\d{1,3}))?\s*(?:reps?)?/i
];
function clean(l){return l.replace(/[×✕✖]/g,'x').replace(/[–—−]/g,'-').replace(/\*\*|__|`/g,'').replace(/^\s*(?:[-*•·▪►>#]+|\(?\d{1,2}[.)]|[a-z][.)](?=\s))\s*/i,'').replace(/\s+/g,' ').trim()}
function restSec(s){
  const m=s.match(/rest(?:ing)?\s*(?:for|:|-)?\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(seconds?|secs?|s\b|minutes?|mins?|m\b|')?/i)||s.match(/(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(seconds?|secs?|s\b|minutes?|mins?|m\b)\s*rest/i);
  if(!m)return null;let v=+(m[2]||m[1]);if(/^m|'/i.test(m[3]||'')||(!m[3]&&v<6))v*=60;return{sec:Math.round(v),txt:m[0]}}
function ruleParse(text){
  const lines=String(text||'').split(/\r?\n/);
  const days=[];let cur=null,last=null,mode='main';const unparsed=[],skipped=[];let defRest=null,title='',first=true;
  const newDay=(name,rest)=>{cur={id:Store.uid(),name:name.slice(0,40)||'Day',rest:!!rest,exercises:[]};days.push(cur);last=null;return cur};
  for(const raw of lines){
    const l=clean(raw);if(!l||/^[-=_*~.]{2,}$/.test(l))continue;
    const wasFirst=first;first=false;
    const head=l.replace(/[:\-–]+\s*$/,'').trim();
    let sm=null;for(const r of SETS){sm=l.match(r);if(sm)break}
    // day heading
    if(!sm&&(DAYWORDS.test(head)||(/:$/.test(l)&&head.length<40&&/\b(day|push|pull|legs?|upper|lower|body|chest|back|arms)\b/i.test(head)))){
      const rest=/\b(rest|off|recovery)\b/i.test(head);newDay(head.replace(/\s*[:\-]\s*$/,''),rest);mode='main';continue}
    if(!sm&&/^(rest|off|recovery)(\s*day)?\b/i.test(l)&&l.length<40){newDay('Rest',true);mode='main';continue}
    if(!sm&&SKIPSEC.test(head)){mode='skip';skipped.push(l);continue}
    if(!sm&&MAINSEC.test(head)&&head.length<80){mode='main';const r=restSec(head);if(r)defRest=r.sec;continue}
    if(mode==='skip'){skipped.push(l);continue}
    if(sm){
      let name=l.slice(0,sm.index).replace(/[\s:,(\-–]+$/,'').replace(/\s*-\s*$/,'').trim();
      let after=l.slice(sm.index+sm[0].length);
      if(!name){const m2=after.match(/^[\s:,\-]*([A-Za-z][A-Za-z '()\/&-]{2,})/);if(m2){name=m2[1].trim();after=after.slice(m2[0].length)}}
      if(!name||name.length>60||/^\d/.test(name)){unparsed.push(raw.trim());continue}
      if(!cur)newDay('Day 1',false);
      const r=restSec(l);if(r)after=after.replace(r.txt,'');
      let lo=+sm[2],hi=+(sm[3]||sm[2]);if(hi<lo)[lo,hi]=[hi,lo];
      const note=after.replace(/^[\s,.;:)\-]+|[\s,.;:(\-]+$/g,'').replace(/^reps?\b\s*/i,'').trim();
      const L0=libFind(name),L=L0||libFuzzy(name);
      last={id:Store.uid(),name:L0?L0.name:name.replace(/\b\w/g,c=>c.toUpperCase()),sets:Math.min(+sm[1],10),repMin:lo,repMax:hi,weight:'',rest:r?r.sec:defRest||(L&&!L.compound?60:90),note:note.slice(0,140)};
      cur.exercises.push(last);continue}
    if(last&&!/[!?]$/.test(l)){last.note=(last.note?last.note+' · ':'')+l;last.note=last.note.slice(0,200);continue}
    if(wasFirst&&l.length<80){title=l;continue} // first line = plan title
    unparsed.push(raw.trim());
  }
  const plan={id:Store.uid(),name:(title||'Pasted plan').slice(0,50),created:Date.now(),next:0,days:days.filter(d=>d.rest||d.exercises.length)};
  return{plan,unparsed,skipped};
}
function libFuzzy(n){const k=n.toLowerCase().replace(/\bdb\b/g,'dumbbell').replace(/s\b/g,'').trim();return LIBRARY.find(x=>{const y=x.name.toLowerCase().replace(/s\b/g,'');return y===k||y.endsWith(' '+k)})}
