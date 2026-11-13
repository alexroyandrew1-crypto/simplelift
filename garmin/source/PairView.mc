import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;
import Toybox.System;

// Shown when the watch is not paired: a short-lived 6-digit code for the phone app.
class PairView extends WatchUi.View {
    function initialize() { View.initialize(); }

    function onUpdate(dc as Graphics.Dc) as Void {
        var W = dc.getWidth(); var H = dc.getHeight(); var cx = W / 2;
        var C = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        dc.setColor(Theme.TXT, Theme.BG); dc.clear();
        var sy = (Application.getApp() as SimpleLiftApp).sync;

        dc.setColor(Theme.ACC, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 0.13, Graphics.FONT_XTINY, "CONFIRM ON PHONE", C);

        var code = sy.pairCode;
        if (code == null) { var s = Storage.getValue("pairCode"); if (s instanceof String) { code = s as String; } }
        var hasCode = code instanceof String && (code as String).length() >= 6;
        dc.setColor(Theme.TXT, Graphics.COLOR_TRANSPARENT);
        if (hasCode) {
            var spaced = (code as String).substring(0, 3) + " " + (code as String).substring(3, 6);
            dc.drawText(cx, H * 0.36, Graphics.FONT_NUMBER_MEDIUM, spaced, C);
        } else {
            dc.drawText(cx, H * 0.36, Graphics.FONT_SMALL, "······", C);
        }

        dc.setColor(sy.failed ? Theme.WARN : Theme.MUT, Graphics.COLOR_TRANSPARENT);
        var note = sy.pairNote.length() > 0 ? sy.pairNote : "Getting a code…";
        if (hasCode && note.equals("Enter in Simple Lift")) { note = "Confirm in Simple Lift"; }
        var t = Theme.fit(dc, note, [Graphics.FONT_XTINY], (W * 0.84).toNumber());
        dc.drawText(cx, H * 0.54, Graphics.FONT_XTINY, t[0], C);
        var sub = hasCode ? "Phone → Watch → Pair a watch" : "Needs phone link or watch Wi-Fi";
        var u = Theme.fit(dc, sub, [Graphics.FONT_XTINY], (W * 0.84).toNumber());
        dc.setColor(Theme.MUT, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 0.64, Graphics.FONT_XTINY, u[0], C);
        var link = sy.linkLine();
        if (!link.equals(t[0]) && !link.equals(note)) { dc.drawText(cx, H * 0.74, Graphics.FONT_XTINY, link, C); }

        var label = hasCode && !sy.failed ? "NOT NOW" : "RETRY";
        var bw = dc.getTextWidthInPixels(label, Graphics.FONT_XTINY) + 28; var bh = 26;
        dc.setColor(Theme.ACC, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(cx - bw / 2, H * 0.88 - bh / 2, bw, bh, 13);
        dc.setColor(Theme.ACCINK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 0.88, Graphics.FONT_XTINY, label, C);
    }
}

class PairDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }
    function onSelect() as Boolean {
        var sy = (Application.getApp() as SimpleLiftApp).sync;
        if (sy.pairCode == null || sy.failed) { sy.requestCode(); WatchUi.requestUpdate(); return true; }
        (Application.getApp() as SimpleLiftApp).showPicker();
        return true;
    }
    function onBack() as Boolean { (Application.getApp() as SimpleLiftApp).showPicker(); return true; }
    function onPreviousPage() as Boolean { return true; }
    function onNextPage() as Boolean { return true; }
}
