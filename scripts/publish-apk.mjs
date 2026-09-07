import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Publica el APK compilado en Supabase Storage (bucket público `apk`)
// para que la app detecte actualizaciones vía version.json.
//
// Uso:
//   pnpm publish:apk [ruta-al-apk]
//
// Requiere un bucket público llamado `apk` (creado en el dashboard de Supabase)
// y que la key permita escritura en storage.

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Carga .env del proyecto si existe (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)
function loadEnv() {
  try {
    const env = readFileSync(resolve(projectRoot, '.env'), 'utf8')
    for (const line of env.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // no .env, ok
  }
}
loadEnv()

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  console.error('Faltan SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY (defínelas en .env)')
  process.exit(1)
}

const buildGradle = readFileSync(resolve(projectRoot, 'android/app/build.gradle'), 'utf8')
const versionName = buildGradle.match(/versionName\s+"([^"]+)"/)?.[1] ?? '1.0'
const versionCode = buildGradle.match(/versionCode\s+(\d+)/)?.[1] ?? '1'

const candidates = [
  process.argv[2],
  resolve(projectRoot, 'android/app/build/outputs/apk/debug/app-debug.apk'),
  resolve(projectRoot, 'inti.apk'),
].filter(Boolean)

const apkPath = candidates.find((p) => {
  try {
    readdirSync(dirname(p))
    return true
  } catch {
    return false
  }
})

if (!apkPath) {
  console.error('No se encontró el APK. Compílalo primero (pnpm build && pnpm exec cap sync android && cd android && ./gradlew assembleDebug)')
  process.exit(1)
}

const apk = readFileSync(apkPath)
const supabase = createClient(url, key)

console.log(`Publicando inti.apk (${(apk.length / 1024 / 1024).toFixed(1)} MB, v${versionName} build ${versionCode})...`)

const { error: apkError } = await supabase
  .storage
  .from('apk')
  .upload('inti.apk', apk, { upsert: true, contentType: 'application/vnd.android.package-archive' })
if (apkError) {
  console.error('Error subiendo inti.apk:', apkError.message)
  process.exit(1)
}

const versionJson = JSON.stringify({ version: versionName, build: versionCode, path: 'inti.apk' }, null, 2)
const { error: vError } = await supabase
  .storage
  .from('apk')
  .upload('version.json', new Blob([versionJson], { type: 'application/json' }), { upsert: true })
if (vError) {
  console.error('Error subiendo version.json:', vError.message)
  process.exit(1)
}

const { data } = supabase.storage.from('apk').getPublicUrl('version.json')
console.log('Listo ✅')
console.log('version.json:', data.publicUrl)