package app.simplelift.wear

import android.os.Build
import app.simplelift.wear.data.ApiClient
import app.simplelift.wear.data.HttpResult
import app.simplelift.wear.data.TokenStore
import app.simplelift.wear.data.WearLink
import app.simplelift.wear.model.AutoSession
import app.simplelift.wear.model.CheckMode
import app.simplelift.wear.model.Codes
import app.simplelift.wear.model.Incoming
import app.simplelift.wear.model.PairPoll
import app.simplelift.wear.model.Payloads
import app.simplelift.wear.model.PlanDay
import app.simplelift.wear.model.Session
import app.simplelift.wear.model.WireSnap
import kotlinx.coroutines.delay

enum class Screen { Pair, Plans, Workout, Done, Settings }

data class UiState(
    val screen: Screen = Screen.Pair,
    val pairCode: String? = null,
    val pairNote: String = "Getting a code…",
    val days: List<PlanDay> = emptyList(),
    val session: Session? = null,
    val nowSec: Long = 0,
    val nowMs: Long = 0,
    val bpm: Int? = null,
    val autoOn: Boolean = false,
    val syncNote: String = ""
)

/**
 * Pairing, plan load, live sync, and auto-detect. The phone link is preferred;
 * the Worker is used when no phone node is reachable.
 */
