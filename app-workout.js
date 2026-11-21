// Plans, suggestions, backgrounds, and starting or finishing a workout.
'use strict';
const BGS={
 aurora:'radial-gradient(ellipse at 20% 10%,#1f7a4d 0,transparent 55%),radial-gradient(ellipse at 80% 30%,#1e3a8a 0,transparent 50%),linear-gradient(160deg,#0b1020,#05070c)',
 sunset:'linear-gradient(170deg,#3b0d2e 0%,#7c2d12 45%,#f59e0b 100%)',
 ocean:'radial-gradient(circle at 70% 20%,#0ea5e9 0,transparent 45%),linear-gradient(180deg,#082f49,#020617)',
 steel:'repeating-linear-gradient(135deg,#1c2028 0 14px,#171a21 14px 28px)',
 forest:'radial-gradient(circle at 30% 80%,#166534 0,transparent 50%),linear-gradient(200deg,#052e16,#0a0f0a)',
 ember:'radial-gradient(circle at 50% 110%,#dc2626 0,transparent 55%),radial-gradient(circle at 10% 0,#7c2d12 0,transparent 40%),#0c0a09',
 grape:'linear-gradient(135deg,#2e1065,#701a75 55%,#0f0a1a)',
 grid:'linear-gradient(#ffffff0d 1px,transparent 1px) 0 0/32px 32px,linear-gradient(90deg,#ffffff0d 1px,transparent 1px) 0 0/32px 32px,linear-gradient(180deg,#111827,#030712)'};
const BG_KEY='simplelift_bg_img';
function bgSettings(){return db().settings.bg||{kind:'none',dim:.45}}
function applyBg(){const b=bgSettings();let el=$('#bg');if(!el){el=document.createElement('div');el.id='bg';document.body.prepend(el)}
  let css='';if(b.kind==='preset'&&BGS[b.id])css=BGS[b.id];else if(b.kind==='custom'){const u=localStorage.getItem(BG_KEY);if(u)css=`center/cover no-repeat url("${u}")`}
  el.style.background=css;el.style.setProperty('--dim',css?b.dim:0);document.body.classList.toggle('hasbg',!!css)}
function setBg(o){db().settings.bg=Object.assign(bgSettings(),o);Store.save();applyBg()}
function loadBgFile(file){return new Promise((res,rej)=>{if(!file||!/^image\//.test(file.type))return rej(new Error(t('err.notPic')));
  if(file.size>25e6)return rej(new Error(t('err.picBig')));
  const img=new Image();img.onload=()=>{const sc=Math.min(1,1080/img.width);const c=document.createElement('canvas');c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);let q=.8,u=c.toDataURL('image/jpeg',q);while(u.length>1.4e6&&q>.35){q-=.15;u=c.toDataURL('image/jpeg',q)}
    URL.revokeObjectURL(img.src);if(u.length>1.8e6)return rej(new Error(t('err.picStillBig')));res(u)};
  img.onerror=()=>rej(new Error(t('err.picRead')));img.src=URL.createObjectURL(file)})}
