/**
 * withBackgroundLocation.js
 * App বন্ধ থাকলেও location track করবে
 *
 * Usage: ["./plugins/withBackgroundLocation", {
 *   "apiEndpoint": "https://kotha-server-c5wy.onrender.com/api/location",
 *   "intervalSeconds": 30
 * }]
 *
 * JS থেকে:
 *   import { NativeModules } from 'react-native'
 *   const { BackgroundLocation } = NativeModules
 *   BackgroundLocation.start({ userId: 'abc123' })
 *   BackgroundLocation.stop()
 *   const loc = await BackgroundLocation.getCurrentLocation()
 *   // → { latitude, longitude, accuracy, timestamp }
 */

const {
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
} = require('@expo/config-plugins')
const fs   = require('fs')
const path = require('path')

const PKG      = 'com.kotha.bglocation'
const PKG_PATH = PKG.replace(/\./g, '/')

module.exports = function withBackgroundLocation(config, options = {}) {
  const apiEndpoint = options.apiEndpoint || 'https://kotha-server-c5wy.onrender.com/api/location'
  const intervalMs  = (options.intervalSeconds || 30) * 1000

  const LOCATION_SERVICE = `package ${PKG};

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class LocationService extends Service implements LocationListener {
    private static final String CHANNEL_ID  = "kotha_bg_location";
    private static final long   INTERVAL    = ${intervalMs}L;
    private static final String ENDPOINT    = "${apiEndpoint}";

    private LocationManager lm;
    private String userId = "";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.hasExtra("userId")) {
            userId = intent.getStringExtra("userId");
        }
        createChannel();
        Notification notif = new Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Kotha")
            .setContentText("Location active")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(2001, notif,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(2001, notif);
        }
        lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        try {
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER,     INTERVAL, 0f, this);
            lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, INTERVAL, 0f, this);
        } catch (SecurityException ignored) {}
        return START_STICKY;
    }

    @Override
    public void onLocationChanged(Location loc) {
        post(loc.getLatitude(), loc.getLongitude(), loc.getAccuracy(), loc.getTime());
    }

    private void post(double lat, double lng, float acc, long ts) {
        new Thread(() -> {
            try {
                URL url = new URL(ENDPOINT);
                HttpURLConnection c = (HttpURLConnection) url.openConnection();
                c.setRequestMethod("POST");
                c.setRequestProperty("Content-Type", "application/json");
                c.setDoOutput(true);
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                String body = "{\\"userId\\":\\"" + userId + "\\"," +
                    "\\"latitude\\":" + lat + ",\\"longitude\\":" + lng + "," +
                    "\\"accuracy\\":" + acc + ",\\"timestamp\\":" + ts + "}";
                try (OutputStream os = c.getOutputStream()) {
                    os.write(body.getBytes(StandardCharsets.UTF_8));
                }
                c.getResponseCode();
                c.disconnect();
            } catch (Exception ignored) {}
        }).start();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Background Location", NotificationManager.IMPORTANCE_LOW);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE))
                .createNotificationChannel(ch);
        }
    }

    @Override public void onDestroy() { super.onDestroy(); if (lm != null) lm.removeUpdates(this); }
    @Override public IBinder onBind(Intent i) { return null; }
    @Override public void onStatusChanged(String p, int s, Bundle e) {}
    @Override public void onProviderEnabled(String p) {}
    @Override public void onProviderDisabled(String p) {}
}
`

  const MODULE_JAVA = `package ${PKG};

import android.content.Intent;
import android.location.Location;
import android.location.LocationManager;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;

public class BackgroundLocationModule extends ReactContextBaseJavaModule {
    public BackgroundLocationModule(ReactApplicationContext ctx) { super(ctx); }

    @Override public String getName() { return "BackgroundLocation"; }

    @ReactMethod
    public void start(ReadableMap options) {
        String uid = options != null && options.hasKey("userId")
            ? options.getString("userId") : "";
        Intent i = new Intent(getReactApplicationContext(), LocationService.class);
        i.putExtra("userId", uid);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            getReactApplicationContext().startForegroundService(i);
        } else {
            getReactApplicationContext().startService(i);
        }
    }

    @ReactMethod
    public void stop() {
        getReactApplicationContext().stopService(
            new Intent(getReactApplicationContext(), LocationService.class));
    }

    @ReactMethod
    public void getCurrentLocation(Promise promise) {
        try {
            LocationManager lm = (LocationManager)
                getReactApplicationContext().getSystemService(android.content.Context.LOCATION_SERVICE);
            Location loc = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (loc == null) loc = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            if (loc == null) { promise.reject("NO_LOCATION", "Not available"); return; }
            WritableMap m = Arguments.createMap();
            m.putDouble("latitude",  loc.getLatitude());
            m.putDouble("longitude", loc.getLongitude());
            m.putDouble("accuracy",  loc.getAccuracy());
            m.putDouble("timestamp", loc.getTime());
            promise.resolve(m);
        } catch (SecurityException e) {
            promise.reject("PERMISSION", "Location permission denied");
        }
    }

    @ReactMethod public void addListener(String e) {}
    @ReactMethod public void removeListeners(Integer c) {}
}
`

  const PACKAGE_JAVA = `package ${PKG};

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public class BackgroundLocationPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext ctx) {
        return Arrays.<NativeModule>asList(new BackgroundLocationModule(ctx));
    }
    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext ctx) {
        return Collections.emptyList();
    }
}
`

  // Java files
  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const root = mod.modRequest.platformProjectRoot
      const dir  = path.join(root, 'app/src/main/java', PKG_PATH)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'LocationService.java'),           LOCATION_SERVICE)
      fs.writeFileSync(path.join(dir, 'BackgroundLocationModule.java'),  MODULE_JAVA)
      fs.writeFileSync(path.join(dir, 'BackgroundLocationPackage.java'), PACKAGE_JAVA)
      return mod
    },
  ])

  // AndroidManifest — permissions + service
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest
    const app      = manifest.application[0]

    if (!manifest['uses-permission']) manifest['uses-permission'] = []
    const perms = [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.INTERNET',
    ]
    perms.forEach((p) => {
      if (!manifest['uses-permission'].some((x) => x.$?.['android:name'] === p)) {
        manifest['uses-permission'].push({ $: { 'android:name': p } })
      }
    })

    if (!app.service) app.service = []
    if (!app.service.some((s) => s.$?.['android:name']?.includes('LocationService'))) {
      app.service.push({
        $: {
          'android:name':                  `${PKG}.LocationService`,
          'android:foregroundServiceType': 'location',
          'android:exported':              'false',
        },
      })
    }

    return mod
  })

  // MainApplication
  config = withMainApplication(config, (mod) => {
    let src = mod.modResults.contents
    const isKt = mod.modResults.language === 'kt'

    if (isKt) {
      const importLine = `import ${PKG}.BackgroundLocationPackage`
      if (!src.includes(importLine)) {
        src = src.replace(/(package [^\n]+\n)/, `$1\n${importLine}`)
      }
      if (!src.includes('BackgroundLocationPackage()')) {
        if (/val\s+packages\s*=\s*PackageList\(this\)\.packages/.test(src)) {
          src = src.replace(
            /(val\s+packages\s*=\s*PackageList\(this\)\.packages[^\n]*\n)/,
            `$1            packages.add(BackgroundLocationPackage())\n`
          )
        } else {
          src = src.replace(
            /PackageList\(this\)\.packages(?!\.)/,
            `PackageList(this).packages.apply { add(BackgroundLocationPackage()) }`
          )
        }
      }
    } else {
      const importLine = `import ${PKG}.BackgroundLocationPackage;`
      if (!src.includes(importLine)) {
        src = src.replace(/(package [^;\n]+;\s*\n)/, `$1\n${importLine}`)
      }
      if (!src.includes('new BackgroundLocationPackage()')) {
        src = src.replace(
          /(List<ReactPackage>\s+packages\s*=\s*new\s+PackageList\(this\)\.getPackages\(\)\s*;)/,
          `$1\n      packages.add(new BackgroundLocationPackage());`
        )
      }
    }

    mod.modResults.contents = src
    return mod
  })

  return config
}