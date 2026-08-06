import type { ComponentProps, ReactNode } from "react"

import { AirwayTab } from "@/components/intraop/tabs/AirwayTab"
import { EquipmentTab } from "@/components/intraop/tabs/EquipmentTab"
import { MonitoringTab } from "@/components/intraop/tabs/MonitoringTab"
import { PositionTab } from "@/components/intraop/tabs/PositionTab"
import { PremedicationTab } from "@/components/intraop/tabs/PremedicationTab"
import { TechniqueTab } from "@/components/intraop/tabs/TechniqueTab"
import { TimingTab } from "@/components/intraop/tabs/TimingTab"
import { IntraopChartTab } from "@/components/intraop/IntraopChartTab"
import { IntraopEventsTab } from "@/components/intraop/IntraopEventsTab"
import { IntraopTimetableTab } from "@/components/intraop/IntraopTimetableTab"

/**
 * One tab's props, never all of them.
 *
 * This used to be a single object carrying a group for each of the eleven tabs,
 * built in full on every render even though exactly one is displayed — and then
 * deep-walked twice by `useStableRenderModel`. Tab switching measured 65–341 ms
 * on a desktop machine because of it.
 *
 * A discriminated union makes the cheap thing the only expressible thing: the
 * builder cannot construct a group it is not about to render.
 */
export type IntraopTabContentHostProps =
  | { tab: "log"; content: ComponentProps<typeof IntraopTimetableTab> }
  | { tab: "equipment"; content: ComponentProps<typeof EquipmentTab> }
  | { tab: "technique"; content: ComponentProps<typeof TechniqueTab> }
  | { tab: "timing"; content: ComponentProps<typeof TimingTab> }
  | { tab: "position"; content: ComponentProps<typeof PositionTab> }
  | { tab: "monitoring"; content: ComponentProps<typeof MonitoringTab> }
  | { tab: "airway"; content: ComponentProps<typeof AirwayTab> }
  | { tab: "vascular"; content: ReactNode }
  | { tab: "premedication"; content: ComponentProps<typeof PremedicationTab> }
  | { tab: "events"; content: ComponentProps<typeof IntraopEventsTab> }
  | { tab: "chart"; content: ComponentProps<typeof IntraopChartTab> }

export function IntraopTabContentHost(props: IntraopTabContentHostProps) {
  switch (props.tab) {
    case "log": return <IntraopTimetableTab {...props.content} />
    case "equipment": return <EquipmentTab {...props.content} />
    case "technique": return <TechniqueTab {...props.content} />
    case "timing": return <TimingTab {...props.content} />
    case "position": return <PositionTab {...props.content} />
    case "monitoring": return <MonitoringTab {...props.content} />
    case "airway": return <AirwayTab {...props.content} />
    case "vascular": return <>{props.content}</>
    case "premedication": return <PremedicationTab {...props.content} />
    case "events": return <IntraopEventsTab {...props.content} />
    case "chart": return <IntraopChartTab {...props.content} />
    default: return null
  }
}