const COLORS=['#4ade80','#60a5fa','#f472b6','#facc15','#fb923c','#a78bfa','#2dd4bf','#f87171'];
// Wizard steps. Questions, hints, option labels and descriptions are translation keys: q.KEY, qh.KEY, o.KEY.VALUE, od.KEY.VALUE.
// opts: [value, hasDescription]
const AI_STEPS=[
 {key:'goal',opts:[['muscle',1],['strength',1],['general',1],['fatloss',1]]},
 {key:'experience',opts:[['beginner',1],['intermediate',1],['advanced',1]]},
 {key:'days',hint:1,opts:[[2],[3],[4],[5],[6],[7]]},
 {key:'minutes',grid:1,opts:[[20],[30],[45],[60],[75],[90],[105],[120]]},
 {key:'equipment',opts:[['full'],['machines'],['dumbbells'],['bodyweight']]},
 {key:'injuries',text:1,hint:1,opts:[]},
 {key:'focus',multi:1,hint:1,opts:[['chest'],['back'],['shoulders'],['biceps'],['triceps'],['quads'],['glutes'],['core']]}
];
function optLabel(k,v){return k==='days'?t('n.day',{n:v}):k==='minutes'?(v===120?t('o.minutes.120'):t('unit.min',{n:v})):t('o.'+k+'.'+v)}
function aiGoalLine(a){const g=['muscle','strength','general','fatloss'].includes(a.goal)?a.goal:'general',x=['beginner','intermediate','advanced'].includes(a.experience)?a.experience:'beginner';return[t('o.goal.'+g),t('o.experience.'+x)].join(' · ')}
function aiSummary(a){const eq=t('sum.eq.'+(['full','machines','dumbbells','bodyweight'].includes(a.equipment)?a.equipment:'full'));
  const w=parseInjuries(a.injuries).words,f=(a.focus||[]).filter(x=>x!=='none');
  return [t('sum.days',{n:+a.days||3}),t('unit.min',{n:+a.minutes||45}),eq,...(w.length?[t('sum.inj',{v:w.slice(0,2).map(x=>t('inj.'+x)).join(t('sum.injAnd'))})]:[]),...(f.length?[t('sum.focus',{v:f.slice(0,2).map(x=>t('sum.f.'+x)).join(' & ')})]:[])].join(', ')}
function injHint(x){const r=parseInjuries(x);return x&&x.trim()?(r.words.length?t('wiz.injOk',{v:`<b class="acc-txt">${r.words.map(x=>esc(t('inj.'+x))).join(', ')}</b>`}):t('wiz.injNone')):''}
function dayColor(d){return d&&d.color||'#4ade80'}
const CHECK_MODES=['set','exercise','none'];
function normMode(m){return CHECK_MODES.includes(m)?m:'set'}
function checkMode(){return normMode(db().settings&&db().settings.checkMode)}
function sessionMode(){const a=db().active;return a&&CHECK_MODES.includes(a.checkMode)?a.checkMode:checkMode()}
function modePicker(){const m=route.v==='session'?sessionMode():checkMode();
  const stick=route.v==='session'?' stick':'';
  return `<div class="seg modes${stick}" id="modePicker" role="radiogroup" aria-label="${tA('cm.aria')}">${CHECK_MODES.map(k=>`<button type="button" role="radio" data-act="checkMode" data-v="${k}" aria-checked="${m===k}" aria-pressed="${m===k}">${t('cm.'+k)}</button>`).join('')}</div>`}
function setCheckMode(v){if(!CHECK_MODES.includes(v))return;db().settings.checkMode=v;
  const a=db().active,plan=Store.activePlan();
  const here=a&&(route.v==='session'||(route.v==='home'&&plan&&a.planId===plan.id&&a.dayIndex===(route.p.sel??a.dayIndex)));
  if(here)a.checkMode=v;Store.save();render();if(here&&typeof Live!=='undefined')Live.push()}
