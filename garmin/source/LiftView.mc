import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// v2 main workout screen, top to bottom:
// workout name, exercise name, "Set X of Y", weight x reps (largest), checkmark button, set dots.
module Layout {
    const Y_TITLE = 0.115;
    const Y_EX = 0.225;
    const Y_SET = 0.35;
    const Y_WT = 0.515;
    const Y_CHECK = 0.70;
    const Y_DOTS = 0.865;
    const CHECK_R = 23;
    function dotGap(n as Number) as Number { return n <= 1 ? 0 : (150 / (n - 1) < 26 ? 150 / (n - 1) : 26); }
}

class LiftView extends WatchUi.View {
    var m as LiftModel;
    // last drawn hit areas (for touch): [x, y, w, h]
    var lineBox as Array = [0, 0, 0, 0];   // the whole "weight x reps" text
    var splitX as Number = 130;            // taps left of this = weight, right = reps
    function initialize(model) { View.initialize(); m = model; }

    // highlight of the focused field: bright fill; a white ring for ~0.5 s right after a tap
    function hilite(dc as Graphics.Dc, x as Number, y as Number, w as Number, h as Number, ring as Boolean) as Void {
        dc.setColor(Theme.ACC, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x - w / 2, y - h / 2, w, h, h / 3);
        if (ring) { dc.setColor(Theme.TXT, Graphics.COLOR_TRANSPARENT); dc.setPenWidth(3); dc.drawRoundedRectangle(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, h / 3); dc.setPenWidth(1); }
    }

    function wtText(i as Number, s as Number) as String {
        var wt = m.weightAt(i, s);
        return (wt == 0 ? "BW" : wt + " lb") + " x " + m.repsAt(i, s);
    }

