// Button handlers and the input listeners.
'use strict';
const ACT={
 legalDoc:b=>{const c=$('#gateChk');if(c)gate.chk=c.checked;go('legal',{doc:b.dataset.doc})},
 gateBack:()=>{gate.doc=null;if(stack.length)back();else{route={v:'home',p:{}};afterNav()}},
 gateYes:()=>{const c=$('#gateChk');if(!c||!c.checked){gate.chk=!!(c&&c.checked);gate.msg=t('lg.tick');render();return}
   localStorage.setItem(TERMS_KEY,JSON.stringify({v:LEGAL.v,at:new Date().toISOString()}));gate={doc:null,msg:'',chk:false};render()},
 gateNo:()=>{gate.msg=t('lg.declined');render()},
 resume:()=>go('session'),start:b=>startWorkout(+b.dataset.i),
 goPlans:()=>tab('plans'),goToday:()=>tab('home'),goHistory:()=>tab('history'),goSettings:()=>tab('settings'),
 newPlan:()=>{openDraft(blankPlan());draft._new=1;go('editor')},
 edit:b=>{openDraft(clone(Store.plan(b.dataset.id)));go('editor')},
 dup:b=>{const p=clone(Store.plan(b.dataset.id));p.id=Store.uid();p.name=t('plans.copyName',{name:p.name});p.days.forEach(d=>{d.id=Store.uid()});Store.upsertPlan(p);toast(t('plans.copied'));render()},
 activate:b=>{Store.setActive(b.dataset.id);toast(t('plans.following'));render()},
 delPlan:async b=>{const p=Store.plan(b.dataset.id);if(await ask(t('plans.delQ'),t('plans.delMsg',{name:p?p.name:''}),t('plans.del'),'bad')){Store.deletePlan(b.dataset.id);toast(t('plans.deleted'));render()}},
 openDay:b=>go('day',{i:+b.dataset.i}),
 dayUp:b=>{swap(draft.days,+b.dataset.i,+b.dataset.i-1);render()},dayDown:b=>{swap(draft.days,+b.dataset.i,+b.dataset.i+1);render()},
 addDay:()=>{draft.days.push({id:Store.uid(),name:t('dayN',{n:draft.days.filter(d=>!d.rest).length+1}),rest:false,exercises:[newEx()]});go('day',{i:draft.days.length-1})},
 addRest:()=>{draft.days.push({id:Store.uid(),name:t('rest'),rest:true,exercises:[]});render()},
 savePlan:()=>{if(!draft.name.trim())draft.name=t('ed.namePh');draft.days.forEach(d=>d.exercises=d.exercises.filter(e=>e.name.trim()));autoRests(draft);
   if(!draft.days.length){toast(t('ed.oneDay'));return}
   const isNew=draft._new;if(draft._flow){flowSet(draft._flow==='ai'?{ai:null,at:null}:{paste:null,at:null});if(draft._flow==='ai')ai=null}delete draft._flow;delete draft._new;delete draft._issues;delete draft._cr;delete draft._ai;Store.upsertPlan(draft);if(isNew)Store.setActive(draft.id);draftSnap=snap(draft);
   toast(t('ed.saved'));stack=[];go(isNew?'home':'plans',{},false)},
 toggleRest:()=>{const d=draft.days[route.p.i];d.rest=!d.rest;if(!d.rest&&!d.exercises.length)d.exercises.push(newEx());render()},
 exAdd:()=>{draft.days[route.p.i].exercises.push(newEx());render();const ins=document.querySelectorAll('[data-ac]');ins[ins.length-1]?.focus()},
 exDel:b=>{draft.days[route.p.i].exercises.splice(+b.dataset.j,1);render()},
 exUp:b=>{swap(draft.days[route.p.i].exercises,+b.dataset.j,+b.dataset.j-1);render()},exDown:b=>{swap(draft.days[route.p.i].exercises,+b.dataset.j,+b.dataset.j+1);render()},
 // In "Edit day" opened from Today, duplicate/delete save straight away (the same as Save day), so nothing is lost.
 dayDup:()=>{const i=route.p.i,d=clone(draft.days[i]);d.id=Store.uid();d.name=t('day.copyName',{name:d.name});d.exercises.forEach(e=>e.id=Store.uid());draft.days.splice(i+1,0,d);
   if(route.p.direct){commitDay(i+1);toast(t('day.duped'))}else pop()},
 dayDel:async()=>{const i=route.p.i;if(route.p.direct&&draft.days.length===1){toast(t('day.needOne'));return}
   if(!await ask(t('day.delQ'),t('day.delMsg',{name:draft.days[i].name}),t('day.del'),'bad'))return;
   draft.days.splice(i,1);if(route.p.direct){commitDay(Math.max(0,i-1));toast(t('day.deleted'))}else pop()},
 back:()=>back(),
 selDay:b=>{route.p.sel=+b.dataset.i;render();document.querySelector('.daytab.on')?.scrollIntoView({inline:'center',block:'nearest'})},
 editDay:b=>{openDraft(clone(Store.activePlan()));go('day',{i:+b.dataset.i,direct:1})},
 setColor:b=>{draft.days[route.p.i].color=b.dataset.c;render()},
 colorAll:()=>{const c=dayColor(draft.days[route.p.i]);draft.days.forEach(d=>d.color=c);toast(t('day.colourAllDone'))},
 saveDay:()=>{commitDay(route.p.i);toast(t('day.saved'))},
 bgNone:()=>{setBg({kind:'none'});render()},
 bgPreset:b=>{setBg({kind:'preset',id:b.dataset.id});render()},
 bgPhoto:()=>{const f=$('#bgFile');f.value='';f.onchange=async()=>{try{const u=await loadBgFile(f.files[0]);try{localStorage.setItem(BG_KEY,u)}catch(e){throw new Error(t('err.noSpace'))}setBg({kind:'custom'});toast(t('set.bgSet'));render()}catch(e){toast(errMsg(e),'err')}};f.click()},
 paste:()=>go('paste',{text:flowGet().paste||''}),
 sessMenu:async()=>{const a=db().active;if(!a)return;const v=await sheet({title:t('s.options'),actions:[{v:'pair',label:t('watch.pair')},{v:'discard',label:t('s.discard'),cls:'bad'},{v:null,label:t('close')}]});
   if(v==='pair')go('pair');
   else if(v==='discard'&&await ask(t('s.discardQ'),t('s.discardMsg'),t('s.discard'),'bad',t('fin.keep'))){if(typeof Live!=='undefined')Live.drop();endSession();toast(t('s.discarded'));tab('home')}},
 finish:()=>finishFlow(),
 // v22: Today's empty screen also opens sign-in / sign-up; after signing in we return to Today (sync pulls the account's data)
 account:b=>{if(route.v!=='account')authFrom=b.dataset.from||'';go('account',{mode:b.dataset.mode||'in'},route.v!=='account')},
 acSubmit:async b=>{const e=$('#acEmail').value.trim(),p=$('#acPw').value,n=$('#acNote'),pw=$('#acPw');
   const fail=msg=>{if(n)n.textContent=msg;if(pw)pw.setAttribute('aria-invalid','true')};
   if(!e||!p){fail(t('ac.needBoth'));return}
   b.disabled=true;b.textContent=t('working');try{const j=await Sync.signIn(b.dataset.mode,e,p);
     if(j.verified===false){go('account',{mode:'verify',note:j.mailError?Sync.msg({error:j.mailError}):''},false);return}
     toast(t('ac.signedIn'));stack=[];tab(authFrom==='home'?'home':'settings')}catch(x){fail(errMsg(x));b.disabled=false;b.textContent=b.dataset.mode==='up'?t('ac.create'):t('ac.signIn')}},
 acVerify:async b=>{const c=($('#acCode').value||'').replace(/\D/g,'');if(c.length!==6){$('#acNote').textContent=t('ac.need6');return}
   b.disabled=true;b.textContent=t('ac.checking');try{await Sync.verify(c);toast(t('ac.verified'));stack=[];tab(authFrom==='home'?'home':'settings')}catch(x){$('#acNote').textContent=x.message;b.disabled=false;b.textContent=t('ac.verify')}},
 acResend:async b=>{b.disabled=true;try{await Sync.resend();$('#acNote').textContent=t('ac.newCode')}catch(x){$('#acNote').textContent=x.status===429?t('ac.wait5'):x.message}setTimeout(()=>{b.disabled=false},60000)},
 acForgotGo:b=>{const e=$('#acEmail');go('account',{mode:'forgot',email:e?e.value.trim():''},false)},
 acForgot:async b=>{const el=$('#acEmail'),e=(el?el.value:b.dataset.email||'').trim();if(!e){$('#acNote').textContent=t('ac.needEmail');return}
   b.disabled=true;try{await Sync.forgot(e);go('account',{mode:'reset',email:e,note:route.p.mode==='reset'?t('ac.newCodeIf'):''},false)}catch(x){const n=$('#acNote');if(n)n.textContent=x.status===429?t('ac.wait'):x.message;b.disabled=false}},
 acReset:async b=>{const c=($('#acCode').value||'').replace(/\D/g,''),p=$('#acPw').value,n=$('#acNote');if(c.length!==6){n.textContent=t('ac.need6');return}
   if(p.length<8){n.textContent=t('ac.pwShort');return}
   b.disabled=true;b.textContent=t('saving');try{await Sync.reset(b.dataset.email,c,p);toast(t('ac.pwChanged'));stack=[];tab('settings')}catch(x){n.textContent=x.message;b.disabled=false;b.textContent=t('ac.saveNew')}},
 acOut:async()=>{if(!await ask(t('ac.outQ'),t('ac.outMsg'),t('ac.signOut')))return;await Sync.signOut();stack=[];tab('home')},
 delAcct:async()=>{
   const v=await sheet({title:t('del.title'),msg:t('del.msg'),
     html:`<label for="dPw">${t('del.pw')}</label><input id="dPw" name="pw" type="password" autocomplete="current-password">
       <label for="dCf">${t('del.type')}</label><input id="dCf" name="cf" autocomplete="off" autocapitalize="characters" spellcheck="false">`,
     actions:[{v:'del',label:t('del.btn'),cls:'bad',run:async o=>{const pw=o.querySelector('#dPw').value,cf=o.querySelector('#dCf').value;
       if(cf.trim().toUpperCase()!=='DELETE')return t('del.typeErr');if(!pw)return t('del.pwErr');
       try{await Sync.deleteAccount(pw,'DELETE');return true}catch(x){return errMsg(x)}}},{v:null,label:t('cancel')}]});
   if(v!=='del')return;await wipeLocalAppData();stack=[];route={v:'settings',p:{}};render();
   toast(t('del.doneWipe'))},
 pair:()=>go('pair'),
 pairType:b=>{const spec=watchType(b.dataset.v);if(!spec||!spec.ready)return;go('pair',{type:spec.id})},
 pairShowCode:()=>{go('pair',{type:route.p.type,code:1});const i=$('#pairIn');if(i)i.focus()},
 pairClaim:async b=>{const c=(($('#pairIn')||{}).value||'').replace(/\D/g,'');const n=$('#pairNote');
   if(navigator.onLine===false){if(n)n.textContent=t('pair.needNet');return}
   if(c.length!==6){if(n)n.textContent=t('pair.need6');return}
   b.disabled=true;try{await Sync.pairClaim(c);toast(t('pair.ok'));Sync.watchList=null;pop()}catch(x){if(n)n.textContent=pairErr(x);b.disabled=false}},
 watchSettings:()=>{watchSet=null;go('watchSettings')},
 wsRetry:()=>{watchSet=null;render()},
 wsToggle:b=>{if(!watchSet||watchSet.state==='save'||!watchSet.settings)return;const k=b.dataset.k;if(!WS_KEYS.includes(k))return;
   pushWatchSettings(Object.assign({},watchSet.settings,{[k]:!watchSet.settings[k]}))},
 wsAlert:b=>{if(!watchSet||watchSet.state==='save'||!watchSet.settings)return;const n=+b.dataset.v;if(n!==0&&n!==1&&n!==2||watchSet.settings.restAlert===n)return;
   pushWatchSettings(Object.assign({},watchSet.settings,{restAlert:n}))},
 watchRm:async b=>{if(!await ask(t('watch.rmQ'),t('watch.rmMsg',{name:b.dataset.name||t('watch.unnamed')}),t('watch.remove'),'bad'))return;
   try{await Sync.removeWatch(b.dataset.id);toast(t('watch.removed'));Sync.watchList=null;render()}catch(x){toast(x.message,'err')}},
 watch:b=>go('watch',{i:+b.dataset.i,planId:Store.activePlan()?.id}),
 watchCopy:async()=>{const ta=$('#watchCode');ta.focus();ta.select();let ok=false;try{await navigator.clipboard.writeText(ta.value);ok=true}catch(e){try{ok=document.execCommand('copy')}catch(_){}}toast(ok?t('w.copied'):t('w.selected'))},
 watchImport:async()=>{const r=parseResult($('#watchRes').value);if(!r){toast(t('w.badCode'),'err');return}
   try{const o=applyResult(r);await info(t('w.imported'),o.msg);stack=[];if(o.mode==='live')go('session',{},false);else go('history',{},false)}catch(e){info(t('w.importFail'),errMsg(e))}},
 chooser:()=>go('chooser'),
 ocrCancel:()=>{if(picCtl)picCtl.abort()},
 pickPic:()=>{const f=$('#picFile');f.value='';f.onchange=()=>f.files.length&&addPics(f.files);f.click()},
 takePic:()=>{const f=$('#camFile');f.value='';f.onchange=()=>f.files[0]&&addPics(f.files);f.click()},
 rmPic:b=>{const p=picTray.splice(+b.dataset.i,1)[0];if(p)URL.revokeObjectURL(p.url);refreshTray()},
 readPics:()=>{if(!picTray.length)return;const fs=picTray.map(p=>p.file);clearTray();runOCR(fs)},
 applyCR:async()=>{const t=$('#crText').value;if(!t.trim()){toast(window.t('cr.typeFirst'));return}const r=await applyChangeRequest(draft,t);
   const keep={_new:draft._new,_issues:draft._issues,_ai:draft._ai};draft=Object.assign(r.plan,keep);draft._cr={changes:r.changes,notUnderstood:r.notUnderstood};render();
   setTimeout(()=>document.querySelector('#crText')?.closest('details').scrollIntoView({block:'start'}),30)},
 parse:async b=>{const t=$('#pasteText').value;if(!t.trim()){toast(window.t('p.first'));return}route.p.text=t;
   b.disabled=true;const r=await parseTextPlan(t);b.disabled=false;if(!r.plan.days.length){info(window.t('p.noneTitle'),window.t('p.noneMsg'));return}
   openDraft(r.plan);draft._new=1;draft._ai=lastAI;draft._issues=issuesOf(r);draft._flow='paste';go('editor')},
 ai:()=>{const f=flowGet();ai=f.ai&&f.ai.a?{step:Math.min(+f.ai.step||0,AI_STEPS.length),a:f.ai.a}:freshAI();go('ai')},
 flowRestart:async b=>{const isAI=b.dataset.f==='ai';if(!await ask(t('wiz.startOver'),t('wiz.startOverMsg'),t('wiz.startOver'),'bad',t('cancel')))return;
   if(isAI){if(ai&&ai.ctl)ai.ctl.abort();ai=freshAI();flowSet({ai:null})}else{route.p.text='';clearTray();flowSet({paste:null})}render();scrollTo(0,0)},
 aiPick:async b=>{const s=AI_STEPS[ai.step];let v=b.dataset.v;if(typeof s.opts[0][0]==='number')v=+v;
   if(s.multi){let arr=ai.a[s.key];if(v==='none')arr=[];else{arr=arr.includes(v)?arr.filter(x=>x!==v):[...arr,v];if(s.key==='focus'&&arr.length>3)arr.shift()}ai.a[s.key]=arr;render();return}
   ai.a[s.key]=v;ai.step++;render();scrollTo(0,0)},
 aiPrev:async b=>{if(ai.busy)return;const tx=$('#aiText');if(tx&&AI_STEPS[ai.step])ai.a[AI_STEPS[ai.step].key]=tx.value;ai.msg='';
   if(!ai.step){ // the Cancel button on step 1 leaves the whole flow: ask only if something was entered
     if(b&&aiHasAnswers()){if(!await ask(t('guard.title'),t('wiz.leaveMsg'),t('guard.discard'),'bad',t('guard.keep')))return;ai=freshAI();flowSet({ai:null})}
     else if(b){flowSet({ai:null})}
     pop();return}
   ai.step--;render();scrollTo(0,0)},
 aiNext:()=>{const S=AI_STEPS,st=S[ai.step];if(!st)return;const tx=$('#aiText');if(tx)ai.a[st.key]=tx.value;
   if(!st.multi&&!st.text&&ai.a[st.key]==null){toast(t('wiz.pick'));return}
   ai.step++;ai.msg='';render();scrollTo(0,0)},
 aiQuick:()=>{if(ai.busy)return;ai.msg='';rememberExperience();openDraft(rulePlan(ai.a));draft._new=1;draft._flow='ai';go('editor');toast(t('wiz.readyQuick'))},
 aiBuild:async()=>{if(ai.busy)return;
   const why=aiPrecheck();if(why){ai.msg=t('wiz.why.'+(['paid','none','offline','verify'].includes(why)?why:'signin'));render();return}
   rememberExperience();const ctl=new AbortController();ai.ctl=ctl;ai.busy=true;ai.msg='';render();
   const p=await generatePlan(ai.a,{signal:ctl.signal});if(ai.ctl!==ctl||ctl.signal.aborted)return; // cancelled
   ai.busy=false;ai.ctl=null;openDraft(p);draft._new=1;draft._ai=lastAI;draft._flow='ai';go('editor');
   toast(lastAI&&lastAI.ai?t('wiz.readyAI'):lastAI&&lastAI.note?lastAI.note:t('wiz.readyBuiltin'))},
 aiCancel:()=>{if(ai.ctl)ai.ctl.abort();ai.ctl=null;ai.busy=false;ai.msg='';render();toast(t('cancelled'))},
 stp:(b,e,mult=1)=>{if(e&&e.type==='click'&&holdUntil>Date.now())return; // pointer already handled it
   noteFocus(+b.dataset.j);const s=db().active.exercises[+b.dataset.j].sets[+b.dataset.k],f=b.dataset.f,d=+b.dataset.d;
   const inc=(f==='w'?(U()==='kg'?2.5:5):1)*mult;const cur=f==='w'?fmtW(+s[f]||0):(+s[f]||0);s[f]=Math.max(0,Math.round((cur+d*inc)*10)/10);Store.save();
   b.parentNode.querySelector('input').value=s[f];if(f==='w'){s.ws='m';b.parentNode.querySelector('input').classList.remove('sugw');cascadeW(+b.dataset.j,+b.dataset.k);Store.save()}if(typeof Live!=='undefined')Live.schedule()},
 setDone:b=>{noteFocus(+b.dataset.j);const e=db().active.exercises[+b.dataset.j],s=e.sets[+b.dataset.k];s.done=!s.done;if(s.done&&s.ws==='s')s.ws='m';Store.save();render();if(s.done&&chimeOn('set'))playChime('set');if(s.done)startTimer(e.rest);if(s.done&&e.sets.every(x=>x.done))setTimeout(()=>autoNext(+b.dataset.j),AUTO_NEXT_MS);if(typeof Live!=='undefined')Live.push()},
 exDone:b=>{const j=+b.dataset.j,a=db().active;if(!a)return;const ae=document.activeElement;if(ae&&ae.dataset&&ae.dataset.bind)ae.dispatchEvent(new Event('input',{bubbles:true}));
   noteFocus(j);const e=a.exercises[j];if(!e)return;const all=e.sets.every(s=>s.done);
   if(all){e.sets.forEach(s=>{s.done=false});stopTimer();Store.save();render();if(typeof Live!=='undefined')Live.push();return}
   e.sets.forEach(s=>{if(s.w===''||s.w==null)s.w=0;if(s.r===''||s.r==null)s.r=+e.repMin||8;s.done=true;if(s.ws==='s')s.ws='m'});
   Store.save();render();if(chimeOn('set'))playChime('set');setTimeout(()=>autoNext(j),AUTO_NEXT_MS);if(typeof Live!=='undefined')Live.push()},
 restGo:b=>{const e=db().active&&db().active.exercises[+b.dataset.j];if(!e)return;startTimer(+e.rest|| (typeof DEFAULT_REST_SEC==='number'?DEFAULT_REST_SEC:120));if(typeof Live!=='undefined')Live.push()},
 restEdit:async b=>{const a=db().active,e=a&&a.exercises[+b.dataset.j];if(!e)return;
   const v=await sheet({title:t('s.editRest'),msg:t('s.repsRest',{reps:repTxt(e),rest:restTxt(e.rest)}),
     html:`<label for="restSec">${t('day.restSec')}</label><input id="restSec" name="rest" type="number" inputmode="numeric" min="0" max="600" value="${+e.rest||0}">`,
     actions:[{v:'save',label:t('day.save'),cls:'acc',run:o=>{const n=+o.querySelector('#restSec').value;if(!Number.isFinite(n)||n<0||n>600)return t('s.restBad');saveExerciseRest(a,e,Math.round(n));return true}},{v:null,label:t('cancel')}]});
   if(v==='save'){toast(t('s.restSaved'));render()}},
 checkMode:b=>setCheckMode(b.dataset.v),
 setAdd:b=>{const e=db().active.exercises[+b.dataset.j],l=e.sets[e.sets.length-1];e.sets.push({w:l.w,r:l.r,done:false,ws:l.ws==='s'?'s':'c'});Store.save();render();if(typeof Live!=='undefined')Live.push()},
 setDel:b=>{db().active.exercises[+b.dataset.j].sets.pop();Store.save();render();if(typeof Live!=='undefined')Live.push()},
 t15:()=>{if(!timer)return;timer.end+=15000;timer.total=(+timer.total||0)+15000;saveRest();renderTimer();if(typeof Live!=='undefined')Live.push()},tskip:()=>{stopTimer();if(typeof Live!=='undefined')Live.push()},
 trackKind:b=>{route.p={kind:b.dataset.v==='exercises'?'exercises':'workouts'};render()},
 trackDay:b=>{const name=b.dataset.name||'',p=trackPrefs(),on=p.days.some(d=>d.toLowerCase()===name.toLowerCase());
   saveTrack({days:on?p.days.filter(d=>d.toLowerCase()!==name.toLowerCase()):p.days.concat(name),exercises:p.exercises});render()},
 trackEx:b=>{const name=b.dataset.name||'',p=trackPrefs(),on=p.exercises.some(d=>d.toLowerCase()===name.toLowerCase());
   saveTrack({days:p.days,exercises:on?p.exercises.filter(d=>d.toLowerCase()!==name.toLowerCase()):p.exercises.concat(name)});render()},
 openTrack:b=>go('history',{kind:'exercises',ex:b.dataset.name||''}),
 openHist:b=>go('hist',{id:b.dataset.id}),
 delHist:async b=>{if(await ask(t('h.delQ'),t('h.delMsg'),t('h.delBtn'),'bad')){Store.deleteHistory(b.dataset.id);toast(t('h.deleted'));pop()}},
 copyW:()=>{db().settings.copyWeight=db().settings.copyWeight===false;Store.save();render()},
 units:b=>{const to=b.dataset.v,from=U();if(to&&to!==from){try{convertAllUnits(from,to)}catch(e){toast(errMsg(e),'err');return}db().settings.units=to;db().settings.unitsChosen=true;Store.save()}else if(to){db().settings.units=to;db().settings.unitsChosen=true;Store.save()}render()},
 syncNow:async b=>{if(navigator.onLine===false){toast(t('sy.offline'));updateNet();return}
   if(Sync.wifiBlocked()){toast(t('sy.wifiWait'));updateNet();return}
   b.disabled=true;b.textContent=t('acc.syncing');try{await Sync.now()}catch(e){}render()},
 wifiOnly:()=>{db().settings.syncWifiOnly=!db().settings.syncWifiOnly;Store.save();if(!db().settings.syncWifiOnly)Sync.soon(300);updateNet();render()},
 nagLater:()=>{db().settings.nagAt=Date.now();Store.save();render();toast(t('nag.ok'))},
 errExport:()=>{const blob=new Blob([Errors.exportJSON()],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`simplelift-errors-${new Date().toISOString().slice(0,10)}.json`;a.click()},
 errClear:()=>{Errors.clear();toast(t('errlog.cleared'));render()},
 export:()=>{const blob=new Blob([Store.exportJSON()],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`simplelift-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();
   db().settings.backupAt=Date.now();Store.save();if(route.v==='home')render();toast(t('set.exported'))},
 import:async()=>{if(!await ask(t('rs.q'),t('rs.msg')+(Sync.on()?' '+t('rs.merge'):'')+' '+t('rs.first'),t('rs.choose'),'acc'))return;
   const f=$('#file');f.value='';f.onchange=()=>{if(!f.files[0])return;const r=new FileReader();r.onload=()=>{try{stopTimer();Store.importJSON(r.result);if(db().active)clearSessionMarker();else markSessionCleared();applyBg();toast(t('rs.done'));I18N.applyDoc();tab('home')}catch(e){info(t('rs.fail'),errMsg(e))}};r.readAsText(f.files[0])};f.click()},
 reset:async()=>{
   if(!Sync.on()){if(await ask(t('rst.q'),t('rst.msg'),t('rst.erase'),'bad')){localReset();tab('home');toast(t('rst.done'))}return}
   const v=await sheet({title:t('rst.q'),msg:t('rst.cloudMsg',{email:Sync.a.email||t('rst.yourAcct')}),
     actions:[{v:'all',label:t('rst.all'),cls:'bad'},{v:'local',label:t('rst.local')},{v:null,label:t('cancel')}]});
   if(v==='all'){endSession();Store.wipeEverywhere();localStorage.removeItem(BG_KEY);applyBg();draft=null;await Sync.now();tab('home');toast(Sync.a.err?t('rst.later'):t('rst.allDone'))}
   else if(v==='local'){await Sync.signOut();localReset();tab('home');toast(t('rst.localDone'))}}
};
function commitDay(sel){draft.days.forEach(d=>d.exercises=d.exercises.filter(e=>e.name.trim()));autoRests(draft);Store.upsertPlan(draft);draftSnap=snap(draft);
  pop();if(route.v==='home'){route.p.sel=Math.min(sel,draft.days.length-1);render();scrollTo(0,0)}}
// Press-and-hold on +/- : one step on press, repeat after 350ms every 120ms, faster over time, double step after 3s.
let holdUntil=0,holdT=null;
function holdStop(){if(holdT){clearTimeout(holdT);holdT=null}}
document.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-act="stp"]');if(!b||e.button>0)return;
  e.preventDefault();holdStop();const t0=Date.now();ACT.stp(b,null);holdUntil=Date.now()+1e9;
  const tick=()=>{const el=Date.now()-t0;ACT.stp(b,null,el>3000?2:1);holdT=setTimeout(tick,Math.max(60,120-Math.floor((el-350)/1000)*25))};
  holdT=setTimeout(tick,350)});
['pointerup','pointercancel','pointerleave'].forEach(t=>document.addEventListener(t,e=>{if(holdT||holdUntil>Date.now()){holdStop();holdUntil=Date.now()+400}},true));
document.addEventListener('contextmenu',e=>{if(e.target.closest('[data-act="stp"]'))e.preventDefault()});
document.addEventListener('click',e=>{
  const pick=e.target.closest('[data-pick]');
  if(pick){const j=+pick.dataset.pick,ex=draft.days[route.p.i].exercises[j],L=libFind(pick.dataset.name);ex.name=L.name;
    if(!hasRest(ex.rest)||ex.restAuto){ex.rest=L.rest;ex.restAuto=true}render();return}
  if(!e.target.closest('.ac'))document.querySelectorAll('.aclist').forEach(x=>x.hidden=true);
  const b=e.target.closest('[data-act]');if(b&&!b.disabled&&ACT[b.dataset.act])ACT[b.dataset.act](b,e)});
document.addEventListener('change',e=>{if(e.target.id==='gateChk'){gate.chk=e.target.checked;return}if(e.target.id==='customColor'){draft.days[route.p.i].color=e.target.value;render()}
  if(e.target.id==='langSel')ACT.setLang(e.target);
  const kb=e.target.dataset&&e.target.dataset.bind;if(kb){const p=kb.split('.');if(p[0]==='ex'&&p[2]==='name'&&draft&&draft.days[route.p.i]){const ex=draft.days[route.p.i].exercises[+p[1]];if(ex)ex.name=I18N.exKey(e.target.value)}}});
document.addEventListener('input',e=>{
  if(e.target.id==='gateChk'){gate.chk=e.target.checked;if(e.target.checked){gate.msg='';const m=$('#gateMsg');if(m)m.textContent=''}return}
  if(e.target.id==='dim'){const v=+e.target.value;$('#dimv').textContent=v+'%';setBg({dim:v/100});return}
  if(e.target.id==='aiText'){$('#injHint').innerHTML=injHint(e.target.value);if(ai&&AI_STEPS[ai.step])ai.a[AI_STEPS[ai.step].key]=e.target.value;saveFlow();return}
  if(e.target.id==='pasteText'&&route.v==='paste'){route.p.text=e.target.value;saveFlow();return}
  const k=e.target.dataset.bind;if(!k)return;const v=e.target.value,parts=k.split('.');
  if(parts[0]==='name')draft.name=v;
  else if(parts[0]==='notes')draft.notes=v;
  else if(parts[0]==='day')draft.days[route.p.i].name=v;
  else if(parts[0]==='ex'){const ex=draft.days[route.p.i].exercises[+parts[1]],f=parts[2];ex[f]=['sets','repMin','repMax','rest'].includes(f)?(v===''?'':+v):f==='weight'?(v===''?'':+v):v;if(f==='rest')delete ex.restAuto; // user typed it: never auto-replace
    if(f==='name')showAC(+parts[1],v)}
  else if(parts[0]==='set'){noteFocus(+parts[1]);const s=db().active.exercises[+parts[1]].sets[+parts[2]],old=s.w;s[parts[3]]=v===''?'':+v;if(parts[3]==='w'){s.ws='m';e.target.classList.remove('sugw');if(v!=='')cascadeW(+parts[1],+parts[2])}Store.save();if(typeof Live!=='undefined')Live.schedule()}
});
// Set weight state ws: 's' suggested (gray), 'c' copied from an edit (white, can be overwritten), 'm' set by the user (white, protected).
// Copy a set's weight to all LATER sets of the same exercise that aren't marked done or set by the user (Settings toggle, default on).
// v27: when the sets below still hold their own per-set suggestions (a warm-up ramp), shift them by the same change
// instead of flattening them; equal suggestions behave exactly like the old copy-down.
// sw = the set's own suggestion from last time (kept on the set, so this works keystroke by keystroke).
function cascadeW(j,k){if(db().settings.copyWeight===false)return;const ex=db().active.exercises[j],src=ex.sets[k],w=src.w;
  const num=x=>x!==''&&x!=null&&isFinite(+x)&&+x>0,base=num(src.sw)?+src.sw:null;
  const ramp=base!=null&&ex.sets.some(t=>num(t.sw)&&+t.sw!==base);
  for(let i=k+1;i<ex.sets.length;i++){const t=ex.sets[i];if(t.done||t.ws==='m')continue;const nw=ramp&&num(t.sw)?Math.max(0,Math.round((+t.sw+w-base)*100)/100):w;t.w=nw;t.ws='c';const inp=document.querySelector(`[data-bind="set.${j}.${i}.w"]`);if(inp){inp.value=nw;inp.classList.remove('sugw')}}}
function showAC(j,q){const box=$('#ac'+j);q=q.trim().toLowerCase();
  if(!q){box.hidden=true;return}
  const words=q.split(/\s+/);
  const m=LIBRARY.filter(x=>{const loc=I18N.exName(x.name);const s=(x.name+' '+loc+' '+x.muscle+' '+x.equip).toLowerCase();return words.every(w=>s.includes(w))}).slice(0,8);
  if(!m.length||(m.length===1&&(m[0].name.toLowerCase()===q||I18N.exName(m[0].name).toLowerCase()===q))){box.hidden=true;return}
  box.innerHTML=m.map(x=>`<div data-pick="${j}" data-name="${esc(x.name)}">${esc(I18N.exName(x.name))} <small>· ${esc(x.muscle)} · ${esc(x.equip)}</small></div>`).join('');box.hidden=false}

