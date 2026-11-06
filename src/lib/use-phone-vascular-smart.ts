import { useEffect, useRef, useState } from "react"
import type { VascularLine } from "@lospor/core/vascular-access-lines"
import { VASCULAR_EVENT_TYPE } from "@lospor/core/vascular-smart"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { VascularSmartRequest } from "@/components/intraop/VascularSmartPanel"

/**
 * Smart selection for vascular access, from the timeline (10.2.0): IV line in, Art line in, CVC in
 * and PICC charted on this screen open the panel with that time already set. One already on the
 * list at that time, or one that was on the case when it loaded, does not.
 */
export function usePhoneVascularEvents({ log, active, lines }: {
  log: readonly LogEvent[]
  /** Smart selection is on, and this screen holds the case. */
  active: boolean
  lines: () => readonly VascularLine[]
}) {
  const [request, setRequest] = useState<VascularSmartRequest | null>(null)
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!active) return
    const events = log.filter(event => event.type === "clinical_event" && event.label != null && VASCULAR_EVENT_TYPE[event.label])
    if (seen.current == null) { seen.current = new Set(events.map(event => event.id)); return }
    const known = seen.current
    const fresh = events.find(event => !known.has(event.id)
      && !lines().some(line => line.insertedAt === event.ts)
      && Date.now() - Date.parse(event.recordedAt ?? event.ts) < 2 * 60_000)
    for (const event of events) known.add(event.id)
    if (fresh?.label) setRequest({ ...VASCULAR_EVENT_TYPE[fresh.label]!, at: fresh.ts, source: "timeline", eventId: fresh.id, eventLabel: fresh.label })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, active])
  return { request, setRequest }
}
