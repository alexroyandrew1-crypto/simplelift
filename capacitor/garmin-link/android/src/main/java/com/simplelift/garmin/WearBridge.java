package com.simplelift.garmin;

import android.content.Context;
import android.net.Uri;
import android.util.Log;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.CapabilityClient;
import com.google.android.gms.wearable.CapabilityInfo;
import com.google.android.gms.wearable.DataClient;
import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.PutDataRequest;
import com.google.android.gms.wearable.Wearable;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Phone side of the Wear OS data layer. Messages are instant while both apps
 * are open. A data item is the copy the other side reads after a restart or
 * when the radios come back in range. The server remains the fallback.
 */
public final class WearBridge {
    static final String TAG = "WearBridge";
    static final String PATH = "/simplelift/msg";
    static final String DATA = "/simplelift/live";
    static final String WATCH = "simplelift_wear";

    private final Context context;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final MessageClient.OnMessageReceivedListener messages;
    private final DataClient.OnDataChangedListener data;
    private final Listener listener;
    private final Runnable onStatus;
    private volatile boolean connected;

    WearBridge(Context context, Listener listener, Runnable onStatus) {
        this.context = context.getApplicationContext();
        this.listener = listener;
        this.onStatus = onStatus;
        this.messages = event -> {
            if (event == null || !PATH.equals(event.getPath()) || event.getData() == null) return;
            connected = true;
            listener.onJson(new String(event.getData(), StandardCharsets.UTF_8));
            if (onStatus != null) onStatus.run();
        };
        this.data = this::onData;
    }

    boolean connected() { return connected; }

    void start() {
        try {
            Wearable.getMessageClient(context).addListener(messages);
            Wearable.getDataClient(context).addListener(data);
            Wearable.getCapabilityClient(context).addListener(this::onCapability, WATCH);
            refresh();
        } catch (Exception e) {
            Log.w(TAG, "listen", e);
        }
    }

    void refresh() {
        executor.execute(() -> {
            boolean up = false;
            try {
                CapabilityInfo info = Tasks.await(Wearable.getCapabilityClient(context)
                    .getCapability(WATCH, CapabilityClient.FILTER_REACHABLE));
                up = info.getNodes() != null && !info.getNodes().isEmpty();
            } catch (Exception e) {
                Log.w(TAG, "nodes", e);
            }
            if (up != connected) {
                connected = up;
                if (onStatus != null) onStatus.run();
                if (up) send("{\"t\":\"hello\",\"src\":\"p\"}");
            } else {
                connected = up;
            }
        });
    }

    void send(String json) {
        if (json == null || json.length() == 0) return;
        executor.execute(() -> {
            try {
                byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
                PutDataRequest request = PutDataRequest.create(DATA);
                request.setData(bytes);
                request.setUrgent();
                Tasks.await(Wearable.getDataClient(context).putDataItem(request));
                CapabilityInfo info = Tasks.await(Wearable.getCapabilityClient(context)
                    .getCapability(WATCH, CapabilityClient.FILTER_REACHABLE));
                Set<Node> nodes = info.getNodes();
                boolean up = nodes != null && !nodes.isEmpty();
                if (up != connected) {
                    connected = up;
                    if (onStatus != null) onStatus.run();
                }
                if (nodes == null) return;
                for (Node node : nodes) {
                    Tasks.await(Wearable.getMessageClient(context).sendMessage(node.getId(), PATH, bytes));
                }
            } catch (Exception e) {
                Log.w(TAG, "send", e);
            }
        });
    }

    private void onCapability(CapabilityInfo info) {
        boolean up = info != null && info.getNodes() != null && !info.getNodes().isEmpty();
        connected = up;
        if (onStatus != null) onStatus.run();
        if (up) send("{\"t\":\"hello\",\"src\":\"p\"}");
    }

    private void onData(DataEventBuffer events) {
        for (DataEvent event : events) {
            if (event.getType() != DataEvent.TYPE_CHANGED) continue;
            Uri uri = event.getDataItem().getUri();
            if (uri == null || !DATA.equals(uri.getPath())) continue;
            byte[] raw = event.getDataItem().getData();
            if (raw == null || raw.length == 0) continue;
            connected = true;
            listener.onJson(new String(raw, StandardCharsets.UTF_8));
            if (onStatus != null) onStatus.run();
        }
    }

    interface Listener {
        void onJson(String json);
    }
}
