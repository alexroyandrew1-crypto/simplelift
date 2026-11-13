import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;
import Toybox.System;

// Opens first: cycle through saved workouts, START to begin.
class PickerView extends WatchUi.View {
    var items as Array<Dictionary>;
    var pos as Number = 0;
    var inProgress as String? = null;

    function initialize() {
        View.initialize();
        items = Workout.list();
        var st = Storage.getValue("state");
        if (st instanceof Dictionary && st["code"] instanceof String) {
            var d = st["done"]; var any = false;
            if (d instanceof Array) { for (var i = 0; i < d.size(); i++) { var r = d[i]; if (r instanceof Array) { for (var s = 0; s < r.size(); s++) { if (r[s] == true) { any = true; } } } } }
            if (any) { inProgress = st["code"] as String; }
        }
        // Default: workout in progress > synced from phone > the day after the last finished one > first.
        var p = find(inProgress);
        if (p < 0 && items.size() > 0 && (items[0] as Dictionary)[:synced] == true) { p = 0; }
        if (p < 0) { var ld = find(Storage.getValue("lastDone")); if (ld >= 0) { p = (ld + 1) % items.size(); } }
        if (p < 0) { p = find(Storage.getValue("lastPick")); }
        pos = p < 0 ? 0 : p;
    }

    function find(code) as Number {
        if (!(code instanceof String)) { return -1; }
        for (var i = 0; i < items.size(); i++) { if (((items[i] as Dictionary)[:code] as String).equals(code)) { return i; } }
        return -1;
    }

    function step(d as Number) as Void { pos = (pos + d + items.size()) % items.size(); WatchUi.requestUpdate(); }
    function current() as Dictionary { return items[pos] as Dictionary; }

