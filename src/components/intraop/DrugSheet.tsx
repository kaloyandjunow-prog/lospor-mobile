import { useMemo, useState } from "react"
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import { usePreferences } from "@/lib/preferences-context"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import type { ScenarioGroup } from "@/lib/intraop-scenarios"

type DrugOption = { name: string; unit: string }
type DrugCat = { cat: string; color: string; drugs: DrugOption[] }
type Range = { min: number; max: number; step: number }
type DoseSurface = Range & {
  mode?: string
  quickValues: number[]
  unit: string
  concentrationOptions?: string[]
}

function fallbackRange(unit: string): Range {
  if (unit === "mcg") return { min: 0, max: 2000, step: 10 }
  if (unit === "g")   return { min: 0, max: 10,   step: 0.5 }
  if (unit === "ml" || unit === "mL") return { min: 0, max: 100, step: 1 }
  if (unit === "IU")  return { min: 0, max: 200,  step: 5 }
  return { min: 0, max: 500, step: 5 }
}

function Pill({
  label, sublabel, color, selected, onPress, wide,
}: {
  label: string
  sublabel?: string
  color: string
  selected?: boolean
  onPress: () => void
  wide?: boolean
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        width: wide ? "100%" : "47.5%",
        minHeight: 58,
        justifyContent: "center",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: selected ? color : color + "1a",
        borderWidth: 1,
        borderColor: selected ? color : color + "66",
      }}
    >
      <Text style={{ color: selected ? "#fff" : color, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>
        {label}
      </Text>
      {sublabel ? (
        <Text style={{ color: selected ? "#e2e8f0" : "#94a3b8", fontSize: 10, marginTop: 2 }} numberOfLines={1}>
          {sublabel}
        </Text>
      ) : null}
    </TouchableOpacity>
  )
}

