import Toybox.Application;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.WatchUi;

// Check-off choice shared with the phone. Last write wins: a synced workout code, a live
// snapshot, or a tap on the watch. Stored on the watch so the next start remembers it.
module CheckMode {
    function norm(v as String) as String {
        if (v.equals("exercise") || v.equals("none")) { return v; }
        return "set";
    }
    function current() as String {
        var v = Storage.getValue("checkMode");
        if (v instanceof String) { return norm(v as String); }
        return "set";
    }
    function save(v as String) as Void { Storage.setValue("checkMode", norm(v)); }
    function cycle() as String {
        var c = current();
        var n = c.equals("set") ? "exercise" : (c.equals("exercise") ? "none" : "set");
        save(n);
        return n;
    }
    function label(v as String) as String {
        if (v.equals("exercise")) { return "Check each exercise"; }
        if (v.equals("none")) { return "No checks"; }
        return "Check each set";
    }
}

// Bluetooth to the Android app (Connect IQ Mobile SDK). transmit sends, registerForPhoneAppMessages receives.
// The server poll in CloudSync is the fallback when this link is down, and the only path for the web app.
class LiveTx extends Communications.ConnectionListener {
    function initialize() { Communications.ConnectionListener.initialize(); }
    function onComplete() as Void {}
    function onError() as Void {}
}

module LiveLink {
    function listen() as Void {
        if (Communications has :registerForPhoneAppMessages) {
            Communications.registerForPhoneAppMessages(method(:onPhone));
        }
    }

    function send(d as Dictionary) as Void {
        if (!(Communications has :transmit)) { return; }
        try { Communications.transmit(d, null, new LiveTx()); } catch (e) {}
        (Application.getApp() as SimpleLiftApp).sync.pushLive(d);
    }

    function onPhone(msg as Communications.PhoneAppMessage) as Void {
        var data = msg.data;
        if (data instanceof Array && (data as Array).size() == 1 && (data as Array)[0] instanceof Dictionary) {
            data = (data as Array)[0];
        }
        if (data instanceof Dictionary) { deliver(data as Dictionary); }
    }

    function deliver(d as Dictionary) as Void {
        var kind = "snap";
        var t = d["t"];
        if (t instanceof String) { kind = t as String; }
        var app = Application.getApp() as SimpleLiftApp;
        if (kind.equals("hello")) {
            Storage.setValue("btPhone", true);
            if (!app.sync.paired() && app.sync.pairCode != null) {
                send({ "t" => "pair", "code" => app.sync.pairCode, "src" => "w" });
            }
            if (app.model == null) { app.pairDone(); }
            else { app.model.publish(); }
            return;
        }
        if (kind.equals("pair")) { return; }
        var code = d["code"];
        var sid = d["id"];
        var same = app.model != null && sid instanceof String && (sid as String).equals(app.model.liveId);
        if (app.model == null || (!same && code instanceof String)) {
            if (code instanceof String) {
                var w = Workout.parse(code as String);
                if (w != null && (app.model == null || !same)) {
                    (w as Dictionary)[:code] = code;
                    app.adopt(w as Dictionary);
                }
            }
        }
        if (app.model != null) { app.model.applySnap(d); }
    }
}
