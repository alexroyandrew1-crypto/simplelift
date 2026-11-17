package com.simplelift.garmin;

import android.content.Context;
import android.util.Log;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.CapabilityClient;
import com.google.android.gms.wearable.CapabilityInfo;
import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Phone side of the Wear OS data layer. The same JSON the Garmin link already
 * carries (hello, pair, snap) is forwarded to a Galaxy Watch node when one is
 * reachable. Server sync stays the path when this node is absent.
 */
public final class WearBridge {
    static final String TAG = "WearBridge";
    static final String PATH = "/simplelift/msg";
    static final String WATCH = "simplelift_wear";

    private final Context context;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final MessageClient.OnMessageReceivedListener listener;

    WearBridge(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = event -> {
            if (event == null || !PATH.equals(event.getPath()) || event.getData() == null) return;
            listener.onJson(new String(event.getData(), StandardCharsets.UTF_8));
        };
    }

    void start() {
        try {
            Wearable.getMessageClient(context).addListener(listener);
        } catch (Exception e) {
            Log.w(TAG, "listen", e);
        }
    }

    void send(String json) {
        if (json == null || json.length() == 0) return;
        executor.execute(() -> {
            try {
                CapabilityInfo info = Tasks.await(Wearable.getCapabilityClient(context)
                    .getCapability(WATCH, CapabilityClient.FILTER_REACHABLE));
                Set<Node> nodes = info.getNodes();
                byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
                for (Node node : nodes) {
                    Tasks.await(Wearable.getMessageClient(context).sendMessage(node.getId(), PATH, bytes));
                }
            } catch (Exception e) {
                Log.w(TAG, "send", e);
            }
        });
    }

    interface Listener {
        void onJson(String json);
    }
}
