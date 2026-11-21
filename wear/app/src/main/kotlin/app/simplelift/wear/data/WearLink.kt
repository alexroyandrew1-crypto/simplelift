package app.simplelift.wear.data

import android.content.Context
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
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

    override fun onDataChanged(events: DataEventBuffer) {
        for (event in events) {
            if (event.type != DataEvent.TYPE_CHANGED) continue
            val item = event.dataItem
            if (item.uri.path != WearLink.DATA) continue
            val raw = item.data
            if (raw == null || raw.isEmpty()) continue
            WearBus.post(raw.toString(Charsets.UTF_8))
        }
    }
}

class WearLink(context: Context) {
    private val app = context.applicationContext
    private val messages = Wearable.getMessageClient(app)
    private val caps = Wearable.getCapabilityClient(app)
    var phoneNear: Boolean = false
        private set

    suspend fun nearby(): Boolean {
        phoneNear = try {
            caps.getCapability(PHONE, CapabilityClient.FILTER_REACHABLE).await().nodes.isNotEmpty()
        } catch (e: Exception) {
            false
        }
        return phoneNear
    }

    suspend fun send(json: String): Boolean {
        if (!nearby()) return false
        val bytes = json.toByteArray(Charsets.UTF_8)
        try {
            val request = com.google.android.gms.wearable.PutDataRequest.create(DATA)
            request.data = bytes
            request.setUrgent()
            com.google.android.gms.wearable.Wearable.getDataClient(app).putDataItem(request).await()
        } catch (e: Exception) {
            // A message can still land while both apps are open.
        }
        var sent = false
        val nodes = caps.getCapability(PHONE, CapabilityClient.FILTER_REACHABLE).await().nodes
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
        const val DATA = "/simplelift/live"
        const val PHONE = "simplelift_phone"
        const val WATCH = "simplelift_wear"
    }
}
