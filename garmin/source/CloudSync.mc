import Toybox.Application;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.WatchUi;
import Toybox.System;
import Toybox.Timer;
import Toybox.Math;
import Toybox.Time;

// Automatic sync with the Simple Lift server (through the phone's Garmin Connect app).
// v5 pairing: an unpaired watch asks the server for a 6-digit code, shows it, and polls until
// the signed-in phone claims it. The watch token lives only in Application.Storage.
// Existing tokens from v4 (and earlier) keep working. Offline -> cached workout; results are queued.
// The backup SR1 result code on the done screen is unchanged.
class CloudSync {
    var status as String = "";
    var busy as Boolean = false;
    var failed as Boolean = false;
    var pairCode as String? = null;
    var pairNote as String = "";
    var _poll as Timer.Timer?;
    var _reqBusy as Boolean = false;

    function initialize() { }

    function base() as String? {
        var u = null;
        try { u = Properties.getValue("apiUrl"); } catch (e) { }
        if (!(u instanceof String) || u.length() < 8) { return null; }
        var s = u as String;
        while (s.length() > 0 && s.substring(s.length() - 1, s.length()).equals("/")) { s = s.substring(0, s.length() - 1) as String; }
        return s;
    }
    function token() as String? { var t = Storage.getValue("watchToken"); return t instanceof String ? t : null; }
    function paired() as Boolean { return token() != null; }

    function deviceId() as String {
        var id = Storage.getValue("deviceId");
        if (id instanceof String && (id as String).length() > 4) { return id as String; }
        try {
            var u = System.getDeviceSettings().uniqueIdentifier;
            if (u instanceof String && (u as String).length() > 4) { Storage.setValue("deviceId", u); return u as String; }
        } catch (e) { }
        var n = "fr955-";
        for (var i = 0; i < 8; i++) { n = n + (Math.rand() % 10).toString(); }
        Storage.setValue("deviceId", n);
        return n;
    }
    function modelName() as String { return "Forerunner 955"; }

    // "wifi" when the watch's own Wi-Fi is up, "phone" when Garmin Connect is linked, else "none".
    // connectionInfo is newer than minApiLevel 3.3; `has` keeps older compilers happy.
    (:typecheck(false))
    function link() as String {
        var phone = false;
        var wifi = false;
        try {
            var ds = System.getDeviceSettings();
            phone = ds.phoneConnected;
            if (ds has :connectionInfo) {
                var info = ds.connectionInfo;
                if (info != null && info has :wifi) {
                    var w = info.wifi;
                    if (w != null && w has :state && w.state == 2) { wifi = true; }
                }
            }
        } catch (e) { }
        if (wifi) { return "wifi"; }
        if (phone) { return "phone"; }
        return "none";
    }
    // Negative codes are the radio (no phone / no Wi-Fi / timeout). Never show the raw number.
    function failWhy(code as Number) as String {
        var how = link();
        if (how.equals("none") || code < 0) { return "No phone or Wi-Fi"; }
        if (how.equals("wifi")) { return "Wi-Fi up, no server"; }
        return "Phone up, no server";
    }
    function linkLine() as String {
        var how = link();
        if (how.equals("wifi")) { return "Watch Wi-Fi"; }
        if (how.equals("phone")) { return "Phone linked"; }
        return "No phone or Wi-Fi";
    }

    function hdr(json as Boolean) as Dictionary {
        var h = {} as Dictionary;
        if (json) { h["Content-Type"] = Communications.REQUEST_CONTENT_TYPE_JSON; }
        var t = token();
        if (t != null) { h["Authorization"] = "Bearer " + t; }
        return h;
    }

    function start() as Void {
        if (base() == null) { return; }
        if (paired()) { fetchWorkout(); flush(); return; }
        requestCode();
    }

    function unpairLocal() as Void {
        Storage.deleteValue("watchToken");
        pairCode = null;
        status = "Not paired";
        pairNote = "Not paired";
        failed = false;
        requestCode();
        (Application.getApp() as SimpleLiftApp).showPair();
    }

    function requestCode() as Void {
        if (base() == null || paired() || _reqBusy) { return; }
        _reqBusy = true;
        failed = false;
        status = "Getting a code…";
        pairNote = link().equals("none") ? "No phone or Wi-Fi" : "Getting a code…";
        Communications.makeWebRequest(base() + "/pair/request",
            { "deviceId" => deviceId(), "model" => modelName(), "name" => modelName() },
            { :method => Communications.HTTP_REQUEST_METHOD_POST, :headers => hdr(true),
              :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON }, method(:onRequest));
    }

