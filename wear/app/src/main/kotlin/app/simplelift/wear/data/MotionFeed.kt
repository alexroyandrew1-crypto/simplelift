package app.simplelift.wear.data

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import app.simplelift.wear.model.RepDetector

/** 25 Hz accelerometer. Magnitudes are milli-g so they match the Garmin thresholds. */
class MotionFeed(context: Context) : SensorEventListener {
    private val sensors = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accel = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    var onSample: ((Double) -> Unit)? = null
    private var running = false

    fun start() {
        if (running || accel == null) return
        running = sensors.registerListener(this, accel, SAMPLE_US, Handler(Looper.getMainLooper()))
    }

    fun stop() {
        if (!running) return
        sensors.unregisterListener(this)
        running = false
    }

    override fun onSensorChanged(event: SensorEvent) {
        val v = event.values
        if (v.size < 3) return
        onSample?.invoke(RepDetector.milliG(v[0], v[1], v[2]).toDouble())
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    companion object {
        private const val SAMPLE_US = 40_000
    }
}
