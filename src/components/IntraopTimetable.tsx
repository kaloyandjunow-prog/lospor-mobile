import React, { useState, useMemo } from "react"
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  TextInput, Alert, FlatList,
} from "react-native"

// ─── Types (API-compatible with web timetable) ────────────────────────────────

export type VitalsEntry = {
  systolic?: number; diastolic?: number; heartRate?: number
  spO2?: number; etco2?: number; temp?: number; bgl?: number
}
export type TimetableDrug = { colIdx: number; name: string; dose: string; unit: string }
export type TimetableFluid = { id: string; name: string; category: string; volume: string; color: string; startCol: number; endCol: number }
export type TimetableInfusion = { id: string; name: string; rate: string; unit: string; startCol: number; endCol: number; color: string; rateChanges?: { col: number; rate: string; unit: string }[] }
export type AgentSegment = { name: string; color: string; startCol: number; endCol: number }
export type TimetableData = {
  vitals:    VitalsEntry[]
  drugs:     TimetableDrug[]
  fluids:    TimetableFluid[]
  infusions: TimetableInfusion[]
  agents:    AgentSegment[]
}
export function emptyTimetable(): TimetableData {
  return { vitals: [], drugs: [], fluids: [], infusions: [], agents: [] }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COL_W   = 56  // px per 5-min column
const LABEL_W = 72  // label column width
const EXTEND  = 6   // columns added per "+" tap = 30 min

// ─── Data libraries ───────────────────────────────────────────────────────────

const DRUG_CATS = [
  { cat: "Induction",    color: "#3b82f6", drugs: [{name:"Propofol",unit:"mg"},{name:"Thiopental",unit:"mg"},{name:"Ketamine",unit:"mg"},{name:"Etomidate",unit:"mg"},{name:"Midazolam",unit:"mg"}] },
  { cat: "Opioids",      color: "#a855f7", drugs: [{name:"Fentanyl",unit:"mcg"},{name:"Morphine",unit:"mg"},{name:"Remifentanil",unit:"mcg"},{name:"Sufentanil",unit:"mcg"},{name:"Alfentanil",unit:"mcg"}] },
  { cat: "Relaxants",    color: "#f59e0b", drugs: [{name:"Succinylcholine",unit:"mg"},{name:"Rocuronium",unit:"mg"},{name:"Vecuronium",unit:"mg"},{name:"Atracurium",unit:"mg"},{name:"Cisatracurium",unit:"mg"}] },
  { cat: "Reversal",     color: "#10b981", drugs: [{name:"Sugammadex",unit:"mg"},{name:"Neostigmine",unit:"mg"},{name:"Atropine",unit:"mg"}] },
  { cat: "Vasopressors", color: "#ef4444", drugs: [{name:"Ephedrine",unit:"mg"},{name:"Phenylephrine",unit:"mcg"},{name:"Epinephrine",unit:"mg"},{name:"Norepinephrine",unit:"mg"}] },
  { cat: "Antiemetics",  color: "#14b8a6", drugs: [{name:"Ondansetron",unit:"mg"},{name:"Dexamethasone",unit:"mg"},{name:"Metoclopramide",unit:"mg"},{name:"Droperidol",unit:"mg"}] },
  { cat: "Analgesics",   color: "#f97316", drugs: [{name:"Paracetamol",unit:"g"},{name:"Ketorolac",unit:"mg"},{name:"Lidocaine",unit:"mg"},{name:"Magnesium",unit:"mg"},{name:"Ketoprofen",unit:"mg"}] },
  { cat: "Local anaesthetics", color: "#0891b2", drugs: [{name:"Bupivacaine",unit:"mg"},{name:"Ropivacaine",unit:"mg"},{name:"Levobupivacaine",unit:"mg"},{name:"Prilocaine",unit:"mg"}] },
]

const INF_DRUGS = [
  {name:"Propofol",unit:"mcg/kg/min",color:"#6366f1"},
  {name:"Remifentanil",unit:"mcg/kg/min",color:"#a855f7"},
  {name:"Norepinephrine",unit:"mcg/kg/min",color:"#ef4444"},
  {name:"Epinephrine",unit:"mcg/kg/min",color:"#b91c1c"},
  {name:"Phenylephrine",unit:"mcg/min",color:"#dc2626"},
  {name:"Dexmedetomidine",unit:"mcg/kg/hr",color:"#0ea5e9"},
  {name:"Ketamine",unit:"mg/kg/hr",color:"#f59e0b"},
  {name:"Rocuronium",unit:"mcg/kg/min",color:"#d97706"},
  {name:"Oxytocin",unit:"mIU/min",color:"#ec4899"},
  {name:"Insulin",unit:"units/hr",color:"#06b6d4"},
  {name:"Magnesium",unit:"g/hr",color:"#0d9488"},
  {name:"Lidocaine",unit:"mg/hr",color:"#0891b2"},
  {name:"Vasopressin",unit:"units/hr",color:"#991b1b"},
]

const FLUID_LIST = [
  {name:"NaCl 0.9%",       cat:"Crystalloids",   color:"#06b6d4"},
  {name:"Ringer's Lactate", cat:"Crystalloids",   color:"#06b6d4"},
  {name:"Hartmann's",       cat:"Crystalloids",   color:"#06b6d4"},
  {name:"Plasma-Lyte",      cat:"Crystalloids",   color:"#06b6d4"},
  {name:"Gelofusine",       cat:"Colloids",       color:"#818cf8"},
  {name:"HES 130/0.4",     cat:"Colloids",       color:"#818cf8"},
  {name:"Albumin 4%",       cat:"Colloids",       color:"#818cf8"},
  {name:"PRBC",             cat:"Blood products", color:"#fb7185"},
  {name:"FFP",              cat:"Blood products", color:"#fb7185"},
  {name:"Platelets",        cat:"Blood products", color:"#fb7185"},
  {name:"Mannitol 20%",     cat:"Other",          color:"#94a3b8"},
  {name:"NaHCO₃ 8.4%",     cat:"Other",          color:"#94a3b8"},
]

const VOLATILE_AGENTS = [
  {name:"Sevoflurane", color:"#a855f7"},
  {name:"Desflurane",  color:"#3b82f6"},
  {name:"Isoflurane",  color:"#10b981"},
]

const VITAL_DEFS: { key: keyof VitalsEntry; label: string; color: string }[] = [
  {key:"systolic",  label:"BP Sys", color:"#ef4444"},
  {key:"diastolic", label:"BP Dia", color:"#f87171"},
  {key:"heartRate", label:"HR",     color:"#22c55e"},
  {key:"spO2",      label:"SpO₂",  color:"#06b6d4"},
  {key:"etco2",     label:"EtCO₂", color:"#f59e0b"},
  {key:"temp",      label:"Temp",   color:"#a78bfa"},
  {key:"bgl",       label:"BGL",    color:"#34d399"},
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Lane-packing for parallel fluids (mirrors web computeFluidRows) ─────────
interface FluidLaneRow { label: string; color: string; segs: TimetableFluid[] }

function computeFluidRows(fluids: TimetableFluid[]): FluidLaneRow[] {
  const byCat = new Map<string, TimetableFluid[]>()
  for (const f of fluids) {
    const cat = f.category || f.name  // group by category if available, else by name
    const normalised = f.endCol < f.startCol ? { ...f, endCol: f.startCol } : f
    const list = byCat.get(cat) ?? []; list.push(normalised); byCat.set(cat, list)
  }
  const rows: FluidLaneRow[] = []
  for (const [cat, catFluids] of byCat) {
    const sorted = [...catFluids].sort((a, b) => a.startCol - b.startCol)
    const lanes: TimetableFluid[][] = []
    for (const fluid of sorted) {
      let placed = false
      for (const lane of lanes) {
        // Non-overlapping if fluid ends before lane item starts, or starts after lane item ends
        if (!lane.some(l => !(fluid.endCol < l.startCol || fluid.startCol > l.endCol))) {
          lane.push(fluid); placed = true; break
        }
      }
      if (!placed) lanes.push([fluid])
    }
    const color = catFluids[0]?.color ?? "#94a3b8"
    lanes.forEach((lane, idx) => {
      rows.push({ label: idx === 0 ? cat : `${cat} ${idx + 1}`, color, segs: lane })
    })
  }
  return rows
}

function colToTime(startTime: string, col: number): string {
  const m = startTime.match(/^(\d+):(\d+)$/)
  const h = m ? parseInt(m[1]) : 0, mm = m ? parseInt(m[2]) : 0
  const total = h * 60 + mm + col * 5
  return `${String(Math.floor(total / 60) % 24).padStart(2,"0")}:${String(total % 60).padStart(2,"0")}`
}

function drugColor(name: string): string {
  for (const cat of DRUG_CATS) {
    if (cat.drugs.some(d => d.name === name)) return cat.color
  }
  return "#64748b"
}

function uid() { return Math.random().toString(36).slice(2,9) }

// ─── Vitals chart ────────────────────────────────────────────────────────────

const CHART_H   = 180
const Y_MAX     = 220
const GRID_VALS = [40, 80, 120, 160, 200]

const CHART_SERIES: { key: keyof VitalsEntry; color: string; dash?: boolean }[] = [
  { key: "systolic",  color: "#ef4444" },
  { key: "diastolic", color: "#ef4444", dash: true },
  { key: "heartRate", color: "#22c55e" },
  { key: "spO2",      color: "#06b6d4" },
  { key: "etco2",     color: "#f59e0b" },
]

function VitalsChart({ vitals, cols }: { vitals: VitalsEntry[]; cols: number[] }) {
  const colCount = cols.length
  const totalW   = LABEL_W + colCount * COL_W

  function yp(val: number) { return CHART_H * (1 - val / Y_MAX) }
  function xp(localIdx: number) { return LABEL_W + localIdx * COL_W + COL_W / 2 }

  type Pt = { x: number; y: number }
  function seriesPoints(key: keyof VitalsEntry): Pt[] {
    return cols.flatMap((col, localIdx) => {
      const val = vitals[col]?.[key]
      return val != null ? [{ x: xp(localIdx), y: yp(val as number) }] : []
    })
  }

  function Segment({ from, to, color, dashed }: { from: Pt; to: Pt; color: string; dashed?: boolean }) {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.sqrt(dx * dx + dy * dy)
    const angle = Math.atan2(dy, dx) * 180 / Math.PI
    const thickness = dashed ? 1 : 2
    return (
      <View
        style={{
          position: "absolute",
          left: from.x + dx / 2 - length / 2,
          top: from.y + dy / 2 - thickness / 2,
          width: length,
          height: thickness,
          backgroundColor: color,
          opacity: dashed ? 0.55 : 0.95,
          transform: [{ rotate: `${angle}deg` }],
        }}
      />
    )
  }

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: "#2e2e2e" }}>
      <View style={{ width: totalW, height: CHART_H, position: "relative" }}>
        {GRID_VALS.map(v => {
          const y = yp(v)
          return (
            <React.Fragment key={v}>
              <View style={{ position: "absolute", left: LABEL_W, top: y, width: totalW - LABEL_W, height: 1, backgroundColor: "#1e2530" }} />
              <Text style={{ position: "absolute", left: 24, top: y - 6, width: LABEL_W - 30, color: "#475569", fontSize: 8, textAlign: "right" }}>{v}</Text>
            </React.Fragment>
          )
        })}
        {cols.map((col, localIdx) => localIdx % 3 === 2 ? (
          <View key={col} style={{ position: "absolute", left: xp(localIdx) + COL_W / 2, top: 0, width: 1, height: CHART_H, backgroundColor: "#1e2530", opacity: 0.6 }} />
        ) : null)}
        {CHART_SERIES.map(({ key, color, dash }) => {
          const pts = seriesPoints(key)
          return (
            <React.Fragment key={`${key}-lines`}>
              {pts.slice(1).map((pt, i) => (
                <Segment key={i} from={pts[i]} to={pt} color={color} dashed={dash} />
              ))}
            </React.Fragment>
          )
        })}
        {CHART_SERIES.map(({ key, color, dash }) => {
          const pts = seriesPoints(key)
          return (
            <React.Fragment key={`${key}-dots`}>
              {pts.map((pt, i) => (
                <View key={i} style={{ position: "absolute", left: pt.x - 4, top: pt.y - 4, width: 8, height: 8, borderRadius: 999, backgroundColor: color, opacity: dash ? 0.7 : 1 }} />
              ))}
            </React.Fragment>
          )
        })}
      </View>
    </View>
  )
}

