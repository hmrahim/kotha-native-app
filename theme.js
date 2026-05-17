// theme.js — shared design tokens
export const T = {
  bg:          '#0D1117',
  surface:     '#161B22',
  surfaceHigh: '#1C2333',
  border:      'rgba(240,246,252,0.06)',
  accent:      '#2DD4BF',
  accentDim:   'rgba(45,212,191,0.12)',
  amber:       '#F59E0B',
  amberDim:    'rgba(245,158,11,0.15)',
  textPrimary: '#F0F6FC',
  textSecond:  '#7D8590',
  textMuted:   '#484F58',
  online:      '#3FB950',

  // Chat specific
  chatBg:           '#0A0F16',
  bubbleMe:         '#1A3A35',
  bubbleThem:       '#161B22',
  bubbleMeBorder:   'rgba(45,212,191,0.18)',
  bubbleThemBorder: 'rgba(240,246,252,0.06)',
}

// Consistent color palette for avatar generation
export const PALETTE = [
  '#FF6B6B','#4ECDC4','#45B7D1','#A78BFA','#F59E0B',
  '#34D399','#F472B6','#60A5FA','#FB923C','#A3E635',
]

export const getColor = (name) => {
  let s = 0
  for (const c of name) s += c.charCodeAt(0)
  return PALETTE[s % PALETTE.length]
}

export const getInitials = (name) => {
  const p = name.trim().split(' ')
  return p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2).toUpperCase()
}
