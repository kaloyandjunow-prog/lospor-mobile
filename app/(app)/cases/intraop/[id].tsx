import React, { useCallback, useEffect, useRef, useState } from "react"
 
import {
  View, ScrollView, FlatList,
  TextInput,
  unstable_batchedUpdates, useWindowDimensions,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import type { VascularEntry } from "@/lib/intraop-types"
import { formatHHMM } from "@/lib/intraop-format"
import { roundDown5Min } from "@/lib/intraop-projection"
import { useCaseReminders } from "@/lib/use-case-reminders"
import { usePreferences } from "@/lib/preferences-context"
import { emptyTimetable, type TimetableData } from "@/components/IntraopTimetable"
import { colors } from "@/theme/colors"
import { useCaseLock } from "@/lib/use-case-lock"
import { useSuggestionContext, useVitalQuestionContext } from "@/lib/use-intraop-automation"
import { DefibrillationHost } from "@/components/intraop/DefibrillationHost"
import { SuggestionSheetHost } from "@/components/intraop/SuggestionSheetHost"
import { buildPhoneSuggestionSheets, phoneGateWarnings, tagWithSuggestion } from "@/lib/phone-suggestion-sheets"
import { MH_HISTORY_WARNING, type SuggestionContext } from "@lospor/core/intraop-suggestions"
import { confirmAction } from "@/lib/notify"
import { autosaveManager } from "@/lib/autosave-manager"
import { usePhoneDeathPrompt } from "@/lib/use-phone-death-prompt"
import { jetSheet } from "@/lib/jet-sheet"
import { JetHost } from "@/components/intraop/JetHost"
import { TourniquetHost } from "@/components/intraop/TourniquetHost"
import { preopAgeDays } from "@lospor/core/vital-questions"
import { MonitoringSmart } from "@/components/intraop/MonitoringSmart"
import { addAirwayDevice, resolveAirwayTime, suggestedAirwayDetails } from "@lospor/core/airway-smart"
import { toggleEquipmentFlag } from "@lospor/core/equipment-smart"
import { parseTechniqueSides, type TechniqueSide } from "@lospor/core/technique-smart"
import { TechniqueSmart } from "@/components/intraop/TechniqueSmart"
import { techniqueColor } from "@/lib/intraop-technique"
import { useRecentTechniques } from "@/lib/use-recent-techniques"
import { MONITORING_READINGS, isRelaxant, monitoringSuggestions } from "@lospor/core/monitoring-smart"
import { usePhoneAirwayExchange } from "@/lib/use-phone-airway-exchange"
import { AirwayExchangeSheet } from "@/components/intraop/AirwayExchangeSheet"
import { AirwaySmart } from "@/components/intraop/AirwaySmart"
import { AirwaySmartPanel } from "@/components/intraop/AirwaySmartPanel"
import { displayClinicalCode } from "@/lib/clinical-display"
import { VascularSmart } from "@/components/intraop/VascularSmart"
import { VascularSmartPanel } from "@/components/intraop/VascularSmartPanel"
import { usePhoneVascularEvents } from "@/lib/use-phone-vascular-smart"
import { Sheet } from "@/components/intraop/Sheet"
import { airwayToolsFromEntries } from "@lospor/core/airway-device-entries"
import { airwayDeviceSummary } from "@lospor/core/intraop"
import { resolvedTimeZone } from "@lospor/core/intraop-time"
import { cardEventOps } from "@lospor/core/intraop-suggestions"
import { accessKindOf, replaceFailedLine, vascularLineText, type VascularLine } from "@lospor/core/vascular-access-lines"
import { defibrillationSheet } from "@/lib/defibrillation-knob"
import type { SaveIntraopEvent } from "@/lib/intraop-stamp"
import { VASC_PREEXISTING_QUICK, vascDefaultUnit, vascSiteColor } from "@/lib/vascular-access-tree"
import { useAgentEntry } from "@/lib/use-agent-entry"
import { useGasSettingsEntry } from "@/lib/use-gas-settings-entry"
import { useFluidEntry } from "@/lib/use-fluid-entry"
import { useInfusionEntry } from "@/lib/use-infusion-entry"
import { useDrugEntry } from "@/lib/use-drug-entry"
import { BOLUS_SCENARIOS, INFUSION_SCENARIOS } from "@lospor/core"
import { plannedProcedureLabel } from "@lospor/core/procedure-codes"
import { useVitalsEntry } from "@/lib/use-vitals-entry"
import { COMPLICATION_ITEMS } from "@/lib/intraop-static-options"
import { intraopTabForFocus, type IntraopTab } from "@/lib/intraop-tabs"
import { applyIntraopChartChange } from "@/lib/apply-intraop-chart-change"
import { pediatricAgeFromPreop, useAllergyCheck, type IntraopPreopSummary } from "@/lib/intraop-preop-summary"
import { useIntraopOptionSets } from "@/lib/use-intraop-option-sets"
import { useIntraopCaseLifecycle } from "@/lib/use-intraop-case-lifecycle"
import { useIntraopPremedication } from "@/lib/use-intraop-premedication"
import { useIntraopPremedicationPrefill } from "@/lib/use-intraop-premedication-prefill"
import { useIntraopFluidStatus } from "@/lib/use-intraop-fluid-status"
import { useCaseWeights } from "@/lib/use-case-weights"
import { useIntraopAirwaySection } from "@/lib/use-intraop-airway-section"
import { useIntraopSectionSaves } from "@/lib/use-intraop-section-saves"
import { useIntraopSyncStatusStore } from "@/lib/intraop-sync-status"
import { useIntraopComplicationState } from "@/lib/use-intraop-complication-state"
import { useIntraopAutofillVitals } from "@/lib/use-intraop-autofill-vitals"
import { useIntraopSectionPatch } from "@/lib/use-intraop-section-patch"
import { useIntraopTimetableViewport } from "@/lib/use-intraop-timetable-viewport"
import { useIntraopFavourites } from "@/lib/use-intraop-favourites"
import { useIntraopEventPersistence } from "@/lib/use-intraop-event-persistence"
import { useIntraopEventActions } from "@/lib/use-intraop-event-actions"
import { useIntraopLabs } from "@/lib/use-intraop-labs"
import { LabsSheet } from "@/components/intraop/LabsSheet"
import { useIntraopRuntimeEffects } from "@/lib/use-intraop-runtime-effects"
import { useIntraopCaseLoader } from "@/lib/use-intraop-case-loader"
import { useIntraopAutofillPreferences } from "@/lib/use-intraop-autofill-preferences"
import { useIntraopClinicalViewState } from "@/lib/use-intraop-clinical-view-state"
import { useClinicalRules } from "@/lib/pediatric-clinical-rules"
import { enqueueIntraopCaseWrite } from "@/lib/intraop-write-queue"
import { recordIntraopTabTiming, takeRenderPhases } from "@/lib/diagnostics"
import { IntraopScreenChrome } from "@/components/intraop/IntraopScreenChrome"
import { IntraopRenderSurface } from "@/components/intraop/IntraopRenderSurface"
import type { LogEvent } from "@/lib/intraop-log-event"
import { useIntraopRunningState } from "@/lib/use-intraop-running-state"

// react-native-web does NOT export `unstable_batchedUpdates` (it's undefined there),
// so calling it directly throws "is not a function" and aborts the whole case load
// on the PWA. React 18+ auto-batches async setState anyway, so the fallback simply
// runs the updates directly on web while preserving explicit batching on native.
const runBatched: (fn: () => void) => void =
  typeof unstable_batchedUpdates === "function" ? unstable_batchedUpdates : (fn) => fn()

// This module holds the screen and nothing else. Colour palettes, value types,
// the technique tree and the format helpers live in
// src/lib/intraop-{constants,types,technique,format}.ts. The option lists are
// filled from the OptionLibrary API inside the component rather than hardcoded
// here — this file's lists used to drift from the IntraopTimetable widget's own
// copies, and both now read the same rows. eventLabel stays inside the
// component because it depends on drugColor/clinicalEventColor, which read
// library-derived local state.

export default function IntraopLiveScreen() {
  const [preop, setPreop] = useState<IntraopPreopSummary | null>(null)
  const clinicalMode = preop?.clinicalMode === "PEDIATRIC" ? "PEDIATRIC" : "ADULT"
  const pediatricMode = clinicalMode === "PEDIATRIC"
  const {
    snapshot: clinicalRulesSnapshot,
    loading: clinicalRulesLoading,
    error: clinicalRulesError,
    prospectiveGuidanceEnabled,
  } = useClinicalRules(clinicalMode, preop !== null)
  const {
    DRUG_CATS, INF_DRUGS, SEARCH_ONLY_DRUGS, SEARCH_ONLY_INFUSIONS, FLUID_LIST, FLUID_QUICK_VOLUMES, FLUID_CONCENTRATIONS,
    FLUID_DEFAULT_CONCENTRATIONS, FLUID_ROUTES, VOLATILE_AGENTS, DRUG_QUICK_DOSES, DRUG_ROUTES,
    DRUG_LA_CONCENTRATIONS, DRUG_ROUTE_PROFILES, DRUG_BASE_PROFILES, DRUG_RANGES,
    DRUG_DOSE_CALCS, INFUSION_QUICK_RATES, INFUSION_SUGGESTED_RATES,
    INFUSION_ROUTES, INFUSION_LA_CONCENTRATIONS, INFUSION_RANGES,
    INFUSION_ROUTE_PROFILES, INFUSION_BASE_PROFILES, DRUG_CODES, INFUSION_CODES,
    AGENT_QUICK_PERCENTS, CLINICAL_EVENT_CATS, PEDIATRIC_DRUG_PROFILES,
    PEDIATRIC_FLUID_PROFILES, PEDIATRIC_INFUSION_PROFILES,
    POSITIONS_LIST, MONITORING_OPTS, TECHNIQUE_TREE, VASC_TREE, AIRWAY_TOOLS, AIRWAY_DEVICES,
    PREMED_LIBRARY, eventLabel, techniqueLabel, INFUSION_WEIGHT_BASIS,
  } = useIntraopOptionSets(
    clinicalRulesSnapshot?.adultDoseProfiles ?? [],
    clinicalRulesSnapshot?.pediatricDrugProfiles ?? [],
    clinicalRulesSnapshot?.pediatricFluidProfiles ?? [],
    clinicalRulesSnapshot?.pediatricInfusionProfiles ?? [],
    // Pediatric availability (AUTO/MANUAL/LOCAL/HIDDEN) is band-specific, so the
    // pickers can only honour it once the patient's age and weight are known.
    pediatricAgeFromPreop(preop),
    preop?.weight ?? null,
    clinicalRulesSnapshot?.preset ?? null,
    prospectiveGuidanceEnabled,
  )
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>()
  const router  = useRouter()
  // Read-only chart view of the case so far: the same panel the finished-case
  // viewer draws, reachable mid-case. Pushed rather than shown as a modal so
  // the back gesture returns to the cockpit with its state untouched — this
  // opens nothing, edits nothing, and saves nothing.
  const openChartView = useCallback(() => {
    router.push(`/(app)/cases/timetable/${id}`)
  }, [router, id])
  const { isWatching, isWatchingRef, takeover } = useCaseLock(id, true)
  const vitalQuestionContext = useVitalQuestionContext(preop, isWatching) // vitals questions (10.1.0)
  const {
    tc,
    language,
    etco2Unit,
    temperatureUnit,
    cvpUnit,
    defaultMonitoring,
    clinicalPreferencesReady,
    airwayScreen,
    vascularScreen,
    monitoringScreen,
    equipmentScreen,
    techniqueScreen,
  } = usePreferences()

  const [caseInfo, setCaseInfo] = useState<{
    caseCode: string; procedure?: string; procedureUndetermined?: boolean; diagnosis?: string; techniques?: string[]
    status?: string; finalizedAt?: string | null; theatre?: string | null
  } | null>(null)

  const [log,             setLog]             = useState<LogEvent[]>([])
  const logRef = useRef<LogEvent[]>([])
  const legacyWebLogNeedsSyncRef = useRef(false)
  const baseIntraopUpdatedAtRef = useRef<string | null>(null)
  const { activeInfusions, setActiveInfusions, activeFluids, setActiveFluids, activeAgents, setActiveAgents, activeAgent,
    activeGas, setActiveGas, applyActiveState, resyncActiveRef, endedAtRef, projectTimetable } = useIntraopRunningState(logRef)

  const { width: screenWidth } = useWindowDimensions()
  const tabRailRef  = useRef<ScrollView>(null)
  const tabLayouts  = useRef<Partial<Record<string, { x: number; width: number }>>>({})

  const [tab,       setTab]       = useState<IntraopTab>(() => intraopTabForFocus(focus) ?? "equipment")
  // Time from the tap to the committed render of the new tab — the number the
  // clinician actually experiences, readable later on the diagnostics screen.
  const tabSwitchStartedAt = useRef<number | null>(null)
  const tabRenderStartedAt = useRef<number | null>(null)
  const selectTab = useCallback((next: React.SetStateAction<IntraopTab>) => {
    tabSwitchStartedAt.current = Date.now()
    tabRenderStartedAt.current = null
    setTab(next)
  }, [])
  // Marks the start of the render that shows the new tab. The gap between the
  // tap and this point is time React never got — the JS thread was busy with
  // something else, which is a different problem from a slow render.
  if (tabSwitchStartedAt.current !== null && tabRenderStartedAt.current === null) {
    tabRenderStartedAt.current = Date.now()
  }
  useEffect(() => {
    const startedAt = tabSwitchStartedAt.current
    if (startedAt == null) return
    const renderStartedAt = tabRenderStartedAt.current ?? startedAt
    tabSwitchStartedAt.current = null
    tabRenderStartedAt.current = null
    const now = Date.now()
    recordIntraopTabTiming(now - startedAt, {
      tab,
      blockedMs: renderStartedAt - startedAt,
      renderMs: now - renderStartedAt,
      pendingSaves: pendingSaveCountRef.current,
      renderPhases: takeRenderPhases(),
    })
  }, [tab])
  const [elapsedMs, setElapsedMs] = useState(0)
  const [caseLoaded, setCaseLoaded] = useState(false)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const startRef                  = useRef<Date | null>(null)
  const verticalTimetableRef      = useRef<FlatList<number>>(null)
  const [entryTs, setEntryTs]     = useState<string | null>(null)
  const [slotOpen, setSlotOpen]       = useState(false)
  const [slotTs, setSlotTs]           = useState<Date | null>(null)
  const [slotEventSearch, setSlotEventSearch] = useState("")
  const [slotCompExpanded, setSlotCompExpanded] = useState(false)
  // In a store, not this component's state: every autosave moves it twice, and
  // holding it here re-rendered the whole screen for what only a badge shows.
  // See intraop-sync-status.ts. The setters keep a fixed identity.
  const { store: syncStatusStore, setSyncState, setPendingCount, setLastSavedAt, setSyncErrorMessage }
    = useIntraopSyncStatusStore()
  // Tracks concurrent in-flight section saves so case refresh does not reset
  // user-selected state while a save is still outstanding.
  const pendingSaveCountRef = useRef(0)
  const patchIntraopSection = useIntraopSectionPatch({
    caseId: id,
    pendingSaveCountRef,
    setSyncState,
    setSyncErrorMessage,
    setLastSavedAt, watchingRef: isWatchingRef,
  })

  const enqueueEventSave = useCallback(<T,>(operation: () => Promise<T>): Promise<T> =>
    enqueueIntraopCaseWrite(id, operation),
  [id])
  // Vitals sheet — text input refs for auto-advance focus chaining (state +
  // logic now in useVitalsEntry, called further down once setTimetable exists)
  const vSysRef = useRef<TextInput | null>(null)
  const vDiaRef = useRef<TextInput | null>(null)
  const vHRRef = useRef<TextInput | null>(null)
  const vSpO2Ref = useRef<TextInput | null>(null)
  const vEtco2Ref = useRef<TextInput | null>(null)
  const vTempRef = useRef<TextInput | null>(null)
  const vBisRef = useRef<TextInput | null>(null)
  const vTofRef = useRef<TextInput | null>(null)
  const vCvpRef = useRef<TextInput | null>(null)
  const [timetable,  setTimetable]  = useState<TimetableData>(emptyTimetable())
  const [ttColCount, setTtColCount] = useState(12)
  const [chartPage,  setChartPage]  = useState(0)
  const noteVitalsRef = useRef<() => void>(() => {})
  const {
    save, stampFor,
    syncLog,
    retryPendingEvents,
    removeEvent, deleteEvent, removalUndo,
    undoLastEvent,
    undoEv,
    setUndoEv,
  } = useIntraopEventPersistence({
    caseId: id,
    entryTs,
    setEntryTs,
    log,
    logRef,
    startRef,
    legacyWebLogNeedsSyncRef,
    baseIntraopUpdatedAtRef,
    enqueueEventSave,
    setLog,
    setTimetable,
    setElapsedMs,
    setSyncState,
    setLastSavedAt,
    setPendingCount,
    noteVitalsRef, resyncActiveRef, endedAtRef, watchingRef: isWatchingRef,
  })

  // Pediatric cases remain manually chartable but must not inherit unreviewed
  // adult dose, rate, concentration, fluid, gas, or equipment presets.
  const allergyCheck = useAllergyCheck(preop, tc) // infusion + drug sheets check recorded allergies (1.5.0)
  // 10.2.0: a sheet opened from a suggestion card saves its entry with the card's tag.
  const pendingSuggestion = useRef<string | null>(null)
  const suggestionContextRef = useRef<Omit<SuggestionContext, "now"> | null>(null)
  // P1 and E2: an MH history before a volatile or suxamethonium, a local anaesthetic over the maximum.
  const saveTagged = useCallback<SaveIntraopEvent>(async (partial, ...rest) => {
    const warnings = phoneGateWarnings(suggestionContextRef.current, logRef.current, partial,
      { mh: MH_HISTORY_WARNING[language === "bg" ? "bg" : "en"], laMax: tc("sgLaMaxExceeds") }, language, new Date().toISOString())
    if (warnings.length > 0 && !(await confirmAction(`⚠ ${tc("sgLaMaxTitle")}`, warnings.join("\n\n"), { destructive: true, confirmLabel: tc("sgMhGive"), cancelLabel: tc("sgCancel"), labelledOnWeb: true }))) {
      pendingSuggestion.current = null
      return null
    }
    return save(tagWithSuggestion(partial, pendingSuggestion), ...rest)
  }, [save, logRef, language, tc])
  const {
    infOpen, setInfOpen, infDrug, setInfDrug, infRate, setInfRate,
    infRoute, setInfRoute, infConcentration, setInfConcentration,
    infCustomConcentration, setInfCustomConcentration, infFormulation, setInfFormulation,
    infRule, setInfRule,
    infActOpen, setInfActOpen, infActTgt, setInfActTgt, infActRate, setInfActRate,
    infActConcentration, setInfActConcentration, infActTs, setInfActTs,
    openInfusion, confirmInfusion, stopInfusion, changeRate,
  } = useInfusionEntry(saveTagged, setEntryTs, setActiveInfusions, INFUSION_CODES, INFUSION_WEIGHT_BASIS, allergyCheck)

  // Drug sheet
  const {
    drugOpen, setDrugOpen, drugCat, setDrugCat, drugPick, setDrugPick, drugDose, setDrugDose,
    drugRoute, setDrugRoute, drugConcentration, setDrugConcentration,
    drugCustomConcentration, setDrugCustomConcentration, drugFormulation, setDrugFormulation,
    drugRule, applyDrugSelection,
    openDrug, confirmDrug, startDrugAsInfusion, openDrugPreset,
  } = useDrugEntry(
    saveTagged,
    setEntryTs,
    DRUG_CATS,
    INF_DRUGS,
    setInfDrug,
    setInfRate,
    setInfOpen,
    DRUG_CODES,
    pediatricMode ? {} : INFUSION_QUICK_RATES,
    pediatricMode ? {} : DRUG_DOSE_CALCS, allergyCheck,
  )

  // Fluid sheet + end options
  const {
    flOpen, setFlOpen, flFluid, setFlFluid, flVol, setFlVol,
    flEntryMode, setFlEntryMode, flRate, setFlRate, resetFluidDraft,
    flConcentration, setFlConcentration, flRoute, setFlRoute, setFlRule,
    flEndOpen, setFlEndOpen, flEndTarget, flEndCustom, setFlEndCustom,
    flEndRate, setFlEndRate, changeFluidRate,
    openFluid, confirmFluid, openFluidEnd, confirmFluidEnd, stopFluidDirect,
  } = useFluidEntry(saveTagged, setEntryTs, setActiveFluids, stampFor)
  useEffect(() => { if (!drugOpen && !infOpen && !flOpen) pendingSuggestion.current = null }, [drugOpen, infOpen, flOpen])

  // Agent sheet
  const { agOpen, setAgOpen, agPick, setAgPick, agPercent, setAgPercent, openAgent, confirmAgent, stopAgent } =
    useAgentEntry(saveTagged, setEntryTs, activeAgents, setActiveAgents)
  // Gas settings sheet (FGF/carrier gas/FiO2) - event-based gas_start/gas_change/gas_stop.
  const { gasOpen, setGasOpen, gasFgf, setGasFgf, gasCarrierGas, setGasCarrierGas, gasFio2, setGasFio2, openGasSettings, confirmGasSettings, stopGasSettings } =
    useGasSettingsEntry(save, setEntryTs, activeGas, setActiveGas)
  const { favouriteDrugs, favouriteInfusions } = useIntraopFavourites()

  const {
    selectedComplications,
    setSelectedComplications,
    complicationsNotes,
    setComplicationsNotes,
    removeLegacyComplication,
    saveComplications,
  } = useIntraopComplicationState(patchIntraopSection, tc("errorLabel"))

  const {
    premedEveningText,
    setPremedEveningText,
    premedMorningText,
    setPremedMorningText,
    savePremedication,
    openPremedPicker,
    premedPickOpen,
    setPremedPickOpen,
    premedPickPhase,
    premedPickCat,
    setPremedPickCat,
    premedPickDrug,
    setPremedPickDrug,
    premedPickDose,
    setPremedPickDose,
    premedPickRoute,
    setPremedPickRoute,
    addSelectedPremedication,
  } = useIntraopPremedication(patchIntraopSection, tc("errorLabel"))
  // The premedication starts from what the preop visit ordered (1.7.0).
  useIntraopPremedicationPrefill({
    ready: caseLoaded,
    // Watching mode saves nothing, so the order waits for a take-over rather than
    // showing as applied while the server never hears of it.
    readOnly: isWatching || caseInfo?.status === "COMPLETE" || !!caseInfo?.finalizedAt,
    ordered: preop?.premedicationOrders,
    current: { evening: premedEveningText, morning: premedMorningText },
    fill: texts => {
      if (texts.evening != null) setPremedEveningText(texts.evening)
      if (texts.morning != null) setPremedMorningText(texts.morning)
      void savePremedication(texts)
    },
  })

  // Fluid status tab — urine output, blood loss and the blood products note.
  const {
    urineMl, setUrineMl,
    bloodLossMl, setBloodLossMl,
    hydrateFluidStatus,
  } = useIntraopFluidStatus(tab, patchIntraopSection, tc("errorLabel"))
  // Laboratory draws taken during the case, each stamped with its own time.
  const { labResults, hydrateLabs, saveLabs } = useIntraopLabs(patchIntraopSection, tc("errorLabel"))
  const [labsOpen, setLabsOpen] = useState(false)
  const [labsTs, setLabsTs] = useState<string | null>(null)
  const openLabs = useCallback((ts: string) => { setLabsTs(ts); setLabsOpen(true) }, [])
  const { caseIbw, caseTbw, caseBsa } = useCaseWeights({
    clinicalMode, sex: preop?.sex, heightCm: preop?.height,
    weightKg: preop?.weight, ageValue: preop?.ageValue, ageUnit: preop?.ageUnit,
  })

  // Timing tab
  const [caseMonthYear,   setCaseMonthYear]   = useState("")
  const [caseStartTime,   setCaseStartTime]   = useState("")
  const [caseEndTime,     setCaseEndTime]     = useState("")
  const [caseEndNextDay,  setCaseEndNextDay]  = useState(false)
  const [caseTimezone,    setCaseTimezone]    = useState<string | null>(null)

  // Position / Monitoring / Techniques tab state
  const [positions,      setPositions]      = useState<string[]>([])
  const [monitoring,     setMonitoring]     = useState<string[]>([])
  const [techniques,     setTechniques]     = useState<string[]>([])
  // The side of a block or unilateral spinal, by technique code (10.2.0).
  const [techniqueSides, setTechniqueSides] = useState<Record<string, TechniqueSide>>({})
  const {
    timingSaving,
    fieldSaving,
    vascularSaving,
    saveTiming,
    saveVascularAccesses,
    savePositions,
    saveMonitoring,
    saveTechniques,
  } = useIntraopSectionSaves({
    patchIntraopSection,
    monitoringOptions: MONITORING_OPTS,
    monitoring,
    setMonitoring,
    setCaseInfo,
    caseMonthYear,
    caseStartTime,
    caseEndTime,
    caseEndNextDay,
    caseTimezone,
    startRef, endedAtRef, setCaseMonthYear,
  })

  // The intraoperative suggestions (10.2.0), when any group is on and this screen holds the case.
  const startedAtIso = startRef.current?.toISOString() ?? null
  const endedAtIso = endedAtRef.current?.toISOString() ?? null
  const suggestionFacts = React.useMemo(() => ({
    idealWeightKg: caseIbw ?? null,
    tofMonitor: monitoring.includes("tofMonitor"),
    labs: labResults.map(lab => ({ ...lab, unit: lab.unit ?? "" })),
    bloodLossMl: Number(bloodLossMl) > 0 ? Number(bloodLossMl) : null,
    startedAt: startedAtIso,
    endedAt: endedAtIso,
  }), [caseIbw, monitoring, labResults, bloodLossMl, startedAtIso, endedAtIso])
  const suggestionContext = useSuggestionContext(preop, suggestionFacts, isWatching)
  suggestionContextRef.current = suggestionContext

  const {
    endCaseOpen,
    setEndCaseOpen,
    startAtOpen,
    setStartAtOpen,
    startAtInput,
    setStartAtInput,
    startAtDay, openStartAt,
    endCaseDecisions,
    setEndCaseDecisions,
    continuedPostopItems,
    caseEnded,
    resumeSecsLeft,
    startCaseNow,
    startCaseAt,
    openEndCase,
    finaliseCase,
    resumeCase, resumeUnlimited, restoreEndedCase,
    endCaseRunningItems, afterEndItems, resolveAfterEnd, setChosenEndTs, attention,
  } = useIntraopCaseLifecycle({
    startRef,
    setElapsedMs,
    setCaseInfo,
    setCaseStartTime,
    setCaseEndTime,
    setCaseEndNextDay,
    caseTimezone,
    save,
    saveTiming,
    patchIntraopSection,
    cancelLabel: tc("cancelLabel"),
    activeAgents,
    activeGas,
    activeInfusions,
    activeFluids,
    timeline: { caseId: id ?? null, log, logRef, syncLog, removeEvent, labelOf: ev => eventLabel(ev).text, endedAtRef, resyncActiveRef, vitals: vitalQuestionContext, suggestions: suggestionContext },
    stopAgent,
    stopGasSettings,
    stopInfusion,
    stopFluidDirect,
    getReadinessInput: () => ({
      startedAt: startRef.current?.toISOString(),
      startTime: caseStartTime,
      techniques,
      airwayDevices: awDevices,
      ventilationModes: awVentModes,
      positions,
      vascularAccesses,
      ...Object.fromEntries(monitoring.map(field => [field, true])),
      timetableData: timetable,
      keyEvents: log,
      complications: selectedComplications.length > 0 || complicationsNotes.trim()
        ? selectedComplications.join(", ") || complicationsNotes
        : "",
    }),
  })

  // 10.2.0: a death charted here sets the postop destination to Deceased and offers End case.
  usePhoneDeathPrompt(log, !isWatching && caseLoaded, () => {
    if (id) void autosaveManager.saveSection(id, "postop", { disposition: "DECEASED" }, { partial: true })
    void confirmAction(tc("sgEndCase"), tc("sgDeathEndCase"), { confirmLabel: tc("sgEndCase"), cancelLabel: tc("vitalNotNow"), labelledOnWeb: true })
      .then(yes => { if (yes) openEndCase() })
  })

  // Vitals reminder notifications (opt-in; reset on each manual vitals entry)
  const { noteVitals } = useCaseReminders(!caseEnded)
  noteVitalsRef.current = noteVitals

  // Monitoring advanced section
  const [advMonOpen, setAdvMonOpen] = useState(false)
  useEffect(() => {
    if (clinicalPreferencesReady && defaultMonitoring === "advanced") {
      setAdvMonOpen(true)
    }
  }, [clinicalPreferencesReady, defaultMonitoring])
  const { autoFillVitals, autoFillBP, autoFillBg } = useIntraopAutofillPreferences()

  // Carry vitals forward as the timetable advances, when enabled in Settings.
  useIntraopAutofillVitals(caseLoaded, autoFillVitals, autoFillBP, autoFillBg, log, logRef, startRef, save, { endedAtRef, onEndCase: openEndCase })

  const {
    awTools,
    setAwTools,
    awDevices,
    setAwDevices,
    awLmaSize,
    setAwLmaSize,
    awOralTubeSize,
    setAwOralTubeSize,
    awOralCuffed,
    setAwOralCuffed,
    awNasalTubeSize,
    setAwNasalTubeSize,
    awNasalCuffed,
    setAwNasalCuffed,
    awDltType,
    setAwDltType,
    awDltSide,
    setAwDltSide,
    awDltSize,
    setAwDltSize,
    awEbSize,
    setAwEbSize,
    awExpandedDevice,
    setAwExpandedDevice,
    awExpandedWasComplete,
    awClGrade,
    setAwClGrade,
    awVentModes,
    setAwVentModes,
    awVentExpanded,
    setAwVentExpanded,
    awNotes,
    setAwNotes,
    awPresentsIntubated,
    setAwPresentsIntubated,
    awNotApplicable,
    setAwNotApplicable,
    saveAirwaySection,
  } = useIntraopAirwaySection(caseLoaded, patchIntraopSection, tc("errorLabel"))
  // 10.2.0: Jet ticked among the ventilation modes puts a Jet button in each column's sheet.
  useEffect(() => { jetSheet.setEnabled(awVentModes.includes("Jet")) }, [awVentModes])
  // 10.2.0: the airway list -- the embedded picker, E6 and the card's Reintubate?
  const text = (value: unknown) => (value == null || value === "" ? null : String(value))
  const num = (value: unknown) => (typeof value === "number" ? value : value == null || value === "" ? null : Number(value))
  const airwayExchange = usePhoneAirwayExchange({
    log, active: caseLoaded && !isWatching, smart: airwayScreen === "smart",
    legacy: () => ({ airwayDevices: awDevices, lmaSize: awLmaSize, oralTubeSize: awOralTubeSize, oralCuffed: awOralCuffed, nasalTubeSize: awNasalTubeSize,
      nasalCuffed: awNasalCuffed, dltType: awDltType, dltSide: awDltSide, dltSize: awDltSize, endobronchialSize: awEbSize }),
    persist: (entries, fields) => {
      setAwDevices(Array.isArray(fields.airwayDevices) ? fields.airwayDevices as string[] : [])
      setAwLmaSize(text(fields.lmaSize)); setAwOralTubeSize(text(fields.oralTubeSize)); setAwOralCuffed(fields.oralCuffed as boolean | null)
      setAwNasalTubeSize(text(fields.nasalTubeSize)); setAwNasalCuffed(fields.nasalCuffed as boolean | null)
      setAwDltType(fields.dltType as never); setAwDltSide(fields.dltSide as never); setAwDltSize(num(fields.dltSize)); setAwEbSize(num(fields.endobronchialSize))
      // The tools used for any device also fill the case-level tools, for every reader that knows only that.
      const tools = airwayToolsFromEntries(entries)
      if (tools.length > 0) setAwTools(prev => [...new Set([...prev, ...tools])])
      void patchIntraopSection({ airwayDeviceEntries: entries, ...(tools.length > 0 ? { airwayTools: [...new Set([...awTools, ...tools])] } : {}) })
    },
  })
  // Smart selection (10.2.0): the Airway tab that opens on what is in place. What it offers and how
  // it saves is Core's (airway-smart); this hands it the case and writes the result.
  const airwayLabel = (code: string) => [...AIRWAY_DEVICES, ...AIRWAY_TOOLS].find(option => option.code === code)?.label ?? code
  const smartCase = {
    patient: { clinicalMode: clinicalMode as "ADULT" | "PEDIATRIC", ageYears: preop?.age ?? null, age: preop?.ageValue != null && preop.ageUnit ? { value: preop.ageValue, unit: preop.ageUnit } : null,
      weightKg: preop?.weight ?? null, heightCm: preop?.height ?? null, sex: preop?.sex ?? null },
    techniques, startedAt: startRef.current?.toISOString() ?? null, now: () => new Date().toISOString(), timeZone: resolvedTimeZone(),
    difficultAirway: preop?.mallampati === "III" || preop?.mallampati === "IV", deviceLabel: airwayLabel, toolLabel: airwayLabel,
  }
  const smartClock = (iso: string) => attention?.clockOf?.(iso) ?? iso.slice(11, 16)
  const airwaySmart = airwayScreen === "smart" && !isWatching ? (
    <AirwaySmart {...smartCase} entries={airwayExchange.entries()} onChange={airwayExchange.save}
      describe={entry => airwayDeviceSummary(entry.device, entry.details, { device: airwayLabel, attribute: code => code }) ?? airwayLabel(entry.device)}
      timeOf={smartClock} />
  ) : undefined

  // Vascular access tab
  const [vascularAccesses, setVascularAccesses] = useState<VascularEntry[]>([])
  // Smart selection for vascular access (10.2.0): the Vascular access tab that opens on what is in place.
  // What it offers and how it saves is Core's (vascular-smart); this hands it the case and writes the result.
  const vascularLines = () => vascularAccesses as unknown as VascularLine[]
  const applyVascularLines = (next: VascularLine[]) => {
    const entries = next as unknown as typeof vascularAccesses
    setVascularAccesses(entries)
    void saveVascularAccesses(entries)
  }
  const vascularEvents = usePhoneVascularEvents({ log, active: caseLoaded && !isWatching && vascularScreen === "smart", lines: vascularLines })
  const vascularCase = {
    patient: { clinicalMode: clinicalMode as "ADULT" | "PEDIATRIC", ageYears: preop?.age ?? null },
    startedAt: startRef.current?.toISOString() ?? null, now: () => new Date().toISOString(), timeZone: resolvedTimeZone(),
    siteLabel: (code: string) => displayClinicalCode("option:VASCULAR_ACCESS", code, language),
  }
  const vascularSmart = vascularScreen === "smart" && !isWatching ? (
    <VascularSmart {...vascularCase} lines={vascularLines()} onChange={applyVascularLines} techniques={techniques} timeOf={smartClock} />
  ) : undefined

  // Smart selection for monitoring (10.2.0): standard in one switch, and the monitors this case calls for.
  // What is suggested and when a reading is due is Core's (monitoring-smart); a monitor added writes the same flag.
  const [hiddenMonitors, setHiddenMonitors] = useState<string[]>([])
  const monitoringSuggestionList = monitoringSuggestions({
    monitoring, techniques, airway: airwayExchange.entries(), lines: vascularLines(), hidden: hiddenMonitors,
    relaxantAt: log.find(event => event.type === "drug" && !!event.name && isRelaxant(event.name))?.ts ?? null,
    startedAt: startRef.current?.toISOString() ?? null, now: new Date(),
    settings: suggestionContext?.settings ?? null, user: suggestionContext?.user ?? null,
  })
  const lastMonitorReading = (field: string) => {
    const key = ({ bisValue: "bis", tofRatio: "tofRatio", cvpMmHg: "cvp", etco2: "etco2", temp: "temp" } as const)[(MONITORING_READINGS[field]?.vital ?? "temp") as "bisValue" | "tofRatio" | "cvpMmHg" | "etco2" | "temp"]
    const event = [...log].reverse().find(item => item.type === "vital" && typeof item[key] === "number")
    return event ? { text: String(event[key]), at: event.ts } : null
  }
  const applyMonitoring = (next: string[]) => { setMonitoring(next); saveMonitoring(next) }
  const monitoringSmart = monitoringScreen === "smart" && !isWatching ? (
    <MonitoringSmart monitoring={monitoring} onChange={applyMonitoring} monitoringOpts={MONITORING_OPTS} suggestions={monitoringSuggestionList}
      onHide={field => setHiddenMonitors(list => [...list, field])} lastReading={lastMonitorReading} onReading={() => openVitals("full")} now={() => new Date().toISOString()} />
  ) : undefined

  // Smart selection for equipment (10.2.0): the calculator list as a set-up checklist. The tube and LMA go
  // to the Airway record when marked in use; the catheter and NGT set their case flag (what each item does is Core's).
  const equipmentSmart = equipmentScreen === "smart" && !isWatching ? {
    flags: { urinaryCatheter: monitoring.includes("urinaryCatheter"), stomachTube: monitoring.includes("stomachTube") },
    airwayInUse: airwayExchange.entries().filter(entry => entry.status === "in_use").map(entry => entry.device),
    onFlag: (field: "urinaryCatheter" | "stomachTube") => applyMonitoring(toggleEquipmentFlag(monitoring, field)),
    onUseAirway: (device: "ORAL_ETT" | "LMA") => {
      const entries = airwayExchange.entries()
      airwayExchange.save(addAirwayDevice(entries, {
        id: `airway-${Date.now()}-${entries.length + 1}`, device, details: suggestedAirwayDetails(device, smartCase.patient),
        insertedAt: resolveAirwayTime(entries.length === 0 ? "start" : "now", { startedAt: smartCase.startedAt, now: smartCase.now() }),
      }))
    },
  } : undefined

  // Smart selection for technique (10.2.0): search, the preop plan, the usual ones and the side of a block. The saved
  // data is the list of technique codes with the side beside it; finding and sides are Core's (technique-smart).
  const recentTechniques = useRecentTechniques()
  const applyTechniques = (next: string[], sides: Record<string, TechniqueSide>, added: string[]) => {
    setTechniques(next)
    setTechniqueSides(sides)
    recentTechniques.remember(added)
    void saveTechniques(next, sides)
  }
  const techniqueSmart = techniqueScreen === "smart" && !isWatching ? (
    <TechniqueSmart techniques={techniques} sides={techniqueSides} onChange={applyTechniques} tree={TECHNIQUE_TREE} label={techniqueLabel} color={techniqueColor}
      planned={preop?.plannedTechniques ?? []} recents={recentTechniques.recents} />
  ) : undefined

  // Technique tree navigation
  const [techPath,      setTechPath]      = useState<string[]>([])
  const [otherTechText, setOtherTechText] = useState("")

  const {
    vitOpen, setVitOpen, vitMode, vitScanBusy, editingVitalId, setEditingVitalId,
    vSys, setVSys, vDia, setVDia, vHR, setVHR, vSpO2, setVSpO2, vEtco2, setVEtco2, vTemp, setVTemp,
    vBis, setVBis, vTof, setVTof, vCvp, setVCvp, vIbp, setIbp,
    vitalFeedback, openVitals, confirmVitals, scanVitalsFromCamera, setAndAdvance,
  } = useVitalsEntry(save, syncLog, setEntryTs, entryTs, log, logRef, setLog, startRef, setTimetable, projectTimetable, roundDown5Min, id, tc("errorLabel"), etco2Unit, temperatureUnit, cvpUnit)

  useIntraopCaseLoader({
    caseId: id, onEndedLoaded: restoreEndedCase,
    monitoringOptions: MONITORING_OPTS,
    complicationItems: COMPLICATION_ITEMS,
    errorLabel: tc("errorLabel"),
    enqueueEventSave,
    runBatched,
    pendingSaveCountRef,
    legacyWebLogNeedsSyncRef,
    baseIntraopUpdatedAtRef,
    startRef,
    setCaseInfo,
    setTechniques,
    setPositions,
    setMonitoring,
    setPreop,
    setCaseMonthYear,
    setCaseStartTime,
    setCaseEndTime,
    setCaseEndNextDay,
    setCaseTimezone,
    setAwTools,
    setAwDevices,
    onIntraopRecord: record => {
      airwayExchange.hydrate(record)
      setTechniqueSides(parseTechniqueSides(record.techniqueSides))
    },
    setAwLmaSize,
    setAwOralTubeSize,
    setAwOralCuffed,
    setAwNasalTubeSize,
    setAwNasalCuffed,
    setAwDltType,
    setAwDltSide,
    setAwDltSize,
    setAwEbSize,
    setAwClGrade,
    setAwVentModes,
    setAwVentExpanded,
    setAwNotes,
    setAwPresentsIntubated,
    setAwNotApplicable,
    setAdvMonOpen,
    setVascularAccesses,
    setPremedEveningText,
    setPremedMorningText,
    setSelectedComplications,
    setComplicationsNotes,
    hydrateFluidStatus,
    hydrateLabs,
    setPendingCount,
    setSyncState,
    setSyncErrorMessage,
    setLog,
    setElapsedMs,
    applyActiveState,
    endedAtRef,
    setTimetable,
    setTtColCount,
    setCaseLoaded,
  })
  useIntraopRuntimeEffects({
    log,
    logRef,
    startRef, endedAtRef,
    setElapsedMs,
    setTimetable,
    projectTimetable,
    resyncActiveRef,
  })
  // ── Computed ──────────────────────────────────────────────────────────

  const {
    lastVitals,
    timeStr,
    prevVitalFor,
    isGACase,
    vitalVisibility,
  } = useIntraopClinicalViewState(log, techniques, caseInfo, monitoring)
  const {
    chartStart,
    currentCol,
    nowSlotPercent,
    eventRows,
    chartRows,
    jumpVerticalTimetableToNow,
    tabSwipeResponder,
    tabMotion,
  } = useIntraopTimetableViewport({
    log,
    timetable,
    startRef, endedAtRef,
    verticalTimetableRef,
    tab,
    setTab: selectTab,
    expandedRow,
    tabLayouts,
    tabRailRef,
    screenWidth,
  })

  const {
    editOpen,
    setEditOpen,
    editEv,
    editDose,
    setEditDose,
    editTime,
    setEditTime,
    eventActions,
    confirmEdit,
    promptDelete,
    openRowQuickAdd,
    openSlotEvent,
  } = useIntraopEventActions({
    log,
    save,
    syncLog,
    removeEvent: deleteEvent, // a clinician's delete offers Undo (9.14.2)
    eventLabel,
    cancelLabel: tc("cancelLabel"),
    chartStart,
    openVitals,
    openDrug,
    openInfusion,
    openFluid,
    openAgent,
    openGasSettings,
    openLabs,
    setSlotTs,
    slotTs,
    setSlotOpen,
  })
  const handleChartTimetableChange = (newData: TimetableData) => applyIntraopChartChange({ start: startRef.current, timetable, next: newData, onFluidStart: fluid => setActiveFluids(prev => [...prev, fluid]), save, onChange: setTimetable })
  // ─────────────────────────────── RENDER ───────────────────────────────
  return (
    <>
      <View style={{ flex:1, backgroundColor: colors.background }}>
        <IntraopScreenChrome
          caseId={id}
          status={caseInfo?.status}
          finalizedAt={caseInfo?.finalizedAt}
          isWatching={isWatching}
          onTakeover={takeover}
          monitor={{
            techniquesLabel: caseInfo?.techniques?.map(techniqueLabel).join(" · ") ?? tc("anaesthesiaLabel"),
            procedure: (caseInfo?.procedureUndetermined ? plannedProcedureLabel({ procedureUndetermined: true }, language) : null) ?? caseInfo?.procedure ?? "–",
            diagnosis: caseInfo?.diagnosis,
            theatre: caseInfo?.theatre,
            timeStr,
            started: !!startRef.current,
            elapsedMs,
            onStartNow: startCaseNow,
            onStartAt: () => openStartAt(formatHHMM(new Date())),
            syncStatusStore,
            onRetrySync: retryPendingEvents,
            lastVitals,
          }}
          ended={caseEnded ? { tc, resumeSecsLeft, unlimited: resumeUnlimited, onResume: resumeCase } : undefined}
          tabBar={{ tab, onSelect: selectTab, tc, screenWidth, railRef: tabRailRef, layouts: tabLayouts }}
        >
        <IntraopRenderSurface {...{
          screenWidth, tabSwipeResponder, tabMotion, tab, undoEv, chartRows, chartStart, currentCol, attention,
          expandedRow, nowSlotPercent, timetable, eventRows, activeInfusions, activeFluids,
          activeAgent, activeAgents, activeGas, startRef, isWatching, verticalTimetableRef, undoLastEvent,
          setUndoEv, removalUndo, setExpandedRow, eventLabel, setInfActTgt, setInfActRate, setInfActTs,
          openFluidEnd, openGasSettings, tc, stopAgent, openRowQuickAdd, jumpVerticalTimetableToNow,
          openEndCase, openChartView, preop, labResults, openLabs,
          pediatricDrugProfiles: PEDIATRIC_DRUG_PROFILES,
          pediatricDoseProfiles: prospectiveGuidanceEnabled ? clinicalRulesSnapshot?.doseProfiles ?? [] : [],
          prospectiveGuidanceEnabled,
          pediatricRulesSource: clinicalRulesSnapshot?.source ?? null,
          pediatricRulesCachedAt: clinicalRulesSnapshot?.cachedAt ?? null,
          pediatricRulesLoading: clinicalRulesLoading,
          pediatricRulesError: clinicalRulesError, techPath, setTechPath, TECHNIQUE_TREE, techniques, setTechniques,
          saveTechniques, techniqueLabel, otherTechText, setOtherTechText, caseMonthYear,
          setCaseMonthYear, caseStartTime, setCaseStartTime, caseEndTime, setCaseEndTime,
          caseEndNextDay, setCaseEndNextDay, timingSaving, saveTiming, endedAtRef, caseTimezone, positions, setPositions,
          savePositions, fieldSaving, POSITIONS_LIST, monitoring, setMonitoring, saveMonitoring,
          MONITORING_OPTS, advMonOpen, setAdvMonOpen, awTools, setAwTools, awClGrade,
          setAwClGrade, awDevices, setAwDevices, awLmaSize, setAwLmaSize, awOralTubeSize,
          setAwOralTubeSize, awOralCuffed, setAwOralCuffed, awNasalTubeSize, setAwNasalTubeSize,
          awNasalCuffed, setAwNasalCuffed, awDltType, setAwDltType, awDltSide, setAwDltSide,
          awDltSize, setAwDltSize, awEbSize, setAwEbSize, awVentModes, setAwVentModes,
          awNotes, setAwNotes, awPresentsIntubated, setAwPresentsIntubated,
          awNotApplicable, setAwNotApplicable, saveAirwaySection, awExpandedDevice, setAwExpandedDevice,
          awExpandedWasComplete, AIRWAY_TOOLS, AIRWAY_DEVICES, airwaySmart, awVentExpanded, setAwVentExpanded,
          vascularAccesses, setVascularAccesses, saveVascularAccesses, vascularSaving, vascularSmart, monitoringSmart, equipmentSmart, techniqueSmart,
          vascSiteColor, VASC_TREE, vascDefaultUnit, VASC_PREEXISTING_QUICK, premedEveningText,
          setPremedEveningText, premedMorningText, setPremedMorningText, savePremedication,
          openPremedPicker, log, selectedComplications, complicationsNotes, setComplicationsNotes,
          saveComplications, removeLegacyComplication, eventActions, promptDelete, prevVitalFor, ttColCount,
          caseIbw, caseTbw, caseBsa, infusionWeightBasis: INFUSION_WEIGHT_BASIS,
          urineMl, setUrineMl, bloodLossMl, setBloodLossMl,
          chartPage, caseEnded, resumeSecsLeft, resumeCase, setChartPage, setTtColCount,
          handleChartTimetableChange, setEntryTs, slotOpen, slotTs, timeStr, slotEventSearch,
          slotCompExpanded, CLINICAL_EVENT_CATS, isGACase, setSlotOpen,
          setSlotEventSearch, setSlotCompExpanded, openSlotEvent, openDrug, openAgent,
          stopGasSettings, gasOpen, gasFgf, setGasOpen, setGasFgf, gasCarrierGas,
          setGasCarrierGas, gasFio2, setGasFio2, confirmGasSettings, drugOpen, setDrugOpen,
          DRUG_CATS, SEARCH_ONLY_DRUGS, favouriteDrugs, BOLUS_SCENARIOS, drugCat, setDrugCat, drugPick,
          setDrugPick, drugDose, setDrugDose, DRUG_QUICK_DOSES, DRUG_RANGES, INF_DRUGS,
          confirmDrug, startDrugAsInfusion, DRUG_ROUTES, drugRoute, setDrugRoute,
          DRUG_LA_CONCENTRATIONS, drugConcentration, setDrugConcentration,
          drugCustomConcentration, setDrugCustomConcentration, drugFormulation, setDrugFormulation,
          drugRule, applyDrugSelection, DRUG_BASE_PROFILES,
          DRUG_ROUTE_PROFILES, DRUG_DOSE_CALCS, vitOpen, vitMode, editingVitalId, vitScanBusy,
          vitalVisibility, etco2Unit, temperatureUnit, cvpUnit, vSysRef, vDiaRef, vHRRef, vSpO2Ref,
          vEtco2Ref, vTempRef, vBisRef, vTofRef, vCvpRef,
          vSys, vDia, vHR, vSpO2, vEtco2, vTemp, vBis, vTof, vCvp, vIbp, setIbp, vitalFeedback,
          setVBis, setVTof, setVCvp, confirmVitals,
          setVitOpen, setEditingVitalId, scanVitalsFromCamera, setAndAdvance, setVSys, setVDia,
          setVHR, setVSpO2, setVEtco2, setVTemp, infOpen, setInfOpen,
          setInfDrug, setInfRate, setInfRoute, setInfConcentration,
          setInfCustomConcentration, setInfFormulation, setInfRule, SEARCH_ONLY_INFUSIONS, INFUSION_SCENARIOS,
          INFUSION_QUICK_RATES, INFUSION_ROUTES, INFUSION_LA_CONCENTRATIONS, INFUSION_RANGES,
          INFUSION_SUGGESTED_RATES, INFUSION_BASE_PROFILES, INFUSION_ROUTE_PROFILES,
          favouriteInfusions, infDrug, infRate, confirmInfusion, infRoute, infConcentration,
          infCustomConcentration, infFormulation, infRule,
          infActOpen, setInfActOpen, infActTgt, infActRate, changeRate, stopInfusion, infActTs,
          infActConcentration, setInfActConcentration, flOpen, setFlOpen, setFlFluid, setFlVol,
          flEntryMode, setFlEntryMode, flRate, setFlRate, resetFluidDraft,
          setFlConcentration, flRoute, setFlRoute, setFlRule,
          pediatricFluidProfiles: PEDIATRIC_FLUID_PROFILES,
          pediatricInfusionProfiles: PEDIATRIC_INFUSION_PROFILES,
          FLUID_LIST, flFluid, flVol, confirmFluid, FLUID_QUICK_VOLUMES,
          FLUID_CONCENTRATIONS, FLUID_DEFAULT_CONCENTRATIONS, FLUID_ROUTES, flConcentration, flEndOpen,
          setFlEndOpen, flEndTarget, flEndCustom, setFlEndCustom, flEndRate, setFlEndRate,
          changeFluidRate, confirmFluidEnd, agOpen,
          setAgOpen, setAgPick, setAgPercent, VOLATILE_AGENTS, agPick, confirmAgent,
          AGENT_QUICK_PERCENTS, agPercent, editOpen, editEv, editDose, editTime, setEditOpen,
          setEditDose, setEditTime, confirmEdit,
          startAtOpen, startAtInput, setStartAtOpen, setStartAtInput,
          startAtDay, startCaseAt, endCaseOpen, setEndCaseOpen, endCaseRunningItems, afterEndItems, resolveAfterEnd, setChosenEndTs, endCaseDecisions,
          setEndCaseDecisions, finaliseCase, premedPickOpen, premedPickPhase, PREMED_LIBRARY,
          premedPickCat, premedPickDrug, premedPickDose, premedPickRoute, setPremedPickOpen,
          setPremedPickCat, setPremedPickDrug, setPremedPickDose, setPremedPickRoute,
          addSelectedPremedication, continuedPostopItems, router, id,
        }} />
        </IntraopScreenChrome>
      </View>
      {/* Rendered here rather than threaded through IntraopRenderSurface: the
          sheet needs only the draw list and the case id, and passing it through
          that props object would add six more names to a list that is already
          the reason this screen is hard to read. */}
      <DefibrillationHost log={log} save={save} preop={preop} />
      {!isWatching ? <JetHost log={log} save={save} clockOf={attention?.clockOf ?? (iso => iso.slice(11, 16))} /> : null}
      {!isWatching ? <TourniquetHost log={log} save={save} sex={preop?.sex} clockOf={attention?.clockOf ?? (iso => iso.slice(11, 16))}
        ageDays={preopAgeDays(preop ? { ageValue: preop.ageValue, ageUnit: preop.ageUnit, ageYears: preop.age, ageApproxDays: preop.ageApproxDays } : null)} /> : null}
      {vascularEvents.request && !isWatching ? (
        <Sheet visible onClose={() => vascularEvents.setRequest(null)} title={tc(vascularEvents.request.type === "PERIPHERAL" ? "vsmPeripheral" : vascularEvents.request.type === "ARTERIAL" ? "vsmArterial" : "vsmCentral")} full allowInline={false}>
          <VascularSmartPanel {...vascularCase} request={vascularEvents.request} lines={vascularLines()}
            onSave={next => { vascularEvents.setRequest(null); applyVascularLines(next) }} onClose={() => vascularEvents.setRequest(null)} />
        </Sheet>
      ) : null}
      {airwayExchange.smartOpen && !isWatching ? (
        <Sheet visible onClose={() => airwayExchange.setSmartOpen(null)} title={airwayLabel(airwayExchange.smartOpen.device)} full allowInline={false}>
          <AirwaySmartPanel {...smartCase} request={{ device: airwayExchange.smartOpen.device, at: airwayExchange.smartOpen.at, source: "timeline" }} entries={airwayExchange.entries()}
            onSave={next => { airwayExchange.setSmartOpen(null); airwayExchange.save(next) }} onClose={() => airwayExchange.setSmartOpen(null)} />
        </Sheet>
      ) : null}
      {airwayExchange.dialog && !isWatching ? (
        <AirwayExchangeSheet entries={airwayExchange.entries()} devices={AIRWAY_DEVICES} reason={airwayExchange.dialog.reason} at={airwayExchange.dialog.at}
          onClose={() => airwayExchange.setDialog(null)}
          onSave={next => {
            const complication = airwayExchange.dialog?.complication
            const at = airwayExchange.dialog?.at ?? new Date().toISOString()
            airwayExchange.save(next)
            if (complication && attention) void attention.applyOps(cardEventOps(complication as never, "Reintubation", "reintubate", at, new Date().toISOString()))
          }} />
      ) : null}
      {attention && !isWatching ? (
        <SuggestionSheetHost attention={attention} sheets={buildPhoneSuggestionSheets({
          pending: pendingSuggestion,
          nowIso: () => new Date().toISOString(),
          clockOf: attention.clockOf,
          setEntryTs, drugCats: DRUG_CATS, openDrugPreset,
          infusions: INF_DRUGS, setInfDrug: setInfDrug as never, setInfRate, setInfOpen,
          fluids: FLUID_LIST, log, openFluid, setFlFluid: setFlFluid as never, setFlVol, setFlEntryMode, setFlRate,
          openShock: () => defibrillationSheet.open(new Date().toISOString()),
          openLab: () => openLabs(new Date().toISOString()),
          openGas: (fio2, fgf, air) => openGasSettings(undefined, { fgf, carrierGas: air ? "air" : activeGas?.carrierGas ?? null, fio2 } as never, activeGas ? "change" : "start"),
          deepenTargets: () => [
            ...activeAgents.map(agent => ({ key: `agent-${agent.name}`, label: eventLabel({ id: "a", ts: "", type: "agent_start", name: agent.name } as LogEvent).text || agent.name, open: () => openAgent() })),
            ...activeInfusions.filter(inf => ["Propofol", "Remifentanil", "Sufentanil", "Dexmedetomidine"].includes(inf.name)).map(inf => ({
              key: `inf-${inf.infId}`, label: inf.name, open: () => { setInfActTgt(inf); setInfActRate(String(inf.rate ?? "")); setInfActOpen(true) },
            })),
          ],
          saveEvent: event => { void save(event as never) },
          extras: {
            openAirway: complication => airwayExchange.setDialog({ reason: "reintubation", at: new Date().toISOString(), complication }),
            linesOf: kind => vascularAccesses.map((line, index) => ({ line: line as unknown as VascularLine, index }))
              .filter(({ line }) => accessKindOf(line.site) === kind)
              .map(({ line, index }) => ({ id: String(index), label: vascularLineText(line, { failed: "", time: () => "" }), failed: line.failed === true })),
            markLineFailed: (lineId, at) => {
              const next = replaceFailedLine(vascularAccesses as unknown as VascularLine[], Number(lineId), at) as unknown as typeof vascularAccesses
              setVascularAccesses(next)
              void saveVascularAccesses(next)
            },
          },
          displayName: event => eventLabel(event).text || event.name || "",
        })} />
      ) : null}
      {labsTs ? (
        <LabsSheet
          visible={labsOpen}
          takenAt={labsTs}
          value={labResults}
          title={`${tc("trRowLabs")} · ${formatHHMM(new Date(labsTs))}`}
          onClose={() => setLabsOpen(false)}
          onChange={next => { void saveLabs(next) }}
          onEnsureCase={async () => id ?? null}
        />
      ) : null}
    </>
  )
}