function todayHTML(plan){
  let sel=route.p.sel;if(sel==null||!plan.days[sel]){sel=nextDayIndex(plan);if(sel<0)sel=0}
  const d=plan.days[sel],c=dayColor(d),nx=nextDayIndex(plan);
  const cur=db().active,live=!!(cur&&cur.planId===plan.id&&cur.dayIndex===sel);
  const liveDone=live?cur.exercises.reduce((s,e)=>s+e.sets.filter(x=>x.done).length,0):0;
  const liveTot=live?cur.exercises.reduce((s,e)=>s+e.sets.length,0):0;
  const tabs=`<div class="daytabs" role="tablist" aria-label="${tA('t.days',{name:plan.name})}">${plan.days.map((x,j)=>`<button class="daytab ${j===sel?'on':''}" role="tab" aria-selected="${j===sel}" style="--dc:${esc(dayColor(x))}" data-act="selDay" data-i="${j}">${esc(x.name)}${x.rest?' 💤':''}</button>`).join('')}</div>`;
  if(!d)return tabs+homeHub();
  let body=`<div class="card daycard" style="--dc:${esc(c)}"><div class="between"><div class="grow"><div class="mut">${t('t.plan',{name:esc(plan.name)})}</div><h2 class="dayname">${esc(d.name)} ${sel===nx?`<span class="tag">${t('t.upNext')}</span>`:''}</h2></div>
    <button class="btn sm" data-act="editDay" data-i="${sel}">✎ ${t('title.editDay')}</button></div>`;
  if(d.rest)body+=`<div class="center restbox"><div class="empty-ico" aria-hidden="true">💤</div><h3>${t('day.rest')}</h3><div class="mut">${t('t.restHint')}</div></div></div>`;
  else if(!d.exercises.length)body+=`<div class="mut pad">${t('t.noEx')}</div></div>`;
  else body+=`<div class="mut">${t('n.exercise',{n:d.exercises.length})} · ${t('n.set',{n:d.exercises.reduce((s,e)=>s+(+e.sets||0),0)})}</div>
    ${live?`<div class="mut">${t('home.inProgress',{day:esc(cur.dayName)})} · ${t('s.progress',{done:liveDone,tot:liveTot})}</div>`:''}
    <div class="exlist">${d.exercises.map(e=>{const g=suggest(e),show=firstSug(g),hand=show&&isHand(e)?' '+t('sug.perHand'):'';return `<div class="between lrow"><span>${esc(I18N.exName(e.name))}<br><small class="mut">${esc(sugText(g))}</small></span><span class="right">${e.sets}×${repTxt(e)}<br><small class="dc-txt">${show?esc(num(fmtW(show)))+' '+U()+esc(hand):''}</small></span></div>`}).join('')}</div>
    ${modePicker()}
    <button class="btn full dc-btn" data-act="start" data-i="${sel}">${live?t('home.resume'):t('t.start')}</button></div>`;
  return tabs+homeHub()+body;
}
function uniqueNames(list){const out=[];list.forEach(n=>{const s=String(n||'').trim();if(!s)return;if(!out.some(x=>x.toLowerCase()===s.toLowerCase()))out.push(s)});return out}
function planDayNames(){const names=[];(db().plans||[]).forEach(p=>(p.days||[]).forEach(d=>{if(!d.rest)names.push(d.name)}));return uniqueNames(names)}
function planExerciseNames(){const names=[];(db().plans||[]).forEach(p=>(p.days||[]).forEach(d=>(d.exercises||[]).forEach(e=>names.push(e.name))));return uniqueNames(names)}
function trackPrefs(){const s=db().settings&&db().settings.track;return{days:s&&Array.isArray(s.days)?s.days.slice():[],exercises:s&&Array.isArray(s.exercises)?s.exercises.slice():[]}}
function saveTrack(next){db().settings.track={days:next.days.slice(),exercises:next.exercises.slice()};Store.save()}
function exSeries(name){const key=String(name||'').toLowerCase(),rows=[];
  db().history.slice().sort((a,b)=>a.date-b.date).forEach(w=>(w.exercises||[]).forEach(e=>{
    if(String(e.name||'').toLowerCase()!==key)return;
    const sets=e.sets||[],top=sets.reduce((b,s)=>{const score=(+s.w||0)*(+s.r||0),bs=b?(+b.w||0)*(+b.r||0):-1;return score>bs?s:b},null);
    rows.push({date:w.date,day:w.dayName,w:+(top&&top.w)||0,r:+(top&&top.r)||0,units:w.units||U()})}));
  let best=-1;return rows.map((r,i)=>{const score=r.w*r.r;let mark=i===0?'baseline':'';if(i>0&&score>best)mark='best';if(i===0||score>best)best=score;return Object.assign({},r,{mark})})}
function exerciseTrack(name){const rows=exSeries(name);
  const body=rows.length?rows.slice().reverse().map(r=>`<div class="between lrow"><span><span class="mut">${fmtDate(r.date)}</span><br>${esc(r.day||'')}</span><span>${esc(num(fmtW(r.w)))} ${esc(r.units)} × ${esc(r.r)}${r.mark?` <span class="tag">${t(r.mark==='baseline'?'h.baseline':'h.best')}</span>`:''}</span></div>`).join(''):`<div class="mut mt2">${t('h.noneHint')}</div>`;
  return `<div class="card"><h3>${esc(I18N.exName(name))}</h3><div class="mut">${t('h.exCount',{n:rows.length})}</div>${body}</div>`}
