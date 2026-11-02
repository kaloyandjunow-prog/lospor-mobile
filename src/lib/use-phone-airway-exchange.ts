import { useEffect, useRef, useState } from "react"
import { airwayDeviceEntriesOf, legacyFieldsFromEntries, parseAirwayDeviceEntries, type AirwayDeviceEntry, type AirwayExchangeReason } from "@lospor/core/airway-device-entries"
import type { LogEvent } from "@/lib/intraop-log-event"

/**
 * The airway list on the phone (10.2.0): the stored entries, the picker that
 * adds one (E6: Reintubation or Airway exchange charted here, or a card's
 * Reintubate?), and the old per-kind fields kept filled from the list so the
 * airway section and every older reader stay right.
 */
export type AirwayDialog = { reason: AirwayExchangeReason | null; at: string; complication?: LogEvent }

export function usePhoneAirwayExchange({ log, active, legacy, persist }: {
  log: readonly LogEvent[]
  active: boolean
  /** The airway section's current per-kind fields, for a case with no stored list. */
  legacy: () => Record<string, unknown>
  /** Saves the list with the per-kind fields it implies. */
  persist: (entries: AirwayDeviceEntry[], fields: Record<string, unknown>) => void
}) {
  const stored = useRef<AirwayDeviceEntry[]>([])
  const [dialog, setDialog] = useState<AirwayDialog | null>(null)
  const seen = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!active) return
    const events = log.filter(event => event.type === "clinical_event" && (event.label === "Reintubation" || event.label === "Airway exchange"))
    if (seen.current == null) { seen.current = new Set(events.map(event => event.id)); return }
    const known = seen.current
    const fresh = events.find(event => !known.has(event.id)
      && !stored.current.some(entry => entry.insertedAt === event.ts)
      && Date.now() - Date.parse(event.recordedAt ?? event.ts) < 2 * 60_000)
    for (const event of events) known.add(event.id)
    if (fresh) setDialog({ reason: fresh.label === "Reintubation" ? "reintubation" : null, at: fresh.ts })
  }, [log, active])

  return {
    dialog,
    setDialog,
    /** The case record as loaded: its stored list, if any. */
    hydrate: (intraop: Record<string, unknown>) => { stored.current = parseAirwayDeviceEntries(intraop.airwayDeviceEntries) },
    entries: (): AirwayDeviceEntry[] => airwayDeviceEntriesOf({ ...legacy(), airwayDeviceEntries: stored.current }),
    save: (next: AirwayDeviceEntry[]) => {
      stored.current = next
      persist(next, legacyFieldsFromEntries(next))
      setDialog(null)
    },
  }
}
