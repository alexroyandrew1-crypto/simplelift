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
import androidx.compose.runtime.CompositionLocalProvider
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
import androidx.wear.compose.foundation.LocalReduceMotion
import androidx.wear.compose.foundation.ReduceMotion
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.foundation.rotary.RotaryScrollableDefaults
import androidx.wear.compose.foundation.rotary.rotaryScrollable
import androidx.wear.compose.material.Text
import app.simplelift.wear.DrainBorder
import app.simplelift.wear.model.CheckMode
import app.simplelift.wear.model.Codes
import app.simplelift.wear.model.PlanDay
import app.simplelift.wear.model.Session

@Composable
fun HeartChip(bpm: Int, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Canvas(Modifier.padding(end = 2.dp).size(width = 9.dp, height = 8.dp)) {
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
        Text("$bpm", fontSize = 10.sp, color = Txt)
    }
}

@Composable
fun PairScreen(code: String?, note: String, onRetry: () -> Unit, onSkip: () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("CONFIRM ON PHONE", fontSize = 9.sp, color = Acc)
        val shown = if (code != null && code.length == 6) code.take(3) + " " + code.drop(3) else "······"
        Text(shown, fontSize = 22.sp, color = Txt, textAlign = TextAlign.Center)
        Text(note, fontSize = 10.sp, color = Mut, textAlign = TextAlign.Center)
        Text("Settings → Watch → Samsung Galaxy Watch", fontSize = 9.sp, color = Mut, textAlign = TextAlign.Center)
        Box(Modifier.fillMaxWidth().padding(top = 4.dp)) {
            SetRow(if (code == null) "Retry" else "Not now", true, if (code == null) onRetry else onSkip)
        }
    }
}

@Composable
fun PlansScreen(days: List<PlanDay>, note: String, onOpen: (Int) -> Unit, onSettings: () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        Text("Simple Lift", color = Acc, fontSize = 11.sp)
        if (days.isEmpty()) {
            Text("No workout yet", color = Txt, fontSize = 12.sp, textAlign = TextAlign.Center)
            Text("Sign in on your phone, then pair this watch.", color = Mut, fontSize = 10.sp, textAlign = TextAlign.Center)
        }
        days.forEachIndexed { index, day ->
            if (day.rest) return@forEachIndexed
            SetRow((if (day.today) "Today · " else "") + day.name, day.today) { onOpen(index) }
        }
        if (note.isNotBlank()) Text(note, fontSize = 9.sp, color = Mut, textAlign = TextAlign.Center)
        SetRow("Settings", false, onSettings)
    }
}

@OptIn(ExperimentalWearFoundationApi::class)
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
    val listState = rememberScalingLazyListState()
    val focusRequester = remember { FocusRequester() }
    val reduceMotion = remember {
        object : ReduceMotion {
            @Composable
            override fun enabled(): Boolean = false
        }
    }
    Box(Modifier.fillMaxSize()) {
        DrainBorder(left, session.restTotal)
        CompositionLocalProvider(LocalReduceMotion provides reduceMotion) {
        ScalingLazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .rotaryScrollable(RotaryScrollableDefaults.behavior(listState), focusRequester)
                .focusRequester(focusRequester),
            state = listState,
            contentPadding = PaddingValues(top = 18.dp, bottom = 12.dp, start = 20.dp, end = 20.dp),
            autoCentering = null,
            verticalArrangement = Arrangement.spacedBy(3.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            item {
                Text(session.mode.label(), fontSize = 10.sp, color = Acc, modifier = Modifier.clickable(onClick = onMode))
            }
            item {
                Text(
                    ex?.name ?: session.title,
                    fontSize = 12.sp,
                    color = Txt,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 14.sp
                )
            }
            if (ex != null) item { Text(Codes.repLine(ex), fontSize = 10.sp, color = Mut, textAlign = TextAlign.Center) }
            if (ex != null && session.mode == CheckMode.Set) {
                items(ex.sets.indices.chunked(2)) { indexes ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        indexes.forEach { index ->
                            val row = ex.sets[index]
                            val mark = if (row.done) "✓ " else ""
                            Box(Modifier.weight(1f)) {
                                SetRow("$mark${row.reps}×${row.weightLb}", row.done) { onSet(index) }
                            }
                        }
                        if (indexes.size == 1) Box(Modifier.weight(1f)) {}
                    }
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
        }
        if (session.undo != null) {
            Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 6.dp).fillMaxWidth(0.46f)) {
                SetRow("Undo", true, onUndo)
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
            .height(22.dp)
            .clip(RoundedCornerShape(11.dp))
            .background(if (done) Acc else Card2)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(label, fontSize = 11.sp, color = if (done) Ink else Txt, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun DoneScreen(title: String, note: String, onPlans: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("Done", fontSize = 16.sp, color = Acc)
        Text(title, fontSize = 12.sp, color = Txt, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(note, fontSize = 10.sp, color = Mut, textAlign = TextAlign.Center)
        Box(Modifier.fillMaxWidth().padding(top = 4.dp)) { SetRow("Plans", true, onPlans) }
    }
}

@Composable
fun SettingsScreen(autoOn: Boolean, onToggle: (Boolean) -> Unit, onUnpair: () -> Unit, onBack: () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp, Alignment.CenterVertically)
    ) {
        Text("Settings", color = Acc, fontSize = 11.sp)
        SetRow("Auto-detect sets: " + if (autoOn) "On" else "Off", autoOn) { onToggle(!autoOn) }
        Text("Off by default. Logs a set after 3 reps and a short stillness.", fontSize = 9.sp, color = Mut, textAlign = TextAlign.Center)
        SetRow("Unpair", false, onUnpair)
        SetRow("Back", true, onBack)
    }
}