class WearController(
    private val store: TokenStore,
    private val api: ApiClient,
    private val link: WearLink,
    private val clock: () -> Long = { System.currentTimeMillis() }
) {
    var ui: UiState = UiState(autoOn = store.autoOn(), nowMs = clock(), nowSec = clock() / 1000)
        private set
    var onChange: () -> Unit = {}
    var onWorkout: (Boolean) -> Unit = {}
    var onMotionWanted: (Boolean) -> Unit = {}
    private val auto = AutoSession { clock() }
    private var pairing = false
    private var wantsPair = false
    private var previewing = false
    private var loop = true
    private var applying = false
    private var queued: Session? = null

    init { auto.enabled = store.autoOn() }

    fun stop() { loop = false }

    suspend fun start(modelName: String) {
        if (!previewing && store.token() == null) wantsPair = true
        else if (store.token() != null && !previewing) refreshPlans()
        while (loop) {
            if (wantsPair && store.token() == null && !previewing) {
                wantsPair = false
                pair(modelName)
            }
            delay(1000)
            tick()
            flushQueued()
        }
    }

    fun retryPair() {
        pairing = false
        wantsPair = true
    }

    suspend fun pair(modelName: String) {
        if (pairing) return
        pairing = true
        try {
            while (loop && store.token() == null && pairing) {
                val ticket = try {
                    val res = api.requestCode(store.deviceId(), modelName)
                    if (res.code != 200) null else Payloads.pairTicket(res.body)
                } catch (e: Exception) { null }
                if (ticket == null) {
                    publish(ui.copy(screen = Screen.Pair, pairCode = null, pairNote = linkNote("No connection")))
                    delay(4000)
                    continue
                }
                publish(ui.copy(screen = Screen.Pair, pairCode = ticket.code, pairNote = "Confirm in Simple Lift"))
                link.send("""{"t":"pair","code":"${ticket.code}","src":"w"}""")
                val until = clock() + ticket.expiresIn * 1000L
                while (loop && pairing && store.token() == null && clock() < until) {
                    delay(4000)
                    val poll = try { api.poll(ticket.code, store.deviceId()) } catch (e: Exception) { null }
                    if (poll == null) {
                        publish(ui.copy(pairNote = linkNote("No connection")))
                        continue
                    }
                    when (val status = Payloads.pairPoll(poll.code, poll.body)) {
                        is PairPoll.Claimed -> {
                            store.saveToken(status.token)
                            publish(ui.copy(pairNote = "Paired"))
                            refreshPlans()
                            return
                        }
                        PairPoll.Expired -> break
                        PairPoll.Missing -> publish(ui.copy(pairNote = "Code not found"))
                        PairPoll.Pending -> publish(ui.copy(pairNote = "Confirm in Simple Lift"))
                    }
                }
            }
        } finally { pairing = false }
    }

    fun skipPair() {
        pairing = false
        publish(ui.copy(screen = Screen.Plans, pairNote = "Not paired"))
    }

    suspend fun refreshPlans() {
        val token = store.token() ?: run {
            publish(ui.copy(screen = Screen.Plans, days = emptyList(), syncNote = "Pair to load your plan"))
            return
        }
        val remote = try {
            val plans = api.plans(token)
            if (plans.code == 200) Payloads.plans(plans.body) else {
                val workout = api.workout(token)
                if (workout.code == 401) { unpair(); return }
                if (workout.code != 200) null else Payloads.plans(workout.body)
            }
        } catch (e: Exception) { null }
        if (remote == null) {
            publish(ui.copy(screen = Screen.Plans, syncNote = "Saved on watch"))
            return
        }
        noteAuto(remote.autoDetect, 0)
        publish(ui.copy(screen = Screen.Plans, days = remote.days, syncNote = if (link.phoneNear) "Phone linked" else ""))
        flushPending(token)
        pullLive(token)
    }

    fun openDay(index: Int) {
        val day = ui.days.getOrNull(index) ?: return
        val parsed = Codes.parse(day.code) ?: return
        val now = clock() / 1000
        val session = Session.fromParsed(parsed, day.planId, day.day, "w$now", now)
        publish(ui.copy(screen = Screen.Workout, session = session))
        onWorkout(true)
        auto.resetLive()
        pushSoon()
    }

    fun cycleMode() = updateSession { it.cycleMode() }
    fun toggleSet(set: Int) {
        val session = ui.session ?: return
        updateSession { it.toggleSet(session.index, set, clock() / 1000) }
    }
    fun toggleExercise() {
        val session = ui.session ?: return
        updateSession { it.toggleExercise(session.index, clock() / 1000) }
    }
    fun startRest() {
        val session = ui.session ?: return
        updateSession { it.manualRest(session.index, clock() / 1000) }
    }
    fun shift(dir: Int) {
        val session = ui.session ?: return
        val next = (session.index + dir).coerceIn(0, session.exercises.lastIndex.coerceAtLeast(0))
        updateSession { it.copy(index = next) }
    }
    fun undo() {
        auto.onUndo(clock())
        updateSession { it.undo(clock()) }
    }

    suspend fun finish() {
        val session = ui.session ?: return
        val done = session.finish(clock() / 1000)
        publish(ui.copy(screen = Screen.Done, session = done, syncNote = "Sending…"))
        onWorkout(false)
        auto.resetLive()
        val token = store.token()
        push(done, forceServer = true)
        if (token == null || done.result.isBlank()) {
            publish(ui.copy(syncNote = "Saved on watch"))
            return
        }
        val code = try { api.postResult(token, done.result).code } catch (e: Exception) { 0 }
        when (code) {
            200 -> publish(ui.copy(syncNote = "Sent to Simple Lift"))
            400 -> publish(ui.copy(syncNote = "Not accepted"))
            401 -> unpair()
            else -> {
                store.setPending(done.result)
                publish(ui.copy(syncNote = "Saved on watch"))
            }
        }
    }

    fun toggleAuto(on: Boolean) {
        val at = clock() / 1000
        store.setAuto(on, at)
        auto.enabled = on
        publish(ui.copy(autoOn = on))
        if (ui.session != null) pushSoon()
    }

    fun showSettings() = publish(ui.copy(screen = Screen.Settings))
    fun showPlans() = publish(ui.copy(screen = Screen.Plans))
    fun backFromSettings() {
        val screen = when {
            ui.session?.finished == true -> Screen.Done
            ui.session != null -> Screen.Workout
            else -> Screen.Plans
        }
        publish(ui.copy(screen = screen))
    }

    fun unpair() {
        store.clearToken()
        previewing = false
        wantsPair = true
        pairing = false
        onWorkout(false)
        publish(ui.copy(screen = Screen.Pair, pairCode = null, session = null, days = emptyList(), pairNote = "Not paired"))
    }

    fun onMotion(milliG: Double) {
        val session = ui.session ?: return
        if (!auto.enabled || session.mode != CheckMode.Set || session.finished || ui.screen != Screen.Workout) return
        val nowSec = clock() / 1000
        val open = session.openSet()
        val world = AutoSession.World(
            modeSet = true,
            resting = session.resting(nowSec),
            setOpen = open >= 0,
            finished = session.finished,
            plannedReps = if (open >= 0) session.exercises[session.index].sets[open].reps else 0,
            restSpentSec = if (session.restTotal > 0) session.restTotal - session.restLeft(nowSec) else 0
        )
        var next = session
        for (effect in auto.feed(listOf(milliG), world)) {
            next = when (effect) {
                is AutoSession.Effect.Log -> if (open >= 0) next.logDetected(session.index, open, effect.detected, effect.useDetected, nowSec, clock()) else next
                AutoSession.Effect.EndRest -> next.copy(restUntil = 0, restTotal = 0)
                else -> next
            }
        }
        if (next != session) {
            publish(ui.copy(session = next))
            if (!next.finished) pushSoon()
        }
    }

    fun onWear(raw: String) {
        when (val msg = Payloads.message(raw)) {
            is Incoming.Settings -> noteAuto(msg.auto, msg.at)
            is Incoming.Snap -> applySnap(msg.snap)
            else -> {}
        }
    }

    suspend fun replyHello() {
        val code = ui.pairCode
        if (store.token() == null && code != null) link.send("""{"t":"pair","code":"$code","src":"w"}""")
        else ui.session?.let { push(it, forceServer = false) }
    }

    fun bpm(value: Int?) {
        if (ui.bpm == value) return
        publish(ui.copy(bpm = value))
    }

    fun preview(which: String) {
        previewing = true
        if (which == "settings") {
            publish(ui.copy(screen = Screen.Settings, autoOn = store.autoOn()))
            return
        }
        val parsed = Codes.parse(PREVIEW) ?: return
        val now = clock() / 1000
        var session = Session.fromParsed(parsed, "preview", 0, "preview", now)
        val screen = when (which) {
            "rest" -> {
                session = session.manualRest(0, now).let { it.copy(restTotal = 90, restUntil = now + 50) }
                Screen.Workout
            }
            "done" -> {
                session = session.finish(now)
                Screen.Done
            }
            else -> Screen.Workout
        }
        publish(ui.copy(screen = screen, session = session, syncNote = if (which == "done") "Saved on watch" else ""))
        if (screen == Screen.Workout) onWorkout(true)
    }

    private suspend fun tick() {
        val nowSec = clock() / 1000
        val nowMs = clock()
        val session = ui.session ?: return
        if (session.finished) return
        val cleared = session.clearRestIfEnded(nowSec).dropUndo(nowMs)
        if (cleared != session) {
            publish(ui.copy(session = cleared, nowSec = nowSec, nowMs = nowMs))
            pushSoon()
        } else if (ui.nowSec != nowSec) {
            publish(ui.copy(nowSec = nowSec, nowMs = nowMs))
        }
        if (nowSec % 3L == 0L) {
            val token = store.token()
            if (token != null) pullLive(token)
            ui.session?.takeIf { !it.finished }?.let { push(it, forceServer = !link.phoneNear) }
        }
    }

    private fun updateSession(block: (Session) -> Session) {
        val session = ui.session ?: return
        val next = block(session)
        publish(ui.copy(session = next, screen = if (next.finished) Screen.Done else Screen.Workout))
        if (!next.finished) pushSoon()
    }

    private fun pushSoon() { queued = ui.session }

    suspend fun flushQueued() {
        val session = queued ?: return
        queued = null
        push(session, forceServer = !link.phoneNear)
    }

    private suspend fun push(session: Session, forceServer: Boolean) {
        if (applying) return
        val snap = session.toWire(clock() / 1000, store.autoOn()).text()
        val sent = try { link.send(snap) } catch (e: Exception) { false }
        val token = store.token() ?: return
        if (sent && !forceServer) return
        try {
            val res = api.pushLive(token, snap)
            if (res.code == 401) unpair() else if (res.code == 200) applyLive(res)
        } catch (e: Exception) {
            publish(ui.copy(syncNote = "Saved on watch"))
        }
    }

    private suspend fun pullLive(token: String) {
        if (applying) return
        try {
            val res = api.pullLive(token)
            if (res.code == 401) unpair() else if (res.code == 200) applyLive(res)
        } catch (e: Exception) { }
    }

    private fun applyLive(res: HttpResult) {
        val body = Payloads.live(res.body)
        noteAuto(body.autoDetect, 0)
        body.snap?.let { applySnap(it) }
    }

    private fun applySnap(snap: WireSnap) {
        if (snap.drop == 1) {
            if (ui.session?.id == snap.id) {
                onWorkout(false)
                publish(ui.copy(session = null, screen = Screen.Plans))
            }
            return
        }
        if (snap.auto != null) noteAuto(snap.auto != 0, snap.at)
        val local = ui.session
        if (local == null && snap.code.isNotBlank() && snap.fin == 0) {
            val parsed = Codes.parse(snap.code) ?: return
            val started = Session.fromParsed(parsed, snap.plan, snap.day, snap.id, snap.at, CheckMode.norm(snap.mode))
            val applied = started.applyWire(snap, "w", clock() / 1000) ?: return
            applying = true
            publish(ui.copy(screen = if (applied.finished) Screen.Done else Screen.Workout, session = applied))
            if (!applied.finished) onWorkout(true)
            applying = false
            return
        }
        val next = local?.applyWire(snap, "w", clock() / 1000) ?: return
        applying = true
        publish(ui.copy(screen = if (next.finished) Screen.Done else ui.screen, session = next))
        applying = false
    }

    private fun noteAuto(value: Boolean?, at: Long) {
        if (value == null) return
        if (at != 0L && at < store.autoAt()) return
        if (at == 0L && store.autoAt() != 0L) return
        if (value == store.autoOn() && at <= store.autoAt()) return
        store.setAuto(value, if (at == 0L) store.autoAt() else at)
        auto.enabled = value
        publish(ui.copy(autoOn = value))
    }

    private suspend fun flushPending(token: String) {
        val code = store.pending() ?: return
        try {
            val res = api.postResult(token, code)
            if (res.code == 200 || res.code == 400) store.setPending(null)
        } catch (e: Exception) { }
    }

    private fun linkNote(fallback: String) = if (link.phoneNear) "Phone linked" else fallback

    private fun publish(next: UiState) {
        ui = next
        val want = next.autoOn && next.screen == Screen.Workout && next.session?.mode == CheckMode.Set && next.session?.finished == false
        onMotionWanted(want)
        onChange()
    }

    companion object {
        const val PREVIEW = "SL1~Push~Dumbbell Bench Press,2,8,30,90~#set"
        fun modelName(): String {
            val model = Build.MODEL ?: ""
            return if (model.isBlank() || model.contains("sdk", true) || model.contains("generic", true)) "Galaxy Watch" else model
        }
    }
}
