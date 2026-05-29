/**
 * withCallScreenLock.js
 * Incoming call lock screen এ দেখাবে + screen জ্বলবে
 * FLAG_SHOW_WHEN_LOCKED | FLAG_TURN_SCREEN_ON | FLAG_KEEP_SCREEN_ON
 */

const { withMainActivity } = require('@expo/config-plugins')

module.exports = function withCallScreenLock(config) {
  return withMainActivity(config, (mod) => {
    let src = mod.modResults.contents
    const isKt = mod.modResults.language === 'kt'

    if (src.includes('FLAG_SHOW_WHEN_LOCKED') || src.includes('setShowWhenLocked')) {
      return mod
    }

    if (isKt) {
      // Kotlin imports
      const imports = [
        'import android.os.Build',
        'import android.view.WindowManager',
      ]
      imports.forEach((imp) => {
        if (!src.includes(imp)) {
          src = src.replace(/(package [^\n]+\n)/, `$1\n${imp}`)
        }
      })

      const lockCode = `
    // ── Call Screen Lock ──────────────────────────────────────
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    // ─────────────────────────────────────────────────────────`

      src = src.replace(/super\.onCreate\(null\)/, `super.onCreate(null)\n${lockCode}`)

    } else {
      // Java imports
      const imports = [
        'import android.os.Build;',
        'import android.view.WindowManager;',
      ]
      imports.forEach((imp) => {
        if (!src.includes(imp)) {
          src = src.replace(/(package [^;\n]+;\s*\n)/, `$1\n${imp}`)
        }
      })

      const lockCode = `
    // ── Call Screen Lock ──────────────────────────────────────
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true);
      setTurnScreenOn(true);
    } else {
      getWindow().addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      );
    }
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    // ─────────────────────────────────────────────────────────`

      src = src.replace(/super\.onCreate\(null\);/, `super.onCreate(null);\n${lockCode}`)
    }

    mod.modResults.contents = src
    return mod
  })
}