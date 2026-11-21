package app.simplelift.wear

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import app.simplelift.wear.data.ApiClient
import app.simplelift.wear.data.HeartRateMonitor
import app.simplelift.wear.data.MotionFeed
import app.simplelift.wear.data.TokenStore
import app.simplelift.wear.data.WearBus
import app.simplelift.wear.data.WearLink
import app.simplelift.wear.model.Incoming
import app.simplelift.wear.model.Payloads
import app.simplelift.wear.ui.Bg
import app.simplelift.wear.ui.DoneScreen
import app.simplelift.wear.ui.HeartChip
import app.simplelift.wear.ui.PairScreen
import app.simplelift.wear.ui.PlansScreen
import app.simplelift.wear.ui.SettingsScreen
import app.simplelift.wear.ui.WearTheme
import app.simplelift.wear.ui.WorkoutScreen
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val store by lazy { TokenStore(this) }
    private val heart by lazy { HeartRateMonitor(this) }
    private val motion by lazy { MotionFeed(this) }
    private val controller by lazy { WearController(store, ApiClient(), WearLink(this)) }
    private var frame by mutableIntStateOf(0)
    private val sensorPermission = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        if (controller.ui.screen == Screen.Workout) lifecycleScope.launch { heart.start() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        controller.onChange = { frame += 1 }
        controller.onWorkout = { running -> if (running) beginWorkout() else endWorkout() }
        controller.onMotionWanted = { want -> if (want) motion.start() else motion.stop() }
        motion.onSample = { controller.onMotion(it) }
        WearBus.listener = { json ->
            controller.onWear(json)
            if (Payloads.message(json) is Incoming.Hello) lifecycleScope.launch { controller.replyHello() }
        }
        WearBus.drain()
        val preview = if (BuildConfig.DEBUG) intent.getStringExtra("preview") else null
        if (preview != null) controller.preview(preview)
        val seeded = if (BuildConfig.DEBUG) intent.getIntExtra("bpm", 0) else 0
        if (seeded > 0) controller.bpm(seeded)
        setContent {
            frame.let { }
            val ui = controller.ui
            WearTheme {
                Box(Modifier.fillMaxSize().background(Bg)) {
                    when (ui.screen) {
                        Screen.Pair -> PairScreen(ui.pairCode, ui.pairNote, { controller.retryPair() }, { controller.skipPair() })
                        Screen.Plans -> PlansScreen(ui.days, ui.syncNote, { controller.openDay(it) }, { controller.showSettings() })
                        Screen.Workout -> ui.session?.let { session ->
                            WorkoutScreen(
                                session, ui.nowSec,
                                { controller.cycleMode() },
                                { controller.toggleSet(it) },
                                { controller.toggleExercise() },
                                { controller.startRest() },
                                { controller.shift(-1) },
                                { controller.shift(1) },
                                { lifecycleScope.launch { controller.finish() }; Unit },
                                { controller.undo() }
                            )
                        }
                        Screen.Done -> DoneScreen(ui.session?.title ?: "Workout", ui.syncNote) {
                            controller.showPlans()
                            lifecycleScope.launch { controller.refreshPlans() }
                            Unit
                        }
                        Screen.Settings -> SettingsScreen(ui.autoOn, { controller.toggleAuto(it) }, { controller.unpair() }, { controller.backFromSettings() })
                    }
                    val bpm = ui.bpm
                    if (ui.screen == Screen.Workout && ui.showHr && bpm != null) {
                        HeartChip(bpm, Modifier.align(Alignment.TopCenter).padding(top = 4.dp))
                    }
                }
            }
        }
        lifecycleScope.launch {
            while (true) {
                delay(1000)
                controller.bpm(heart.bpm ?: controller.ui.bpm)
            }
        }
        lifecycleScope.launch { controller.start(WearController.modelName()) }
    }

    override fun onDestroy() {
        WearBus.listener = null
        controller.stop()
        motion.stop()
        super.onDestroy()
    }

    private fun beginWorkout() {
        val missing = SENSOR_PERMS.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) sensorPermission.launch(missing.toTypedArray())
        WorkoutService.start(this)
        lifecycleScope.launch { heart.start() }
    }

    private fun endWorkout() {
        motion.stop()
        lifecycleScope.launch { heart.stop() }
        WorkoutService.stop(this)
    }

    companion object {
        private val SENSOR_PERMS = arrayOf(Manifest.permission.BODY_SENSORS, Manifest.permission.ACTIVITY_RECOGNITION)
    }
}
