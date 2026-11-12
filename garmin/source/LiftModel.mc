import Toybox.Application;
import Toybox.Lang;
import Toybox.Timer;
import Toybox.Attention;
import Toybox.ActivityRecording;
import Toybox.Activity;
import Toybox.WatchUi;
import Toybox.Time;
import Toybox.Math;
import Toybox.UserProfile;

// v2 workout state. One LiftModel per picked workout.
const FOCUS_NONE = 0;
const FOCUS_WT = 1;           // the weight is highlighted: UP/DOWN = +/-5 lb
const FOCUS_REPS = 2;         // the rep number is highlighted: UP/DOWN = +/-1 rep

class LiftModel {
    var w as Dictionary;
    var ex as Array;
    var idx as Number = 0;      // current exercise
    var sel as Number = 0;      // selected set in the current exercise
    var focus as Number = 0;    // the ONE highlighted control: FOCUS_NONE / FOCUS_WT / FOCUS_REPS (never two at once)
    var flashTimer as Timer.Timer?; // bright tap feedback for ~0.5 s (the normal highlight stays while focused)
    var done as Array;          // done[i][s] = true/false
    var weights as Array;       // weights[i][s] in lb
    var restLeft as Number = 0;
    var restTotal as Number = 0;
    var restEx as Number = -1;  // set that is resting (dot turns green when rest ends)
    var restSet as Number = -1;
    var restTimer as Timer.Timer?;
    var session as ActivityRecording.Session?;
    var finished as Boolean = false;
    var result as String = "";
    // Rep detection (motion auto-start)
    var det as RepDetector?;
    var setLive as Boolean = false;   // movement detected for the selected set
    var liveReps as Number = 0;
    var repBase as Number = 0;
    const REST_MIN_BEFORE_AUTOSTART = 15;
    // Auto-detect sets (default OFF). After enough clean reps, a few seconds of
    // stillness logs the current set, starts rest, vibrates, and offers a short undo.
    const AUTO_MIN_REPS = 3;
    const AUTO_STILL_MS = 3000;      // stillness after the last counted rep
    const AUTO_MIN_SAMPLES = 36;     // first-to-last rep >= 1.44 s (2 x RepDetector.MIN_GAP)
    const AUTO_UNDO_MS = 5000;
    const AUTO_DEBOUNCE_S = 8;       // after an undo, ignore motion this long
    const AUTO_REPS_MAX = 30;        // detected count above this is not treated as reliable
    const AUTO_REPS_SLACK = 8;       // detected may exceed the planned target by this much
    var stillTimer as Timer.Timer?;
    var motionStartN as Number = 0;
    var undoInfo as Dictionary?;
    var undoTimer as Timer.Timer?;
    var autoBlockUntil as Number = 0;
    // Calories for the done screen
    var startedAt as Number? = null;  // epoch s of the first checked set (persisted with the progress)
    var calories as Number = 0;
    var calSource as String = "";
    var workSecs as Number = 0;       // total workout time for the done screen
    var timeSource as String = "";
    var resumed as Boolean = false;   // progress was restored from a saved state (session timer then misses earlier time)
    // Visit order: indices into ex. Skipping forward off an unfinished exercise moves it to the end.
    // done/weights/resultCode/stats/FIT laps all stay in the ORIGINAL plan order.
    var order as Array<Number> = [] as Array<Number>;
    var promptOpen as Boolean = false;
    var skipped as Array<Number> = [] as Array<Number>;   // exercises skipped at least once (they sit at the tail of order)     // "garmin" (session) or "estimate" (MET fallback)  // s of rest that must pass before motion can end it

