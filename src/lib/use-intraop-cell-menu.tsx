import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native"
import { intraopContinuousMenu, intraopMenuItemOf, intraopPointMenu, type IntraopMenuAction } from "@lospor/core/intraop-menu"
import {
  intraopDeleteAsksAboutPair,
  intraopDeleteHere,
  intraopDeleteWhole,
  intraopFixBoundary,
  intraopMoveEvent,
  intraopRunEventIds,
  type IntraopEditRefusal,
} from "@lospor/core/intraop-edits"
import { intraopItemRef, intraopStampForColumn, type IntraopItemKind } from "@lospor/core/intraop-commands"
import { INTRAOP_COLUMN_MS, sortIntraopEvents } from "@lospor/core/intraop-engine"
import { instantForTimeInCase } from "@lospor/core/time-entry"
import { localTimeOf } from "@lospor/core/intraop-time"
import { EMPTY_INTRAOP_HISTORY, intraopHistoryPush, intraopHistoryUndo, intraopUndoEntry, type IntraopHistory } from "@lospor/core/intraop-undo"
import type { LogEvent } from "@/lib/intraop-log-event"
import { actionSheet } from "@/lib/notify"
import { useShade } from "@/theme/colors"
import { TimeWheel } from "@/components/TimeWheel"
import { CELL_MENU_COPY, type CellMenuLocale } from "./intraop-cell-menu-copy"

/**
 * The PWA's one menu for whatever is in a cell (10.8.0): the same actions as
 * the web chart and the event log, decided by Core, drawn as a sheet from the
 * bottom. What Core can do on the log alone it does here; a dose, a syringe,
 * another agent, a fluid's or infusion's stop with its volume and editing an
 * entry go to the sheets that already do them. Every change can be undone,
 * many steps back.
 */
export type ContinuousCell = { kind: IntraopItemKind; key: string; col: number; title: string }

export type CellMenuSheets = {
  changeDose: (cell: ContinuousCell, ts: string) => void
  changeSyringe: (cell: ContinuousCell, ts: string) => void
  switchAgent: (cell: ContinuousCell, ts: string) => void
  /** Infusion and fluid stops ask for a volume or the pump's total; true when a sheet took it. */
  stopWithData: (cell: ContinuousCell, ts: string) => boolean
  editPoint: (event: LogEvent) => void
  repeatDose: (event: LogEvent) => void
}

type Wheel = { title: string; hour: number; minute: number; reference: Date; apply: (instant: Date) => IntraopEditRefusal | null }

const STOP_TYPE = { agent: "agent_stop", gas: "gas_stop", jet: "jet_stop" } as const

function uid(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("")
}

