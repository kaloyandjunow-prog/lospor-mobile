import { useCallback, useEffect, useRef, useState } from "react"
import * as Haptics from "expo-haptics"
import { notify } from "@/lib/notify"
import type { IntraopTab } from "@/lib/intraop-tabs"
import { usePreferences } from "@/lib/preferences-context"

type PatchIntraopSection = (payload: Record<string, unknown>) => Promise<unknown>

/**
 * Blood loss is the only figure on the fluid status tab a clinician types. The
 * infusion, bolus and fluid totals beside it are projections of the timetable
 * and are never written from here.
 *
 * It saves when the tab is left, the same way premedication does, so a number
 * entered mid-case survives a swipe back to the timetable.
 *
 * `null` is sent deliberately when the field is cleared, and never `undefined`:
 * an undefined key is dropped from the patch as "not mentioned", so the
 * previous figure would silently stand. That is the same failure shape as the
 * pediatric-to-adult trap. "Not recorded" and a recorded 0 mL are different
 * clinical statements and both have to survive the round trip.
 */
export function useIntraopFluidStatus(
  tab: IntraopTab,
  patchIntraopSection: PatchIntraopSection,
  errorLabel: string,
) {
  const { tc } = usePreferences()
  const [bloodLossMl, setBloodLossMl] = useState<number | null>(null)
  const [bloodLossSaving, setBloodLossSaving] = useState(false)
  const prevTabRef = useRef<IntraopTab>("equipment")
  const saveRef = useRef<() => Promise<void>>(async () => {})
  // What the server is known to hold, so leaving the tab untouched does not
  // issue a write. `undefined` means "not loaded yet" and is distinct from a
  // loaded null.
  const lastSavedRef = useRef<number | null | undefined>(undefined)

  /** Adopt the stored value without marking it dirty. */
  const hydrateBloodLoss = useCallback((value: number | null | undefined) => {
    const next = value ?? null
    setBloodLossMl(next)
    lastSavedRef.current = next
  }, [])

  async function saveBloodLoss() {
    if (lastSavedRef.current !== undefined && bloodLossMl === lastSavedRef.current) return
    setBloodLossSaving(true)
    try {
      await patchIntraopSection({ bloodLossMl })
      lastSavedRef.current = bloodLossMl
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch {
      notify(errorLabel, tc("bloodLossSaveFailed"))
    } finally {
      setBloodLossSaving(false)
    }
  }

  saveRef.current = saveBloodLoss

  useEffect(() => {
    if (prevTabRef.current === "fluids" && tab !== "fluids") {
      void saveRef.current()
    }
    prevTabRef.current = tab
  }, [tab])

  return { bloodLossMl, setBloodLossMl, hydrateBloodLoss, bloodLossSaving, saveBloodLoss }
}
