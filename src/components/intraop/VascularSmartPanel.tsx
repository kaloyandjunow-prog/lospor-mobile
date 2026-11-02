import { useState } from "react"
import { Text, TextInput, TouchableOpacity, View } from "react-native"
import type { VascularLine } from "@lospor/core/vascular-access-lines"
import {
  addVascularLine,
  defaultVascularSite,
  resolveVascularTime,
  suggestedArterialGauge,
  suggestedPeripheralGauge,
  vascularAsks,
  type VascularPatient,
  type VascularTimeChoice,
  type VascularType,
} from "@lospor/core/vascular-smart"
import { instantFromLocalTime, localTimeOf } from "@lospor/core/intraop-time"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

/**
 * The one panel Smart selection adds a line with (10.2.0), on the phone: who placed it, its size (a
 * peripheral cannula from 14G to 26G, each with its colour), for a central line its type, site, lumens
 * and depth, and when. It opens under the Vascular access tab, and from the timeline when IV line in,
 * Art line in, CVC in or PICC is charted, with that time already set. What it offers and how it saves
 * is Core's (vascular-smart), the same as the web.
 */
export type VascularSmartRequest = {
  type: VascularType
  centralType?: "CVK" | "PICC"
  at?: string | null
  source: "tab" | "timeline"
  ward?: boolean
  replacesIndex?: number | null
}

