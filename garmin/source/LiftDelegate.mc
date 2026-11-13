import Toybox.Application;
import Toybox.System;
import Toybox.Lang;
import Toybox.WatchUi;

class LiftDelegate extends WatchUi.BehaviorDelegate {
    var m as LiftModel;
    var v as LiftView;
    function initialize(model, view) { BehaviorDelegate.initialize(); m = model; v = view; }

    // Vertical scroll-wheel on a focused weight / reps field (onDrag / onFlick / onSwipe).
    // Direction: swipe or drag UP increases the number, DOWN decreases — same as the
    // UP / DOWN buttons, like rolling a scroll wheel away from you. Larger vertical
    // drags apply more steps (one step per WHEEL_PX pixels). Fast flicks add up to 2
    // extra steps. Left/right swipes still change exercise. Step sizes are unchanged
    // (5 lb per step, 1 rep per step; the watch stores and displays pounds).
    const WHEEL_PX = 22;
    const WHEEL_MAX = 8;
    var dragX as Number = 0;
    var dragY as Number = -1;
    var dragAcc as Number = 0;
    var dragApplied as Number = 0;   // signed steps already applied for this gesture
    var dragAxis as Number = 0;      // 0 = unknown, 1 = vertical, 2 = horizontal

    function editing() as Boolean { return m.focus == FOCUS_WT || m.focus == FOCUS_REPS; }

    function wheel(steps as Number) as Void {
        if (steps == 0) { return; }
        var next = dragApplied + steps;
        if (next > WHEEL_MAX) { steps = WHEEL_MAX - dragApplied; }
        if (next < -WHEEL_MAX) { steps = -WHEEL_MAX - dragApplied; }
        if (steps == 0) { return; }
        m.scroll(steps);
        dragApplied += steps;
    }

    function resetDrag() as Void { dragY = -1; dragAcc = 0; dragApplied = 0; dragAxis = 0; }

    // START button. Handled in onKey (not onSelect) so screen taps reach onTap instead of the select behavior.
    function onKey(k as WatchUi.KeyEvent) as Boolean {
        if (k.getKey() == WatchUi.KEY_ENTER) { return start(); }
        if (k.getKey() == WatchUi.KEY_ESC) { return back(); }
        return false;
    }
    function start() as Boolean {             // START = checkmark
        if (m.hasUndo()) { m.undoAuto(); return true; }
        if (m.finished) { (Application.getApp() as SimpleLiftApp).showPicker(); return true; }
        m.startKey();
        return true;
    }
    function onPreviousPage() as Boolean { if (!m.finished && !m.resting()) { m.scroll(1); } return true; }   // UP
    function onNextPage() as Boolean { if (!m.finished && !m.resting()) { m.scroll(-1); } return true; }      // DOWN
    function onMenu() as Boolean {             // hold UP: highlight weight -> reps -> nothing
        if (!m.finished && !m.resting()) { m.toggleAdjust(); }
        return true;
    }
    // BACK button = Finish & save. Handled in onKey (not onBack) so a right swipe reaches onSwipe
    // instead of the device's swipe-right = back behavior.
    function back() as Boolean {
        if (m.hasUndo()) { m.undoAuto(); return true; }
        if (m.finished) { System.exit(); }
        if (m.focus != FOCUS_NONE) { m.focus = FOCUS_NONE; WatchUi.requestUpdate(); return true; }
        if (!m.anyDone() && !m.logKind.equals("none")) { (Application.getApp() as SimpleLiftApp).showPicker(); return true; }
        var menu = new WatchUi.Menu2({ :title => "Finish workout?" });
        menu.addItem(new WatchUi.MenuItem("Finish & save", "Garmin and the phone", :save, {}));
        menu.addItem(new WatchUi.MenuItem("Keep lifting", null, :resume, {}));
        menu.addItem(new WatchUi.MenuItem("Exit, save later", "Stays on this watch", :exit, {}));
        WatchUi.pushView(menu, new FinishMenuDelegate(m), WatchUi.SLIDE_UP);
        return true;
    }

    // Live scroll-wheel: finger moving up (y decreases) increases the focused number.
    function onDrag(e as WatchUi.DragEvent) as Boolean {
        if (m.finished || m.resting() || !editing()) { return false; }
        var typ = e.getType();
        var xy = e.getCoordinates();
        var x = xy[0]; var y = xy[1];
        if (typ == WatchUi.DRAG_TYPE_START) {
            dragX = x; dragY = y; dragAcc = 0; dragApplied = 0; dragAxis = 0;
            return true;
        }
        if (dragY < 0) { return false; }
        if (dragAxis == 0) {
            var adx = (x - dragX).abs(); var ady = (y - dragY).abs();
            if (adx < 12 && ady < 12) { dragX = x; dragY = y; return true; }
            dragAxis = ady >= adx ? 1 : 2;
        }
        if (dragAxis == 2) {          // horizontal: leave left/right swipe to onSwipe
            dragY = y; dragX = x;
            return true;
        }
        dragAcc += (dragY - y);       // up (y drops) => positive => increase
        dragY = y; dragX = x;
        var steps = dragAcc / WHEEL_PX;
        if (steps != 0) {
            dragAcc -= steps * WHEEL_PX;
            wheel(steps);
        }
        return true;
    }

