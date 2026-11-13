import Toybox.Application;
import Toybox.Lang;
import Toybox.Timer;
import Toybox.WatchUi;

class SimpleLiftApp extends Application.AppBase {
    var model as LiftModel?;
    var sync as CloudSync = new CloudSync();
    var liveTimer as Timer.Timer?;
    function initialize() { AppBase.initialize(); }
    function onStart(state as Dictionary?) as Void {
        sync.start();
        LiveLink.listen();
        liveTimer = new Timer.Timer();
        liveTimer.start(method(:liveTick), 3000, true);
    }
    function liveTick() as Void {
        sync.pollLive();
        if (!sync.paired() && sync.pairCode != null) {
            LiveLink.send({ "t" => "pair", "code" => sync.pairCode, "src" => "w" });
        }
    }
    function onStop(state as Dictionary?) as Void {
        if (model != null) { model.stopSensors(); if (!model.finished) { model.save(); model.stopRecording(false); } }
    }
    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        if (!sync.paired()) {
            var v = new PairView();
            return [v, new PairDelegate()];
        }
        var p = new PickerView();
        return [p, new PickerDelegate(p)];
    }
    function showPair() as Void {
        if (model != null) { return; }
        WatchUi.switchToView(new PairView(), new PairDelegate(), WatchUi.SLIDE_RIGHT);
    }
    function startWorkout(w as Dictionary) as Void {
        if (model != null) { model.stopSensors(); if (!model.finished && !model.applying) { model.save(); } model.stopRecording(false); }
        adopt(w);
        if (model != null) { model.publish(); }
    }
    // Open a workout without publishing the one it replaces. Used when a phone snapshot arrives.
    function adopt(w as Dictionary) as Void {
        model = new LiftModel(w);
        var v = new LiftView(model);
        WatchUi.switchToView(v, new LiftDelegate(model, v), WatchUi.SLIDE_LEFT);
    }
    function showPicker() as Void {
        if (model != null) { model.stopSensors(); if (!model.finished && !model.applying) { model.save(); } model.stopRecording(false); }
        model = null;
        var p = new PickerView();
        WatchUi.switchToView(p, new PickerDelegate(p), WatchUi.SLIDE_RIGHT);
    }
    // A new workout came from the server: refresh the picker if it's showing (never interrupt a workout).
    function pairDone() as Void {
        if (model != null) { return; }
        var p = new PickerView();
        WatchUi.switchToView(p, new PickerDelegate(p), WatchUi.SLIDE_LEFT);
    }
    function workoutArrived() as Void {
        if (model != null) { return; }
        var p = new PickerView();
        WatchUi.switchToView(p, new PickerDelegate(p), WatchUi.SLIDE_IMMEDIATE);
    }
    function onSettingsChanged() as Void {
        sync.start();
        workoutArrived();
    }
}
