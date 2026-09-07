function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.match(/^#?([0-9a-f]{6})$/i)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function blend(hex: string, target: [number, number, number], amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const mixed = rgb.map((c, i) => c + (target[i] - c) * amount)
  return rgbToHex(mixed[0], mixed[1], mixed[2])
}

export function applyAccent(color: string | null | undefined) {
  if (!color || typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--color-accent', color)
  root.style.setProperty('--color-accent-hover', blend(color, [18, 16, 26], 0.15))
  root.style.setProperty('--color-accent-pale', blend(color, [255, 255, 255], 0.32))
  root.style.setProperty('--color-accent-light', blend(color, [255, 255, 255], 0.88))
}