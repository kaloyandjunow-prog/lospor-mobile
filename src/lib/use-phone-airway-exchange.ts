import { useEffect, useRef, useState } from "react"
import { airwayDeviceEntriesOf, legacyFieldsFromEntries, parseAirwayDeviceEntries, type AirwayDeviceEntry, type AirwayExchangeReason } from "@lospor/core/airway-device-entries"
import { AIRWAY_EVENT_DEVICE } from "@lospor/core/airway-smart"
import type { LogEvent } from "@/lib/intraop-log-event"

/**
 * The airway list on the phone (10.2.0): the stored entries, the picker that
 * adds one (E6: Reintubation or Airway exchange charted here, or a card's
 * Reintubate?), and the old per-kind fields kept filled from the list so the
 * airway section and every older reader stay right.
 */
export type AirwayDialog = { reason: AirwayExchangeReason | null; at: string; eventId?: string; eventLabel?: string; complication?: LogEvent }
export type AirwayAtomicEvent = { id?: string; label: string; ts: string; suggestion?: string; intraopPatch?: Record<string, unknown> }

/** Smart selection (10.2.0): the events that open its panel, with the device each stands for. */
export const SMART_AIRWAY_EVENT_DEVICE = AIRWAY_EVENT_DEVICE
export type AirwaySmartOpen = { device: string; at: string; eventId?: string; eventLabel?: string }

export function usePhoneAirwayExchange({ log, active, smart = false, legacy, persist }: {
  log: readonly LogEvent[]
  active: boolean
  /** Smart selection is on: Intubated, LMA in and DLT placed charted here open its panel with that time. */
  smart?: boolean
  /** The airway section's current per-kind fields, for a case with no stored list. */
  legacy: () => Record<string, unknown>
  /** Saves the list with the per-kind fields it implies. */
  persist: (entries: AirwayDeviceEntry[], fields: Record<string, unknown>, event?: AirwayAtomicEvent) => void
}) {
  const stored = useRef<AirwayDeviceEntry[]>([])
  const [dialog, setDialog] = useState<AirwayDialog | null>(null)
  const [smartOpen, setSmartOpen] = useState<AirwaySmartOpen | null>(null)
  const seen = useRef<Set<string> | null>(null)
  const seenSmart = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!active || !smart) return
    const events = log.filter(event => event.type === "clinical_event" && event.label != null && SMART_AIRWAY_EVENT_DEVICE[event.label])
    if (seenSmart.current == null) { seenSmart.current = new Set(events.map(event => event.id)); return }
    const known = seenSmart.current
    const fresh = events.find(event => !known.has(event.id)
      && !stored.current.some(entry => entry.insertedAt === event.ts)
      && Date.now() - Date.parse(event.recordedAt ?? event.ts) < 2 * 60_000)
    for (const event of events) known.add(event.id)
    if (fresh?.label) setSmartOpen({ device: SMART_AIRWAY_EVENT_DEVICE[fresh.label]!, at: fresh.ts, eventId: fresh.id, eventLabel: fresh.label })
  }, [log, active, smart])

  useEffect(() => {
    if (!active) return
    const events = log.filter(event => event.type === "clinical_event" && (event.label === "Reintubation" || event.label === "Airway exchange"))
    if (seen.current == null) { seen.current = new Set(events.map(event => event.id)); return }
    const known = seen.current
    const fresh = events.find(event => !known.has(event.id)
      && !stored.current.some(entry => entry.insertedAt === event.ts)
      && Date.now() - Date.parse(event.recordedAt ?? event.ts) < 2 * 60_000)
    for (const event of events) known.add(event.id)
    if (fresh) setDialog({ reason: fresh.label === "Reintubation" ? "reintubation" : null, at: fresh.ts, eventId: fresh.id, eventLabel: fresh.label })
  }, [log, active])

  return {
    dialog,
    setDialog,
    smartOpen,
    setSmartOpen,
    /** The case record as loaded: its stored list, if any. */
    hydrate: (intraop: Record<string, unknown>) => { stored.current = parseAirwayDeviceEntries(intraop.airwayDeviceEntries) },
    entries: (): AirwayDeviceEntry[] => airwayDeviceEntriesOf({ ...legacy(), airwayDeviceEntries: stored.current }),
    save: (next: AirwayDeviceEntry[], event?: AirwayAtomicEvent) => {
      stored.current = next
      const linkedEvent = event
        ?? (dialog?.eventId && dialog.eventLabel
          ? { id: dialog.eventId, label: dialog.eventLabel, ts: dialog.at }
          : smartOpen?.eventId && smartOpen.eventLabel
            ? { id: smartOpen.eventId, label: smartOpen.eventLabel, ts: smartOpen.at }
            : undefined)
      persist(next, legacyFieldsFromEntries(next), linkedEvent)
      setDialog(null)
    },
    clear: () => {
      stored.current = []
      persist([], legacyFieldsFromEntries([]))
      setDialog(null)
      setSmartOpen(null)
    },
  }
}
