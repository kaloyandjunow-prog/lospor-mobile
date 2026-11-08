import React, { useMemo } from "react"
import { View, Text } from "react-native"
import { writtenEventList, writtenEventTime } from "@lospor/core/written-event-list"
import { usePreferences } from "@/lib/preferences-context"
import { PALETTES } from "@/components/case-detail/SummaryTimetable"

/**
 * The written event list under the case summary's timetable card (10.2.0, the maintainer's choice B): every
 * clinical event and complication in time order, complications in red with their end time, "≈" on a time
 * charted afterwards. The same list as the printed record's, from Core.
 */
export function WrittenEventList({ keyEvents, timeZone }: { keyEvents: unknown; timeZone?: string | null }) {
  const { theme, tc, language } = usePreferences()
  const P = theme === "dark" ? PALETTES.dark : PALETTES.light
  const log = keyEvents && typeof keyEvents === "object" ? (keyEvents as { log?: unknown }).log : null
  const entries = useMemo(() => writtenEventList(Array.isArray(log) ? log : [], timeZone, language), [log, timeZone, language])
  if (entries.length === 0) return null
  const ongoing = tc("writtenEventsOngoing")
  return (
    <View testID="written-event-list" style={{ backgroundColor: P.card, borderRadius: 14, borderWidth: 1, borderColor: P.grid, padding: 10, marginBottom: 12 }}>
      <Text style={{ color: P.title, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 6 }}>{tc("writtenEventsTitle")}</Text>
      {entries.map(entry => (
        <View key={entry.id} testID={entry.complication ? "written-event-complication" : "written-event"} style={{ flexDirection: "row", gap: 10, paddingVertical: 3 }}>
          <Text style={{ color: entry.complication ? P.sbp : P.muted, fontSize: 12, fontVariant: ["tabular-nums"], minWidth: 48, fontWeight: entry.complication ? "700" : "400" }}>
            {writtenEventTime(entry, ongoing)}
          </Text>
          <Text style={{ color: entry.complication ? P.sbp : P.ink, fontSize: 12, flex: 1, fontWeight: entry.complication ? "700" : "500" }}>{entry.label}</Text>
        </View>
      ))}
      {entries.some(entry => entry.approximate)
        ? <Text style={{ color: P.faint, fontSize: 10, marginTop: 4 }}>{tc("writtenEventsApproximate")}</Text>
        : null}
    </View>
  )
}
