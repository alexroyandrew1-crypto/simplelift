// Local error log. window.onerror and unhandledrejection stay on this phone.
// A copy is POSTed to /errors only when API_URL is set and the user is signed in.
// The server route is documented in docs/ERRORS.md and is not implemented here.
var Errors=(function(){
  var KEY='simplelift_errors',MAX=40;
  function storage(){try{return typeof localStorage!=='undefined'?localStorage:null}catch(e){return null}}
  function read(){var s=storage();if(!s)return [];try{var a=JSON.parse(s.getItem(KEY)||'[]');return Array.isArray(a)?a:[]}catch(e){return []}}
  function write(a){var s=storage();if(!s)return;try{s.setItem(KEY,JSON.stringify(a.slice(-MAX)))}catch(e){}}
  function clip(v,n){v=String(v==null?'':v);return v.length>n?v.slice(0,n):v}
  function redact(v){return clip(v,1500).replace(/Bearer\s+\S+/gi,'Bearer [redacted]')}
  function push(partial){
    var row={
      t:Date.now(),
      kind:partial&&partial.kind==='rejection'?'rejection':'error',
      msg:redact(partial&&partial.msg).slice(0,500),
      src:clip(partial&&partial.src,180),
      line:partial&&partial.line|0,
      col:partial&&partial.col|0,
      stack:redact(partial&&partial.stack).slice(0,1200),
      v:typeof APP_VERSION!=='undefined'?String(APP_VERSION):''
    };
    var a=read();a.push(row);write(a);report(row);return row}
  function report(row){
    var api=typeof API_URL==='string'?API_URL:'';
    if(!api||typeof Sync==='undefined'||!Sync.on||!Sync.on()||!Sync.a||!Sync.a.token||typeof fetch!=='function')return;
    try{
      var p=fetch(api.replace(/\/+$/,'')+'/errors',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+Sync.a.token},
        body:JSON.stringify({errors:[{t:row.t,kind:row.kind,msg:row.msg,src:row.src,line:row.line,col:row.col,stack:row.stack,v:row.v}]})
      });
      if(p&&p.catch)p.catch(function(){});
    }catch(e){}}
  function install(){
    var g=typeof window!=='undefined'?window:null;
    if(!g||g.__slErrors||!g.addEventListener)return;
    g.__slErrors=true;
    g.addEventListener('error',function(e){
      push({kind:'error',msg:e&&e.message,src:e&&e.filename,line:e&&e.lineno,col:e&&e.colno,stack:e&&e.error&&e.error.stack})});
    g.addEventListener('unhandledrejection',function(e){
      var r=e&&e.reason;
      push({kind:'rejection',msg:r&&r.message?r.message:r,stack:r&&r.stack})})}
  return {push:push,list:read,clear:function(){var s=storage();if(s){try{s.removeItem(KEY)}catch(e){}}},
    exportJSON:function(){return JSON.stringify(read(),null,2)},install:install,MAX:MAX};
})();
function errorLogCard(){
  if(typeof Errors==='undefined'||typeof t!=='function')return '';
  var rows=Errors.list();
  var body=rows.length?rows.slice().reverse().slice(0,8).map(function(e){
    var when='';try{when=new Date(e.t).toLocaleString(typeof I18N!=='undefined'?I18N.locale():undefined)}catch(err){when=''}
    var where=e.src?String(e.src).split('/').pop()+(e.line?':'+e.line:''):'';
    return '<div class="mt2"><b>'+esc(e.msg||'')+'</b><div class="mut">'+esc(when)+(where?' · '+esc(where):'')+'</div></div>';
  }).join(''):'<div class="mut mt2">'+t('errlog.empty')+'</div>';
  return '<div class="card" id="errlog"><h3>'+t('errlog.title')+'</h3><div class="mut">'+t('errlog.hint')+'</div>'+body+
    '<button class="btn full" data-act="errExport">'+t('errlog.export')+'</button>'+
    (rows.length?'<button class="btn full" data-act="errClear">'+t('errlog.clear')+'</button>':'')+'</div>';
}
try{Errors.install()}catch(e){}
this.Errors=Errors;
