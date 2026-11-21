package app.simplelift.wear.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.sin

class WatchLogicTest {
    @Test
    fun parsesSl1IncludingPerSetListsAndMode() {
        val code = "SL1~Push~Dumbbell Bench Press,2,8/10,30/35,90~Row,3,12,40,60~#exercise"
        val parsed = Codes.parse(code)
        assertNotNull(parsed)
        parsed!!
        assertEquals("Push", parsed.title)
        assertEquals(CheckMode.Exercise, parsed.mode)
        assertEquals(2, parsed.exercises[0].sets.size)
        assertEquals(35, parsed.exercises[0].sets[1].weightLb)
        assertEquals(10, parsed.exercises[0].sets[1].reps)
        assertEquals(60, parsed.exercises[1].restSec)
        assertEquals("8–10 reps · rest 1:30", Codes.repLine(parsed.exercises[0]))
    }

    @Test
    fun resultCodeCollapsesEqualWeights() {
        val parsed = Codes.parse("SL1~Push~Bench,2,8,30,90~#set")!!
        val done = parsed.exercises.map { ex -> ex.copy(sets = ex.sets.map { it.copy(done = true) }) }
        assertEquals("SR1~Push~2@30", Codes.resultCode("Push", done))
    }

    @Test
    fun setCheckStartsRestAndExerciseCheckDoesNot() {
        val session = session()
        val checked = session.toggleSet(0, 0, NOW)
        assertTrue(checked.exercises[0].sets[0].done)
        assertEquals(NOW + 90, checked.restUntil)
        val exercise = session.copy(mode = CheckMode.Exercise).toggleExercise(0, NOW)
        assertTrue(exercise.exercises[0].sets.all { it.done })
        assertEquals(0, exercise.restUntil)
        val rested = exercise.manualRest(0, NOW)
        assertEquals(NOW + 90, rested.restUntil)
    }

    @Test
    fun noneModeFinishLogsEverySet() {
        val done = session().copy(mode = CheckMode.None).finish(NOW)
        assertTrue(done.finished)
        assertEquals("SR1~Push~2@30", done.result)
    }

    @Test
    fun higherRevFromThePhoneWinsAndOlderDoesNot() {
        val local = session()
        val newer = local.toWire(NOW, false).copy(rev = 5, src = "p")
        assertTrue(Session.wins(local, newer, "w"))
        val echo = local.toWire(NOW, false).copy(src = "w")
        assertFalse(Session.wins(local, echo, "w"))
    }

    @Test
    fun pairPayloads() {
        val ticket = Payloads.pairTicket("""{"code":"482913","expiresIn":600}""")
        assertEquals("482913", ticket?.code)
        assertTrue(Payloads.pairPoll(200, """{"status":"pending"}""") is PairPoll.Pending)
        val claimed = Payloads.pairPoll(200, """{"status":"claimed","token":"abc"}""")
        assertEquals("abc", (claimed as PairPoll.Claimed).token)
        assertTrue(Payloads.pairPoll(200, """{"status":"expired"}""") is PairPoll.Expired)
    }

    @Test
    fun workoutAndPlansPayloads() {
        val one = Payloads.plans("""{"code":"SL1~Push~Bench,2,8,30,90~#set","checkMode":"none"}""")
        assertEquals(1, one.days.size)
        assertEquals(CheckMode.None, one.checkMode)
        val many = Payloads.plans("""{"plans":[{"id":"p","name":"PPL","days":[{"name":"Push","code":"SL1~Push~Bench,1,8,30,90","today":true},{"name":"Rest","code":"SL1~Rest~Walk,1,1,0,0","rest":true}]}],"autoDetectSets":false}""")
        assertEquals(2, many.days.size)
        assertEquals(false, many.autoDetect)
        assertTrue(many.days[0].today)
    }

    @Test
    fun heartRateHidesWithoutAReading() {
        assertNull(displayBpm(null))
        assertNull(displayBpm(0.0))
        assertNull(displayBpm(300.0))
        assertEquals(72, displayBpm(72.4))
    }

    @Test
    fun liftCadenceCountsAndWalkingDoesNot() {
        val lift = RepDetector()
        lift.feed(sine(10.0, 2.2))
        assertTrue("reps=${lift.count}", lift.count >= 3)
        val walk = RepDetector()
        walk.feed(sine(8.0, 0.5))
        assertTrue(walk.count == 0 || walk.fast != 0 || walk.n < walk.mutedUntil)
        if (walk.fast == 0 && walk.count >= 3) throw AssertionError("walk looked like a set: ${walk.count}")
    }

    @Test
    fun autoLogUsesDetectedRepsAfterStillnessAndUndoDebounces() {
        var now = 1_000L
        val auto = AutoSession { now }
        auto.enabled = true
        val world = AutoSession.World(true, resting = false, setOpen = true, finished = false, plannedReps = 8, restSpentSec = 0)
        val first = auto.feed(sine(10.0, 2.2), world)
        assertTrue(first.none { it is AutoSession.Effect.Log })
        now += AutoSession.AUTO_STILL_MS
        val logged = auto.poll(world)
        val log = logged.filterIsInstance<AutoSession.Effect.Log>().single()
        assertTrue(log.detected >= 3)
        assertTrue(log.useDetected)
        assertFalse(AutoSession.reliableReps(2, 8))
        assertFalse(AutoSession.reliableReps(31, 20))
        assertFalse(AutoSession.reliableReps(14, 5))
        assertTrue(AutoSession.reliableReps(8, 8))
        assertFalse(
            AutoSession.shouldAutoLog(
                enabled = true, resting = true, setOpen = true, finished = false, fast = 0,
                nowMs = 20, blockUntilMs = 0, liveReps = 8, detCount = 8, lastRepAt = 100, motionStartN = 10
            )
        )
        val session = session().logDetected(0, 0, log.detected, true, NOW, now)
        assertTrue(session.exercises[0].sets[0].done)
        assertEquals(NOW + 90, session.restUntil)
        assertNotNull(session.undo)
        val undone = session.undo(now)
        assertFalse(undone.exercises[0].sets[0].done)
        assertEquals(0, undone.restUntil)
        assertTrue(undone.autoBlockUntilMs >= now + 8000)
    }

    @Test
    fun milliGAtRestIsAboutOneThousand() {
        val g = RepDetector.milliG(0f, 0f, 9.80665f)
        assertEquals(1000f, g, 1f)
    }

    private fun session(): Session {
        val parsed = Codes.parse("SL1~Push~Bench,2,8,30,90~#set")!!
        return Session.fromParsed(parsed, "p", 0, "w1", NOW)
    }

    private fun sine(seconds: Double, period: Double, amp: Double = 350.0): List<Double> {
        val n = (seconds * RepDetector.RATE).toInt()
        return List(n) { i ->
            val t = i / RepDetector.RATE.toDouble()
            1000.0 + amp * sin(2 * PI * t / period)
        }
    }

    companion object {
        private const val NOW = 1_700_000_000L
    }
}
