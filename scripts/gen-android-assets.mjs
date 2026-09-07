// Regenera iconos y splash de Android usando el nuevo logo (public/favicon.svg)
// Uso: node scripts/gen-android-assets.mjs
import { Resvg } from '@resvg/resvg-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ---------- definiciones del logo ----------
const brandRect = '<rect x="2" y="2" width="96" height="96" rx="24" fill="url(#bg)"/>'
const rays = `<g fill="url(#sun)">
<rect x="46" y="8" width="8" height="16" rx="3"/>
<rect x="46" y="76" width="8" height="16" rx="3"/>
<rect x="8" y="46" width="16" height="8" rx="3"/>
<rect x="76" y="46" width="16" height="8" rx="3"/>
<rect x="46" y="8" width="8" height="16" rx="3" transform="rotate(45 50 50)"/>
<rect x="46" y="8" width="8" height="16" rx="3" transform="rotate(135 50 50)"/>
<rect x="46" y="8" width="8" height="16" rx="3" transform="rotate(225 50 50)"/>
<rect x="46" y="8" width="8" height="16" rx="3" transform="rotate(315 50 50)"/>
</g>`
const disc = '<circle cx="50" cy="50" r="24" fill="url(#sun)"/>'
const letterI = '<rect x="45.5" y="38" width="9" height="24" rx="4.5" fill="#FFFFFF"/>'

const defs = `<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#7A62C2"/>
  <stop offset="1" stop-color="#B8A9E8"/>
</linearGradient>
<linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFDE7A"/>
  <stop offset="1" stop-color="#FF9E4F"/>
</linearGradient>
</defs>`

const badgeOnly = `${defs}${brandRect}${rays}${disc}${letterI}`

// Sol sin badge: para el foreground del adaptive icon (fondo morado = color)
const sunOnly = `${defs}${rays}${disc}${letterI}`

// ---------- utilidades ----------
function renderSvg(svg, width, height) {
  const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${svg}</svg>`, {})
  return r.render().asPng()
}

function write(dir, name, png) {
  const p = resolve(root, `android/app/src/main/res/${dir}/${name}`)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, png)
  console.log('ok', p.replace(root, ''))
}

// ---------- 1) foreground adaptive icon (sol sobre 108dp, área segura) ----------
// Consiste: sol de ~84ud en viewBox 100, escalado a ~62% dentro de canvas 108
const fgScale = 0.66
const adaptive = {
  mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432,
}
for (const [density, size] of Object.entries(adaptive)) {
  const svg = `<g transform="translate(${(size / 2).toFixed(1)} ${(size / 2).toFixed(1)}) scale(${(fgScale * size / 108).toFixed(6)}) translate(-50 -50)">${sunOnly}</g>`
  write(`mipmap-${density}`, 'ic_launcher_foreground.png', renderSvg(svg, size, size))
}

// ---------- 2) iconos legacy (favicon completo) ----------
const legacy = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
for (const [density, size] of Object.entries(legacy)) {
  const svg = `<rect width="${size}" height="${size}" fill="#FFFFFF"/>${badgeOnly}`
  const png = renderSvg(svg, size, size)
  write(`mipmap-${density}`, 'ic_launcher.png', png)
  write(`mipmap-${density}`, 'ic_launcher_round.png', png)
}

// ---------- 3) splash ----------
const bgDefs = `<defs>
<linearGradient id="splashbg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#7A62C2"/>
  <stop offset="1" stop-color="#B8A9E8"/>
</linearGradient>
${defs}
</defs>`

const splash = [
  ['port-mdpi', 320, 480], ['port-hdpi', 480, 800], ['port-xhdpi', 720, 1280],
  ['port-xxhdpi', 960, 1600], ['port-xxxhdpi', 1280, 1920],
  ['land-mdpi', 480, 320], ['land-hdpi', 800, 480], ['land-xhdpi', 1280, 720],
  ['land-xxhdpi', 1600, 960], ['land-xxxhdpi', 1920, 1280],
]
for (const [name, w, h] of splash) {
  const isPortrait = h > w
  const badgeSize = isPortrait ? h * 0.34 : h * 0.6
  const scale = badgeSize / 100
  const cx = w / 2
  const cy = h * (isPortrait ? 0.44 : 0.5)
  const svg = `${bgDefs}
  <rect width="${w}" height="${h}" fill="url(#splashbg)"/>
  <g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${scale.toFixed(6)}) translate(-50 -50)">${badgeOnly}</g>`
  write(`drawable-${name}`, 'splash.png', renderSvg(svg, w, h))
}
// drawable/ base (landscape 480x320)
{
  const [w, h] = [480, 320]
  const scale = (h * 0.6) / 100
  const svg = `${bgDefs}
  <rect width="${w}" height="${h}" fill="url(#splashbg)"/>
  <g transform="translate(${w / 2} ${h / 2}) scale(${scale.toFixed(6)}) translate(-50 -50)">${badgeOnly}</g>`
  write('drawable', 'splash.png', renderSvg(svg, w, h))
}
console.log('Assets Android generados.')

// ---------- 4) background de adaptive icon: color morado de marca ----------
write('values', 'ic_launcher_background.xml', Buffer.from(`
<resources>
    <color name="ic_launcher_background">#8B72D4</color>
</resources>
`.trim()))