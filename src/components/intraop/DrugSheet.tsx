import { View, Text, TouchableOpacity } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import { usePreferences } from "@/lib/preferences-context"
import { DoseSelector } from "@/components/intraop/DoseSelector"

type DrugOption = { name: string; unit: string }
type DrugCat = { cat: string; color: string; drugs: DrugOption[] }
type FavDrug = DrugOption & { color: string; catObj: DrugCat }

type Range = { min: number; max: number; step: number }

// Fallback by unit when the canonical library hasn't been filled in for a
// given drug yet — mirrors web's bolusRange().
function fallbackRange(unit: string): Range {
  if (unit === "mcg") return { min: 0, max: 2000, step: 10 }
  if (unit === "g")   return { min: 0, max: 10,   step: 0.5 }
  if (unit === "ml")  return { min: 0, max: 100,  step: 1 }
  if (unit === "IU")  return { min: 0, max: 200,  step: 5 }
  return { min: 0, max: 500, step: 5 }
}

export function DrugSheet({
  visible, onClose, drugCats, favDrugs, drugCat, setDrugCat, drugPick, setDrugPick,
  drugDose, setDrugDose, dosePresets, canStartAsInfusion, onConfirm, onStartAsInfusion,
  routes = {}, drugRoute, setDrugRoute, laConcentrations = {}, drugConcentration, setDrugConcentration,
  ranges = {},
}: {
  visible: boolean
  onClose: () => void
  drugCats: DrugCat[]
  favDrugs: (FavDrug | null)[]
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
}) {
  const { tc } = usePreferences()

  return (
    <Sheet visible={visible} onClose={onClose}
      title={drugPick ? drugPick.name : drugCat ? drugCat.cat : "Add drug"} full>
      {!drugCat ? (
        <View>
          {favDrugs.length > 0 && (
            <View style={{ marginBottom:16 }}>
              <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase",
                letterSpacing:1, marginBottom:8 }}>Favourites</Text>
              <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                {favDrugs.map(d => d && (
                  <TouchableOpacity key={d.name}
                    onPress={() => { setDrugCat(d.catObj); setDrugPick(d); setDrugDose("") }}
                    style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
                      backgroundColor:d.color+"1a", borderWidth:1, borderColor:d.color+"55" }}>
                    <Text style={{ color:d.color, fontWeight:"700", fontSize:13 }}>{d.name}</Text>
                    <Text style={{ color:"#94a3b8", fontSize:10, marginTop:1 }}>{d.unit}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {drugCats.map(cat => (
              <TouchableOpacity key={cat.cat} onPress={() => setDrugCat(cat)}
                style={{ width:"47%", paddingVertical:18, borderRadius:14, alignItems:"center",
                  backgroundColor:cat.color+"1a", borderWidth:1, borderColor:cat.color+"55" }}>
                <Text style={{ color:cat.color, fontWeight:"700", fontSize:15 }}>{cat.cat}</Text>
                <Text style={{ color:"#94a3b8", fontSize:10, marginTop:3 }}>
                  {cat.drugs.slice(0,2).map(d => d.name).join(", ")}…
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : !drugPick ? (
        <View>
          <TouchableOpacity onPress={() => setDrugCat(null)} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {drugCat.drugs.map(d => (
              <TouchableOpacity key={d.name} onPress={() => { setDrugPick(d); setDrugDose("") }}
                style={{ paddingHorizontal:18, paddingVertical:14, borderRadius:12,
                  backgroundColor:drugCat.color+"1a", borderWidth:1, borderColor:drugCat.color+"55" }}>
                <Text style={{ color:drugCat.color, fontWeight:"700", fontSize:14 }}>{d.name}</Text>
                <Text style={{ color:"#94a3b8", fontSize:11, marginTop:2 }}>{d.unit}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <View>
          <TouchableOpacity onPress={() => setDrugPick(null)} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          <View style={{ marginBottom: canStartAsInfusion ? 10 : 0 }}>
            <DoseSelector
              color={drugCat?.color ?? "#3b82f6"}
              quickValues={dosePresets[drugPick.name]}
              value={drugDose} onValueChange={setDrugDose}
              {...(ranges[drugPick.name] ?? fallbackRange(drugPick.unit))}
              valuePlaceholder={`Custom ${drugPick.unit}`}
              unitSuffix={drugPick.unit}
              routes={routes[drugPick.name]} route={drugRoute} onRouteChange={setDrugRoute}
              concentrationOptions={laConcentrations[drugPick.name]}
              concentration={drugConcentration} onConcentrationChange={setDrugConcentration}
              confirmLabel={`Add ${drugPick.name} ${drugDose} ${drugPick.unit}`}
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
      )}
    </Sheet>
  )
}
