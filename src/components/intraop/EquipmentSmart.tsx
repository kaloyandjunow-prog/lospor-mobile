import { useState } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import type { EquipmentCategory } from "@lospor/core/equipment"
import {
  EQUIPMENT_GLANCE, equipmentGroups, equipmentItemKey, equipmentNeedsChoice, equipmentRecordState, equipmentTapAction, equipmentTarget,
  type EquipmentFlagState,
} from "@lospor/core/equipment-smart"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

/**
 * The Equipment tab, Smart selection (10.2.0), on the phone: the six airway numbers as a glance grid and
 * every other item as a checklist by group. A tap marks an item ready (kept on this device). On the tube and
 * the LMA a second tap marks it in use, which writes the device to the Airway record. The urinary catheter
 * and the NGT write their case flag at once, and the flag is the tick. What each item does is Core's
 * (equipment-smart); `raw` is the calculator's own output and `shown` the same list in the user's language.
 */
export function EquipmentSmart({ raw, shown, flags, airwayInUse, onFlag, onUseAirway }: {
  raw: readonly EquipmentCategory[]
  shown: readonly EquipmentCategory[]
  flags: EquipmentFlagState
  airwayInUse: readonly string[]
  onFlag: (field: "urinaryCatheter" | "stomachTube") => void
  onUseAirway: (device: "ORAL_ETT" | "LMA") => void
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  const [ready, setReady] = useState<Record<string, boolean>>({})
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const record = { flags, airwayInUse }

  const items = raw.flatMap((category, ci) => category.items.map((item, ii) => ({ category: category.cat, item, shown: shown[ci]?.items[ii] ?? item })))
  const keyOf = (category: string, label: string) => equipmentItemKey(category, label)
  const isInUse = (label: string) => equipmentRecordState(label, record) === "in_use"
  const isDone = (category: string, label: string) => isInUse(label) || !!ready[keyOf(category, label)]
  const done = items.filter(entry => isDone(entry.category, entry.item.label)).length

  function tap(category: string, label: string, value: string) {
    // A tube or LMA size left to the clinician cannot be written for them, so that item is only ticked ready.
    // A catheter or NGT writes no size, so it still sets its flag.
    const found = equipmentTarget(label)
    const target = found?.kind === "airway" && equipmentNeedsChoice(value) ? null : found
    const action = target ? equipmentTapAction(label, { ready: !!ready[keyOf(category, label)], inUse: isInUse(label) }) : (ready[keyOf(category, label)] ? "unready" : "ready")
    const key = keyOf(category, label)
    if (action === "ready") setReady(current => ({ ...current, [key]: true }))
    else if (action === "unready") setReady(current => ({ ...current, [key]: false }))
    else if (action === "use" && target?.kind === "airway") onUseAirway(target.device)
    else if ((action === "flag" || action === "unflag") && target?.kind === "flag") onFlag(target.field)
  }

  const glance = raw.find(category => category.cat === "Airway")
  const groups = equipmentGroups(raw)
  const eyebrow = (text: string) => <Text style={{ color: shade("#94a3b8"), fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginTop: 14, marginBottom: 8 }}>{text}</Text>

  return (
    <View testID="equipment-smart">
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: shade("#94a3b8"), fontSize: 12 }}>{tc("eqsSetUp")}</Text>
        <Text testID="equipment-progress" style={{ color: shade("#94a3b8"), fontSize: 12 }}>{done} / {items.length}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: shade("#262d3a"), overflow: "hidden", marginTop: 4, marginBottom: 6 }}>
        <View style={{ height: 6, width: `${items.length ? (100 * done) / items.length : 0}%`, backgroundColor: shade("#22c55e") }} />
      </View>

      {glance ? (
        <>
          {eyebrow(tc("eqsGlance"))}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {EQUIPMENT_GLANCE.map(label => {
              const index = glance.items.findIndex(item => item.label === label)
              if (index < 0) return null
              const item = glance.items[index]!
              const display = shown[raw.indexOf(glance)]?.items[index] ?? item
              const choose = equipmentNeedsChoice(item.value)
              const on = isDone("Airway", label)
              return (
                <TouchableOpacity key={label} testID={`equipment-cell-${label}`} accessibilityState={{ selected: on }} onPress={() => tap("Airway", label, item.value)}
                  style={{ width: "31%", flexGrow: 1, minHeight: 82, borderRadius: 12, borderWidth: on ? 2 : 1, padding: 6, alignItems: "center", justifyContent: "center",
                    borderColor: on ? shade("#22c55e") : shade("#2a3140"), backgroundColor: on ? shade("#0f2a1a") : shade("#171c26") }}>
                  <Text numberOfLines={1} style={{ color: shade("#94a3b8"), fontSize: 10.5 }}>{display.label}</Text>
                  <Text numberOfLines={2} style={{ color: choose ? shade("#fbbf24") : shade("#f8fafc"), fontWeight: "800", fontSize: choose ? 12 : 18, textAlign: "center" }}>{choose ? tc("eqsChoose") : display.value}</Text>
                  {isInUse(label) ? <Text style={{ color: shade("#86efac"), fontSize: 10, fontWeight: "800" }}>{tc("eqsInUse")}</Text> : on ? <Text style={{ color: shade("#86efac"), fontSize: 10, fontWeight: "800" }}>{tc("eqsReady")}</Text> : null}
                </TouchableOpacity>
              )
            })}
          </View>
        </>
      ) : null}

      {groups.map(group => {
        const ci = raw.findIndex(category => category.cat === group.cat)
        const rows = group.items.map(item => ({ item, shown: shown[ci]?.items[raw[ci]!.items.indexOf(item)] ?? item }))
        const count = rows.filter(row => isDone(group.cat, row.item.label)).length
        const open = !closed[group.cat]
        return (
          <View key={group.cat} testID={`equipment-group-${group.cat}`} style={{ marginTop: 10 }}>
            <TouchableOpacity onPress={() => setClosed(current => ({ ...current, [group.cat]: open }))} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}>
              <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: group.color ?? shade("#64748b") }} />
              <Text style={{ color: shade("#f8fafc"), fontWeight: "800", fontSize: 13, flex: 1 }}>{shown[ci]?.cat ?? group.cat}</Text>
              <Text style={{ color: count === rows.length ? shade("#86efac") : shade("#94a3b8"), fontSize: 12, fontWeight: "700" }}>{count}/{rows.length} {open ? "▾" : "▸"}</Text>
            </TouchableOpacity>
            {open ? rows.map(({ item, shown: display }) => {
              const on = isDone(group.cat, item.label)
              const choose = equipmentNeedsChoice(item.value)
              return (
                <TouchableOpacity key={item.label} testID={`equipment-row-${group.cat}-${item.label}`} accessibilityState={{ checked: on }} onPress={() => tap(group.cat, item.label, item.value)}
                  style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 10, borderRadius: 12, marginBottom: 6, borderWidth: 1,
                    borderColor: on ? shade("#22c55e") : shade("#2a3140"), backgroundColor: on ? shade("#0f2a1a") : shade("#171c26") }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: shade("#f8fafc"), fontWeight: "600", fontSize: 14, textDecorationLine: on ? "line-through" : "none" }}>{display.label}</Text>
                    <Text style={{ color: choose ? shade("#fbbf24") : shade("#e2e8f0"), fontSize: 13, marginTop: 2 }}>{display.value}</Text>
                    {display.note ? <Text style={{ color: shade("#94a3b8"), fontSize: 11.5, lineHeight: 16, marginTop: 3 }}>{display.note}</Text> : null}
                  </View>
                  <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: "center", justifyContent: "center",
                    borderColor: on ? shade("#22c55e") : shade("#334155"), backgroundColor: on ? shade("#22c55e") : "transparent" }}>
                    {on ? <Text style={{ color: shade("#04130a"), fontWeight: "800" }}>✓</Text> : null}
                  </View>
                </TouchableOpacity>
              )
            }) : null}
          </View>
        )
      })}
    </View>
  )
}