function linkLabel(){const n=typeof netInfo==='function'?netInfo():{on:navigator.onLine!==false,kind:'unknown'};
  if(!n.on)return t('net.offlineTitle');if(n.kind==='wifi')return t('net.viaWifi');if(n.kind==='cell')return t('net.viaCell');return t('net.viaUnknown')}
function syncClass(){if(navigator.onLine===false)return 'bad';if(Sync.a.held==='wifi')return 'wait';if(Sync.a.err)return 'bad';if(Sync.busy)return 'wait';return 'ok'}
function accountCard(){if(typeof API_URL!=='string'||!API_URL)return '';const a=Sync.a;
  if(!a.token)return `<div class="card"><h3>${t('title.account')}</h3><div class="mut">${t('acc.optional')}</div>
  <div class="row mt2"><button class="btn acc" data-act="account" data-mode="up">${t('acc.signUp')}</button><button class="btn" data-act="account" data-mode="in">${t('ac.signIn')}</button></div>
  <div class="mut mt3">${t('net.thisPhone',{v:esc(linkLabel())})}</div></div>`;
  if(a.verified===false)return `<div class="card"><h3>${t('title.account')}</h3><div class="acct-email">${esc(a.email||'')}</div><div class="mut">⚠ ${t('acc.unverified')}</div>
  <div class="row wrap mt2"><button class="btn sm acc" data-act="account" data-mode="verify">${t('acc.enterCode')}</button><button class="btn sm" data-act="acOut">${t('ac.signOut')}</button><button class="btn sm bad" data-act="delAcct">${t('acc.del')}</button></div></div>`;
  const wifi=!!db().settings.syncWifiOnly;
  return `<div class="card" id="acctCard"><h3>${t('title.account')}</h3><div class="acct-email">${esc(a.email||'')}</div>${a.plan?`<div class="mut">${t('acc.plan',{v:a.plan==='paid'?t('acc.paid'):t('acc.free')})}</div>`:''}<div class="sync-line ${syncClass()}" id="syncStatus">${esc(Sync.status())}</div>
  <div class="mut">${t('net.thisPhone',{v:esc(linkLabel())})}</div>
  <button class="btn full" data-act="syncNow">${t('acc.syncNow')}</button>
  <div class="between mt3"><div class="grow"><b>${t('acc.wifiOnly')}</b><div class="mut">${t('acc.wifiOnlyHint')}</div></div><button class="chip ${wifi?'on':''}" data-act="wifiOnly" aria-pressed="${wifi}">${wifi?t('on'):t('off')}</button></div>
  <div class="mut mt2">${t('acc.syncHint')}</div>
  <div class="row wrap mt2"><button class="btn sm" data-act="acOut">${t('ac.signOut')}</button></div>
  <button class="btn sm bad mt3" data-act="delAcct">${t('acc.del')}…</button></div>`}
function updateNet(){const bar=$('#netbar'),dot=$('#netdot');if(!bar||!dot)return;
  const n=typeof netInfo==='function'?netInfo():{on:navigator.onLine!==false,kind:'unknown'};
  const a=(typeof Sync!=='undefined'&&Sync.a)||{};
  let mode='',title='',body='';
  if(!n.on){mode='off';title=t('net.offlineTitle');body=t('net.offlineBody')}
  else if(a.token&&a.held==='wifi'){mode='wait';title=t('net.wifiTitle');body=t('net.wifiBody')}
  else if(a.token&&a.err&&a.held!=='wifi'){mode='err';title=t('net.errTitle');body=String(a.err).replace(/^⚠\s*/,'')}
  bar.className='netbar'+(mode?' '+mode:'');bar.hidden=!mode;
  bar.innerHTML=mode?`<b>${esc(title)}</b><span>${esc(body)}</span>`:'';
  dot.hidden=false;dot.className='netdot '+(!n.on?'off':n.kind==='cell'?'cell':'on');
  dot.setAttribute('title',linkLabel());dot.setAttribute('aria-label',linkLabel())}
