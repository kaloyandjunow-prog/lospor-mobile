import { View, Text, TouchableOpacity, ScrollView } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import { DoseSelector } from "@/components/intraop/DoseSelector"

type InfusionOption = { name: string; unit: string; color: string }
type Range = { min: number; max: number; step: number }

export function InfusionSheet({
  visible, onClose, infDrugs, ratePresets, infDrug, setInfDrug, infRate, setInfRate, onConfirm,
  routes = {}, infRoute, setInfRoute, laConcentrations = {}, infConcentration, setInfConcentration,
  ranges = {},
}: {
  visible: boolean
  onClose: () => void
  infDrugs: InfusionOption[]
  ratePresets: Record<string, string[]>
  infDrug: InfusionOption | null
  setInfDrug: (d: InfusionOption) => void
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
  return (
    <Sheet visible={visible} onClose={onClose} title="Start infusion">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:16 }}>
        <View style={{ flexDirection:"row", gap:8 }}>
          {infDrugs.map(d => (
            <TouchableOpacity key={d.name} onPress={() => { setInfDrug(d); setInfRate("") }}
              style={{ paddingHorizontal:12, paddingVertical:10, borderRadius:10,
                backgroundColor: infDrug?.name===d.name ? d.color : d.color+"1a",
                borderWidth:1, borderColor:d.color+"66" }}>
              <Text style={{ color: infDrug?.name===d.name ? "#fff" : d.color, fontSize:12, fontWeight:"600" }}>
                {d.name}
              </Text>
              <Text style={{ color:"#94a3b8", fontSize:9, marginTop:1 }}>{d.unit}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      {infDrug && (
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
      )}
    </Sheet>
  )
}
