package app.simplelift.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController

/** Wear OS workout screen for Galaxy Watch. Pairing uses a 6-digit code the phone confirms. */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { SimpleLiftWear() }
    }
}

private enum class WatchKind { Samsung, Garmin, Apple }

private data class SetRow(val weight: Int, val reps: String, val done: Boolean)

private data class Exercise(val name: String, val reps: String, val restSec: Int, val sets: List<SetRow>)

@Composable
private fun SimpleLiftWear() {
    val nav = rememberSwipeDismissableNavController()
    var restLeft by remember { mutableIntStateOf(0) }
    var restTotal by remember { mutableIntStateOf(0) }
    var restToken by remember { mutableIntStateOf(0) }
    LaunchedEffect(restToken) {
        if (restToken == 0) return@LaunchedEffect
        var left = restTotal
        while (left > 0) {
            delay(1000)
            left -= 1
            restLeft = left
        }
    }
    val sample = remember {
        mutableStateOf(
            Exercise(
                name = "Dumbbell Bench Press",
                reps = "8–12",
                restSec = 90,
                sets = listOf(SetRow(30, "8–12", false), SetRow(30, "8–12", false))
            )
        )
    }
    MaterialTheme {
        Box(Modifier.fillMaxSize()) {
            SwipeDismissableNavHost(navController = nav, startDestination = "home") {
                composable("home") {
                    Column(Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Simple Lift")
                        Button(onClick = { nav.navigate("pair") }) { Text("Pair") }
                        Button(onClick = { nav.navigate("workout") }) { Text("Workout") }
                    }
                }
                composable("pair") { PairKinds(onPick = { nav.navigate("code") }) }
                composable("code") { PairCode() }
                composable("workout") {
                    Workout(
                        exercise = sample.value,
                        onCheck = { index ->
                            val next = sample.value.sets.mapIndexed { i, row -> if (i == index) row.copy(done = !row.done) else row }
                            sample.value = sample.value.copy(sets = next)
                            if (next[index].done) {
                                restTotal = sample.value.restSec
                                restLeft = sample.value.restSec
                                restToken += 1
                            }
                        },
                        onRest = {
                            restTotal = sample.value.restSec
                            restLeft = sample.value.restSec
                            restToken += 1
                        }
                    )
                }
            }
            DrainBorder(left = restLeft, total = restTotal)
        }
    }
}

@Composable
private fun PairKinds(onPick: (WatchKind) -> Unit) {
    Column(Modifier.fillMaxSize().padding(8.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Which watch?")
        Button(onClick = { onPick(WatchKind.Samsung) }) { Text("Samsung") }
        Button(onClick = { onPick(WatchKind.Garmin) }) { Text("Garmin") }
        Button(onClick = { onPick(WatchKind.Apple) }) { Text("Apple Watch") }
    }
}

@Composable
private fun PairCode() {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Show this code on the phone")
        Text("482913")
    }
}

@Composable
private fun Workout(exercise: Exercise, onCheck: (Int) -> Unit, onRest: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(10.dp), verticalArrangement = Arrangement.Center) {
        Text(exercise.name)
        Text("${exercise.reps} reps · rest ${exercise.restSec / 60}:${(exercise.restSec % 60).toString().padStart(2, '0')}")
        exercise.sets.forEachIndexed { index, row ->
            Button(onClick = { onCheck(index) }) { Text(if (row.done) "Set ${index + 1} done" else "Check set ${index + 1}") }
        }
        Button(onClick = onRest) { Text("Start rest") }
    }
}
