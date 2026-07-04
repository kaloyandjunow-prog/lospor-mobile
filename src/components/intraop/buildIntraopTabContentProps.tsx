/* eslint-disable @typescript-eslint/no-explicit-any */
import { VascularTab } from "@/components/intraop/tabs/VascularTab"
import type { IntraopTabContentHostProps } from "@/components/intraop/IntraopTabContentHost"
import { formatComplications } from "@/lib/intraop-complications"
import { timeAtCol } from "@/lib/intraop-projection"
import { buildRowSummary } from "@/lib/intraop-running"
import { confirmAction } from "@/lib/notify"
import { techniqueColor } from "@/lib/intraop-technique"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { VitalsEntry } from "@/components/IntraopTimetable"

export function buildIntraopTabContentProps(props: any): IntraopTabContentHostProps {
  const {
    screenWidth, tab, undoEv, chartRows, chartStart, currentCol, expandedRow, nowSlotPercent,
    timetable, eventRows, activeInfusions, activeFluids, activeAgent, activeGas, startRef,
    isWatching, verticalTimetableRef, undoLastEvent, setUndoEv, setExpandedRow, eventLabel,
    setInfActTgt, setInfActRate, setInfActOpen, openFluidEnd, openGasSettings, tc, stopAgent,
    openRowQuickAdd, jumpVerticalTimetableToNow, openEndCase, preop, techPath, setTechPath,
    TECHNIQUE_TREE, techniques, setTechniques, saveTechniques, techniqueLabel, otherTechText,
    setOtherTechText, caseMonthYear, setCaseMonthYear, caseStartTime, setCaseStartTime,
    caseEndTime, setCaseEndTime, caseEndNextDay, setCaseEndNextDay, timingSaving, saveTiming,
    positions, setPositions, savePositions, fieldSaving, POSITIONS_LIST, monitoring,
    setMonitoring, saveMonitoring, MONITORING_OPTS, advMonOpen, setAdvMonOpen, awTools,
    setAwTools, awClGrade, setAwClGrade, awDevices, setAwDevices, awLmaSize, setAwLmaSize,
    awOralTubeSize, setAwOralTubeSize, awOralCuffed, setAwOralCuffed, awNasalTubeSize,
    setAwNasalTubeSize, awNasalCuffed, setAwNasalCuffed, awDltType, setAwDltType,
    awDltSide, setAwDltSide, awDltSize, setAwDltSize, awEbSize, setAwEbSize, awVentModes,
    setAwVentModes, awNotes, setAwNotes, saveAirwaySection, awExpandedDevice,
    setAwExpandedDevice, awExpandedWasComplete, AIRWAY_TOOLS, AIRWAY_DEVICES,
    awVentExpanded, setAwVentExpanded, vascularAccesses, setVascularAccesses,
    saveVascularAccesses, vascularSaving, vascSiteColor, VASC_TREE, vascDefaultUnit,
    VASC_PREEXISTING_QUICK, premedEveningText, setPremedEveningText, premedMorningText,
    setPremedMorningText, savePremedication, openPremedPicker, log, selectedComplications,
    complicationsNotes, setComplicationsNotes, saveComplications, setCompOpen, eventActions,
    promptDelete, prevVitalFor, ttColCount, chartPage, caseEnded, resumeSecsLeft, resumeCase,
    setChartPage, setTtColCount, handleChartTimetableChange, setEntryTs,
    logEventText, logBuildSummary,
  } = props

  return {
    tab,
    log: {
      screenWidth,
      undoEvent: undoEv,
      chartRows,
      rowHeight: 60,
      chartStart,
      currentCol,
      expandedRow,
      nowSlotPercent,
      timetable,
      eventRows,
      activeInfusions,
      activeFluids,
      activeAgent,
      activeGas,
      started: !!startRef.current,
      isWatching,
      listRef: verticalTimetableRef,
      onUndo: undoLastEvent,
      onDismissUndo: () => setUndoEv(null),
      onSetExpandedRow: setExpandedRow,
      eventText: logEventText ?? ((ev: LogEvent) => eventLabel(ev).text),
      buildSummary: logBuildSummary ?? ((vital: VitalsEntry | undefined, rowEvents: LogEvent[]) => buildRowSummary(vital, rowEvents, ev => eventLabel(ev).text)),
      onManageInfusion: inf => { setInfActTgt(inf); setInfActRate(inf.rate); setInfActOpen(true) },
      onEndFluid: openFluidEnd,
      onEditGas: c => { if (activeGas) openGasSettings(timeAtCol(chartStart, c).toISOString(), activeGas, "change") },
      onStopAgent: () => {
        if (activeAgent) void confirmAction(`Stop ${activeAgent.name}?`, undefined, { destructive: true, confirmLabel: "Stop", cancelLabel: tc("cancelLabel") })
          .then(ok => { if (ok) stopAgent() })
      },
      onQuickAdd: openRowQuickAdd,
      onJumpToNow: jumpVerticalTimetableToNow,
      onEndCase: openEndCase,
    },
    equipment: { preop },
    technique: {
      techPath,
      setTechPath,
      techniqueTree: TECHNIQUE_TREE,
      techniques,
      setTechniques,
      saveTechniques,
      techniqueColor,
      techniqueLabel,
      otherTechText,
      setOtherTechText,
      tc,
    },
    timing: {
      caseMonthYear,
      setCaseMonthYear,
      caseStartTime,
      setCaseStartTime,
      caseEndTime,
      setCaseEndTime,
      caseEndNextDay,
      setCaseEndNextDay,
      timingSaving,
      saveTiming,
      startRef,
      tc,
    },
    position: { positions, setPositions, savePositions, fieldSaving, positionsList: POSITIONS_LIST },
    monitoring: { monitoring, setMonitoring, saveMonitoring, fieldSaving, monitoringOpts: MONITORING_OPTS, advMonOpen, setAdvMonOpen },
    airway: {
      awTools, setAwTools, awClGrade, setAwClGrade, awDevices, setAwDevices,
      awLmaSize, setAwLmaSize, awOralTubeSize, setAwOralTubeSize, awOralCuffed,
      setAwOralCuffed, awNasalTubeSize, setAwNasalTubeSize, awNasalCuffed,
      setAwNasalCuffed, awDltType, setAwDltType, awDltSide, setAwDltSide,
      awDltSize, setAwDltSize, awEbSize, setAwEbSize, awVentModes, setAwVentModes,
      awNotes, setAwNotes, saveAirwaySection, awExpandedDevice, setAwExpandedDevice,
      awExpandedWasComplete, airwayTools: AIRWAY_TOOLS, airwayDevices: AIRWAY_DEVICES,
      awVentExpanded, setAwVentExpanded,
    },
    vascular: (
      <VascularTab
        vascularAccesses={vascularAccesses}
        setVascularAccesses={setVascularAccesses}
        saveVascularAccesses={saveVascularAccesses}
        vascularSaving={vascularSaving}
        vascSiteColor={vascSiteColor}
        vascTree={VASC_TREE}
        vascDefaultUnit={vascDefaultUnit}
        vascPreexistingQuick={VASC_PREEXISTING_QUICK}
        tc={tc}
      />
    ),
    premedication: {
      premedEveningText,
      setPremedEveningText,
      premedMorningText,
      setPremedMorningText,
      savePremedication,
      tc,
      openPremedPicker,
    },
    events: {
      log,
      selectedComplications,
      complicationsNotes,
      onComplicationsNotesChange: setComplicationsNotes,
      onComplicationsNotesBlur: () => { if (formatComplications(selectedComplications, complicationsNotes) !== null) saveComplications() },
      onOpenComplications: () => setCompOpen(true),
      onEventActions: eventActions,
      onPromptDelete: promptDelete,
      eventLabel,
      previousVitalFor: prevVitalFor,
    },
    chart: {
      startTime: startRef.current,
      totalColumns: ttColCount,
      page: chartPage,
      timetable,
      endTime: caseEnded || caseEndTime ? caseEndTime : undefined,
      patientWeightKg: preop?.weight ?? undefined,
      patientHeightCm: preop?.height ?? undefined,
      patientSex: preop?.sex ?? undefined,
      resumeCase: resumeSecsLeft > 0 ? resumeCase : undefined,
      activeInfusions,
      onPageChange: setChartPage,
      onColumnCountChange: setTtColCount,
      onTimetableChange: handleChartTimetableChange,
      onSetEntryTs: setEntryTs,
      onManageInfusion: activeInf => { setInfActTgt(activeInf); setInfActRate(""); setInfActOpen(true) },
    },
  }
}
