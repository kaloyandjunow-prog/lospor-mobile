import { useEffect, useMemo, useState } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import { FeedbackPressable } from "@/components/intraop/FeedbackPressable"
import { usePreferences } from "@/lib/preferences-context"
import { displayClinicalCode } from "@/lib/clinical-display"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import type { ScenarioGroup } from "@lospor/core"
import { calcSuggestedDose as calcDose } from "@/lib/dose-calc"
import {
  canonicalDoseUnit,
  normalizeAdministrationRoute,
} from "@lospor/core/clinical-rule-vocabulary"
import type { PediatricAgeInput } from "@lospor/core/pediatric"
import type { PediatricDoseProfile } from "@lospor/core/pediatric-dose"
import {
  applicablePediatricDrugProfiles,
  selectApplicablePediatricDrugProfile,
  resolvePediatricDrugProfileSurface,
  type PediatricDrugProfileRule,
} from "@lospor/core/clinical-rules"
import type { DrugFormulation } from "@/lib/intraop-log-event"
import type {
  DrugEntryDraft,
  DrugRuleSelection,
} from "@/lib/use-drug-entry"
import { applicablePediatricDoseProfiles, resolvePediatricProfileDose } from "@/lib/pediatric-dose-ui"
import { resolveDrugSheetPediatric } from "@/lib/drug-sheet-pediatric"
import { PediatricDoseNotice } from "@/components/intraop/PediatricDoseNotice"
import type { SearchOnlyMedicationOption } from "@/lib/hidden-clinical-options"
import {
  DrugPickerMenu,
  type DrugPickerCategory,
  type DrugPickerMode,
  type DrugPickerOption,
  type DrugPickerSearchResult,
} from "@/components/intraop/DrugPickerMenu"
import { fallbackRange, type DoseCalc, type DoseSurface, type Range } from "@/components/intraop/drug-sheet-types"

