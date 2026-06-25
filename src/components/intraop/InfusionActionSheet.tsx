import { View, Text, TouchableOpacity } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import type { ActiveInfusion } from "@/lib/intraop-log-event"
import { DoseSelector } from "@/components/intraop/DoseSelector"

type Range = { min: number; max: number; step: number }

export function InfusionActionSheet({
  visible, onClose, target, ratePresets, newRate, setNewRate, onChangeRate, onStop,
  laConcentrations = {}, newConcentration, setNewConcentration, ranges = {},
}: {
  visible: boolean
  onClose: () => void
  target: ActiveInfusion | null
  ratePresets: Record<string, string[]>
  newRate: string
  setNewRate: (v: string) => void
  onChangeRate: (target: ActiveInfusion, rate: string, concentration?: string) => void
  onStop: (target: ActiveInfusion) => void
  laConcentrations?: Record<string, string[]>
  newConcentration?: string
  setNewConcentration?: (c: string | undefined) => void
  ranges?: Record<string, Range>
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={target?.name ?? "Infusion"}>
      {target && (
        <View style={{ gap:12 }}>
          <Text style={{ color:"#94a3b8", fontSize:13 }}>
            Current: {target.rate} {target.unit}{target.concentration ? ` · ${target.concentration}` : ""}
          </Text>
          <DoseSelector
            color="#3b82f6"
            quickValues={ratePresets[target.name]?.map(Number)}
            value={newRate} onValueChange={setNewRate}
            {...(ranges[target.name] ?? { min: 0, max: 100, step: 1 })}
            valuePlaceholder="New rate"
            unitSuffix={target.unit}
            concentrationOptions={laConcentrations[target.name]}
            concentration={newConcentration ?? target.concentration}
            onConcentrationChange={setNewConcentration}
            confirmLabel={`Change to ${newRate} ${target.unit}`}
            onConfirm={() => onChangeRate(target, newRate, newConcentration)}
            confirmDisabled={!newRate}
          />
          <TouchableOpacity
            onPress={() => onStop(target)}
            style={{ backgroundColor:"#1e1414", borderRadius:10, padding:14, alignItems:"center",
              borderWidth:1, borderColor:"#ef444444" }}>
            <Text style={{ color:"#ef4444", fontWeight:"700" }}>Stop infusion</Text>
          </TouchableOpacity>
        </View>
      )}
    </Sheet>
  )
}
