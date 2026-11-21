package app.simplelift.wear.data

import android.content.Context
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseEvent
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import app.simplelift.wear.model.displayBpm
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.ExecutionException

/**
 * Strength session through Health Services. Heart rate is shown only when a sample arrives.
 * Calories are requested so the session is a real strength workout; they are not drawn.
 */
class HeartRateMonitor(context: Context) {
    private val client = HealthServices.getClient(context).exerciseClient
    var bpm: Int? = null
        private set
    var calories: Double? = null
        private set
    private var running = false

    private val callback = object : ExerciseUpdateCallback {
        override fun onRegistered() {}
        override fun onRegistrationFailed(throwable: Throwable) { running = false }
        override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}
        override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {}
        override fun onExerciseEventReceived(event: ExerciseEvent) {}
        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            val sample = update.latestMetrics.getData(DataType.HEART_RATE_BPM).lastOrNull()?.value
            bpm = displayBpm(sample)
            calories = update.latestMetrics.getData(DataType.CALORIES_TOTAL)?.total
        }
    }

    suspend fun start() {
        if (running) return
        client.setUpdateCallback(callback)
        val started = startWith(setOf(DataType.HEART_RATE_BPM, DataType.CALORIES_TOTAL)) ||
            startWith(setOf(DataType.HEART_RATE_BPM))
        running = started
        if (!started) bpm = null
    }

    suspend fun stop() {
        if (!running) return
        running = false
        bpm = null
        withContext(Dispatchers.IO) {
            try {
                client.endExerciseAsync().wait()
            } catch (e: Exception) {
                // Already ended.
            }
            try {
                client.clearUpdateCallbackAsync(callback).wait()
            } catch (e: Exception) {
                // Callback already cleared.
            }
        }
    }

    private suspend fun startWith(types: Set<DataType<*, *>>): Boolean {
        val config = ExerciseConfig.Builder(ExerciseType.STRENGTH_TRAINING)
            .setDataTypes(types)
            .setIsAutoPauseAndResumeEnabled(false)
            .setIsGpsEnabled(false)
            .build()
        return try {
            withContext(Dispatchers.IO) { client.startExerciseAsync(config).wait() }
            true
        } catch (e: Exception) {
            false
        }
    }
}

private fun <T> ListenableFuture<T>.wait(): T {
    return try {
        get()
    } catch (e: ExecutionException) {
        throw e.cause ?: e
    }
}