    // Fast vertical flick: add 1 extra step at >= 400 px/s, 2 at >= 800 px/s.
    function onFlick(e as WatchUi.FlickEvent) as Boolean {
        if (m.finished || m.resting() || !editing()) { return false; }
        var dir = e.getDirection();
        var sign = 0;
        if (dir <= 45 || dir >= 315) { sign = 1; }       // up
        else if (dir >= 135 && dir <= 225) { sign = -1; } // down
        if (sign == 0) { return false; }
        var extra = 0;
        var vel = e.getVelocity();
        if (vel >= 800.0) { extra = 2; }
        else if (vel >= 400.0) { extra = 1; }
        if (extra > 0) { wheel(sign * extra); }
        return true;
    }

    function onSwipe(e as WatchUi.SwipeEvent) as Boolean {
        if (m.finished) { return true; }
        var d = e.getDirection();
        if (editing() && !m.resting()) {
            if (d == WatchUi.SWIPE_UP) {
                if (dragApplied == 0) { wheel(1); }
                resetDrag();
                return true;
            }
            if (d == WatchUi.SWIPE_DOWN) {
                if (dragApplied == 0) { wheel(-1); }
                resetDrag();
                return true;
            }
        }
        resetDrag();
        if (d == WatchUi.SWIPE_LEFT) { if (!m.resting()) { m.moveExercise(1); } return true; }    // next exercise
        if (d == WatchUi.SWIPE_RIGHT) { if (!m.resting()) { m.moveExercise(-1); } return true; } // previous exercise
        return true;   // up/down swipes do nothing when a number is not being edited
    }
    // Touch: only the WEIGHT and the REP NUMBER are tappable ("Set X of Y" is plain text).
    //   weight/reps line  y 0.40 .. 0.585, full width; split at the middle of " x " (LiftView.splitX):
    //       left = weight (+5 lb), right = reps (+1). With a field highlighted, the -/+ circles at the
    //       ends of the line change that field (-/+ 5 lb or -/+ 1 rep).
    //   checkmark circle r = CHECK_R + 8 around y 0.70;  dots y >= 0.80 (select a set)
    // A slightly long press on real hardware can arrive as onHold instead of onTap, so onHold uses the same
    // weight/reps zones and is always consumed (it must not fall through to the hold = menu behavior).
    function onTap(e as WatchUi.ClickEvent) as Boolean { return touch(e, false); }
    function onHold(e as WatchUi.ClickEvent) as Boolean { return touch(e, true); }

    function touch(e as WatchUi.ClickEvent, hold as Boolean) as Boolean {
        if (m.hasUndo()) { m.undoAuto(); return true; }
        if (m.finished) { return hold ? true : start(); }
        var xy = e.getCoordinates(); var x = xy[0]; var y = xy[1];
        var W = System.getDeviceSettings().screenWidth; var H = System.getDeviceSettings().screenHeight; var cx = W / 2;
        if (!hold && y < H * 0.16 && !m.resting()) { m.cycleKind(); return true; }
        if (y >= H * 0.40 && y < H * 0.585) {
            if (m.resting()) { return true; }               // that row is the rest countdown
            if (m.focus != FOCUS_NONE) {
                var l = v.lineBox[0] as Number; var r = l + (v.lineBox[2] as Number);
                if (x < l - 2) { if (m.focus == FOCUS_WT) { m.adjustWeight(-5); } else { m.adjustReps(-1); } return true; }
                if (x > r + 2) { if (m.focus == FOCUS_WT) { m.adjustWeight(5); } else { m.adjustReps(1); } return true; }
            }
            if (x < v.splitX) { m.tapWeight(); } else { m.tapReps(); }
            return true;
        }
        if (hold) { return true; }
        var ky = H * Layout.Y_CHECK; var r = Layout.CHECK_R + 8;
        if ((x - cx) * (x - cx) + (y - ky) * (y - ky) <= r * r) { m.check(); return true; }
        if (m.resting()) { return true; }
        if (y >= H * 0.80) {
            var n = m.setsIn(m.idx); var gap = Layout.dotGap(n); var x0 = cx - (n - 1) * gap / 2;
            var best = -1; var bd = 9999;
            for (var k = 0; k < n; k++) { var dx = (x - (x0 + k * gap)).abs(); if (dx < bd) { bd = dx; best = k; } }
            if (best >= 0 && bd <= 18) { m.jumpTo(best); }
        }
        return true;
    }
}

class FinishMenuDelegate extends WatchUi.Menu2InputDelegate {
    var m as LiftModel;
    function initialize(model) { Menu2InputDelegate.initialize(); m = model; }
    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        if (id == :save) { m.finish(); }
        else if (id == :exit) { m.save(); System.exit(); }
    }
}