    function initialize(workout as Dictionary) {
        w = workout;
        ex = [];
        var src = w[:ex] as Array;
        for (var i = 0; i < src.size(); i++) {
            var e0 = src[i] as Dictionary;
            ex.add({ :name => e0[:name], :reps => (e0[:reps] as Array).slice(0, null), :w => e0[:w], :rest => e0[:rest] });
        }
        done = [];
        weights = [];
        for (var i = 0; i < ex.size(); i++) {
            var e = ex[i] as Dictionary;
            var n = (e[:reps] as Array).size();
            var d = [];
            for (var s = 0; s < n; s++) { d.add(false); }
            done.add(d);
            weights.add((e[:w] as Array).slice(0, null));
            order.add(i);
        }
        // Restore saved progress if it belongs to the same workout code
        var st = Storage.getValue("state");
        if (st instanceof Dictionary && (w[:code] as String).equals(st["code"])) {
            var sd = st["done"]; var sw = st["weights"];
            var sr = st["reps"];          // per-exercise reps, incl. sets added on the watch
            if (sd instanceof Array && sd.size() == done.size() && sw instanceof Array && sw.size() == weights.size()) {
                var ok = true;
                for (var i = 0; i < sd.size(); i++) {
                    var n = (sd[i] as Array).size();
                    var r = (sr instanceof Array && sr.size() == ex.size()) ? (sr[i] as Array) : ((ex[i] as Dictionary)[:reps] as Array);
                    if (n != (sw[i] as Array).size() || n != r.size()) { ok = false; }
                }
                if (ok) {
                    done = sd; weights = sw;
                    if (sr instanceof Array && sr.size() == ex.size()) { for (var i = 0; i < ex.size(); i++) { var ed = ex[i] as Dictionary; ed[:reps] = sr[i]; } }
                }
            }
            var sa = st["start"];
            if (sa instanceof Number) { startedAt = sa; }
            var so = st["order"];
            if (so instanceof Array && validOrder(so)) { order = so as Array<Number>; }
            var sk = st["skipped"];
            if (sk instanceof Array) { skipped = sk as Array<Number>; }
            resumed = anyDone();
            var si = st["idx"];
            if (si instanceof Number && si < ex.size()) { idx = si; }
        }
        sel = firstOpen(idx);
        if (sel < 0) { sel = 0; }
        Storage.setValue("lastPick", w[:code]);
        if (RepDetector.enabled() || AutoDetect.enabled()) { det = new RepDetector(method(:onRep)); det.start(); }
        if (self has :dbgStart) { dbgStart(); }
    }

    var dbg = null;
    (:debug)
    function dbgStart() as Void {
        var k = Storage.getValue("dbgSignal");
        if (k instanceof String && det != null) { dbg = new DbgSignal(self, k as String); }
    }

    // ---------- motion ----------
    function clearLive() as Void {
        cancelStill();
        setLive = false; liveReps = 0; repBase = 0;
        if (det != null) { det.reset(); }
    }
    function cancelStill() as Void { if (stillTimer != null) { stillTimer.stop(); stillTimer = null; } }
    function cancelUndo() as Void {
        undoInfo = null;
        if (undoTimer != null) { undoTimer.stop(); undoTimer = null; }
    }
    function hasUndo() as Boolean { return undoInfo != null; }
    function stopSensors() as Void { if (det != null) { det.stop(); } }

    // Called by RepDetector for every counted rep (c = reps in the current motion sequence; 0 = sequence ended).
    function onRep(c as Number) as Void {
        if (finished || det == null || promptOpen) { return; }
        if (c == 0) { cancelStill(); repBase = liveReps; WatchUi.requestUpdate(); return; }
        if (resting()) {
            // motion during rest: 3 clean reps after at least 15 s of rest ends the rest and starts the next set
            if (c >= 3 && det.fast == 0 && restTotal - restLeft >= REST_MIN_BEFORE_AUTOSTART) {
                endRest(false);                 // (resets the detector's count)
                if (promptOpen || finished) { return; }
                setLive = true; repBase = c; liveReps = c;
                buzz(80);
            }
        } else if (setLive) {
            liveReps = repBase + c;
        } else if (!isDone(idx, sel) && c >= 2 && det.fast == 0) {
            setLive = true; repBase = 0; liveReps = c;
        }
        // Auto-detect sets: restart a stillness timer on every clean rep of an open set.
        if (AutoDetect.enabled() && !resting() && !isDone(idx, sel) && focus == FOCUS_NONE && det.fast == 0) {
            if (stillTimer == null) { motionStartN = det.n; }
            cancelStill();
            stillTimer = new Timer.Timer();
            stillTimer.start(method(:onMotionStill), AUTO_STILL_MS, false);
        }
        WatchUi.requestUpdate();
    }

