import { useState } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import { airwayDevicesInUse, type AirwayDeviceEntry } from "@lospor/core/airway-device-entries"
import { airwayChoices, suggestedAirwayDetails, type AirwayPatient } from "@lospor/core/airway-smart"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"
import { AirwaySmartPanel, type AirwaySmartRequest } from "./AirwaySmartPanel"

/**
 * The Airway tab, Smart selection (10.2.0), on the phone: what is in place
 * first, then the devices the technique leads with as big cards, the rest
 * behind "More devices", and one panel that opens under them. The choices, the
 * suggested sizes and the saving are Core's (airway-smart), as on the web.
 */
export function AirwaySmart({
  entries, onChange, patient, techniques, startedAt, now, timeZone, difficultAirway, deviceLabel, toolLabel, describe, timeOf,
}: {
  entries: readonly AirwayDeviceEntry[]
  onChange: (next: AirwayDeviceEntry[]) => void
  patient: AirwayPatient
  techniques: readonly string[]
  startedAt: string | null
  now: () => string
  timeZone: string | null
  difficultAirway: boolean
  deviceLabel: (code: string) => string
  toolLabel: (code: string) => string
  describe: (entry: AirwayDeviceEntry) => string
  timeOf: (iso: string) => string
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  const [request, setRequest] = useState<AirwaySmartRequest | null>(null)
  const [showOther, setShowOther] = useState(false)
  const choices = airwayChoices(techniques)
  const live = airwayDevicesInUse(entries)
  const shown = [...entries].sort((a, b) => Number(a.status !== "in_use") - Number(b.status !== "in_use"))
  const eyebrow = (text: string) => <Text style={{ color: shade("#94a3b8"), fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>{text}</Text>
  const small = { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: shade("#334155"), justifyContent: "center" as const }

  return (
    <View testID="airway-smart" style={{ marginBottom: 20 }}>
      {eyebrow(`${tc("asmInPlace")}${live.length > 0 ? ` · ${live.length}` : ""}`)}
      {entries.length === 0 ? (
        <View testID="airway-smart-empty" style={{ borderWidth: 1, borderStyle: "dashed", borderColor: shade("#334155"), borderRadius: 12, padding: 12, marginBottom: 16 }}>
          <Text style={{ color: shade("#94a3b8") }}>{tc("asmNone")}</Text>
        </View>
      ) : (
        <View style={{ gap: 8, marginBottom: 16 }}>{shown.map(entry => {
          const out = entry.status !== "in_use"
          const canReintubate = !out && (entry.device === "ORAL_ETT" || entry.device === "NASAL_ETT")
          const canExchange = !out && ["LMA", "DOUBLE_LUMEN_TUBE", "ENDOBRONCHIAL_TUBE"].includes(entry.device)
          return (
            <View key={entry.id} testID={`airway-smart-entry-${entry.id}`} style={{ borderWidth: 1, borderStyle: out ? "dashed" : "solid", borderColor: shade("#2a3140"), borderRadius: 12, padding: 10, backgroundColor: shade("#141414"), opacity: out ? 0.75 : 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ flex: 1, color: shade("#f8fafc"), fontWeight: "700", fontSize: 15, textDecorationLine: out ? "line-through" : "none" }}>{describe(entry)}</Text>
                {entry.insertedAt ? <Text style={{ color: shade("#94a3b8"), fontSize: 12, fontVariant: ["tabular-nums"] }}>{timeOf(entry.insertedAt)}</Text> : null}
              </View>
              {out ? <Text style={{ color: shade("#fca5a5"), fontSize: 12, fontWeight: "700" }}>{entry.status === "failed" ? tc("awxFailed") : tc("awxReplaced")}{entry.endedAt ? ` ${timeOf(entry.endedAt)}` : ""}</Text> : null}
              {(entry.instruments?.length ?? 0) > 0 ? <Text style={{ color: shade("#94a3b8"), fontSize: 12 }}>{tc("asmVia").replace("{tools}", entry.instruments!.map(toolLabel).join(" · "))}</Text> : null}
              {canReintubate ? <TouchableOpacity testID={`airway-smart-reintubate-${entry.id}`} style={[small, { alignSelf: "flex-start", marginTop: 6 }]}
                onPress={() => setRequest({ device: entry.device, source: "tab", replaces: { id: entry.id, reason: "failed_device" } })}><Text style={{ color: shade("#e2e8f0"), fontWeight: "700", fontSize: 12 }}>{tc("asmReintubate")}</Text></TouchableOpacity> : null}
              {canExchange ? <TouchableOpacity testID={`airway-smart-exchange-${entry.id}`} style={[small, { alignSelf: "flex-start", marginTop: 6 }]}
                onPress={() => setRequest({ device: entry.device, source: "tab", replaces: { id: entry.id, reason: "planned" } })}><Text style={{ color: shade("#e2e8f0"), fontWeight: "700", fontSize: 12 }}>{tc("asmExchange")}</Text></TouchableOpacity> : null}
            </View>
          )
        })}</View>
      )}

      {eyebrow(tc("asmAddDevice"))}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>{choices.main.map(device => {
        const suggestion = suggestedAirwayDetails(device, patient) as Record<string, unknown>
        const hint = [suggestion.oralTubeSize ?? suggestion.nasalTubeSize ?? suggestion.lmaSize, suggestion.oralCuffed === true || suggestion.nasalCuffed === true ? tc("asmCuffed") : null].filter(item => item != null).join(" · ")
        const on = request?.device === device
        return (
          <TouchableOpacity key={device} testID={`airway-smart-card-${device}`} accessibilityState={{ selected: on }} onPress={() => setRequest({ device, source: "tab" })}
            style={{ flex: 1, minHeight: 76, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center", padding: 6,
              borderColor: on ? shade("#a67cff") : shade("#2a3140"), backgroundColor: on ? shade("#a67cff") + "26" : shade("#171c26") }}>
            <Text style={{ color: shade("#f8fafc"), fontWeight: "800", fontSize: 15, textAlign: "center" }}>{deviceLabel(device)}</Text>
            {hint ? <Text style={{ color: shade("#94a3b8"), fontSize: 11 }}>{hint}</Text> : null}
          </TouchableOpacity>
        )
      })}</View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {showOther ? choices.other.map(device => (
          <TouchableOpacity key={device} testID={`airway-smart-other-${device}`} style={[small, { minHeight: 44 }]} onPress={() => setRequest({ device, source: "tab" })}>
            <Text style={{ color: shade("#e2e8f0"), fontWeight: "700" }}>{deviceLabel(device)}</Text>
          </TouchableOpacity>
        )) : (
          <TouchableOpacity testID="airway-smart-more" style={[small, { minHeight: 44, borderColor: "transparent" }]} onPress={() => setShowOther(true)}>
            <Text style={{ color: shade("#a67cff"), fontWeight: "800" }}>{tc("asmMore")}</Text>
          </TouchableOpacity>
        )}
      </View>

      {request ? (
        <AirwaySmartPanel key={`${request.device}-${request.replaces?.id ?? ""}`} request={request} entries={entries} patient={patient}
          startedAt={startedAt} now={now} timeZone={timeZone} difficultAirway={difficultAirway} deviceLabel={deviceLabel} toolLabel={toolLabel}
          onSave={next => { setRequest(null); onChange(next) }} onClose={() => setRequest(null)} />
      ) : null}
    </View>
  )
}
