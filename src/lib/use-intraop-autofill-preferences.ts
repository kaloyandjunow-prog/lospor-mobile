import { useEffect, useState } from "react"
import * as SecureStore from "expo-secure-store"

export function useIntraopAutofillPreferences() {
  const [autoFillVitals, setAutoFillVitals] = useState(false)
  const [autoFillBP, setAutoFillBP] = useState(false)
  const [autoFillBg, setAutoFillBg] = useState(false)

  useEffect(() => {
    SecureStore.getItemAsync("intraop_autofill_vitals").then(v => setAutoFillVitals(v === "on"))
    SecureStore.getItemAsync("intraop_autofill_bp").then(v => setAutoFillBP(v === "on"))
    SecureStore.getItemAsync("intraop_autofill_bg").then(v => setAutoFillBg(v === "on"))
  }, [])

  return {
    autoFillVitals,
    autoFillBP,
    autoFillBg,
  }
}
