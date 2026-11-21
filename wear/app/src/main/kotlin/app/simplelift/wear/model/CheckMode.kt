package app.simplelift.wear.model

/** Same three check-off choices as the phone (v36) and the Garmin app. */
enum class CheckMode {
    Set,
    Exercise,
    None;

    fun wire(): String = when (this) {
        Set -> "set"
        Exercise -> "exercise"
        None -> "none"
    }

    fun label(): String = when (this) {
        Set -> "Check each set"
        Exercise -> "Check each exercise"
        None -> "No checks"
    }

    companion object {
        fun norm(raw: String?): CheckMode = when (raw?.trim()?.lowercase()) {
            "exercise" -> Exercise
            "none" -> None
            else -> Set
        }

        fun cycle(mode: CheckMode): CheckMode = when (mode) {
            Set -> Exercise
            Exercise -> None
            None -> Set
        }
    }
}
