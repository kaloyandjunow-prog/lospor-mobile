import { useState } from "react"
import type { LogEvent } from "@/lib/intraop-log-event"

type ActiveAgent = { name: string; color: string; percent?: number } | null

// Volatile agent on/off, plus Fi(agent)% — agents always dose in %, no
// unit/route rows. `save` is the shared persistence engine owned by the main
// screen (sync state, offline queue, etc.) — every domain hook receives it
// rather than re-implementing persistence.
export function useAgentEntry(
  save: (partial: Omit<LogEvent, "id" | "ts">, tsOverride?: string, silent?: boolean) => Promise<LogEvent>,
  setEntryTs: (ts: string | null) => void,
  activeAgent: ActiveAgent,
  setActiveAgent: (a: ActiveAgent) => void,
) {
  const [agOpen, setAgOpen] = useState(false)
  const [agPick, setAgPick] = useState<{ name: string; color: string } | null>(null)
  const [agPercent, setAgPercent] = useState<number | null>(null)

  function openAgent(ts?: string) {
    setEntryTs(ts ?? null)
    setAgOpen(true)
  }

  async function confirmAgent() {
    if (!agPick) return
    if (activeAgent && activeAgent.name !== agPick.name)
      await save({ type: "agent_stop", name: activeAgent.name, color: activeAgent.color })
    const percent = agPercent ?? undefined
    setActiveAgent({ name: agPick.name, color: agPick.color, percent })
    await save({ type: "agent_start", name: agPick.name, color: agPick.color, value: percent !== undefined ? String(percent) : undefined })
    setAgOpen(false); setAgPick(null); setAgPercent(null)
  }

  async function stopAgent() {
    if (!activeAgent) return
    const a = activeAgent
    setActiveAgent(null)
    await save({ type: "agent_stop", name: a.name, color: a.color })
  }

  return { agOpen, setAgOpen, agPick, setAgPick, agPercent, setAgPercent, openAgent, confirmAgent, stopAgent }
}
