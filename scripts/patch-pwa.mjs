// Injects PWA manifest link, Apple meta tags, and SW registration into dist/index.html,
// and stamps the build id into dist/sw.js.
// Run after `expo export --platform web`.
import { createHash } from "crypto"
import { readFileSync, readdirSync, writeFileSync } from "fs"
import { resolve, dirname, join } from "path"
import { fileURLToPath } from "url"

const __dir = dirname(fileURLToPath(import.meta.url))
const distPath = resolve(__dir, "../dist")
const htmlPath = join(distPath, "index.html")

let html = readFileSync(htmlPath, "utf8")

// Expo emits its reset as an inline style. Move it to a same-origin stylesheet
// so the deployment can keep script/style elements under a hash-free CSP.
html = html.replace(
  /<style id="expo-reset">[\s\S]*?<\/style>/,
  '<link rel="stylesheet" href="/expo-reset.css">',
)

const additions = [
  [html.includes('rel="manifest"'), '<link rel="manifest" href="/manifest.webmanifest">'],
  [html.includes('name="apple-mobile-web-app-capable"'), '<meta name="apple-mobile-web-app-capable" content="yes">'],
  [html.includes('name="apple-mobile-web-app-status-bar-style"'), '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'],
  [html.includes('name="apple-mobile-web-app-title"'), '<meta name="apple-mobile-web-app-title" content="LOSPOR">'],
  [html.includes('rel="apple-touch-icon"'), '<link rel="apple-touch-icon" href="/icon-192.png">'],
  [html.includes('src="/register-sw.js"'), '<script src="/register-sw.js" defer></script>'],
]
  .filter(([present]) => !present)
  .map(([, markup]) => markup)

if (additions.length > 0) html = html.replace("</head>", `${additions.join("\n")}\n</head>`)
writeFileSync(htmlPath, html, "utf8")

// Give the service worker's caches a name that changes when the build does, so
// activate retires the previous ones. Derived from the emitted bundle names,
// which are themselves content hashes, so an identical build keeps its caches
// and a changed one cannot go on serving the old files.
const swPath = join(distPath, "sw.js")
const bundleNames = readdirSync(join(distPath, "_expo", "static", "js", "web")).sort().join("|")
const buildId = createHash("sha256").update(bundleNames).digest("hex").slice(0, 12)
const sw = readFileSync(swPath, "utf8")
if (!sw.includes("__BUILD_ID__")) {
  // Unstamped caches never expire, and a bad entry in one is unreachable to
  // every later release. Refuse to ship rather than leave that in place.
  console.error("patch-pwa: dist/sw.js has no __BUILD_ID__ placeholder to stamp")
  process.exit(1)
}
writeFileSync(swPath, sw.replaceAll("__BUILD_ID__", buildId), "utf8")

console.log(`patch-pwa: hardened reset persisted; ${additions.length} PWA element(s) added; sw build ${buildId}`)
