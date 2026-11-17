package app.simplelift.wear.data

import android.content.Context
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.tasks.await

/** Messages the phone app and the watch already use: hello, pair, snap. */
object WearBus {
    var listener: ((String) -> Unit)? = null
    private val pending = ArrayDeque<String>()

    fun post(json: String) {
        val current = listener
        if (current == null) {
            if (pending.size >= 8) pending.removeFirst()
            pending.add(json)
        } else {
            current(json)
        }
    }

    fun drain() {
        val current = listener ?: return
        while (pending.isNotEmpty()) current(pending.removeFirst())
    }
}

class WearListener : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        if (event.path != WearLink.PATH) return
        WearBus.post(event.data.toString(Charsets.UTF_8))
    }
}

class WearLink(context: Context) {
    private val app = context.applicationContext
    private val messages = Wearable.getMessageClient(app)
    private val caps = Wearable.getCapabilityClient(app)
    var phoneNear: Boolean = false
        private set

    suspend fun send(json: String): Boolean {
        val info = try {
            caps.getCapability(PHONE, CapabilityClient.FILTER_REACHABLE).await()
        } catch (e: Exception) {
            phoneNear = false
            return false
        }
        val nodes = info.nodes
        phoneNear = nodes.isNotEmpty()
        if (nodes.isEmpty()) return false
        val bytes = json.toByteArray(Charsets.UTF_8)
        var sent = false
        for (node in nodes) {
            try {
                messages.sendMessage(node.id, PATH, bytes).await()
                sent = true
            } catch (e: Exception) {
                // The server poll still carries the snapshot.
            }
        }
        return sent
    }

    companion object {
        const val PATH = "/simplelift/msg"
        const val PHONE = "simplelift_phone"
        const val WATCH = "simplelift_wear"
    }
}
