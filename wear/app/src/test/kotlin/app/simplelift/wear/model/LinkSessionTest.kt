package app.simplelift.wear.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LinkSessionTest {
    @Test
    fun restartWithATokenDoesNotAskForACode() {
        val open = LinkSession.onOpen("saved-token")
        assertFalse(open.showPair)
        assertFalse(open.offerCode)
        assertTrue(open.hello)
        val away = LinkSession.onNode(false, "saved-token")
        assertFalse(away.showPair)
        assertFalse(away.connected)
        assertFalse(away.offerCode)
        val back = LinkSession.onNode(true, "saved-token")
        assertTrue(back.connected)
        assertTrue(back.hello)
        assertFalse(back.showPair)
        assertFalse(back.offerCode)
    }

    @Test
    fun unpairIsTheOnlyWayBackToACode() {
        val cleared = LinkSession.onUnpair()
        assertTrue(cleared.showPair)
        assertFalse(cleared.connected)
        val near = LinkSession.onNode(true, null)
        assertTrue(near.showPair)
        assertTrue(near.offerCode)
    }

    @Test
    fun newerWatchSettingsWin() {
        val local = WatchSettings(rev = 10, autoDetectSets = false, showHr = true)
        val older = local.copy(rev = 9, autoDetectSets = true)
        val newer = local.copy(rev = 11, chime = false, showHr = false, restAlert = 1)
        assertEquals(local, local.apply(older))
        assertFalse(local.apply(newer).chime)
        assertFalse(local.apply(newer).showHr)
        assertEquals(1, local.apply(newer).restAlert)
    }
}
