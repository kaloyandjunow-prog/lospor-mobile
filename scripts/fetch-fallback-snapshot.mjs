// Fetches the option-library offline-fallback snapshot from lospor-app's
// internal endpoint and writes it to src/data/option-library-fallback.json,
// so EAS Build can bundle a fresh copy without needing direct
// database/Prisma access (EAS's build environment has no access to
// lospor-app's repo at all — separate repo, separate build).
//
// Wired as the "eas-build-pre-install" lifecycle script (see package.json)
// — EAS Build runs this automatically before installing dependencies.
//
// Requires two env vars to be set as EAS secrets:
//   EXPO_PUBLIC_API_BASE          — same one the app itself uses
//   OPTION_LIBRARY_SNAPSHOT_SECRET — must match lospor-app's env var of the
//                                    same name
//
// Locally (outside EAS), this is a no-op if those aren't set — local dev
// already has a fresh copy from generate-option-library-fallback.ts writing
// directly into this repo when run from a sibling lospor-app checkout.
// On an actual EAS Build (EAS_BUILD=true), missing secrets fail the build
// instead of silently shipping a stale bundled snapshot.

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API_BASE = process.env.EXPO_PUBLIC_API_BASE
const SECRET = process.env.OPTION_LIBRARY_SNAPSHOT_SECRET
const TARGET = path.join(__dirname, "../src/data/option-library-fallback.json")

async function main() {
  if (!API_BASE || !SECRET) {
    if (process.env.EAS_BUILD === "true") {
      throw new Error(
        "EXPO_PUBLIC_API_BASE / OPTION_LIBRARY_SNAPSHOT_SECRET not set on this EAS Build — " +
        "refusing to ship a stale bundled snapshot. Set both as EAS secrets for this build profile."
      )
    }
    console.log("EXPO_PUBLIC_API_BASE / OPTION_LIBRARY_SNAPSHOT_SECRET not set — skipping snapshot fetch (expected for local dev; required on EAS).")
    return
  }

  const res = await fetch(`${API_BASE.replace(/\/$/, "")}/api/internal/option-library-snapshot`, {
    headers: { "x-snapshot-secret": SECRET },
  })
  if (!res.ok) {
    throw new Error(`Snapshot fetch failed: ${res.status} ${res.statusText}`)
  }
  const json = await res.text()
  fs.mkdirSync(path.dirname(TARGET), { recursive: true })
  fs.writeFileSync(TARGET, json)
  console.log(`Wrote ${TARGET}`)
}

main().catch(err => { console.error(err); process.exit(1) })
