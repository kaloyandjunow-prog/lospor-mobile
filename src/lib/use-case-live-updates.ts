import { useEffect, useRef } from "react"
import { AppState } from "react-native"

type Options = {
  enabled?: boolean
  pollIntervalMs?: number
}

/**
 * Keeps an open case in step with edits made elsewhere.
 *
 * This used to try an SSE stream first and fall back to polling. The stream was
 * served from an in-process event emitter, which cannot work on serverless —
 * the instance handling the write and the instance holding the stream open are
 * different processes, so the listener was never notified. In practice the poll
 * was doing all the work while the stream code reconnected forever against a
 * channel that would never speak. The stream and its endpoint are gone; this
 * polls, and only while the app is actually in the foreground.
 */
export function useCaseLiveUpdates(caseId: string | undefined, refresh: () => void | Promise<void>, options: Options = {}) {
  const { enabled = true, pollIntervalMs = 10_000 } = options
  const refreshRef = useRef(refresh)
  const inFlightRef = useRef(false)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    if (!enabled || !caseId) return

    async function runRefresh() {
      // Never stack refreshes, and never poll a backgrounded app.
      if (inFlightRef.current || AppState.currentState !== "active") return
      inFlightRef.current = true
      try {
        await refreshRef.current()
      } finally {
        inFlightRef.current = false
      }
    }

    const pollTimer = setInterval(runRefresh, pollIntervalMs)
    // Catch up immediately on return to the foreground rather than waiting out
    // the interval — the case may have moved on while the phone was pocketed.
    const appSub = AppState.addEventListener("change", state => {
      if (state === "active") runRefresh()
    })

    return () => {
      clearInterval(pollTimer)
      appSub.remove()
    }
  }, [caseId, enabled, pollIntervalMs])
}