    function onRequest(code as Number, data as Dictionary or String or Null) as Void {
        _reqBusy = false;
        if (code == 200 && data instanceof Dictionary && data["code"] instanceof String) {
            pairCode = data["code"] as String;
            Storage.setValue("pairCode", pairCode);
            failed = false;
            pairNote = "Confirm in Simple Lift";
            status = "Waiting to pair";
            startPoll();
        } else {
            failed = true;
            pairNote = failWhy(code);
            status = pairNote;
        }
        WatchUi.requestUpdate();
    }

    function startPoll() as Void {
        stopPoll();
        _poll = new Timer.Timer();
        _poll.start(method(:pollStatus), 4000, true);
        pollStatus();
    }
    function stopPoll() as Void {
        if (_poll != null) { _poll.stop(); _poll = null; }
    }

    function pollStatus() as Void {
        if (base() == null || paired() || pairCode == null) { stopPoll(); return; }
        Communications.makeWebRequest(base() + "/pair/status",
            { "code" => pairCode, "deviceId" => deviceId() },
            { :method => Communications.HTTP_REQUEST_METHOD_POST, :headers => hdr(true),
              :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON }, method(:onStatus));
    }

    function onStatus(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 200 && data instanceof Dictionary) {
            var st = data["status"];
            if (st instanceof String && (st as String).equals("claimed") && data["token"] instanceof String) {
                Storage.setValue("watchToken", data["token"]);
                pairCode = null;
                Storage.deleteValue("pairCode");
                failed = false;
                pairNote = "Paired";
                status = "Paired";
                stopPoll();
                fetchWorkout(); flush();
                (Application.getApp() as SimpleLiftApp).pairDone();
                return;
            }
            if (st instanceof String && (st as String).equals("expired")) {
                pairNote = "Code expired. New code…";
                status = "Code expired";
                stopPoll();
                pairCode = null;
                requestCode();
            }
        } else if (pairCode != null && link().equals("none")) {
            pairNote = "No phone or Wi-Fi";
        }
        WatchUi.requestUpdate();
    }

    function fetchWorkout() as Void {
        if (base() == null || !paired()) { return; }
        Communications.makeWebRequest(base() + "/watch/workout", null,
            { :method => Communications.HTTP_REQUEST_METHOD_GET, :headers => hdr(false),
              :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON }, method(:onWorkout));
    }

    function onWorkout(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 200 && data instanceof Dictionary && data["code"] instanceof String && Workout.parse(data["code"] as String) != null) {
            var c = data["code"] as String;
            var changed = !c.equals(Storage.getValue("syncedCode"));
            Storage.setValue("syncedCode", c);
            var ra = RestAlert.fromAny(data["restAlert"]);
            if (ra != null) { Storage.setValue("restAlertServer", ra); }
            status = "Workout synced";
            if (changed) { (Application.getApp() as SimpleLiftApp).workoutArrived(); }
        } else if (code == 401) {
            unpairLocal();
        } else if (Storage.getValue("syncedCode") != null) {
            status = "Saved workout offline";
        } else {
            status = failWhy(code);
        }
        WatchUi.requestUpdate();
    }

    function sendResult(r as String) as Void {
        if (!paired()) { return; }
        var q = Storage.getValue("pending");
        var a = q instanceof Array ? q as Array : [] as Array;
        a.add(r);
        if (a.size() > 10) { a = a.slice(a.size() - 10, null); }
        Storage.setValue("pending", a);
        status = "Sending…";
        flush();
    }

    function flush() as Void {
        if (busy || base() == null || !paired()) { return; }
        var q = Storage.getValue("pending");
        if (!(q instanceof Array) || (q as Array).size() == 0) { return; }
        busy = true;
        Communications.makeWebRequest(base() + "/watch/result", { "code" => (q as Array)[0] },
            { :method => Communications.HTTP_REQUEST_METHOD_POST, :headers => hdr(true),
              :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON }, method(:onResult));
    }

    function onResult(code as Number, data as Dictionary or String or Null) as Void {
        busy = false;
        var q = Storage.getValue("pending");
        if (code == 200 || code == 400) {
            if (q instanceof Array && (q as Array).size() > 0) { Storage.setValue("pending", (q as Array).slice(1, null)); }
            status = code == 200 ? "Sent to Simple Lift" : "Not accepted. Use the code.";
            flush();
        } else if (code == 401) {
            unpairLocal();
        } else {
            status = link().equals("none") ? "Saved on watch" : "Will send when link is back";
        }
        WatchUi.requestUpdate();
    }
}
