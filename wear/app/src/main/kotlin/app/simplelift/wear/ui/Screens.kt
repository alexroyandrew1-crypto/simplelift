package app.simplelift.wear.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Text
import app.simplelift.wear.DrainBorder
import app.simplelift.wear.model.CheckMode
import app.simplelift.wear.model.Codes
import app.simplelift.wear.model.PlanDay
import app.simplelift.wear.model.Session

@Composable
fun HeartChip(bpm: Int, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Canvas(Modifier.padding(end = 3.dp).size(width = 11.dp, height = 10.dp)) {
            val w = size.width
            val h = size.height
            val path = Path().apply {
                moveTo(w / 2f, h * 0.92f)
                cubicTo(-w * 0.05f, h * 0.35f, w * 0.18f, 0f, w / 2f, h * 0.38f)
                cubicTo(w * 0.82f, 0f, w * 1.05f, h * 0.35f, w / 2f, h * 0.92f)
                close()
            }
            drawPath(path, Color(0xFFFF8D8D), style = Fill)
        }
        Text("$bpm", fontSize = 11.sp, color = Txt)
    }
}

@Composable
fun PairScreen(code: String?, note: String, onRetry: () -> Unit, onSkip: () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("CONFIRM ON PHONE", fontSize = 10.sp, color = Acc)
        val shown = if (code != null && code.length == 6) code.take(3) + " " + code.drop(3) else "······"
        Text(shown, fontSize = 28.sp, color = Txt, textAlign = TextAlign.Center)
        Text(note, fontSize = 11.sp, color = Mut, textAlign = TextAlign.Center)
        Text("Settings → Watch → Samsung Galaxy Watch", fontSize = 10.sp, color = Mut, textAlign = TextAlign.Center)
        Button(onClick = if (code == null) onRetry else onSkip, modifier = Modifier.padding(top = 8.dp)) {
            Text(if (code == null) "Retry" else "Not now")
        }
    }
}

@Composable
fun PlansScreen(days: List<PlanDay>, note: String, onOpen: (Int) -> Unit, onSettings: () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 14.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Simple Lift", color = Acc, fontSize = 12.sp)
        if (days.isEmpty()) {
            Text("No workout yet", color = Txt, fontSize = 14.sp, textAlign = TextAlign.Center)
            Text("Sign in on your phone, then pair this watch.", color = Mut, fontSize = 11.sp, textAlign = TextAlign.Center)
        }
        days.forEachIndexed { index, day ->
            if (day.rest) return@forEachIndexed
            Button(
                onClick = { onOpen(index) },
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                colors = ButtonDefaults.buttonColors(backgroundColor = if (day.today) Acc else Card2)
            ) {
                Text((if (day.today) "Today · " else "") + day.name, fontSize = 13.sp, color = if (day.today) Ink else Txt)
            }
        }
        if (note.isNotBlank()) Text(note, fontSize = 10.sp, color = Mut, textAlign = TextAlign.Center)
        Button(onClick = onSettings, modifier = Modifier.padding(top = 6.dp), colors = ButtonDefaults.buttonColors(backgroundColor = Card2)) {
            Text("Settings", fontSize = 12.sp)
        }
    }
}

@Composable
fun WorkoutScreen(
    session: Session,
    nowSec: Long,
    onMode: () -> Unit,
    onSet: (Int) -> Unit,
    onExercise: () -> Unit,
    onRest: () -> Unit,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    onFinish: () -> Unit,
    onUndo: () -> Unit
) {
    val ex = session.current()
    val left = session.restLeft(nowSec)
    Box(Modifier.fillMaxSize()) {
        DrainBorder(left, session.restTotal)
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 26.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(session.mode.label(), fontSize = 11.sp, color = Acc, modifier = Modifier.clickable(onClick = onMode))
            Text(ex?.name ?: session.title, fontSize = 15.sp, color = Txt, textAlign = TextAlign.Center)
            if (ex != null) Text(Codes.repLine(ex), fontSize = 11.sp, color = Mut, textAlign = TextAlign.Center)
            if (ex != null && session.mode == CheckMode.Set) {
                ex.sets.forEachIndexed { index, row ->
                    Button(
                        onClick = { onSet(index) },
                        modifier = Modifier.fillMaxWidth().padding(top = 3.dp),
                        colors = ButtonDefaults.buttonColors(backgroundColor = if (row.done) Acc else Card2)
                    ) {
                        val mark = if (row.done) "✓ " else ""
                        Text("$mark${index + 1}  ${row.weightLb} lb × ${row.reps}", fontSize = 12.sp, color = if (row.done) Ink else Txt)
                    }
                }
            }
            if (ex != null && session.mode == CheckMode.Exercise) {
                val all = ex.sets.all { it.done }
                Button(onClick = onExercise, modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
                    Text(if (all) "Exercise done" else "Check exercise")
                }
            }
            if (session.mode != CheckMode.Set) {
                Button(onClick = onRest, modifier = Modifier.padding(top = 4.dp), colors = ButtonDefaults.buttonColors(backgroundColor = Card2)) {
                    Text("Start rest", color = Txt)
                }
            }
            Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Button(onClick = onPrev, colors = ButtonDefaults.buttonColors(backgroundColor = Card2)) { Text("Prev", fontSize = 11.sp) }
                Button(onClick = onNext, colors = ButtonDefaults.buttonColors(backgroundColor = Card2)) { Text("Next", fontSize = 11.sp) }
            }
            Button(onClick = onFinish, modifier = Modifier.padding(top = 4.dp)) { Text("Finish") }
        }
        if (session.undo != null) {
            Button(onClick = onUndo, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp)) {
                Text("Undo", fontSize = 12.sp)
            }
        }
    }
}

@Composable
fun DoneScreen(title: String, note: String, onPlans: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("Done", fontSize = 20.sp, color = Acc)
        Text(title, fontSize = 13.sp, color = Txt, textAlign = TextAlign.Center)
        Text(note, fontSize = 11.sp, color = Mut, textAlign = TextAlign.Center)
        Button(onClick = onPlans, modifier = Modifier.padding(top = 8.dp)) { Text("Plans") }
    }
}

@Composable
fun SettingsScreen(autoOn: Boolean, onToggle: (Boolean) -> Unit, onUnpair: () -> Unit, onBack: () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 14.dp, vertical = 22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("Settings", color = Acc, fontSize = 12.sp)
        Button(
            onClick = { onToggle(!autoOn) },
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
            colors = ButtonDefaults.buttonColors(backgroundColor = if (autoOn) Acc else Card2)
        ) {
            Text("Auto-detect sets: " + if (autoOn) "On" else "Off", fontSize = 12.sp, color = if (autoOn) Ink else Txt)
        }
        Text("Off by default. Check each set logs a set after 3 reps and a short stillness.", fontSize = 10.sp, color = Mut, textAlign = TextAlign.Center)
        Button(onClick = onUnpair, modifier = Modifier.padding(top = 6.dp), colors = ButtonDefaults.buttonColors(backgroundColor = Card2)) {
            Text("Unpair", color = Txt)
        }
        Button(onClick = onBack, modifier = Modifier.padding(top = 4.dp)) { Text("Back") }
    }
}
