import { Text, TouchableOpacity, View } from "react-native"
import type { EquipmentScreen } from "@lospor/core/clinical-preferences"
import { usePreferences } from "@/lib/preferences-context"
import { Card, SettingsRow } from "@/components/ui"
import { colors } from "@/theme/colors"

const SCREENS = [["smart", "escrSmart", "escrSmartHint"], ["legacy", "escrLegacy", "escrLegacyHint"]] as const

/**
 * Which Vascular access tab this clinician sees (10.2.0): Smart selection, the default, or the legacy
 * tab as it was. The same account setting the web shows.
 */
export function EquipmentScreenCard() {
  const { tc, equipmentScreen, setEquipmentScreen } = usePreferences()
  return (
    <Card>
      <SettingsRow label={tc("escrTitle")} subtitle={tc("escrDesc")} />
      <View style={{ gap: 8, paddingVertical: 8 }}>
        {SCREENS.map(([value, label, hint]) => {
          const picked = equipmentScreen === value
          return (
            <TouchableOpacity key={value} testID={`equipment-screen-${value}`} accessibilityState={{ selected: picked }} onPress={() => { void setEquipmentScreen(value as EquipmentScreen) }}
              style={{ minHeight: 56, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: picked ? colors.primary : colors.border, backgroundColor: picked ? colors.primarySoft : "transparent" }}>
              <Text style={{ color: picked ? colors.primary : colors.textPrimary, fontWeight: "800" }}>{tc(label)}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{tc(hint)}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </Card>
  )
}
