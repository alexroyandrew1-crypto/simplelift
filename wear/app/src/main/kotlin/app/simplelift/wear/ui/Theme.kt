package app.simplelift.wear.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme

val Ink = Color(0xFF04281A)
val Bg = Color(0xFF090B10)
val Card2 = Color(0xFF1C2230)
val Txt = Color(0xFFF3F5F8)
val Mut = Color(0xFFA3ADBD)
val Acc = Color(0xFF3DCF97)

@Composable
fun WearTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colors = Colors(
            primary = Acc,
            primaryVariant = Color(0xFF245C3A),
            secondary = Acc,
            secondaryVariant = Color(0xFF245C3A),
            background = Bg,
            surface = Color(0xFF151922),
            error = Color(0xFFFF8D8D),
            onPrimary = Ink,
            onSecondary = Ink,
            onBackground = Txt,
            onSurface = Txt,
            onSurfaceVariant = Mut,
            onError = Color(0xFF3A1D24)
        ),
        content = content
    )
}
