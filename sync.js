// ===== Accounts + sync (only active when API_URL is set AND the user has signed in) =====
// localStorage stays the source of truth; the server copy is a backup that other devices / the watch read.
const AUTH_KEY='simplelift_auth',OWNER_KEY='simplelift_owner'; // OWNER_KEY = email of the account the local workout data belongs to
const Sync={
  get a(){try{return JSON.parse(localStorage.getItem(AUTH_KEY))||{}}catch(e){return{}}},
  set(o){localStorage.setItem(AUTH_KEY,JSON.stringify(Object.assign(this.a,o)))},
  on(){return !!(typeof API_URL==='string'&&API_URL&&this.a.token&&this.a.verified!==false)}, // accounts from before v15 have no flag = verified
  busy:false,again:false,timer:null,
  async req(method,path,body,tok){
    const r=await fetch(API_URL.replace(/\/+$/,'')+path,{method,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined});
    const j=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(Sync.msg(j,r.status));e.status=r.status;e.code=j.error;throw e}return j},
  msg(j,st){const k={bad_code:1,code_locked:1,unverified:1,mail_not_configured:1,mail_failed:1,bad_password:1,confirm_required:1};
    return k[j.error]?t('sy.'+j.error):j.message||j.error||(st===429?t('sy.429'):t('sy.server',{st}))},
  // Never let one account's local data flow into another account. Guest data (no owner) is only kept when creating a NEW account;
  // signing in to an existing account, or as a different user than the data's owner, wipes local and loads that account's server copy.
  async adopt(mode,email,tok,verified){const e=String(email||'').trim().toLowerCase(),o=localStorage.getItem(OWNER_KEY);
    if(o!==e&&(o||mode!=='up')){Store.reset();if(verified){try{const g=await this.req('GET','/data',null,tok);if(g&&g.data)Store.replace(g.data)}catch(x){}}}
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
  async signOut(){const t=this.a.token;try{await this.now()}catch(e){}try{if(t)await this.req('POST','/logout',{},t)}catch(e){}localStorage.removeItem(AUTH_KEY);clearTimeout(this.timer);Store.reset();localStorage.removeItem(OWNER_KEY)},
  nextCode(){try{const d=db(),plan=Store.activePlan();if(!plan||!plan.days.length)return null;let i;
    if(d.active&&d.active.planId===plan.id)i=d.active.dayIndex;else{i=plan.next||0;for(let k=0;k<plan.days.length&&plan.days[i].rest;k++)i=(i+1)%plan.days.length}
    if(plan.days[i].rest)return null;const c=watchCode(plan,i);d.watch={planId:plan.id,dayIndex:i,title:c.title,at:Date.now()};return c.code}catch(e){return null}},
  soon(ms=3000){if(!this.on())return;clearTimeout(this.timer);this.timer=setTimeout(()=>this.now(),ms)},
  async now(){if(!this.on())return;if(this.busy){this.again=true;return}this.busy=true;
    try{const d=JSON.parse(JSON.stringify(db()));const code=this.nextCode();Store.save(true);
      const j=await this.req('PUT','/data',{data:d,updatedAt:d.updatedAt||0,watchCode:code,ackResults:this.a.acks||[]},this.a.token);
      this.set({acks:[]});if(j.plan)this.set({plan:j.plan});
      // keep anything changed locally while the request was in flight
      // v27: the workout in progress belongs to this device; a pull never replaces or clears it
      if(!((db().updatedAt||0)>(d.updatedAt||0))){const keep=db().active;Store.replace(j.data);if(keep){db().active=keep;Store.save(true)}}else this.again=true;
      const applied=[];for(const r of j.watchResults||[]){const p=parseResult(r.code);try{if(p){const o=applyResult(p);toast('⌚ '+o.msg)}}catch(e){toast('⌚ '+e.message)}applied.push(r.id)}
      if(applied.length){this.set({acks:applied});this.again=true}
      this.set({lastSync:Date.now(),err:''})}
    catch(e){if(e.code==='unverified')this.set({verified:false,err:''});else if(e.status===401){localStorage.removeItem(AUTH_KEY);toast(t('sy.out'))}else this.set({err:navigator.onLine===false?t('sy.offline'):e.message})}
    finally{this.busy=false;if(typeof route!=='undefined'&&route.v==='settings')render();if(this.again){this.again=false;this.soon(500)}}},
  async pair(){return this.req('POST','/pair/start',{},this.a.token)},
  status(){const a=this.a;if(a.err)return '⚠ '+a.err;if(!a.lastSync)return t('sy.never');const s=(Date.now()-a.lastSync)/1000;
    return s<60?t('sy.now'):s<3600?t('sy.min',{n:Math.round(s/60)}):t('sy.at',{d:new Date(a.lastSync).toLocaleString(I18N.locale())})}
};
// installs from before v22: signed in but no owner tag yet -> the local data is the signed-in account's
try{if(!localStorage.getItem(OWNER_KEY)&&Sync.a.token&&Sync.a.email)localStorage.setItem(OWNER_KEY,String(Sync.a.email).toLowerCase())}catch(e){}
function onStoreSave(){Sync.soon()}
window.addEventListener('online',()=>Sync.soon(500));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')Sync.soon(500)});
