import { useEffect, useState } from "react"
import * as SecureStore from "expo-secure-store"
import { apiJson } from "./api"
import fallbackSnapshot from "../data/option-library-fallback.json"
import type { LibraryOption, RangeSpec } from "@lospor/core/option-library"

type FallbackSnapshot = { generatedAt?: string } & Record<string, LibraryOption[] | string | undefined>
const typedFallbackSnapshot = fallbackSnapshot as unknown as FallbackSnapshot

export type { LibraryOption, RangeSpec }

export type LibrarySource = "live" | "cached" | "bundled"

type CategoryState = { data: LibraryOption[]; source: LibrarySource }

const state = new Map<string, CategoryState>()
const inflight = new Map<string, Promise<void>>()
const listeners = new Map<string, Set<() => void>>()
const retryTimers = new Map<string, ReturnType<typeof setInterval>>()
const globalListeners = new Set<() => void>()

const RETRY_INTERVAL_MS = 30_000
const FALLBACK_SNAPSHOT_DATE: string = typedFallbackSnapshot.generatedAt ?? "unknown"

// Bump when the option payload contract grows (e.g. metadata.quickValues for
// fluids/agents): caches written by older builds/seeds are keyed differently
// and therefore ignored, so a stale metadata-less list can never shadow the
// live API or the bundled fallback while the device is offline.
const LIBRARY_CACHE_VERSION = 2

function storeKey(category: string) {
  return `lospor_option_library_v${LIBRARY_CACHE_VERSION}_${category}`
}

function bundledOptions(category: string): LibraryOption[] {
  const bundled = typedFallbackSnapshot[category]
  return Array.isArray(bundled) ? bundled : []
}

function parseCachedOptions(raw: string | null): LibraryOption[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

function notify(category: string) {
  listeners.get(category)?.forEach(cb => cb())
  globalListeners.forEach(cb => cb())
}

function setState(category: string, next: CategoryState) {
  state.set(category, next)
  notify(category)
}

function stopRetry(category: string) {
  const t = retryTimers.get(category)
  if (t) { clearInterval(t); retryTimers.delete(category) }
}

function scheduleRetry(category: string) {
  if (retryTimers.has(category)) return
  const t = setInterval(() => { attemptLiveFetch(category) }, RETRY_INTERVAL_MS)
  retryTimers.set(category, t)
}

// Tries the live API. On success, replaces whatever fallback was showing and
// stops the background retry. On failure, leaves the current
// cached/bundled data in place (it was already shown) and keeps retrying.
async function attemptLiveFetch(category: string): Promise<void> {
  if (inflight.has(category)) return inflight.get(category)!
  const p = (async () => {
    try {
      const data = await apiJson<LibraryOption[]>(`/api/library/${category}`)
      // A 200 with an empty array is never legitimately correct for these
      // categories — it means the table exists but hasn't been seeded yet,
      // not "nothing to show." Treat it the same as a fetch failure rather
      // than trusting it as live, so it can't silently blank out a picker
      // with no banner and no retry.
      if (data.length === 0) throw new Error("empty option library response")
      setState(category, { data, source: "live" })
      stopRetry(category)
      await SecureStore.setItemAsync(storeKey(category), JSON.stringify(data)).catch(() => {})
    } catch {
      // Still offline/unreachable (or got an empty response) — if we don't
      // have anything showing yet, fall through to cached/bundled data so
      // pickers aren't empty.
      if (!state.has(category)) {
        const cached = await SecureStore.getItemAsync(storeKey(category)).catch(() => null)
        const cachedOptions = parseCachedOptions(cached)
        setState(category, cachedOptions
          ? { data: cachedOptions, source: "cached" }
          : { data: bundledOptions(category), source: "bundled" })
      }
      scheduleRetry(category)
    } finally {
      inflight.delete(category)
    }
  })()
  inflight.set(category, p)
  return p
}

// Fetches a selectable option library (position, technique, vascular access,
// airway management, monitoring, premedication/intraop drugs, infusions,
// inhalational agents, fluids, clinical events) once per category, caching
// in memory for the session and in SecureStore for offline reuse. If the
// live fetch fails and there's no prior cache either (e.g. first install,
// no connectivity), falls back to a snapshot bundled into the app itself so
// pickers are never silently empty — see scripts/generate-fallback-snapshot.ts.
// While running on cached/bundled data, retries the live fetch every 30s in
// the background and swaps in live data the moment it succeeds.
export function useOptionLibrary(category: string): { options: LibraryOption[]; loading: boolean; source: LibrarySource | null } {
  const cur = state.get(category)
  const [, forceRender] = useState(0)
  const [loading, setLoading] = useState(!cur)

  useEffect(() => {
    const cb = () => forceRender(n => n + 1)
    if (!listeners.has(category)) listeners.set(category, new Set())
    listeners.get(category)!.add(cb)
    if (!state.has(category)) {
      setLoading(true)
      attemptLiveFetch(category).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
    return () => { listeners.get(category)?.delete(cb) }
  }, [category])

  const latest = state.get(category)
  const effective = latest && latest.data.length === 0
    ? { data: bundledOptions(category), source: "bundled" as const }
    : latest
  return { options: effective?.data ?? [], loading, source: effective?.source ?? null }
}

// Numeric range pickers (age, height, weight, vitals, etc.) are seeded as a
// single OptionLibrary row per category with the actual min/max/step/unit in
// metadata — same fetch/cache/fallback machinery as the categorical lists.
export function useRangeSpec(category: string): RangeSpec | undefined {
  const { options } = useOptionLibrary(category)
  return options[0]?.metadata as RangeSpec | undefined
}

// Used by the offline-library banner to know if anything is currently
// showing non-live data, without needing to know which categories a given
// screen uses.
export function useAnyLibraryFallback(): { active: boolean; snapshotDate: string } {
  const [, forceRender] = useState(0)
  useEffect(() => {
    const cb = () => forceRender(n => n + 1)
    globalListeners.add(cb)
    return () => { globalListeners.delete(cb) }
  }, [])
  const active = [...state.values()].some(s => s.source !== "live")
  return { active, snapshotDate: FALLBACK_SNAPSHOT_DATE }
}
