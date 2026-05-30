/**
 * withCallScreenLock.js
 *
 * এই plugin তিনটা কাজ করে:
 * 1. AndroidManifest.xml এ IncomingCallActivity declare করে
 *    (showWhenLocked + turnScreenOn + lockscreenOverlay সহ)
 * 2. IncomingCallActivity.java তৈরি করে
 *    — lock screen / screen off / app killed যেকোনো state এ কাজ করবে
 * 3. MainActivity তেও FLAG_SHOW_WHEN_LOCKED / setShowWhenLocked add করে
 */

const {
  withAndroidManifest,
  withMainActivity,
  withDangerousMod,
} = require('@expo/config-plugins')
const fs   = require('fs')
const path = require('path')

const APP_PKG = 'com.kotha.app'

// ─── Step 1: AndroidManifest.xml এ Activity declare ────────────────────────
function withCallActivityManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application[0]
    if (!app['activity']) app['activity'] = []

    // Remove old entry if exists (force update)
    app['activity'] = app['activity'].filter(
      (a) => a.$?.['android:name'] !== '.IncomingCallActivity'
    )

    app['activity'].push({
      $: {
        'android:name':                    '.IncomingCallActivity',
        'android:label':                   'Incoming Call',
        'android:theme':                   '@style/Theme.AppCompat.Light.NoActionBar',
        'android:exported':                'true',
        'android:launchMode':              'singleTask',
        'android:taskAffinity':            '',
        'android:showOnLockScreen':        'true',
        'android:turnScreenOn':            'true',
        'android:excludeFromRecents':      'true',
        'android:directBootAware':         'true',
        'android:screenOrientation':       'portrait',
      },
    })

    // ✅ USE_FULL_SCREEN_INTENT permission ensure
    if (!mod.modResults.manifest['uses-permission']) {
      mod.modResults.manifest['uses-permission'] = []
    }
    const perms = mod.modResults.manifest['uses-permission']
    const hasFullScreen = perms.some(
      (p) => p.$?.['android:name'] === 'android.permission.USE_FULL_SCREEN_INTENT'
    )
    if (!hasFullScreen) {
      perms.push({ $: { 'android:name': 'android.permission.USE_FULL_SCREEN_INTENT' } })
    }

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
      // Always overwrite to get latest version
      const src = `package ${APP_PKG};

import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import androidx.appcompat.app.AppCompatActivity;

/**
 * IncomingCallActivity
 *
 * Screen off / lock screen / app killed / background — যেকোনো state এ
 * incoming call screen দেখানোর জন্য।
 *
 * Notifee fullScreenAction দিয়ে এই Activity launch হয়।
 * এই Activity নিজে UI দেখায় না — সে MainActivity কে foreground এ আনে
 * তারপর নিজে finish() হয়।
 *
 * FIXES:
 * - FLAG_ACTIVITY_REORDER_TO_FRONT এর বদলে FLAG_ACTIVITY_NEW_TASK + extras forward
 * - BroadcastReceiver দিয়ে finish signal পাঠানো
 * - Keyguard dismiss করা
 * - Screen on করা (API 26 ও API 27+ উভয়)
 */
public class IncomingCallActivity extends AppCompatActivity {

    public static final String ACTION_FINISH = "${APP_PKG}.FINISH_INCOMING_CALL_ACTIVITY";
    private BroadcastReceiver finishReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // ── Step 1: Screen on + Lock screen bypass ────────────────────────
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) { // API 27+
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            if (km != null) {
                km.requestDismissKeyguard(this, null);
            }
        }
        // API 26 এর নিচেও এই flags দাও (deprecated কিন্তু older devices এ কাজ করে)
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED   |
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD   |
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON     |
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );

        // ── Step 2: BroadcastReceiver register (MainActivity signal এর জন্য) ──
        finishReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (ACTION_FINISH.equals(intent.getAction())) {
                    finish();
                }
            }
        };
        IntentFilter filter = new IntentFilter(ACTION_FINISH);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) { // API 33+
            registerReceiver(finishReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(finishReceiver, filter);
        }

        // ── Step 3: MainActivity launch করো ──────────────────────────────
        launchMainActivity();
    }

    private void launchMainActivity() {
        try {
            Intent mainIntent = new Intent(this, MainActivity.class);

            // ✅ KEY FLAGS:
            // FLAG_ACTIVITY_NEW_TASK — নতুন task stack এ launch
            // FLAG_ACTIVITY_SINGLE_TOP — already top এ থাকলে নতুন instance না বানিয়ে onNewIntent() call
            // FLAG_ACTIVITY_CLEAR_TOP — existing instance কে top এ আনো
            mainIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK     |
                Intent.FLAG_ACTIVITY_SINGLE_TOP   |
                Intent.FLAG_ACTIVITY_CLEAR_TOP
            );

            // Notifee / FCM data forward করো
            Bundle extras = getIntent().getExtras();
            if (extras != null) {
                mainIntent.putExtras(extras);
            }
            mainIntent.putExtra("openIncomingCall", true);
            mainIntent.putExtra("fromIncomingCallActivity", true);

            startActivity(mainIntent);

            // ✅ MainActivity launch হওয়ার পর এই Activity finish করো
            // একটু delay দাও যাতে MainActivity আগে আসতে পারে
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (!isFinishing()) {
                    finish();
                }
            }, 300);

        } catch (Exception e) {
            // Fallback: সরাসরি finish
            finish();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        try {
            if (finishReceiver != null) {
                unregisterReceiver(finishReceiver);
                finishReceiver = null;
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onBackPressed() {
        // Back press এ dismiss করতে দেবো না
        // User কে Accept/Decline করতে হবে
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

// ─── Export ───────────────────────────────────────────────────────────────
module.exports = function withCallScreenLock(config) {
  config = withCallActivityManifest(config)
  config = withIncomingCallActivity(config)
  config = withMainActivityFlags(config)
  return config
}
