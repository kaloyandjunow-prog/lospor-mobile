import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react"

import type { TimetableData } from "@/components/IntraopTimetable"
import { calculateFluidTotals, fluidTotalsKey, fluidTotalsPatch } from "@/lib/intraop-chart-change"
import { eventsToTimetable, roundDown5Min } from "@/lib/intraop-projection"
import type { LogEvent } from "@/lib/intraop-log-event"

type UseIntraopRuntimeEffectsArgs = {
  caseLoaded: boolean
  log: LogEvent[]
  logRef: MutableRefObject<LogEvent[]>
  startRef: MutableRefObject<Date | null>
  timetable: TimetableData
  setElapsedMs: Dispatch<SetStateAction<number>>
  setTimetable: Dispatch<SetStateAction<TimetableData>>
  patchIntraopSection: (payload: Record<string, unknown>) => Promise<unknown>
}

export function useIntraopRuntimeEffects({
  caseLoaded,
  log,
  logRef,
  startRef,
  timetable,
  setElapsedMs,
  setTimetable,
  patchIntraopSection,
}: UseIntraopRuntimeEffectsArgs) {
  const lastFluidTotalsRef = useRef("")
  const fluidTotalsInitializedRef = useRef(false)
  const patchIntraopSectionRef = useRef(patchIntraopSection)

  useEffect(() => {
    patchIntraopSectionRef.current = patchIntraopSection
  }, [patchIntraopSection])

  useEffect(() => {
    logRef.current = log
  }, [log, logRef])

  useEffect(() => {
    if (!caseLoaded) return
    const totals = calculateFluidTotals(timetable.fluids)
    const key = fluidTotalsKey(totals)
    if (!fluidTotalsInitializedRef.current) {
      fluidTotalsInitializedRef.current = true
      lastFluidTotalsRef.current = key
      return
    }
    if (key === lastFluidTotalsRef.current) return
    lastFluidTotalsRef.current = key
    patchIntraopSectionRef.current(fluidTotalsPatch(totals)).catch(() => {})
  }, [caseLoaded, timetable.fluids])

  useEffect(() => {
    const timer = setInterval(() => {
      if (!startRef.current) return
      const now = new Date()
      setElapsedMs(now.getTime() - startRef.current.getTime())
      setTimetable(eventsToTimetable(logRef.current, roundDown5Min(startRef.current), now))
    }, 10_000)
    return () => clearInterval(timer)
  }, [logRef, setElapsedMs, setTimetable, startRef])
}
