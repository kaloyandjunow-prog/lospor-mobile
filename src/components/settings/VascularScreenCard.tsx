import { Text, TouchableOpacity, View } from "react-native"
import type { VascularScreen } from "@lospor/core/clinical-preferences"
import { usePreferences } from "@/lib/preferences-context"
import { Card, SettingsRow } from "@/components/ui"
import { colors } from "@/theme/colors"

const SCREENS = [["smart", "vscrSmart", "vscrSmartHint"], ["legacy", "vscrLegacy", "vscrLegacyHint"]] as const

/**
 * Which Vascular access tab this clinician sees (10.2.0): Smart selection, the default, or the legacy
 * tab as it was. The same account setting the web shows.
 */
export function VascularScreenCard() {
  const { tc, vascularScreen, setVascularScreen } = usePreferences()
  return (
    <Card>
      <SettingsRow label={tc("vscrTitle")} subtitle={tc("vscrDesc")} />
      <View style={{ gap: 8, paddingVertical: 8 }}>
        {SCREENS.map(([value, label, hint]) => {
          const picked = vascularScreen === value
          return (
            <TouchableOpacity key={value} testID={`vascular-screen-${value}`} accessibilityState={{ selected: picked }} onPress={() => { void setVascularScreen(value as VascularScreen) }}
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
