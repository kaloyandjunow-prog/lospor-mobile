import { useEffect, useState } from "react"
import * as SecureStore from "expo-secure-store"
import { apiJson } from "./api"
import fallbackSnapshot from "../data/option-library-fallback.json"
import {
  rangeSpecFromOption,
  type LibraryOption,
  type RangeSpec,
} from "@lospor/core/option-library"
import { parseLibraryOptions } from "@lospor/core/option-contracts"

type FallbackSnapshot = {
  generatedAt?: string
} & Record<string, unknown>

const typedFallbackSnapshot =
  fallbackSnapshot as unknown as FallbackSnapshot

export type { LibraryOption, RangeSpec }

export type LibrarySource = "live" | "cached" | "bundled"
type CategoryState = { data: LibraryOption[]; source: LibrarySource }

const state = new Map<string, CategoryState>()
const inflight = new Map<string, Promise<void>>()
const listeners = new Map<string, Set<() => void>>()
const retryTimers = new Map<string, ReturnType<typeof setInterval>>()
const globalListeners = new Set<() => void>()

const RETRY_INTERVAL_MS = 30_000
const FALLBACK_SNAPSHOT_DATE =
  typedFallbackSnapshot.generatedAt ?? "unknown"
const LIBRARY_CACHE_VERSION = 3

function storeKey(category: string) {
  return `lospor_option_library_v${LIBRARY_CACHE_VERSION}_${category}`
}

function bundledOptions(category: string): LibraryOption[] {
  return parseLibraryOptions(typedFallbackSnapshot[category])
}

function parseCachedOptions(raw: string | null): LibraryOption[] | null {
  if (!raw) return null
  try {
    const options = parseLibraryOptions(JSON.parse(raw))
    return options.length ? options : null
  } catch {
    return null
  }
}

function notify(category: string) {
  listeners.get(category)?.forEach(callback => callback())
  globalListeners.forEach(callback => callback())
}

function setState(category: string, next: CategoryState) {
  state.set(category, next)
  notify(category)
}

function stopRetry(category: string) {
  const timer = retryTimers.get(category)
  if (timer) {
    clearInterval(timer)
    retryTimers.delete(category)
  }
}

function scheduleRetry(category: string) {
  if (retryTimers.has(category)) return
  const timer = setInterval(
    () => { void attemptLiveFetch(category) },
    RETRY_INTERVAL_MS,
  )
  retryTimers.set(category, timer)
}

async function attemptLiveFetch(category: string): Promise<void> {
  const currentRequest = inflight.get(category)
  if (currentRequest) return currentRequest

  const request = (async () => {
    try {
      const data = parseLibraryOptions(
        await apiJson<unknown>(`/api/library/${category}`),
      )
      if (data.length === 0) {
        throw new Error("empty or invalid option library response")
      }
      setState(category, { data, source: "live" })
      stopRetry(category)
      await SecureStore
        .setItemAsync(storeKey(category), JSON.stringify(data))
        .catch(() => {})
    } catch {
      if (!state.has(category)) {
        const cached = await SecureStore
          .getItemAsync(storeKey(category))
          .catch(() => null)
        const cachedOptions = parseCachedOptions(cached)
        setState(
          category,
          cachedOptions
            ? { data: cachedOptions, source: "cached" }
            : { data: bundledOptions(category), source: "bundled" },
        )
      }
      scheduleRetry(category)
    } finally {
      inflight.delete(category)
    }
  })()

  inflight.set(category, request)
  return request
}

export function useOptionLibrary(category: string): {
  options: LibraryOption[]
  loading: boolean
  source: LibrarySource | null
} {
  const current = state.get(category)
  const [, forceRender] = useState(0)
  const [loading, setLoading] = useState(!current)

  useEffect(() => {
    const callback = () => forceRender(value => value + 1)
    if (!listeners.has(category)) listeners.set(category, new Set())
    listeners.get(category)!.add(callback)

    if (!state.has(category)) {
      setLoading(true)
      void attemptLiveFetch(category).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
    return () => {
      listeners.get(category)?.delete(callback)
    }
  }, [category])

  const latest = state.get(category)
  const effective = latest && latest.data.length === 0
    ? { data: bundledOptions(category), source: "bundled" as const }
    : latest
  return {
    options: effective?.data ?? [],
    loading,
    source: effective?.source ?? null,
  }
}

export function useRangeSpec(category: string): RangeSpec | undefined {
  const { options } = useOptionLibrary(category)
  return rangeSpecFromOption(options[0])
}

export function useAnyLibraryFallback(): {
  active: boolean
  snapshotDate: string
} {
  const [, forceRender] = useState(0)
  useEffect(() => {
    const callback = () => forceRender(value => value + 1)
    globalListeners.add(callback)
    return () => {
      globalListeners.delete(callback)
    }
  }, [])
  return {
    active: [...state.values()].some(entry => entry.source !== "live"),
    snapshotDate: FALLBACK_SNAPSHOT_DATE,
  }
}