    // Stillness after a sequence of clean reps: log the set if the thresholds pass.
    function onMotionStill() as Void {
        stillTimer = null;
        if (!AutoDetect.enabled() || finished || promptOpen || resting() || isDone(idx, sel) || focus != FOCUS_NONE) { return; }
        if (det == null || det.fast != 0) { return; }
        if (Time.now().value() < autoBlockUntil) { return; }
        var detected = liveReps > 0 ? liveReps : det.count;
        if (detected < AUTO_MIN_REPS) { return; }
        if (det.lastRepAt - motionStartN < AUTO_MIN_SAMPLES) { return; }
        autoLogSet(detected);
    }

    // Use the detected count when it looks like a real set; otherwise keep the planned reps.
    function reliableReps(detected as Number, planned as Number) as Boolean {
        if (detected < AUTO_MIN_REPS || detected > AUTO_REPS_MAX) { return false; }
        if (planned > 0 && detected < (planned * 2) / 5) { return false; }
        if (detected > planned + AUTO_REPS_SLACK) { return false; }
        return true;
    }

    function autoLogSet(detected as Number) as Void {
        var planned = repsAt(idx, sel);
        var oldReps = planned;
        if (reliableReps(detected, planned) && detected != planned) { adjustReps(detected - planned); }
        var exI = idx; var setI = sel;
        check();
        if (finished || promptOpen) { return; }    // last set ends the workout: no undo window
        undoInfo = { :exI => exI, :setI => setI, :reps => oldReps };
        if (undoTimer != null) { undoTimer.stop(); }
        undoTimer = new Timer.Timer();
        undoTimer.start(method(:endUndo), AUTO_UNDO_MS, false);
        WatchUi.requestUpdate();
    }

    function endUndo() as Void { undoInfo = null; undoTimer = null; WatchUi.requestUpdate(); }

    function undoAuto() as Boolean {
        if (undoInfo == null) { return false; }
        var exI = undoInfo[:exI] as Number;
        var setI = undoInfo[:setI] as Number;
        var oldR = undoInfo[:reps] as Number;
        cancelUndo();
        var row = done[exI] as Array; row[setI] = false;
        var rs = (ex[exI] as Dictionary)[:reps] as Array; rs[setI] = oldR;
        if (restTimer != null) { restTimer.stop(); restTimer = null; }
        restLeft = 0; restTotal = 0; restEx = -1; restSet = -1;
        idx = exI; sel = setI;
        autoBlockUntil = Time.now().value() + AUTO_DEBOUNCE_S;
        clearLive();
        save();
        WatchUi.requestUpdate();
        return true;
    }

    // ---------- persistence ----------
    function save() as Void {
        var rs = [];
        for (var i = 0; i < ex.size(); i++) { rs.add((ex[i] as Dictionary)[:reps]); }
        Storage.setValue("state", { "code" => w[:code], "done" => done, "weights" => weights, "reps" => rs, "idx" => idx, "start" => startedAt, "order" => order, "skipped" => skipped });
    }
    function reset() as Void { Storage.deleteValue("state"); }

    // ---------- queries ----------
    function setsIn(i as Number) as Number { return ((ex[i] as Dictionary)[:reps] as Array).size(); }
    function firstOpen(i as Number) as Number {
        var d = done[i] as Array;
        for (var s = 0; s < d.size(); s++) { if (!d[s]) { return s; } }
        return -1;
    }
    function isDone(i as Number, s as Number) as Boolean { return (done[i] as Array)[s] as Boolean; }
    function weightAt(i as Number, s as Number) as Number { return (weights[i] as Array)[s] as Number; }
    function repsAt(i as Number, s as Number) as Number { return ((ex[i] as Dictionary)[:reps] as Array)[s] as Number; }
    function resting() as Boolean { return restLeft > 0; }
    function validOrder(o as Array) as Boolean {
        if (o.size() != ex.size()) { return false; }
        for (var i = 0; i < ex.size(); i++) { if (o.indexOf(i) < 0) { return false; } }
        return true;
    }
    function pos() as Number { return order.indexOf(idx); }   // position of the current exercise in the visit order
    function anyDone() as Boolean {
        for (var i = 0; i < done.size(); i++) { var d = done[i] as Array; for (var s = 0; s < d.size(); s++) { if (d[s]) { return true; } } }
        return false;
    }
    function allDone() as Boolean {
        for (var i = 0; i < done.size(); i++) { if (firstOpen(i) >= 0) { return false; } }
        return true;
    }

