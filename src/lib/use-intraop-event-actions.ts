import { useState, type Dispatch, type SetStateAction } from "react"

import { actionSheet, confirmAction } from "@/lib/notify"
import { formatTs } from "@/lib/intraop-format"
import { applyIntraopEventEdit, intraopEventEditDraft } from "@/lib/intraop-event-edit"
import { buildIntraopEventActions, repeatDrugEventPayload } from "@/lib/intraop-event-actions"
import { buildEmergencyShortcutSheet, type EmergencyShortcutKind } from "@/lib/intraop-emergency-shortcuts"
import { dispatchRowQuickAdd, slotIsoTimestamp, type RowQuickAddAction } from "@/lib/intraop-row-quick-add"
import type { LogEvent } from "@/lib/intraop-log-event"

type EventLabel = (ev: LogEvent) => { text: string }
type SaveIntraopEvent = (
  partial: Omit<LogEvent, "id" | "ts">,
  tsOverride?: string,
  silent?: boolean,
) => Promise<LogEvent>

type UseIntraopEventActionsArgs = {
  log: LogEvent[]
  save: SaveIntraopEvent
  syncLog: (newLog: LogEvent[]) => Promise<void>
  removeEvent: (ev: LogEvent, sync?: boolean) => Promise<void>
  eventLabel: EventLabel
  cancelLabel: string
  setEntryTs: Dispatch<SetStateAction<string | null>>
  openDrugPreset: (name: string, dose: string) => void
  setAirwayLabel: Dispatch<SetStateAction<string>>
  setAirwayOpen: Dispatch<SetStateAction<boolean>>
  chartStart: Date
  openVitals: (mode: "full" | "bp", ts: string) => void
  openDrug: (ts: string) => void
  openInfusion: (ts: string) => void
  openFluid: (ts: string) => void
  openAgent: (ts: string) => void
  openGasSettings: (ts: string) => void
  setSlotTs: Dispatch<SetStateAction<Date | null>>
  slotTs: Date | null
  setSlotOpen: Dispatch<SetStateAction<boolean>>
  addComplicationFromEvent: (label: string) => void
}

export function useIntraopEventActions({
  log,
  save,
  syncLog,
  removeEvent,
  eventLabel,
  cancelLabel,
  setEntryTs,
  openDrugPreset,
  setAirwayLabel,
  setAirwayOpen,
  chartStart,
  openVitals,
  openDrug,
  openInfusion,
  openFluid,
  openAgent,
  openGasSettings,
  setSlotTs,
  slotTs,
  setSlotOpen,
  addComplicationFromEvent,
}: UseIntraopEventActionsArgs) {
  const [editOpen, setEditOpen] = useState(false)
  const [editEv, setEditEv] = useState<LogEvent | null>(null)
  const [editDose, setEditDose] = useState("")
  const [editTime, setEditTime] = useState("")

  function emergencyShortcut(kind: EmergencyShortcutKind) {
    const ts = new Date().toISOString()
    const openAirwayDetail = () => {
      setAirwayLabel("Intubated")
      setAirwayOpen(true)
    }
    const sheet = buildEmergencyShortcutSheet(kind, cancelLabel, {
      openDrugPreset: (name, dose) => {
        setEntryTs(ts)
        openDrugPreset(name, dose)
      },
      logEvent: (label, color) => save({ type: "clinical_event", label, color }),
      openAirwayDetail,
    })
    actionSheet(sheet.title, sheet.message, sheet.actions)
  }

  function eventActions(ev: LogEvent) {
    const openEdit = () => {
      const draft = intraopEventEditDraft(ev)
      setEditEv(ev)
      setEditDose(draft.dose)
      setEditTime(draft.time)
      setEditOpen(true)
    }
    const actions = buildIntraopEventActions({
      event: ev,
      cancelLabel,
      repeatDrug: () => save(repeatDrugEventPayload(ev)),
      editEvent: openEdit,
      deleteEvent: () => removeEvent(ev),
    })
    actionSheet(eventLabel(ev).text, formatTs(ev.ts), actions)
  }

  function confirmEdit() {
    if (!editEv) return
    const newLog = applyIntraopEventEdit(log, editEv.id, editTime, editDose)
    syncLog(newLog)
    setEditOpen(false)
    setEditEv(null)
  }

  function promptDelete(ev: LogEvent) {
    void confirmAction("Delete event", `Remove "${eventLabel(ev).text}"?`, { destructive: true, confirmLabel: "Delete", cancelLabel })
      .then(ok => {
        if (ok) removeEvent(ev)
      })
  }

  function openRowQuickAdd(col: number, action: RowQuickAddAction) {
    dispatchRowQuickAdd(chartStart, col, action, {
      openVitals,
      openDrug,
      openInfusion,
      openFluid,
      openAgent,
      openGasSettings,
      openEvent: date => {
        setSlotTs(date)
        setSlotOpen(true)
      },
    })
  }

  function openSlotEvent(ev: { label: string; color: string }, isComplication = false) {
    const ts = slotIsoTimestamp(slotTs)
    save({ type: "clinical_event", label: ev.label, color: ev.color }, ts ?? undefined)
    if (isComplication) addComplicationFromEvent(ev.label)
    setSlotOpen(false)
  }

  return {
    editOpen,
    setEditOpen,
    editEv,
    setEditEv,
    editDose,
    setEditDose,
    editTime,
    setEditTime,
    emergencyShortcut,
    eventActions,
    confirmEdit,
    promptDelete,
    openRowQuickAdd,
    openSlotEvent,
  }
}
