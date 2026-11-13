package com.simplelift.garmin;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.garmin.android.connectiq.ConnectIQ;
import com.garmin.android.connectiq.ConnectIQ.IQConnectType;
import com.garmin.android.connectiq.IQApp;
import com.garmin.android.connectiq.IQDevice;
import com.garmin.android.connectiq.exception.InvalidStateException;
import com.garmin.android.connectiq.exception.ServiceUnavailableException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Bluetooth link to the Simple Lift watch app through the Garmin Connect IQ Mobile SDK.
 * The watch application id is b724187045624031be108c6b6e5c76b6.
 * Messages are JSON objects. The plugin turns them into Maps the watch receives as Dictionaries.
 */
@CapacitorPlugin(name = "GarminLink")
public class GarminLinkPlugin extends Plugin implements ConnectIQ.ConnectIQListener {
    static final String TAG = "GarminLink";
    /** UUID form of the Connect IQ application id in garmin/manifest.xml. */
    static final String APP_ID = "b7241870-4562-4031-be10-8c6b6e5c76b6";

    private ConnectIQ connect;
    private IQApp app;
    private IQDevice device;
    private boolean ready;

    @Override
    public void load() {
        connect = ConnectIQ.getInstance(getContext(), IQConnectType.WIRELESS);
        app = new IQApp(APP_ID);
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            connect.initialize(getContext(), false, this);
            call.resolve(status());
        } catch (Exception e) {
            Log.w(TAG, "initialize", e);
            call.resolve(status());
        }
    }

    @PluginMethod
    public void send(PluginCall call) {
        String json = call.getString("json", "");
        if (!ready || device == null || json == null || json.length() == 0) {
            JSObject ret = status();
            ret.put("ok", false);
            call.resolve(ret);
            return;
        }
        try {
            Object msg = unwrap(new JSONObject(json));
            connect.sendMessage(device, app, msg, (dev, iq, st) -> {
                JSObject ret = status();
                ret.put("ok", st == ConnectIQ.IQMessageStatus.SUCCESS);
                ret.put("messageStatus", st == null ? "" : st.name());
            });
            JSObject ret = status();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.w(TAG, "send", e);
            JSObject ret = status();
            ret.put("ok", false);
            call.resolve(ret);
        }
    }

    @Override
    public void onSdkReady() {
        ready = true;
        look();
        emit();
    }

    @Override
    public void onInitializeError(ConnectIQ.IQSdkErrorStatus status) {
        ready = false;
        device = null;
        Log.w(TAG, "sdk " + status);
        emit();
    }

    @Override
    public void onSdkShutDown() {
        ready = false;
        device = null;
        emit();
    }

    private void look() {
        List<IQDevice> found = new ArrayList<>();
        try {
            List<IQDevice> connected = connect.getConnectedDevices();
            if (connected != null) found.addAll(connected);
        } catch (Exception e) {
            Log.w(TAG, "connected devices", e);
        }
        if (found.isEmpty()) {
            try {
                List<IQDevice> known = connect.getKnownDevices();
                if (known != null) found.addAll(known);
            } catch (Exception e) {
                Log.w(TAG, "known devices", e);
            }
        }
        if (found.isEmpty()) {
            device = null;
            return;
        }
        device = found.get(0);
        try {
            connect.registerForDeviceEvents(device, (dev, st) -> {
                if (st == IQDevice.IQDeviceStatus.CONNECTED) {
                    device = dev;
                    openApp();
                } else if (st == IQDevice.IQDeviceStatus.NOT_CONNECTED) {
                    emit();
                }
            });
        } catch (Exception e) {
            Log.w(TAG, "device events", e);
        }
        openApp();
    }

    private void openApp() {
        if (device == null) return;
        try {
            connect.getApplicationInfo(APP_ID, device, new ConnectIQ.IQApplicationInfoListener() {
                @Override
                public void onApplicationInfoReceived(IQApp info) {
                    if (info != null) app = info;
                    listen();
                    hello();
                }
                @Override
                public void onApplicationNotInstalled(String applicationId) {
                    Log.w(TAG, "watch app missing " + applicationId);
                    device = null;
                    emit();
                }
            });
        } catch (Exception e) {
            Log.w(TAG, "app info", e);
        }
    }

    private void listen() {
        if (device == null || app == null) return;
        try {
            connect.registerForAppEvents(device, app, (dev, iq, message, st) -> {
                JSObject data = new JSObject();
                data.put("json", toJson(message));
                data.put("connected", true);
                notifyListeners("message", data);
                notifyListeners("status", status());
            });
        } catch (InvalidStateException | ServiceUnavailableException e) {
            Log.w(TAG, "register", e);
        }
    }

    private void hello() {
        if (device == null || app == null) return;
        try {
            Map<String, Object> hello = new HashMap<>();
            hello.put("t", "hello");
            hello.put("src", "p");
            connect.sendMessage(device, app, hello, (d, a, s) -> emit());
        } catch (Exception e) {
            Log.w(TAG, "hello", e);
        }
        emit();
    }

    private void emit() {
        notifyListeners("status", status());
    }

    private JSObject status() {
        JSObject o = new JSObject();
        o.put("ready", ready);
        o.put("connected", ready && device != null);
        o.put("appId", APP_ID);
        return o;
    }

    static Object unwrap(Object v) throws JSONException {
        if (v == null || v == JSONObject.NULL) return null;
        if (v instanceof JSONArray) {
            JSONArray a = (JSONArray) v;
            List<Object> list = new ArrayList<>();
            for (int i = 0; i < a.length(); i++) list.add(unwrap(a.get(i)));
            return list;
        }
        if (v instanceof JSONObject) {
            JSONObject o = (JSONObject) v;
            Map<String, Object> map = new HashMap<>();
            Iterator<String> keys = o.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                map.put(k, unwrap(o.get(k)));
            }
            return map;
        }
        if (v instanceof Number) {
            double d = ((Number) v).doubleValue();
            if (d == Math.rint(d) && d <= Integer.MAX_VALUE && d >= Integer.MIN_VALUE) return (int) d;
            return d;
        }
        return v;
    }

    static String toJson(Object v) {
        try {
            if (v instanceof List) return new JSONArray((List<?>) v).toString();
            if (v instanceof Map) return new JSONObject((Map<?, ?>) v).toString();
            return JSONObject.wrap(v) == null ? String.valueOf(v) : JSONObject.wrap(v).toString();
        } catch (Exception e) {
            return "null";
        }
    }
}