    // ---------- feedback ----------
    function buzz(ms as Number) as Void {
        if (Attention has :vibrate) { Attention.vibrate([new Attention.VibeProfile(100, ms)]); }
    }
    // Rest-end alert: 0 = vibrate, 1 = tone (watch speaker/beeper), 2 = both. See RestAlert.mode().
    function restAlert() as Void {
        var m = RestAlert.mode();
        if (m != 1) { buzz(800); }
        if (m != 0 && (Attention has :playTone)) {
            try { Attention.playTone(Attention.TONE_INTERVAL_ALERT); } catch (e) { }
        }
    }

    // ---------- FIT recording ----------
    function startRecording() as Void {
        if (session != null || !(Toybox has :ActivityRecording)) { return; }
        try {
            session = ActivityRecording.createSession({
                :name => "Simple Lift",
                :sport => Activity.SPORT_TRAINING,
                :subSport => Activity.SUB_SPORT_STRENGTH_TRAINING
            });
            session.start();
        } catch (e) { session = null; }
    }
    function stopRecording(keep as Boolean) as Void {
        if (session == null) { return; }
        if (session.isRecording()) { session.stop(); }
        if (keep) { session.save(); } else { session.discard(); }
        session = null;
    }

    // ---------- actions ----------
    // START / checkmark
    function check() as Void {
        if (finished) { return; }
        cancelStill();
        if (undoInfo != null) { cancelUndo(); }   // a later manual check dismisses the undo window
        focus = FOCUS_NONE; stopFlash();
        if (resting()) { endRest(false); return; }
        if (isDone(idx, sel)) {           // selected set already done -> jump to the next open one
            var s = firstOpen(idx);
            if (s >= 0) { sel = s; WatchUi.requestUpdate(); } else { advance(); }
            return;
        }
        startRecording();
        if (startedAt == null) { startedAt = Time.now().value(); }
        clearLive();
        var row = done[idx] as Array; row[sel] = true;
        if (session != null) { session.addLap(); }
        buzz(150);
        save();
        if (allDone()) { finish(); return; }
        restEx = idx; restSet = sel;
        var r = (ex[idx] as Dictionary)[:rest] as Number;
        if (r <= 0) { endRest(true); return; }
        restTotal = r; restLeft = r;
        restTimer = new Timer.Timer();
        restTimer.start(method(:tick), 1000, true);
        WatchUi.requestUpdate();
    }

    function tick() as Void {
        restLeft -= 1;
        if (restLeft <= 0) { endRest(true); return; }
        WatchUi.requestUpdate();
    }

    // Rest over (or skipped): the rested set's dot lights green and we advance.
    function endRest(alert as Boolean) as Void {
        if (restTimer != null) { restTimer.stop(); restTimer = null; }
        restLeft = 0;
        if (alert) { restAlert(); }
        clearLive();
        var e = restEx >= 0 ? restEx : idx;
        restEx = -1; restSet = -1;
        idx = e;
        var s = firstOpen(e);
        if (s >= 0) { sel = s; save(); WatchUi.requestUpdate(); }
        else { advance(); }   // last set of the exercise -> next exercise in visit order (not a skip)
    }

    // Current exercise is complete: go to the next exercise with open sets AFTER it in the visit order.
    // None left after it: end prompt if anything is still open, else finish.
    function advance() as Void {
        for (var k = pos() + 1; k < order.size(); k++) {
            var i = order[k]; var s = firstOpen(i);
            if (s >= 0) { idx = i; sel = s; save(); WatchUi.requestUpdate(); return; }
        }
        endOfOrder();
    }

