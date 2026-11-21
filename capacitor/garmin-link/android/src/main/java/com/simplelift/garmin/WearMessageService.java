package com.simplelift.garmin;

import android.net.Uri;
import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;
import java.nio.charset.StandardCharsets;

/** Receives a Galaxy Watch message when the Capacitor activity is not listening yet. */
public class WearMessageService extends WearableListenerService {
    @Override
    public void onMessageReceived(MessageEvent event) {
        if (event == null || !WearBridge.PATH.equals(event.getPath()) || event.getData() == null) return;
        String json = new String(event.getData(), StandardCharsets.UTF_8);
        GarminLinkPlugin plugin = GarminLinkPlugin.current;
        if (plugin != null) plugin.onWearJson(json);
    }

    @Override
    public void onDataChanged(DataEventBuffer events) {
        for (DataEvent event : events) {
            if (event.getType() != DataEvent.TYPE_CHANGED) continue;
            Uri uri = event.getDataItem().getUri();
            if (uri == null || !WearBridge.DATA.equals(uri.getPath())) continue;
            byte[] raw = event.getDataItem().getData();
            if (raw == null || raw.length == 0) continue;
            GarminLinkPlugin plugin = GarminLinkPlugin.current;
            if (plugin != null) plugin.onWearJson(new String(raw, StandardCharsets.UTF_8));
        }
    }
}
