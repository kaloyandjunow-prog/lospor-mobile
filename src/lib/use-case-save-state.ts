import { createContext, useContext, useEffect, useState } from "react"
import type { IntraopSaveInput } from "@lospor/core/intraop-save-state"
import type { CaseSection, RefusedChange } from "@lospor/core/sync"

import { autosaveManager } from "@/lib/autosave-manager"

/**
 * Whether a case's changes have reached the server, per event (9.13.0), from
 * the autosave manager's journals -- the queue itself, not a flag on each
 * event that an edit or a reload could leave behind.
 */
export type CaseSaveState = Omit<IntraopSaveInput, "refused"> & {
  queuedSections: CaseSection[]
  refused: RefusedChange[]
  dismissRefused: () => void
}

const NOTHING: CaseSaveState = {
  queuedEventIds: [],
  sendingEventId: null,
  refused: [],
  queuedSections: [],
  dismissRefused: () => {},
}

export function useCaseSaveState(caseId: string | null | undefined): CaseSaveState {
  const [state, setState] = useState(() => pick(caseId))
  useEffect(() => {
    if (!caseId) return
    setState(pick(caseId))
    // The queue persists across restarts; read it once on opening the case.
    void autosaveManager.refreshPending(caseId).catch(() => {})
    const unsubscribe = autosaveManager.subscribe(next => {
      if (next.caseId === caseId) setState(pick(caseId))
    })
    return () => { unsubscribe() }
  }, [caseId])
  return state
}

function pick(caseId: string | null | undefined): CaseSaveState {
  if (!caseId) return NOTHING
  const current = autosaveManager.getState(caseId)
  return {
    queuedEventIds: current.queuedEventIds,
    sendingEventId: current.sendingEventId,
    refused: current.refused,
    queuedSections: current.queuedSections,
    dismissRefused: () => { void autosaveManager.dismissRefused(caseId).catch(() => {}) },
  }
}

/** The case's save state for the chart rows, without passing it through every row prop. */
export const CaseSaveStateContext = createContext<CaseSaveState>(NOTHING)

export function useChartSaveState(): CaseSaveState {
  return useContext(CaseSaveStateContext)
}
