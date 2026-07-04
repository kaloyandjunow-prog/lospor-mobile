import { useCallback, useMemo } from "react"
import { buildEventLabel } from "@/lib/intraop-event-label"
import type { LogEvent } from "@/lib/intraop-log-event"
import { buildTechniqueTree, techniqueDisplayLabel } from "@/lib/intraop-technique"
import { mapAirwayOptions, mapMonitoringOptions, mapPositionOptions, mapPremedicationCategories } from "@/lib/intraop-option-mappers"
import { buildVascTree } from "@/lib/vascular-access-tree"
import { useIntraopOptions } from "@/lib/use-intraop-options"
import { useOptionLibrary } from "@/lib/use-option-library"

export function useIntraopOptionSets() {
  const intraopOptions = useIntraopOptions()
  const {
    drugColor,
    clinicalEventColor,
  } = intraopOptions

  const { options: positionLibOpts } = useOptionLibrary("POSITION")
  const POSITIONS_LIST = useMemo(() => mapPositionOptions(positionLibOpts), [positionLibOpts])

  const { options: monitoringLibOpts } = useOptionLibrary("MONITORING")
  const MONITORING_OPTS = useMemo(() => mapMonitoringOptions(monitoringLibOpts), [monitoringLibOpts])

  const { options: techniqueLibOpts } = useOptionLibrary("TECHNIQUE")
  const TECHNIQUE_TREE = useMemo(() => buildTechniqueTree(techniqueLibOpts), [techniqueLibOpts])

  const { options: vascularLibOpts } = useOptionLibrary("VASCULAR_ACCESS")
  const VASC_TREE = useMemo(() => buildVascTree(vascularLibOpts), [vascularLibOpts])

  const { options: airwayLibOpts } = useOptionLibrary("AIRWAY_MANAGEMENT")
  const AIRWAY_TOOLS = useMemo(() => mapAirwayOptions(airwayLibOpts, "Instrument"), [airwayLibOpts])
  const AIRWAY_DEVICES = useMemo(() => mapAirwayOptions(airwayLibOpts, "Device"), [airwayLibOpts])

  const { options: premedLibOpts } = useOptionLibrary("PREMED_DRUG")
  const PREMED_LIBRARY = useMemo(() => mapPremedicationCategories(premedLibOpts), [premedLibOpts])

  const eventLabel = useCallback((ev: LogEvent, prevVital?: LogEvent): { text: string; color: string; sub?: string } =>
    buildEventLabel(ev, prevVital, { drugColor, clinicalEventColor }),
  [clinicalEventColor, drugColor])

  const techniqueLabel = useCallback((value: string): string =>
    techniqueDisplayLabel(value, TECHNIQUE_TREE),
  [TECHNIQUE_TREE])

  return {
    ...intraopOptions,
    POSITIONS_LIST,
    MONITORING_OPTS,
    TECHNIQUE_TREE,
    VASC_TREE,
    AIRWAY_TOOLS,
    AIRWAY_DEVICES,
    PREMED_LIBRARY,
    eventLabel,
    techniqueLabel,
  }
}
