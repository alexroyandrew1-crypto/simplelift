// ===== Accounts + sync (only active when API_URL is set AND the user has signed in) =====
// localStorage stays the source of truth; the server copy is a backup that other devices / the watch read.
const AUTH_KEY='simplelift_auth',OWNER_KEY='simplelift_owner'; // OWNER_KEY = email of the account the local workout data belongs to
// Per-account "this device finished/discarded/signed out" stamp. A pull must not bring that workout back,
// and another account's stamp must not hide a workout that belongs to the signed-in account.
function sessionClrKey(){let o='';try{o=String(localStorage.getItem(OWNER_KEY)||'').toLowerCase()}catch(e){}return 'simplelift_session_clr:'+o}
function sessionClr(){try{return +(localStorage.getItem(sessionClrKey())||0)}catch(e){return 0}}
function markSessionCleared(){try{localStorage.setItem(sessionClrKey(),String(Date.now()))}catch(e){}}
function clearSessionMarker(){try{localStorage.removeItem(sessionClrKey())}catch(e){}}
function staleActive(a,clr){return !!(a&&clr&&(a.started||0)<=clr)}
const Sync={
  get a(){try{return JSON.parse(localStorage.getItem(AUTH_KEY))||{}}catch(e){return{}}},
  set(o){localStorage.setItem(AUTH_KEY,JSON.stringify(Object.assign(this.a,o)))},
  on(){return !!(typeof API_URL==='string'&&API_URL&&this.a.token&&this.a.verified!==false)}, // accounts from before v15 have no flag = verified
  busy:0,again:false,timer:null,epoch:0,_seq:0,
  invalidate(){this.epoch++;this.again=false;clearTimeout(this.timer)},
  async waitIdle(){const start=Date.now();while(this.busy&&Date.now()-start<15000)await new Promise(r=>setTimeout(r,30))},
  async req(method,path,body,tok){
    let r;
    try{r=await fetch(API_URL.replace(/\/+$/,'')+path,{method,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined})}
    catch(e){const err=new Error(t('sy.net'));err.code='network';err.offline=navigator.onLine===false;throw err}
    const j=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(Sync.msg(j,r.status));e.status=r.status;e.code=j.error;throw e}return j},
  msg(j,st){const k={bad_code:1,code_locked:1,unverified:1,mail_not_configured:1,mail_failed:1,bad_password:1,confirm_required:1};
    return k[j.error]?t('sy.'+j.error):j.message||j.error||(st===429?t('sy.429'):t('sy.server',{st}))},
  // Never let one account's local data flow into another account. Guest data (no owner) is only kept when creating a NEW account;
  // signing in to an existing account, or as a different user than the data's owner, wipes local and loads that account's server copy.
  async adopt(mode,email,tok,verified){const e=String(email||'').trim().toLowerCase(),o=localStorage.getItem(OWNER_KEY);
    if(o!==e&&(o||mode!=='up')){
      // Drop in-flight sync from the previous account before its response can be written back.
      this.invalidate();if(typeof stopTimer==='function')stopTimer();await this.waitIdle();
      Store.reset();localStorage.setItem(OWNER_KEY,e);
      if(verified){try{const g=await this.req('GET','/data',null,tok);if(g&&g.data){Store.replace(g.data);if(staleActive(db().active,sessionClr())){db().active=null;Store.save(true)}}}catch(x){}}
      return}
    localStorage.setItem(OWNER_KEY,e)},
  async signIn(mode,email,password){const j=await this.req('POST',mode==='up'?'/register':'/login',{email,password});
    await this.adopt(mode,j.email||email,j.token,j.verified!==false);
    this.set({token:j.token,email:j.email,verified:j.verified!==false,plan:j.plan||'free',lastSync:0,err:''});if(j.verified!==false)await this.now();return j},
  async verify(code){const j=await this.req('POST','/auth/verify',{email:this.a.email,code});this.set({verified:true});await this.now();return j},
  async resend(){return this.req('POST','/auth/resend',{},this.a.token)},
  async forgot(email){return this.req('POST','/auth/forgot',{email})},
  async reset(email,code,newPassword){const j=await this.req('POST','/auth/reset',{email,code,newPassword});
    await this.adopt('in',j.email||email,j.token,true);
    this.set({token:j.token,email:j.email,verified:true,lastSync:0,err:''});await this.now();return j},
  async deleteAccount(password,confirm){const j=await this.req('POST','/auth/delete-account',{password,confirm},this.a.token);clearTimeout(this.timer);localStorage.removeItem(AUTH_KEY);return j},
  async signOut(){const tok=this.a.token;
    // Invalidate first so a sync that started during the workout cannot land after the local wipe.
    this.invalidate();if(typeof stopTimer==='function')stopTimer();markSessionCleared();
    if(db().active){db().active=null;Store.save()}
    await this.waitIdle();
    try{await this.now()}catch(e){} // push the cleared workout so the server copy is not revived on the next sign-in
    this.invalidate();
    try{if(tok)await this.req('POST','/logout',{},tok)}catch(e){}
    localStorage.removeItem(AUTH_KEY);clearTimeout(this.timer);Store.reset();localStorage.removeItem(OWNER_KEY)},
  nextCode(){try{const d=db(),plan=Store.activePlan();if(!plan||!plan.days.length)return null;let i;
    if(d.active&&d.active.planId===plan.id)i=d.active.dayIndex;else{i=plan.next||0;for(let k=0;k<plan.days.length&&plan.days[i].rest;k++)i=(i+1)%plan.days.length}
    if(plan.days[i].rest)return null;const c=watchCode(plan,i);d.watch={planId:plan.id,dayIndex:i,title:c.title,at:Date.now()};return c.code}catch(e){return null}},
  soon(ms=3000){if(!this.on())return;clearTimeout(this.timer);this.timer=setTimeout(()=>this.now(),ms)},
  // Wi-Fi only is a phone setting. Cellular is the only type we hold back. Unknown (most iPhones) still syncs.
  wifiBlocked(){try{if(!db().settings.syncWifiOnly)return false}catch(e){return false}return netInfo().kind==='cell'},
  async now(){if(!this.on())return;clearTimeout(this.timer);
    if(navigator.onLine===false){this.set({err:t('sy.offline'),held:''});if(typeof updateNet==='function')updateNet();if(typeof route!=='undefined'&&route.v==='settings')render();return}
    if(this.wifiBlocked()){this.set({err:t('sy.wifiWait'),held:'wifi'});if(typeof updateNet==='function')updateNet();if(typeof route!=='undefined'&&route.v==='settings')render();return}
    if(this.busy){this.again=true;return}
    const epoch=this.epoch,email=String(this.a.email||'').toLowerCase(),me=this.busy=++this._seq;
    const stale=()=>epoch!==this.epoch||this.busy!==me||String(this.a.email||'').toLowerCase()!==email||!this.on();
    try{const d=JSON.parse(JSON.stringify(db()));
      // Live workouts belong to this device. Never publish `active` so a second phone cannot
      // adopt (or revive after finish) another device's in-progress session. History still syncs.
      delete d.active;
      const code=this.nextCode();Store.save(true);
      const j=await this.req('PUT','/data',{data:d,updatedAt:d.updatedAt||0,watchCode:code,ackResults:this.a.acks||[]},this.a.token);
      if(stale())return;
      this.set({acks:[]});if(j.plan)this.set({plan:j.plan});
      // keep anything changed locally while the request was in flight
      // v27: the workout in progress belongs to this device; a pull never replaces or clears it
      // v30: a finished, discarded or signed-out session stays cleared even if the server still has it
      if(!((db().updatedAt||0)>(d.updatedAt||0))){
        const keep=db().active,clr=sessionClr();
        if(j&&j.data&&typeof j.data==='object')Store.replace(j.data);
        if(keep)db().active=keep;else if(staleActive(db().active,clr))db().active=null;
        if(keep||clr)Store.save(true)}
      else this.again=true;
      if(stale())return;
      const applied=[];for(const r of j.watchResults||[]){const p=parseResult(r.code);try{if(p){const o=applyResult(p);toast('⌚ '+o.msg)}}catch(e){toast('⌚ '+e.message)}applied.push(r.id)}
      if(applied.length){this.set({acks:applied});this.again=true}
      this.set({lastSync:Date.now(),err:'',held:''})}
    catch(e){if(stale())return;if(e.code==='unverified')this.set({verified:false,err:'',held:''});else if(e.status===401){localStorage.removeItem(AUTH_KEY);toast(t('sy.out'))}else this.set({err:navigator.onLine===false?t('sy.offline'):e.message,held:''})}
    finally{if(this.busy===me)this.busy=0;if(epoch!==this.epoch)return;if(typeof updateNet==='function')updateNet();if(typeof route!=='undefined'&&route.v==='settings')render();if(this.again){this.again=false;this.soon(500)}}},
  async pair(){return this.req('POST','/pair/start',{},this.a.token)}, // leftover for older clients; v31 phone uses pairClaim
  async pairClaim(code){return this.req('POST','/pair/claim',{code},this.a.token)},
  // Live workout channel. Separate from `active` so a second phone cannot revive a finished session.
  // 404 means this server build does not have the route yet; the caller backs off.
  async pushLive(snap){if(!this.on()||!snap)return null;return this.req('POST','/live',{snap},this.a.token)},
  async pullLive(){if(!this.on())return null;return this.req('GET','/live',null,this.a.token)},
  watchList:null,
  async listWatches(){try{const j=await this.req('GET','/watches',null,this.a.token);this.watchList=j.watches||[]}catch(e){this.watchList=[]}return this.watchList},
  async removeWatch(id){return this.req('POST','/watches/remove',{id},this.a.token)},
  async renameWatch(id,name){return this.req('POST','/watches/rename',{id,name},this.a.token)},
  status(){const a=this.a;
    if(typeof navigator!=='undefined'&&navigator.onLine===false)return t('acc.statusOffline');
    if(a.held==='wifi')return t('acc.statusWifi');
    if(this.busy)return t('acc.syncing');
    if(a.err)return '⚠ '+a.err;if(!a.lastSync)return t('sy.never');const s=(Date.now()-a.lastSync)/1000;
    return s<60?t('sy.now'):s<3600?t('sy.min',{n:Math.round(s/60)}):t('sy.at',{d:new Date(a.lastSync).toLocaleString(I18N.locale())})}
};
// installs from before v22: signed in but no owner tag yet -> the local data is the signed-in account's
try{if(!localStorage.getItem(OWNER_KEY)&&Sync.a.token&&Sync.a.email)localStorage.setItem(OWNER_KEY,String(Sync.a.email).toLowerCase())}catch(e){}
function onStoreSave(){Sync.soon()}
// What this phone can tell us. kind is off | wifi | cell | unknown. iOS often reports unknown and must not be treated as mobile data.
function netInfo(){const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;const type=c&&c.type||'';const on=navigator.onLine!==false&&type!=='none';
  let kind='unknown';if(!on)kind='off';else if(type==='wifi'||type==='ethernet')kind='wifi';else if(type==='cellular')kind='cell';
  return {on,type,kind}}
window.addEventListener('online',()=>{Sync.soon(500);if(typeof updateNet==='function')updateNet()});
window.addEventListener('offline',()=>{if(Sync.a.token)Sync.set({err:t('sy.offline'),held:''});if(typeof updateNet==='function')updateNet()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){Sync.soon(500);if(typeof updateNet==='function')updateNet()}});
if(navigator.connection)navigator.connection.addEventListener('change',()=>{if(typeof updateNet==='function')updateNet();if(navigator.onLine&&!Sync.wifiBlocked())Sync.soon(500)});
