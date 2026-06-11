import { useEffect, useRef, useState } from "react"
import { AppState, type AppStateStatus } from "react-native"
import * as SecureStore from "expo-secure-store"
import { apiFetch } from "@/lib/api"
import { randomHex } from "@/lib/random-id"

export type LockState = "idle" | "acquiring" | "held" | "watching"

const DEVICE_ID_KEY = "lospor_device_id"

async function getDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY)
  if (!id) {
    id = `mob-${randomHex(16)}`
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id)
  }
  return id
}

export function useCaseLock(caseId: string, enabled = true): {
  lockState: LockState
  isWatching: boolean
  takeover: () => Promise<void>
} {
  const [lockState, setLockState] = useState<LockState>("idle")
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const deviceIdRef  = useRef("")
  const appStateRef  = useRef<AppStateStatus>(AppState.currentState)

  function stopHeartbeat() {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
  }

  async function releaseLock(deviceId: string) {
    try {
      await apiFetch(`/api/cases/${caseId}/lock`, {
        method: "DELETE",
        body: JSON.stringify({ deviceId }),
      })
    } catch {}
  }

  useEffect(() => {
    if (!enabled) { setLockState("idle"); return }

    let mounted = true

    async function init() {
      const deviceId = await getDeviceId()
      deviceIdRef.current = deviceId
      if (!mounted) return

      setLockState("acquiring")
      try {
        const res = await apiFetch(`/api/cases/${caseId}/lock`, {
          method: "POST",
          body: JSON.stringify({ deviceId }),
        })
        if (!mounted) return
        if (res.status === 409) { setLockState("watching"); return }
        setLockState("held")
        heartbeatRef.current = setInterval(async () => {
          try {
            const r = await apiFetch(`/api/cases/${caseId}/lock`, {
              method: "PATCH",
              body: JSON.stringify({ deviceId }),
            })
            if (r.status === 409 && mounted) setLockState("watching")
          } catch {}
        }, 15_000)
      } catch {
        if (mounted) setLockState("held") // fail open on network error
      }
    }

    init()

    // Pause/resume on app background/foreground
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (appStateRef.current === "active" && nextState !== "active") {
        // Going to background — stop heartbeat, lock will expire naturally
        stopHeartbeat()
      } else if (appStateRef.current !== "active" && nextState === "active") {
        // Coming to foreground — reacquire
        const deviceId = deviceIdRef.current
        if (!deviceId) return
        try {
          const res = await apiFetch(`/api/cases/${caseId}/lock`, {
            method: "POST",
            body: JSON.stringify({ deviceId }),
          })
          if (res.status === 409) { setLockState("watching"); return }
          setLockState("held")
          heartbeatRef.current = setInterval(async () => {
            try {
              const r = await apiFetch(`/api/cases/${caseId}/lock`, {
                method: "PATCH",
                body: JSON.stringify({ deviceId }),
              })
              if (r.status === 409) setLockState("watching")
            } catch {}
          }, 15_000)
        } catch {}
      }
      appStateRef.current = nextState
    })

    return () => {
      mounted = false
      stopHeartbeat()
      sub.remove()
      const deviceId = deviceIdRef.current
      if (deviceId) releaseLock(deviceId)
    }
  }, [caseId, enabled])

  // Called directly by the UI after it handles its own confirmation — no Alert here
  async function takeover() {
    const deviceId = deviceIdRef.current
    if (!deviceId) return
    stopHeartbeat()
    // Force-release whatever lock exists (server allows this for case owner)
    try {
      await apiFetch(`/api/cases/${caseId}/lock`, {
        method: "DELETE",
        body: JSON.stringify({ force: true }),
      })
    } catch {}
    // Acquire the lock with our own device ID
    try {
      const res = await apiFetch(`/api/cases/${caseId}/lock`, {
        method: "POST",
        body: JSON.stringify({ deviceId }),
      })
      if (res.status !== 409) {
        setLockState("held")
        heartbeatRef.current = setInterval(async () => {
          try {
            const r = await apiFetch(`/api/cases/${caseId}/lock`, {
              method: "PATCH",
              body: JSON.stringify({ deviceId }),
            })
            if (r.status === 409) setLockState("watching")
          } catch {}
        }, 15_000)
      }
    } catch {}
  }

  return { lockState, isWatching: lockState === "watching", takeover }
}
