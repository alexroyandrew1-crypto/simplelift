package app.simplelift.wear.model

/**
 * What the watch does when it opens or the phone node appears.
 * A saved token means already paired: never show a code again until Unpair.
 */
data class LinkDecision(
    val showPair: Boolean,
    val connected: Boolean,
    val hello: Boolean,
    val offerCode: Boolean
)

object LinkSession {
    fun onOpen(token: String?): LinkDecision = decide(token, node = false, opening = true)

    fun onNode(present: Boolean, token: String?): LinkDecision = decide(token, present, opening = false)

    fun onUnpair(): LinkDecision = LinkDecision(showPair = true, connected = false, hello = false, offerCode = false)

    private fun decide(token: String?, node: Boolean, opening: Boolean): LinkDecision {
        val paired = !token.isNullOrBlank()
        return LinkDecision(
            showPair = !paired,
            connected = paired && node,
            hello = paired && (node || opening),
            offerCode = !paired && node
        )
    }
}

/** Phone watch-settings object from PR #9. A higher rev replaces the older one. */
data class WatchSettings(
    val rev: Long = 0,
    val chime: Boolean = true,
    val vibration: Boolean = true,
    val autoDetectSets: Boolean = false,
    val showHr: Boolean = true,
    val repDetect: Boolean = true,
    val saveActivity: Boolean = true,
    val restAlert: Int = 0
) {
    fun apply(remote: WatchSettings): WatchSettings = if (remote.rev > rev) remote else this

    fun text(): String {
        return """{"t":"settings","rev":$rev,"chime":$chime,"vibration":$vibration,"autoDetectSets":$autoDetectSets,"showHr":$showHr,"repDetect":$repDetect,"saveActivity":$saveActivity,"restAlert":$restAlert,"src":"w"}"""
    }
}
