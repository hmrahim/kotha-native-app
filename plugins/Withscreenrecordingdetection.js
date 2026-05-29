/**
 * withScreenRecordingDetection.js
 * Screen record detect করবে এবং optional block করবে
 *
 * Usage: ["./plugins/withScreenRecordingDetection", { "blockRecording": false }]
 *
 * JS থেকে:
 *   import { NativeModules, NativeEventEmitter } from 'react-native'
 *   const { ScreenRecordDetector } = NativeModules
 *   const emitter = new NativeEventEmitter(ScreenRecordDetector)
 *   emitter.addListener('ScreenRecordingStarted', () => { ... })
 *   emitter.addListener('ScreenRecordingStopped', () => { ... })
 *   ScreenRecordDetector.blockRecording(true)   // block on
 *   ScreenRecordDetector.blockRecording(false)  // block off
 */

const {
  withMainActivity,
  withMainApplication,
  withDangerousMod,
} = require('@expo/config-plugins')
const fs   = require('fs')
const path = require('path')

const PKG      = 'com.kotha.screenrecord'
const PKG_PATH = PKG.replace(/\./g, '/')

const MODULE_JAVA = `package ${PKG};

import android.app.Activity;
import android.view.WindowManager;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class ScreenRecordDetectorModule extends ReactContextBaseJavaModule {
    private static ReactApplicationContext reactCtx;

    public ScreenRecordDetectorModule(ReactApplicationContext ctx) {
        super(ctx);
        reactCtx = ctx;
    }

    public static void emitEvent(String event) {
        if (reactCtx == null || !reactCtx.hasActiveCatalystInstance()) return;
        try {
            reactCtx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(event, null);
        } catch (Exception ignored) {}
    }

    @Override public String getName() { return "ScreenRecordDetector"; }

    @ReactMethod
    public void blockRecording(boolean block) {
        final Activity a = getCurrentActivity();
        if (a == null) return;
        a.runOnUiThread(() -> {
            if (block) {
                a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            } else {
                a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
        });
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

public class ScreenRecordDetectorPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext ctx) {
        return Arrays.<NativeModule>asList(new ScreenRecordDetectorModule(ctx));
    }
    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext ctx) {
        return Collections.emptyList();
    }
}
`

module.exports = function withScreenRecordingDetection(config, options = {}) {
  const blockRecording = options.blockRecording === true

  // Java files
  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const root = mod.modRequest.platformProjectRoot
      const dir  = path.join(root, 'app/src/main/java', PKG_PATH)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'ScreenRecordDetectorModule.java'),  MODULE_JAVA)
      fs.writeFileSync(path.join(dir, 'ScreenRecordDetectorPackage.java'), PACKAGE_JAVA)
      return mod
    },
  ])

  // MainActivity inject
  config = withMainActivity(config, (mod) => {
    let src = mod.modResults.contents
    const isKt = mod.modResults.language === 'kt'

    if (src.includes('ScreenRecordDetectorModule')) return mod

    if (isKt) {
      const imports = [
        'import android.os.Build',
        'import android.view.WindowManager',
        `import ${PKG}.ScreenRecordDetectorModule`,
      ]
      imports.forEach((imp) => {
        if (!src.includes(imp)) {
          src = src.replace(/(package [^\n]+\n)/, `$1\n${imp}`)
        }
      })

      const detectCode = `
    // ── Screen Recording Detection ────────────────────────────
    ${blockRecording ? 'window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)' : '// detect mode — FLAG_SECURE off'}
    if (Build.VERSION.SDK_INT >= 34) {
      try {
        val wm = getSystemService(android.view.WindowManager::class.java)
        wm?.addMediaProjectionCallback(mainExecutor, object :
          android.media.projection.MediaProjectionManager.MediaProjectionCallback() {
          override fun onStop() {
            ScreenRecordDetectorModule.emitEvent("ScreenRecordingStopped")
          }
        })
      } catch (e: Exception) {}
    }
    // ─────────────────────────────────────────────────────────`

      src = src.replace(/super\.onCreate\(null\)/, `super.onCreate(null)\n${detectCode}`)

    } else {
      const imports = [
        'import android.os.Build;',
        'import android.view.WindowManager;',
        `import ${PKG}.ScreenRecordDetectorModule;`,
      ]
      imports.forEach((imp) => {
        if (!src.includes(imp)) {
          src = src.replace(/(package [^;\n]+;\s*\n)/, `$1\n${imp}`)
        }
      })

      const detectCode = `
    // ── Screen Recording Detection ────────────────────────────
    ${blockRecording ? 'getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);' : '// detect mode — FLAG_SECURE off'}
    if (Build.VERSION.SDK_INT >= 34) {
      try {
        android.view.WindowManager wm2 = (android.view.WindowManager) getSystemService(android.view.WindowManager.class);
        if (wm2 != null) {
          wm2.addMediaProjectionCallback(getMainExecutor(),
            new android.media.projection.MediaProjectionManager.MediaProjectionCallback() {
              @Override public void onStop() {
                ScreenRecordDetectorModule.emitEvent("ScreenRecordingStopped");
              }
            });
        }
      } catch (Exception ignored) {}
    }
    // ─────────────────────────────────────────────────────────`

      src = src.replace(/super\.onCreate\(null\);/, `super.onCreate(null);\n${detectCode}`)
    }

    mod.modResults.contents = src
    return mod
  })

  // MainApplication
  config = withMainApplication(config, (mod) => {
    let src = mod.modResults.contents
    const isKt = mod.modResults.language === 'kt'

    if (isKt) {
      const importLine = `import ${PKG}.ScreenRecordDetectorPackage`
      if (!src.includes(importLine)) {
        src = src.replace(/(package [^\n]+\n)/, `$1\n${importLine}`)
      }
      if (!src.includes('ScreenRecordDetectorPackage()')) {
        if (/val\s+packages\s*=\s*PackageList\(this\)\.packages/.test(src)) {
          src = src.replace(
            /(val\s+packages\s*=\s*PackageList\(this\)\.packages[^\n]*\n)/,
            `$1            packages.add(ScreenRecordDetectorPackage())\n`
          )
        } else {
          src = src.replace(
            /PackageList\(this\)\.packages(?!\.)/,
            `PackageList(this).packages.apply { add(ScreenRecordDetectorPackage()) }`
          )
        }
      }
    } else {
      const importLine = `import ${PKG}.ScreenRecordDetectorPackage;`
      if (!src.includes(importLine)) {
        src = src.replace(/(package [^;\n]+;\s*\n)/, `$1\n${importLine}`)
      }
      if (!src.includes('new ScreenRecordDetectorPackage()')) {
        src = src.replace(
          /(List<ReactPackage>\s+packages\s*=\s*new\s+PackageList\(this\)\.getPackages\(\)\s*;)/,
          `$1\n      packages.add(new ScreenRecordDetectorPackage());`
        )
      }
    }

    mod.modResults.contents = src
    return mod
  })

  return config
}