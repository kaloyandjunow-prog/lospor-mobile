import { useState } from "react"

import type { AirwayDetail } from "@/components/intraop/AirwayDetailSheet"
import { formatAirwayEventLabel } from "@/lib/intraop-airway-event"
import type { LogEvent } from "@/lib/intraop-log-event"

type SaveIntraopEvent = (
  partial: Omit<LogEvent, "id" | "ts">,
  tsOverride?: string,
  silent?: boolean,
) => Promise<LogEvent>

export function useIntraopAirwayEvent(
  save: SaveIntraopEvent,
  clinicalEventColor: (label: string) => string,
) {
  const [airwayOpen, setAirwayOpen] = useState(false)
  const [airwayLabel, setAirwayLabel] = useState("")
  const [airwayDetail, setAirwayDetail] = useState<AirwayDetail>({ tubeSize: "7.0", cuffed: "yes", tool: "Direct", cl: "" })

  async function confirmAirway() {
    const label = formatAirwayEventLabel(airwayLabel, airwayDetail)
    const color = clinicalEventColor(airwayLabel)
    await save({ type: "clinical_event", label, color })
    setAirwayOpen(false)
  }

  return {
    airwayOpen,
    setAirwayOpen,
    airwayLabel,
    setAirwayLabel,
    airwayDetail,
    setAirwayDetail,
    confirmAirway,
  }
}