// Gentle backup reminder: only without an account, only once workouts exist, at most every 14 days, dismissible.
const NAG_MS=14*864e5;
function backupNag(){const s=db().settings,h=db().history;if(Sync.a.token||!h.length)return'';
  const base=Math.max(s.backupAt||0,s.nagAt||0,Math.min(...h.map(x=>x.date||0)));if(Date.now()-base<NAG_MS)return'';
  return `<div class="card nag" role="status"><b>${t('nag.title')}</b><div class="mut mt1">${t('nag.hint')}</div>
  <div class="row mt2"><button class="btn sm acc" data-act="export">${t('nag.now')}</button><button class="btn sm" data-act="nagLater">${t('nag.later')}</button></div></div>`}
// Recommended weight: same rules as the original app's sug(): no history -> start weight ("Starting estimate" / "Bodyweight");
// last session hit top of rep range on all planned sets -> +5 (upper/db) or +10 (lower) lb; otherwise repeat weight.
function exType(e){return e.type||(isLower(e.name)?'lower':'upper')}
function liftExperience(){const x=db().settings&&db().settings.experience;if(x==='beginner'||x==='intermediate'||x==='advanced')return x;
  const n=(db().history||[]).length;return n>=40?'advanced':n>=12?'intermediate':'beginner'}
function expFactor(x){return x==='advanced'?1.75:x==='intermediate'?1.35:1}
function scaledStart(w){if(!w)return w;const f=expFactor(liftExperience());if(f===1)return w;const stepU=U()==='kg'?2.5:5;return Math.max(stepU,Math.round(w*f/stepU)*stepU)}
function isHand(e){const n=String(e&&e.name||'').toLowerCase();if(/\b(db|dumbbells?|kettlebell|kb)\b/.test(n))return true;
  const L=typeof libFind==='function'?libFind(e.name):null;return !!(L&&(L.equip==='dumbbell'||L.equip==='kettlebell'))}
function firstSug(g){return g&&typeof g.wAt==='function'?g.wAt(0):g&&g.w}
function suggest(e){const l=Store.lastFor(e.name,e.oldId);const start=e.weight===''||e.weight==null?0:+e.weight;
  if(!l||!l.sets.length){if(start)return{w:start,k:'start',last:null,wAt:()=>start};
    const g=scaledStart(startWeight(e.name,U()));return{w:g,k:g?'sugStart':'bw',last:null,guess:!!g,wAt:()=>g}}
  const w=Math.max(...l.sets.map(s=>+s.w||0));const top=l.sets.length>=+e.sets&&l.sets.every(s=>+s.r>=+e.repMax);
  // Per set. Set N comes from set N of last time (or that workout's last set if it had fewer); a progression adds the step to each loaded set.
  const at=n=>l.sets[Math.min(n,l.sets.length-1)],perW=inc=>n=>{const v=+at(n).w||0;return v>0?v+inc:v};
  if(top&&w>0){const inc=step(exType(e)==='lower');return{w:perW(inc)(0),k:'top',inc,last:l,up:1,wAt:perW(inc)}}
  return{w:perW(0)(0),k:'repeat',last:l,wAt:perW(0),rAt:n=>+at(n).r||0}}
// Suggestion reason text, in the current language (kept out of suggest() so a language change applies instantly).
const sugText=g=>t('sug.'+g.k,{n:g.inc,u:U()});
// Re-translate at render so a language change (and unit switch) is instant; startWorkout stores meta, not baked English.
function sessionSugg(e){if(!e)return '';
  let g=e.sugg&&typeof e.sugg==='object'?e.sugg:null;
  if(!g){const w0=e.sets&&e.sets[0]&&(e.sets[0].sw??e.sets[0].w);
    g=suggest({name:e.name,oldId:e.oldId,weight:w0,sets:(e.sets||[]).length,repMin:e.repMin,repMax:e.repMax,type:e.type,lower:e.lower});
    if(!(g&&(g.w||g.k||g.guess)))return typeof e.sugg==='string'&&e.sugg?`<div class="sugg">↑ ${esc(e.sugg)}</div>`:''}
  if(g.k==='top')g={...g,inc:step(exType(e)==='lower')};
  const show=firstSug(g),hand=show&&isHand(e)?' '+t('sug.perHand'):'';
  const txt=(g.guess&&show?t('sug.guess',{w:num(fmtW(show)),u:U()}):t('sug.rec',{w:show?num(fmtW(show))+' '+U():t('sug.bwLc'),why:sugText(g)}))+hand;
  return `<div class="sugg">↑ ${esc(txt)}</div>`}