    function endOfOrder() as Void {
        save();
        if (allDone()) { finish(); return; }
        if (promptOpen) { return; }
        promptOpen = true;
        focus = FOCUS_NONE;
        WatchUi.pushView(new EndPromptView(self), new EndPromptDelegate(self), WatchUi.SLIDE_UP);
        WatchUi.requestUpdate();
    }

    // End prompt "Go back to unfinished set": first unfinished exercise in visit order, its first open set.
    function goToUnfinished() as Void {
        for (var k = 0; k < order.size(); k++) {
            var i = order[k]; var s = firstOpen(i);
            if (s >= 0) { clearLive(); idx = i; sel = s; focus = FOCUS_NONE; save(); break; }
        }
        WatchUi.requestUpdate();
    }

    function openSets() as Number {
        var n = 0;
        for (var i = 0; i < done.size(); i++) { var d = done[i] as Array; for (var s = 0; s < d.size(); s++) { if (!d[s]) { n++; } } }
        return n;
    }

    // Move the selected set by d; past the ends it moves to the next/previous exercise in VISIT order
    // (forward off an unfinished exercise = skip, same as swipe left).
    function moveSet(d as Number) as Void {
        clearLive();
        var n = sel + d;
        if (n < 0) {
            var p = pos();
            if (p > 0) { idx = order[p - 1]; sel = setsIn(idx) - 1; }
        } else if (n >= setsIn(idx)) {
            moveExercise(1); return;
        } else { sel = n; }
        save();
        WatchUi.requestUpdate();
    }

    // Swipe / forward-back exercise navigation in VISIT order.
    // Forward (d = 1) off an exercise that still has open sets moves it to the end of the order (skip).
    // Past the last exercise: end prompt (or finish if everything is done). Backward never reorders and stops at the first.
    function moveExercise(d as Number) as Void {
        clearLive();
        focus = FOCUS_NONE;
        var p = pos();
        if (d < 0) {
            if (p <= 0) { return; }
            idx = order[p - 1];
        } else {
            // Past the end: the last exercise, or skipping an unfinished one when only already-skipped
            // exercises are left after it (otherwise skipping would cycle through them forever).
            if (p >= order.size() - 1 || (firstOpen(idx) >= 0 && skipped.indexOf(order[p + 1]) >= 0)) { endOfOrder(); return; }
            if (firstOpen(idx) >= 0) {        // skip: send it to the back of the line
                order.remove(idx);
                order.add(idx);
                if (skipped.indexOf(idx) < 0) { skipped.add(idx); }
                idx = order[p];               // the one that slid into this position
            } else {
                idx = order[p + 1];
            }
        }
        var s = firstOpen(idx); sel = s >= 0 ? s : 0;
        save();
        WatchUi.requestUpdate();
    }

    function jumpTo(s as Number) as Void {
        if (s >= 0 && s < setsIn(idx)) { if (s != sel) { clearLive(); } sel = s; focus = FOCUS_NONE; WatchUi.requestUpdate(); }
    }

    // +/- weight on the selected set, copied down to the remaining sets of this exercise (same rule as the web app).
    function adjustWeight(delta as Number) as Void {
        var ws = weights[idx] as Array;
        var v = (ws[sel] as Number) + delta;
        if (v < 0) { v = 0; }
        for (var k = sel; k < ws.size(); k++) { ws[k] = v; }
        save();
        WatchUi.requestUpdate();
    }

    // Rep number of the selected set, +/-1 (1..99). Session-only: reps are not part of the SR1 result code,
    // they only live in this workout's saved progress.
    function adjustReps(delta as Number) as Void {
        var r = (ex[idx] as Dictionary)[:reps] as Array;
        var v = (r[sel] as Number) + delta;
        if (v < 1) { v = 1; } if (v > 99) { v = 99; }
        r[sel] = v;
        save();
        WatchUi.requestUpdate();
    }

    // UP (+1) / DOWN (-1) on the main screen: edit the highlighted field; nothing highlighted = previous/next set.
    function scroll(dir as Number) as Void {
        stopFlash();
        if (focus == FOCUS_WT) { adjustWeight(dir * 5); return; }
        if (focus == FOCUS_REPS) { adjustReps(dir); return; }
        moveSet(-dir);
    }

