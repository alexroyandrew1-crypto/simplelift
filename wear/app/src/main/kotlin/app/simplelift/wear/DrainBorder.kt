package app.simplelift.wear

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/** Round-screen border that empties as rest counts down. The canvas does not take taps. */
@Composable
fun DrainBorder(left: Int, total: Int) {
    if (total <= 0 || left <= 0) return
    val frac = left.toFloat() / total.toFloat()
    Canvas(Modifier.fillMaxSize()) {
        val stroke = 8.dp.toPx()
        val inset = stroke / 2 + 4.dp.toPx()
        val arc = Size(size.width - inset * 2, size.height - inset * 2)
        drawArc(
            color = Color(0x29FFFFFF),
            startAngle = 0f,
            sweepAngle = 360f,
            useCenter = false,
            topLeft = Offset(inset, inset),
            size = arc,
            style = Stroke(width = stroke, cap = StrokeCap.Round)
        )
        drawArc(
            color = if (left <= 10) Color(0xFFF5C16C) else Color(0xFF3DCF97),
            startAngle = -90f,
            sweepAngle = 360f * frac,
            useCenter = false,
            topLeft = Offset(inset, inset),
            size = arc,
            style = Stroke(width = stroke, cap = StrokeCap.Round)
        )
    }
}
