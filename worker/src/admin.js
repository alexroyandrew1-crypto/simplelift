// Simple Lift admin page (GET /admin). One self-contained page: no external assets, no trackers.
// The session token lives only in sessionStorage (cleared when the tab closes). All data is rendered with textContent.
export const ADMIN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Simple Lift Admin</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#111318;color:#e8eaed}main{max-width:720px;margin:0 auto;padding:16px}h1{font-size:20px;margin:4px 0 14px}
.card{background:#1b1e25;border-radius:12px;padding:14px;margin-bottom:12px}input{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #333;background:#0d0f13;color:#fff;font-size:16px;margin:6px 0}
button{padding:10px 14px;border-radius:10px;border:0;font-size:15px;font-weight:600;cursor:pointer}.acc{background:#4ade80;color:#06210f;width:100%}.mut{color:#9aa0aa;font-size:13px}
.row{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid #262a33}.row:first-child{border-top:0}.grow{flex:1;min-width:0}.em{font-weight:600;overflow-wrap:anywhere}
.tg{min-width:76px}.paid{background:#4ade80;color:#06210f}.free{background:#2a2e37;color:#e8eaed}.bar{height:8px;background:#2a2e37;border-radius:4px;overflow:hidden;margin-top:8px}.bar i{display:block;height:100%;background:#4ade80}
.err{color:#f87171;min-height:1.2em}.top{display:flex;justify-content:space-between;align-items:center}.link{background:none;color:#9aa0aa;text-decoration:underline;padding:0}</style></head>
<body><main><div class="top"><h1>Simple Lift Admin</h1><button class="link" id="out" hidden>Sign out</button></div>
<section id="login" class="card"><div class="mut">Sign in with your Simple Lift account.</div><input id="em" type="email" autocomplete="username" placeholder="Email"><input id="pw" type="password" autocomplete="current-password" placeholder="Password">
<button class="acc" id="go">Sign in</button><div class="err" id="lerr"></div></section>
<section id="app" hidden><div class="card" id="spend"></div><div class="card"><input id="q" type="search" placeholder="Search by email"><div class="mut" id="count"></div><div id="list"></div></div><div class="err" id="err"></div></section>
</main><script>
const $=id=>document.getElementById(id);let tok=sessionStorage.getItem('sl_admin')||'',users=[];
const api=async(m,p,b)=>{const r=await fetch(p,{method:m,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:b?JSON.stringify(b):undefined});const j=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(j.message||j.error||('Error '+r.status));e.status=r.status;throw e}return j};
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const usd=v=>'$'+(+v).toFixed(2);
function show(on){$('login').hidden=on;$('app').hidden=!on;$('out').hidden=!on}
async function load(){try{const s=await api('GET','/admin/ai-status');const sp=$('spend');sp.textContent='';
  sp.append(el('b',null,'AI spend: '+usd(s.spent_usd)+' of '+usd(s.cap_usd)+' cap'),el('div','mut',usd(s.remaining_usd)+' left · '+s.calls+' AI calls total · '+s.today_calls+' today'));
  const bar=el('div','bar'),i=el('i');i.style.width=Math.min(100,s.spent_usd/s.cap_usd*100)+'%';bar.append(i);sp.append(bar);
  users=(await api('GET','/admin/users')).users;show(true);draw()}
 catch(e){if(e.status===401||e.status===403){tok='';sessionStorage.removeItem('sl_admin');show(false);$('lerr').textContent=e.status===403?'This account is not an admin.':'Please sign in.'}else $('err').textContent=e.message}}
function draw(){const q=$('q').value.trim().toLowerCase(),L=$('list');L.textContent='';const f=users.filter(u=>u.email.includes(q));
 $('count').textContent=f.length+' of '+users.length+' accounts · '+users.filter(u=>u.plan==='paid').length+' paid';
 for(const u of f){const r=el('div','row'),g=el('div','grow');g.append(el('div','em',u.email),el('div','mut','Joined '+new Date(u.created).toLocaleDateString()+' · '+(u.verified?'verified':'not verified')+' · AI today '+u.aiToday+' · total '+u.aiTotal));
  const b=el('button','tg '+u.plan,u.plan==='paid'?'Paid':'Free');b.title='Tap to switch';b.onclick=async()=>{const to=u.plan==='paid'?'free':'paid';b.disabled=true;
   try{await api('POST','/admin/users/'+u.id+'/plan',{plan:to});u.plan=to;draw()}catch(e){$('err').textContent=e.message;b.disabled=false}};r.append(g,b);L.append(r)}}
$('go').onclick=async()=>{$('lerr').textContent='';try{const j=await api('POST','/login',{email:$('em').value.trim(),password:$('pw').value});$('pw').value='';tok=j.token;sessionStorage.setItem('sl_admin',tok);load()}catch(e){$('lerr').textContent=e.message}};
$('pw').onkeydown=e=>{if(e.key==='Enter')$('go').click()};$('q').oninput=draw;
$('out').onclick=async()=>{try{await api('POST','/logout')}catch(e){}tok='';sessionStorage.removeItem('sl_admin');users=[];$('list').textContent='';show(false)};
if(tok)load();
</script></body></html>`;
