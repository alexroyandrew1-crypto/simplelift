import Toybox.Lang;
import Toybox.Application;

// Parses and holds a Simple Lift workout code.
// Format: SL1~Title~Name,sets,reps,weightLb,restSec~Name,...
// reps and weight may be a "/"-separated list per set, e.g. 95/95/100/100
module Workout {
    // Alex's active plan "6-Day PPL A/B" from his Simple Lift account (read-only export 2026-11-11), one entry per training day.
    // Weights/reps = what the phone's "Send to watch" would produce (plan + last-session recommendation).
    const BUILTIN = [
        "SL1~Day 1 - Push A~Barbell Bench Press,3,5,145,150~Seated Dumbbell Shoulder Press,3,6,20,120~Incline Smith Machine Press or Dumbbell,3,8,25,90~Seated Dumbbell Lateral Raises,4,10,10,60~Overhead Cable Tricep Extension,3,10,50,60~Tricep Dips or Pushdowns,3,10,0,60",
        "SL1~Day 2 - Pull A~Lat-Focused Pulldown,3,8,140,90~Chest-Supported T-Bar Row or Seal Row,3,6,75,120~Single-Arm Cable Row,3,10,35,75~Dumbbell Pullovers or Straight-Arm Pulld,3,12,25,60~Incline Dumbbell Bicep Curls,3,10,35,60~Cable Hammer Curls,3,12,43,60",
        "SL1~Day 3 - Legs A~Barbell Back Squat or Hack Squat,4,6,95,150~Leg Press,3,10,140,120~Bulgarian Split Squats,3,8,25,90~Leg Extensions,3,12,50,60~Standing Calf Raises,4,15,90,60",
        "SL1~Day 4 - Push B~Incline Barbell Bench Press,3,5,75,150~Close-Grip Bench Press,3,6,110,120~Seated Chest Press Machine,3,10,55,90~Cable Lateral Raises,4,12,20,60~Dumbbell Upright Rows or Rear-Delt Flyes,3,12,15,60~Skullcrushers or Overhead Rope Extension,3,10,65,60",
        "SL1~Day 5 - Pull B~Weighted Pull-Ups or Heavy Lat Pulldowns,3,6,70,150~Barbell Bent-Over Row,3,6,105,120~Chest-Supported Dumbbell Rows,3,10,30,90~Face Pulls,4,15,30,60~Standing Barbell Bicep Curls,3,8,80,60~Preacher Curls or Spider Curls,3,10,40,60",
        "SL1~Day 6 - Legs B~Barbell Romanian Deadlift,4,8,95,120~Seated Leg Curl,3,10,50,90~Barbell Hip Thrust,3,8,95,90~Lying or Standing Hamstring Curl,3,12,50,75~Seated Calf Raises,4,15,90,60"
    ];

    function split(s as String, sep as String) as Array<String> {
        var out = [] as Array<String>;
        var rest = s;
        var i = rest.find(sep);
        while (i != null) {
            out.add(rest.substring(0, i) as String);
            rest = rest.substring(i + sep.length(), rest.length()) as String;
            i = rest.find(sep);
        }
        out.add(rest);
        return out;
    }

    function num(s as String, dflt as Number) as Number {
        var n = s.toNumber();
        return n == null ? dflt : n;
    }

    function perSet(s as String, sets as Number, dflt as Number) as Array<Number> {
        var parts = split(s, "/");
        var out = [] as Array<Number>;
        for (var k = 0; k < sets; k++) {
            var p = parts[k < parts.size() ? k : parts.size() - 1];
            out.add(num(p, dflt));
        }
        return out;
    }

    // Returns {:title, :ex=>[{:name,:reps=>[],:w=>[],:rest}]} or null if invalid.
    function parse(code as String?) as Dictionary? {
        if (code == null) { return null; }
        var parts = split(code, "~");
        if (parts.size() < 3 || !parts[0].equals("SL1")) { return null; }
        var ex = [];
        var logMode = "set";
        for (var i = 2; i < parts.size(); i++) {
            if (parts[i].length() > 1 && parts[i].substring(0, 1).equals("#")) {
                logMode = parts[i].substring(1, parts[i].length());
                continue;
            }
            var f = split(parts[i], ",");
            if (f.size() < 2) { continue; }
            var sets = num(f[1], 3);
            if (sets < 1) { sets = 1; }
            if (sets > 10) { sets = 10; }
            ex.add({
                :name => f[0],
                :reps => perSet(f.size() > 2 ? f[2] : "10", sets, 10),
                :w => perSet(f.size() > 3 ? f[3] : "0", sets, 0),
                :rest => f.size() > 4 ? num(f[4], 90) : 90
            });
        }
        if (ex.size() == 0) { return null; }
        return { :title => parts[1], :ex => ex, :logMode => logMode };
    }

    function current() as Dictionary {
        var code = null;
        try { code = Properties.getValue("workoutCode"); } catch (e) { }
        var w = null;
        var sc = Storage.getValue("syncedCode");
        if (Storage.getValue("watchToken") != null && sc instanceof String) {
            w = parse(sc as String);
            if (w != null) { code = sc; (w as Dictionary)[:synced] = true; }
        }
        if (w == null) { w = (code instanceof String && code.length() > 0) ? parse(code as String) : null; }
        if (w == null) {
            w = parse(BUILTIN[0]);
            code = BUILTIN[0];
        }
        (w as Dictionary)[:code] = code;
        return w as Dictionary;
    }

    // All workouts the picker can show: synced (CloudSync cache), manual code setting, then the samples.
    // Each: {:title,:ex,:code,:src} with :src = "From phone" / "Typed code" / "Sample".
    function list() as Array<Dictionary> {
        var out = [] as Array<Dictionary>;
        var seen = {} as Dictionary;
        var sc = Storage.getValue("syncedCode");
        if (Storage.getValue("watchToken") != null && sc instanceof String) { add(out, seen, sc as String, "From phone"); }
        var code = null;
        try { code = Properties.getValue("workoutCode"); } catch (e) { }
        if (code instanceof String && (code as String).length() > 0) { add(out, seen, code as String, "Typed code"); }
        for (var i = 0; i < BUILTIN.size(); i++) { add(out, seen, BUILTIN[i], "Sample"); }
        return out;
    }

    function add(out as Array<Dictionary>, seen as Dictionary, code as String, src as String) as Void {
        if (seen.hasKey(code)) { return; }
        var w = parse(code);
        if (w == null) { return; }
        (w as Dictionary)[:code] = code;
        (w as Dictionary)[:src] = src;
        if (src.equals("From phone")) { (w as Dictionary)[:synced] = true; }
        seen[code] = true;
        out.add(w as Dictionary);
    }

    function totalSets(w as Dictionary) as Number {
        var n = 0; var ex = w[:ex] as Array;
        for (var i = 0; i < ex.size(); i++) { n += ((ex[i] as Dictionary)[:reps] as Array).size(); }
        return n;
    }
}
