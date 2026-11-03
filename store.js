// Data layer. Everything goes through Store so accounts/cloud sync can replace localStorage later
// (e.g. swap load()/save() for API calls and keep the same shape).
const Store=(()=>{
  const KEY='simplelift_v1';
  const blank=()=>({version:1,settings:{units:'lb'},plans:[],activePlanId:null,history:[],active:null});
  let db;
  function load(){try{db=Object.assign(blank(),JSON.parse(localStorage.getItem(KEY))||{})}catch(e){db=blank()}
    // lb is the default; only an explicit tap on the Settings unit toggle (unitsChosen) keeps kg
    if(!db.settings||typeof db.settings!=='object')db.settings={};if(!db.settings.unitsChosen)db.settings.units='lb';return db}
  function save(quiet){if(!quiet)db.updatedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(db));if(!quiet&&typeof onStoreSave==='function')onStoreSave()}
  const tomb=id=>{db.deleted=(db.deleted||[]);db.deleted.push(id);if(db.deleted.length>2000)db.deleted=db.deleted.slice(-2000)};
  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  load();
  return{
    uid,get db(){return db},save,
    activePlan(){return db.plans.find(p=>p.id===db.activePlanId)||null},
    plan(id){return db.plans.find(p=>p.id===id)},
    upsertPlan(p){const i=db.plans.findIndex(x=>x.id===p.id);if(i<0)db.plans.push(p);else db.plans[i]=p;if(!db.activePlanId)db.activePlanId=p.id;save()},
    deletePlan(id){tomb(id);db.plans=db.plans.filter(p=>p.id!==id);if(db.activePlanId===id)db.activePlanId=db.plans[0]?.id||null;save()},
    setActive(id){db.activePlanId=id;save()},
    addHistory(w){db.history.push(w);save()},
    deleteHistory(id){tomb(id);db.history=db.history.filter(h=>h.id!==id);save()},
    lastFor(name,oldId){const k=name.toLowerCase();const h=db.history.slice().sort((a,b)=>b.date-a.date);for(const w of h){const e=w.exercises.find(x=>x.name.toLowerCase()===k||(oldId&&x.oldId===oldId));if(e)return e}return null},
    exportJSON(){const o=Object.assign({},db);const bg=localStorage.getItem('simplelift_bg_img');if(bg)o.bgImage=bg;return JSON.stringify(o,null,2)},
    importJSON(t){const d=JSON.parse(t);if(!d||!Array.isArray(d.plans)||!Array.isArray(d.history))throw new Error('Not a Simple Lift backup');if(d.bgImage){try{localStorage.setItem('simplelift_bg_img',d.bgImage)}catch(e){}}delete d.bgImage;db=Object.assign(blank(),d);save()},
    replace(d){const keepUnits=db.settings;db=Object.assign(blank(),d);if(!db.settings||typeof db.settings!=='object')db.settings=keepUnits;if(!db.settings.unitsChosen)db.settings.units='lb';save(true)},
    reset(){localStorage.removeItem(KEY);load()}
  };
})();
