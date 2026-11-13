// Live workout sync (v34). One compact snapshot is the whole protocol, on Bluetooth and on the server.
// Weights are whole pounds, the same unit the watch stores. rev is a counter; a higher rev from the other device wins.
// `active` is still never published in the account blob, so a second phone cannot revive a finished session from /data.
var LiveSnap = {
  MODES: ['set', 'exercise', 'none'],
  norm(m) { return this.MODES.indexOf(m) >= 0 ? m : 'set'; },
  toLb(v, units) { return Math.round(units === 'kg' ? (+v || 0) / 0.4536 : (+v || 0)); },
  fromLb(v, units) { return units === 'kg' ? Math.round((+v || 0) * 0.4536 / 2.5) * 2.5 : (+v || 0); },
  fromActive(a, units) {
    const now = Math.floor(Date.now() / 1000);
    return {
      t: 'snap', id: a.id, rev: a.rev | 0, src: 'p', at: a.revAt || now,
      mode: this.norm(a.checkMode), day: a.dayIndex | 0, name: a.dayName || '', plan: a.planId || '',
      code: '', idx: a.focus | 0, ord: Array.isArray(a.order) ? a.order.slice() : (a.exercises || []).map((_, i) => i),
      rest: a.restEnd ? Math.floor(a.restEnd / 1000) : 0, fin: a.finPending ? 1 : 0, drop: a.dropPending ? 1 : 0,
      ex: (a.exercises || []).map(e => ({
        n: e.name, rest: +e.rest || 0,
        s: (e.sets || []).map(s => ({ w: this.toLb(s.w, units), r: +s.r || 0, d: s.done ? 1 : 0 }))
      }))
    };
  },
  // True when this snapshot should replace the open session.
  wins(a, snap, selfSrc) {
    if (!snap || typeof snap !== 'object') return false;
    if (snap.t && snap.t !== 'snap') return false;
    const src = snap.src || '';
    if (src === selfSrc && a && snap.id === a.id && (snap.rev | 0) <= (a.rev | 0)) return false;
    if (!a) return !snap.drop;
    if (snap.id !== a.id) {
      const at = snap.at | 0, started = Math.floor((a.started || 0) / 1000);
      return at >= started;
    }
    return (snap.rev | 0) > (a.rev | 0);
  },
  historyFrom(snap, units) {
    const rows = (snap.ex || []).map(e => ({
      name: e.n,
      sets: (e.s || []).filter(s => snap.fin || s.d).map(s => ({ w: this.fromLb(s.w, units), r: +s.r || 0 }))
    })).filter(e => e.sets.length);
    return {
      id: snap.id, date: Date.now(), planId: snap.plan || '', planName: '', dayName: snap.name || 'Workout',
      units: units || 'lb', minutes: 0, fromWatch: snap.src === 'w', exercises: rows
    };
  }
};