type DrugOption = DrugPickerOption
type DrugCat = DrugPickerCategory
export function DrugSheet({
  visible, onClose, drugCats, searchOnlyDrugs = [], favouriteNames, scenarios, drugCat, setDrugCat, drugPick, setDrugPick,
  drugDose, setDrugDose, dosePresets, canStartAsInfusion, onConfirm, onStartAsInfusion,
  routes = {}, drugRoute, setDrugRoute, laConcentrations = {}, drugConcentration, setDrugConcentration,
  drugCustomConcentration, setDrugCustomConcentration, drugFormulation, setDrugFormulation,
  drugRule, applyDrugSelection,
  ranges = {}, baseProfiles = {}, routeProfiles = {},
  doseCalcs, patientWeightKg, patientHeightCm, patientSex, pediatricMode = false,
  pediatricDrugProfiles = [], pediatricDoseProfiles = [], patientAge,
  pediatricRulesSource, pediatricRulesCachedAt, pediatricRulesLoading, pediatricRulesError,
  prospectiveGuidanceEnabled = true,
}: {
  visible: boolean
  onClose: () => void
  drugCats: DrugCat[]
  searchOnlyDrugs?: readonly SearchOnlyMedicationOption[]
  favouriteNames: string[]
  scenarios: ScenarioGroup[]
  drugCat: DrugCat | null
  setDrugCat: (c: DrugCat | null) => void
  drugPick: DrugOption | null
  setDrugPick: (d: DrugOption | null) => void
  drugDose: string
  setDrugDose: (v: string) => void
  dosePresets: Record<string, number[]>
  canStartAsInfusion: boolean
  onConfirm: () => void
  onStartAsInfusion: () => void
  routes?: Record<string, string[]>
  drugRoute?: string
  setDrugRoute?: (r: string) => void
  laConcentrations?: Record<string, string[]>
  drugConcentration?: string
  setDrugConcentration?: (c: string | undefined) => void
  drugCustomConcentration?: string
  setDrugCustomConcentration?: (value: string | undefined) => void
  drugFormulation?: DrugFormulation
  setDrugFormulation?: (value: DrugFormulation | undefined) => void
  drugRule?: DrugRuleSelection
  applyDrugSelection?: (selection: DrugEntryDraft) => void
  ranges?: Record<string, Range>
  baseProfiles?: Record<string, DoseSurface>
  routeProfiles?: Record<string, Record<string, DoseSurface>>
  doseCalcs?: Record<string, DoseCalc>
  patientWeightKg?: number
  patientHeightCm?: number
  patientSex?: string
  pediatricMode?: boolean
  pediatricDrugProfiles?: readonly PediatricDrugProfileRule[]
  pediatricDoseProfiles?: readonly PediatricDoseProfile[]
  patientAge?: PediatricAgeInput | null
  pediatricRulesSource?: "server" | "cache" | null
  pediatricRulesCachedAt?: string | null
  pediatricRulesLoading?: boolean
  pediatricRulesError?: string | null
  prospectiveGuidanceEnabled?: boolean
}) {
  const { tc, language } = usePreferences()
  const drugLabel = (name: string) => displayClinicalCode("option:INTRAOP_DRUG", name, language, { label: name })
  const groupLabel = (name: string) => displayClinicalCode("optionGroup", name, language, { label: name })
  const scenarioLabel = (group: ScenarioGroup) => displayClinicalCode("scenarioGroup", group.key, language, { label: group.label })
  const [mode, setMode] = useState<DrugPickerMode>("home")

  function calculatedPrefill(name: string, route?: string): string {
    if (pediatricMode) return ""
    return calcDose(doseCalcs?.[name], route, {
      weightKg: patientWeightKg,
      heightCm: patientHeightCm,
      sex: patientSex,
    }).dose
  }
  const [scenario, setScenario] = useState<ScenarioGroup | null>(null)
  const [query, setQuery] = useState("")
  const [searchOnlySelection, setSearchOnlySelection] = useState<SearchOnlyMedicationOption | null>(null)
  // True when the current drug was chosen from a scenario/favourites/browse
  // (selectCanonical sets drugCat only for metadata). Back then returns to that
  // menu instead of dropping into the drug's library category.
  const [pickedViaShortcut, setPickedViaShortcut] = useState(false)

  // Reset internal navigation to the home menu each time the sheet opens, so
  // adding e.g. an Induction drug doesn't leave the next "Add drug" landing on
  // the Induction subcategory. drugPick/drugCat keep render priority, so
  // preset-open flows (openDrugPreset) are unaffected.
  useEffect(() => {
    if (visible) {
      setMode("home")
      setScenario(null)
      setQuery("")
      setPickedViaShortcut(false)
      setSearchOnlySelection(null)
    }
  }, [visible])

  const allDrugs = useMemo(() => drugCats
    .flatMap(cat => cat.drugs.map(drug => ({ ...drug, cat, color: cat.color })))
    .filter(drug => {
      if (!pediatricMode) return true
      const profiles = applicablePediatricDrugProfiles({
        medicationKey: drug.name,
        age: patientAge ?? null,
        weightKg: patientWeightKg,
        profiles: pediatricDrugProfiles,
      })
      return !profiles.some(profile => profile.availability === "HIDDEN")
    }), [drugCats, patientAge, patientWeightKg, pediatricDrugProfiles, pediatricMode])
  const byName = useMemo(() => new Map(allDrugs.map(drug => [drug.name, drug])), [allDrugs])
  const routineScenarios = useMemo(() => scenarios
    .map(group => ({
      ...group,
      items: group.items.filter(item => byName.has(item.canonical)),
    }))
    .filter(group => group.items.length > 0), [byName, scenarios])

  const {
    structuredProfiles: structuredPediatricProfilesForDrug,
    selectedProfile: selectedStructuredPediatricProfile,
    surface: structuredPediatricSurface,
    unresolvedConflict: pediatricConflict,
    legacyProfiles: pediatricProfilesForDrug,
    legacyProfile: selectedPediatricProfile,
    legacyResolution: pediatricResolution,
    amount: pediatricAmount,
  } = resolveDrugSheetPediatric({
    medicationKey: drugPick?.name,
    age: patientAge ?? null,
    weightKg: patientWeightKg,
    heightCm: patientHeightCm,
    sex: patientSex,
    route: drugRoute,
    ruleKey: drugRule?.key,
    drugProfiles: pediatricDrugProfiles,
    doseProfiles: pediatricDoseProfiles,
  })
  function canonicalRoute(route: string | undefined): string | undefined {
    return route ? normalizeAdministrationRoute(route) ?? route : undefined
  }

  function canonicalUnit(unit: string): string {
    return canonicalDoseUnit(unit)?.display ?? unit
  }

  function canonicalRoutes(name: string): string[] {
    return Array.from(new Set((routes[name] ?? []).map(route => canonicalRoute(route) ?? route)))
  }

  function profileForRoute(name: string, route: string | undefined): DoseSurface | undefined {
    const canonical = canonicalRoute(route)
    const routeSurfaces = routeProfiles[name] ?? {}
    if (canonical && routeSurfaces[canonical]) return routeSurfaces[canonical]
    const aliasMatch = canonical
      ? Object.entries(routeSurfaces).find(([candidate]) => canonicalRoute(candidate) === canonical)?.[1]
      : undefined
    return aliasMatch ?? baseProfiles[name]
  }

  function ruleFromProfile(profile: PediatricDoseProfile): DrugRuleSelection {
    return {
      key: profile.key,
      version: profile.version,
      sourceIds: [...profile.sourceIds],
      roundTo: profile.roundTo,
    }
  }

  function ruleFromStructuredProfile(
    profile: PediatricDrugProfileRule,
    route: string,
  ): DrugRuleSelection {
    const routeMode = profile.profile?.routeModes?.[route]
    const doseCalc = routeMode?.doseCalc
      ?? profile.profile?.doseCalcByRoute?.[route]
      ?? profile.profile?.doseCalc
    return {
      key: profile.ruleKey,
      version: profile.ruleVersion,
      sourceIds: [...profile.sourceIds],
      roundTo: doseCalc?.roundTo,
    }
  }

  function replaceSelection(selection: DrugEntryDraft) {
    if (applyDrugSelection) {
      applyDrugSelection(selection)
      return
    }
    setDrugPick(selection.pick)
    setDrugDose(selection.dose)
    setDrugRoute?.(selection.route ?? "")
    setDrugConcentration?.(selection.concentration)
    setDrugCustomConcentration?.(selection.customConcentration)
    setDrugFormulation?.(selection.formulation)
  }

  function pediatricDraft(
    drug: DrugOption,
    route: string | undefined,
    candidates: readonly PediatricDoseProfile[],
  ): DrugEntryDraft {
    const canonical = canonicalRoute(route)
    const matching = candidates.filter(profile => canonicalRoute(profile.route) === canonical)
    const profile = matching.length === 1 ? matching[0] : undefined
    const resolution = profile && patientAge
      ? resolvePediatricProfileDose({
          profile,
          age: patientAge,
          weightKg: patientWeightKg,
          heightCm: patientHeightCm,
        })
      : null
    return {
      pick: { ...drug, unit: canonicalUnit(profile?.doseUnit ?? drug.unit) },
      dose: resolution?.status === "AVAILABLE" ? String(resolution.amount) : "",
      route: canonical,
      rule: profile ? ruleFromProfile(profile) : undefined,
    }
  }

  function structuredPediatricDraft(
    drug: DrugOption,
    route: string | undefined,
    profile: PediatricDrugProfileRule,
  ): DrugEntryDraft {
    if (!patientAge) {
      const fallbackRoute = canonicalRoute(route)
        ?? canonicalRoute(profile.profile?.defaultRoute)
        ?? canonicalRoute(profile.profile?.routes[0])
      return {
        pick: { ...drug, unit: canonicalUnit(profile.profile?.unit ?? profile.manualUnit ?? drug.unit) },
        dose: "",
        route: fallbackRoute,
        rule: fallbackRoute ? ruleFromStructuredProfile(profile, fallbackRoute) : undefined,
      }
    }
    const surface = resolvePediatricDrugProfileSurface({
      rule: profile,
      age: patientAge,
      route,
      weightKg: patientWeightKg,
      heightCm: patientHeightCm,
      sex: patientSex,
    })
    if (!surface) return { pick: drug, dose: "", route: canonicalRoute(route) }
    return {
      pick: { ...drug, unit: canonicalUnit(surface.unit) },
      // Preserve only the calculated prefill. If its basis is unavailable (for
      // example McLaren IBW cannot be resolved), keep the dose manual instead
      // of substituting a configured quick value.
      dose: surface.dose,
      route: surface.route,
      concentration: surface.concentration || undefined,
      formulation: surface.formulation,
      rule: ruleFromStructuredProfile(profile, surface.route),
    }
  }

  function adultDraft(drug: DrugOption, route: string | undefined): DrugEntryDraft {
    const canonical = canonicalRoute(route)
    const profile = profileForRoute(drug.name, canonical)
    const concentrations = profile?.mode === "concentration"
      ? profile.concentrationOptions ?? laConcentrations[drug.name] ?? []
      : []
    const doseSuggestion = calculatedPrefill(drug.name, canonical)
    const routeVolume = canonical ? profile?.suggestedVolumeByRoute?.[canonical] : undefined
    const fallbackDose = routeVolume
      ?? profile?.suggestedVolume
      ?? profile?.quickValues?.[0]
      ?? dosePresets[drug.name]?.[0]
    return {
      pick: { ...drug, unit: canonicalUnit(profile?.unit ?? drug.unit) },
      dose: doseSuggestion || (fallbackDose != null ? String(fallbackDose) : ""),
      route: canonical,
      concentration: concentrations.length
        ? profile?.suggestedConcentration ?? profile?.defaultConcentration ?? concentrations[0]
        : undefined,
      formulation: profile?.defaultFormulation ?? profile?.formulationOptions?.[0],
    }
  }

  const activeRoute = drugPick
    ? structuredPediatricSurface?.route
      ?? canonicalRoute(drugRoute ?? routes[drugPick.name]?.[0])
    : undefined
  const activeProfile = !searchOnlySelection && !pediatricMode && drugPick
    && prospectiveGuidanceEnabled ? profileForRoute(drugPick.name, activeRoute)
    : undefined
  const activeUnit = canonicalUnit(
    searchOnlySelection?.unit
      ?? structuredPediatricSurface?.unit
      ?? selectedPediatricProfile?.doseUnit
      ?? activeProfile?.unit
      ?? drugPick?.unit
      ?? "mg",
  )
  const activeQuickValues = !prospectiveGuidanceEnabled || searchOnlySelection
    ? undefined
    : pediatricMode
      ? structuredPediatricSurface
        ? Array.from(new Set([
            ...(pediatricAmount != null ? [pediatricAmount] : []),
            ...structuredPediatricSurface.quickValues,
          ]))
        : pediatricAmount != null ? [pediatricAmount] : []
      : activeProfile?.quickValues?.length
        ? activeProfile.quickValues
        : drugPick ? dosePresets[drugPick.name] : undefined
  const activeConcentrations = !prospectiveGuidanceEnabled || searchOnlySelection
    ? undefined
    : pediatricMode
    ? structuredPediatricSurface?.concentrationOptions
    : activeProfile?.mode === "concentration"
      ? activeProfile.concentrationOptions ?? laConcentrations[drugPick?.name ?? ""]
      : undefined
  const activeFormulations = !prospectiveGuidanceEnabled || searchOnlySelection
    ? undefined
    : pediatricMode
    ? structuredPediatricSurface?.formulationOptions
    : activeProfile?.formulationOptions
  const activeRoutes = drugPick
    ? searchOnlySelection
      ? searchOnlySelection.routes
      : pediatricMode && structuredPediatricSurface
      ? [...structuredPediatricSurface.routes]
      : pediatricMode && pediatricProfilesForDrug.length
        ? Array.from(new Set(pediatricProfilesForDrug.map(profile => canonicalRoute(profile.route) ?? profile.route)))
      : canonicalRoutes(drugPick.name)
    : []
  const pediatricStep = selectedPediatricProfile?.roundTo ?? (activeUnit === "mcg" ? 1 : 0.1)
  const pediatricMax = Math.max(
    selectedPediatricProfile?.maximumAmount ?? 0,
    pediatricAmount != null ? pediatricAmount * 2 : 0,
    pediatricStep * 10,
  )
  const activeRange = !prospectiveGuidanceEnabled || searchOnlySelection
    ? { min: 0, max: 100_000, step: 0.1 }
    : structuredPediatricSurface
    ? {
        min: structuredPediatricSurface.min,
        max: structuredPediatricSurface.max,
        step: structuredPediatricSurface.step,
      }
    : selectedPediatricProfile
      ? { min: 0, max: pediatricMax, step: pediatricStep }
      : pediatricMode
        ? { min: 0, max: 100_000, step: 0.1 }
      : activeProfile
        ? { min: activeProfile.min, max: activeProfile.max, step: activeProfile.step }
        : drugPick ? (ranges[drugPick.name] ?? fallbackRange(activeUnit)) : fallbackRange("mg")
  function selectDrug(drug: DrugOption) {
    setSearchOnlySelection(null)
    const firstRoute = canonicalRoutes(drug.name)[0]
    if (!prospectiveGuidanceEnabled) {
      replaceSelection({
        pick: drug,
        dose: "",
        route: firstRoute,
      })
      return
    }
    if (pediatricMode) {
      const structured = selectApplicablePediatricDrugProfile({
        medicationKey: drug.name,
        age: patientAge ?? null,
        weightKg: patientWeightKg,
        profiles: pediatricDrugProfiles,
      })
      if (structured.profile) {
        replaceSelection(structuredPediatricDraft(drug, firstRoute, structured.profile))
        return
      }
      if (structured.conflict) {
        // Several bands claim this child. The drug can still be recorded, but
        // by hand: no dose is autofilled and no rule is credited, because
        // neither band was chosen. pediatricDraft with no candidates is that
        // empty draft.
        replaceSelection(pediatricDraft(drug, firstRoute, []))
        return
      }
      const candidates = applicablePediatricDoseProfiles({
        medicationKey: drug.name,
        age: patientAge ?? null,
        profiles: pediatricDoseProfiles,
      })
      const defaultRoute = firstRoute ?? canonicalRoute(candidates[0]?.route)
      replaceSelection(pediatricDraft(drug, defaultRoute, candidates))
      return
    }
    replaceSelection(adultDraft(drug, firstRoute))
  }

  function selectSearchOnly(option: SearchOnlyMedicationOption) {
    const route = canonicalRoute(option.routes[0]) ?? option.routes[0] ?? "IV"
    setPickedViaShortcut(true)
    setSearchOnlySelection(option)
    setDrugCat({
      cat: option.category,
      color: option.color,
      drugs: [{ name: option.name, unit: option.unit }],
    })
    replaceSelection({
      pick: { name: option.name, unit: canonicalUnit(option.unit) },
      dose: "",
      route,
      rule: { ...option.rule, sourceIds: [...option.rule.sourceIds] },
    })
  }

  function selectCanonical(canonical: string) {
    const found = byName.get(canonical)
    if (!found) return
    setPickedViaShortcut(true)
    setDrugCat(found.cat)
    selectDrug({ name: found.name, unit: found.unit })
  }

  function changeRoute(route: string) {
    if (!drugPick) return
    if (searchOnlySelection) {
      replaceSelection({
        pick: drugPick,
        dose: drugDose,
        route: canonicalRoute(route) ?? route,
        rule: drugRule,
      })
      return
    }
    if (!prospectiveGuidanceEnabled) {
      replaceSelection({
        pick: drugPick,
        dose: "",
        route: canonicalRoute(route) ?? route,
      })
      return
    }
    if (pediatricMode && selectedStructuredPediatricProfile) {
      replaceSelection(structuredPediatricDraft(drugPick, route, selectedStructuredPediatricProfile))
      return
    }
    replaceSelection(pediatricMode
      ? pediatricDraft(drugPick, route, pediatricProfilesForDrug)
      : adultDraft(drugPick, route))
  }

  const normalizedQuery = query.trim().toLowerCase()
  const filtered: DrugPickerSearchResult[] = normalizedQuery
    ? [
        ...allDrugs
          .filter(drug => [drug.name, drugLabel(drug.name)]
            .some(value => value.toLowerCase().includes(normalizedQuery)))
          .map(drug => ({ ...drug, searchOnly: null as SearchOnlyMedicationOption | null })),
        ...searchOnlyDrugs
          .filter(drug => [drug.name, drugLabel(drug.name)]
            .some(value => value.toLowerCase().includes(normalizedQuery)))
          .map(drug => ({ ...drug, searchOnly: drug })),
      ]
    : []
  const scenarioItems = scenario?.items
    .map(entry => ({ entry, drug: byName.get(entry.canonical) }))
    .filter((row): row is { entry: { label: string; canonical: string }; drug: NonNullable<ReturnType<typeof byName.get>> } => !!row.drug) ?? []
  const favouriteItems = favouriteNames
    .map(name => byName.get(name))
    .filter((drug): drug is NonNullable<typeof drug> => !!drug)
  // A conflict is stated, not enforced: no dose is autofilled and no rule is
  // credited, but a hand-entered dose can still be confirmed. Disabling confirm
  // instead left a live dose field above a button that could never enable.
  const confirmDisabled = !drugDose
    || (!!activeConcentrations?.length && !drugConcentration)
    || (!!activeFormulations?.length && !drugFormulation)
    || (!searchOnlySelection && pediatricMode && !structuredPediatricSurface && pediatricProfilesForDrug.length > 1 && !selectedPediatricProfile)
  const footer = drugPick ? (
    <FeedbackPressable
      testID="drug-sheet-confirm"
      accessibilityState={{ disabled: confirmDisabled }}
      onPress={onConfirm}
      disabled={confirmDisabled}
      style={{
        backgroundColor: confirmDisabled ? "#1e2d40" : drugCat?.color ?? "#3b82f6",
        borderRadius: 14,
        padding: 18,
        alignItems: "center",
      }}
    >
      <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
        {tc("dsAdd")} {drugLabel(drugPick.name)} {drugDose} {activeUnit}
      </Text>
    </FeedbackPressable>
  ) : undefined

  return (
    <Sheet visible={visible} onClose={onClose}
      title={drugPick ? drugLabel(drugPick.name) : drugCat ? groupLabel(drugCat.cat) : mode === "browse" ? tc("dsBrowseDrugs") : mode === "favourites" ? tc("dsFavouriteDrugs") : scenario ? scenarioLabel(scenario) : tc("dsAddDrug")} footer={footer} full>
      {drugPick ? (
        <View>
          <TouchableOpacity onPress={() => {
            if (searchOnlySelection) {
              replaceSelection({ pick: null, dose: "" })
              setSearchOnlySelection(null)
            } else {
              setDrugPick(null)
            }
            if (pickedViaShortcut) { setDrugCat(null); setPickedViaShortcut(false) }
          }} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          <View style={{ marginBottom: canStartAsInfusion ? 10 : 0 }}>
            {searchOnlySelection ? (
              <Text
                testID="drug-search-only-manual-notice"
                accessibilityRole="alert"
                style={{ color:"#fbbf24", fontSize:12, lineHeight:17, marginBottom:12 }}
              >
                {tc("dsSearchOnlyManualNotice")}
              </Text>
            ) : pediatricMode ? (
              <PediatricDoseNotice
                loading={pediatricRulesLoading}
                source={pediatricRulesSource}
                cachedAt={pediatricRulesCachedAt}
                error={pediatricRulesError}
                conflict={pediatricConflict}
                hasProfiles={structuredPediatricProfilesForDrug.length > 0 || pediatricProfilesForDrug.length > 0}
                surface={structuredPediatricSurface}
                structuredRule={selectedStructuredPediatricProfile}
                legacyProfile={selectedPediatricProfile}
                legacyResolution={pediatricResolution}
              />
            ) : null}
            <DoseSelector
              color={drugCat?.color ?? "#3b82f6"}
              quickValues={activeQuickValues}
              manualEntryOnly={!prospectiveGuidanceEnabled || !!searchOnlySelection || (pediatricMode && (
                structuredPediatricSurface?.manualEntryOnly
                || (!structuredPediatricSurface && !selectedPediatricProfile)
              ))}
              value={drugDose} onValueChange={setDrugDose}
              {...activeRange}
              valuePlaceholder={`${tc("dsCustomUnit")} ${activeUnit}`}
              unitSuffix={activeUnit}
              routes={activeRoutes} route={activeRoute} onRouteChange={changeRoute}
              concentrationOptions={activeConcentrations}
              concentrationUnit={searchOnlySelection ? undefined : structuredPediatricSurface?.concentrationUnit}
              concentration={drugConcentration}
              onConcentrationChange={value => replaceSelection({
                pick: drugPick,
                dose: drugDose,
                route: activeRoute,
                concentration: value,
                formulation: drugFormulation,
                rule: drugRule,
              })}
              customConcentration={drugCustomConcentration}
              onCustomConcentrationChange={value => replaceSelection({
                pick: drugPick,
                dose: drugDose,
                route: activeRoute,
                concentration: value?.trim()
                  ? `${value.trim()}${structuredPediatricSurface?.concentrationUnit === "PERCENT" ? "%" : ""}`
                  : undefined,
                customConcentration: value,
                formulation: drugFormulation,
                rule: drugRule,
              })}
              formulationOptions={activeFormulations}
              formulation={drugFormulation}
              onFormulationChange={value => replaceSelection({
                pick: drugPick,
                dose: drugDose,
                route: activeRoute,
                concentration: drugConcentration,
                customConcentration: drugCustomConcentration,
                formulation: value,
                rule: drugRule,
              })}
            />
          </View>
          {canStartAsInfusion && !searchOnlySelection && (
            <TouchableOpacity onPress={onStartAsInfusion}
              style={{ backgroundColor:"#111820", borderRadius:14, padding:16, alignItems:"center",
                borderWidth:1, borderColor: (drugCat?.color ?? "#3b82f6") + "66" }}>
              <Text style={{ color: drugCat?.color ?? "#93c5fd", fontSize:14, fontWeight:"700" }}>
                {tc("dsStartAsInfusion").replace("{name}", drugLabel(drugPick.name))}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <DrugPickerMenu
          drugCat={drugCat}
          mode={mode}
          scenario={scenario}
          query={query}
          drugCats={drugCats}
          filtered={filtered}
          scenarioItems={scenarioItems}
          favouriteItems={favouriteItems}
          routineScenarios={routineScenarios}
          drugLabel={drugLabel}
          groupLabel={groupLabel}
          scenarioLabel={scenarioLabel}
          tc={tc}
          onClearCategory={() => setDrugCat(null)}
          onPickCategoryDrug={drug => { setPickedViaShortcut(false); selectDrug(drug) }}
          onBackHome={() => { setScenario(null); setQuery(""); setMode("home") }}
          onQueryChange={setQuery}
          onOpenCategory={setDrugCat}
          onSelectCanonical={selectCanonical}
          onSelectSearchOnly={selectSearchOnly}
          onOpenFavourites={() => setMode("favourites")}
          onOpenScenario={group => { setScenario(group); setMode("scenario") }}
          onOpenBrowse={() => setMode("browse")}
        />
      )}
    </Sheet>
  )
}
