import { useMemo, useState } from "react"
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import type { ScenarioGroup } from "@/lib/intraop-scenarios"

type InfusionOption = { name: string; unit: string; color: string }
type Range = { min: number; max: number; step: number }

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

export function InfusionSheet({
  visible, onClose, infDrugs, favouriteNames, scenarios, ratePresets, infDrug, setInfDrug, infRate, setInfRate, onConfirm,
  routes = {}, infRoute, setInfRoute, laConcentrations = {}, infConcentration, setInfConcentration,
  ranges = {},
}: {
  visible: boolean
  onClose: () => void
  infDrugs: InfusionOption[]
  favouriteNames: string[]
  scenarios: ScenarioGroup[]
  ratePresets: Record<string, string[]>
  infDrug: InfusionOption | null
  setInfDrug: (d: InfusionOption | null) => void
  infRate: string
  setInfRate: (v: string) => void
  onConfirm: () => void
  routes?: Record<string, string[]>
  infRoute?: string
  setInfRoute?: (r: string) => void
  laConcentrations?: Record<string, string[]>
  infConcentration?: string
  setInfConcentration?: (c: string | undefined) => void
  ranges?: Record<string, Range>
}) {
  const [mode, setMode] = useState<"home" | "favourites" | "scenario" | "browse">("home")
  const [scenario, setScenario] = useState<ScenarioGroup | null>(null)
  const [query, setQuery] = useState("")

  const byName = useMemo(() => new Map(infDrugs.map(drug => [drug.name, drug])), [infDrugs])

  function selectInfusion(drug: InfusionOption) {
    setInfDrug(drug)
    const preset = ratePresets[drug.name]?.[0]
    setInfRate(preset != null ? String(preset) : "")
    setInfRoute?.(routes[drug.name]?.[0] ?? "")
    setInfConcentration?.(undefined)
  }

  function selectCanonical(canonical: string) {
    const found = byName.get(canonical)
    if (found) selectInfusion(found)
  }

  const filtered = query.trim()
    ? infDrugs.filter(drug => drug.name.toLowerCase().includes(query.trim().toLowerCase()))
    : infDrugs
  const scenarioItems = scenario?.items
    .map(entry => ({ entry, drug: byName.get(entry.canonical) }))
    .filter((row): row is { entry: { label: string; canonical: string }; drug: InfusionOption } => !!row.drug) ?? []
  const favouriteItems = favouriteNames
    .map(name => byName.get(name))
    .filter((drug): drug is InfusionOption => !!drug)

  return (
    <Sheet visible={visible} onClose={onClose} title={infDrug ? infDrug.name : mode === "browse" ? "Browse infusions" : mode === "favourites" ? "Favourite infusions" : scenario?.label ?? "Start infusion"} full>
      {infDrug ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => setInfDrug(null)} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>Back</Text>
          </TouchableOpacity>
          <DoseSelector
            color={infDrug.color}
            quickValues={ratePresets[infDrug.name]?.map(Number)}
            value={infRate} onValueChange={setInfRate}
            {...(ranges[infDrug.name] ?? { min: 0, max: 100, step: 1 })}
            valuePlaceholder="or type custom"
            unitSuffix={infDrug.unit}
            routes={routes[infDrug.name]} route={infRoute} onRouteChange={setInfRoute}
            concentrationOptions={laConcentrations[infDrug.name]}
            concentration={infConcentration} onConcentrationChange={setInfConcentration}
            confirmLabel={`Start ${infDrug.name} ${infRate} ${infDrug.unit}`}
            onConfirm={onConfirm} confirmDisabled={!infRate}
          />
        </ScrollView>
      ) : mode === "scenario" && scenario ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => { setScenario(null); setMode("home") }} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>Back</Text>
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
            <Text style={{ color:"#94a3b8", fontSize:13 }}>Back</Text>
          </TouchableOpacity>
          {favouriteItems.length === 0 ? (
            <Text style={{ color:"#64748b", fontSize:13, lineHeight:18 }}>Choose favourite infusions in Settings.</Text>
          ) : (
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
              {favouriteItems.map(drug => (
                <Pill key={drug.name} label={drug.name} sublabel={drug.unit} color={drug.color} onPress={() => selectInfusion(drug)} />
              ))}
            </View>
          )}
        </ScrollView>
      ) : mode === "browse" ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => { setQuery(""); setMode("home") }} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>Back</Text>
          </TouchableOpacity>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search infusions"
            placeholderTextColor="#475569"
            style={{ backgroundColor:"#111820", color:"#e2e8f0", borderRadius:10, paddingHorizontal:12, paddingVertical:10,
              borderWidth:1, borderColor:"#1e2d40", marginBottom:14 }}
          />
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {filtered.map(drug => (
              <Pill key={drug.name} label={drug.name} sublabel={drug.unit} color={drug.color} onPress={() => selectInfusion(drug)} />
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
            <Pill label="Browse all infusions" sublabel="Search canonical list" color="#64748b" onPress={() => setMode("browse")} wide />
          </View>
        </ScrollView>
      )}
    </Sheet>
  )
}