var Live = {
  bt: false,
  btTried: false,
  quiet: false,
  httpOff: false,
  httpTry: 0,
  closed: {},
  _t: null,
  plugin() {
    const C = typeof window !== 'undefined' && window.Capacitor;
    return C && C.Plugins && C.Plugins.GarminLink || null;
  },
  start() {
    const p = this.plugin();
    if (p && !this.btTried) {
      this.btTried = true;
      const onMsg = e => this.onBt(e);
      const onStat = e => { this.bt = !!(e && e.connected); if (typeof render === 'function' && typeof route !== 'undefined' && route.v === 'pair') render(); };
      try { const h = p.addListener && p.addListener('message', onMsg); if (h && h.catch) h.catch(() => {}); } catch (e) {}
      try { const h = p.addListener && p.addListener('status', onStat); if (h && h.catch) h.catch(() => {}); } catch (e) {}
      try { const s = p.start && p.start(); if (s && s.catch) s.catch(() => {}); } catch (e) {}
    }
    if (!this._poll) this._poll = setInterval(() => this.pull(), 2500);
  },
  snap() {
    const a = db().active; if (!a) return null;
    const s = LiveSnap.fromActive(a, U());
    try {
      const plan = Store.plan(a.planId) || Store.activePlan();
      if (plan && typeof watchCode === 'function') { const c = watchCode(plan, a.dayIndex); if (c && c.code) s.code = c.code; }
    } catch (e) {}
    return s;
  },
  schedule() { if (this.quiet) return; clearTimeout(this._t); this._t = setTimeout(() => this.push(), 250); },
  push() {
    clearTimeout(this._t);
    if (this.quiet || !db().active) return;
    const a = db().active;
    a.rev = (a.rev | 0) + 1;
    a.revAt = Math.floor(Date.now() / 1000);
    this.tx(this.snap());
  },
  finish() {
    clearTimeout(this._t);
    const a = db().active; if (!a || this.quiet) return;
    a.finPending = 1;
    a.rev = (a.rev | 0) + 1;
    a.revAt = Math.floor(Date.now() / 1000);
    this.closed[a.id] = 1;
    this.tx(this.snap());
  },
  drop() {
    clearTimeout(this._t);
    const a = db().active; if (!a || this.quiet) return;
    a.dropPending = 1;
    a.rev = (a.rev | 0) + 1;
    a.revAt = Math.floor(Date.now() / 1000);
    this.closed[a.id] = 1;
    this.tx(this.snap());
  },
  tx(snap) {
    if (!snap) return;
    const p = this.plugin();
    if (p && p.send) { try { const r = p.send({ json: JSON.stringify(snap) }); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
    if (typeof Sync !== 'undefined' && Sync.on && Sync.on()) {
      Sync.pushLive(snap).then(j => { this.httpOff = false; if (j && j.snap) this.onIncoming(j.snap); }).catch(e => { if (e && e.status === 404) this.httpOff = true; });
    }
  },
  pull() {
    if (typeof Sync === 'undefined' || !Sync.on || !Sync.on()) return;
    if (this.httpOff && Date.now() - this.httpTry < 30000) return;
    this.httpTry = Date.now();
    Sync.pullLive().then(j => { this.httpOff = false; if (j && j.snap) this.onIncoming(j.snap); }).catch(e => { if (e && e.status === 404) this.httpOff = true; });
  },
  onBt(e) {
    this.bt = true;
    let snap = e && (e.snap || e.json || e);
    if (typeof snap === 'string') { try { snap = JSON.parse(snap); } catch (err) { return; } }
    if (Array.isArray(snap) && snap.length === 1) snap = snap[0];
    this.onIncoming(snap);
  },
  claim(code) {
    const c = String(code || '').replace(/\D/g, '');
    if (c.length !== 6 || this.claimed === c) return;
    if (typeof Sync === 'undefined' || !Sync.on || !Sync.on()) return;
    this.claimed = c;
    Sync.pairClaim(c).then(() => { if (typeof toast === 'function') toast(t('pair.ok')); if (typeof route !== 'undefined' && route.v === 'pair') { stack = []; tab('settings'); } }).catch(() => { this.claimed = ''; });
  },
  onIncoming(snap) {
    if (!snap || typeof snap !== 'object') return;
    if (snap.t === 'pair') { this.claim(snap.code); return; }
    if (snap.t === 'hello') { this.bt = true; if (db().active) this.push(); return; }
    if (snap.t && snap.t !== 'snap') return;
    if (snap.id && this.closed[snap.id]) return;
    const a = db().active;
    if (!LiveSnap.wins(a, snap, 'p')) return;
    this.quiet = true;
    try { this.apply(snap); } finally { this.quiet = false; }
  },
  apply(snap) {
    const units = U();
    db().settings.checkMode = LiveSnap.norm(snap.mode);
    if (snap.drop) {
      this.closed[snap.id] = 1;
      if (db().active && db().active.id === snap.id) { endSession(); if (typeof toast === 'function') toast(t('s.discarded')); if (route.v === 'session') tab('home'); }
      return;
    }
    if (snap.fin) {
      this.closed[snap.id] = 1;
      if (Store.db.history.some(h => h.id === snap.id)) {
        if (db().active && db().active.id === snap.id) endSession();
        return;
      }
      if (!db().active || db().active.id !== snap.id) db().active = this.build(snap, units);
      this.merge(db().active, snap, units);
      db().active.finPending = 1;
      finishWorkout();
      return;
    }
    if (!db().active || db().active.id !== snap.id) {
      db().active = this.build(snap, units);
      clearSessionMarker();
      if (typeof route === 'undefined' || route.v !== 'session') go('session');
      else render();
    } else this.merge(db().active, snap, units);
    Store.save(true);
    if (typeof resumeRest === 'function') resumeRest();
    if (route.v === 'session') { render(); scrollToFocus(); }
  },
  recentDay(snap) {
    const now = Date.now();
    return Store.db.history.some(h => h.dayName === snap.name && Math.abs((h.date || 0) - now) < 180000);
  },
  build(snap, units) {
    const plan = (snap.plan && Store.plan(snap.plan)) || Store.activePlan();
    let day = plan && plan.days[snap.day | 0];
    if (plan && (!day || (snap.name && day.name !== snap.name))) {
      const i = plan.days.findIndex(d => d.name === snap.name);
      if (i >= 0) day = plan.days[i];
    }
    const idx = day && plan ? plan.days.indexOf(day) : (snap.day | 0);
    return {
      id: snap.id, planId: plan ? plan.id : (snap.plan || ''), planName: plan ? plan.name : '',
      dayIndex: idx, dayName: (day && day.name) || snap.name || 'Workout',
      started: (snap.at || Math.floor(Date.now() / 1000)) * 1000, focus: snap.idx | 0,
      checkMode: LiveSnap.norm(snap.mode), rev: snap.rev | 0, revAt: snap.at | 0,
      order: Array.isArray(snap.ord) ? snap.ord.slice() : [],
      restEnd: (snap.rest | 0) > Math.floor(Date.now() / 1000) ? snap.rest * 1000 : null,
      exercises: (snap.ex || []).map(ex => ({
        name: ex.n, rest: +ex.rest || 0, repMin: ex.s && ex.s[0] ? +ex.s[0].r || 8 : 8, repMax: ex.s && ex.s[0] ? +ex.s[0].r || 8 : 8,
        sets: (ex.s || []).map(s => ({ w: LiveSnap.fromLb(s.w, units), r: +s.r || 0, done: !!s.d, ws: s.d ? 'm' : 's' }))
      }))
    };
  },
  merge(a, snap, units) {
    a.rev = snap.rev | 0; a.revAt = snap.at | 0; a.checkMode = LiveSnap.norm(snap.mode); a.focus = snap.idx | 0;
    if (Array.isArray(snap.ord)) a.order = snap.ord.slice();
    a.restEnd = (snap.rest | 0) > Math.floor(Date.now() / 1000) ? snap.rest * 1000 : null;
    (snap.ex || []).forEach(ex => {
      const le = a.exercises.find(x => x.name === ex.n) || a.exercises[(snap.ex || []).indexOf(ex)];
      if (!le) return;
      (ex.s || []).forEach((s, k) => {
        if (!le.sets[k]) le.sets[k] = { w: '', r: '', done: false, ws: 'm' };
        le.sets[k].w = LiveSnap.fromLb(s.w, units);
        le.sets[k].r = +s.r || 0;
        le.sets[k].done = !!s.d;
        if (s.d) le.sets[k].ws = 'm';
      });
      if (le.sets.length > (ex.s || []).length) le.sets.length = (ex.s || []).length;
    });
  }
};
this.LiveSnap = LiveSnap;
this.Live = Live;
