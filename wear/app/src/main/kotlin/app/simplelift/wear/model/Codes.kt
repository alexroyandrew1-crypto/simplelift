package app.simplelift.wear.model

/** One set as the watch stores it. Weights are whole pounds, matching SL1 and the phone. */
data class LiftSet(val weightLb: Int, val reps: Int, val done: Boolean)

data class LiftEx(val name: String, val restSec: Int, val sets: List<LiftSet>)

data class ParsedWorkout(
    val title: String,
    val mode: CheckMode,
    val exercises: List<LiftEx>,
    val code: String
)

/**
 * SL1 and SR1, the same codes the phone and the Garmin app already exchange.
 * SL1~Title~Name,sets,reps,weightLb,restSec~...~#set|exercise|none
 * SR1~Title~N@w1/w2~...
 */
object Codes {
    fun parse(code: String?): ParsedWorkout? {
        if (code.isNullOrBlank()) return null
        val parts = code.split('~')
        if (parts.size < 3 || parts[0] != "SL1") return null
        var mode = CheckMode.Set
        val exercises = ArrayList<LiftEx>()
        for (i in 2 until parts.size) {
            val part = parts[i]
            if (part.length > 1 && part.startsWith("#")) {
                mode = CheckMode.norm(part.substring(1))
                continue
            }
            val fields = part.split(',')
            if (fields.size < 2) continue
            val sets = fields[1].toIntOrNull()?.coerceIn(1, 10) ?: 3
            val reps = perSet(if (fields.size > 2) fields[2] else "10", sets, 10)
            val weights = perSet(if (fields.size > 3) fields[3] else "0", sets, 0)
            val rest = if (fields.size > 4) fields[4].toIntOrNull() ?: 90 else 90
            val rows = (0 until sets).map { k -> LiftSet(weights[k], reps[k], false) }
            exercises.add(LiftEx(fields[0], rest, rows))
        }
        if (exercises.isEmpty()) return null
        return ParsedWorkout(parts[1], mode, exercises, code)
    }

    fun resultCode(title: String, exercises: List<LiftEx>): String {
        val body = exercises.joinToString("~") { ex ->
            val done = ex.sets.count { it.done }
            val weights = ex.sets.map { it.weightLb }
            val wt = if (weights.distinct().size <= 1) {
                (weights.firstOrNull() ?: 0).toString()
            } else {
                weights.joinToString("/")
            }
            "$done@$wt"
        }
        return "SR1~$title~$body"
    }

    fun repLine(ex: LiftEx): String {
        val reps = ex.sets.map { it.reps }
        val repTxt = if (reps.isEmpty()) "0" else if (reps.min() == reps.max()) "${reps.first()}" else "${reps.min()}–${reps.max()}"
        return "$repTxt reps · rest ${clock(ex.restSec)}"
    }

    fun clock(seconds: Int): String {
        val s = seconds.coerceAtLeast(0)
        return "${s / 60}:${(s % 60).toString().padStart(2, '0')}"
    }

    private fun perSet(raw: String, sets: Int, fallback: Int): List<Int> {
        val parts = raw.split('/').map { it.toIntOrNull() ?: fallback }
        if (parts.isEmpty()) return List(sets) { fallback }
        return List(sets) { k -> parts[k.coerceAtMost(parts.lastIndex)] }
    }
}
