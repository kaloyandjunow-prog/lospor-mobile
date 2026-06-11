import { useEffect, useRef } from "react"
import { AppState } from "react-native"
import { API_BASE, getToken } from "./api"

type Options = {
  enabled?: boolean
  pollIntervalMs?: number
}

export function useCaseLiveUpdates(caseId: string | undefined, refresh: () => void | Promise<void>, options: Options = {}) {
  const { enabled = true, pollIntervalMs = 10_000 } = options
  const refreshRef = useRef(refresh)
  const streamingRef = useRef(false)
  const inFlightRef = useRef(false)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    if (!enabled || !caseId) return

    let cancelled = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    const controller = new AbortController()

    async function runRefresh() {
      if (inFlightRef.current || AppState.currentState !== "active") return
      inFlightRef.current = true
      try {
        await refreshRef.current()
      } finally {
        inFlightRef.current = false
      }
    }

    async function connect() {
      if (cancelled || AppState.currentState !== "active") return
      try {
        const token = await getToken()
        const res = await fetch(`${API_BASE}/api/cases/${caseId}/stream`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: controller.signal,
        })
        const reader = (res.body as any)?.getReader?.()
        if (!res.ok || !reader) throw new Error("SSE stream unavailable")

        streamingRef.current = true
        const decoder = new TextDecoder()
        let buffer = ""

        while (!cancelled) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const chunks = buffer.split("\n\n")
          buffer = chunks.pop() ?? ""
          for (const chunk of chunks) {
            const line = chunk.split("\n").find((part) => part.startsWith("data:"))
            if (!line) continue
            const raw = line.replace(/^data:\s*/, "")
            try {
              const event = JSON.parse(raw)
              if (event?.type !== "connected") runRefresh()
            } catch {
              runRefresh()
            }
          }
        }
      } catch {
        streamingRef.current = false
      } finally {
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 5_000)
        }
      }
    }

    const pollTimer = setInterval(() => {
      if (!streamingRef.current) runRefresh()
    }, pollIntervalMs)
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        runRefresh()
        if (!streamingRef.current) connect()
      } else {
        controller.abort()
        streamingRef.current = false
      }
    })

    connect()

    return () => {
      cancelled = true
      controller.abort()
      clearInterval(pollTimer)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      appSub.remove()
    }
  }, [caseId, enabled, pollIntervalMs])
}
