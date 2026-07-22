/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useCallback, useMemo } from "react"
import { View } from "react-native"

import type { VitalsEntry } from "@/components/IntraopTimetable"
import { IntraopSheetsHost } from "@/components/intraop/IntraopSheetsHost"
import { IntraopTabContentHost } from "@/components/intraop/IntraopTabContentHost"
import { buildIntraopSheetsProps } from "@/components/intraop/buildIntraopSheetsProps"
import { buildIntraopTabContentProps } from "@/components/intraop/buildIntraopTabContentProps"
import type { LogEvent } from "@/lib/intraop-log-event"
import { buildRowSummary } from "@/lib/intraop-running"

const MemoizedIntraopSheetsHost = memo(IntraopSheetsHost)

const TAB_CONTENT_DEP_KEYS = [
  "screenWidth", "tab", "undoEv", "chartRows", "chartStart", "currentCol",
  "expandedRow", "nowSlotPercent", "timetable", "eventRows", "activeInfusions",
  "activeFluids", "activeAgent", "activeGas", "isWatching", "log",
  "selectedComplications", "complicationsNotes", "ttColCount", "chartPage",
  "caseEnded", "resumeSecsLeft", "preop", "techPath", "techniques",
  "otherTechText", "caseMonthYear", "caseStartTime", "caseEndTime",
  "caseEndNextDay", "timingSaving", "positions", "fieldSaving", "monitoring",
  "advMonOpen", "awTools", "awClGrade", "awDevices", "awLmaSize",
  "awOralTubeSize", "awOralCuffed", "awNasalTubeSize", "awNasalCuffed",
  "awDltType", "awDltSide", "awDltSize", "awEbSize", "awVentModes",
  "awNotes", "awExpandedDevice", "awExpandedWasComplete", "awVentExpanded",
  "vascularAccesses", "vascularSaving", "premedEveningText", "premedMorningText",
  "TECHNIQUE_TREE", "techniqueLabel", "POSITIONS_LIST", "MONITORING_OPTS",
  "AIRWAY_TOOLS", "AIRWAY_DEVICES", "VASC_TREE", "VASC_PREEXISTING_QUICK",
  "vascSiteColor", "vascDefaultUnit",
]

const SHEET_DEP_KEYS = [
  "activeAgent", "activeGas", "slotOpen", "slotTs", "timeStr", "slotEventSearch",
  "slotCompExpanded", "isGACase", "gasOpen", "gasFgf", "gasCarrierGas", "gasFio2",
  "drugOpen", "drugCat", "drugPick", "drugDose", "drugRoute", "drugConcentration",
  "vitOpen", "vitMode", "editingVitalId", "vitScanBusy", "vSys", "vDia", "vHR",
  "vSpO2", "vEtco2", "vTemp", "vBgl", "infOpen", "infDrug", "infRate",
  "infRoute", "infConcentration", "infActOpen", "infActTgt", "infActRate",
  "infActConcentration", "flOpen", "flFluid", "flVol", "flConcentration",
  "flEndOpen", "flEndTarget", "flEndCustom", "agOpen", "agPick", "agPercent",
  "airwayOpen", "airwayLabel", "airwayDetail", "editOpen", "editEv", "editDose",
  "editTime", "compOpen", "selectedComplications", "compGroupExpanded", "compSaving",
  "startAtOpen", "startAtInput", "endCaseOpen", "endCaseRunningItems",
  "endCaseDecisions", "premedPickOpen", "premedPickPhase", "premedPickCat",
  "premedPickDrug", "premedPickDose", "premedPickRoute", "caseEnded",
  "continuedPostopItems", "preop",
  "CLINICAL_EVENT_CATS", "COMPLICATION_GROUPS", "DRUG_CATS", "favouriteDrugs",
  "BOLUS_SCENARIOS", "DRUG_QUICK_DOSES", "DRUG_RANGES", "INF_DRUGS",
  "DRUG_ROUTES", "DRUG_LA_CONCENTRATIONS", "DRUG_BASE_PROFILES",
  "DRUG_ROUTE_PROFILES", "DRUG_DOSE_CALCS", "INFUSION_SCENARIOS",
  "INFUSION_QUICK_RATES", "INFUSION_ROUTES", "INFUSION_LA_CONCENTRATIONS",
  "INFUSION_RANGES", "INFUSION_SUGGESTED_RATES", "INFUSION_BASE_PROFILES",
  "INFUSION_ROUTE_PROFILES", "favouriteInfusions", "FLUID_LIST",
  "FLUID_QUICK_VOLUMES", "FLUID_CONCENTRATIONS", "FLUID_DEFAULT_CONCENTRATIONS",
  "VOLATILE_AGENTS", "AGENT_QUICK_PERCENTS", "COMPLICATION_TC_TITLES",
  "PREMED_LIBRARY", "vitalVisibility", "etco2Unit", "temperatureUnit",
  "openSlotEvent", "openDrug", "openAgent", "stopAgent", "stopGasSettings",
  "openGasSettings", "confirmGasSettings", "confirmDrug", "startDrugAsInfusion",
  "scanVitalsFromCamera", "confirmVitals", "confirmInfusion", "changeRate",
  "stopInfusion", "confirmFluid", "confirmFluidEnd", "confirmAgent",
  "confirmAirway", "confirmEdit", "toggleComplicationGroup", "toggleComplication",
  "saveComplications", "startCaseAt", "finaliseCase", "addSelectedPremedication",
]

function depsFor(props: any, keys: string[]) {
  return keys.map(key => props[key])
}

export function IntraopRenderSurface(props: any) {
  const { screenWidth, tabSwipeResponder, eventLabel } = props
  const logEventText = useCallback((event: LogEvent) => eventLabel(event).text, [eventLabel])
  const logBuildSummary = useCallback(
    (vital: VitalsEntry | undefined, rowEvents: LogEvent[]) => buildRowSummary(vital, rowEvents, logEventText),
    [logEventText],
  )
  const tabContent = useMemo(
    () => buildIntraopTabContentProps({ ...props, logEventText, logBuildSummary }),
    [...depsFor(props, TAB_CONTENT_DEP_KEYS), logEventText, logBuildSummary],
  )
  const sheets = useMemo(
    () => buildIntraopSheetsProps(props),
    depsFor(props, SHEET_DEP_KEYS),
  )

  return (
    <>
      <View style={{ flex:1, width: screenWidth, overflow: "hidden" }} {...tabSwipeResponder.panHandlers}>
        <IntraopTabContentHost {...tabContent} />
      </View>
      <MemoizedIntraopSheetsHost {...sheets} />
    </>
  )
}
