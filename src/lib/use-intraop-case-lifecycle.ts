import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import { confirmAction } from "@/lib/notify"
import { caseStartDateForHHMM, formatHHMM } from "@/lib/intraop-format"
import type { ActiveFluid, ActiveGasSettings, ActiveInfusion, LogEvent } from "@/lib/intraop-log-event"
import { buildFinaliseCaseState, buildResumeCaseState } from "@/lib/intraop-case-lifecycle"
import { buildEndCaseRunningItems, hasEndCaseRunningItems } from "@/lib/intraop-end-case-items"
import type { EndCaseCleanupItem } from "@/components/intraop/EndCaseSheet"
import { promoteDraftCaseToInProgress } from "@/lib/intraop-timing"

type CaseInfoState = {
  caseCode: string
  procedure?: string
  diagnosis?: string
  techniques?: string[]
  status?: string
  finalizedAt?: string | null
}

type SaveEvent = (partial: Omit<LogEvent, "id" | "ts">, tsOverride?: string, silent?: boolean) => Promise<LogEvent>
type SaveTiming = (overrides?: { startTime?: string; endTime?: string }) => Promise<void>
type PatchIntraopSection = (payload: Record<string, unknown>) => Promise<unknown>

type UseIntraopCaseLifecycleArgs = {
  startRef: MutableRefObject<Date | null>
  setElapsedMs: Dispatch<SetStateAction<number>>
  setCaseInfo: Dispatch<SetStateAction<CaseInfoState | null>>
  setCaseStartTime: Dispatch<SetStateAction<string>>
  setCaseEndTime: Dispatch<SetStateAction<string>>
  save: SaveEvent
  saveTiming: SaveTiming
  patchIntraopSection: PatchIntraopSection
  cancelLabel: string
  activeAgent: { name: string; color: string; percent?: number } | null
  activeGas: ActiveGasSettings
  activeInfusions: ActiveInfusion[]
  activeFluids: ActiveFluid[]
  stopAgent: () => void | Promise<void>
  stopGasSettings: () => void | Promise<void>
  stopInfusion: (target: ActiveInfusion) => void | Promise<void>
  stopFluidDirect: (target: ActiveFluid) => void | Promise<void>
}

export function useIntraopCaseLifecycle({
  startRef,
  setElapsedMs,
  setCaseInfo,
  setCaseStartTime,
  setCaseEndTime,
  save,
  saveTiming,
  patchIntraopSection,
  cancelLabel,
  activeAgent,
  activeGas,
  activeInfusions,
  activeFluids,
  stopAgent,
  stopGasSettings,
  stopInfusion,
  stopFluidDirect,
}: UseIntraopCaseLifecycleArgs) {
  const [endCaseOpen, setEndCaseOpen] = useState(false)
  const [startAtOpen, setStartAtOpen] = useState(false)
  const [startAtInput, setStartAtInput] = useState("")
  const [endCaseDecisions, setEndCaseDecisions] = useState<Record<string, "stop" | "continue">>({})
  const [continuedPostopItems, setContinuedPostopItems] = useState<string[]>([])
  const [caseEnded, setCaseEnded] = useState(false)
  const caseEndedAtRef = useRef<Date | null>(null)
  const [resumeSecsLeft, setResumeSecsLeft] = useState(0)

  useEffect(() => {
    if (resumeSecsLeft <= 0) return
    const timer = setInterval(() => {
      if (!caseEndedAtRef.current) return
      const elapsed = Math.floor((Date.now() - caseEndedAtRef.current.getTime()) / 1000)
      const remaining = Math.max(0, 30 * 60 - elapsed)
      setResumeSecsLeft(remaining)
      if (remaining === 0) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [resumeSecsLeft])

  async function startCaseNow() {
    if (startRef.current) return
    const nowHHMM = formatHHMM()
    setCaseStartTime(nowHHMM)
    void saveTiming({ startTime: nowHHMM })
    setCaseInfo(promoteDraftCaseToInProgress)
    await save({ type: "clinical_event", label: "Anaesthesia start", color: "#22c55e" })
  }

  async function startCaseAt(hhmm: string) {
    if (startRef.current) return
    const startDate = caseStartDateForHHMM(hhmm)
    if (!startDate) return
    startRef.current = startDate
    setElapsedMs(Date.now() - startDate.getTime())
    setCaseStartTime(hhmm)
    void saveTiming({ startTime: hhmm })
    setCaseInfo(promoteDraftCaseToInProgress)
    await save({ type: "clinical_event", label: "Anaesthesia start", color: "#22c55e" }, startDate.toISOString())
    setStartAtOpen(false)
  }

  function finaliseCase(continuedItems: string[]) {
    setEndCaseOpen(false)
    const next = buildFinaliseCaseState(continuedItems)
    if (next.continuedItems) setContinuedPostopItems(next.continuedItems)
    setCaseEndTime(next.endTime)
    void saveTiming({ endTime: next.endTime })
    setCaseEnded(true)
    caseEndedAtRef.current = next.endedAt
    setResumeSecsLeft(next.resumeSecsLeft)
  }

  function openEndCase() {
    if (hasEndCaseRunningItems({ activeAgent, activeGas, activeInfusions, activeFluids })) {
      setEndCaseDecisions({})
      setEndCaseOpen(true)
    } else {
      void confirmAction("End case", "All active items clear. Continue to postoperative form?", { confirmLabel: "Continue", cancelLabel })
        .then(ok => { if (ok) finaliseCase([]) })
    }
  }

  function resumeCase() {
    const next = buildResumeCaseState()
    setCaseEnded(false)
    caseEndedAtRef.current = next.endedAt
    setResumeSecsLeft(next.resumeSecsLeft)
    setCaseEndTime(next.endTime)
    patchIntraopSection(next.patch).catch(() => {})
  }

  const endCaseRunningItems: EndCaseCleanupItem[] = buildEndCaseRunningItems({
    activeAgent,
    activeGas,
    activeInfusions,
    activeFluids,
    stopAgent,
    stopGasSettings,
    stopInfusion,
    stopFluid: stopFluidDirect,
  })

  return {
    endCaseOpen,
    setEndCaseOpen,
    startAtOpen,
    setStartAtOpen,
    startAtInput,
    setStartAtInput,
    endCaseDecisions,
    setEndCaseDecisions,
    continuedPostopItems,
    caseEnded,
    resumeSecsLeft,
    startCaseNow,
    startCaseAt,
    openEndCase,
    finaliseCase,
    resumeCase,
    endCaseRunningItems,
  }
}
