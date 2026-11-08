import { useRef } from "react"
import type { TextInput } from "react-native"

/** Text input refs for the vitals sheet's auto-advance focus chaining. */
export function useVitalInputRefs() {
  const vSysRef = useRef<TextInput | null>(null)
  const vDiaRef = useRef<TextInput | null>(null)
  const vHRRef = useRef<TextInput | null>(null)
  const vSpO2Ref = useRef<TextInput | null>(null)
  const vEtco2Ref = useRef<TextInput | null>(null)
  const vTempRef = useRef<TextInput | null>(null)
  const vBisRef = useRef<TextInput | null>(null)
  const vTofRef = useRef<TextInput | null>(null)
  const vCvpRef = useRef<TextInput | null>(null)
  return { vSysRef, vDiaRef, vHRRef, vSpO2Ref, vEtco2Ref, vTempRef, vBisRef, vTofRef, vCvpRef }
}