export function useIntraopCellMenu({ log, syncLog, chartStart, startedAt, endedAt, timeZone, locale, readOnly, now, sheets }: {
  log: LogEvent[]
  syncLog: (next: LogEvent[]) => Promise<unknown> | void
  chartStart: Date
  startedAt: Date | null
  endedAt: Date | null
  timeZone: string
  locale: CellMenuLocale
  readOnly: boolean
  now: () => Date
  sheets: CellMenuSheets
}) {
  const copy = CELL_MENU_COPY[locale]
  const logRef = useRef(log)
  logRef.current = log
  const [wheel, setWheel] = useState<Wheel | null>(null)
  const [history, setHistory] = useState<IntraopHistory>(EMPTY_INTRAOP_HISTORY)
  const [bar, setBar] = useState<string | null>(null)
  const barTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (barTimer.current) clearTimeout(barTimer.current) }, [])

  const showBar = useCallback((text: string) => {
    setBar(text)
    if (barTimer.current) clearTimeout(barTimer.current)
    barTimer.current = setTimeout(() => setBar(null), 9000)
  }, [])

  const commit = useCallback((next: LogEvent[], label: string) => {
    const entry = intraopUndoEntry(logRef.current, next, label)
    if (!entry) return
    void syncLog(next)
    setHistory(current => intraopHistoryPush(current, entry))
    showBar(label)
  }, [showBar, syncLog])

  const undo = useCallback(() => {
    const result = intraopHistoryUndo(history, logRef.current)
    if (!result) return
    void syncLog(result.events)
    setHistory(result.history)
    showBar(`${copy.undone}: ${result.entry.label}`)
  }, [copy.undone, history, showBar, syncLog])

  const timeOf = useCallback((value: Date | string) => localTimeOf(new Date(value), timeZone) ?? "", [timeZone])
  const cellOf = useCallback((col: number) => {
    const start = chartStart.getTime() + col * INTRAOP_COLUMN_MS
    return { start, end: start + INTRAOP_COLUMN_MS }
  }, [chartStart])
  const stampAt = useCallback((col: number) => intraopStampForColumn({ chartStart, column: col, now: now() }), [chartStart, now])
  const editContext = useCallback(() => ({ now: now(), startedAt, endedAt }), [endedAt, now, startedAt])

  const refuse = useCallback((code: IntraopEditRefusal) => showBar(copy.refusals[code] ?? copy.refusals.TIMELINE), [copy, showBar])

  const openWheel = useCallback((title: string, at: Date, apply: Wheel["apply"]) => {
    const [hour, minute] = (localTimeOf(at, timeZone) ?? "00:00").split(":").map(Number)
    setWheel({ title, hour, minute, reference: at, apply })
  }, [timeZone])

  const lastStartOf = useCallback((cell: ContinuousCell) => [...sortIntraopEvents(logRef.current)].reverse()
    .find(event => { const ref = intraopItemRef(event); return ref?.role === "start" && ref.kind === cell.kind && ref.key === cell.key && Date.parse(event.ts) < cellOf(cell.col).end }), [cellOf])

  const runEventsInCell = useCallback((cell: ContinuousCell) => {
    const range = cellOf(cell.col)
    return sortIntraopEvents(logRef.current).filter(event => {
      const ref = intraopItemRef(event)
      const at = Date.parse(event.ts)
      return ref && ref.kind === cell.kind && ref.key === cell.key && at >= range.start && at < range.end
    })
  }, [cellOf])

  const runContinuous = useCallback((action: IntraopMenuAction, cell: ContinuousCell) => {
    const start = lastStartOf(cell)
    const ts = stampAt(cell.col)
    switch (action) {
      case "stop":
      case "plan_stop": {
        if ((cell.kind === "infusion" || cell.kind === "fluid") && sheets.stopWithData(cell, ts)) return
        const recordedAt = now().toISOString()
        const stop: LogEvent = cell.kind === "infusion" ? { id: uid(), ts, type: "infusion_stop", infId: cell.key, recordedAt }
          : cell.kind === "fluid" ? { id: uid(), ts, type: "fluid_end", fluidId: cell.key, recordedAt }
            : { id: uid(), ts, type: STOP_TYPE[cell.kind], ...(cell.kind === "agent" ? { name: cell.key, agentMode: "concurrent" as const } : {}), recordedAt }
        commit([...logRef.current, stop], copy.done.stopped(cell.title, timeOf(ts)))
        return
      }
      case "change_dose":
      case "plan_change": return sheets.changeDose(cell, ts)
      case "change_syringe": return sheets.changeSyringe(cell, ts)
      case "switch_agent": return sheets.switchAgent(cell, ts)
      case "resume": {
        if (!start) return
        const { id: _id, recordedAt: _recordedAt, ...fields } = start
        commit([...logRef.current, { ...fields, id: uid(), ts, recordedAt: now().toISOString() }], copy.done.resumed(cell.title, timeOf(ts)))
        return
      }
      case "fix_start":
      case "fix_end": {
        if (!start) return
        const runIds = intraopRunEventIds(logRef.current, start.id)
        const run = sortIntraopEvents(logRef.current.filter(event => runIds.includes(event.id)))
        const edge = action === "fix_start" ? run[0] : run.find(event => intraopItemRef(event)?.role === "stop") ?? run[run.length - 1]
        openWheel(`${copy.labels[action]} · ${cell.title}`, new Date(edge.ts), instant => {
          const result = intraopFixBoundary(logRef.current, start.id, action === "fix_start" ? "start" : "end", instant, editContext())
          if (!result.ok) return result.refusal
          commit(result.events, copy.done.fixed(cell.title, timeOf(instant)))
          return null
        })
        return
      }
      case "delete_here": {
        const here = runEventsInCell(cell)[0]
        if (here) commit(intraopDeleteHere(logRef.current, here.id), copy.done.deleted(cell.title))
        return
      }
      case "remove_planned": {
        let next = logRef.current
        for (const event of runEventsInCell(cell).filter(item => Date.parse(item.ts) > now().getTime())) next = intraopDeleteHere(next, event.id)
        commit(next, copy.done.deleted(cell.title))
        return
      }
      case "delete_whole": {
        if (start) commit(intraopDeleteWhole(logRef.current, start.id), copy.done.deletedWhole(cell.title))
        return
      }
      default:
    }
  }, [commit, copy, editContext, lastStartOf, now, openWheel, runEventsInCell, sheets, stampAt, timeOf])

  const runPoint = useCallback((action: IntraopMenuAction, event: LogEvent, title: string) => {
    switch (action) {
      case "repeat_dose": return sheets.repeatDose(event)
      case "edit": return sheets.editPoint(event)
      case "move":
        openWheel(`${copy.labels.move} · ${title}`, new Date(event.ts), instant => {
          const result = intraopMoveEvent(logRef.current, event.id, instant, editContext())
          if (!result.ok) return result.refusal
          commit(result.events, copy.done.moved(title, timeOf(instant)))
          return null
        })
        return
      case "delete":
        if (intraopDeleteAsksAboutPair(logRef.current, event.id)) {
          actionSheet(copy.pair.question, undefined, [
            { label: copy.pair.both, destructive: true, onPress: () => commit(intraopDeleteHere(logRef.current, event.id, { withPair: true }), copy.done.deleted(title)) },
            { label: copy.pair.onlyThis, onPress: () => commit(intraopDeleteHere(logRef.current, event.id), copy.done.deleted(title)) },
            { label: copy.cancel, cancel: true },
          ])
          return
        }
        commit(intraopDeleteHere(logRef.current, event.id), copy.done.deleted(title))
        return
      default:
    }
  }, [commit, copy, editContext, openWheel, sheets, timeOf])

  const openContinuous = useCallback((cell: ContinuousCell) => {
    if (readOnly) return
    const actions = intraopContinuousMenu(logRef.current, cell, cellOf(cell.col), { now: now(), endedAt })
    if (actions.length === 0) return
    actionSheet(cell.title, timeOf(new Date(cellOf(cell.col).start)), [
      ...actions.map(action => ({ label: copy.labels[action], destructive: action.startsWith("delete") || action === "remove_planned", onPress: () => runContinuous(action, cell) })),
      { label: copy.cancel, cancel: true },
    ])
  }, [cellOf, copy, endedAt, now, readOnly, runContinuous, timeOf])

  /** From the chart's cell or from the event log: a continuous entry opens its item's menu in its cell. */
  const openEvent = useCallback((event: LogEvent, title: string) => {
    if (readOnly) return
    const item = intraopMenuItemOf(event)
    if (item) {
      const col = Math.floor((Date.parse(event.ts) - chartStart.getTime()) / INTRAOP_COLUMN_MS)
      openContinuous({ ...item, col, title })
      return
    }
    const actions = intraopPointMenu(event, { readOnly })
    if (actions.length === 0) return
    actionSheet(title, timeOf(event.ts), [
      ...actions.map(action => ({ label: copy.labels[action], destructive: action === "delete", onPress: () => runPoint(action, event, title) })),
      { label: copy.cancel, cancel: true },
    ])
  }, [chartStart, copy, openContinuous, readOnly, runPoint, timeOf])

  const overlay = useMemo(() => (
    <CellMenuOverlay
      wheel={wheel}
      bar={bar}
      canUndo={history.done.length > 0}
      copy={copy}
      onUndo={undo}
      onCloseWheel={() => setWheel(null)}
      onConfirmWheel={(hour, minute) => {
        if (!wheel) return
        const instant = instantForTimeInCase({ hour, minute }, { timeZone, reference: wheel.reference, startedAt, endedAt })
        if (!instant) return
        const refused = wheel.apply(instant)
        if (refused) refuse(refused)
        else setWheel(null)
      }}
    />
  ), [bar, copy, endedAt, history.done.length, refuse, startedAt, timeZone, undo, wheel])

  return { openContinuous, openEvent, overlay, undo, canUndo: history.done.length > 0 }
}

