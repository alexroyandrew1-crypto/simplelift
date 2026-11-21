package app.simplelift.wear.model

import kotlin.math.sqrt

/**
 * Wrist-accelerometer rep detector. Port of garmin/source/RepDetector.mc.
 * Samples are magnitude in milli-g (Android m/s² is converted by [milliG]).
 * A rep is a rise above HI, at least MIN_GAP samples after the previous one,
 * re-armed only after the signal falls below LO. Two peaks inside the gap
 * mute the sequence as walking.
 */
class RepDetector {
    var count: Int = 0
    var lastRepAt: Int = -100000
    var n: Int = 0
    var base: Double = 1000.0
    var signal: Double = 0.0
    var armed: Boolean = true
    var fast: Int = 0
    var mutedUntil: Int = 0
    val events: MutableList<Int> = mutableListOf()
    var onEvent: ((Int) -> Unit)? = null

    fun reset() {
        count = 0
        fast = 0
    }

    fun sample(mag: Double) {
        n += 1
        if (n == 1) base = mag
        base += A_BASE * (mag - base)
        signal += A_SMOOTH * ((mag - base) - signal)
        if (count > 0 && n - lastRepAt > IDLE) {
            count = 0
            fast = 0
            emit(0)
        }
        if (n < mutedUntil) {
            armed = signal < LO
            return
        }
        if (armed && signal > HI) {
            armed = false
            if (n - lastRepAt >= MIN_GAP) {
                count += 1
                lastRepAt = n
                emit(count)
            } else if (count > 0) {
                fast += 1
                if (fast >= 2) {
                    count = 0
                    fast = 0
                    mutedUntil = n + MUTE
                    emit(0)
                }
            }
        } else if (!armed && signal < LO) {
            armed = true
        }
    }

    fun feed(samples: Iterable<Double>) {
        for (mag in samples) sample(mag)
    }

    private fun emit(value: Int) {
        events.add(value)
        onEvent?.invoke(value)
    }

    companion object {
        const val RATE = 25
        const val HI = 120.0
        const val LO = 30.0
        const val MIN_GAP = 18
        const val IDLE = 200
        const val MUTE = 75
        const val A_BASE = 0.025
        const val A_SMOOTH = 0.35

        /** Android accelerometer is m/s². Garmin thresholds are milli-g, rest ≈ 1000. */
        fun milliG(x: Float, y: Float, z: Float): Float {
            val mag = sqrt(x * x + y * y + z * z)
            return mag / 9.80665f * 1000f
        }
    }
}
