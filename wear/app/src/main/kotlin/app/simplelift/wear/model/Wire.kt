package app.simplelift.wear.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }

@Serializable
data class WireSet(
    val w: Double = 0.0,
    val r: Double = 0.0,
    val d: Int = 0,
    val u: String? = null,
    val v: Double? = null
)

@Serializable
data class WireEx(val n: String = "", val rest: Int = 0, val s: List<WireSet> = emptyList())

@Serializable
data class WireSnap(
    val t: String = "snap",
    val id: String = "",
    val rev: Int = 0,
    val src: String = "",
    val at: Long = 0,
    val mode: String = "set",
    val day: Int = 0,
    val name: String = "",
    val plan: String = "",
    val code: String = "",
    val idx: Int = 0,
    val ord: List<Int> = emptyList(),
    val rest: Long = 0,
    val restTotal: Int = 0,
    val fin: Int = 0,
    val drop: Int = 0,
    val auto: Int? = null,
    val ex: List<WireEx> = emptyList()
) {
    fun text(): String = json.encodeToString(WireSnap.serializer(), this)

    companion object {
        fun parse(raw: String): WireSnap? = try {
            json.decodeFromString(WireSnap.serializer(), raw)
        } catch (e: Exception) {
            null
        }
    }
}

data class ExactLoad(val name: String, val unit: String, val value: Double)

data class PlanDay(
    val name: String,
    val code: String,
    val rest: Boolean,
    val today: Boolean,
    val planId: String,
    val day: Int,
    val planName: String,
    val exact: List<ExactLoad> = emptyList()
)

data class RemoteWorkout(
    val days: List<PlanDay>,
    val checkMode: CheckMode?,
    val autoDetect: Boolean?,
    val watchSettings: WatchSettings? = null
)

data class PairTicket(val code: String, val expiresIn: Int)

sealed interface PairPoll {
    data object Pending : PairPoll
    data class Claimed(val token: String) : PairPoll
    data object Expired : PairPoll
    data object Missing : PairPoll
}

data class LiveBody(val snap: WireSnap?, val checkMode: CheckMode?, val autoDetect: Boolean?)

object Payloads {
    fun pairTicket(body: String): PairTicket? {
        val obj = objectOf(body) ?: return null
        val code = text(obj, "code") ?: return null
        if (!code.matches(Regex("\\d{6}"))) return null
        return PairTicket(code, int(obj, "expiresIn") ?: 600)
    }

    fun pairPoll(status: Int, body: String): PairPoll {
        if (status == 404) return PairPoll.Missing
        val obj = objectOf(body) ?: return PairPoll.Missing
        return when (text(obj, "status")) {
            "claimed" -> {
                val token = text(obj, "token").orEmpty()
                if (token.isBlank()) PairPoll.Pending else PairPoll.Claimed(token)
            }
            "expired" -> PairPoll.Expired
            "pending" -> PairPoll.Pending
            else -> PairPoll.Missing
        }
    }

    fun live(body: String): LiveBody {
        val obj = objectOf(body) ?: return LiveBody(null, null, null)
        val snap = obj["snap"]?.let { el ->
            if (el is JsonObject) WireSnap.parse(el.toString()) else null
        }
        return LiveBody(snap, mode(obj), bool(obj, "autoDetectSets") ?: snap?.auto?.let { it != 0 })
    }

    fun plans(body: String): RemoteWorkout {
        val obj = objectOf(body) ?: return RemoteWorkout(emptyList(), null, null)
        val days = ArrayList<PlanDay>()
        obj["plans"]?.jsonArray?.forEach { planEl ->
            val plan = planEl.jsonObject
            val planId = text(plan, "id").orEmpty()
            val planName = text(plan, "name").orEmpty()
            plan["days"]?.jsonArray?.forEachIndexed { index, dayEl ->
                val day = dayEl.jsonObject
                val code = text(day, "code").orEmpty()
                if (code.isBlank()) return@forEachIndexed
                days.add(
                    PlanDay(
                        name = text(day, "name").orEmpty().ifBlank { "Workout" },
                        code = code,
                        rest = bool(day, "rest") == true,
                        today = bool(day, "today") == true,
                        planId = text(day, "planId") ?: planId,
                        day = int(day, "day") ?: index,
                        planName = planName,
                        exact = exactLoads(day)
                    )
                )
            }
        }
        obj["today"]?.jsonObject?.let { today ->
            val code = text(today, "code").orEmpty()
            if (code.isNotBlank() && days.none { it.code == code && it.today }) {
                days.add(
                    0,
                    PlanDay(
                        name = text(today, "name").orEmpty().ifBlank { "Today" },
                        code = code,
                        rest = false,
                        today = true,
                        planId = text(today, "planId").orEmpty(),
                        day = int(today, "day") ?: 0,
                        planName = "",
                        exact = exactLoads(today)
                    )
                )
            }
        }
        val single = text(obj, "code")
        if (days.isEmpty() && !single.isNullOrBlank()) {
            val parsed = Codes.parse(single)
            days.add(
                PlanDay(
                    name = parsed?.title ?: "Today",
                    code = single,
                    rest = false,
                    today = true,
                    planId = "",
                    day = 0,
                    planName = ""
                )
            )
        }
        val settings = nestedSettings(obj)
        val auto = settings?.autoDetectSets ?: bool(obj, "autoDetectSets")
        return RemoteWorkout(days, mode(obj), auto, settings)
    }

