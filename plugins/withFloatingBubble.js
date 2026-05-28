const {
    withAndroidManifest,
    withMainApplication,
    withMainActivity,
    withDangerousMod,
} = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

const PKG = 'com.kotha.floatingbubble'
const PKG_PATH = PKG.replace(/\./g, '/')

const FLOATING_BUBBLE_MODULE = `package ${PKG};

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Rational;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class FloatingBubbleModule extends ReactContextBaseJavaModule {
    private static ReactApplicationContext reactContext;

    public FloatingBubbleModule(ReactApplicationContext context) {
        super(context);
        reactContext = context;
    }

    @Override
    public String getName() { return "FloatingBubble"; }

    public static void emit(String event, Object data) {
        if (reactContext == null) return;
        try {
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                       .emit(event, data);
        } catch (Exception ignored) {}
    }

    @ReactMethod
    public void hasOverlayPermission(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                promise.resolve(Settings.canDrawOverlays(reactContext));
            } else {
                promise.resolve(true);
            }
        } catch (Exception e) { promise.resolve(false); }
    }

    @ReactMethod
    public void requestOverlayPermission() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && !Settings.canDrawOverlays(reactContext)) {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + reactContext.getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(intent);
            }
        } catch (Exception ignored) {}
    }

    @ReactMethod
    public void show(ReadableMap config) {
        try {
            Intent intent = new Intent(reactContext, FloatingBubbleService.class);
            intent.setAction("SHOW");
            if (config != null) {
                if (config.hasKey("peerName"))  intent.putExtra("peerName",  config.getString("peerName"));
                if (config.hasKey("callType"))  intent.putExtra("callType",  config.getString("callType"));
                if (config.hasKey("avatar"))    intent.putExtra("avatar",    config.getString("avatar"));
                if (config.hasKey("startedAt")) intent.putExtra("startedAt", (long) config.getDouble("startedAt"));
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent);
            } else {
                reactContext.startService(intent);
            }
        } catch (Exception ignored) {}
    }

    @ReactMethod
    public void hide() {
        try {
            Intent intent = new Intent(reactContext, FloatingBubbleService.class);
            reactContext.stopService(intent);
        } catch (Exception ignored) {}
    }

    @ReactMethod
    public void enterPictureInPicture(boolean isVideo, Promise promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                promise.resolve(false);
                return;
            }
            final Activity activity = getCurrentActivity();
            if (activity == null) { promise.resolve(false); return; }

            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Rational ratio = new Rational(9, 16);
                        PictureInPictureParams.Builder b = new PictureInPictureParams.Builder()
                                .setAspectRatio(ratio);
                        boolean ok = activity.enterPictureInPictureMode(b.build());
                        promise.resolve(ok);
                    } catch (Exception e) {
                        promise.resolve(false);
                    }
                }
            });
        } catch (Exception e) {
            promise.resolve(false);
        }
    }

    @ReactMethod public void addListener(String e) {}
    @ReactMethod public void removeListeners(Integer c) {}
}
`

