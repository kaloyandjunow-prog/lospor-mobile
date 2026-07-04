import { useState, type Dispatch, type SetStateAction } from "react"
import type { VascularEntry } from "@/lib/intraop-types"
import type { MonitoringOption } from "@/lib/intraop-option-mappers"
import { buildMonitoringSelectionPatch, buildTechniqueMonitoringUpdate } from "@/lib/intraop-monitoring-defaults"
import { buildIntraopTimingPatch } from "@/lib/intraop-timing"

type CaseInfoState = {
  caseCode: string
  procedure?: string
  diagnosis?: string
  techniques?: string[]
  status?: string
  finalizedAt?: string | null
}

type PatchIntraopSection = (payload: Record<string, unknown>) => Promise<unknown>

type UseIntraopSectionSavesArgs = {
  patchIntraopSection: PatchIntraopSection
  monitoringOptions: MonitoringOption[]
  monitoring: string[]
  setMonitoring: Dispatch<SetStateAction<string[]>>
  setCaseInfo: Dispatch<SetStateAction<CaseInfoState | null>>
  caseMonthYear: string
  caseStartTime: string
  caseEndTime: string
  caseEndNextDay: boolean
}

export function useIntraopSectionSaves({
  patchIntraopSection,
  monitoringOptions,
  monitoring,
  setMonitoring,
  setCaseInfo,
  caseMonthYear,
  caseStartTime,
  caseEndTime,
  caseEndNextDay,
}: UseIntraopSectionSavesArgs) {
  const [timingSaving, setTimingSaving] = useState(false)
  const [fieldSaving, setFieldSaving] = useState<string | null>(null)
  const [vascularSaving, setVascularSaving] = useState(false)

  async function saveTiming(overrides?: { startTime?: string; endTime?: string }) {
    setTimingSaving(true)
    try {
      await patchIntraopSection(buildIntraopTimingPatch({
        monthYear: caseMonthYear,
        startTime: caseStartTime,
        endTime: caseEndTime,
        endTimeNextDay: caseEndNextDay,
      }, overrides))
    } catch {
      /* best-effort */
    } finally {
      setTimingSaving(false)
    }
  }

  async function saveVascularAccesses(next: VascularEntry[]) {
    setVascularSaving(true)
    try {
      await patchIntraopSection({ vascularAccesses: next })
    } catch {
      /* best-effort */
    } finally {
      setVascularSaving(false)
    }
  }

  async function savePositions(next: string[]) {
    setFieldSaving("positions")
    try {
      await patchIntraopSection({ positions: next })
    } catch {
      /* best-effort */
    } finally {
      setFieldSaving(null)
    }
  }

  async function saveMonitoring(next: string[]) {
    setFieldSaving("monitoring")
    try {
      await patchIntraopSection(buildMonitoringSelectionPatch(monitoringOptions, next))
    } catch {
      /* best-effort */
    } finally {
      setFieldSaving(null)
    }
  }

  async function saveTechniques(next: string[]) {
    setFieldSaving("techniques")
    try {
      const { patch, monitoring: nextMonitoring } = buildTechniqueMonitoringUpdate(monitoringOptions, monitoring, next)
      if (nextMonitoring) setMonitoring(nextMonitoring)
      await patchIntraopSection(patch)
      setCaseInfo(prev => prev ? { ...prev, techniques: next } : prev)
    } catch {
      /* best-effort */
    } finally {
      setFieldSaving(null)
    }
  }

  return {
    timingSaving,
    fieldSaving,
    vascularSaving,
    saveTiming,
    saveVascularAccesses,
    savePositions,
    saveMonitoring,
    saveTechniques,
  }
}