    /** Nested watchSettings from GET /watch/workout, GET /watch/plans, or POST /watch/settings. */
    fun settingsOf(body: String): WatchSettings? {
        val obj = objectOf(body) ?: return null
        return nestedSettings(obj)
    }

    fun message(raw: String): Incoming? {
        val obj = objectOf(raw) ?: return null
        val kind = text(obj, "t").orEmpty()
        return when (kind) {
            "hello" -> Incoming.Hello
            "pair" -> text(obj, "code")?.let { Incoming.Pair(it) }
            "settings" -> Incoming.Settings(watchSettings(obj))
            "snap", "" -> WireSnap.parse(raw)?.let { Incoming.Snap(it) }
            else -> if (obj["ex"] != null) WireSnap.parse(raw)?.let { Incoming.Snap(it) } else null
        }
    }

    private fun objectOf(raw: String): JsonObject? = try {
        json.parseToJsonElement(raw).jsonObject
    } catch (e: Exception) {
        null
    }

    private fun text(obj: JsonObject, key: String): String? = obj[key]?.jsonPrimitive?.contentOrNull

    private fun int(obj: JsonObject, key: String): Int? = obj[key]?.jsonPrimitive?.intOrNull

    private fun long(obj: JsonObject, key: String): Long? = obj[key]?.jsonPrimitive?.longOrNull

    private fun bool(obj: JsonObject, key: String): Boolean? = obj[key]?.jsonPrimitive?.booleanOrNull

    private fun nestedSettings(obj: JsonObject): WatchSettings? {
        val nested = obj["watchSettings"] ?: return null
        if (nested !is JsonObject) return null
        return watchSettings(nested)
    }

    private fun watchSettings(obj: JsonObject): WatchSettings {
        return WatchSettings(
            rev = long(obj, "rev") ?: 0L,
            chime = bool(obj, "chime") ?: true,
            vibration = bool(obj, "vibration") ?: true,
            autoDetectSets = bool(obj, "autoDetectSets") ?: false,
            showHr = bool(obj, "showHr") ?: true,
            repDetect = bool(obj, "repDetect") ?: true,
            saveActivity = bool(obj, "saveActivity") ?: true,
            restAlert = int(obj, "restAlert") ?: 0
        )
    }

    private fun exactLoads(day: JsonObject): List<ExactLoad> {
        val fallback = text(day, "u")
        val rows = day["ex"] as? JsonArray ?: return emptyList()
        val out = ArrayList<ExactLoad>()
        rows.forEach { el ->
            if (el !is JsonObject) return@forEach
            val name = text(el, "n").orEmpty()
            val unit = text(el, "u") ?: fallback
            val value = el["v"]?.jsonPrimitive?.doubleOrNull
            if (name.isNotBlank() && (unit == "kg" || unit == "lb") && value != null && !value.isNaN()) {
                out.add(ExactLoad(name, unit, value))
            }
        }
        return out
    }

    private fun mode(obj: JsonObject): CheckMode? {
        val raw = text(obj, "checkMode") ?: return null
        return if (raw == "set" || raw == "exercise" || raw == "none") CheckMode.norm(raw) else null
    }
}

sealed interface Incoming {
    data object Hello : Incoming
    data class Pair(val code: String) : Incoming
    data class Settings(val settings: WatchSettings) : Incoming
    data class Snap(val snap: WireSnap) : Incoming
}

/** Hide the heart-rate chip when Health Services has no usable reading. */
fun displayBpm(value: Double?): Int? {
    if (value == null || value.isNaN()) return null
    val bpm = value.toInt()
    if (bpm <= 0 || bpm > 250) return null
    return bpm
}
