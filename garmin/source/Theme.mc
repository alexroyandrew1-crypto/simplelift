import Toybox.Graphics;
import Toybox.Lang;

// Colors from the phone app's theme (simplelift-upload/style.css :root).
module Theme {
    const BG = 0x0F1115;      // --bg
    const CARD = 0x1A1D24;    // --card
    const TXT = 0xEEF0F4;     // --txt
    const MUT = 0xA7AEBB;     // --mut
    const LINE = 0x2E3340;    // --line (open set dots; MIP shows it as dark gray)
    const ACC = 0x4ADE80;     // --acc (green accent)
    const ACC2 = 0x16351F;    // --acc2 (dark green bubble fill)
    const ACCINK = 0x06240F;  // --accink (text on accent)
    const WARN = 0xFBBF24;    // --warn
    const OPEN = 0x555555;    // open dot fill (readable on MIP; --line is too close to black)

    // Largest font from the list that fits maxW; text is shortened with ".." if even the smallest doesn't fit.
    function fit(dc as Graphics.Dc, text as String, fonts as Array, maxW as Number) as Array {
        for (var i = 0; i < fonts.size(); i++) {
            if (dc.getTextWidthInPixels(text, fonts[i]) <= maxW) { return [text, fonts[i]]; }
        }
        var f = fonts[fonts.size() - 1];
        var t = text;
        while (t.length() > 3 && dc.getTextWidthInPixels(t + "..", f) > maxW) { t = t.substring(0, t.length() - 1) as String; }
        return [t + "..", f];
    }

    function tri(dc as Graphics.Dc, x as Number, y as Number, s as Number, up as Boolean) as Void {
        if (up) { dc.fillPolygon([[x - s, y + s / 2], [x + s, y + s / 2], [x, y - s / 2 - 2]]); }
        else { dc.fillPolygon([[x - s, y - s / 2], [x + s, y - s / 2], [x, y + s / 2 + 2]]); }
    }

    function check(dc as Graphics.Dc, x as Number, y as Number, s as Number) as Void {
        dc.setPenWidth(4);
        dc.drawLine(x - s, y, x - s / 3, y + s * 2 / 3);
        dc.drawLine(x - s / 3, y + s * 2 / 3, x + s, y - s * 2 / 3);
        dc.setPenWidth(1);
    }
}
