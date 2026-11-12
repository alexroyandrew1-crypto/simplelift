import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;
import Toybox.System;

// Shown when the end of the visit order is reached while sets are still open.
// Two buttons: "Save workout" (finish; only checked sets are recorded) / "Go back to unfinished set".
// UP/DOWN move the selection, START picks, BACK = go back, tap picks the tapped button.
class EndPromptView extends WatchUi.View {
    var m as LiftModel;
    var choice as Number = 1;   // 0 = save, 1 = go back (safe default)
    function initialize(model) { View.initialize(); m = model; }

    function button(dc as Graphics.Dc, cx as Number, y as Number, w as Number, h as Number, l1 as String, l2 as String?, on as Boolean, primary as Boolean) as Void {
        var C = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        dc.setColor(on ? Theme.ACC : Theme.ACC2, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(cx - w / 2, y - h / 2, w, h, 14);
        if (!on) { dc.setColor(primary ? Theme.ACC : Theme.OPEN, Graphics.COLOR_TRANSPARENT); dc.setPenWidth(2); dc.drawRoundedRectangle(cx - w / 2, y - h / 2, w, h, 14); dc.setPenWidth(1); }
        dc.setColor(on ? Theme.ACCINK : Theme.TXT, Graphics.COLOR_TRANSPARENT);
        if (l2 == null) { dc.drawText(cx, y, Graphics.FONT_TINY, l1, C); }
        else {
            dc.drawText(cx, y - 11, Graphics.FONT_XTINY, l1, C);
            dc.drawText(cx, y + 11, Graphics.FONT_XTINY, l2, C);
        }
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var W = dc.getWidth(); var H = dc.getHeight(); var cx = W / 2;
        var C = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        dc.setColor(Theme.TXT, Theme.BG); dc.clear();
        dc.setColor(Theme.WARN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 0.16, Graphics.FONT_TINY, "End of workout", C);
        dc.setColor(Theme.MUT, Graphics.COLOR_TRANSPARENT);
        var n = m.openSets();
        dc.drawText(cx, H * 0.27, Graphics.FONT_XTINY, n + (n == 1 ? " set" : " sets") + " not done", C);
        button(dc, cx, (H * EndPrompt.Y_SAVE).toNumber(), (W * 0.74).toNumber(), (H * 0.17).toNumber(), "Save workout", null, choice == 0, true);
        button(dc, cx, (H * EndPrompt.Y_BACK).toNumber(), (W * 0.74).toNumber(), (H * 0.19).toNumber(), "Go back to", "unfinished set", choice == 1, false);
    }
}

module EndPrompt {
    const Y_SAVE = 0.46;
    const Y_BACK = 0.70;
}

class EndPromptDelegate extends WatchUi.BehaviorDelegate {
    var m as LiftModel;
    function initialize(model) { BehaviorDelegate.initialize(); m = model; }
    function view() as EndPromptView? { var v = WatchUi.getCurrentView()[0]; return v instanceof EndPromptView ? v as EndPromptView : null; }
    function pick(c as Number) as Boolean {
        m.promptOpen = false;
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        if (c == 0) { m.finish(); } else { m.goToUnfinished(); }
        return true;
    }
    function onKey(k as WatchUi.KeyEvent) as Boolean {
        var v = view();
        if (k.getKey() == WatchUi.KEY_ENTER) { return pick(v != null ? v.choice : 1); }
        if (k.getKey() == WatchUi.KEY_ESC) { return pick(1); }
        return false;
    }
    function onPreviousPage() as Boolean { var v = view(); if (v != null) { v.choice = 0; WatchUi.requestUpdate(); } return true; }
    function onNextPage() as Boolean { var v = view(); if (v != null) { v.choice = 1; WatchUi.requestUpdate(); } return true; }
    function onSwipe(e as WatchUi.SwipeEvent) as Boolean { return true; }
    function onTap(e as WatchUi.ClickEvent) as Boolean {
        var y = e.getCoordinates()[1]; var H = System.getDeviceSettings().screenHeight;
        if (y >= H * 0.37 && y < H * 0.575) { return pick(0); }
        if (y >= H * 0.595 && y < H * 0.82) { return pick(1); }
        return true;
    }
}