export function VascularSmartPanel({
  request, lines, patient, startedAt, now, timeZone, siteLabel, onSave, onClose,
}: {
  request: VascularSmartRequest
  lines: readonly VascularLine[]
  patient: VascularPatient
  startedAt: string | null
  now: () => string
  timeZone: string | null
  siteLabel: (code: string) => string
  onSave: (next: VascularLine[]) => void
  onClose: () => void
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  const [centralType, setCentralType] = useState<"CVK" | "PICC">(request.centralType ?? "CVK")
  const asks = vascularAsks(request.type, centralType)
  const [origin, setOrigin] = useState<"here" | "ward">(request.ward ? "ward" : "here")
  const [site, setSite] = useState<string>(defaultVascularSite(request.type, request.centralType ?? "CVK"))
  const suggested = request.type === "PERIPHERAL" ? suggestedPeripheralGauge(patient) : request.type === "ARTERIAL" ? suggestedArterialGauge(patient) : "7"
  const [size, setSize] = useState<string>(suggested)
  const [lumens, setLumens] = useState<string>("3")
  const [depth, setDepth] = useState<string>("")
  const [choice, setChoice] = useState<VascularTimeChoice>(request.ward ? "arrived" : request.source === "timeline" ? "timeline" : request.replacesIndex != null ? "now" : "start")
  const clock = (iso: string | null | undefined) => (iso && timeZone ? localTimeOf(new Date(iso), timeZone) : null) ?? iso?.slice(11, 16) ?? ""
  const [picked, setPicked] = useState<string>(() => clock(request.at ?? now()))
  const fill = (key: "vsmFromTimeline" | "vsmStart" | "vsmNow", iso: string | null | undefined) => tc(key).replace("{time}", clock(iso))
  const replaced = request.replacesIndex != null ? lines[request.replacesIndex] : null

  function chooseOrigin(next: "here" | "ward") {
    setOrigin(next)
    setChoice(next === "ward" ? "arrived" : request.source === "timeline" ? "timeline" : "start")
  }

  function save() {
    const pickedInstant = timeZone && /^\d{1,2}:\d{2}$/.test(picked) ? instantFromLocalTime(new Date(startedAt ?? now()), picked, timeZone)?.toISOString() ?? null : null
    const at = resolveVascularTime(choice, { startedAt, now: now(), picked: choice === "timeline" ? request.at ?? null : pickedInstant })
    onSave(addVascularLine(lines, {
      id: `vascular-${Date.parse(at ?? now())}-${lines.length + 1}`, type: request.type, site,
      size, depthCm: depth, lumens: request.type === "CENTRAL" ? lumens : undefined,
      origin, insertedAt: at, replacesIndex: request.replacesIndex ?? null,
    }))
  }

  const pill = (on: boolean) => ({
    minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, justifyContent: "center" as const, flexDirection: "row" as const, alignItems: "center" as const, gap: 6,
    borderColor: on ? shade("#a67cff") : shade("#334155"), backgroundColor: on ? shade("#a67cff") + "33" : shade("#1c1c1c"),
  })
  const pillText = (on: boolean) => ({ color: on ? shade("#e9ddff") : shade("#e2e8f0"), fontWeight: "700" as const, fontSize: 14 })
  const label = (text: string) => <Text style={{ color: shade("#94a3b8"), fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>{text}</Text>
  const row = { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6, marginBottom: 12 }
  const typeName = request.type === "CENTRAL" ? (centralType === "PICC" ? tc("vsmPicc") : tc("vsmCentral")) : tc(request.type === "PERIPHERAL" ? "vsmPeripheral" : "vsmArterial")
  const times: Array<[VascularTimeChoice, string]> = origin === "ward"
    ? [["arrived", tc("vsmArrived")], ["pick", tc("vsmPickWhenPlaced")]]
    : [...(request.source === "timeline" ? [["timeline", fill("vsmFromTimeline", request.at)] as [VascularTimeChoice, string]] : []),
      ["start", fill("vsmStart", startedAt)], ["now", fill("vsmNow", now())], ["pick", tc("vsmPick")]]

  return (
    <View testID="vascular-smart-panel" style={{ borderWidth: 1, borderColor: shade("#a67cff"), borderRadius: 14, padding: 12, backgroundColor: shade("#141414"), marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
        <Text style={{ flex: 1, color: shade("#f8fafc"), fontSize: 16, fontWeight: "800" }}>{typeName}</Text>
        <TouchableOpacity testID="vascular-smart-close" onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={{ color: shade("#94a3b8"), fontSize: 20 }}>✕</Text></TouchableOpacity>
      </View>
      {replaced ? <Text style={{ color: shade("#cbd5e1"), fontSize: 12, marginBottom: 12 }}>{tc("vsmOldStays")}</Text> : null}

      {asks.map(ask => {
        if (ask.field === "origin") return (
          <View key="origin">{label(tc("vsmWhoPlaced"))}<View style={row}>
            <TouchableOpacity testID="vascular-smart-origin-here" style={pill(origin === "here")} onPress={() => chooseOrigin("here")}><Text style={pillText(origin === "here")}>{tc("vsmPlacedByUs")}</Text></TouchableOpacity>
            <TouchableOpacity testID="vascular-smart-origin-ward" style={pill(origin === "ward")} onPress={() => chooseOrigin("ward")}><Text style={pillText(origin === "ward")}>{tc("vsmAlreadyInPlace")}</Text></TouchableOpacity>
          </View></View>
        )
        if (ask.field === "centralType") return (
          <View key="centralType">{label(tc("vsmType"))}<View style={row}>{ask.values.map(value => (
            <TouchableOpacity key={value} testID={`vascular-smart-ctype-${value}`} style={pill(centralType === value)} onPress={() => { setCentralType(value); setSite(defaultVascularSite("CENTRAL", value)) }}>
              <Text style={pillText(centralType === value)}>{value === "PICC" ? tc("vsmPicc") : tc("vsmCentral")}</Text></TouchableOpacity>
          ))}</View></View>
        )
        if (ask.field === "site") return (
          <View key="site">{label(tc("vsmSite"))}<View style={row}>{ask.values.map(value => (
            <TouchableOpacity key={value.code} testID={`vascular-smart-site-${value.code}`} style={pill(site === value.code)} onPress={() => setSite(value.code)}><Text style={pillText(site === value.code)}>{siteLabel(value.code)}</Text></TouchableOpacity>
          ))}</View></View>
        )
        if (ask.field === "size") return (
          <View key="size">{label(`${tc("vsmSize")} (${ask.unit})`)}<View style={row}>{ask.values.map(value => (
            <TouchableOpacity key={value} testID={`vascular-smart-size-${value}`} style={pill(size === value)} onPress={() => setSize(value)}>
              {ask.colors?.[value] ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ask.colors[value] }} /> : null}
              <Text style={pillText(size === value)}>{value}{ask.unit}{suggested === value ? `  ${tc("vsmSuggested")}` : ""}</Text>
            </TouchableOpacity>
          ))}</View></View>
        )
        if (ask.field === "lumens") return (
          <View key="lumens">{label(tc("vsmLumens"))}<View style={row}>{ask.values.map(value => (
            <TouchableOpacity key={value} testID={`vascular-smart-lumens-${value}`} style={pill(lumens === value)} onPress={() => setLumens(value)}><Text style={pillText(lumens === value)}>{value}</Text></TouchableOpacity>
          ))}</View></View>
        )
        return (
          <View key="depth">{label(tc("vsmDepth"))}<View style={row}>{ask.values.map(value => (
            <TouchableOpacity key={value} testID={`vascular-smart-depth-${value}`} style={pill(depth === value)} onPress={() => setDepth(depth === value ? "" : value)}><Text style={pillText(depth === value)}>{value}</Text></TouchableOpacity>
          ))}</View></View>
        )
      })}

      {label(tc("vsmTime"))}
      <View style={row}>
        {times.map(([key, text]) => (
          <TouchableOpacity key={key} testID={`vascular-smart-time-${key}`} style={pill(choice === key)} onPress={() => setChoice(key)}><Text style={pillText(choice === key)}>{text}</Text></TouchableOpacity>
        ))}
        {choice === "pick" ? (
          <TextInput testID="vascular-smart-time-input" value={picked} onChangeText={setPicked} placeholder="HH:MM" placeholderTextColor={shade("#64748b")} keyboardType="numbers-and-punctuation" maxLength={5}
            style={{ minWidth: 90, minHeight: 44, borderWidth: 1, borderColor: shade("#334155"), borderRadius: 10, color: shade("#f8fafc"), paddingHorizontal: 10 }} />
        ) : null}
      </View>

      <TouchableOpacity testID="vascular-smart-add" onPress={save} style={{ minHeight: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: shade("#a67cff") }}>
        <Text style={{ color: shade("#12082b"), fontWeight: "800", fontSize: 15 }}>{tc("vsmAdd")}</Text>
      </TouchableOpacity>
    </View>
  )
}
