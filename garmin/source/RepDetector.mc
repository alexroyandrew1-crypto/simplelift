import Toybox.Lang;
import Toybox.Math;
import Toybox.Sensor;
import Toybox.Application;

// Wrist-accelerometer rep detector (25 Hz, delivered once a second in batches of 25 samples).
// Signal: |a| in milli-g -> slow baseline (EMA, ~1.6 s) removed -> light smoothing (EMA, ~4 Hz) = s.
// A rep = s rising above HI while armed, at least MIN_GAP samples (0.72 s) after the previous rep;
// it re-arms only after s falls back below LO (hysteresis).
// Walking/running guard: another peak above HI inside the 0.72 s refractory window counts as "fast";
// 2 fast peaks in one sequence = not lifting -> sequence reset and detection muted for 3 s.
// A sequence ends (count -> 0) after IDLE samples (8 s) without a rep.
class RepDetector {
    const RATE = 25;
    const HI = 120.0;        // mg above baseline to count a rep
    const LO = 30.0;         // mg: must fall below this to re-arm
    const MIN_GAP = 18;      // samples (0.72 s) minimum between reps
    const IDLE = 200;        // samples (8 s) without a rep ends the sequence
    const MUTE = 75;         // samples (3 s) muted after walking-like motion
    const A_BASE = 0.025;    // baseline EMA factor
    const A_SMOOTH = 0.35;   // smoothing EMA factor

    var count as Number = 0;       // reps in the current sequence
    var lastRepAt as Number = -100000;
    var n as Number = 0;           // samples seen
    var base as Float = 1000.0;
    var s as Float = 0.0;
    var armed as Boolean = true;
    var fast as Number = 0;
    var mutedUntil as Number = 0;
    var running as Boolean = false;
    var cb as Method?;             // cb.invoke(count) on every counted rep; cb with 0 when a sequence ends

    function initialize(callback as Method) { cb = callback; }

    // Rep detection setting: watch menu choice > app setting 'repDetect' (default ON).
    static function enabled() as Boolean {
        var l = Storage.getValue("repDetectLocal");
        if (l instanceof Boolean) { return l; }
        var p = null;
        try { p = Properties.getValue("repDetect"); } catch (e) { }
        return p instanceof Boolean ? p : true;
    }

    function start() as Void {
        if (running || !(enabled() || AutoDetect.enabled())) { return; }
        if (!(Toybox has :Sensor) || !(Sensor has :registerSensorDataListener)) { return; }
        try {
            Sensor.registerSensorDataListener(method(:onData), { :period => 1, :accelerometer => { :enabled => true, :sampleRate => RATE } });
            running = true;
        } catch (e) { running = false; }
    }

    function stop() as Void {
        if (!running) { return; }
        try { Sensor.unregisterSensorDataListener(); } catch (e) { }
        running = false;
    }

    function reset() as Void { count = 0; fast = 0; }

    function onData(data as Sensor.SensorData) as Void {
        var a = data.accelerometerData;
        if (a == null || a.x == null || a.y == null || a.z == null) { return; }
        feed(a.x as Array, a.y as Array, a.z as Array);
    }

    function feed(xs as Array, ys as Array, zs as Array) as Void {
        var k = xs.size();
        if (ys.size() < k) { k = ys.size(); }
        if (zs.size() < k) { k = zs.size(); }
        for (var i = 0; i < k; i++) {
            var x = (xs[i] as Number).toFloat(); var y = (ys[i] as Number).toFloat(); var z = (zs[i] as Number).toFloat();
            sample(Math.sqrt(x * x + y * y + z * z).toFloat());
        }
    }

    function sample(mag as Float) as Void {
        n++;
        if (n == 1) { base = mag; }
        base += A_BASE * (mag - base);
        s += A_SMOOTH * ((mag - base) - s);
        if (count > 0 && n - lastRepAt > IDLE) {      // sequence over
            count = 0; fast = 0;
            if (cb != null) { cb.invoke(0); }
        }
        if (n < mutedUntil) { armed = s < LO; return; }
        if (armed && s > HI) {
            armed = false;
            if (n - lastRepAt >= MIN_GAP) {
                count++; lastRepAt = n;
                if (cb != null) { cb.invoke(count); }
            } else if (count > 0) {
                fast++;
                if (fast >= 2) {                         // walking / running, not reps
                    count = 0; fast = 0; mutedUntil = n + MUTE;
                    if (cb != null) { cb.invoke(0); }
                }
            }
        } else if (!armed && s < LO) {
            armed = true;
        }
    }
}

// Auto-detect sets: watch menu (hold UP in the picker) > app setting autoDetectSets.
// Default OFF — real-world wrist tuning is still needed before leaving this on.
module AutoDetect {
    function enabled() as Boolean {
        var l = Storage.getValue("autoDetectLocal");
        if (l instanceof Boolean) { return l; }
        var p = null;
        try { p = Properties.getValue("autoDetectSets"); } catch (e) { }
        return p instanceof Boolean ? p : false;
    }
}