const FLOATING_BUBBLE_SERVICE = `package ${PKG};

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Chronometer;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

public class FloatingBubbleService extends Service {
    private static final String CHANNEL_ID = "floating_call_bubble";
    private static final int NOTIF_ID = 1337;
    private WindowManager wm;
    private View bubbleView;
    private WindowManager.LayoutParams params;
    private String currentCallType = "voice";
    private boolean foregroundStarted = false;

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        // NOTE: Do NOT call startForeground here.
        // startForeground MUST be called in onStartCommand within 5 seconds.
    }

    private void startInForeground(String callType) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Call in progress", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(ch);

            Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
            PendingIntent pi = null;
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                              | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                              | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                pi = PendingIntent.getActivity(this, 0, launch,
                        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            }

            Notification n = new Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("Call in progress")
                .setContentText("Tap to return to call")
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    int type = "video".equals(callType)
                        ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                            | ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
                        : ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
                    startForeground(NOTIF_ID, n, type);
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    int type = "video".equals(callType)
                        ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                            | ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
                        : ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
                    startForeground(NOTIF_ID, n, type);
                } else {
                    startForeground(NOTIF_ID, n);
                }
            } catch (Exception e) {
                try { startForeground(NOTIF_ID, n); } catch (Exception ignored) {}
            }
        } else {
            Notification n = new Notification.Builder(this)
                .setContentTitle("Call in progress")
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setOngoing(true)
                .build();
            startForeground(NOTIF_ID, n);
        }
        foregroundStarted = true;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String callType = intent != null && intent.hasExtra("callType")
            ? intent.getStringExtra("callType") : "voice";
        String peerName = intent != null && intent.hasExtra("peerName")
            ? intent.getStringExtra("peerName") : "Calling";
        long startedAt = intent != null && intent.hasExtra("startedAt")
            ? intent.getLongExtra("startedAt", 0) : 0;

        // CRITICAL: startForeground must be called immediately in onStartCommand
        if (!foregroundStarted || !callType.equals(currentCallType)) {
            currentCallType = callType;
            startInForeground(callType);
        }

        boolean canDraw = Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || Settings.canDrawOverlays(this);
        if (canDraw) {
            showBubble(peerName, callType, startedAt);
        }
        return START_NOT_STICKY;
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private void showBubble(String peerName, String callType, long startedAt) {
        if (bubbleView != null) return;

        FrameLayout root = new FrameLayout(this);
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setColor(Color.parseColor("#F0101626"));
        bg.setCornerRadius(dp(22));
        bg.setStroke(dp(1), Color.parseColor("#334F8EF7"));
        root.setBackground(bg);
        root.setPadding(dp(12), dp(10), dp(12), dp(10));
        root.setElevation(dp(8));

        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.HORIZONTAL);
        container.setGravity(Gravity.CENTER_VERTICAL);

        FrameLayout iconWrap = new FrameLayout(this);
        LinearLayout.LayoutParams iw = new LinearLayout.LayoutParams(dp(40), dp(40));
        iw.setMargins(0, 0, dp(10), 0);
        iconWrap.setLayoutParams(iw);
        android.graphics.drawable.GradientDrawable iconBg = new android.graphics.drawable.GradientDrawable();
        iconBg.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        boolean isVideo = "video".equals(callType);
        iconBg.setColor(isVideo ? Color.parseColor("#334F8EF7") : Color.parseColor("#3300E5A0"));
        iconWrap.setBackground(iconBg);

        ImageView ic = new ImageView(this);
        ic.setImageResource(isVideo ? android.R.drawable.ic_menu_camera : android.R.drawable.ic_menu_call);
        ic.setColorFilter(isVideo ? Color.parseColor("#4F8EF7") : Color.parseColor("#00E5A0"));
        FrameLayout.LayoutParams icLp = new FrameLayout.LayoutParams(dp(22), dp(22));
        icLp.gravity = Gravity.CENTER;
        ic.setLayoutParams(icLp);
        iconWrap.addView(ic);

        LinearLayout textCol = new LinearLayout(this);
        textCol.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams tcLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        textCol.setLayoutParams(tcLp);

        TextView name = new TextView(this);
        name.setText(peerName == null || peerName.isEmpty() ? "Calling" : peerName);
        name.setTextColor(Color.WHITE);
        name.setTextSize(13);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        name.setMaxLines(1);
        name.setEllipsize(android.text.TextUtils.TruncateAt.END);

        Chronometer chrono = new Chronometer(this);
        chrono.setTextColor(isVideo ? Color.parseColor("#4F8EF7") : Color.parseColor("#00E5A0"));
        chrono.setTextSize(11);
        if (startedAt > 0) {
            long base = SystemClock.elapsedRealtime() - (System.currentTimeMillis() - startedAt);
            chrono.setBase(base);
        } else {
            chrono.setBase(SystemClock.elapsedRealtime());
        }
        chrono.start();

        textCol.addView(name);
        textCol.addView(chrono);

        final FrameLayout endBtn = new FrameLayout(this);
        LinearLayout.LayoutParams ebLp = new LinearLayout.LayoutParams(dp(36), dp(36));
        ebLp.setMargins(dp(10), 0, 0, 0);
        endBtn.setLayoutParams(ebLp);
        android.graphics.drawable.GradientDrawable endBg = new android.graphics.drawable.GradientDrawable();
        endBg.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        endBg.setColor(Color.parseColor("#FF4560"));
        endBtn.setBackground(endBg);

        ImageView endIc = new ImageView(this);
        endIc.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        endIc.setColorFilter(Color.WHITE);
        FrameLayout.LayoutParams endLp = new FrameLayout.LayoutParams(dp(18), dp(18));
        endLp.gravity = Gravity.CENTER;
        endIc.setLayoutParams(endLp);
        endBtn.addView(endIc);

        endBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                FloatingBubbleModule.emit("BubbleEndCallPressed", null);
            }
        });

        container.addView(iconWrap);
        container.addView(textCol);
        container.addView(endBtn);
        root.addView(container);

        root.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                FloatingBubbleModule.emit("BubbleTapped", null);
                try {
                    Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
                    if (launch != null) {
                        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                                      | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                                      | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                        startActivity(launch);
                    }
                } catch (Exception ignored) {}
            }
        });

        int overlayType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        params = new WindowManager.LayoutParams(
            dp(248), ViewGroup.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = dp(12);
        params.y = dp(80);

        root.setOnTouchListener(new View.OnTouchListener() {
            int initX, initY;
            float touchX, touchY;
            long downAt;
            boolean dragging;
            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        initX = params.x; initY = params.y;
                        touchX = e.getRawX(); touchY = e.getRawY();
                        downAt = System.currentTimeMillis();
                        dragging = false;
                        return false;
                    case MotionEvent.ACTION_MOVE:
                        float dx = e.getRawX() - touchX;
                        float dy = e.getRawY() - touchY;
                        if (!dragging && (Math.abs(dx) > dp(6) || Math.abs(dy) > dp(6))) {
                            dragging = true;
                        }
                        if (dragging) {
                            params.x = initX + (int) dx;
                            params.y = initY + (int) dy;
                            try { wm.updateViewLayout(bubbleView, params); } catch (Exception ex) {}
                            return true;
                        }
                        return false;
                    case MotionEvent.ACTION_UP:
                        if (!dragging && System.currentTimeMillis() - downAt < 300) {
                            v.performClick();
                        }
                        return dragging;
                }
                return false;
            }
        });

        bubbleView = root;
        try { wm.addView(bubbleView, params); } catch (Exception ignored) {}
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (bubbleView != null && wm != null) {
            try { wm.removeView(bubbleView); } catch (Exception ignored) {}
            bubbleView = null;
        }
    }
}
`

