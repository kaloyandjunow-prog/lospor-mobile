/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IntraopSheetsHostProps } from "@/components/intraop/IntraopSheetsHost"
import { buildIntraopMedicationSheetProps } from "@/components/intraop/buildIntraopMedicationSheetProps"
import { formatDateHHMM } from "@/lib/intraop-projection"
import { slotIsoTimestamp } from "@/lib/intraop-row-quick-add"
import { buildPostopRoute } from "@/lib/postop-route"

export function buildIntraopSheetsProps(props: any): IntraopSheetsHostProps {
  const {
    activeAgent, activeGas, slotOpen, slotTs, timeStr, slotEventSearch, slotCompExpanded,
    CLINICAL_EVENT_CATS, COMPLICATION_GROUPS, COMPLICATION_ITEMS, isGACase, setSlotOpen, setSlotEventSearch,
    setSlotCompExpanded, openSlotEvent, openDrug, openAgent, stopAgent, stopGasSettings,
    openGasSettings,
    editOpen, editEv, editDose, editTime, setEditOpen, setEditDose, setEditTime, confirmEdit,
    compOpen, setCompOpen, COMPLICATION_TC_TITLES, selectedComplications, compGroupExpanded,
    compSaving, toggleComplicationGroup, toggleComplication, setSelectedComplications,
    saveComplications, startAtOpen, startAtInput, setStartAtOpen, setStartAtInput, startCaseAt,
    endCaseOpen, setEndCaseOpen, endCaseRunningItems, endCaseDecisions, setEndCaseDecisions,
    finaliseCase, premedPickOpen, premedPickPhase, PREMED_LIBRARY, premedPickCat,
    premedPickDrug, premedPickDose, premedPickRoute, setPremedPickOpen, setPremedPickCat,
    setPremedPickDrug, setPremedPickDose, setPremedPickRoute, addSelectedPremedication,
    caseEnded, continuedPostopItems, tc, router, id,
  } = props

  return {
    slot: {
      visible: slotOpen,
      title: `${slotTs ? formatDateHHMM(slotTs) : timeStr}`,
      eventSearch: slotEventSearch,
      complicationExpanded: slotCompExpanded,
      eventCategories: CLINICAL_EVENT_CATS,
      extraComplicationLabels: COMPLICATION_ITEMS,
      isGACase,
      activeAgent,
      activeGas,
      onClose: () => { setSlotOpen(false); setSlotEventSearch(""); setSlotCompExpanded(false) },
      onEventSearchChange: setSlotEventSearch,
      onToggleComplications: () => setSlotCompExpanded((v: any) => !v),
      onSelectEvent: openSlotEvent,
      onBrowseDrugs: () => { const ts = slotIsoTimestamp(slotTs); setSlotOpen(false); openDrug(ts) },
      onStopAgent: () => { setSlotOpen(false); stopAgent() },
      onOpenAgent: () => { const ts = slotIsoTimestamp(slotTs); setSlotOpen(false); openAgent(ts) },
      onStopGas: () => { setSlotOpen(false); stopGasSettings() },
      onOpenGas: () => { const ts = slotIsoTimestamp(slotTs); setSlotOpen(false); openGasSettings(ts) },
    },
    ...buildIntraopMedicationSheetProps(props),
    editEvent: {
      visible: editOpen,
      event: editEv,
      dose: editDose,
      time: editTime,
      onClose: () => setEditOpen(false),
      onDoseChange: setEditDose,
      onTimeChange: setEditTime,
      onConfirm: confirmEdit,
    },
    complications: {
      visible: compOpen,
      onClose: () => setCompOpen(false),
      groups: COMPLICATION_GROUPS,
      titleForGroup: group => COMPLICATION_TC_TITLES[group.id] ? tc(COMPLICATION_TC_TITLES[group.id]) : group.title,
      selected: selectedComplications,
      expanded: compGroupExpanded,
      saving: compSaving,
      onToggleGroup: toggleComplicationGroup,
      onToggleItem: toggleComplication,
      onClear: () => setSelectedComplications([]),
      onSave: saveComplications,
    },
    startAt: {
      visible: startAtOpen,
      value: startAtInput,
      onClose: () => setStartAtOpen(false),
      onChange: setStartAtInput,
      onStart: startCaseAt,
    },
    endCase: {
      visible: endCaseOpen,
      onClose: () => setEndCaseOpen(false),
      items: endCaseRunningItems,
      decisions: endCaseDecisions,
      continueLabel: tc("continuePostop"),
      onDecision: (key, decision) => setEndCaseDecisions((prev: any) => ({ ...prev, [key]: decision })),
      onFinalize: finaliseCase,
    },
    premedicationLibrary: {
      visible: premedPickOpen,
      phase: premedPickPhase,
      categories: PREMED_LIBRARY,
      openCategory: premedPickCat,
      drug: premedPickDrug,
      dose: premedPickDose,
      route: premedPickRoute,
      backLabel: tc("back"),
      onClose: () => { setPremedPickOpen(false); setPremedPickCat(null); setPremedPickDrug(null) },
      onToggleCategory: category => setPremedPickCat((prev: any) => prev === category ? null : category),
      onSelectDrug: drug => { setPremedPickDrug(drug); setPremedPickDose(String(drug.dose)); setPremedPickRoute(drug.defaultRoute) },
      onBackToLibrary: () => setPremedPickDrug(null),
      onDoseChange: setPremedPickDose,
      onRouteChange: setPremedPickRoute,
      onAdd: addSelectedPremedication,
    },
    postopContinue: caseEnded ? {
      continuedItems: continuedPostopItems,
      continueLabel: tc("continuePostop"),
      onContinue: () => {
        router.replace(buildPostopRoute(id, continuedPostopItems))
      },
    } : undefined,
  }
}
