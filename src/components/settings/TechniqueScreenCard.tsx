import { Text, TouchableOpacity, View } from "react-native"
import type { TechniqueScreen } from "@lospor/core/clinical-preferences"
import { usePreferences } from "@/lib/preferences-context"
import { Card, SettingsRow } from "@/components/ui"
import { colors } from "@/theme/colors"

const SCREENS = [["smart", "tscrSmart", "tscrSmartHint"], ["legacy", "tscrLegacy", "tscrLegacyHint"]] as const

/**
 * Which Vascular access tab this clinician sees (10.2.0): Smart selection, the default, or the legacy
 * tab as it was. The same account setting the web shows.
 */
export function TechniqueScreenCard() {
  const { tc, techniqueScreen, setTechniqueScreen } = usePreferences()
  return (
    <Card>
      <SettingsRow label={tc("tscrTitle")} subtitle={tc("tscrDesc")} />
      <View style={{ gap: 8, paddingVertical: 8 }}>
        {SCREENS.map(([value, label, hint]) => {
          const picked = techniqueScreen === value
          return (
            <TouchableOpacity key={value} testID={`technique-screen-${value}`} accessibilityState={{ selected: picked }} onPress={() => { void setTechniqueScreen(value as TechniqueScreen) }}
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
