/**
 * withCallScreenLock.js
 *
 * এই plugin তিনটা কাজ করে:
 * 1. AndroidManifest.xml এ IncomingCallActivity declare করে
 *    (showWhenLocked + turnScreenOn + lockscreenOverlay সহ)
 * 2. IncomingCallActivity.java/kt ফাইল তৈরি করে
 *    — lock screen এর উপরে, screen off থাকলেও screen জ্বালিয়ে দেখাবে
 * 3. MainActivity তেও FLAG_SHOW_WHEN_LOCKED / setShowWhenLocked add করে
 *    (app foreground এ থাকলে যেন কাজ করে)
 */

const {
  withAndroidManifest,
  withMainActivity,
  withDangerousMod,
} = require('@expo/config-plugins')
const fs   = require('fs')
const path = require('path')

const APP_PKG = 'com.kotha.app'  // তোমার package name

// ─── Step 1: AndroidManifest.xml এ Activity declare ────────────────────────
function withCallActivityManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application[0]
    if (!app['activity']) app['activity'] = []

    const already = app['activity'].some(
      (a) => a.$?.['android:name'] === '.IncomingCallActivity'
    )
    if (already) return mod

    app['activity'].push({
      $: {
        'android:name':                    '.IncomingCallActivity',
        'android:label':                   'Incoming Call',
        'android:theme':                   '@style/Theme.AppCompat.Light.NoActionBar',
        'android:exported':                'true',
        'android:launchMode':              'singleTask',
        'android:taskAffinity':            '',
        'android:showOnLockScreen':        'true',          // API < 27 fallback
        'android:turnScreenOn':            'true',
        'android:excludeFromRecents':      'true',
        'android:directBootAware':         'true',          // screen lock এর আগেও
      },
    })

    return mod
  })
}

// ─── Step 2: IncomingCallActivity.java তৈরি ──────────────────────────────
function withIncomingCallActivity(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const pkgPath  = APP_PKG.replace(/\./g, '/')
      const javaDir  = path.join(
        mod.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'java', pkgPath
      )
      fs.mkdirSync(javaDir, { recursive: true })

      const filePath = path.join(javaDir, 'IncomingCallActivity.java')
      if (fs.existsSync(filePath)) return mod   // already created

      const src = `package ${APP_PKG};

import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.appcompat.app.AppCompatActivity;

/**
 * IncomingCallActivity
 *
 * Screen off / lock screen / যেকোনো app এর উপরে incoming call UI দেখানোর জন্য।
 * Notifee fullScreenAction: { id: 'default', mainActivity: 'IncomingCallActivity' }
 * দিয়ে এই Activity launch হয়।
 *
 * এই Activity নিজে UI দেখায় না — সে MainActivity কে foreground এ আনে
 * এবং incoming-call route এ navigate করে তারপর নিজে finish() হয়।
 */
public class IncomingCallActivity extends AppCompatActivity {

    private BroadcastReceiver finishReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // ── Lock screen / screen off থাকলেও দেখাবে ──────────────────────
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) { // API 27+
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            // API 26 এর নিচে deprecated flags দিয়ে কাজ করবে
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED   |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD   |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON     |
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            );
        }

        // ── MainActivity কে foreground এ আনো (বা launch করো) ───────────
        Intent mainIntent = new Intent(this, MainActivity.class);
        mainIntent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK        |
            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        );
        // Notifee / FCM data forward করো
        Bundle extras = getIntent().getExtras();
        if (extras != null) mainIntent.putExtras(extras);
        mainIntent.putExtra("openIncomingCall", true);
        startActivity(mainIntent);

        // এই Activity এর কাজ শেষ
        finish();
    }
}
`
      fs.writeFileSync(filePath, src, 'utf8')
      return mod
    },
  ])
}

// ─── Step 3: MainActivity তেও lock screen flags add ──────────────────────
function withMainActivityFlags(config) {
  return withMainActivity(config, (mod) => {
    let src    = mod.modResults.contents
    const isKt = mod.modResults.language === 'kt'

    if (
      src.includes('FLAG_SHOW_WHEN_LOCKED') ||
      src.includes('setShowWhenLocked')
    ) return mod  // already patched

    if (isKt) {
      const imps = [
        'import android.app.KeyguardManager',
        'import android.os.Build',
        'import android.view.WindowManager',
      ]
      // Collect all missing imports and add them together after the package line
      const missingImps = imps.filter((imp) => !src.includes(imp))
      if (missingImps.length > 0) {
        src = src.replace(/(package [^\n]+\n)/, `$1\n${missingImps.join('\n')}\n`)
      }

      const code = `
    // ── Call Screen Lock (MainActivity) ──────────────────────────────────
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      (getSystemService(KEYGUARD_SERVICE) as? KeyguardManager)
        ?.requestDismissKeyguard(this, null)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    // ─────────────────────────────────────────────────────────────────────`

      src = src.replace(/super\.onCreate\(null\)/, `super.onCreate(null)\n${code}`)

    } else {
      const imps = [
        'import android.app.KeyguardManager;',
        'import android.os.Build;',
        'import android.view.WindowManager;',
      ]
      // Collect all missing imports and add them together after the package line
      const missingImps = imps.filter((imp) => !src.includes(imp))
      if (missingImps.length > 0) {
        src = src.replace(/(package [^;\n]+;\s*\n)/, `$1\n${missingImps.join('\n')}\n`)
      }

      const code = `
    // ── Call Screen Lock (MainActivity) ──────────────────────────────────
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true);
      setTurnScreenOn(true);
      KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
      if (km != null) km.requestDismissKeyguard(this, null);
    } else {
      getWindow().addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      );
    }
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    // ─────────────────────────────────────────────────────────────────────`

      src = src.replace(/super\.onCreate\(null\);/, `super.onCreate(null);\n${code}`)
    }

    mod.modResults.contents = src
    return mod
  })
}

// ─── Export: সব step একসাথে ───────────────────────────────────────────────
module.exports = function withCallScreenLock(config) {
  config = withCallActivityManifest(config)
  config = withIncomingCallActivity(config)
  config = withMainActivityFlags(config)
  return config
}