const createOpts=()=>`<button class="big" data-act="ai">🧭 ${t('co.guided')}<small>${t('co.guidedHint')}</small></button>
  <button class="big" data-act="newPlan">✎ ${t('co.own')}<small>${t('co.ownHint')}</small></button>
  <button class="big" data-act="paste">📷 ${t('co.copy')}<small>${t('co.copyHint')}</small></button>`;
const foot=(...b)=>{b=b.filter(Boolean);return `<div class="foot${b.length>1?' two':''}">${b.join('')}</div>`};
// v19: paid + verified + online -> the photo goes to Grok vision (/ai/parse-image) and opens straight in the plan preview.
// Any AI failure falls back silently to on-device OCR with a short note; Cancel stops the AI request and keeps you on this screen.
let picCtl=null;
// v22: several pictures at once (pages / screenshots of one plan). Picked pictures wait in a tray until "Read".
let picTray=[];
function trayHTML(){if(!picTray.length)return '';
  return `<div class="card tray"><div class="between"><b>${t('p.trayN',{n:picTray.length})}</b><span class="mut">${t('p.trayMax',{n:MAX_PICS})}</span></div>
  <div class="thumbs mt2">${picTray.map((p,i)=>`<div class="thumb"><img src="${p.url}" alt="${tA('p.picN',{n:i+1})}"><button class="icon-btn rm" data-act="rmPic" data-i="${i}" aria-label="${tA('p.rmPic',{n:i+1})}">×</button></div>`).join('')}</div>
  <div class="grid2 mt2">${picTray.length<MAX_PICS?`<button class="btn" data-act="pickPic">＋ ${t('p.addMore')}</button>`:'<span></span>'}<button class="btn acc" data-act="readPics">${t('p.readN',{n:picTray.length})}</button></div></div>`}