export function DrugSheet({
  visible, onClose, drugCats, favouriteNames, scenarios, drugCat, setDrugCat, drugPick, setDrugPick,
  drugDose, setDrugDose, dosePresets, canStartAsInfusion, onConfirm, onStartAsInfusion,
  routes = {}, drugRoute, setDrugRoute, laConcentrations = {}, drugConcentration, setDrugConcentration,
  ranges = {}, baseProfiles = {}, routeProfiles = {},
}: {
  visible: boolean
  onClose: () => void
  drugCats: DrugCat[]
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
  ranges?: Record<string, Range>
  baseProfiles?: Record<string, DoseSurface>
  routeProfiles?: Record<string, Record<string, DoseSurface>>
}) {
  const { tc } = usePreferences()
  const [mode, setMode] = useState<"home" | "favourites" | "scenario" | "browse">("home")
  const [scenario, setScenario] = useState<ScenarioGroup | null>(null)
  const [query, setQuery] = useState("")

  const allDrugs = useMemo(() =>
    drugCats.flatMap(cat => cat.drugs.map(drug => ({ ...drug, cat, color: cat.color }))),
  [drugCats])
  const byName = useMemo(() => new Map(allDrugs.map(drug => [drug.name, drug])), [allDrugs])

  const activeRoute = drugPick ? (drugRoute ?? routes[drugPick.name]?.[0]) : undefined
  const activeProfile = drugPick
    ? (activeRoute ? routeProfiles[drugPick.name]?.[activeRoute] : undefined) ?? baseProfiles[drugPick.name]
    : undefined
  const activeUnit = activeProfile?.unit ?? drugPick?.unit ?? "mg"
  const activeQuickValues = activeProfile?.quickValues?.length ? activeProfile.quickValues : drugPick ? dosePresets[drugPick.name] : undefined
  const activeConcentrations = activeProfile?.mode === "concentration"
    ? activeProfile.concentrationOptions ?? laConcentrations[drugPick?.name ?? ""]
    : undefined
  const activeRange = activeProfile
    ? { min: activeProfile.min, max: activeProfile.max, step: activeProfile.step }
    : drugPick ? (ranges[drugPick.name] ?? fallbackRange(activeUnit)) : fallbackRange("mg")

  function selectDrug(drug: DrugOption) {
    const firstRoute = routes[drug.name]?.[0]
    const profile = (firstRoute ? routeProfiles[drug.name]?.[firstRoute] : undefined) ?? baseProfiles[drug.name]
    const unit = profile?.unit ?? drug.unit
    setDrugPick({ ...drug, unit })
    setDrugRoute?.(firstRoute ?? "")
    setDrugConcentration?.(undefined)
    const preset = (profile?.quickValues?.length ? profile.quickValues : dosePresets[drug.name])?.[0]
    setDrugDose(preset != null ? String(preset) : "")
  }

  function selectCanonical(canonical: string) {
    const found = byName.get(canonical)
    if (!found) return
    setDrugCat(found.cat)
    selectDrug({ name: found.name, unit: found.unit })
  }

  function changeRoute(route: string) {
    if (!drugPick) return
    const profile = routeProfiles[drugPick.name]?.[route] ?? baseProfiles[drugPick.name]
    setDrugRoute?.(route)
    setDrugConcentration?.(undefined)
    if (profile?.unit) setDrugPick({ ...drugPick, unit: profile.unit })
    const preset = (profile?.quickValues?.length ? profile.quickValues : dosePresets[drugPick.name])?.[0]
    setDrugDose(preset != null ? String(preset) : "")
  }

  const filtered = query.trim()
    ? allDrugs.filter(drug => drug.name.toLowerCase().includes(query.trim().toLowerCase()))
    : []
  const scenarioItems = scenario?.items
    .map(entry => ({ entry, drug: byName.get(entry.canonical) }))
    .filter((row): row is { entry: { label: string; canonical: string }; drug: NonNullable<ReturnType<typeof byName.get>> } => !!row.drug) ?? []
  const favouriteItems = favouriteNames
    .map(name => byName.get(name))
    .filter((drug): drug is NonNullable<typeof drug> => !!drug)

  return (
    <Sheet visible={visible} onClose={onClose}
      title={drugPick ? drugPick.name : drugCat ? drugCat.cat : mode === "browse" ? "Browse drugs" : mode === "favourites" ? "Favourite drugs" : scenario?.label ?? "Add drug"} full>
      {drugPick ? (
        <View>
          <TouchableOpacity onPress={() => setDrugPick(null)} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          <View style={{ marginBottom: canStartAsInfusion ? 10 : 0 }}>
            <DoseSelector
              color={drugCat?.color ?? "#3b82f6"}
              quickValues={activeQuickValues}
              value={drugDose} onValueChange={setDrugDose}
              {...activeRange}
              valuePlaceholder={`Custom ${activeUnit}`}
              unitSuffix={activeUnit}
              routes={routes[drugPick.name]} route={activeRoute} onRouteChange={changeRoute}
              concentrationOptions={activeConcentrations}
              concentration={drugConcentration} onConcentrationChange={setDrugConcentration}
              confirmLabel={`Add ${drugPick.name} ${drugDose} ${activeUnit}`}
              onConfirm={onConfirm} confirmDisabled={!drugDose}
            />
          </View>
          {canStartAsInfusion && (
            <TouchableOpacity onPress={onStartAsInfusion}
              style={{ backgroundColor:"#111820", borderRadius:14, padding:16, alignItems:"center",
                borderWidth:1, borderColor: (drugCat?.color ?? "#3b82f6") + "66" }}>
              <Text style={{ color: drugCat?.color ?? "#93c5fd", fontSize:14, fontWeight:"700" }}>
                Start {drugPick.name} as infusion →
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : drugCat ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => setDrugCat(null)} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {drugCat.drugs.map(drug => (
              <Pill key={drug.name} label={drug.name} sublabel={drug.unit} color={drugCat.color} onPress={() => selectDrug(drug)} />
            ))}
          </View>
        </ScrollView>
      ) : mode === "scenario" && scenario ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => { setScenario(null); setMode("home") }} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {scenarioItems.map(({ entry, drug }) => (
              <Pill key={entry.canonical} label={entry.label} sublabel={drug.unit} color={scenario.color} onPress={() => selectCanonical(entry.canonical)} />
            ))}
          </View>
        </ScrollView>
      ) : mode === "favourites" ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => setMode("home")} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          {favouriteItems.length === 0 ? (
            <Text style={{ color:"#64748b", fontSize:13, lineHeight:18 }}>Choose favourite bolus drugs in Settings.</Text>
          ) : (
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
              {favouriteItems.map(drug => (
                <Pill key={drug.name} label={drug.name} sublabel={drug.unit} color={drug.color} onPress={() => selectCanonical(drug.name)} />
              ))}
            </View>
          )}
        </ScrollView>
      ) : mode === "browse" ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => { setQuery(""); setMode("home") }} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search drugs"
            placeholderTextColor="#475569"
            style={{ backgroundColor:"#111820", color:"#e2e8f0", borderRadius:10, paddingHorizontal:12, paddingVertical:10,
              borderWidth:1, borderColor:"#1e2d40", marginBottom:14 }}
          />
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {(query.trim() ? filtered : drugCats).map(item => "cat" in item && "drugs" in item ? (
              <Pill key={item.cat} label={item.cat} sublabel={`${item.drugs.length} drugs`} color={item.color} onPress={() => setDrugCat(item)} />
            ) : (
              <Pill key={item.name} label={item.name} sublabel={item.unit} color={item.color} onPress={() => selectCanonical(item.name)} />
            ))}
          </View>
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10, marginBottom:16 }}>
            <Pill label="Favourites" sublabel={`${favouriteItems.length || 0} selected`} color="#38bdf8" onPress={() => setMode("favourites")} wide />
          </View>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {scenarios.map(group => (
              <Pill key={group.key} label={group.label} sublabel={group.items.slice(0, 2).map(i => i.label).join(", ")} color={group.color}
                onPress={() => { setScenario(group); setMode("scenario") }} />
            ))}
          </View>
          <View style={{ marginTop:18 }}>
            <Pill label="Browse all drugs" sublabel="Search and canonical groups" color="#64748b" onPress={() => setMode("browse")} wide />
          </View>
        </ScrollView>
      )}
    </Sheet>
  )
}
