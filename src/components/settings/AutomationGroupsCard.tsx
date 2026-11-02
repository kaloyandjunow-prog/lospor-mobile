import { Switch } from "react-native"
import { AUTOMATION_GROUPS, vitalQuestionsEnabled, type UserAutomationSwitch } from "@lospor/core/intraop-automation"
import { usePreferences, type ClinicalStringKey } from "@/lib/preferences-context"
import { useIntraopAutomation } from "@/lib/use-intraop-automation"
import { Card, SettingsRow } from "@/components/ui"
import { colors } from "@/theme/colors"

const KEYS: Record<UserAutomationSwitch, [ClinicalStringKey, ClinicalStringKey]> = {
  vitalQuestions: ["agVitalQuestions", "agVitalQuestionsDesc"],
  treatmentSuggestions: ["agTreatmentSuggestions", "agTreatmentSuggestionsDesc"],
  reverseQuestions: ["agReverseQuestions", "agReverseQuestionsDesc"],
  readingQuestions: ["agReadingQuestions", "agReadingQuestionsDesc"],
  labQuestions: ["agLabQuestions", "agLabQuestionsDesc"],
  reminders: ["agReminders", "agRemindersDesc"],
  timers: ["agTimers", "agTimersDesc"],
}

/**
 * The intraoperative suggestions a clinician keeps (10.2.0). Only what the
 * hospital switched on in Status is listed; each is on until turned off here.
 * The whole set is saved each time, so one switch never clears another.
 */
export function AutomationGroupsCard() {
  const { tc, automationGroups, setAutomationGroups } = usePreferences()
  const { settings } = useIntraopAutomation()
  if (!settings.enabled) return null
  const offered: UserAutomationSwitch[] = [
    ...(vitalQuestionsEnabled(settings) ? ["vitalQuestions" as const] : []),
    ...AUTOMATION_GROUPS.filter(group => settings.groups[group]),
  ]
  if (offered.length === 0) return null
  return (
    <Card>
      <SettingsRow label={tc("agTitle")} />
      {offered.map((key, index) => {
        const on = automationGroups[key] !== false
        return (
          <SettingsRow key={key} label={tc(KEYS[key][0])} subtitle={tc(KEYS[key][1])} last={index === offered.length - 1}
            rightElement={
              <Switch testID={`setting-automation-${key}`} value={on}
                onValueChange={value => { void setAutomationGroups({ ...automationGroups, [key]: value }) }}
                trackColor={{ false: colors.border, true: colors.primarySoft }} thumbColor={on ? colors.primary : colors.textMuted} />
            } />
        )
      })}
    </Card>
  )
}
