/**
 * withNotificationActions.js
 * Notification এ Reply + Mark as Read button
 *
 * JS থেকে event listen:
 *   import { NativeEventEmitter, NativeModules } from 'react-native'
 *   const emitter = new NativeEventEmitter(NativeModules.NotificationActions)
 *   emitter.addListener('NotifReply',      ({ messageId, text }) => { ... })
 *   emitter.addListener('NotifMarkAsRead', ({ messageId })        => { ... })
 */

const {
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
} = require('@expo/config-plugins')
const fs   = require('fs')
const path = require('path')

const PKG      = 'com.kotha.notifactions'
const PKG_PATH = PKG.replace(/\./g, '/')

const RECEIVER_JAVA = `package ${PKG};

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.app.RemoteInput;
import android.os.Bundle;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;

public class NotificationActionReceiver extends BroadcastReceiver {
    public static final String ACTION_REPLY        = "com.kotha.NOTIF_REPLY";
    public static final String ACTION_MARK_AS_READ = "com.kotha.NOTIF_MARK_AS_READ";
    public static final String KEY_REPLY           = "reply_text";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action    = intent.getAction();
        String messageId = intent.getStringExtra("messageId");

        com.facebook.react.bridge.ReactApplicationContext reactCtx =
            NotificationActionsModule.getReactContext();
        if (reactCtx == null || !reactCtx.hasActiveCatalystInstance()) return;

        WritableMap params = Arguments.createMap();
        params.putString("messageId", messageId != null ? messageId : "");

        if (ACTION_REPLY.equals(action)) {
            Bundle results = RemoteInput.getResultsFromIntent(intent);
            String replyText = results != null
                ? results.getCharSequence(KEY_REPLY, "").toString() : "";
            params.putString("text", replyText);
            reactCtx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("NotifReply", params);
        } else if (ACTION_MARK_AS_READ.equals(action)) {
            reactCtx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("NotifMarkAsRead", params);
        }
    }
}
`

const MODULE_JAVA = `package ${PKG};

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class NotificationActionsModule extends ReactContextBaseJavaModule {
    private static ReactApplicationContext reactCtx;

    public NotificationActionsModule(ReactApplicationContext ctx) {
        super(ctx);
        reactCtx = ctx;
    }

    public static ReactApplicationContext getReactContext() { return reactCtx; }

    @Override
    public String getName() { return "NotificationActions"; }

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

public class NotificationActionsPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext ctx) {
        return Arrays.<NativeModule>asList(new NotificationActionsModule(ctx));
    }
    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext ctx) {
        return Collections.emptyList();
    }
}
`

module.exports = function withNotificationActions(config) {
  // Java files
  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const root = mod.modRequest.platformProjectRoot
      const dir  = path.join(root, 'app/src/main/java', PKG_PATH)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'NotificationActionReceiver.java'), RECEIVER_JAVA)
      fs.writeFileSync(path.join(dir, 'NotificationActionsModule.java'),  MODULE_JAVA)
      fs.writeFileSync(path.join(dir, 'NotificationActionsPackage.java'), PACKAGE_JAVA)
      return mod
    },
  ])

  // AndroidManifest — receiver declare
  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application[0]
    if (!app.receiver) app.receiver = []
    const already = app.receiver.some(
      (r) => r.$?.['android:name']?.includes('NotificationActionReceiver')
    )
    if (!already) {
      app.receiver.push({
        $: {
          'android:name':     `${PKG}.NotificationActionReceiver`,
          'android:exported': 'false',
        },
        'intent-filter': [{
          action: [
            { $: { 'android:name': 'com.kotha.NOTIF_REPLY' } },
            { $: { 'android:name': 'com.kotha.NOTIF_MARK_AS_READ' } },
          ],
        }],
      })
    }
    return mod
  })

  // MainApplication — package register
  config = withMainApplication(config, (mod) => {
    let src = mod.modResults.contents
    const isKt = mod.modResults.language === 'kt'

    if (isKt) {
      const importLine = `import ${PKG}.NotificationActionsPackage`
      if (!src.includes(importLine)) {
        src = src.replace(/(package [^\n]+\n)/, `$1\n${importLine}`)
      }
      if (!src.includes('NotificationActionsPackage()')) {
        if (/val\s+packages\s*=\s*PackageList\(this\)\.packages/.test(src)) {
          src = src.replace(
            /(val\s+packages\s*=\s*PackageList\(this\)\.packages[^\n]*\n)/,
            `$1            packages.add(NotificationActionsPackage())\n`
          )
        } else {
          src = src.replace(
            /PackageList\(this\)\.packages(?!\.)/,
            `PackageList(this).packages.apply { add(NotificationActionsPackage()) }`
          )
        }
      }
    } else {
      const importLine = `import ${PKG}.NotificationActionsPackage;`
      if (!src.includes(importLine)) {
        src = src.replace(/(package [^;\n]+;\s*\n)/, `$1\n${importLine}`)
      }
      if (!src.includes('new NotificationActionsPackage()')) {
        src = src.replace(
          /(List<ReactPackage>\s+packages\s*=\s*new\s+PackageList\(this\)\.getPackages\(\)\s*;)/,
          `$1\n      packages.add(new NotificationActionsPackage());`
        )
      }
    }

    mod.modResults.contents = src
    return mod
  })

  return config
}