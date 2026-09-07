# Inti

Finanzas compartidas (web + app Android).

## Stack

- **Web:** React + TypeScript + Vite
- **Backend:** Supabase (Postgres + Auth + Storage)
- **App:** Capacitor (Android)

## Requisitos

- Node.js + pnpm
- JDK 21 (para compilar el APK) — `JAVA_HOME=/ruta/jdk-21`

## Setup

```bash
pnpm install
cp .env.example .env   # luego rellena las claves de Supabase
pnpm dev               # web en local
```

Variables de `.env`:

| Variable                        | Descripción                                       |
| ------------------------------- | ------------------------------------------------- |
| `VITE_SUPABASE_URL`             | URL del proyecto de Supabase                      |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clave publicable (anon)                           |
| `VITE_SITE_URL`                 | URL pública de la web (para la página `/install`) |

## Base de datos (Supabase)

- `supabase/schema.sql`: Ejecuta en el SQL Editor para una DB nueva. Idempotente.

Requisitos manuales (dashboard de Supabase):

- Bucket de Storage `apk` público para distribuir el APK + policies de escribir/leer en `storage.objects` con `bucket_id = 'apk'`.
- La app lee `version.json` desde ese bucket para detectar actualizaciones.

## Scripts

| Comando            | Descripción                                     |
| ------------------ | ----------------------------------------------- |
| `pnpm dev`         | Servidor de desarrollo                          |
| `pnpm build`       | Compila la web a `dist/`                        |
| `pnpm lint`        | Lint (oxlint)                                   |
| `pnpm publish:apk` | Sube el APK + `version.json` a Supabase Storage |

## Publicar una versión nueva del APK

1. Sube `versionName`/`versionCode` en `android/app/build.gradle` (p. ej. `1.2.1`, code `3`).
2. Compila:
   ```bash
   pnpm build
   pnpm exec cap sync android
   cd android && ./gradlew clean assembleDebug && cd ..
   ```
3. Publica (lee el build.gradle y sube el APK + `version.json`):
   ```bash
   pnpm publish:apk
   ```

## Generar assets (iconos/splash)

```bash
pnpm add -D @resvg/resvg-js   # si no está instalado
node scripts/gen-android-assets.mjs
```