function CellMenuOverlay({ wheel, bar, canUndo, copy, onUndo, onCloseWheel, onConfirmWheel }: {
  wheel: Wheel | null
  bar: string | null
  canUndo: boolean
  copy: (typeof CELL_MENU_COPY)["bg"]
  onUndo: () => void
  onCloseWheel: () => void
  onConfirmWheel: (hour: number, minute: number) => void
}) {
  const shade = useShade()
  const [value, setValue] = useState({ hour: wheel?.hour ?? 0, minute: wheel?.minute ?? 0 })
  useEffect(() => { if (wheel) setValue({ hour: wheel.hour, minute: wheel.minute }) }, [wheel])
  return (
    <>
      {wheel ? (
        <Modal transparent animationType="fade" visible onRequestClose={onCloseWheel}>
          <Pressable style={{ flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" }} onPress={onCloseWheel}>
            <Pressable style={{ backgroundColor: shade("#0f172a"), borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 }} onPress={() => {}}>
              <Text style={{ color: shade("#f8fafc"), fontSize: 16, fontWeight: "800", marginBottom: 12 }}>{wheel.title}</Text>
              <TimeWheel hour={value.hour} minute={value.minute} onChange={setValue} labels={copy.wheel} />
              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <TouchableOpacity onPress={onCloseWheel} style={{ flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: shade("#334155"), alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: shade("#cbd5e1"), fontWeight: "700", fontSize: 15 }}>{copy.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="time-wheel-confirm" onPress={() => onConfirmWheel(value.hour, value.minute)} style={{ flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: shade("#2563eb"), alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#ffffff", fontWeight: "800", fontSize: 15 }}>{copy.confirm}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
      {bar ? (
        <View testID="cell-menu-undo-bar" style={{ position: "absolute", left: 12, right: 12, bottom: 96, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: shade("#1e293b"), borderRadius: 24, paddingLeft: 16, paddingRight: 6, paddingVertical: 6 }}>
          <Text style={{ flex: 1, color: shade("#f8fafc"), fontSize: 14 }} numberOfLines={2}>{bar}</Text>
          {canUndo ? (
            <TouchableOpacity testID="cell-menu-undo" onPress={onUndo} style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: shade("#fbbf24"), fontWeight: "800", fontSize: 15 }}>{copy.undo}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </>
  )
}