    function onUpdate(dc as Graphics.Dc) as Void {
        var W = dc.getWidth(); var H = dc.getHeight(); var cx = W / 2;
        var C = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        dc.setColor(Theme.TXT, Theme.BG); dc.clear();
        var w = current();
        var prog = inProgress != null && (w[:code] as String).equals(inProgress);

        dc.setColor(Theme.ACC, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 0.12, Graphics.FONT_XTINY, "SIMPLE LIFT", C);
        dc.setColor(prog ? Theme.WARN : Theme.MUT, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 0.215, Graphics.FONT_XTINY, (prog ? "In progress" : w[:src]) + "  " + (pos + 1) + "/" + items.size(), C);

        dc.setColor(Theme.MUT, Graphics.COLOR_TRANSPARENT);
        Theme.tri(dc, cx, (H * 0.32).toNumber(), 9, true);
        var f = Theme.fit(dc, w[:title] as String, [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY], (W * 0.84).toNumber());
        dc.setColor(Theme.TXT, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 0.43, f[1], f[0], C);
        var ex = w[:ex] as Array;
        dc.setColor(Theme.MUT, Graphics.COLOR_TRANSPARENT);
        var first = Theme.fit(dc, "1. " + (ex[0] as Dictionary)[:name], [Graphics.FONT_XTINY], (W * 0.80).toNumber());
        dc.drawText(cx, H * 0.535, Graphics.FONT_XTINY, first[0], C);
        dc.drawText(cx, H * 0.615, Graphics.FONT_XTINY, ex.size() + " exercises - " + Workout.totalSets(w) + " sets", C);
        Theme.tri(dc, cx, (H * 0.70).toNumber(), 9, false);
        var mk = CheckMode.current();
        var ml = Theme.fit(dc, CheckMode.label(mk), [Graphics.FONT_XTINY], (W * 0.80).toNumber());
        dc.setColor(Theme.ACC, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 0.755, Graphics.FONT_XTINY, ml[0], C);

        // START pill
        var label = prog ? "RESUME" : "START";
        var bw = dc.getTextWidthInPixels(label, Graphics.FONT_TINY) + 36; var bh = 30;
        dc.setColor(Theme.ACC, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(cx - bw / 2, H * 0.80 - bh / 2, bw, bh, 15);
        dc.setColor(Theme.ACCINK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 0.80, Graphics.FONT_TINY, label, C);

        var ss = (Application.getApp() as SimpleLiftApp).sync.status;
        if (ss.length() == 0) { ss = "Hold UP for settings"; }
        dc.setColor(Theme.MUT, Graphics.COLOR_TRANSPARENT);
        var t = Theme.fit(dc, ss, [Graphics.FONT_XTINY], (W * 0.86).toNumber());
        dc.drawText(cx, H * 0.91, Graphics.FONT_XTINY, t[0], C);
    }
}

class PickerDelegate extends WatchUi.BehaviorDelegate {
    var v as PickerView;
    function initialize(view as PickerView) { BehaviorDelegate.initialize(); v = view; }
    function onPreviousPage() as Boolean { v.step(-1); return true; }   // UP
    function onNextPage() as Boolean { v.step(1); return true; }        // DOWN
    function onKey(k as WatchUi.KeyEvent) as Boolean {
        if (k.getKey() == WatchUi.KEY_ENTER) { return pick(); }
        return false;
    }
    function pick() as Boolean { (Application.getApp() as SimpleLiftApp).startWorkout(v.current()); return true; }
    function onSwipe(e as WatchUi.SwipeEvent) as Boolean {
        var d = e.getDirection();
        // UP button is previous. Swipe up matches that. Swipe left still moves to the next card.
        if (d == WatchUi.SWIPE_LEFT || d == WatchUi.SWIPE_DOWN) { v.step(1); return true; }
        if (d == WatchUi.SWIPE_RIGHT || d == WatchUi.SWIPE_UP) { v.step(-1); return true; }
        return false;
    }
    function onTap(e as WatchUi.ClickEvent) as Boolean {
        var y = e.getCoordinates()[1]; var H = System.getDeviceSettings().screenHeight;
        if (y < H * 0.36) { v.step(-1); }
        else if (y > H * 0.66 && y < H * 0.73) { v.step(1); }
        else if (y >= H * 0.73 && y < H * 0.78) { CheckMode.cycle(); WatchUi.requestUpdate(); }
        else { pick(); }
        return true;
    }
    function onMenu() as Boolean {  // hold UP: watch settings (chime, vibration, rest alert, rep detection)
        var m = new WatchUi.Menu2({ :title => "Settings" });
        m.addItem(new WatchUi.ToggleMenuItem("Chime", { :enabled => "Watch speaker", :disabled => "Off" }, :chime, Feedback.chimeOn(), {}));
        m.addItem(new WatchUi.ToggleMenuItem("Vibration", { :enabled => "On", :disabled => "Off" }, :vibe, Feedback.vibeOn(), {}));
        m.addItem(new WatchUi.MenuItem("Check-off", CheckMode.label(CheckMode.current()), :checkMode, {}));
        m.addItem(new WatchUi.MenuItem("Rest alert", RestAlert.NAMES[RestAlert.mode()], :alert, {}));
        m.addItem(new WatchUi.ToggleMenuItem("Rep count", { :enabled => "Shows reps, does not log", :disabled => "Off" }, :reps, RepDetector.enabled(), {}));
        m.addItem(new WatchUi.ToggleMenuItem("Auto-detect sets", { :enabled => "Log when motion stops", :disabled => "Off" }, :autoSets, AutoDetect.enabled(), {}));
        if (self has :dbgItems) { dbgItems(m); }
        WatchUi.pushView(m, new SettingsMenuDelegate(), WatchUi.SLIDE_UP);
        return true;
    }
    (:debug)
    function dbgItems(m as WatchUi.Menu2) as Void {
        var k = Storage.getValue("dbgSignal");
        m.addItem(new WatchUi.MenuItem("DEBUG signal", k instanceof String ? k : "off", :dbg, {}));
        m.addItem(new WatchUi.MenuItem("DEBUG paired", Storage.getValue("watchToken") != null ? "on" : "off", :dbgPair, {}));
    }
}

class SettingsMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() { Menu2InputDelegate.initialize(); }
    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id == :chime) {
            Storage.setValue("chimeLocal", (item as WatchUi.ToggleMenuItem).isEnabled());
        } else if (id == :vibe) {
            Storage.setValue("vibeLocal", (item as WatchUi.ToggleMenuItem).isEnabled());
        } else if (id == :checkMode) {
            var cm = new WatchUi.Menu2({ :title => "Check-off" });
            var cur = CheckMode.current();
            cm.addItem(new WatchUi.MenuItem("Check each set", cur.equals("set") ? "Current" : null, "set", {}));
            cm.addItem(new WatchUi.MenuItem("Check each exercise", cur.equals("exercise") ? "Current" : null, "exercise", {}));
            cm.addItem(new WatchUi.MenuItem("No checks", cur.equals("none") ? "Current" : null, "none", {}));
            WatchUi.pushView(cm, new CheckMenuDelegate(item), WatchUi.SLIDE_LEFT);
        } else if (id == :reps) {
            Storage.setValue("repDetectLocal", (item as WatchUi.ToggleMenuItem).isEnabled());
        } else if (id == :autoSets) {
            Storage.setValue("autoDetectLocal", (item as WatchUi.ToggleMenuItem).isEnabled());
        } else if (id == :alert) {
            var m = new WatchUi.Menu2({ :title => "Rest alert" });
            var cur = RestAlert.mode();
            for (var i = 0; i < 3; i++) { m.addItem(new WatchUi.MenuItem(RestAlert.NAMES[i], i == cur ? "Current" : null, i, {})); }
            WatchUi.pushView(m, new AlertMenuDelegate(item), WatchUi.SLIDE_LEFT);
        } else if (self has :dbgSelect) {
            dbgSelect(item, id);
        }
    }
    (:debug)
    function dbgSelect(item as WatchUi.MenuItem, id) as Void {   // debug builds only
        if (id == :dbgPair) {
            if (Storage.getValue("watchToken") != null) { Storage.deleteValue("watchToken"); item.setSubLabel("off"); }
            else { Storage.setValue("watchToken", "debug"); item.setSubLabel("on"); }
            WatchUi.requestUpdate();
        } else if (id == :dbg) {
            var k = Storage.getValue("dbgSignal");
            var nk = k == null ? "lift" : (k.equals("lift") ? "walk" : null);
            if (nk == null) { Storage.deleteValue("dbgSignal"); } else { Storage.setValue("dbgSignal", nk); }
            item.setSubLabel(nk == null ? "off" : nk);
            WatchUi.requestUpdate();
        }
    }

}

class CheckMenuDelegate extends WatchUi.Menu2InputDelegate {
    var parent as WatchUi.MenuItem?;
    function initialize(p) { Menu2InputDelegate.initialize(); parent = p; }
    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id instanceof String) { CheckMode.save(id as String); }
        if (parent != null) { parent.setSubLabel(CheckMode.label(CheckMode.current())); }
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}

class AlertMenuDelegate extends WatchUi.Menu2InputDelegate {
    var parent as WatchUi.MenuItem?;
    function initialize(p) { Menu2InputDelegate.initialize(); parent = p; }
    function onSelect(item as WatchUi.MenuItem) as Void {
        Storage.setValue("restAlertLocal", item.getId() as Number);
        if (parent != null) { parent.setSubLabel(RestAlert.NAMES[item.getId() as Number]); }
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}