    // hold UP (button-only way to pick a field): none -> weight -> reps -> none
    function toggleAdjust() as Void {
        stopFlash();
        focus = focus == FOCUS_NONE ? FOCUS_WT : (focus == FOCUS_WT ? FOCUS_REPS : FOCUS_NONE);
        WatchUi.requestUpdate();
    }

    // START button: with a field highlighted it only ends the edit; otherwise it is the checkmark.
    function startKey() as Void {
        if (focus != FOCUS_NONE && !resting() && !finished) { focus = FOCUS_NONE; stopFlash(); WatchUi.requestUpdate(); return; }
        check();
    }

    // ---------- direct taps ----------
    function tapWeight() as Void { adjustWeight(5); flash(FOCUS_WT); }     // +5 lb, copied down like UP/DOWN
    function tapReps() as Void { adjustReps(1); flash(FOCUS_REPS); }       // +1 rep on this set
    function flash(f as Number) as Void {
        stopFlash();
        focus = f;
        flashTimer = new Timer.Timer();
        flashTimer.start(method(:endFlash), 500, false);
        WatchUi.requestUpdate();
    }
    function endFlash() as Void { flashTimer = null; WatchUi.requestUpdate(); }
    function stopFlash() as Void { if (flashTimer != null) { flashTimer.stop(); flashTimer = null; } }

    // ---------- finishing ----------
    // Result code for the web app: SR1~Title~N@w1/w2/...~...  (N = sets checked, weights in lb; one weight if all equal)
    function resultCode() as String {
        var out = "SR1~" + w[:title];
        for (var i = 0; i < ex.size(); i++) {
            var d = done[i] as Array; var ws = weights[i] as Array;
            var n = 0;
            for (var s = 0; s < d.size(); s++) { if (d[s]) { n++; } }
            var same = true;
            for (var s = 1; s < ws.size(); s++) { if (ws[s] != ws[0]) { same = false; } }
            var wt = "";
            if (same) { wt = ws[0].toString(); }
            else { for (var s = 0; s < ws.size(); s++) { wt += (s > 0 ? "/" : "") + ws[s].toString(); } }
            out += "~" + n + "@" + wt;
        }
        return out;
    }

    function finish() as Void {
        if (restTimer != null) { restTimer.stop(); restTimer = null; }
        cancelStill(); cancelUndo();
        restLeft = 0; focus = FOCUS_NONE; stopFlash();
        finished = true;
        stopSensors(); setLive = false;
        result = resultCode();
        try { Properties.setValue("lastResult", result); } catch (e) { }
        Storage.setValue("lastResult", result);
        Storage.setValue("lastDone", w[:code]);
        (Application.getApp() as SimpleLiftApp).sync.sendResult(result);
        computeCalories();
        computeTime();
        // The FIT activity is dated now (today). If the app was closed mid-workout the old session was
        // discarded, so record a short one now so the workout still lands in Garmin Connect.
        if (session == null && anyDone()) { startRecording(); if (session != null) { session.addLap(); } }
        stopRecording(true);
        reset();
        buzz(1000);
        WatchUi.requestUpdate();
    }

    // (1) Garmin's own count from the live recording session (HR + user profile), read before it is stopped;
    // (2) else MET estimate: kcal = 5.0 x body kg x elapsed h, elapsed = now - first checked set,
    //     at least setsDone x 2.5 min and at most 3 h; body kg from the user profile (grams), default 80.
    // Rounded to the nearest 5.
    function computeCalories() as Void {
        var c = null;
        if (session != null && session.isRecording()) {
            try { var ai = Activity.getActivityInfo(); if (ai != null) { c = ai.calories; } } catch (e) { }
        }
        if (c != null && c > 0) { calSource = "garmin " + c; calories = ((c + 2) / 5) * 5; return; }
        var kg = 80.0;
        try {
            var p = UserProfile.getProfile();
            if (p != null && p.weight != null && p.weight > 0) { kg = p.weight / 1000.0; }
        } catch (e) { }
        var sd = stats()[0];
        var minS = sd * 150;
        var secs = startedAt != null ? Time.now().value() - startedAt : 0;
        if (secs < minS) { secs = minS; }
        if (secs > 10800) { secs = 10800; }
        var kcal = 5.0 * kg * secs / 3600.0;
        calSource = "estimate " + kg.format("%.1f") + "kg " + secs + "s";
        calories = (((kcal + 2.5) / 5).toNumber()) * 5;
    }

