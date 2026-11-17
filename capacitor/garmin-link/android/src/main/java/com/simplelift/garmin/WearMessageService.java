package com.simplelift.garmin;

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
}
