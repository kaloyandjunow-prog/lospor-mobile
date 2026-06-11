import { useEffect, useRef } from "react"
import { AppState } from "react-native"

type Options = {
  enabled?: boolean
  intervalMs?: number
  refreshOnForeground?: boolean
}

export function useLiveRefresh(refresh: () => void | Promise<void>, options: Options = {}) {
  const { enabled = true, intervalMs = 10_000, refreshOnForeground = true } = options
  const refreshRef = useRef(refresh)
  const inFlightRef = useRef(false)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    if (!enabled) return

    async function run() {
      if (inFlightRef.current || AppState.currentState !== "active") return
      inFlightRef.current = true
      try {
        await refreshRef.current()
      } finally {
        inFlightRef.current = false
      }
    }

    const timer = setInterval(run, intervalMs)
    const sub = AppState.addEventListener("change", (state) => {
      if (refreshOnForeground && state === "active") run()
    })

    return () => {
      clearInterval(timer)
      sub.remove()
    }
  }, [enabled, intervalMs, refreshOnForeground])
}