    // Total workout time: the recording session's timer (Activity.getActivityInfo().timerTime, else elapsedTime),
    // read before the session is stopped. Falls back to (now - first checked set) when there is no live session
    // or the workout was resumed after closing the app (the new session then misses the earlier part).
    function computeTime() as Void {
        var ms = null;
        if (session != null && session.isRecording()) {
            try {
                var ai = Activity.getActivityInfo();
                if (ai != null) { ms = ai.timerTime; if (ms == null || ms <= 0) { ms = ai.elapsedTime; } }
            } catch (e) { }
        }
        var fromStart = startedAt != null ? Time.now().value() - startedAt : 0;
        if (ms != null && ms > 0 && !(resumed && fromStart > ms / 1000)) { workSecs = ms / 1000; timeSource = "session"; }
        else { workSecs = fromStart > 0 ? fromStart : 0; timeSource = "start"; }
    }

    function timeText() as String {
        var t = workSecs; var h = t / 3600; var mm = (t % 3600) / 60; var ss = t % 60;
        return h > 0 ? h + ":" + mm.format("%02d") + ":" + ss.format("%02d") : mm + ":" + ss.format("%02d");
    }

    function stats() as Array<Number> {  // [setsDone, totalSets, volumeLb]
        var sd = 0; var tot = 0; var vol = 0;
        for (var i = 0; i < ex.size(); i++) {
            var d = done[i] as Array;
            var reps = (ex[i] as Dictionary)[:reps] as Array;
            for (var s = 0; s < d.size(); s++) {
                tot++;
                if (d[s]) { sd++; vol += (weights[i] as Array)[s] * reps[s]; }
            }
        }
        return [sd, tot, vol];
    }
}


// Debug builds only (excluded from -r release builds): feeds a synthetic accelerometer signal
// through the same RepDetector.feed() path the sensor uses. Enabled from the picker's hold-UP menu.
(:debug)
class DbgSignal {
    var m as LiftModel;
    var t as Number = 0;
    var kind as String;
    var timer as Timer.Timer = new Timer.Timer();
    function initialize(model as LiftModel, k as String) { m = model; kind = k; timer.start(method(:tick), 1000, true); }
    function tick() as Void {
        if (m.finished || m.det == null) { timer.stop(); return; }
        var xs = []; var ys = []; var zs = [];
        var per = kind.equals("walk") ? 0.5 : 2.2;      // s per cycle: walking steps vs. ~2.2 s reps
        var amp = 350.0;
        for (var i = 0; i < 25; i++) {
            var ts = (t * 25 + i) / 25.0;
            var v = 1000.0 + amp * Math.sin(2 * Math.PI * ts / per) + (Math.rand() % 41 - 20);
            xs.add(0); ys.add(0); zs.add(v.toNumber());
        }
        t++;
        (m.det as RepDetector).feed(xs, ys, zs);
    }
}

// Rest-end alert choice. Order: watch menu choice (hold UP in the picker) > phone/server payload ("restAlert") > app setting.
module RestAlert {
    const NAMES = ["Vibrate", "Tone", "Vibrate + tone"];
    function fromAny(v) as Number? {
        if (v instanceof Number) { return (v >= 0 && v <= 2) ? v : null; }
        if (v instanceof String) {
            var s = (v as String).toLower();
            if (s.equals("vibrate") || s.equals("0")) { return 0; }
            if (s.equals("tone") || s.equals("sound") || s.equals("1")) { return 1; }
            if (s.equals("both") || s.equals("2")) { return 2; }
        }
        return null;
    }
    function mode() as Number {
        var m = fromAny(Storage.getValue("restAlertLocal"));
        if (m == null) { m = fromAny(Storage.getValue("restAlertServer")); }
        if (m == null) { try { m = fromAny(Properties.getValue("restAlert")); } catch (e) { } }
        return m == null ? 0 : m;
    }
}