function refreshTray(){const el=$('#picTray');if(el)el.innerHTML=trayHTML()}
function addPics(files){const fs=[...files].filter(f=>f&&/^image\//.test(f.type));const room=MAX_PICS-picTray.length;
  if(fs.length>room)toast(t('p.tooMany',{n:MAX_PICS}));
  fs.slice(0,Math.max(0,room)).forEach(f=>picTray.push({file:f,url:URL.createObjectURL(f)}));refreshTray()}
function clearTray(){picTray.forEach(p=>URL.revokeObjectURL(p.url));picTray=[];refreshTray()}
async function runOCR(files){files=Array.isArray(files)?files:[files];const n=files.length;const box=$('#ocrBox');box.hidden=false;const set=(p,m)=>{$('#ocrBar').style.width=Math.round(p*100)+'%';$('#ocrPct').textContent=Math.round(p*100)+'%';$('#ocrMsg').textContent=m+'…'};
  let note='';
  if(aiPrecheck()===''){
    const ctl=picCtl=new AbortController();$('#ocrCancel').hidden=false;$('#ocrSub').textContent=t('p.sending');
    $('#ocrBar').style.width='35%';$('#ocrBar').classList.add('pulse');$('#ocrPct').textContent='';$('#ocrMsg').textContent=t('p.readingAI');
    let r=null;try{const imgs=[];for(const f of files)imgs.push(await imageToJpeg(f));r=await parseImagePlan(imgs,ctl.signal)}catch(e){lastAI={ai:false,note:photoNote('')}}
    if(picCtl===ctl)picCtl=null;const b=$('#ocrBox');if(!b||route.v!=='paste')return;$('#ocrCancel').hidden=true;$('#ocrBar').classList.remove('pulse');
    if(r){openDraft(r.plan);draft._new=1;draft._ai=Object.assign({},lastAI,{photo:true});draft._issues=issuesOf(r);draft._flow='paste';go('editor');toast(t('p.readOK'));return}
    if(ctl.signal.aborted||(lastAI&&lastAI.cancelled)){b.hidden=true;toast(t('cancelled'));return}
    note=(lastAI&&lastAI.note)||photoNote('');$('#ocrSub').textContent=t('p.onPhone')}
  // free / fallback: read each picture on the phone and join the text in order
  try{const parts=[];for(let i=0;i<n;i++){const pre=n>1?t('p.picOf',{i:i+1,n})+' · ':'';
      try{parts.push(await imageToText(files[i],(p,m)=>set((i+p)/n,pre+m)))}catch(e){if(n===1)throw e;parts.push('')}}
    const txt=parts.filter(Boolean).join('\n\n');if(!txt)throw new Error(t('ocr.noText'));
    const ta=$('#pasteText');ta.value=(ta.value.trim()?ta.value.trim()+'\n\n':'')+txt;route.p.text=ta.value;saveFlow();$('#ocrMsg').textContent=t('p.ocrDone');$('#ocrPct').textContent='';
    if(note)$('#ocrSub').textContent='ⓘ '+note;ta.focus()}
  catch(e){box.hidden=true;info(t('p.ocrFail'),String(e&&e.message||e))}}
const issuesOf=r=>({unparsed:r.unparsed,skipped:r.skipped,days:r.plan.days.filter(d=>!d.rest).length,count:r.plan.days.reduce((s,d)=>s+d.exercises.length,0)});
/* ---------- data helpers ---------- */
const vol=w=>w.exercises.reduce((s,e)=>s+e.sets.reduce((a,x)=>a+(+x.w||0)*(+x.r||0),0),0);
const sets=w=>w.exercises.reduce((s,e)=>s+e.sets.length,0);
// Fill missing rests from the library; refresh ones that were auto-filled (restAuto) in case the name changed. User-entered rests are untouched.
function autoRests(p){p.days.forEach(d=>d.exercises.forEach(e=>{if(e.restAuto)e.rest='';fillRest(e)}))}
const newEx=()=>({id:Store.uid(),name:'',sets:3,repMin:8,repMax:12,weight:'',rest:'',restAuto:true,note:''}); // rest filled from the library when a name is chosen
const clone=o=>JSON.parse(JSON.stringify(o));
function blankPlan(){return{id:Store.uid(),name:t('ed.namePh'),created:Date.now(),next:0,days:[{id:Store.uid(),name:t('dayN',{n:1}),rest:false,exercises:[newEx()]}]}}
const swap=(a,i,j)=>{if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]]};

async function startWorkout(i){
  const plan=Store.activePlan(),d=plan.days[i],cur=db().active;
  // v27: never silently replace a workout in progress
  if(cur){if(cur.planId===plan.id&&cur.dayIndex===i){if(route.v==='session'){render();scrollToFocus()}else go('session');return}
    if(!await ask(t('s.discardQ'),t('s.discardMsg'),t('s.discard'),'bad',t('fin.keep'))){if(route.v==='session')return;go('session');return}}
  const ex=d.exercises.filter(e=>e.name.trim()).map(e=>{
    const g=suggest(e),last=g.last,lower=exType(e)==='lower';
    // v29: reps always start at the plan's target; what was done last time stays visible in the 'Last' line. Weights still recall per set.
    const w=g.w||'',r=+e.repMin||8;
    const wN=n=>g.wAt?(g.wAt(n)||''):w,rN=()=>r;
    const lastTxt=last?last.sets.map(s=>`${fmtW(s.w)||0}×${s.r}`).join(', '):'',sugg={guess:!!(g.guess&&g.w),w:g.w,k:g.k,inc:g.inc};
    return{id:e.id,oldId:e.oldId,type:e.type,name:e.name,lower,repMin:+e.repMin,repMax:+e.repMax,rest:restOf(e),note:e.note,last:lastTxt,sugg,sets:[...Array(Math.max(1,+e.sets||1))].map((_,n)=>({w:wN(n),sw:wN(n),r:rN(n),done:false,ws:'s'}))}});
  if(!ex.length){toast(t('t.addFirst'));return}
  stopTimer(); // an old interval must not keep alarming over a new workout
  // Reps and weights below live on the session only. The plan's repMin/repMax/weight stay the saved defaults.
  clearSessionMarker();
  db().active={id:Store.uid(),planId:plan.id,planName:plan.name,dayIndex:i,dayName:d.name,started:Date.now(),focus:0,checkMode:checkMode(),rev:0,order:ex.map((_,n)=>n),exercises:ex};Store.save();go('session');
  if(typeof Live!=='undefined')Live.push();
}
// Finish, discard and sign-out all go through here so a later sync cannot revive the session.
function endSession(){markSessionCleared();stopTimer();if(db().active){db().active=null;Store.save()}
  if(typeof Sync!=='undefined'&&Sync.on())Sync.now()} // push active:cleared + history immediately so a second device cannot revive this session
