import { useCallback, useEffect, useState } from "react"
import { AppState } from "react-native"

import {
  getCachedIntraopAutofillPreferences,
  loadIntraopAutofillPreferences,
  subscribeIntraopAutofillPreferences,
} from "@/lib/intraop-autofill-preferences"

export function useIntraopAutofillPreferences() {
  const [preferences, setPreferences] = useState(getCachedIntraopAutofillPreferences)

  const refresh = useCallback(() => {
    void loadIntraopAutofillPreferences().then(setPreferences).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const unsubscribe = subscribeIntraopAutofillPreferences(setPreferences)
    const appStateSub = AppState.addEventListener("change", state => {
      if (state === "active") refresh()
    })
    return () => {
      unsubscribe()
      appStateSub.remove()
    }
  }, [refresh])

  return {
    autoFillVitals: preferences.enabled,
    autoFillBP: preferences.includeBloodPressure,
    autoFillBg: preferences.backfillOnReopen,
  }
}
