import { useEffect, useRef, type MutableRefObject } from "react"

import { buildAutoFilledVitalEvent, latestVitalColumn, timetableColumnForTimestamp } from "@/lib/intraop-vital-log"
import { roundDown5Min } from "@/lib/intraop-projection"
import type { LogEvent } from "@/lib/intraop-log-event"

type SaveIntraopEvent = (
  partial: Omit<LogEvent, "id" | "ts">,
  tsOverride?: string,
  silent?: boolean,
) => Promise<LogEvent>

export function useIntraopAutofillVitals(
  caseLoaded: boolean,
  autoFillVitals: boolean,
  autoFillBP: boolean,
  autoFillBg: boolean,
  logRef: MutableRefObject<LogEvent[]>,
  startRef: MutableRefObject<Date | null>,
  save: SaveIntraopEvent,
) {
  const autoFillPrevColRef = useRef<number | null>(null)
  const autoFillBusyRef = useRef(false)
  const persistAutoFilledVitalsRef = useRef<(fromCol: number, toCol: number) => Promise<void>>(async () => {})

  async function persistAutoFilledVitals(fromCol: number, toCol: number) {
    if (!startRef.current || autoFillBusyRef.current || toCol < fromCol) return
    autoFillBusyRef.current = true
    try {
      const chartStart = roundDown5Min(startRef.current)

      for (let col = fromCol; col <= toCol; col++) {
        const colStart = chartStart.getTime() + col * 5 * 60_000
        const colEnd = colStart + 5 * 60_000
        const alreadyRecorded = logRef.current.some(ev => {
          const ts = new Date(ev.ts).getTime()
          return ev.type === "vital" && ts >= colStart && ts < colEnd
        })
        if (alreadyRecorded) continue

        // The most recent vital strictly before this column — the "previous
        // cell". Scanned by timestamp rather than array position: .find() would
        // return whatever vital happens to be first in the array, which is only
        // the latest if the log is still newest-first (it is not after a reload
        // or sync), so it could carry the first-ever readings forward instead.
        let source: LogEvent | undefined
        let sourceMs = -Infinity
        for (const ev of logRef.current) {
          if (ev.type !== "vital") continue
          const ms = new Date(ev.ts).getTime()
          if (ms < colStart && ms > sourceMs) { sourceMs = ms; source = ev }
        }
        if (!source) continue

        const copied = buildAutoFilledVitalEvent(source, autoFillBP)
        if (copied) {
          await save(copied, new Date(colStart).toISOString(), true)
        }
      }
    } finally {
      autoFillBusyRef.current = false
    }
  }

  persistAutoFilledVitalsRef.current = persistAutoFilledVitals

  useEffect(() => {
    if (!autoFillVitals) {
      autoFillPrevColRef.current = null
      return
    }
    const timer = setInterval(() => {
      if (!startRef.current) return
      const col = timetableColumnForTimestamp(roundDown5Min(startRef.current), Date.now())
      const prevCol = autoFillPrevColRef.current
      if (prevCol === null) {
        autoFillPrevColRef.current = col
        return
      }
      if (col <= prevCol) return
      if (autoFillBusyRef.current) return
      void persistAutoFilledVitalsRef.current(prevCol + 1, col).finally(() => {
        autoFillPrevColRef.current = col
      })
    }, 10_000)
    return () => clearInterval(timer)
  }, [autoFillVitals, autoFillBP])

  useEffect(() => {
    if (!caseLoaded) return
    if (!autoFillBg) return
    if (!startRef.current) return
    const chartStart = roundDown5Min(startRef.current)
    const lastDataCol = latestVitalColumn(logRef.current, chartStart)
    if (lastDataCol === null) return
    const currentCol = timetableColumnForTimestamp(chartStart, Date.now())
    if (currentCol > lastDataCol) void persistAutoFilledVitalsRef.current(lastDataCol + 1, currentCol)
  }, [caseLoaded, autoFillBg, autoFillBP])
}