const FLOATING_BUBBLE_PACKAGE = `package ${PKG};

import androidx.annotation.NonNull;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class FloatingBubblePackage implements ReactPackage {
    @NonNull
    @Override
    public List<NativeModule> createNativeModules(@NonNull ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new FloatingBubbleModule(reactContext));
        return modules;
    }

    @NonNull
    @Override
    public List<ViewManager> createViewManagers(@NonNull ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
`

const withJavaSources = (config) =>
    withDangerousMod(config, [
        'android',
        async (cfg) => {
            const root = cfg.modRequest.platformProjectRoot
            const javaDir = path.join(root, 'app', 'src', 'main', 'java', PKG_PATH)
            fs.mkdirSync(javaDir, { recursive: true })
            fs.writeFileSync(path.join(javaDir, 'FloatingBubbleModule.java'), FLOATING_BUBBLE_MODULE)
            fs.writeFileSync(path.join(javaDir, 'FloatingBubbleService.java'), FLOATING_BUBBLE_SERVICE)
            fs.writeFileSync(path.join(javaDir, 'FloatingBubblePackage.java'), FLOATING_BUBBLE_PACKAGE)
            return cfg
        },
    ])

const withManifest = (config) =>
    withAndroidManifest(config, (cfg) => {
        const manifest = cfg.modResults.manifest
        manifest['uses-permission'] = manifest['uses-permission'] || []

        const addPerm = (p) => {
            if (!manifest['uses-permission'].find((x) => x.$?.['android:name'] === p)) {
                manifest['uses-permission'].push({ $: { 'android:name': p } })
            }
        }
        addPerm('android.permission.FOREGROUND_SERVICE')
        addPerm('android.permission.FOREGROUND_SERVICE_MICROPHONE')
        addPerm('android.permission.FOREGROUND_SERVICE_CAMERA')
        addPerm('android.permission.SYSTEM_ALERT_WINDOW')
        addPerm('android.permission.POST_NOTIFICATIONS')

        const app = manifest.application?.[0]
        if (!app) return cfg

        app.service = app.service || []
        const svcName = `${PKG}.FloatingBubbleService`
        const existsSvc = app.service.find((s) => s.$['android:name'] === svcName)
        if (!existsSvc) {
            app.service.push({
                $: {
                    'android:name': svcName,
                    'android:exported': 'false',
                    'android:foregroundServiceType': 'microphone|camera',
                },
            })
        } else {
            existsSvc.$['android:foregroundServiceType'] = 'microphone|camera'
        }

        const activities = app.activity || []
        const main = activities.find(
            (a) => a.$['android:name'] === '.MainActivity'
                || a.$['android:name']?.endsWith('MainActivity'))
        if (main) {
            main.$['android:supportsPictureInPicture'] = 'true'
            main.$['android:resizeableActivity'] = 'true'
            const cur = main.$['android:configChanges'] || ''
            const needed = ['screenSize', 'smallestScreenSize', 'screenLayout', 'orientation', 'keyboardHidden']
            const parts = new Set(cur.split('|').filter(Boolean))
            needed.forEach((n) => parts.add(n))
            main.$['android:configChanges'] = Array.from(parts).join('|')
        }
        return cfg
    })

