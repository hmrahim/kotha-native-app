// theme.js — App এর সব color এখানে

export const T = {
  // ── Backgrounds ──────────────────────────────────────────────
  bg:          '#0D1117',   // main background
  surface:     '#161B22',   // card/panel
  surfaceHigh: '#1C2128',   // input background
  border:      '#30363D',   // subtle border

  // ── Text ─────────────────────────────────────────────────────
  textPrimary: '#E6EDF3',   // main text (white-ish)
  textSecond:  '#8B949E',   // secondary text (grey)
  textMuted:   '#6E7681',   // placeholder / muted

  // ── Accent (teal) ────────────────────────────────────────────
  accent:      '#2DD4BF',   // primary action color
  accentDim:   'rgba(45,212,191,0.10)',  // subtle accent bg

  // ── Error (red) ──────────────────────────────────────────────
  error:       '#FF6B6B',   // ✅ উজ্জ্বল লাল — সহজে দেখা যায়
  errorDim:    'rgba(255,107,107,0.12)', // error background

  // ── Success ──────────────────────────────────────────────────
  success:     '#3FB950',
  successDim:  'rgba(63,185,80,0.12)',

  // ── Warning ──────────────────────────────────────────────────
  warning:     '#F59E0B',
  warningDim:  'rgba(245,158,11,0.12)',
}

// ─── Helper Functions ────────────────────────────────────────────────────────

// নামের প্রথম ১-২ অক্ষর নাও (avatar fallback এ দেখানোর জন্য)
export const getInitials = (name = '') => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

// নামের উপর ভিত্তি করে একটা consistent color দাও (avatar background)
const AVATAR_COLORS = [
  '#2D9CDB', '#27AE60', '#9B51E0', '#F2994A',
  '#EB5757', '#2DD4BF', '#F2C94C', '#6FCF97',
  '#BB6BD9', '#56CCF2', '#E96C4B', '#4DA1F5',
]

export const getColor = (name = '') => {
  if (!name) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}