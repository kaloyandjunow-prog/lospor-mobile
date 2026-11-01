import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import { serverNow } from "@/lib/server-clock"
import {
  intraopAttentionItems,
  intraopResolveAttention,
  type IntraopAttentionAction,
  type IntraopAttentionContext,
  type IntraopAttentionItem,
} from "@lospor/core/intraop-attention"
import { applyIntraopEventOps, isEmptyIntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import { vitalEpisodeOps, type VitalQuestionContext } from "@lospor/core/vital-questions"
import type { LogEvent } from "@/lib/intraop-log-event"

/**
 * The log after one answer, exactly as Core writes it, or null when there is
 * nothing to write (answered elsewhere meanwhile). The PWA decides nothing
 * here: the items and the operations are Core's (9.13.0), and the web app
 * uses the same two functions, so the two cannot list or write differently.
 */
export function logAfterAttentionAnswer(
  log: LogEvent[],
  key: string,
  action: IntraopAttentionAction,
  context: IntraopAttentionContext,
): LogEvent[] | null {
  const ops = intraopResolveAttention(log, key, action, context)
  return isEmptyIntraopEventOps(ops) ? null : applyIntraopEventOps(log, ops) as LogEvent[]
}

/** "Now" to the minute, so a stop's time arriving shows without any other change. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => serverNow().getTime())
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow().getTime()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return Math.floor(now / 60_000) * 60_000
}

export type IntraopAttention = {
  items: IntraopAttentionItem[]
  resolve: (key: string, action: IntraopAttentionAction) => Promise<void>
}

/** What the timeline is waiting for an answer on, live, and the answers. */
export function useIntraopAttention({ log, logRef, endedAtRef, syncLog, resyncActiveRef, vitals = null }: {
  log: LogEvent[]
  logRef: MutableRefObject<LogEvent[]>
  endedAtRef: MutableRefObject<Date | null>
  syncLog: (next: LogEvent[]) => Promise<boolean>
  resyncActiveRef: MutableRefObject<() => void>
  /** The vitals questions (10.1.0); null when they are not asked on this screen. */
  vitals?: VitalQuestionContext | null
}): IntraopAttention {
  const minute = useMinuteClock()
  const endedAt = endedAtRef.current
  const items = useMemo(
    () => intraopAttentionItems(log, { now: minute, endedAt, vitals }),
    [log, minute, endedAt, vitals],
  )
  // Stable across renders, so the chart rows it is handed to are not redrawn
  // on every tick; the latest syncLog is read through a ref.
  const syncLogRef = useRef(syncLog)
  syncLogRef.current = syncLog
  const vitalsRef = useRef(vitals)
  vitalsRef.current = vitals
  const resolve = useCallback(async (key: string, action: IntraopAttentionAction) => {
    const next = logAfterAttentionAnswer(logRef.current, key, action, { now: serverNow(), endedAt: endedAtRef.current, vitals: vitalsRef.current })
    if (!next) return
    await syncLogRef.current(next)
    resyncActiveRef.current()
  }, [logRef, endedAtRef, resyncActiveRef])
  useVitalEpisodeClosing(log, logRef, endedAt, vitals, syncLogRef)
  return { items, resolve }
}

/**
 * Closes an episode from the vitals questions at the first reading back
 * inside both limits, or at the case end (10.1.0). Core decides; this only
 * saves what it returns, one save at a time, on the screen that holds the case.
 */
function useVitalEpisodeClosing(
  log: LogEvent[],
  logRef: MutableRefObject<LogEvent[]>,
  endedAt: Date | null,
  vitals: VitalQuestionContext | null,
  syncLogRef: MutableRefObject<(next: LogEvent[]) => Promise<boolean>>,
) {
  const closing = useRef(false)
  useEffect(() => {
    if (!vitals || closing.current) return
    const ops = vitalEpisodeOps(log, vitals, endedAt)
    if (isEmptyIntraopEventOps(ops)) return
    // This runs before the screen's own effect copies the log into logRef, so
    // on a fresh load logRef is still empty: closing onto it saved an empty
    // chart. Bring it up to date first, as that effect is about to.
    logRef.current = log
    closing.current = true
    void syncLogRef.current(applyIntraopEventOps(logRef.current, ops) as LogEvent[])
      .finally(() => { closing.current = false })
  }, [log, logRef, endedAt, vitals, syncLogRef])
}
