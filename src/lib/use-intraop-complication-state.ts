import { useState } from "react"
import * as Haptics from "expo-haptics"
import { notify } from "@/lib/notify"
import { formatComplications, toggleComplicationLabel } from "@/lib/intraop-complications"
import { usePreferences } from "@/lib/preferences-context"

type PatchIntraopSection = (payload: Record<string, unknown>) => Promise<unknown>

export function useIntraopComplicationState(
  patchIntraopSection: PatchIntraopSection,
  errorLabel: string,
) {
  const { tc } = usePreferences()
  const [compOpen, setCompOpen] = useState(false)
  const [selectedComplications, setSelectedComplications] = useState<string[]>([])
  const [complicationsNotes, setComplicationsNotes] = useState("")
  const [compGroupExpanded, setCompGroupExpanded] = useState<Record<string, boolean>>({})
  const [compSaving, setCompSaving] = useState(false)

  /**
   * Deletes an item of the old line of text, kept on cases charted before
   * 10.1.0. New complications are timed entries in the log and are deleted
   * as events.
   */
  function removeLegacyComplication(label: string) {
    const next = selectedComplications.filter(item => item !== label)
    setSelectedComplications(next)
    patchIntraopSection({ complications: formatComplications(next, complicationsNotes) }).catch(() => {
      notify(errorLabel, tc("complicationsSaveFailed"))
    })
  }

  async function saveComplications() {
    setCompSaving(true)
    try {
      const complications = formatComplications(selectedComplications, complicationsNotes)
      await patchIntraopSection({ complications })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      setCompOpen(false)
    } catch {
      notify(errorLabel, tc("complicationsSaveFailed"))
    } finally {
      setCompSaving(false)
    }
  }

  function toggleComplication(item: string) {
    setSelectedComplications(prev => toggleComplicationLabel(prev, item))
  }

  function toggleComplicationGroup(groupId: string) {
    setCompGroupExpanded(prev => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  return {
    compOpen,
    setCompOpen,
    selectedComplications,
    setSelectedComplications,
    complicationsNotes,
    setComplicationsNotes,
    compGroupExpanded,
    compSaving,
    removeLegacyComplication,
    saveComplications,
    toggleComplication,
    toggleComplicationGroup,
  }
}
