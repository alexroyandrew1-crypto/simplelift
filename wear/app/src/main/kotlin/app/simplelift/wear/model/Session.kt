package app.simplelift.wear.model

data class UndoMark(val ex: Int, val set: Int, val reps: Int, val untilMs: Long)

/**
 * One workout on the watch. Updates return a new copy.
 * Rest end time is epoch seconds, the same field the phone stores as `rest`.
 */
data class Session(
    val id: String,
    val rev: Int,
    val title: String,
    val code: String,
    val planId: String,
    val day: Int,
    val mode: CheckMode,
    val exercises: List<LiftEx>,
    val index: Int,
    val restUntil: Long,
    val restTotal: Int,
    val finished: Boolean,
    val startedAt: Long,
    val undo: UndoMark?,
    val autoBlockUntilMs: Long,
    val result: String
) {
    fun restLeft(nowSec: Long): Int = if (restUntil > nowSec) (restUntil - nowSec).toInt() else 0

    fun resting(nowSec: Long): Boolean = restLeft(nowSec) > 0

    fun current(): LiftEx? = exercises.getOrNull(index)

    fun openSet(): Int {
        val ex = current() ?: return -1
        return ex.sets.indexOfFirst { !it.done }
    }

    fun toggleSet(ex: Int, set: Int, nowSec: Long): Session {
        val row = exercises.getOrNull(ex)?.sets?.getOrNull(set) ?: return this
        return if (row.done) {
            edit(ex, set) { it.copy(done = false) }.bump()
        } else {
            edit(ex, set) { it.copy(done = true) }.startRest(ex, nowSec).copy(index = ex).bump()
        }
    }

    /** Exercise check logs every set and does not start rest. Unchecking stops rest. */
    fun toggleExercise(ex: Int, nowSec: Long): Session {
        val rows = exercises.getOrNull(ex)?.sets ?: return this
        val all = rows.isNotEmpty() && rows.all { it.done }
        val next = if (all) rows.map { it.copy(done = false) } else rows.map { it.copy(done = true) }
        var updated = replace(ex, exercises[ex].copy(sets = next)).copy(index = ex)
        if (all) updated = updated.copy(restUntil = 0, restTotal = 0)
        return updated.bump()
    }

    fun manualRest(ex: Int, nowSec: Long): Session = startRest(ex, nowSec).copy(index = ex).bump()

    fun cycleMode(): Session = copy(mode = CheckMode.cycle(mode)).bump()

    fun clearRestIfEnded(nowSec: Long): Session {
        if (restUntil == 0L || restUntil > nowSec) return this
        val next = nextOpen(index)
        return copy(restUntil = 0, restTotal = 0, index = next)
    }

    fun logDetected(ex: Int, set: Int, detected: Int, useDetected: Boolean, nowSec: Long, nowMs: Long): Session {
        val row = exercises.getOrNull(ex)?.sets?.getOrNull(set) ?: return this
        val reps = if (useDetected && detected != row.reps) detected.coerceIn(1, 99) else row.reps
        val marked = edit(ex, set) { it.copy(reps = reps, done = true) }.startRest(ex, nowSec).copy(index = ex)
        if (marked.allDone()) return marked.finish(nowSec)
        return marked.copy(undo = UndoMark(ex, set, row.reps, nowMs + AutoSession.AUTO_UNDO_MS)).bump()
    }

    fun undo(nowMs: Long): Session {
        val mark = undo ?: return this
        val row = exercises.getOrNull(mark.ex)?.sets?.getOrNull(mark.set) ?: return copy(undo = null)
        return edit(mark.ex, mark.set) { row.copy(reps = mark.reps, done = false) }
            .copy(
                undo = null,
                restUntil = 0,
                restTotal = 0,
                index = mark.ex,
                autoBlockUntilMs = nowMs + AutoSession.AUTO_DEBOUNCE_S * 1000L
            )
            .bump()
    }

    fun dropUndo(nowMs: Long): Session {
        val mark = undo ?: return this
        if (nowMs < mark.untilMs) return this
        return copy(undo = null)
    }

    fun finish(nowSec: Long): Session {
        val filled = if (mode == CheckMode.None) markAll() else this
        return filled.copy(
            finished = true,
            restUntil = 0,
            restTotal = 0,
            undo = null,
            result = Codes.resultCode(filled.title, filled.exercises),
            rev = rev + 1
        )
    }

    fun toWire(nowSec: Long, autoOn: Boolean): WireSnap {
        return WireSnap(
            t = "snap",
            id = id,
            rev = rev,
            src = "w",
            at = nowSec,
            mode = mode.wire(),
            day = day,
            name = title,
            plan = planId,
            code = code,
            idx = index,
            ord = exercises.indices.toList(),
            rest = if (resting(nowSec)) restUntil else 0,
            restTotal = if (resting(nowSec)) restTotal else 0,
            fin = if (finished) 1 else 0,
            drop = 0,
            auto = if (autoOn) 1 else 0,
            ex = exercises.map { ex ->
                WireEx(
                    n = ex.name,
                    rest = ex.restSec,
                    s = ex.sets.map { WireSet(it.weightLb.toDouble(), it.reps.toDouble(), if (it.done) 1 else 0, it.unit, it.exact) }
                )
            }
        )
    }

    fun applyWire(snap: WireSnap, selfSrc: String, nowSec: Long): Session? {
        if (!wins(this, snap, selfSrc)) return null
        if (snap.drop == 1) return null
        val rows = snap.ex.map { ex ->
            LiftEx(
                name = ex.n,
                restSec = ex.rest,
                sets = ex.s.map { setOf(it) }
            )
        }
        if (rows.isEmpty()) return null
        val merged = copy(
            rev = snap.rev,
            mode = CheckMode.norm(snap.mode),
            exercises = rows,
            index = snap.idx.coerceIn(0, rows.lastIndex),
            restUntil = snap.rest,
            restTotal = snap.restTotal,
            code = snap.code.ifBlank { code },
            title = snap.name.ifBlank { title },
            planId = snap.plan.ifBlank { planId },
            day = snap.day
        )
        return if (snap.fin == 1) merged.copy(finished = true, result = Codes.resultCode(merged.title, merged.exercises)) else merged
    }

    private fun startRest(ex: Int, nowSec: Long): Session {
        val rest = exercises.getOrNull(ex)?.restSec ?: 0
        if (rest <= 0) return copy(restUntil = 0, restTotal = 0)
        return copy(restTotal = rest, restUntil = nowSec + rest)
    }

    private fun edit(ex: Int, set: Int, block: (LiftSet) -> LiftSet): Session {
        val rows = exercises.getOrNull(ex)?.sets?.toMutableList() ?: return this
        rows[set] = block(rows[set])
        return replace(ex, exercises[ex].copy(sets = rows))
    }

    private fun replace(ex: Int, next: LiftEx): Session {
        val copy = exercises.toMutableList()
        copy[ex] = next
        return copy(exercises = copy)
    }

    private fun markAll(): Session {
        val next = exercises.map { ex -> ex.copy(sets = ex.sets.map { it.copy(done = true) }) }
        return copy(exercises = next)
    }

    private fun allDone(): Boolean = exercises.all { ex -> ex.sets.all { it.done } }

    private fun nextOpen(from: Int): Int {
        for (i in (from + 1) until exercises.size) {
            if (exercises[i].sets.any { !it.done }) return i
        }
        return from
    }

    private fun bump(): Session = copy(rev = rev + 1)

    companion object {
        fun fromParsed(parsed: ParsedWorkout, planId: String, day: Int, id: String, nowSec: Long, mode: CheckMode? = null): Session {
            return Session(
                id = id,
                rev = 1,
                title = parsed.title,
                code = parsed.code,
                planId = planId,
                day = day,
                mode = mode ?: parsed.mode,
                exercises = parsed.exercises,
                index = 0,
                restUntil = 0,
                restTotal = 0,
                finished = false,
                startedAt = nowSec,
                undo = null,
                autoBlockUntilMs = 0,
                result = ""
            )
        }

        /** Keep `u`/`v` when the phone sent them. An older snapshot has only whole pounds in `w`. */
        fun setOf(set: WireSet): LiftSet {
            val unit = if (set.u == "kg" || set.u == "lb") set.u else null
            val exact = if (unit != null && set.v != null && !set.v.isNaN()) set.v else null
            return LiftSet(set.w.toInt(), set.r.toInt(), set.d != 0, unit, exact)
        }

        /** Last-rev wins, matching live.js LiveSnap.wins. A missing session accepts a non-drop snap. */
        fun wins(local: Session?, snap: WireSnap, selfSrc: String): Boolean {
            if (snap.t.isNotBlank() && snap.t != "snap") return false
            if (snap.id.isBlank()) return false
            if (local == null) return snap.drop == 0
            if (snap.src == selfSrc && snap.id == local.id && snap.rev <= local.rev) return false
            if (snap.id != local.id) return snap.at >= local.startedAt
            return snap.rev > local.rev
        }
    }
}
