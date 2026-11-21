// Screen templates. Called from render(); helpers they use are loaded with the other app scripts.
'use strict';
/* ---------- views ---------- */
// Add a watch by appending {id, ready}. id matches watch.type.<id> and, when ready, pair.lead.<id>.
const WATCH_TYPES=[{id:'samsung',ready:true},{id:'garmin',ready:true},{id:'apple',ready:true}];
const watchType=id=>WATCH_TYPES.find(w=>w.id===id);
const VIEWS={
chooser(){return `<div class="mut">${t('chooser.intro')}</div>`+createOpts()},
home(){
  if(!legalOK())return legalNotice();
  const a=db().active,plan=Store.activePlan();let h=backupNag();
  if(a)h+=`<button class="big acc" data-act="resume">${t('home.resume')}<small>${t('home.inProgress',{day:esc(a.dayName)})}</small></button>`;
  const hub=homeHub();
  if(plan)return h+todayHTML(plan);
  if(db().plans.length)return h+`<div class="card empty"><h2>${t('home.pickPlan')}</h2><div class="mut">${t('home.pickPlanHint')}</div><button class="btn acc full" data-act="goPlans">${t('home.goPlans')}</button></div>`+hub;
  return h+`<div class="card empty"><div class="empty-ico" aria-hidden="true">🏋️</div><h2>${t('home.noPlan')}</h2><div class="mut">${t('home.noPlanHint')}</div>
    <button class="btn acc full" data-act="chooser">${t('plans.new')}</button>
    ${typeof API_URL==='string'&&API_URL&&!Sync.a.token?`<div class="mut mt3">${t('home.haveAcct')}</div><div class="row mt2"><button class="btn" data-act="account" data-mode="in" data-from="home">${t('ac.signIn')}</button><button class="btn" data-act="account" data-mode="up" data-from="home">${t('ac.create')}</button></div>`:''}</div>`+hub;
},
plans(){
  const ps=db().plans;
  return `<button class="btn acc full" data-act="chooser">${t('plans.new')}</button>`+(ps.length?ps.map(p=>{const tr=p.days.filter(d=>!d.rest).length,rs=p.days.length-tr;
    return `<div class="card"><div class="between"><div class="grow"><h3>${esc(p.name)}</h3><div class="mut">${t('n.trainingDay',{n:tr})}${rs?` · ${t('n.restDay',{n:rs})}`:''}</div></div>
    ${p.id===db().activePlanId?`<span class="tag">${t('plans.active')}</span>`:`<button class="btn sm" data-act="activate" data-id="${p.id}">${t('plans.use')}</button>`}</div>
    <div class="row mt3"><button class="btn grow" data-act="edit" data-id="${p.id}">${t('edit')}</button><button class="btn" data-act="dup" data-id="${p.id}">${t('copy')}</button><button class="btn bad" data-act="delPlan" data-id="${p.id}">${t('delete')}</button></div></div>`}).join('')
    :`<div class="card empty"><div class="empty-ico" aria-hidden="true">📋</div><h3>${t('plans.none')}</h3><div class="mut">${t('plans.noneHint')}</div></div>`);
},
editor(){
  const p=draft;
  const I=p._issues;const iss=I?`<div class="card issues ${I.unparsed.length?'warn':'good'}"><b>${t('ed.found',{ex:t('n.exercise',{n:I.count}),days:t('n.day',{n:I.days})})}</b> ${t('ed.checkBelow')}
    ${I.unparsed.length?`<div class="warn-txt mt2">${t('ed.unparsed',{n:I.unparsed.length})}</div><ul class="mut list">${I.unparsed.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="mut">${t('ed.addYourself')}</div>`:''}
    ${I.skipped.length?`<div class="mut mt2">${t('ed.skipped',{n:I.skipped.length})}</div>`:''}</div>`:'';
  const CR=p._cr;const req=`<details class="card"${CR?' open':''}><summary><b>${t('cr.title')}</b> <span class="mut">· ${t('optionalLc')}</span></summary><div class="mut mt2">${t('cr.hint')}</div>
    <label for="crText">${t('cr.label')}</label><textarea id="crText" rows="3" placeholder="${tA('cr.ph')}"></textarea><button class="btn acc full" data-act="applyCR">${t('cr.apply')}</button>
    ${CR?`<div class="mt3">${CR.changes.length?`<b>${t('cr.changed')}</b><ul class="list">${CR.changes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:`<b>${t('cr.nothing')}</b>`}
    ${CR.notUnderstood.length?`<div class="warn-txt">${t('cr.notDone')}</div><ul class="mut list">${CR.notUnderstood.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="mut">${t('cr.try')}</div>`:''}</div>`:''}</details>`;
  const A=p._ai;const aiN=A&&(A.ai||A.note)?`<div class="mut ainote">${A.ai?`${AI_TAG} ${t('ai.madeWith')}${A.remaining!=null?` · ${t('ai.left',{n:A.remaining})}`:''}`:`ⓘ ${esc(A.note)}`}</div>`:'';
  return aiN+iss+`<label for="plName">${t('ed.name')}</label><input id="plName" data-bind="name" value="${esc(p.name)}" placeholder="${tA('ed.namePh')}">
  <label for="plNotes">${t('ed.notes')}</label><textarea id="plNotes" data-bind="notes" rows="2" placeholder="${tA('optional')}">${esc(p.notes||'')}</textarea>
  <h3 class="sec-sm">${t('ed.days')}</h3><div class="mut">${t('ed.daysHint')}</div>
  ${p.days.map((d,i)=>`<div class="card dayrow" style="--dc:${esc(dayColor(d))}"><div class="row"><button class="grow plain" data-act="openDay" data-i="${i}">
    <h3>${esc(d.name)} ${d.rest?`<span class="tag">${t('rest')}</span>`:''}</h3>
    <span class="mut">${d.rest?t('ed.recovery'):d.exercises.length?esc(d.exercises.map(e=>I18N.exName(e.name)).join(', ')):t('ed.noEx')}</span></button>
    <div class="col"><button class="icon-btn sm" data-act="dayUp" data-i="${i}" aria-label="${tA('ed.moveUp',{name:d.name})}">▲</button><button class="icon-btn sm" data-act="dayDown" data-i="${i}" aria-label="${tA('ed.moveDown',{name:d.name})}">▼</button></div></div></div>`).join('')}
  <div class="grid2"><button class="btn" data-act="addDay">${t('ed.addDay')}</button><button class="btn" data-act="addRest">${t('ed.addRest')}</button></div>
  ${req}${foot(`<button class="btn acc" data-act="savePlan">${t('ed.save')}</button>`)}`;
},
day({i,direct}){
  const d=draft.days[i];if(!d)return'';
  return `<label for="dName">${t('day.name')}</label><input id="dName" data-bind="day.name" value="${esc(d.name)}">
  <div class="between mt3"><span>${t('day.rest')}</span><button class="chip ${d.rest?'on':''}" data-act="toggleRest" aria-pressed="${!!d.rest}">${d.rest?t('yes'):t('no')}</button></div>
  ${d.rest?'':d.exercises.map((e,j)=>`<div class="ex">
    <div class="ac"><label for="exn${j}">${t('day.exercise')}</label><input id="exn${j}" data-bind="ex.${j}.name" data-ac="${j}" value="${esc(I18N.exName(e.name))}" placeholder="${tA('day.exPh')}" autocomplete="off"><div class="aclist" id="ac${j}" hidden></div></div>
    <div class="grid3"><div><label for="exs${j}">${t('sets')}</label><input id="exs${j}" type="number" inputmode="numeric" min="1" data-bind="ex.${j}.sets" value="${esc(e.sets)}"></div>
    <div><label for="exa${j}">${t('day.repMin')}</label><input id="exa${j}" type="number" inputmode="numeric" data-bind="ex.${j}.repMin" value="${esc(e.repMin)}"></div>
    <div><label for="exb${j}">${t('day.repMax')}</label><input id="exb${j}" type="number" inputmode="numeric" data-bind="ex.${j}.repMax" value="${esc(e.repMax)}"></div></div>
    <div class="grid2"><div><label for="exw${j}">${t('day.startW',{u:U()})}</label><input id="exw${j}" type="number" inputmode="decimal" data-bind="ex.${j}.weight" value="${esc(e.weight===''||e.weight==null?'':fmtW(e.weight))}"></div>
    <div><label for="exr${j}">${t('day.restSec')}</label><input id="exr${j}" type="number" inputmode="numeric" data-bind="ex.${j}.rest" value="${esc(e.rest)}" placeholder="${restFor(e.name)}"></div></div>
    <label for="exo${j}">${t('day.note')}</label><input id="exo${j}" data-bind="ex.${j}.note" value="${esc(e.note)}" placeholder="${tA('optional')}">
    <div class="row mt3"><button class="btn sm" data-act="exUp" data-j="${j}" aria-label="${tA('day.exUp')}">▲</button><button class="btn sm" data-act="exDown" data-j="${j}" aria-label="${tA('day.exDown')}">▼</button><span class="grow"></span><button class="btn sm bad" data-act="exDel" data-j="${j}">${t('remove')}</button></div></div>`).join('')}
  ${d.rest?'':`<button class="btn full" data-act="exAdd">${t('day.addEx')}</button>`}
  <div class="card"><h3>${t('day.colour')}</h3><div class="chips">${COLORS.map(c=>`<button class="swatch ${dayColor(d)===c?'on':''}" style="background:${c}" data-act="setColor" data-c="${c}" aria-label="${tA('day.colourN',{c})}" aria-pressed="${dayColor(d)===c}"></button>`).join('')}
    <label class="swatch custom" title="${tA('day.custom')}" style="background:${esc(dayColor(d))}"><input type="color" id="customColor" value="${esc(dayColor(d))}" aria-label="${tA('day.custom')}"></label></div>
    <button class="btn full" data-act="colorAll">${t('day.colourAll')}</button></div>
  <div class="grid2 mt3"><button class="btn" data-act="dayDup">${t('day.dup')}</button><button class="btn bad" data-act="dayDel">${t('day.del')}</button></div>
  ${foot(direct?`<button class="btn" data-act="back">${t('cancel')}</button>`:'',`<button class="btn acc" data-act="${direct?'saveDay':'back'}">${direct?t('day.save'):t('done')}</button>`)}`;
},
ai(){
  const S=AI_STEPS,N=S.length+1,n=ai.step+1;
  const head=`<div class="between"><span class="wiz-step">${t('wiz.step',{n,N})}</span>${n<N?`<span class="mut">${n===6||n===7?t('optional'):''}</span>`:''}</div>${aiHasAnswers()&&!ai.busy?`<div class="right"><button class="linkbtn" data-act="flowRestart" data-f="ai">↺ ${t('wiz.startOver')}</button></div>`:''}<div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="${N}" aria-valuenow="${n}"><i style="width:${n/N*100}%"></i></div>`;
  if(ai.step>=S.length){const busy=ai.busy,locked=isPaidLocked(aiPrecheck());
    const aiB=locked?`<button class="big ghost locked" data-act="aiBuild">🔒 ✨ ${t('wiz.buildAI')}<small>${t('wiz.paidMore')}</small></button>`
      :`<button class="big acc" data-act="aiBuild">✨ ${t('wiz.buildAI')}<small>${t('wiz.tailored')}</small></button>`;
    const qB=`<button class="big ${locked?'acc':'ghost'}" data-act="aiQuick">⚡ ${t('wiz.quick')}<small>${t('wiz.instant')}</small></button>`;
    const pre=aiPrecheck()==='offline'?`<div class="card note">${esc(t('wiz.why.offline'))}</div>`:'';
    return head+`<h2>${t('wiz.ready')}</h2><div class="card recap"><div class="mut">${t('wiz.yourPlan')}</div><b>${esc(aiGoalLine(ai.a))}</b><div class="mut mt1">${esc(aiSummary(ai.a))}</div></div>
    ${busy?`<div class="card center busy"><div class="spin"></div><b>${t('wiz.building')}</b><div class="mut mt1">${t('wiz.takes')}</div><button class="btn full" data-act="aiCancel">${t('cancel')}</button></div>`
    :`${pre}${ai.msg?`<div class="card note">${esc(ai.msg)}</div>`:''}${locked?qB+aiB:aiB+qB}${foot(`<button class="btn" data-act="aiPrev">${t('back')}</button>`)}`}`}
  const s=S[ai.step],val=ai.a[s.key],on=v=>s.multi?(val||[]).includes(v):val==v,q=t('q.'+s.key),hint=s.hint?t('qh.'+s.key):'';
  return head+`<h2>${esc(q)}</h2>${hint?`<div class="mut">${esc(hint)}</div>`:''}
  ${s.text?`<label for="aiText" class="sr">${esc(q)}</label><textarea id="aiText" class="mt3" rows="4" placeholder="${tA('wiz.injPh')}">${esc(val||'')}</textarea><div id="injHint" class="mut mt2" aria-live="polite">${injHint(val)}</div>`:''}
  <div class="opts${s.grid?' g2':''}">${s.opts.map(([v,d])=>`<button class="big opt ${on(v)?'on':''}" data-act="aiPick" data-v="${esc(v)}" aria-pressed="${on(v)}">${esc(optLabel(s.key,v))}${d?`<small>${esc(t('od.'+s.key+'.'+v))}</small>`:''}</button>`).join('')}</div>
  ${foot(`<button class="btn" data-act="aiPrev">${ai.step?t('back'):t('cancel')}</button>`,`<button class="btn acc" data-act="aiNext">${t('next')}</button>`)}`;
},
account(){const m=route.p.mode||'in',up=m==='up',a=Sync.a,em=esc(route.p.email||a.email||'');
  const note=`<div class="mut mt2" id="acNote" role="alert">${esc(route.p.note||'')}</div>`;
  const codeIn=`<label for="acCode">${t('ac.code')}</label><input id="acCode" class="codein" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456">`;
  if(m==='verify')return `<div class="card"><h3>${t('ac.checkEmail')}</h3><div>${t('ac.enterCode')}</div><div class="mut">${t('ac.sentTo',{email:esc(a.email||'')})}</div>${codeIn}
  <button class="btn acc full" data-act="acVerify">${t('ac.verify')}</button>
  <div class="row mt2"><button class="btn" data-act="acResend">${t('ac.resend')}</button><button class="btn" data-act="acOut">${t('ac.signOut')}</button></div>${note}</div>
  <div class="mut">${t('ac.untilVerify')}</div>`;
  if(m==='forgot')return `<div class="card"><h3>${t('ac.forgot')}</h3><div class="mut">${t('ac.forgotHint')}</div>
  <label for="acEmail">${t('ac.email')}</label><input id="acEmail" type="email" autocomplete="email" placeholder="you@example.com" value="${em}">
  <button class="btn acc full" data-act="acForgot">${t('ac.sendCode')}</button>
  <button class="btn full" data-act="account" data-mode="in">${t('ac.backSignIn')}</button>${note}</div>`;
  if(m==='reset')return `<div class="card"><h3>${t('ac.setNew')}</h3><div class="mut">${t('ac.resetSent',{email:em||t('ac.thatEmail')})}</div>${codeIn}
  <label for="acPw">${t('ac.newPw')}</label><input id="acPw" type="password" autocomplete="new-password">
  <button class="btn acc full" data-act="acReset" data-email="${em}">${t('ac.saveNew')}</button>
  <div class="row mt2"><button class="btn" data-act="acForgot" data-email="${em}">${t('ac.resend')}</button><button class="btn" data-act="account" data-mode="in">${t('ac.backSignIn')}</button></div>${note}</div>
  <div class="mut">${t('ac.resetNote')}</div>`;
  return `<div class="card"><h3>${up?t('ac.createTitle'):t('ac.signIn')}</h3>
  <label for="acEmail">${t('ac.email')}</label><input id="acEmail" type="email" autocomplete="email" placeholder="you@example.com" value="${em}">
  <label for="acPw">${up?t('ac.pw8'):t('ac.pw')}</label><input id="acPw" type="password" autocomplete="${up?'new-password':'current-password'}" aria-describedby="acNote">
  <div class="auth-err" id="acNote" role="alert">${esc(route.p.note||'')}</div>
  <button class="btn acc full" data-act="acSubmit" data-mode="${up?'up':'in'}">${up?t('ac.create'):t('ac.signIn')}</button>
  ${up?'':`<div class="right"><button type="button" class="linkbtn" data-act="acForgotGo">${t('ac.forgotQ')}</button></div>`}
  <button class="btn full" data-act="account" data-mode="${up?'in':'up'}">${up?t('ac.haveAccount'):t('ac.createInstead')}</button></div>
  ${up?`<div class="mut">${t('lg.signupNote')}</div>${legalLinks()}`:''}
  <div class="mut">${t('ac.stored')}${up?' '+t('ac.storedUp'):''} ${t('privacy.geo')}</div>`},
legal(p){const k=LEGAL.docs[p.doc]?p.doc:'terms';
  return `<div class="card legal" lang="en" dir="ltr">${I18N.lang()!=='en'?`<div class="note mut" lang="${I18N.lang()}" dir="${I18N.isRTL()?'rtl':'ltr'}">${t('lg.enNote')}</div>`:''}${LEGAL.docs[k]}</div>${legalLinks(k)}`},
pair(){if(!Sync.on())return `<div class="card" id="pairNeed"><h3>${t('watch.pair')}</h3>${linkLine()}<div class="mut">${t('pair.signIn')}</div>
    <button class="btn acc full" data-act="account" data-mode="in" data-from="settings">${t('ac.signIn')}</button></div>`;
  const off=navigator.onLine===false?`<div class="card note">${t('pair.needNet')}</div>`:'';
  const type=route.p.type||'';
  if(!type)return off+`<div class="card" id="pairPick"><h3>${t('watch.pair')}</h3><div class="mut">${t('watch.choose')}</div>
    ${WATCH_TYPES.map(w=>`<button class="big opt${w.ready?'':' locked'}" data-act="pairType" data-v="${w.id}"${w.ready?'':' disabled'}>${esc(t('watch.type.'+w.id))}${w.ready?'':`<small>${esc(t('watch.soon'))}</small>`}</button>`).join('')}</div>`;
  const spec=watchType(type);
  if(!spec||!spec.ready)return off+`<div class="card" id="pairSoon"><h3>${esc(t('watch.type.'+type))}</h3><div class="mut">${t('watch.soon')}</div></div>`;
  // Galaxy Watch and Apple Watch show a 6-digit code the user types here. Garmin claims over Bluetooth and keeps this box behind the fallback link.
  if(!route.p.code&&type!=='samsung'&&type!=='apple')return off+`<div class="card" id="pairFlow"><h3>${esc(t('watch.type.'+type))}</h3><div class="mut">${t('pair.lead.'+type)}</div>
    ${typeof Live!=='undefined'&&Live.bt?`<div class="mut mt2" id="btLine">${t('bt.connected')}</div>`:typeof Live!=='undefined'&&Live.btTried?`<div class="mut mt2" id="btLine">${t('bt.looking')}</div>`:''}
    <div class="right mt2"><button type="button" class="linkbtn" data-act="pairShowCode">${t('pair.trouble')}</button></div></div>`;
  return off+`<div class="card" id="pairCode"><h3>${esc(t('watch.type.'+type))}</h3>
  <div class="mut">${t('pair.enter')}</div>
  <label for="pairIn">${t('pair.codeLbl')}</label>
  <input id="pairIn" class="pair-code" inputmode="numeric" maxlength="6" pattern="[0-9]*" autocomplete="one-time-code" aria-describedby="pairNote">
  <button class="btn acc full" data-act="pairClaim">${t('pair.confirm')}</button>
  <div class="mut mt2" id="pairNote" role="alert" aria-live="polite"></div>
  <div class="mut mt2">${t('pair.help')}</div></div>`},
watch(){const plan=Store.plan(route.p.planId)||Store.activePlan();if(!plan)return `<div class="card mut">${t('w.noPlan')}</div>`;
  const i=Math.min(route.p.i|0,plan.days.length-1),c=watchCode(plan,i);
  db().watch={planId:plan.id,dayIndex:i,title:c.title,at:Date.now()};Store.save();
  const auto=Sync.on()?t('w.autoOn'):t('w.autoOff');
  return `<div class="card"><h3>⌚ ${t('w.send',{day:esc(plan.days[i].name)})}</h3>
  <label for="watchCode" class="sr">${t('w.code')}</label><textarea id="watchCode" class="code" rows="4" readonly>${esc(c.code)}</textarea>
  <button class="btn acc full" data-act="watchCopy">📋 ${t('w.copy')}</button>
  <ol class="mut steps mt2"><li>${t('w.s1')}</li><li>${t('w.s2')}</li><li>${t('w.s3')}</li></ol>
  <div class="mut mt2">${U()==='kg'?t('w.lbKg'):t('w.lb')}${db().active?' '+t('w.inProgress'):''}</div></div>
  <div class="card"><h3>↩ ${t('w.import')}</h3><div class="mut">${t('w.importHint')}</div>
  <label for="watchRes" class="sr">${t('w.result')}</label><textarea id="watchRes" class="code mt2" rows="3" placeholder="SR1~Push~4@95/95/105/105~3@65"></textarea>
  <button class="btn full" data-act="watchImport">${t('w.importBtn')}</button></div>
  <div class="mut"><b>${t('w.backup')}</b> ${auto}</div>
  <div class="card"><div class="mut">${t('w.linkHow')}</div></div>`},
paste(){
  const w=aiPrecheck();const note=w===''?`<div class="mut ainote">${AI_TAG} ${t('p.aiOn')}</div>`:w==='offline'?`<div class="card note">${t('wiz.why.offline')}</div>`:isPaidLocked(w)?`<div class="mut ainote">✨ ${t('p.aiPaid')}</div>`:'';
  return `<div class="mut">${t('p.intro')}</div>
  <div class="grid2 mt3"><button class="btn" data-act="pickPic">🖼 ${t('p.choose')}</button><button class="btn" data-act="takePic">📷 ${t('p.take')}</button></div>
  <input type="file" id="picFile" accept="image/*" multiple hidden><input type="file" id="camFile" accept="image/*" capture="environment" hidden>
  <div id="picTray">${trayHTML()}</div>
  ${note}
  <div id="ocrBox" class="card" hidden aria-live="polite"><div class="between"><b id="ocrMsg">${t('p.reading')}</b><span id="ocrPct" class="mut"></span></div><div class="progress"><i id="ocrBar" style="width:0"></i></div><div class="mut" id="ocrSub">${t('p.onPhone')}</div><button class="btn full" id="ocrCancel" data-act="ocrCancel" hidden>${t('cancel')}</button></div>
  <label for="pasteText">${t('p.text')}</label>
  <textarea id="pasteText" rows="14" placeholder="${tA('p.ph').replace(/\n/g,'&#10;')}">${esc(route.p.text||'')}</textarea>${(route.p.text||'').trim()?`<div class="right"><button class="linkbtn" data-act="flowRestart" data-f="paste">↺ ${t('wiz.startOver')}</button></div>`:''}
  <div class="mut mt2">${t('p.tip')}</div>
  ${foot(`<button class="btn acc" data-act="parse">${w===''?'✨ '+t('p.makeAI'):t('p.make')}</button>`)}`;
},
session(){
  const a=db().active;if(!a)return`<div class="card">${t('s.none')}</div>`;
  const mode=sessionMode();
  const done=a.exercises.reduce((s,e)=>s+e.sets.filter(x=>x.done).length,0),tot=a.exercises.reduce((s,e)=>s+e.sets.length,0);
  const checks=mode==='set';
  return `<div class="between"><h2 class="m0">${esc(a.dayName)}</h2><span class="mut">${t('s.progress',{done,tot})}</span></div>
  ${linkLine()}
  <div class="progress"><i style="width:${tot?done/tot*100:0}%"></i></div>
  ${modePicker()}
  ${a.exercises.map((e,j)=>{const all=e.sets.length&&e.sets.every(x=>x.done);const name=I18N.exName(e.name);
    return `<div class="card ex-card" data-ex="${j}" data-mode="${mode}"><div class="between exhead"><h3>${esc(name)}</h3><span class="exmeta"><span class="mut">${t('s.repsRest',{reps:repTxt(e),rest:restTxt(e.rest)})}</span><button class="btn sm" data-act="restEdit" data-j="${j}">${t('s.editRest')}</button>${mode==='exercise'?`<button class="done exdone ${all?'on':''}" data-act="exDone" data-j="${j}" aria-pressed="${!!all}" aria-label="${tA('cm.exDone',{name:name})}">✓</button>`:''}</span></div>
    ${e.note?`<div class="mut">${esc(e.note)}</div>`:''}${e.last?`<div class="mut">${t('s.last',{v:esc(e.last)})}</div>`:''}${sessionSugg(e)}
    <div class="set set-head${checks?'':' nock'}" aria-hidden="true"><span>${t('s.set')}</span><span>${U()}</span><span>${t('reps')}</span>${checks?`<span>${t('done')}</span>`:''}</div>
    ${e.sets.map((s,k)=>{const L=tA('s.setN',{name,n:k+1});return `<div class="set${checks?'':' nock'}"><span class="mut">${k+1}</span>
      <div class="step"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="w" data-d="-1" aria-label="${tA('s.lessW')}, ${L}">−</button><input type="number" inputmode="decimal" data-bind="set.${j}.${k}.w" class="${s.ws==='s'?'sugw':''}" value="${esc(s.w===''||s.w==null?'':fmtW(s.w))}" aria-label="${L}, ${tA('s.weightIn',{u:U()})}"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="w" data-d="1" aria-label="${tA('s.moreW')}, ${L}">+</button></div>
      <div class="step"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="r" data-d="-1" aria-label="${tA('s.fewerR')}, ${L}">−</button><input type="number" inputmode="numeric" data-bind="set.${j}.${k}.r" value="${esc(s.r)}" aria-label="${L}, ${tA('reps')}"><button data-act="stp" data-j="${j}" data-k="${k}" data-f="r" data-d="1" aria-label="${tA('s.moreR')}, ${L}">+</button></div>
      ${checks?`<button class="done ${s.done?'on':''}" data-act="setDone" data-j="${j}" data-k="${k}" aria-label="${L}, ${tA('done')}" aria-pressed="${!!s.done}">✓</button>`:''}</div>`}).join('')}
    <div class="row settools"><button class="btn sm" data-act="setAdd" data-j="${j}">+ ${t('s.set')}</button>${e.sets.length>1?`<button class="btn sm" data-act="setDel" data-j="${j}">− ${t('s.set')}</button>`:''}${mode==='none'||mode==='exercise'?`<button class="btn sm restgo" data-act="restGo" data-j="${j}">${t('cm.rest')}</button>`:''}</div></div>`}).join('')}
  <div class="sessfoot"><button class="btn" data-act="sessMenu" aria-label="${tA('s.more')}">⋯</button><button class="btn acc grow" data-act="finish">${t('s.finish')}</button></div>`;
},
history(p){
  const h=db().history.slice().sort((a,b)=>b.date-a.date);
  if(!h.length)return`<div class="card empty"><div class="empty-ico" aria-hidden="true">📈</div><h3>${t('h.none')}</h3><div class="mut">${t('h.noneHint')}</div>
    ${Store.activePlan()?`<button class="btn acc full" data-act="goToday">${t('h.goToday')}</button>`:''}</div>`;
  const kind=p.kind==='exercises'?'exercises':'workouts',prefs=trackPrefs();
  const seg=`<div class="seg modes" role="tablist" aria-label="${tA('tab.history')}"><button type="button" role="tab" data-act="trackKind" data-v="workouts" aria-selected="${kind==='workouts'}" aria-pressed="${kind==='workouts'}">${t('h.trackWorkouts')}</button><button type="button" role="tab" data-act="trackKind" data-v="exercises" aria-selected="${kind==='exercises'}" aria-pressed="${kind==='exercises'}">${t('h.trackExercises')}</button></div>`;
  if(kind==='exercises'&&p.ex)return seg+exerciseTrack(p.ex);
  if(kind==='exercises'){
    const all=planExerciseNames();
    const chips=all.map(n=>{const on=prefs.exercises.some(x=>x.toLowerCase()===n.toLowerCase());
      return `<button class="chip ${on?'on':''}" data-act="trackEx" data-name="${esc(n)}" aria-pressed="${on}">${esc(I18N.exName(n))}</button>`}).join('');
    const views=prefs.exercises.map(n=>`<button class="card plain hrow" data-act="openTrack" data-name="${esc(n)}"><div class="between"><h3>${esc(I18N.exName(n))}</h3><span aria-hidden="true">›</span></div><div class="mut">${t('h.exCount',{n:exSeries(n).length})}</div></button>`).join('');
    return seg+`<div class="mut">${t('h.pickExercises')}</div><div class="chips mt2">${chips||`<span class="mut">${t('h.noPlanEx')}</span>`}</div>`+views}
  const days=planDayNames();
  const chips=days.map(n=>{const on=prefs.days.some(x=>x.toLowerCase()===n.toLowerCase());
    return `<button class="chip ${on?'on':''}" data-act="trackDay" data-name="${esc(n)}" aria-pressed="${on}">${esc(n)}</button>`}).join('');
  const list=prefs.days.length?h.filter(w=>prefs.days.some(d=>d.toLowerCase()===String(w.dayName||'').toLowerCase())):[];
  const rows=list.map(w=>`<button class="card plain hrow" data-act="openHist" data-id="${w.id}"><div class="between"><div><div class="mut">${fmtDate(w.date)}</div><h3>${esc(w.dayName)}</h3></div><span aria-hidden="true">›</span></div>
    <div class="mut">${t('n.exercise',{n:w.exercises.length})} · ${t('n.set',{n:sets(w)})} · ${t('h.volume',{v:num(Math.round(vol(w))),u:esc(w.units)})}${w.minutes?` · ${t('unit.min',{n:w.minutes})}`:''}</div></button>`).join('');
  return seg+`<div class="mut">${t('h.pickDays')}</div><div class="chips mt2">${chips||`<span class="mut">${t('h.noPlanEx')}</span>`}</div>`+(prefs.days.length?rows||`<div class="card mut">${t('h.noneHint')}</div>`:'');
},
hist({id}){
  const w=db().history.find(x=>x.id===id);if(!w)return`<div class="card">${t('h.notFound')}</div>`;
  return `<div class="mut">${fmtDate(w.date)} · ${esc(w.planName||'')}</div><h2>${esc(w.dayName)}</h2>
  ${w.exercises.map(e=>`<div class="card"><h3>${esc(I18N.exName(e.name))}</h3>${e.sets.map((s,k)=>`<div class="between"><span class="mut">${t('s.set')} ${k+1}</span><span>${esc(fmtW(s.w)||0)} ${esc(w.units)} × ${esc(s.r)}</span></div>`).join('')||`<div class="mut">${t('h.noSets')}</div>`}</div>`).join('')}
  <button class="btn bad full" data-act="delHist" data-id="${w.id}">${t('h.del')}</button>`;
},
settings(){
  const bs=bgSettings(),on=Sync.on(),img=localStorage.getItem(BG_KEY);
  const S=(id,t,b)=>`<section aria-labelledby="sec-${id}"><h2 class="sec" id="sec-${id}">${t}</h2>${b}</section>`;
  const acct=accountCard()||`<div class="card mut">${t('set.noAccounts')}</div>`;
  const work=`<div class="card"><h3>${t('set.units')}</h3><div class="chips"><button class="chip ${U()==='lb'?'on':''}" data-act="units" data-v="lb" aria-pressed="${U()==='lb'}">lb</button><button class="chip ${U()==='kg'?'on':''}" data-act="units" data-v="kg" aria-pressed="${U()==='kg'}">kg</button></div>
    <div class="mut mt2">${t('set.unitsHint')}</div></div>
    <div class="card"><div class="between"><div><h3>${t('set.copyW')}</h3><div class="mut">${t('set.copyWHint')}</div></div><button class="chip ${db().settings.copyWeight!==false?'on':''}" data-act="copyW" aria-pressed="${db().settings.copyWeight!==false}">${db().settings.copyWeight!==false?t('on'):t('off')}</button></div></div>`+alertCard();
  const look=langCard()+fsCard()+`<div class="card"><h3>${t('set.bg')}</h3><div class="mut">${t('set.bgHint')}</div>
   <div class="bggrid"><button class="bgopt ${bs.kind==='none'?'on':''}" data-act="bgNone" aria-pressed="${bs.kind==='none'}">${t('set.none')}</button>
   ${Object.entries(BGS).map(([k,v])=>`<button class="bgopt ${bs.kind==='preset'&&bs.id===k?'on':''}" style="background:${v}" data-act="bgPreset" data-id="${k}" aria-label="${tA('bg.'+k)}" aria-pressed="${bs.kind==='preset'&&bs.id===k}"><span>${t('bg.'+k)}</span></button>`).join('')}
   <button class="bgopt ${bs.kind==='custom'?'on':''}" data-act="bgPhoto" ${img?`style="background:center/cover url('${img}')"`:''}><span>📷 ${t('set.photo')}</span></button></div>
   <input type="file" id="bgFile" accept="image/*" hidden>
   <label for="dim">${t('set.dim')} <b id="dimv">${Math.round(bs.dim*100)}%</b></label><input type="range" id="dim" class="range" min="0" max="85" value="${Math.round(bs.dim*100)}"></div>`;
  const data=`<div class="card"><div class="mut">${on?t('set.dataSynced',{email:esc(Sync.a.email||'')}):t('set.dataLocal')}</div>
    <input type="file" id="file" accept="application/json,.json" hidden>
    <button class="btn full" data-act="export">${t('set.export')}</button>
    <button class="btn full" data-act="import">${t('set.restore')}</button>
    <button class="btn bad full" data-act="reset">${t('set.reset')}</button></div>`;
  if(on&&Sync.watchList==null){Sync.listWatches().then(()=>{if(route.v==='settings')render()})}
  const wl=Sync.watchList||[];
  const wrows=wl.map(w=>`<div class="between mt2" data-watch="${esc(w.id)}"><div><b>${esc(w.name||w.model||t('watch.unnamed'))}</b>
    <div class="mut">${t('watch.paired')}${w.model?` · ${esc(w.model)}`:''}${w.lastSeen?` · ${t('watch.last',{d:new Date(w.lastSeen).toLocaleString(I18N.locale())})}`:''}</div></div>
    <button class="btn sm bad" data-act="watchRm" data-id="${esc(w.id)}" data-name="${esc(w.name||w.model||'')}">${t('watch.unpair')}</button></div>`).join('');
  const wsBtn=on&&wl.length?`<button class="btn full" id="watchSettingsBtn" data-act="watchSettings">${t('ws.open')}</button>`:'';
  const watch=`<div class="card" id="watchCard"><h3>${t('sec.watch')}</h3><div class="mut">${on?t('watch.hintOn'):t('pair.signIn')}</div>
    ${on?`<h3 class="mt3">${t('watch.mine')}</h3>${wrows||`<div class="mut" id="watchNone">${t('watch.none')}</div>`}${wsBtn}`:''}
    <button class="btn acc full" data-act="pair">${t('watch.pair')}</button></div>`;
  const about=`<div class="card"><h3>Simple Lift</h3><div class="mut">${t('set.aboutText')}</div>
    <div class="row wrap mt2">${/^https:\/\//.test(DONATE_URL)?`<a class="btn sm" href="${esc(DONATE_URL)}" target="_blank" rel="noopener noreferrer">${t('set.donate')}</a>`:''}
    ${/^[^@\s]+@[^@\s]+$/.test(SUPPORT_EMAIL)?`<a class="btn sm" href="mailto:${esc(SUPPORT_EMAIL)}?subject=Simple%20Lift%20support">${t('set.email')}</a>`:''}
    </div></div>
  <div class="card" id="legalCard"><h3>⚖️ ${t('lg.legal')}</h3>${legalLinks()}<div class="mut mt2" id="legalAcc"><b>${t('lg.yours')}:</b> ${legalAccText()}</div></div>`;
  return S('acct',t('sec.acct'),acct)+S('work',t('sec.work'),work)+S('look',t('sec.look'),look)+S('data',t('sec.data'),data)+S('watch',t('sec.watch'),watch)+S('errors',t('sec.errors'),errorLogCard())+S('about',t('sec.about'),about);
},
watchSettings(){
  if(!Sync.on())return `<div class="card" id="wsNeed"><div class="mut">${t('pair.signIn')}</div></div>`;
  if(Sync.watchList==null){Sync.listWatches().then(()=>{if(route.v==='watchSettings')render()})}
  if(Sync.watchList&&!Sync.watchList.length)return `<div class="card" id="wsNone"><div class="mut">${t('watch.none')}</div></div>`;
  ensureWatchSettings();
  if(!watchSet||(watchSet.state==='load'&&!watchSet.settings))return `<div class="card" id="wsLoading"><div class="mut">${t('ws.loading')}</div></div>`;
  if(watchSet.state==='err'&&!watchSet.settings)return `<div class="card" id="wsErr"><div class="mut">${esc(watchSet.err||t('ws.loadFail'))}</div><button class="btn full" data-act="wsRetry">${t('ws.retry')}</button></div>`;
  return watchSettingsForm();
}};