// Mark every unticked set done, filling blanks with the previous set's weight or the recommended weight, and the rep target.
function fillRemaining(a){const pl=Store.plan(a.planId),day=pl&&pl.days[a.dayIndex];
  a.exercises.forEach(le=>{const pe=day&&day.exercises.find(e=>e.name===le.name);
    le.sets.forEach((st,k)=>{if(st.done)return;
      if(st.w===''||st.w==null){const prev=k>0?le.sets[k-1].w:'';st.w=prev!==''&&prev!=null?prev:(pe?((g=>g.wAt?g.wAt(k):g.w)(suggest(pe))):0);st.ws=st.ws||'s'}
      if(st.r===''||st.r==null)st.r=pe?(+pe.repMin||8):8;
      st.done=true})});Store.save()}
async function finishFlow(){const a=db().active;if(!a)return;
  if(sessionMode()==='none'){fillRemaining(a);finishWorkout();return}
  const left=a.exercises.reduce((n,e)=>n+e.sets.filter(x=>!x.done).length,0),done=a.exercises.reduce((n,e)=>n+e.sets.filter(x=>x.done).length,0);
  if(!left)return finishWorkout();
  const acts=[{v:'fill',label:t('fin.fill',{n:left}),cls:'acc'}];
  acts.push(done?{v:'ticked',label:t('fin.ticked',{n:done})}:{v:'close',label:t('fin.close'),cls:'bad'});
  acts.push({v:null,label:t('fin.keep')});
  const v=await sheet({title:t('fin.title'),msg:t('fin.msg',{n:left}),actions:acts});
  if(v==='fill'){fillRemaining(a);finishWorkout()}else if(v==='ticked'||v==='close')finishWorkout()}
function finishWorkout(){
  const a=db().active;if(!a)return;
  if(typeof Live!=='undefined')Live.finish();
  const exs=a.exercises.map(e=>({name:e.name,oldId:e.oldId,type:e.type,lower:e.lower,sets:e.sets.filter(s=>s.done).map(s=>({w:+s.w||0,r:+s.r||0}))})).filter(e=>e.sets.length);
  if(exs.length)Store.addHistory({id:a.id,date:Date.now(),planId:a.planId,planName:a.planName,dayName:a.dayName,units:U(),minutes:Math.round((Date.now()-a.started)/6e4),exercises:exs});
  const p=Store.plan(a.planId);if(p){p.next=(a.dayIndex+1)%p.days.length;Store.upsertPlan(p)}
  endSession();stack=[];toast(exs.length?t('fin.saved'):t('fin.closed'));route={v:'history',p:{}};afterNav()}
async function wipeLocalAppData(){
  endSession();draft=null;
  try{Store.reset()}catch(e){}
  try{
    const keep=new Set();
    const drop=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&k.startsWith('simplelift'))drop.push(k);
    }
    for(const k of drop)localStorage.removeItem(k);
  }catch(e){}
  try{
    if(window.indexedDB&&indexedDB.databases){
      const dbs=await indexedDB.databases();
      for(const d of dbs||[]){
        if(d&&d.name&&/simplelift|tesseract|^keyval-store$/i.test(d.name))indexedDB.deleteDatabase(d.name);
      }
    }
  }catch(e){}
  try{
    if(window.caches){
      for(const k of await caches.keys()){
        if(/ocr|tesseract/i.test(k))await caches.delete(k);
      }
    }
  }catch(e){}
  try{applyBg()}catch(e){}
  try{if(typeof applyFs==='function')applyFs()}catch(e){}
}
function localReset(){wipeLocalAppData()}