// ─── Sub-modals ───────────────────────────────────────────────────────────────

function BottomSheet({ visible, onClose, title, children }: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex:1, backgroundColor:"rgba(0,0,0,0.5)" }}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={{ backgroundColor:"#1c1c1c", borderTopLeftRadius:20, borderTopRightRadius:20, padding:20, paddingBottom:40, maxHeight:"80%" }}>
        <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <Text style={{ color:"#fff", fontSize:16, fontWeight:"600" }}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color:"#64748b", fontSize:16 }}>✕</Text>
          </TouchableOpacity>
        </View>
        {children}
      </View>
    </Modal>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TimetableProps {
  startTime:        string
  colCount:         number
  onColCountChange: (n: number) => void
  data:             TimetableData
  onChange:         (d: TimetableData) => void
  showAgents?:      boolean
  colOffset?:       number   // first column index (for paginated chart view)
  showActions?:     boolean  // false hides the add-drug/infusion/fluid/agent bar
  /** Called when an infusion bar cell is tapped — parent uses this to set entryTs before opening manage modal */
  onInfusionBarTap?: (infId: string, col: number) => void
  endTime?:         string   // ISO string or HH:MM — dims cells past the end
  onResumeCase?:    () => void
}

export function IntraopTimetable({ startTime, colCount, onColCountChange, data, onChange, showAgents, colOffset = 0, showActions = true, onInfusionBarTap, endTime, onResumeCase }: TimetableProps) {
  const cols = useMemo(() => Array.from({ length: colCount }, (_, i) => i + colOffset), [colCount, colOffset])

  const endCol = useMemo(() => {
    if (!endTime) return null
    // endTime arrives as full ISO string "2000-01-01THH:MM:00.000Z" — extract HH:MM via UTC
    let hhmm = endTime
    if (endTime.includes("T")) {
      const d = new Date(endTime)
      if (!isNaN(d.getTime())) {
        hhmm = `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`
      }
    }
    const [eh, em] = hhmm.split(":").map(Number)
    const [sh, sm] = startTime.split(":").map(Number)
    const diffMins = (eh * 60 + em) - (sh * 60 + sm)
    return Math.max(0, Math.floor(diffMins / 5))
  }, [endTime, startTime])

  // Chart toggle
  const [chartVisible, setChartVisible] = useState(true)

  // Column selection (the "now" / focus column)
  const [selCol, setSelCol] = useState(0)

  // Add modal: Drug | Infusion | Fluid | Agent tabs
  const [addOpen, setAddOpen]     = useState(false)
  const [addTab, setAddTab]       = useState<"drug"|"infusion"|"fluid"|"agent">("drug")

  // Drug steps: pick → dose
  const [drugStep, setDrugStep]   = useState<"pick"|"dose">("pick")
  const [pickedDrug, setPickedDrug] = useState<{ name:string; unit:string } | null>(null)
  const [drugDose, setDrugDose]   = useState("")

  // Infusion
  const [selInfDrug, setSelInfDrug] = useState<typeof INF_DRUGS[0] | null>(null)
  const [infRate, setInfRate]       = useState("")
  const [infUnit, setInfUnit]       = useState("")

  // Fluid
  const [selFluid, setSelFluid]   = useState<typeof FLUID_LIST[0] | null>(null)
  const [fluidVol, setFluidVol]   = useState("500")

  // Agent
  const [selAgent, setSelAgent]   = useState<typeof VOLATILE_AGENTS[0] | null>(null)

  // Vitals modal
  const [vModal, setVModal]       = useState<{ colIdx:number; key:keyof VitalsEntry } | null>(null)
  const [vVal, setVVal]           = useState("")

  // Bar options (delete / extend)
  const [selBar, setSelBar]       = useState<{ type:"infusion"|"fluid"|"agent"; id:string } | null>(null)
  const [barOpts, setBarOpts]     = useState(false)

  // ── Helpers ──────────────────────────────────────────────────────────────

  function openAdd(tab: typeof addTab, col?: number) {
    if (col !== undefined) setSelCol(col)
    setAddTab(tab)
    setDrugStep("pick"); setPickedDrug(null); setDrugDose("")
    setSelInfDrug(null); setInfRate(""); setInfUnit("")
    setSelFluid(null); setFluidVol("500")
    setSelAgent(null)
    setAddOpen(true)
  }

  function closeAdd() {
    setAddOpen(false)
    setDrugStep("pick"); setPickedDrug(null); setDrugDose("")
  }

  function confirmDrug() {
    if (!pickedDrug || !drugDose) return
    onChange({ ...data, drugs: [...data.drugs, { colIdx: selCol, name: pickedDrug.name, dose: drugDose, unit: pickedDrug.unit }] })
    setDrugDose("")
    setDrugStep("pick")
    setPickedDrug(null)
    setAddOpen(false)
  }

  function deleteDrug(colIdx: number, name: string, dose: string) {
    Alert.alert("Delete drug", `Remove ${dose} ${name}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        onChange({ ...data, drugs: data.drugs.filter(d => !(d.colIdx === colIdx && d.name === name && d.dose === dose)) })
      }},
    ])
  }

  function confirmInfusion() {
    if (!selInfDrug || !infRate) return
    const unit = infUnit || selInfDrug.unit
    onChange({ ...data, infusions: [...data.infusions, { id: uid(), name: selInfDrug.name, rate: infRate, unit, startCol: selCol, endCol: selCol + EXTEND, color: selInfDrug.color }] })
    closeAdd()
  }

  function confirmFluid() {
    if (!selFluid) return
    onChange({ ...data, fluids: [...data.fluids, { id: uid(), name: selFluid.name, category: selFluid.cat, volume: fluidVol, color: selFluid.color, startCol: selCol, endCol: selCol + EXTEND }] })
    closeAdd()
  }

  function confirmAgent() {
    if (!selAgent) return
    const existing = data.agents.find(a => a.name === selAgent.name)
    if (existing) {
      // Extend existing agent to selCol if it ends before
      onChange({ ...data, agents: data.agents.map(a => a.name === selAgent.name ? { ...a, endCol: Math.max(a.endCol, selCol + EXTEND) } : a) })
    } else {
      onChange({ ...data, agents: [...data.agents, { name: selAgent.name, color: selAgent.color, startCol: selCol, endCol: selCol + EXTEND }] })
    }
    closeAdd()
  }

  function openVitals(colIdx: number, key: keyof VitalsEntry) {
    setVModal({ colIdx, key })
    setVVal(String(data.vitals[colIdx]?.[key] ?? ""))
  }

  function confirmVitals() {
    if (!vModal) return
    const num = parseFloat(vVal)
    const newVitals = [...data.vitals]
    while (newVitals.length <= vModal.colIdx) newVitals.push({})
    newVitals[vModal.colIdx] = { ...newVitals[vModal.colIdx], [vModal.key]: isNaN(num) ? undefined : num }
    onChange({ ...data, vitals: newVitals })
    setVModal(null)
  }

  function extendBar(type: "infusion"|"fluid"|"agent", id: string) {
    if (type === "infusion") {
      onChange({ ...data, infusions: data.infusions.map(inf => inf.id === id ? { ...inf, endCol: inf.endCol + EXTEND } : inf) })
    } else if (type === "fluid") {
      onChange({ ...data, fluids: data.fluids.map(f => f.id === id ? { ...f, endCol: f.endCol + EXTEND } : f) })
    } else {
      onChange({ ...data, agents: data.agents.map(a => a.name === id ? { ...a, endCol: a.endCol + EXTEND } : a) })
    }
  }

  function deleteBar(type: "infusion"|"fluid"|"agent", id: string) {
    if (type === "infusion") {
      onChange({ ...data, infusions: data.infusions.filter(inf => inf.id !== id) })
    } else if (type === "fluid") {
      onChange({ ...data, fluids: data.fluids.filter(f => f.id !== id) })
    } else {
      onChange({ ...data, agents: data.agents.filter(a => a.name !== id) })
    }
    setBarOpts(false); setSelBar(null)
  }

  function tapBar(type: "infusion"|"fluid"|"agent", id: string, col?: number) {
    if (type === "infusion" && col !== undefined) onInfusionBarTap?.(id, col)
    setSelBar({ type, id }); setBarOpts(true)
  }

  // ── Grid rendering helpers ────────────────────────────────────────────────

  const CELL_H = 36
  const DRUGS_MIN_H = 44

  function LabelCell({ label, color }: { label: string; color?: string }) {
    return (
      <View style={{ width: LABEL_W, justifyContent:"center", paddingLeft:6, borderRightWidth:1, borderRightColor:"#2e2e2e" }}>
        <Text style={{ color: color ?? "#64748b", fontSize:10, fontWeight:"600" }} numberOfLines={1}>{label}</Text>
      </View>
    )
  }

  // Render a single bar row (infusion / fluid / agent) using cell-based coloring
  function BarRow({ label, labelColor, id, startCol, endCol: barEndCol, barColor, rate, name, type, rateChanges }: {
    label: string; labelColor: string; id: string
    startCol: number; endCol: number; barColor: string
    rate?: string; name?: string
    type: "infusion"|"fluid"|"agent"
    rateChanges?: { col: number; rate: string; unit: string }[]
  }) {
    const isSelected = selBar?.id === id && selBar?.type === type
    const sortedRateChanges = rateChanges ? [...rateChanges].sort((a, b) => a.col - b.col) : []
    return (
      <View style={{ flexDirection:"row", height: CELL_H, borderBottomWidth:1, borderBottomColor:"#2e2e2e" }}>
        <LabelCell label={label} color={labelColor} />
        {cols.map(col => {
          const inRange  = col >= startCol && col <= barEndCol
          const isFirst  = col === startCol
          const isLast   = col === barEndCol
          const isPastEnd = endCol !== null && col > endCol
          const bg = inRange
            ? (isPastEnd ? barColor + (isSelected ? "55" : "22") : barColor + (isSelected ? "ee" : "55"))
            : isPastEnd ? "rgba(0,0,0,0.25)" : "transparent"
          // Determine the current rate segment label for this column
          const prevChange = sortedRateChanges.filter(rc => rc.col <= col).pop()
          const activeRate = prevChange ? `${prevChange.rate} ${prevChange.unit}` : rate
          const isRateSegStart = inRange && (
            col === startCol ||
            sortedRateChanges.some(rc => rc.col === col)
          )
          return (
            <TouchableOpacity
              key={col}
              onPress={() => inRange ? tapBar(type, id, col) : undefined}
              style={{ width: COL_W, height: CELL_H, backgroundColor: bg, justifyContent:"center", alignItems:"center",
                borderTopLeftRadius: isFirst ? 6 : 0, borderBottomLeftRadius: isFirst ? 6 : 0,
                borderTopRightRadius: isLast ? 6 : 0, borderBottomRightRadius: isLast ? 6 : 0,
                borderLeftWidth: inRange && sortedRateChanges.some(rc => rc.col === col) ? 2 : 0,
                borderLeftColor: barColor,
              }}
            >
              {isRateSegStart && (
                <Text style={{ color: barColor, fontSize: 9, fontWeight:"700" }} numberOfLines={1}>
                  {activeRate ?? name ?? label}
                </Text>
              )}
              {isLast && !isFirst && !isRateSegStart && (
                <TouchableOpacity onPress={() => extendBar(type, id)} hitSlop={{ top:6, bottom:6, left:6, right:6 }}>
                  <Text style={{ color: barColor, fontSize: 12, fontWeight:"800" }}>+</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )
        })}
      </View>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={{ borderRadius:12, overflow:"hidden", borderWidth:1, borderColor:"#2e2e2e", backgroundColor:"#111111" }}>

      {/* ── Chart toggle ──────────────────────────────────────────── */}
      <TouchableOpacity
        onPress={() => setChartVisible(v => !v)}
        style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center",
          paddingHorizontal:12, paddingVertical:6, borderBottomWidth:1, borderBottomColor:"#2e2e2e",
          backgroundColor:"#0a0f1a" }}
      >
        <Text style={{ color:"#64748b", fontSize:10, fontWeight:"600", letterSpacing:1, textTransform:"uppercase" }}>Vitals Chart</Text>
        <Text style={{ color:"#475569", fontSize:12 }}>{chartVisible ? "▲" : "▼"}</Text>
      </TouchableOpacity>

      {/* Horizontal scrollable grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>

          {/* ── Vitals chart ────────────────────────────────────────── */}
          {chartVisible && (
            <VitalsChart vitals={data.vitals} cols={cols} />
          )}

          {/* ── Time header ─────────────────────────────────────── */}
          <View style={{ flexDirection:"row", height:30, backgroundColor:"#0f172a", borderBottomWidth:1, borderBottomColor:"#2e2e2e" }}>
            <LabelCell label="Time" />
            {cols.map(col => {
              const isLabel = col % 3 === 0
              const isSelected = col === selCol
              return (
                <TouchableOpacity
                  key={col}
                  onPress={() => { setSelCol(col); openAdd("drug", col) }}
                  style={{ width: COL_W, height:30, justifyContent:"center", alignItems:"center",
                    backgroundColor: isSelected ? "#1e3a5f" : "transparent",
                    borderRightWidth: col % 3 === 2 ? 1 : 0, borderRightColor:"#2e2e2e",
                    position:"relative",
                  }}
                >
                  <Text style={{ color: isSelected ? "#93c5fd" : "#475569", fontSize: isLabel ? 9 : 7 }}>
                    {isLabel ? colToTime(startTime, col) : "·"}
                  </Text>
                  {col === endCol && (
                    <View style={{ position:"absolute", right:0, top:0, bottom:0, width:2, backgroundColor:"#22c55e", zIndex:10 }} />
                  )}
                </TouchableOpacity>
              )
            })}
          </View>

          {/* ── Vitals rows ──────────────────────────────────────── */}
          {VITAL_DEFS.map(vd => (
            <View key={vd.key} style={{ flexDirection:"row", height: CELL_H, borderBottomWidth:1, borderBottomColor:"#1e2530" }}>
              <LabelCell label={vd.label} color={vd.color} />
              {cols.map(col => {
                const val = data.vitals[col]?.[vd.key]
                const isSelected = col === selCol
                const isPastEnd = endCol !== null && col > endCol
                return (
                  <TouchableOpacity
                    key={col}
                    onPress={() => openVitals(col, vd.key)}
                    style={{ width: COL_W, height: CELL_H, justifyContent:"center", alignItems:"center",
                      backgroundColor: isPastEnd ? "rgba(0,0,0,0.25)" : isSelected ? "#1e3a5f22" : "transparent",
                      borderRightWidth: col % 3 === 2 ? 1 : 0, borderRightColor:"#1e2530",
                    }}
                  >
                    <Text style={{ color: val != null ? vd.color : "#334155", fontSize: val != null ? 11 : 9, fontWeight: val != null ? "600" : "400" }}>
                      {val != null ? String(val) : "·"}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          ))}

          {/* ── Drugs row ────────────────────────────────────────── */}
          <View style={{ flexDirection:"row", minHeight: DRUGS_MIN_H, borderBottomWidth:1, borderBottomColor:"#2e2e2e", borderTopWidth:1, borderTopColor:"#2e2e2e", backgroundColor:"#0a0a0a" }}>
            <View style={{ width: LABEL_W, justifyContent:"flex-start", paddingTop:6, paddingLeft:6, borderRightWidth:1, borderRightColor:"#2e2e2e" }}>
              <Text style={{ color:"#64748b", fontSize:10, fontWeight:"600" }}>Drugs</Text>
            </View>
            {cols.map(col => {
              const drugs = data.drugs.filter(d => d.colIdx === col)
              const isSelected = col === selCol
              return (
                <TouchableOpacity
                  key={col}
                  onPress={() => { setSelCol(col); openAdd("drug", col) }}
                  style={{ width: COL_W, minHeight: DRUGS_MIN_H, paddingTop:4, paddingBottom:4, paddingHorizontal:2,
                    backgroundColor: isSelected ? "#1e3a5f22" : "transparent",
                    borderRightWidth: col % 3 === 2 ? 1 : 0, borderRightColor:"#2e2e2e",
                  }}
                >
                  {drugs.map((d, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={(e) => { e.stopPropagation?.(); deleteDrug(d.colIdx, d.name, d.dose) }}
                      style={{ backgroundColor: drugColor(d.name) + "33", borderRadius:4, paddingHorizontal:2, paddingVertical:2, marginBottom:2, borderWidth:1, borderColor: drugColor(d.name) + "66" }}
                    >
                      <Text style={{ color: drugColor(d.name), fontSize:8, fontWeight:"700" }} numberOfLines={1}>
                        {d.name.slice(0,8)}
                      </Text>
                      <Text style={{ color: "#cbd5e1", fontSize:7 }}>{d.dose}{d.unit}</Text>
                    </TouchableOpacity>
                  ))}
                  {drugs.length === 0 && (
                    <View style={{ flex:1, justifyContent:"center", alignItems:"center" }}>
                      <Text style={{ color:"#1e2d40", fontSize:14 }}>+</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>

          {/* ── Agent bars ───────────────────────────────────────── */}
          {(showAgents || data.agents.length > 0) && data.agents.map(a => (
            <BarRow key={a.name} label="Agent" labelColor="#a78bfa"
              id={a.name} type="agent" startCol={a.startCol} endCol={a.endCol}
              barColor={a.color} name={a.name}
            />
          ))}

          {/* ── Infusion bars ─────────────────────────────────────── */}
          {data.infusions.map(inf => (
            <BarRow key={inf.id} label={inf.name} labelColor={inf.color}
              id={inf.id} type="infusion" startCol={inf.startCol} endCol={inf.endCol}
              barColor={inf.color} rate={`${inf.rate} ${inf.unit}`} rateChanges={inf.rateChanges}
            />
          ))}

          {/* ── Fluid bars — lane-packed by category for parallel display ── */}
          {computeFluidRows(data.fluids).map(row => (
            row.segs.map(fl => (
              <BarRow key={fl.id} label={row.label} labelColor={row.color}
                id={fl.id} type="fluid" startCol={fl.startCol} endCol={fl.endCol}
                barColor={fl.color} rate={`${fl.volume}mL`}
              />
            ))
          ))}

        </View>
      </ScrollView>

      {/* ── Action bar ─────────────────────────────────────────────── */}
      {showActions && <View style={{ flexDirection:"row", padding:10, gap:8, flexWrap:"wrap", borderTopWidth:1, borderTopColor:"#2e2e2e" }}>
        {["drug","infusion","fluid","agent"].map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => openAdd(tab as any)}
            style={{ flexDirection:"row", alignItems:"center", gap:4, backgroundColor:"#1c1c1c", borderRadius:8, paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor:"#2e2e2e" }}
          >
            <Text style={{ color:"#94a3b8", fontSize:12 }}>
              + {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={() => onColCountChange(colCount + 12)}
          style={{ flexDirection:"row", alignItems:"center", gap:4, backgroundColor:"#1e3a5f", borderRadius:8, paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor:"#3b82f6" }}
        >
          <Text style={{ color:"#93c5fd", fontSize:12 }}>+ 1 hour</Text>
        </TouchableOpacity>
      </View>}

      {/* ── Add modal ────────────────────────────────────────────────── */}
      <BottomSheet
        visible={addOpen}
        onClose={closeAdd}
        title={`Add at ${colToTime(startTime, selCol)}`}
      >
        {/* Tab row */}
        <View style={{ flexDirection:"row", gap:6, marginBottom:16 }}>
          {(["drug","infusion","fluid","agent"] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              onPress={() => setAddTab(tab)}
              style={{ flex:1, paddingVertical:8, borderRadius:8, alignItems:"center",
                backgroundColor: addTab === tab ? "#2563eb" : "#111111",
                borderWidth:1, borderColor: addTab === tab ? "#2563eb" : "#2e2e2e",
              }}
            >
              <Text style={{ color: addTab === tab ? "#fff" : "#64748b", fontSize:11, fontWeight:"600", textTransform:"capitalize" }}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* DRUG TAB */}
        {addTab === "drug" && (
          drugStep === "pick" ? (
            <ScrollView style={{ maxHeight:320 }} showsVerticalScrollIndicator={false}>
              {DRUG_CATS.map(cat => (
                <View key={cat.cat} style={{ marginBottom:12 }}>
                  <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{cat.cat}</Text>
                  <View style={{ flexDirection:"row", flexWrap:"wrap", gap:6 }}>
                    {cat.drugs.map(d => (
                      <TouchableOpacity
                        key={d.name}
                        onPress={() => { setPickedDrug(d); setDrugStep("dose") }}
                        style={{ backgroundColor: cat.color + "22", borderRadius:8, paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor: cat.color + "55" }}
                      >
                        <Text style={{ color: cat.color, fontSize:12, fontWeight:"600" }}>{d.name}</Text>
                        <Text style={{ color:"#64748b", fontSize:10 }}>{d.unit}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View>
              <View style={{ flexDirection:"row", alignItems:"center", gap:8, marginBottom:16 }}>
                <TouchableOpacity onPress={() => setDrugStep("pick")}>
                  <Text style={{ color:"#64748b", fontSize:14 }}>← Back</Text>
                </TouchableOpacity>
                <Text style={{ color: drugColor(pickedDrug?.name ?? ""), fontSize:16, fontWeight:"700" }}>{pickedDrug?.name}</Text>
              </View>
              <Text style={{ color:"#94a3b8", fontSize:13, marginBottom:6 }}>Dose ({pickedDrug?.unit})</Text>
              <TextInput
                style={{ backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:12, fontSize:18, borderWidth:1, borderColor:"#2e2e2e", marginBottom:16 }}
                placeholder={`Enter dose in ${pickedDrug?.unit}`}
                placeholderTextColor="#334155"
                keyboardType="decimal-pad"
                value={drugDose}
                onChangeText={setDrugDose}
                autoFocus
              />
              <TouchableOpacity
                onPress={confirmDrug}
                disabled={!drugDose}
                style={{ backgroundColor: drugDose ? "#2563eb" : "#1e2d40", borderRadius:10, padding:14, alignItems:"center" }}
              >
                <Text style={{ color:"#fff", fontWeight:"700" }}>Add {pickedDrug?.name} {drugDose}{pickedDrug?.unit}</Text>
              </TouchableOpacity>
            </View>
          )
        )}

        {/* INFUSION TAB */}
        {addTab === "infusion" && (
          <View>
            <Text style={{ color:"#64748b", fontSize:11, fontWeight:"600", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Select drug</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:14 }}>
              <View style={{ flexDirection:"row", gap:8 }}>
                {INF_DRUGS.map(d => (
                  <TouchableOpacity
                    key={d.name}
                    onPress={() => { setSelInfDrug(d); setInfUnit(d.unit) }}
                    style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:10, backgroundColor: selInfDrug?.name === d.name ? d.color : d.color + "22", borderWidth:1, borderColor: d.color + "66" }}
                  >
                    <Text style={{ color: selInfDrug?.name === d.name ? "#fff" : d.color, fontSize:12, fontWeight:"600" }}>{d.name}</Text>
                    <Text style={{ color:"#94a3b8", fontSize:9 }}>{d.unit}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            {selInfDrug && (
              <>
                <Text style={{ color:"#94a3b8", fontSize:13, marginBottom:6 }}>Rate ({selInfDrug.unit})</Text>
                <TextInput
                  style={{ backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:12, fontSize:18, borderWidth:1, borderColor:"#2e2e2e", marginBottom:14 }}
                  placeholder="e.g. 0.1"
                  placeholderTextColor="#334155"
                  keyboardType="decimal-pad"
                  value={infRate}
                  onChangeText={setInfRate}
                  autoFocus
                />
                <TouchableOpacity
                  onPress={confirmInfusion}
                  disabled={!infRate}
                  style={{ backgroundColor: infRate ? selInfDrug.color : "#1e2d40", borderRadius:10, padding:14, alignItems:"center" }}
                >
                  <Text style={{ color:"#fff", fontWeight:"700" }}>Start {selInfDrug.name} {infRate} {selInfDrug.unit}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* FLUID TAB */}
        {addTab === "fluid" && (
          <View>
            <ScrollView style={{ maxHeight:200 }} showsVerticalScrollIndicator={false}>
              {["Crystalloids","Colloids","Blood products","Other"].map(cat => (
                <View key={cat} style={{ marginBottom:10 }}>
                  <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{cat}</Text>
                  <View style={{ flexDirection:"row", flexWrap:"wrap", gap:6 }}>
                    {FLUID_LIST.filter(f => f.cat === cat).map(f => (
                      <TouchableOpacity
                        key={f.name}
                        onPress={() => setSelFluid(f)}
                        style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:8, backgroundColor: selFluid?.name === f.name ? f.color : f.color + "22", borderWidth:1, borderColor: f.color + "55" }}
                      >
                        <Text style={{ color: selFluid?.name === f.name ? "#fff" : f.color, fontSize:12, fontWeight:"600" }}>{f.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
            {selFluid && (
              <View style={{ marginTop:12 }}>
                <Text style={{ color:"#94a3b8", fontSize:13, marginBottom:6 }}>Volume (mL)</Text>
                <View style={{ flexDirection:"row", gap:8, marginBottom:12 }}>
                  {["250","500","1000"].map(v => (
                    <TouchableOpacity key={v} onPress={() => setFluidVol(v)}
                      style={{ flex:1, paddingVertical:8, borderRadius:8, alignItems:"center", backgroundColor: fluidVol === v ? selFluid.color : selFluid.color + "22", borderWidth:1, borderColor: selFluid.color + "55" }}>
                      <Text style={{ color: fluidVol === v ? "#fff" : selFluid.color, fontSize:12, fontWeight:"600" }}>{v} mL</Text>
                    </TouchableOpacity>
                  ))}
                  <TextInput
                    style={{ flex:1, backgroundColor:"#111111", color:"#fff", borderRadius:8, paddingVertical:8, paddingHorizontal:8, fontSize:12, borderWidth:1, borderColor:"#2e2e2e", textAlign:"center" }}
                    placeholder="Other"
                    placeholderTextColor="#334155"
                    keyboardType="numeric"
                    value={["250","500","1000"].includes(fluidVol) ? "" : fluidVol}
                    onChangeText={setFluidVol}
                  />
                </View>
                <TouchableOpacity
                  onPress={confirmFluid}
                  style={{ backgroundColor: selFluid.color, borderRadius:10, padding:14, alignItems:"center" }}
                >
                  <Text style={{ color:"#fff", fontWeight:"700" }}>Add {selFluid.name} {fluidVol} mL</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* AGENT TAB */}
        {addTab === "agent" && (
          <View>
            <Text style={{ color:"#94a3b8", fontSize:13, marginBottom:12 }}>Select volatile agent</Text>
            <View style={{ flexDirection:"row", gap:10, marginBottom:16 }}>
              {VOLATILE_AGENTS.map(a => (
                <TouchableOpacity
                  key={a.name}
                  onPress={() => setSelAgent(a)}
                  style={{ flex:1, paddingVertical:14, borderRadius:12, alignItems:"center",
                    backgroundColor: selAgent?.name === a.name ? a.color : a.color + "22",
                    borderWidth:2, borderColor: a.color,
                  }}
                >
                  <Text style={{ color: selAgent?.name === a.name ? "#fff" : a.color, fontSize:13, fontWeight:"700" }}>{a.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {selAgent && (
              <TouchableOpacity
                onPress={confirmAgent}
                style={{ backgroundColor: selAgent.color, borderRadius:10, padding:14, alignItems:"center" }}
              >
                <Text style={{ color:"#fff", fontWeight:"700" }}>Add {selAgent.name} from {colToTime(startTime, selCol)}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </BottomSheet>

      {/* ── Vitals edit modal ─────────────────────────────────────────── */}
      <BottomSheet
        visible={!!vModal}
        onClose={() => setVModal(null)}
        title={`${VITAL_DEFS.find(v => v.key === vModal?.key)?.label} at ${vModal ? colToTime(startTime, vModal.colIdx) : ""}`}
      >
        <TextInput
          style={{ backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:14, fontSize:22, fontWeight:"600", borderWidth:1, borderColor:"#2e2e2e", marginBottom:16, textAlign:"center" }}
          placeholder="Enter value"
          placeholderTextColor="#334155"
          keyboardType="decimal-pad"
          value={vVal}
          onChangeText={setVVal}
          autoFocus
        />
        <View style={{ flexDirection:"row", gap:8 }}>
          <TouchableOpacity
            onPress={() => { onChange({ ...data, vitals: data.vitals.map((v,i) => i === vModal?.colIdx ? { ...v, [vModal.key]: undefined } : v) }); setVModal(null) }}
            style={{ flex:1, backgroundColor:"#1c1c1c", borderRadius:10, padding:14, alignItems:"center", borderWidth:1, borderColor:"#2e2e2e" }}
          >
            <Text style={{ color:"#64748b", fontWeight:"600" }}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={confirmVitals}
            style={{ flex:2, backgroundColor:"#2563eb", borderRadius:10, padding:14, alignItems:"center" }}
          >
            <Text style={{ color:"#fff", fontWeight:"700" }}>Save</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ── Bar options modal ─────────────────────────────────────────── */}
      <BottomSheet
        visible={barOpts && !!selBar}
        onClose={() => { setBarOpts(false); setSelBar(null) }}
        title="Bar options"
      >
        {selBar && (
          <View style={{ gap:10 }}>
            <TouchableOpacity
              onPress={() => { extendBar(selBar.type, selBar.id); setBarOpts(false); setSelBar(null) }}
              style={{ backgroundColor:"#1e3a5f", borderRadius:10, padding:14, alignItems:"center", borderWidth:1, borderColor:"#3b82f6" }}
            >
              <Text style={{ color:"#93c5fd", fontWeight:"700" }}>Extend +30 min</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => deleteBar(selBar.type, selBar.id)}
              style={{ backgroundColor:"#1e1414", borderRadius:10, padding:14, alignItems:"center", borderWidth:1, borderColor:"#7f1d1d" }}
            >
              <Text style={{ color:"#ef4444", fontWeight:"700" }}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </BottomSheet>

    </View>
  )
}