const withRegisterPackage = (config) =>
    withMainApplication(config, (cfg) => {
        let src = cfg.modResults.contents
        const language = cfg.modResults.language

        if (language === 'kt') {
            const importLine = `import ${PKG}.FloatingBubblePackage`
            if (!src.includes(importLine)) {
                src = src.replace(
                    /(package [^\n]+\n)/,
                    `$1\n${importLine}\n`
                )
            }

            if (!src.includes('FloatingBubblePackage()')) {
                if (/val\s+packages\s*=\s*PackageList\(this\)\.packages/.test(src)) {
                    src = src.replace(
                        /(val\s+packages\s*=\s*PackageList\(this\)\.packages[^\n]*\n)/,
                        `$1            packages.add(FloatingBubblePackage())\n`
                    )
                } else if (/PackageList\(this\)\.packages\.apply\s*\{/.test(src)) {
                    src = src.replace(
                        /(PackageList\(this\)\.packages\.apply\s*\{[^\n]*\n)/,
                        `$1                add(FloatingBubblePackage())\n`
                    )
                } else if (/PackageList\(this\)\.packages(?!\.)/.test(src)) {
                    src = src.replace(
                        /PackageList\(this\)\.packages(?!\.)/,
                        `PackageList(this).packages.apply { add(FloatingBubblePackage()) }`
                    )
                }
            }
        } else {
            const importLine = `import ${PKG}.FloatingBubblePackage;`
            if (!src.includes(importLine)) {
                src = src.replace(
                    /(package [^\n;]+;\r?\n)/,
                    `$1\n${importLine}\n`
                )
            }
            if (!src.includes('new FloatingBubblePackage()')) {
                src = src.replace(
                    /(List<ReactPackage>\s+packages\s*=\s*new\s+PackageList\(this\)\.getPackages\(\)\s*;)/,
                    `$1\n      packages.add(new FloatingBubblePackage());`
                )
            }
        }

        cfg.modResults.contents = src
        return cfg
    })

const withMainActivityPiPHook = (config) =>
    withMainActivity(config, (cfg) => {
        let src = cfg.modResults.contents
        const language = cfg.modResults.language

        if (language === 'kt') {
            const importLines = [
                'import android.content.res.Configuration',
                `import ${PKG}.FloatingBubbleModule`,
            ]
            importLines.forEach((imp) => {
                if (!src.includes(imp)) {
                    src = src.replace(
                        /(package [^\n]+\n)/,
                        `$1\n${imp}\n`
                    )
                }
            })

            if (!src.includes('onPictureInPictureModeChanged')) {
                const hook = `
  override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    FloatingBubbleModule.emit("PiPModeChanged", isInPictureInPictureMode)
  }
`
                src = src.replace(/\n}\s*$/m, `${hook}\n}\n`)
            }
        } else {
            const importLines = [
                'import android.content.res.Configuration;',
                `import ${PKG}.FloatingBubbleModule;`,
            ]
            importLines.forEach((imp) => {
                if (!src.includes(imp)) {
                    src = src.replace(
                        /(package [^\n;]+;\r?\n)/,
                        `$1\n${imp}\n`
                    )
                }
            })

            if (!src.includes('onPictureInPictureModeChanged')) {
                const hook = `
  @Override
  public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
    FloatingBubbleModule.emit("PiPModeChanged", isInPictureInPictureMode);
  }
`
                src = src.replace(/\n}\s*$/m, `${hook}\n}\n`)
            }
        }

        cfg.modResults.contents = src
        return cfg
    })

module.exports = (config) => {
    config = withJavaSources(config)
    config = withManifest(config)
    config = withRegisterPackage(config)
    config = withMainActivityPiPHook(config)
    return config
}