    // "Next: 145 lb x 5" (+ exercise name if the next set is in another exercise)
    function nextText() as String? {
        // same rule as LiftModel.endRest/advance: this exercise's next open set, else the next exercise in VISIT order
        var ni = m.restEx >= 0 ? m.restEx : m.idx; var ns = m.firstOpen(ni);
        if (ns < 0) { for (var k = m.order.indexOf(ni) + 1; k < m.order.size(); k++) { var i2 = m.order[k]; var s2 = m.firstOpen(i2); if (s2 >= 0) { ni = i2; ns = s2; break; } } }
        if (ns < 0) { return null; }
        return "Next: " + wtText(ni, ns) + (ni != m.idx ? " - " + (m.ex[ni] as Dictionary)[:name] : "");
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var W = dc.getWidth(); var H = dc.getHeight(); var cx = W / 2;
        var C = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        dc.setColor(Theme.TXT, Theme.BG); dc.clear();
        if (m.finished) { drawDone(dc, W, H, cx, C); return; }

        var e = m.ex[m.idx] as Dictionary;
        var n = m.setsIn(m.idx);
        var rest = m.resting();

        // rest ring around the edge
        if (rest) {
            var frac = m.restLeft.toFloat() / (m.restTotal > 0 ? m.restTotal : 1);
            dc.setColor(Theme.LINE, Graphics.COLOR_TRANSPARENT); dc.setPenWidth(6);
            dc.drawCircle(cx, H / 2, cx - 4);
            dc.setColor(m.restLeft <= 10 ? Theme.WARN : Theme.ACC, Graphics.COLOR_TRANSPARENT);
            if (frac >= 0.999) { dc.drawCircle(cx, H / 2, cx - 4); }
            else if (frac > 0) { dc.drawArc(cx, H / 2, cx - 4, Graphics.ARC_CLOCKWISE, 90, 90 - (360 * frac).toNumber()); }
            dc.setPenWidth(1);
        }

        // 1. workout name (small)
        // (while motion says the set is under way, this row shows the live rep counter instead)
        // After an auto-detected set: "Set logged - tap to undo" for a few seconds.
        if (m.hasUndo()) {
            var ut = Theme.fit(dc, "Tap to undo", [Graphics.FONT_XTINY], (W * 0.84).toNumber());
            dc.setColor(Theme.WARN, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, H * Layout.Y_TITLE, Graphics.FONT_XTINY, ut[0], C);
        } else if (m.setLive && !rest) {
            var rt = "Reps " + m.liveReps + "/" + m.repsAt(m.idx, m.sel);
            var tw = dc.getTextWidthInPixels(rt, Graphics.FONT_XTINY);
            dc.setColor(Theme.ACC, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(cx - tw / 2 - 8, (H * Layout.Y_TITLE).toNumber(), 4);
            dc.drawText(cx + 4, H * Layout.Y_TITLE, Graphics.FONT_XTINY, rt, C);
        } else {
            dc.setColor(Theme.MUT, Graphics.COLOR_TRANSPARENT);
            var t = Theme.fit(dc, (m.w[:title] as String) + "  " + (m.pos() + 1) + "/" + m.ex.size(), [Graphics.FONT_XTINY], (W * 0.6).toNumber());
            dc.drawText(cx, H * Layout.Y_TITLE, Graphics.FONT_XTINY, t[0], C);
        }

        // 2. exercise name
        dc.setColor(Theme.TXT, Graphics.COLOR_TRANSPARENT);
        var en = Theme.fit(dc, e[:name] as String, [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY], (W * 0.80).toNumber());
        dc.drawText(cx, H * Layout.Y_EX, en[1], en[0], C);

        // 3. "Set X of Y" — plain text, never highlighted or tappable; during rest: what's next
        var st = "Set " + (m.sel + 1) + " of " + n + (m.isDone(m.idx, m.sel) ? "  done" : "");
        if (rest) { st = "Rest"; }
        var sf = Graphics.FONT_TINY;
        if (rest) { var ff = Theme.fit(dc, st, [Graphics.FONT_TINY, Graphics.FONT_XTINY], (W * 0.80).toNumber()); st = ff[0]; sf = ff[1]; }
        dc.setColor(rest ? Theme.MUT : Theme.TXT, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * Layout.Y_SET, sf, st, C);

        // 4. weight x reps (largest) — during rest: countdown
        // Only the WEIGHT and the REP NUMBER can be highlighted, one at a time (m.focus).
        var wy = (H * Layout.Y_WT).toNumber();
        if (rest) {
            dc.setColor(m.restLeft <= 10 ? Theme.WARN : Theme.ACC, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, wy - 6, Graphics.FONT_NUMBER_MEDIUM, (m.restLeft / 60) + ":" + (m.restLeft % 60).format("%02d"), C);
            lineBox = [0, 0, 0, 0]; splitX = cx;
        } else {
            var wt = m.weightAt(m.idx, m.sel);
            var a = wt == 0 ? "BW" : wt + " lb"; var b = " x "; var c = m.repsAt(m.idx, m.sel).toString();
            var f = Theme.fit(dc, a + b + c, [Graphics.FONT_LARGE, Graphics.FONT_MEDIUM], (W * 0.70).toNumber())[1];
            var wa = dc.getTextWidthInPixels(a, f); var wb = dc.getTextWidthInPixels(b, f); var wc = dc.getTextWidthInPixels(c, f);
            var x0 = cx - (wa + wb + wc) / 2; var hh = dc.getFontHeight(f) + 6;
            lineBox = [x0, wy - hh / 2, wa + wb + wc, hh];
            splitX = x0 + wa + wb / 2;
            var L2 = Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER;
            var fl = m.flashTimer != null;
            var onW = m.focus == FOCUS_WT; var onR = m.focus == FOCUS_REPS;
            if (onW) { hilite(dc, x0 + wa / 2, wy, wa + 14, hh, fl); }
            if (onR) { hilite(dc, x0 + wa + wb + wc / 2, wy, (wc < 24 ? 24 : wc) + 14, hh, fl); }
            dc.setColor(onW ? Theme.ACCINK : Theme.TXT, Graphics.COLOR_TRANSPARENT); dc.drawText(x0, wy, f, a, L2);
            dc.setColor(Theme.MUT, Graphics.COLOR_TRANSPARENT); dc.drawText(x0 + wa, wy, f, b, L2);
            dc.setColor(onR ? Theme.ACCINK : Theme.TXT, Graphics.COLOR_TRANSPARENT); dc.drawText(x0 + wa + wb, wy, f, c, L2);
            if (onW || onR) {   // - / + circles at the line ends change the highlighted field (= DOWN / UP)
                var bl = 20; var br = W - 20;   // at the screen edges, clear of the weight and rep targets
                dc.setColor(Theme.ACC, Graphics.COLOR_TRANSPARENT);
                dc.fillCircle(bl, wy, 12); dc.fillCircle(br, wy, 12);
                dc.setColor(Theme.ACCINK, Graphics.COLOR_TRANSPARENT);
                dc.fillRectangle(bl - 6, wy - 1, 12, 3);
                dc.fillRectangle(br - 6, wy - 1, 12, 3); dc.fillRectangle(br - 1, wy - 6, 3, 12);
            }
        }

        // 5. checkmark button (START)
        var ky = (H * Layout.Y_CHECK).toNumber(); var r = Layout.CHECK_R;
        if (rest) {   // skip rest
            dc.setColor(Theme.ACC2, Graphics.COLOR_TRANSPARENT); dc.fillCircle(cx, ky, r);
            dc.setColor(Theme.ACC, Graphics.COLOR_TRANSPARENT); dc.setPenWidth(2); dc.drawCircle(cx, ky, r); dc.setPenWidth(1);
            dc.fillPolygon([[cx - 11, ky - 8], [cx - 1, ky], [cx - 11, ky + 8]]);
            dc.fillPolygon([[cx + 1, ky - 8], [cx + 11, ky], [cx + 1, ky + 8]]);
        } else if (m.isDone(m.idx, m.sel)) {
            dc.setColor(Theme.ACC2, Graphics.COLOR_TRANSPARENT); dc.fillCircle(cx, ky, r);
            dc.setColor(Theme.ACC, Graphics.COLOR_TRANSPARENT); Theme.check(dc, cx, ky, 10);
        } else {
            dc.setColor(Theme.ACC, Graphics.COLOR_TRANSPARENT); dc.fillCircle(cx, ky, r);
            dc.setColor(Theme.ACCINK, Graphics.COLOR_TRANSPARENT); Theme.check(dc, cx, ky, 10);
        }

        // 6. set dots (green = done, ring = selected, accent ring = resting)
        var gap = Layout.dotGap(n); var x0 = cx - (n - 1) * gap / 2; var dy = (H * Layout.Y_DOTS).toNumber();
        for (var k = 0; k < n; k++) {
            var x = x0 + k * gap;
            var resting = rest && m.restEx == m.idx && m.restSet == k;
            if (resting) {
                dc.setColor(Theme.ACC2, Graphics.COLOR_TRANSPARENT); dc.fillCircle(x, dy, 7);
                dc.setColor(Theme.ACC, Graphics.COLOR_TRANSPARENT); dc.setPenWidth(2); dc.drawCircle(x, dy, 7); dc.setPenWidth(1);
            } else {
                dc.setColor(m.isDone(m.idx, k) ? Theme.ACC : Theme.OPEN, Graphics.COLOR_TRANSPARENT);
                dc.fillCircle(x, dy, 7);
            }
            if (k == m.sel && !rest) {
                dc.setColor(Theme.TXT, Graphics.COLOR_TRANSPARENT); dc.setPenWidth(2); dc.drawCircle(x, dy, 11); dc.setPenWidth(1);
            }
        }
        if ((Application.getApp() as SimpleLiftApp).sync.link().equals("none")) {
            dc.setColor(Theme.WARN, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, H * 0.95, Graphics.FONT_XTINY, "Saved on watch", C);
        }
    }

    (:debug)
    function dbgCal(dc as Graphics.Dc, cx as Number, H as Number) as Void {   // debug builds only
        dc.setColor(Theme.WARN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 0.82, Graphics.FONT_XTINY, m.calSource, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.drawText(cx, H * 0.90, Graphics.FONT_XTINY, "time: " + m.timeSource, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    function drawDone(dc as Graphics.Dc, W as Number, H as Number, cx as Number, C as Number) as Void {
        var st = m.stats();
        dc.setColor(Theme.ACC, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 0.20, Graphics.FONT_SMALL, "Workout saved", C);
        dc.setColor(Theme.TXT, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 0.335, Graphics.FONT_TINY, st[0] + "/" + st[1] + " sets  " + st[2] + " lb", C);
        // calorie estimate (Garmin session calories, else MET estimate; see LiftModel.computeCalories)
        dc.setColor(Theme.MUT, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 0.45, Graphics.FONT_TINY, "~" + m.calories + " cal", C);
        // total workout time (see LiftModel.computeTime)
        dc.drawText(cx, H * 0.56, Graphics.FONT_TINY, "Time " + m.timeText(), C);
        if (self has :dbgCal) { dbgCal(dc, cx, H); }
        var sy = (Application.getApp() as SimpleLiftApp).sync;
        var label = sy.status.length() > 0 ? sy.status : (sy.paired() ? "Saved on watch" : "Not paired");
        var good = label.equals("Sent to Simple Lift") || label.equals("Workout synced") || label.equals("Paired");
        dc.setColor(good ? Theme.ACC : Theme.WARN, Graphics.COLOR_TRANSPARENT);
        var t = Theme.fit(dc, label, [Graphics.FONT_XTINY], (W * 0.84).toNumber());
        dc.drawText(cx, H * 0.66, Graphics.FONT_XTINY, t[0], C);
        dc.setColor(Theme.MUT, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 0.75, Graphics.FONT_XTINY, "Backup code", C);
        var code = m.result;
        var maxW = (W * 0.88).toNumber();
        var line1 = code; var line2 = "";
        if (code.length() > 0 && dc.getTextWidthInPixels(code, Graphics.FONT_XTINY) > maxW) {
            var mid = code.length() / 2;
            line1 = code.substring(0, mid) as String;
            line2 = code.substring(mid, code.length()) as String;
        }
        dc.setColor(Theme.WARN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, H * 0.84, Graphics.FONT_XTINY, line1, C);
        if (line2.length() > 0) { dc.drawText(cx, H * 0.92, Graphics.FONT_XTINY, line2, C); }
    }
}
