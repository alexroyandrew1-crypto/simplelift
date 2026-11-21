package app.simplelift.wear.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.ExperimentalWearFoundationApi
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.itemsIndexed
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.foundation.rotary.RotaryScrollableDefaults
import androidx.wear.compose.foundation.rotary.rotaryScrollable
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
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
        Chip(
            onClick = if (code == null) onRetry else onSkip,
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
            colors = ChipDefaults.primaryChipColors(),
            label = { Text(if (code == null) "Retry" else "Not now", textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
        )
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

@OptIn(ExperimentalWearFoundationApi::class)
@Composable
fun WorkoutScreen(
    session: Session,
    nowSec: Long,
    connected: Boolean,
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
    val listState = rememberScalingLazyListState()
    val focusRequester = remember { FocusRequester() }
    Box(Modifier.fillMaxSize()) {
        DrainBorder(left, session.restTotal)
        ScalingLazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .rotaryScrollable(RotaryScrollableDefaults.behavior(listState), focusRequester)
                .focusRequester(focusRequester),
            state = listState,
            contentPadding = PaddingValues(top = 26.dp, bottom = 18.dp, start = 16.dp, end = 16.dp),
            autoCentering = null,
            verticalArrangement = Arrangement.spacedBy(4.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            item {
                Text(if (connected) "Connected" else "Not connected", fontSize = 10.sp, color = if (connected) Acc else Mut)
            }
            item {
                Text(session.mode.label(), fontSize = 11.sp, color = Acc, modifier = Modifier.clickable(onClick = onMode))
            }
            item {
                Text(
                    ex?.name ?: session.title,
                    fontSize = 13.sp,
                    color = Txt,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 16.sp
                )
            }
            if (ex != null) item { Text(Codes.repLine(ex), fontSize = 11.sp, color = Mut, textAlign = TextAlign.Center) }
            if (ex != null && session.mode == CheckMode.Set) {
                itemsIndexed(ex.sets) { index, row ->
                    val mark = if (row.done) "✓ " else ""
                    SetRow("$mark${index + 1}  ${row.weightLb} lb × ${row.reps}", row.done) { onSet(index) }
                }
            }
            if (ex != null && session.mode == CheckMode.Exercise) {
                item {
                    val all = ex.sets.all { it.done }
                    SetRow(if (all) "Exercise done" else "Check exercise", all, onExercise)
                }
            }
            if (session.mode != CheckMode.Set) item { SetRow("Start rest", false, onRest) }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(Modifier.weight(1f)) { SetRow("Prev", false, onPrev) }
                    Box(Modifier.weight(1f)) { SetRow("Next", false, onNext) }
                }
            }
            item { SetRow("Finish", true, onFinish) }
        }
        if (session.undo != null) {
            Button(onClick = onUndo, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp)) {
                Text("Undo", fontSize = 12.sp)
            }
        }
    }
    LaunchedEffect(Unit) {
        try { focusRequester.requestFocus() } catch (e: Exception) { }
    }
}

@Composable
private fun SetRow(label: String, done: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(28.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (done) Acc else Card2)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(label, fontSize = 12.sp, color = if (done) Ink else Txt, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
