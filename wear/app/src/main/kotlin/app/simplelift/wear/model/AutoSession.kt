package app.simplelift.wear.model

/**
 * Auto-detect sets. Port of LiftModel.mc (AUTO_* constants, reliableReps, stillness).
 * Default off. Only Check each set, and only while a set is open.
 * Clock is milliseconds so tests can advance time without sleeping.
 */
class AutoSession(private val nowMs: () -> Long) {
    val detector = RepDetector()
    var enabled: Boolean = false
    var blockUntilMs: Long = 0
    var liveReps: Int = 0
    private var stillDeadline: Long? = null
    private var motionStartN: Int = 0
    private var repBase: Int = 0
    private var setLive: Boolean = false

    fun resetLive() {
        stillDeadline = null
        setLive = false
        liveReps = 0
        repBase = 0
        detector.reset()
    }

    fun feed(samples: Iterable<Double>, world: World): List<Effect> {
        val out = ArrayList<Effect>()
        detector.onEvent = { count -> out.addAll(onRep(count, world)) }
        try {
            for (mag in samples) detector.sample(mag)
        } finally {
            detector.onEvent = null
        }
        out.addAll(poll(world))
        return out
    }

    fun poll(world: World): List<Effect> {
        val deadline = stillDeadline ?: return emptyList()
        if (nowMs() < deadline) return emptyList()
        stillDeadline = null
        if (!shouldAutoLog(world, motionStartN)) return emptyList()
        val detected = if (liveReps > 0) liveReps else detector.count
        resetLive()
        return listOf(Effect.Log(detected, reliableReps(detected, world.plannedReps)))
    }

    fun onUndo(now: Long) {
        resetLive()
        blockUntilMs = now + AUTO_DEBOUNCE_S * 1000L
    }

    private fun onRep(count: Int, world: World): List<Effect> {
        if (world.finished) return emptyList()
        if (count == 0) {
            stillDeadline = null
            repBase = liveReps
            return listOf(Effect.SequenceEnded)
        }
        val out = ArrayList<Effect>()
        if (world.resting) {
            if (count >= 3 && detector.fast == 0 && world.restSpentSec >= REST_MIN_BEFORE_AUTOSTART) {
                out.add(Effect.EndRest)
                setLive = true
                repBase = count
                liveReps = count
                out.add(Effect.Count(count))
            }
        } else if (setLive) {
            liveReps = repBase + count
            out.add(Effect.Count(liveReps))
        } else if (world.setOpen && count >= 2 && detector.fast == 0) {
            setLive = true
            repBase = 0
            liveReps = count
            out.add(Effect.Count(count))
        }
        if (armStill(world)) {
            if (stillDeadline == null) motionStartN = detector.n
            stillDeadline = nowMs() + AUTO_STILL_MS
        }
        return out
    }

    private fun armStill(world: World): Boolean {
        return world.modeSet && enabled && !world.resting && world.setOpen && detector.fast == 0 && !world.finished
    }

    private fun shouldAutoLog(world: World, startN: Int): Boolean {
        return shouldAutoLog(
            enabled = enabled && world.modeSet,
            resting = world.resting,
            setOpen = world.setOpen,
            finished = world.finished,
            fast = detector.fast,
            nowMs = nowMs(),
            blockUntilMs = blockUntilMs,
            liveReps = liveReps,
            detCount = detector.count,
            lastRepAt = detector.lastRepAt,
            motionStartN = startN
        )
    }

    data class World(
        val modeSet: Boolean,
        val resting: Boolean,
        val setOpen: Boolean,
        val finished: Boolean,
        val plannedReps: Int,
        val restSpentSec: Int
    )

    sealed interface Effect {
        data class Count(val reps: Int) : Effect
        data object SequenceEnded : Effect
        data class Log(val detected: Int, val useDetected: Boolean) : Effect
        data object EndRest : Effect
    }

    companion object {
        const val AUTO_MIN_REPS = 3
        const val AUTO_STILL_MS = 3000L
        const val AUTO_MIN_SAMPLES = 36
        const val AUTO_UNDO_MS = 5000L
        const val AUTO_DEBOUNCE_S = 8
        const val AUTO_REPS_MAX = 30
        const val AUTO_REPS_SLACK = 8
        const val REST_MIN_BEFORE_AUTOSTART = 15

        fun reliableReps(detected: Int, planned: Int): Boolean {
            if (detected < AUTO_MIN_REPS || detected > AUTO_REPS_MAX) return false
            if (planned > 0 && detected < (planned * 2) / 5) return false
            if (detected > planned + AUTO_REPS_SLACK) return false
            return true
        }

        fun shouldAutoLog(
            enabled: Boolean,
            resting: Boolean,
            setOpen: Boolean,
            finished: Boolean,
            fast: Int,
            nowMs: Long,
            blockUntilMs: Long,
            liveReps: Int,
            detCount: Int,
            lastRepAt: Int,
            motionStartN: Int
        ): Boolean {
            if (!enabled || resting || !setOpen || finished) return false
            if (fast != 0) return false
            if (nowMs < blockUntilMs) return false
            val detected = if (liveReps > 0) liveReps else detCount
            if (detected < AUTO_MIN_REPS) return false
            if (lastRepAt - motionStartN < AUTO_MIN_SAMPLES) return false
            return true
        }
    }
}
