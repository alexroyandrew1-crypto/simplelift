// ===== Accounts + sync (only active when API_URL is set AND the user has signed in) =====
// localStorage stays the source of truth; the server copy is a backup that other devices / the watch read.
const AUTH_KEY='simplelift_auth';
const Sync={
  get a(){try{return JSON.parse(localStorage.getItem(AUTH_KEY))||{}}catch(e){return{}}},
  set(o){localStorage.setItem(AUTH_KEY,JSON.stringify(Object.assign(this.a,o)))},
  on(){return !!(typeof API_URL==='string'&&API_URL&&this.a.token&&this.a.verified!==false)}, // accounts from before v15 have no flag = verified
  busy:false,again:false,timer:null,
  async req(method,path,body,tok){
    const r=await fetch(API_URL.replace(/\/+$/,'')+path,{method,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined});
    const j=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(Sync.msg(j,r.status));e.status=r.status;e.code=j.error;throw e}return j},
  msg(j,st){return({bad_code:'That code is wrong or has expired. Check the email or tap Resend.',code_locked:'Too many wrong tries. Tap Resend to get a new code.',
    unverified:'Verify your email first. Enter the 6-digit code we emailed you.',mail_not_configured:'Email is not set up on the server yet, so we could not send a code. Try again later.',
    mail_failed:'We could not send the email right now. Try again in a few minutes.',
    bad_password:'That password is wrong.',confirm_required:'Type DELETE to confirm.'})[j.error]||j.message||j.error||(st===429?'Too many tries. Wait a minute and try again.':'Server error '+st)},
  async signIn(mode,email,password){const j=await this.req('POST',mode==='up'?'/register':'/login',{email,password});
    this.set({token:j.token,email:j.email,verified:j.verified!==false,plan:j.plan||'free',lastSync:0,err:''});if(j.verified!==false)await this.now();return j},
  async verify(code){const j=await this.req('POST','/auth/verify',{email:this.a.email,code});this.set({verified:true});await this.now();return j},
  async resend(){return this.req('POST','/auth/resend',{},this.a.token)},
  async forgot(email){return this.req('POST','/auth/forgot',{email})},
  async reset(email,code,newPassword){const j=await this.req('POST','/auth/reset',{email,code,newPassword});
    this.set({token:j.token,email:j.email,verified:true,lastSync:0,err:''});await this.now();return j},
  async deleteAccount(password,confirm){const j=await this.req('POST','/auth/delete-account',{password,confirm},this.a.token);clearTimeout(this.timer);localStorage.removeItem(AUTH_KEY);return j},
  async signOut(){const t=this.a.token;try{if(t)await this.req('POST','/logout',{},t)}catch(e){}localStorage.removeItem(AUTH_KEY)},
  nextCode(){try{const d=db(),plan=Store.activePlan();if(!plan||!plan.days.length)return null;let i;
    if(d.active&&d.active.planId===plan.id)i=d.active.dayIndex;else{i=plan.next||0;for(let k=0;k<plan.days.length&&plan.days[i].rest;k++)i=(i+1)%plan.days.length}
    if(plan.days[i].rest)return null;const c=watchCode(plan,i);d.watch={planId:plan.id,dayIndex:i,title:c.title,at:Date.now()};return c.code}catch(e){return null}},
  soon(ms=3000){if(!this.on())return;clearTimeout(this.timer);this.timer=setTimeout(()=>this.now(),ms)},
  async now(){if(!this.on())return;if(this.busy){this.again=true;return}this.busy=true;
    try{const d=JSON.parse(JSON.stringify(db()));const code=this.nextCode();Store.save(true);
      const j=await this.req('PUT','/data',{data:d,updatedAt:d.updatedAt||0,watchCode:code,ackResults:this.a.acks||[]},this.a.token);
      this.set({acks:[]});if(j.plan)this.set({plan:j.plan});
      // keep anything changed locally while the request was in flight
      if(!((db().updatedAt||0)>(d.updatedAt||0)))Store.replace(j.data);else this.again=true;
      const applied=[];for(const r of j.watchResults||[]){const p=parseResult(r.code);try{if(p){const o=applyResult(p);toast('⌚ '+o.msg)}}catch(e){toast('⌚ '+e.message)}applied.push(r.id)}
      if(applied.length){this.set({acks:applied});this.again=true}
      this.set({lastSync:Date.now(),err:''})}
    catch(e){if(e.code==='unverified')this.set({verified:false,err:''});else if(e.status===401){localStorage.removeItem(AUTH_KEY);toast('Signed out of sync. Sign in again in Settings.')}else this.set({err:navigator.onLine===false?'Offline — will sync later':e.message})}
    finally{this.busy=false;if(typeof route!=='undefined'&&route.v==='settings')render();if(this.again){this.again=false;this.soon(500)}}},
  async pair(){return this.req('POST','/pair/start',{},this.a.token)},
  status(){const a=this.a;if(a.err)return '⚠ '+a.err;if(!a.lastSync)return 'Not synced yet';const s=(Date.now()-a.lastSync)/1000;
    return 'Synced '+(s<60?'just now':s<3600?Math.round(s/60)+' min ago':new Date(a.lastSync).toLocaleString())}
};
function onStoreSave(){Sync.soon()}
window.addEventListener('online',()=>Sync.soon(500));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')Sync.soon(500)});
