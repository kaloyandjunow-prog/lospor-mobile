import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, Modal,
  TextInput, Alert, Pressable, KeyboardAvoidingView, Platform, Switch,
  unstable_batchedUpdates, PanResponder, useWindowDimensions,
} from "react-native"
import { useLocalSearchParams, useRouter, Stack } from "expo-router"
import * as Haptics from "expo-haptics"
import * as SecureStore from "expo-secure-store"
import { apiFetch, apiJson } from "@/lib/api"
import { usePreferences, type ClinicalStringKey } from "@/lib/preferences-context"
import { useCaseLiveUpdates } from "@/lib/use-case-live-updates"
import { IntraopTimetable, emptyTimetable, type TimetableData, type VitalsEntry } from "@/components/IntraopTimetable"
import { SyncBadge } from "@/components/clinical-ui"
import { VitalStepper } from "@/components/VitalStepper"
import { AppHeader } from "@/components/AppHeader"
import { EditWindowBanner } from "@/components/EditWindowBanner"
import { colors } from "@/theme/colors"
import { useCaseLock } from "@/lib/use-case-lock"
import { WatchingOverlay } from "@/components/WatchingOverlay"

// react-native-web does NOT export `unstable_batchedUpdates` (it's undefined there),
// so calling it directly throws "is not a function" and aborts the whole case load
// on the PWA. React 18+ auto-batches async setState anyway, so the fallback simply
// runs the updates directly on web while preserving explicit batching on native.
const runBatched: (fn: () => void) => void =
  typeof unstable_batchedUpdates === "function" ? unstable_batchedUpdates : (fn) => fn()

type ScanImageAsset = {
  uri: string
  base64?: string | null
  mimeType?: string | null
  file?: Blob | null
}

function readBlobAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      resolve(typeof result === "string" ? result.split(",")[1] ?? "" : "")
    }
    reader.onerror = () => reject(new Error("Could not read the captured image."))
    reader.readAsDataURL(blob)
  })
}

async function prepareVitalsScanImage(asset: ScanImageAsset): Promise<{ image: string; mimeType: string }> {
  if (Platform.OS !== "web") {
    if (asset.base64) {
      return { image: asset.base64, mimeType: asset.mimeType || "image/jpeg" }
    }
    const response = await fetch(asset.uri)
    const blob = await response.blob()
    return { image: await readBlobAsBase64(blob), mimeType: blob.type || asset.mimeType || "image/jpeg" }
  }

  const sourceBlob = asset.file instanceof Blob
    ? asset.file
    : await fetch(asset.uri).then(response => response.blob())
  const objectUrl = URL.createObjectURL(sourceBlob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error("Could not decode the captured image."))
      element.src = objectUrl
    })
    const maxDimension = 1600
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Image compression is not available in this browser.")
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return {
      image: canvas.toDataURL("image/jpeg", 0.72).split(",")[1] ?? "",
      mimeType: "image/jpeg",
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType =
  | "drug" | "vital" | "clinical_event"
  | "infusion_start" | "infusion_rate" | "infusion_stop"
  | "fluid_start" | "fluid_end"
  | "agent_start" | "agent_stop"

type LogEvent = {
  id: string; ts: string; type: EventType
  name?: string; dose?: string; unit?: string; category?: string; color?: string
  systolic?: number; diastolic?: number; heartRate?: number
  spO2?: number; etco2?: number; temp?: number; bgl?: number
  label?: string
  infId?: string; rate?: string
  fluidId?: string; volume?: string
  syncStatus?: "pending" | "failed"
}

type ActiveInfusion = { infId: string; name: string; rate: string; unit: string; color: string }
type ActiveFluid    = { fluidId: string; name: string; volume: string; color: string }
type AirwayDetail  = { tubeSize: string; cuffed: "yes"|"no"|""; tool: string; cl: string }
type RunningItem   = { id: string; label: string; color: string }

// ─── Data ─────────────────────────────────────────────────────────────────────

const COMPLICATION_TC_TITLES: Record<string, ClinicalStringKey> = {
  cardiovascular: "compCatCardiovascular",
  respiratory:    "compCatRespiratory",
  neurological:   "compCatNeurological",
  metabolic:      "compCatMetabolic",
  drug:           "compCatDrug",
  haematological: "compCatHaematological",
  equipment:      "compCatEquipment",
  surgical:       "compCatSurgical",
}

const COMPLICATION_GROUPS = [
  {
    id: "cardiovascular",
    title: "Cardiovascular",
    items: [
      "Hypotension", "Hypertension", "Bradycardia", "Tachycardia",
      "Atrial fibrillation", "Supraventricular arrhythmia", "Ventricular tachycardia",
      "Ventricular fibrillation", "Myocardial ischaemia", "Myocardial infarction",
      "Cardiac arrest", "Venous air embolism", "Pulmonary embolism", "ST changes",
    ],
  },
  {
    id: "respiratory",
    title: "Respiratory",
    items: [
      "Hypoxia / desaturation", "Laryngospasm", "Bronchospasm", "Aspiration",
      "Difficult intubation", "Failed intubation", "CICO (can't intubate can't oxygenate)",
      "Accidental extubation", "Endobronchial intubation",
      "Pneumothorax", "Tension pneumothorax", "Hypercarbia",
    ],
  },
  {
    id: "neurological",
    title: "Neurological",
    items: [
      "Awareness under anaesthesia", "Cerebrovascular accident / stroke",
      "Raised intracranial pressure", "Peripheral nerve injury",
      "Spinal cord ischaemia", "Total spinal",
      "Delayed emergence", "Seizure", "High spinal", "Failed block",
    ],
  },
  {
    id: "metabolic",
    title: "Metabolic / Temperature",
    items: [
      "Hypothermia", "Hyperthermia", "Malignant hyperthermia",
      "Hypoglycaemia", "Hyperglycaemia",
      "Hyponatraemia", "Hypernatraemia", "Hypokalaemia", "Hyperkalaemia",
      "Hypocalcaemia", "Adrenal crisis",
    ],
  },
  {
    id: "drug",
    title: "Drug / Pharmacological",
    items: [
      "Anaphylaxis / allergic reaction", "Anaphylactoid reaction", "Drug reaction", "Latex reaction",
      "Drug error", "Drug overdose",
      "Local anaesthetic systemic toxicity (LAST)",
      "Residual neuromuscular blockade", "Serotonin syndrome",
    ],
  },
  {
    id: "haematological",
    title: "Haematological",
    items: [
      "Massive haemorrhage", "Blood loss >1L", "Coagulopathy",
      "DIC (disseminated intravascular coagulation)",
      "Haemolytic transfusion reaction", "Febrile non-haemolytic transfusion reaction",
      "TRALI (transfusion-related acute lung injury)",
      "TACO (transfusion-associated circulatory overload)",
    ],
  },
  {
    id: "equipment",
    title: "Equipment / Technical",
    items: [
      "IV line failure / extravasation", "Arterial line failure", "CVK failure",
      "ETT displacement", "Circuit disconnection", "Gas supply failure",
      "Monitoring failure", "Regional block failure", "Equipment malfunction",
    ],
  },
  {
    id: "surgical",
    title: "Surgical",
    items: [
      "Unexpected major haemorrhage", "Injury to major vessel", "Injury to organ",
      "Tourniquet complication", "Pneumoperitoneum complication",
      "Positioning injury", "Compartment syndrome", "Venous gas embolism",
    ],
  },
]

const PREMED_QUICK = [
  "Midazolam 7.5 mg PO",
  "Midazolam 3.75 mg PO",
  "Temazepam 10 mg PO",
  "Lorazepam 1 mg PO",
  "Hydroxyzine 25 mg PO",
  "Omeprazole 20 mg PO",
  "Metoclopramide 10 mg PO",
  "Ondansetron 4 mg PO",
  "Paracetamol 1g PO",
  "Clonidine 0.1 mg PO",
]

const DRUG_CATS = [
  { cat: "Induction",    color: "#3b82f6", drugs: [
    {name:"Propofol",unit:"mg"},{name:"Thiopental",unit:"mg"},{name:"Ketamine",unit:"mg"},
    {name:"Etomidate",unit:"mg"},{name:"Midazolam",unit:"mg"},
  ]},
  { cat: "Opioids",      color: "#a855f7", drugs: [
    {name:"Fentanyl",unit:"mcg"},{name:"Morphine",unit:"mg"},{name:"Remifentanil",unit:"mcg"},
    {name:"Sufentanil",unit:"mcg"},{name:"Alfentanil",unit:"mcg"},
  ]},
  { cat: "Relaxants",    color: "#f59e0b", drugs: [
    {name:"Succinylcholine",unit:"mg"},{name:"Rocuronium",unit:"mg"},{name:"Vecuronium",unit:"mg"},
    {name:"Atracurium",unit:"mg"},{name:"Cisatracurium",unit:"mg"},
  ]},
  { cat: "Reversal",     color: "#10b981", drugs: [
    {name:"Sugammadex",unit:"mg"},{name:"Neostigmine",unit:"mg"},{name:"Atropine",unit:"mg"},
    {name:"Galantamine",unit:"mg"},
  ]},
  { cat: "Vasopressors", color: "#ef4444", drugs: [
    {name:"Ephedrine",unit:"mg"},{name:"Phenylephrine",unit:"mcg"},{name:"Epinephrine",unit:"mg"},
    {name:"Norepinephrine",unit:"mg"},{name:"Vasopressin",unit:"IU"},
  ]},
  { cat: "Antiemetics",  color: "#14b8a6", drugs: [
    {name:"Ondansetron",unit:"mg"},{name:"Dexamethasone",unit:"mg"},
    {name:"Metoclopramide",unit:"mg"},{name:"Droperidol",unit:"mg"},
  ]},
  { cat: "Analgesics",   color: "#f97316", drugs: [
    {name:"Paracetamol",unit:"g"},{name:"Ketorolac",unit:"mg"},{name:"Ketoprofen",unit:"mg"},
    {name:"Lidocaine",unit:"mg"},{name:"Magnesium",unit:"mg"},
  ]},
  { cat: "Local anaesthetics", color: "#0891b2", drugs: [
    {name:"Lidocaine",unit:"mg"},{name:"Bupivacaine",unit:"mg"},{name:"Ropivacaine",unit:"mg"},
    {name:"Levobupivacaine",unit:"mg"},{name:"Prilocaine",unit:"mg"},
    {name:"Mepivacaine",unit:"mg"},{name:"Articaine",unit:"mg"},
  ]},
]

const DOSE_PRESETS: Record<string, number[]> = {
  Propofol:[50,100,150,200], Thiopental:[250,350,500], Ketamine:[25,50,75,100],
  Etomidate:[10,15,20], Midazolam:[1,2,3,5],
  Fentanyl:[50,100,150,200], Morphine:[2,4,6,8,10], Remifentanil:[50,100,200],
  Sufentanil:[10,20,30], Alfentanil:[250,500,750,1000],
  Succinylcholine:[50,75,100], Rocuronium:[25,50,75,100], Vecuronium:[5,8,10],
  Atracurium:[25,35,50], Cisatracurium:[10,15,20],
  Sugammadex:[100,200,400], Neostigmine:[1,2], Atropine:[0.5,1,1.5], Galantamine:[5,10,15],
  Ephedrine:[5,10,15,30], Phenylephrine:[50,100,150,200],
  Epinephrine:[0.1,0.3,0.5,1], Norepinephrine:[0.1,0.5,1], Vasopressin:[10,20],
  Ondansetron:[4,8], Dexamethasone:[4,8], Metoclopramide:[10], Droperidol:[0.625,1.25],
  Paracetamol:[0.5,1], Ketorolac:[15,30], Ketoprofen:[50,100], Lidocaine:[40,60,80,100],
  Magnesium:[1000,1500,2000],
  Bupivacaine:[10,15,20,25], Ropivacaine:[10,15,20],
  Levobupivacaine:[10,15,20], Prilocaine:[100,150,200],
  Mepivacaine:[40,60,80,100], Articaine:[40,60,80,100],
}

const INF_DRUGS = [
  {name:"Propofol",        unit:"mcg/kg/min",color:"#6366f1"},
  {name:"Remifentanil",    unit:"mcg/kg/min",color:"#a855f7"},
  {name:"Midazolam",       unit:"mg/hr",     color:"#4f46e5"},
  {name:"Fentanyl",        unit:"mcg/hr",    color:"#9333ea"},
  {name:"Sufentanil",      unit:"mcg/hr",    color:"#7c3aed"},
  {name:"Morphine",        unit:"mg/hr",     color:"#8b5cf6"},
  {name:"Alfentanil",      unit:"mcg/kg/min",color:"#a78bfa"},
  {name:"Ketamine",        unit:"mg/kg/hr",  color:"#f59e0b"},
  {name:"Dexmedetomidine", unit:"mcg/kg/hr", color:"#0ea5e9"},
  {name:"Norepinephrine",  unit:"mcg/kg/min",color:"#ef4444"},
  {name:"Epinephrine",     unit:"mcg/kg/min",color:"#b91c1c"},
  {name:"Phenylephrine",   unit:"mcg/min",   color:"#dc2626"},
  {name:"Ephedrine",       unit:"mg/hr",     color:"#f87171"},
  {name:"Dopamine",        unit:"mcg/kg/min",color:"#f97316"},
  {name:"Dobutamine",      unit:"mcg/kg/min",color:"#fb923c"},
  {name:"Vasopressin",     unit:"units/hr",  color:"#991b1b"},
  {name:"Nitroglycerin",   unit:"mcg/min",   color:"#84cc16"},
  {name:"Labetalol",       unit:"mg/hr",     color:"#059669"},
  {name:"Rocuronium",      unit:"mcg/kg/min",color:"#d97706"},
  {name:"Cisatracurium",   unit:"mcg/kg/min",color:"#b45309"},
  {name:"Lidocaine",       unit:"ml/hr",     color:"#0891b2"},
  {name:"Ropivacaine",     unit:"ml/hr",     color:"#0e7490"},
  {name:"Bupivacaine",     unit:"ml/hr",     color:"#164e63"},
  {name:"Levobupivacaine", unit:"ml/hr",     color:"#155e75"},
  {name:"Prilocaine",      unit:"ml/hr",     color:"#0c4a6e"},
  {name:"Mepivacaine",     unit:"ml/hr",     color:"#0369a1"},
  {name:"Magnesium",       unit:"g/hr",      color:"#0d9488"},
  {name:"Oxytocin",        unit:"mIU/min",   color:"#ec4899"},
  {name:"Insulin",         unit:"units/hr",  color:"#06b6d4"},
  {name:"Heparin",         unit:"units/hr",  color:"#64748b"},
]

const INF_RATE_PRESETS: Record<string, string[]> = {
  Propofol:        ["25","50","75","100","150"],
  Remifentanil:    ["0.05","0.1","0.15","0.25","0.5"],
  Midazolam:       ["1","2","5","10"],
  Fentanyl:        ["25","50","100","150"],
  Sufentanil:      ["5","10","20","30"],
  Morphine:        ["2","4","6","8"],
  Alfentanil:      ["0.5","1","2","3"],
  Ketamine:        ["0.1","0.2","0.3","0.5"],
  Dexmedetomidine: ["0.2","0.4","0.7","1.0"],
  Norepinephrine:  ["0.05","0.1","0.2","0.3"],
  Epinephrine:     ["0.05","0.1","0.15","0.2"],
  Phenylephrine:   ["25","50","75","100"],
  Ephedrine:       ["10","20","30","40"],
  Dopamine:        ["2","5","10","15"],
  Dobutamine:      ["3","5","10","15"],
  Vasopressin:     ["0.01","0.02","0.04"],
  Nitroglycerin:   ["10","20","50","100"],
  Labetalol:       ["20","40","60","80"],
  Rocuronium:      ["3","5","8","10"],
  Cisatracurium:   ["1","2","3"],
  Lidocaine:       ["5","10","15","20"],
  Ropivacaine:     ["5","10","15","20"],
  Bupivacaine:     ["5","8","10","12"],
  Levobupivacaine: ["5","8","10","12"],
  Prilocaine:      ["5","10","15","20"],
  Mepivacaine:     ["5","10","15","20"],
  Magnesium:       ["1","2","3"],
  Oxytocin:        ["2","5","10","20"],
  Insulin:         ["1","2","4","8"],
  Heparin:         ["500","800","1000","1500"],
}

const FLUID_LIST = [
  {name:"NaCl 0.9%",        cat:"Crystalloids",   color:"#06b6d4"},
  {name:"Ringer's Lactate", cat:"Crystalloids",   color:"#06b6d4"},
  {name:"Hartmann's",       cat:"Crystalloids",   color:"#06b6d4"},
  {name:"Ringer's Acetate", cat:"Crystalloids",   color:"#06b6d4"},
  {name:"Plasma-Lyte",      cat:"Crystalloids",   color:"#06b6d4"},
  {name:"D5W",              cat:"Crystalloids",   color:"#06b6d4"},
  {name:"D10W",             cat:"Crystalloids",   color:"#06b6d4"},
  {name:"Gelofusine",       cat:"Colloids",       color:"#818cf8"},
  {name:"HES 130/0.4",      cat:"Colloids",       color:"#818cf8"},
  {name:"Albumin 4%",       cat:"Colloids",       color:"#818cf8"},
  {name:"Albumin 20%",      cat:"Colloids",       color:"#818cf8"},
  {name:"PRBC",             cat:"Blood products", color:"#fb7185"},
  {name:"FFP",              cat:"Blood products", color:"#fb7185"},
  {name:"Platelets",        cat:"Blood products", color:"#fb7185"},
  {name:"Cryoprecipitate",  cat:"Blood products", color:"#fb7185"},
  {name:"Mannitol 20%",     cat:"Other",          color:"#94a3b8"},
  {name:"NaHCO₃ 8.4%",     cat:"Other",          color:"#94a3b8"},
  {name:"Gelatin 4%",       cat:"Other",          color:"#94a3b8"},
  {name:"Dextran 40",       cat:"Other",          color:"#94a3b8"},
]

const VOLATILE_AGENTS = [
  {name:"Sevoflurane",color:"#a855f7"},
  {name:"Desflurane", color:"#3b82f6"},
  {name:"Isoflurane", color:"#10b981"},
]

type ClinicalEventDef = { label: string; color: string }
const CLINICAL_EVENT_CATS: { cat: string; color: string; isComplication?: boolean; events: ClinicalEventDef[] }[] = [
  { cat: "Airway", color: "#6366f1", events: [
    { label:"Induction",         color:"#3b82f6" },
    { label:"Mask vent",         color:"#0891b2" },
    { label:"Intubated",         color:"#6366f1" },
    { label:"LMA in",            color:"#6366f1" },
    { label:"Extubated",         color:"#22c55e" },
    { label:"Failed intubation", color:"#ef4444" },
    { label:"Airway exchange",   color:"#f97316" },
    { label:"DLT placed",        color:"#6366f1" },
  ]},
  { cat: "Regional", color: "#a855f7", events: [
    { label:"Spinal in",         color:"#a855f7" },
    { label:"Epidural in",       color:"#a855f7" },
    { label:"CSE",               color:"#a855f7" },
    { label:"Block done",        color:"#8b5cf6" },
    { label:"LA top-up",         color:"#8b5cf6" },
    { label:"Spinal removed",    color:"#64748b" },
    { label:"Epidural removed",  color:"#64748b" },
  ]},
  { cat: "Access", color: "#f59e0b", events: [
    { label:"Art line in",       color:"#f59e0b" },
    { label:"CVC in",            color:"#f59e0b" },
    { label:"PA cath",           color:"#d97706" },
    { label:"PICC",              color:"#d97706" },
    { label:"IO access",         color:"#d97706" },
  ]},
  { cat: "Surgical", color: "#ef4444", events: [
    { label:"Positioned",        color:"#64748b" },
    { label:"Incision",          color:"#ef4444" },
    { label:"Procedure started", color:"#ef4444" },
    { label:"Procedure ended",   color:"#22c55e" },
    { label:"Tourniquet on",     color:"#f97316" },
    { label:"Tourniquet off",    color:"#22c55e" },
    { label:"Closure",           color:"#22c55e" },
  ]},
  { cat: "Transfer", color: "#22c55e", events: [
    { label:"To PACU",           color:"#22c55e" },
    { label:"To ICU",            color:"#f97316" },
    { label:"To HDU",            color:"#f59e0b" },
    { label:"To ward",           color:"#22c55e" },
  ]},
  { cat: "Complications", color: "#ef4444", isComplication: true, events: [
    { label:"Hypotension",                     color:"#ef4444" },
    { label:"Hypertension",                    color:"#ef4444" },
    { label:"Bradycardia",                     color:"#ef4444" },
    { label:"Tachycardia",                     color:"#ef4444" },
    { label:"Cardiac arrest",                  color:"#ef4444" },
    { label:"Hypoxia / desaturation",          color:"#ef4444" },
    { label:"Laryngospasm",                    color:"#ef4444" },
    { label:"Bronchospasm",                    color:"#ef4444" },
    { label:"Aspiration",                      color:"#ef4444" },
    { label:"Anaphylaxis / allergic reaction", color:"#ef4444" },
    { label:"Drug error",                      color:"#ef4444" },
    { label:"LAST",                            color:"#ef4444" },
    { label:"Massive haemorrhage",             color:"#ef4444" },
    { label:"Awareness under anaesthesia",     color:"#ef4444" },
  ]},
]

function clinicalEventColor(label: string): string {
  for (const cat of CLINICAL_EVENT_CATS) {
    const ev = cat.events.find(e => label === e.label || label.startsWith(e.label + " (") || label.startsWith(e.label))
    if (ev) return ev.color
  }
  return "#64748b"
}

const POSITIONS_LIST = [
  { code: "SUPINE",                  label: "Supine",              desc: "Flat on back",         color: "#3b82f6" },
  { code: "PRONE",                   label: "Prone",               desc: "Face down",             color: "#6366f1" },
  { code: "LEFT_LATERAL",            label: "Left lateral",        desc: "On left side",          color: "#06b6d4" },
  { code: "RIGHT_LATERAL",           label: "Right lateral",       desc: "On right side",         color: "#06b6d4" },
  { code: "GYNECOLOGICAL",           label: "Lithotomy",           desc: "Legs in stirrups",      color: "#a855f7" },
  { code: "TRENDELENBURG",           label: "Trendelenburg",       desc: "Head ↓ 15–30°",         color: "#f97316" },
  { code: "REVERSE_TRENDELENBURG",   label: "Rev. Trendelenburg",  desc: "Head ↑ 15–30°",         color: "#f59e0b" },
  { code: "FOWLER",                  label: "Fowler",              desc: "Semi-sitting ~45°",     color: "#22c55e" },
  { code: "BEACH_CHAIR",             label: "Beach chair",         desc: "Shoulder position",     color: "#14b8a6" },
  { code: "LLOYD_DAVIES",            label: "Lloyd-Davies",        desc: "Modified lithotomy",    color: "#8b5cf6" },
  { code: "LATERAL_DECUBITUS_LEFT",  label: "Lat. decubitus L",    desc: "Left side, arm up",     color: "#0ea5e9" },
  { code: "LATERAL_DECUBITUS_RIGHT", label: "Lat. decubitus R",    desc: "Right side, arm up",    color: "#0ea5e9" },
  { code: "SITTING",                 label: "Sitting",             desc: "Upright 90°",           color: "#22c55e" },
  { code: "JACKKNIFE",               label: "Jackknife",           desc: "Prone, hip flexed",     color: "#64748b" },
  { code: "KNEE_CHEST",              label: "Knee-chest",          desc: "Kneeling, chest down",  color: "#64748b" },
]

const MONITORING_OPTS: { label: string; field: string; section: string }[] = [
  { label:"ECG",                 field:"ecg",              section:"standard"     },
  { label:"SpO₂",                field:"spO2Monitor",      section:"standard"     },
  { label:"NIBP",                field:"nbpMonitor",       section:"standard"     },
  { label:"Capnography (EtCO₂)", field:"etco2Monitor",     section:"respiratory"  },
  { label:"Temperature",         field:"tempMonitor",      section:"respiratory"  },
  { label:"IBP (invasive BP)",   field:"invasiveBP",       section:"haemodynamic" },
  { label:"CVP",                 field:"cvpMonitor",       section:"haemodynamic" },
  { label:"PA catheter",         field:"paCatheter",       section:"haemodynamic" },
  { label:"TEE",                 field:"tee",              section:"haemodynamic" },
  { label:"BIS",                 field:"bis",              section:"depth"        },
  { label:"Entropy (pEEG)",      field:"entropyMonitor",   section:"depth"        },
  { label:"NIRS / rSO₂",        field:"nirsMonitor",      section:"depth"        },
  { label:"SSEP / MEP",          field:"evokedPotentials", section:"depth"        },
  { label:"TOF / NMT",           field:"tofMonitor",       section:"depth"        },
  { label:"Blood glucose",       field:"bglMonitor",       section:"other"        },
  { label:"Blood gases (ABG)",   field:"bloodGasMonitor",  section:"other"        },
  { label:"Urine output",        field:"urinaryCatheter",  section:"other"        },
  { label:"Gastric tube (NGT)",  field:"stomachTube",      section:"other"        },
]

type TechniqueNode = { v: string; label: string; isOther?: boolean; children?: TechniqueNode[] }

const TECHNIQUE_TREE: TechniqueNode[] = [
  { v:"GENERAL", label:"General anaesthesia", children:[
    { v:"GENERAL_INHALATION", label:"Inhalational" },
    { v:"GENERAL_TIVA",       label:"TIVA" },
    { v:"GENERAL_COMBINED",   label:"Balanced (inhaled + IV)" },
  ]},
  { v:"REGIONAL", label:"Regional anaesthesia", children:[
    { v:"NEURAXIAL", label:"Neuraxial", children:[
      { v:"SPINAL", label:"Spinal (SAB)", children:[
        { v:"SPINAL_SINGLE", label:"Single shot", children:[
          { v:"SPINAL_SINGLE_LUMBAR",         label:"Lumbar" },
          { v:"SPINAL_SINGLE_LOW_THORACIC",   label:"Low thoracic" },
          { v:"SPINAL_SINGLE_MID_THORACIC",   label:"Mid thoracic" },
          { v:"SPINAL_SINGLE_HIGH_THORACIC",  label:"High thoracic" },
        ]},
        { v:"SPINAL_CONTINUOUS", label:"Continuous", children:[
          { v:"SPINAL_CONT_LUMBAR",        label:"Lumbar" },
          { v:"SPINAL_CONT_LOW_THORACIC",  label:"Low thoracic" },
          { v:"SPINAL_CONT_MID_THORACIC",  label:"Mid thoracic" },
          { v:"SPINAL_CONT_HIGH_THORACIC", label:"High thoracic" },
        ]},
      ]},
      { v:"EPIDURAL", label:"Epidural", children:[
        { v:"EPIDURAL_CAUDAL",        label:"Caudal" },
        { v:"EPIDURAL_LUMBAR",        label:"Lumbar" },
        { v:"EPIDURAL_LOW_THORACIC",  label:"Low thoracic" },
        { v:"EPIDURAL_MID_THORACIC",  label:"Mid thoracic" },
        { v:"EPIDURAL_HIGH_THORACIC", label:"High thoracic" },
      ]},
      { v:"COMBINED_SPINAL_EPIDURAL", label:"CSE", children:[
        { v:"CSE_LUMBAR",        label:"Lumbar" },
        { v:"CSE_LOW_THORACIC",  label:"Low thoracic" },
        { v:"CSE_MID_THORACIC",  label:"Mid thoracic" },
        { v:"CSE_HIGH_THORACIC", label:"High thoracic" },
      ]},
      { v:"DPE", label:"Dural puncture epidural (DPE)" },
    ]},
    { v:"PERIPHERAL", label:"Peripheral nerve block", children:[
      { v:"BLOCK_UPPER", label:"Upper extremity", children:[
        { v:"BLOCK_INTERSCALENE",   label:"Interscalene" },
        { v:"BLOCK_SUPRACLAVICULAR",label:"Supraclavicular" },
        { v:"BLOCK_INFRACLAVICULAR",label:"Infraclavicular" },
        { v:"BLOCK_AXILLARY",       label:"Axillary" },
        { v:"BLOCK_WRIST",          label:"Wrist block" },
        { v:"BLOCK_DIGITAL",        label:"Digital block" },
        { v:"BLOCK_BIER",           label:"Bier block (IVRA)" },
        { v:"BLOCK_ELBOW",          label:"Elbow block" },
      ]},
      { v:"BLOCK_LOWER", label:"Lower extremity", children:[
        { v:"BLOCK_FEMORAL",       label:"Femoral nerve" },
        { v:"BLOCK_ADDUCTOR",      label:"Adductor canal" },
        { v:"BLOCK_SCIATIC",       label:"Sciatic nerve" },
        { v:"BLOCK_POPLITEAL",     label:"Popliteal sciatic" },
        { v:"BLOCK_ANKLE",         label:"Ankle block" },
        { v:"BLOCK_OBTURATOR",     label:"Obturator nerve" },
        { v:"BLOCK_LAT_FEMORAL",   label:"Lat. femoral cutaneous" },
        { v:"BLOCK_LUMBAR_PLEXUS", label:"Lumbar plexus (psoas)" },
        { v:"BLOCK_IPACK",         label:"IPACK" },
        { v:"BLOCK_GENICULAR",     label:"Genicular nerves" },
        { v:"BLOCK_FOOT",          label:"Foot block" },
      ]},
      { v:"BLOCK_TRUNK", label:"Trunk / Abdominal wall", children:[
        { v:"BLOCK_TAP",          label:"TAP block" },
        { v:"BLOCK_RECTUS",       label:"Rectus sheath" },
        { v:"BLOCK_PARAVERTEBRAL",label:"Paravertebral" },
        { v:"BLOCK_ESP",          label:"Erector spinae (ESP)" },
        { v:"BLOCK_SERRATUS",     label:"Serratus anterior" },
        { v:"BLOCK_PECS1",        label:"PECS I" },
        { v:"BLOCK_PECS2",        label:"PECS II" },
        { v:"BLOCK_QL",           label:"Quadratus lumborum (QL)" },
        { v:"BLOCK_ILIOINGUINAL", label:"Ilioinguinal / iliohypogastric" },
        { v:"BLOCK_INTERCOSTAL",  label:"Intercostal block" },
      ]},
      { v:"BLOCK_HEAD_NECK", label:"Head & Neck", children:[
        { v:"BLOCK_SUPERFICIAL_CERVICAL", label:"Superficial cervical plexus" },
        { v:"BLOCK_DEEP_CERVICAL",        label:"Deep cervical plexus" },
        { v:"BLOCK_SCALP",                label:"Scalp block" },
        { v:"BLOCK_TRIGEMINAL",           label:"Trigeminal nerve" },
      ]},
      { v:"BLOCK_OPHTHALMIC", label:"Ophthalmic", children:[
        { v:"BLOCK_PERIBULBAR",   label:"Peribulbar" },
        { v:"BLOCK_RETROBULBAR",  label:"Retrobulbar" },
        { v:"BLOCK_SUB_TENONS",   label:"Sub-Tenon's" },
        { v:"BLOCK_TOPICAL_EYE",  label:"Topical (eye)" },
      ]},
    ]},
  ]},
  { v:"SEDATION", label:"Sedation / MAC", children:[
    { v:"SEDATION_CONSCIOUS", label:"Conscious sedation" },
    { v:"SEDATION_DEEP",      label:"Deep sedation" },
    { v:"SEDATION_MAC",       label:"MAC" },
  ]},
  { v:"LOCAL",  label:"Local infiltration" },
  { v:"OTHER",  label:"Other…", isOther:true },
]

function techniqueColor(v: string): string {
  if (v.startsWith("GENERAL"))  return "#8b5cf6"
  if (v.startsWith("SPINAL") || v.startsWith("EPIDURAL") || v.startsWith("CSE") || v === "DPE") return "#3b82f6"
  if (v.startsWith("BLOCK"))    return "#22c55e"
  if (v.startsWith("SEDATION")) return "#f59e0b"
  if (v === "LOCAL")            return "#f43f5e"
  return "#64748b"
}

// Grouping nodes that add no clinical value in a compact pill label
const TECH_SKIP_LABELS = new Set([
  "Peripheral nerve block", "Upper extremity", "Lower extremity",
  "Trunk / Abdominal wall", "Head & Neck", "Ophthalmic", "Single shot",
])
const TECH_ROOT_SHORT: Record<string, string> = {
  "General anaesthesia": "General",
  "Regional anaesthesia": "Regional",
  "Sedation / MAC": "Sedation",
  "Local infiltration": "Local infiltration",
}

function techPath(v: string, nodes: TechniqueNode[] = TECHNIQUE_TREE, trail: string[] = []): string[] | undefined {
  for (const n of nodes) {
    const next = [...trail, n.label]
    if (n.v === v) return next
    if (n.children) { const f = techPath(v, n.children, next); if (f) return f }
  }
}

// Category-aware label: e.g. "General Inhalational", "Regional Femoral nerve",
// "Regional Neuraxial Epidural Lumbar". Mirrors the web display.
function techniqueLabel(v: string): string {
  if (v.startsWith("OTHER:")) return v.slice(6)
  const path = techPath(v)
  if (!path || path.length === 0) return v
  const parts = path
    .map((label, i) => (i === 0 ? (TECH_ROOT_SHORT[label] ?? label) : label))
    .filter(label => !TECH_SKIP_LABELS.has(label))
    .map(label => label.replace(" (SAB)", ""))
  // Drop consecutive duplicates
  const out: string[] = []
  for (const p of parts) if (out[out.length - 1] !== p) out.push(p)
  return out.join(" ")
}

function findTechNode(v: string, nodes: TechniqueNode[] = TECHNIQUE_TREE): TechniqueNode | undefined {
  for (const n of nodes) {
    if (n.v === v) return n
    if (n.children) { const f = findTechNode(v, n.children); if (f) return f }
  }
}

const TECHNIQUE_FAVORITES: Record<string, string[]> = {
  "GENERAL_INHALATION": ["Propofol","Fentanyl","Rocuronium","Sugammadex","Ondansetron"],
  "GENERAL_TIVA":       ["Propofol","Remifentanil","Fentanyl","Sugammadex"],
  "GENERAL_COMBINED":   ["Propofol","Fentanyl","Rocuronium","Sugammadex"],
  "SPINAL_SINGLE_LUMBAR":       ["Bupivacaine","Fentanyl","Ephedrine","Ondansetron"],
  "SPINAL_SINGLE_LOW_THORACIC": ["Bupivacaine","Fentanyl","Ephedrine","Ondansetron"],
  "EPIDURAL_LUMBAR":    ["Bupivacaine","Ropivacaine","Fentanyl","Ephedrine"],
  "CSE_LUMBAR":         ["Bupivacaine","Fentanyl","Ephedrine"],
  "SEDATION_CONSCIOUS": ["Midazolam","Propofol","Fentanyl","Ketamine"],
  "SEDATION_MAC":       ["Propofol","Ketamine","Midazolam"],
}

const AIRWAY_TOOLS = [
  { code:"VIDEO_LARY",  label:"Video laryngoscopy" },
  { code:"DIRECT_LARY", label:"Direct laryngoscopy" },
  { code:"FOB",         label:"Fibreoptic scope" },
  { code:"BOUGIE",      label:"Bougie" },
  { code:"STYLET",      label:"Stylet" },
  { code:"AWAKE",       label:"Awake intubation" },
]

const CL_GRADES = [
  { code:"I",   color:"#22c55e" },
  { code:"IIa", color:"#84cc16" },
  { code:"IIb", color:"#eab308" },
  { code:"III", color:"#f97316" },
  { code:"IV",  color:"#ef4444" },
]

const AIRWAY_DEVICES = [
  { code:"FACE_MASK",          label:"Face Mask"          },
  { code:"OPA",                label:"Oral airway"        },
  { code:"NPA",                label:"Nasal airway"       },
  { code:"LMA",                label:"LMA"                },
  { code:"ORAL_ETT",           label:"Oral ETT"           },
  { code:"NASAL_ETT",          label:"Nasal ETT"          },
  { code:"DOUBLE_LUMEN_TUBE",  label:"Double Lumen Tube"  },
  { code:"ENDOBRONCHIAL_TUBE", label:"Endobronchial Tube" },
  { code:"SURGICAL_AIRWAY",    label:"Surgical Airway"    },
]
const AIRWAY_HAS_SUBOPTIONS = ["LMA","ORAL_ETT","NASAL_ETT","DOUBLE_LUMEN_TUBE","ENDOBRONCHIAL_TUBE"]

const VENT_ASSISTED = [
  { v: "A/C",      label: "Assist/Control (A/C)" },
  { v: "PSV",      label: "Pressure Support (PSV)" },
  { v: "BiPAP",    label: "BiPAP" },
  { v: "CPAP",     label: "CPAP" },
  { v: "SIMV+PSV", label: "SIMV + PSV" },
  { v: "PAV",      label: "Proportional Assist (PAV)" },
]
const VENT_CONTROLLED = [
  { v: "VCV",  label: "Volume Control (VCV)" },
  { v: "PCV",  label: "Pressure Control (PCV)" },
  { v: "PRVC", label: "PRVC / VCRP" },
  { v: "APRV", label: "APRV / BiLevel" },
  { v: "HFOV", label: "HFOV" },
  { v: "VG",   label: "Volume Guarantee (VG)" },
]

type VascularEntry = { id: string; site: string; siteLabel: string; size: string; sizeUnit: string; depthCm: string; lumens?: string; preexisting?: boolean }

type VascTreeNode = { v: string; label: string; children?: VascTreeNode[] }
const VASC_TREE: VascTreeNode[] = [
  {
    v: "ARTERIAL", label: "Arterial",
    children: [
      { v:"ART_RADIAL",   label:"Radial"    },
      { v:"ART_ULNAR",    label:"Ulnar"     },
      { v:"ART_BRACHIAL", label:"Brachial"  },
      { v:"ART_AXILLARY", label:"Axillary"  },
      { v:"ART_CAROTID",  label:"Carotid"   },
      { v:"ART_FEMORAL",  label:"Femoral"   },
    ],
  },
  {
    v: "VENOUS", label: "Venous",
    children: [
      { v:"VEN_PERIPHERAL", label:"Peripheral IV" },
      {
        v:"VEN_CENTRAL", label:"Central",
        children: [
          { v:"PICC", label:"PICC", children:[
            { v:"PICC_BRACHIAL", label:"Brachial" },
            { v:"PICC_BASILIC",  label:"Basilic"  },
            { v:"PICC_CEPHALIC", label:"Cephalic" },
          ]},
          { v:"CVK", label:"Central line", children:[
            { v:"CVK_AXILLARY",   label:"Axillary"          },
            { v:"CVK_IJV",        label:"Internal jugular"   },
            { v:"CVK_EJV",        label:"External jugular"   },
            { v:"CVK_SUBCLAVIAN", label:"Subclavian"         },
            { v:"CVK_FEMORAL",    label:"Femoral"            },
          ]},
        ],
      },
    ],
  },
]

function vascDefaultUnit(site: string) {
  return site.startsWith("ART_") || site === "VEN_PERIPHERAL" ? "G" : "Fr"
}

function vascSiteColor(site: string): string {
  if (site.startsWith("ART_")) return "#ef4444"
  if (site === "VEN_PERIPHERAL") return "#22c55e"
  if (site.startsWith("PICC_")) return "#a855f7"
  return "#3b82f6"
}

const VASC_PREEXISTING_QUICK = [
  { v:"VEN_PERIPHERAL", label:"Peripheral IV",    crumb:"Venous › Peripheral IV" },
  { v:"CVK_IJV",        label:"CVC (IJV)",         crumb:"Venous › Central › Central line › Internal jugular" },
  { v:"CVK_SUBCLAVIAN", label:"CVC (Subclavian)",  crumb:"Venous › Central › Central line › Subclavian" },
  { v:"ART_RADIAL",     label:"Art line (Radial)", crumb:"Arterial › Radial" },
]

const DEPTH_PRESETS = ["4","6","8","10","12","14","16","18","20"]

type PremDrug = { name: string; dose: number; unit: string; min: number; max: number; step: number; routes: string[]; defaultRoute: string; hint: string }
const PREMED_LIBRARY: { category: string; drugs: PremDrug[] }[] = [
  { category:"Anxiolytics", drugs:[
    { name:"Midazolam",   dose:7.5,  unit:"mg",  min:2.5,  max:15,   step:2.5,  routes:["PO","IM","IV","Intranasal"], defaultRoute:"PO", hint:"2.5–15 mg PO" },
    { name:"Diazepam",    dose:5,    unit:"mg",  min:2,    max:20,   step:1,    routes:["PO","IV","IM"],              defaultRoute:"PO", hint:"2–10 mg PO" },
    { name:"Lorazepam",   dose:1,    unit:"mg",  min:0.5,  max:4,    step:0.5,  routes:["PO","IM","IV"],              defaultRoute:"PO", hint:"0.5–2 mg PO" },
    { name:"Temazepam",   dose:10,   unit:"mg",  min:5,    max:30,   step:5,    routes:["PO"],                        defaultRoute:"PO", hint:"10–30 mg PO" },
    { name:"Oxazepam",    dose:10,   unit:"mg",  min:10,   max:30,   step:10,   routes:["PO"],                        defaultRoute:"PO", hint:"10–30 mg PO" },
    { name:"Alprazolam",  dose:0.25, unit:"mg",  min:0.25, max:1,    step:0.25, routes:["PO"],                        defaultRoute:"PO", hint:"0.25–1 mg PO" },
  ]},
  { category:"Analgesics", drugs:[
    { name:"Paracetamol", dose:1000, unit:"mg",  min:500,  max:1000, step:250,  routes:["PO","IV","PR"],              defaultRoute:"PO", hint:"500 mg–1 g PO" },
    { name:"Ibuprofen",   dose:400,  unit:"mg",  min:200,  max:800,  step:200,  routes:["PO"],                        defaultRoute:"PO", hint:"400 mg PO" },
    { name:"Celecoxib",   dose:200,  unit:"mg",  min:100,  max:400,  step:100,  routes:["PO"],                        defaultRoute:"PO", hint:"200 mg PO" },
    { name:"Gabapentin",  dose:300,  unit:"mg",  min:100,  max:1200, step:100,  routes:["PO"],                        defaultRoute:"PO", hint:"100–1200 mg PO" },
    { name:"Pregabalin",  dose:75,   unit:"mg",  min:25,   max:300,  step:25,   routes:["PO"],                        defaultRoute:"PO", hint:"25–300 mg PO" },
    { name:"Tramadol",    dose:50,   unit:"mg",  min:50,   max:100,  step:50,   routes:["PO","IM","IV"],              defaultRoute:"PO", hint:"50–100 mg PO" },
    { name:"Codeine",     dose:30,   unit:"mg",  min:15,   max:60,   step:15,   routes:["PO"],                        defaultRoute:"PO", hint:"15–60 mg PO" },
    { name:"Etoricoxib",  dose:90,   unit:"mg",  min:60,   max:120,  step:30,   routes:["PO"],                        defaultRoute:"PO", hint:"60–120 mg PO" },
  ]},
  { category:"Antiemetics", drugs:[
    { name:"Ondansetron",    dose:4,  unit:"mg", min:4,    max:8,    step:4,    routes:["PO","IM","IV"],              defaultRoute:"PO", hint:"4 mg PO" },
    { name:"Metoclopramide", dose:10, unit:"mg", min:5,    max:20,   step:5,    routes:["PO","IM","IV"],              defaultRoute:"PO", hint:"10 mg PO" },
    { name:"Dexamethasone",  dose:8,  unit:"mg", min:4,    max:16,   step:4,    routes:["PO","IV","IM"],              defaultRoute:"PO", hint:"8 mg PO" },
    { name:"Domperidone",    dose:10, unit:"mg", min:10,   max:20,   step:10,   routes:["PO"],                        defaultRoute:"PO", hint:"10 mg PO" },
    { name:"Promethazine",   dose:25, unit:"mg", min:12.5, max:50,   step:12.5, routes:["PO","IM","IV"],              defaultRoute:"PO", hint:"25 mg PO" },
  ]},
  { category:"Antacids / GI", drugs:[
    { name:"Omeprazole",    dose:20,  unit:"mg", min:20,   max:40,   step:20,   routes:["PO","IV"],                   defaultRoute:"PO", hint:"20 mg PO" },
    { name:"Pantoprazole",  dose:40,  unit:"mg", min:20,   max:80,   step:20,   routes:["PO","IV"],                   defaultRoute:"PO", hint:"40 mg PO" },
    { name:"Esomeprazole",  dose:20,  unit:"mg", min:20,   max:40,   step:20,   routes:["PO","IV"],                   defaultRoute:"PO", hint:"20 mg PO" },
    { name:"Lansoprazole",  dose:30,  unit:"mg", min:15,   max:30,   step:15,   routes:["PO"],                        defaultRoute:"PO", hint:"30 mg PO" },
    { name:"Ranitidine",    dose:150, unit:"mg", min:75,   max:300,  step:75,   routes:["PO","IV","IM"],              defaultRoute:"PO", hint:"150 mg PO" },
    { name:"Sodium citrate",dose:30,  unit:"mL", min:15,   max:30,   step:5,    routes:["PO"],                        defaultRoute:"PO", hint:"30 mL PO" },
  ]},
  { category:"Anticholinergics", drugs:[
    { name:"Atropine",      dose:0.6, unit:"mg",    min:0.3, max:1.2, step:0.3,  routes:["SC","IM","IV"],              defaultRoute:"SC", hint:"0.6 mg SC" },
    { name:"Glycopyrrolate",dose:0.2, unit:"mg",    min:0.1, max:0.4, step:0.1,  routes:["IM","IV","SC"],              defaultRoute:"IM", hint:"0.2 mg IM" },
    { name:"Hyoscine",      dose:0.3, unit:"mg",    min:0.2, max:0.6, step:0.1,  routes:["SC","IM"],                   defaultRoute:"SC", hint:"0.3 mg SC" },
    { name:"Scopolamine",   dose:1,   unit:"patch", min:1,   max:2,   step:1,    routes:["Transdermal"],               defaultRoute:"Transdermal", hint:"1 patch" },
  ]},
  { category:"Beta-blockers", drugs:[
    { name:"Atenolol",   dose:50,   unit:"mg", min:25,    max:100,  step:25,   routes:["PO"],           defaultRoute:"PO", hint:"50 mg PO" },
    { name:"Metoprolol", dose:50,   unit:"mg", min:25,    max:100,  step:25,   routes:["PO","IV"],      defaultRoute:"PO", hint:"50 mg PO" },
    { name:"Bisoprolol", dose:5,    unit:"mg", min:2.5,   max:10,   step:2.5,  routes:["PO"],           defaultRoute:"PO", hint:"5 mg PO" },
    { name:"Carvedilol", dose:6.25, unit:"mg", min:3.125, max:25,   step:3.125,routes:["PO"],           defaultRoute:"PO", hint:"6.25 mg PO" },
    { name:"Labetalol",  dose:100,  unit:"mg", min:50,    max:200,  step:50,   routes:["PO","IV"],      defaultRoute:"PO", hint:"100 mg PO" },
  ]},
  { category:"Antihistamines", drugs:[
    { name:"Hydroxyzine",    dose:25,  unit:"mg", min:25,  max:100, step:25,  routes:["PO","IM"],  defaultRoute:"PO", hint:"25 mg PO" },
    { name:"Diphenhydramine",dose:25,  unit:"mg", min:25,  max:50,  step:25,  routes:["PO","IV","IM"], defaultRoute:"PO", hint:"25 mg PO" },
    { name:"Cetirizine",     dose:10,  unit:"mg", min:5,   max:20,  step:5,   routes:["PO"],       defaultRoute:"PO", hint:"10 mg PO" },
    { name:"Loratadine",     dose:10,  unit:"mg", min:10,  max:20,  step:10,  routes:["PO"],       defaultRoute:"PO", hint:"10 mg PO" },
    { name:"Promethazine",   dose:25,  unit:"mg", min:12.5,max:50,  step:12.5,routes:["PO","IM","IV"], defaultRoute:"PO", hint:"25 mg PO" },
  ]},
  { category:"Opioids", drugs:[
    { name:"Morphine",      dose:5,   unit:"mg",  min:2.5, max:15,  step:2.5,  routes:["SC","IM","IV","PO"],          defaultRoute:"SC", hint:"5 mg SC" },
    { name:"Oxycodone",     dose:5,   unit:"mg",  min:5,   max:10,  step:5,    routes:["PO"],                         defaultRoute:"PO", hint:"5 mg PO" },
    { name:"Tramadol",      dose:50,  unit:"mg",  min:50,  max:100, step:50,   routes:["PO","IM","IV"],               defaultRoute:"PO", hint:"50 mg PO" },
    { name:"Pethidine",     dose:50,  unit:"mg",  min:25,  max:100, step:25,   routes:["IM","SC","IV"],               defaultRoute:"IM", hint:"50 mg IM" },
    { name:"Buprenorphine", dose:0.3, unit:"mg",  min:0.1, max:0.6, step:0.1,  routes:["IM","SC","IV","SL","Transdermal"], defaultRoute:"IM", hint:"0.3 mg IM" },
    { name:"Fentanyl",      dose:50,  unit:"mcg", min:25,  max:200, step:25,   routes:["IV","IM","Intranasal","Buccal","Transdermal"], defaultRoute:"IV", hint:"50 mcg IV" },
  ]},
  { category:"Other", drugs:[
    { name:"Clonidine",     dose:0.1, unit:"mg",    min:0.05, max:0.3,  step:0.05, routes:["PO","Transdermal"],       defaultRoute:"PO", hint:"0.1 mg PO" },
    { name:"Aspirin",       dose:75,  unit:"mg",    min:75,   max:300,  step:75,   routes:["PO"],                     defaultRoute:"PO", hint:"75–300 mg PO" },
    { name:"Clopidogrel",   dose:75,  unit:"mg",    min:75,   max:75,   step:75,   routes:["PO"],                     defaultRoute:"PO", hint:"75 mg PO" },
    { name:"Warfarin",      dose:5,   unit:"mg",    min:1,    max:10,   step:0.5,  routes:["PO"],                     defaultRoute:"PO", hint:"As prescribed" },
    { name:"Ketamine",      dose:1,   unit:"mg/kg", min:0.5,  max:2,    step:0.5,  routes:["PO","IV","IM"],           defaultRoute:"PO", hint:"1 mg/kg PO" },
    { name:"Insulin",       dose:10,  unit:"units", min:2,    max:50,   step:2,    routes:["SC","IV"],                defaultRoute:"SC", hint:"As prescribed" },
    { name:"Levothyroxine", dose:50,  unit:"mcg",   min:25,   max:200,  step:25,   routes:["PO"],                     defaultRoute:"PO", hint:"As prescribed" },
  ]},
]

// ─── Equipment Calculator ─────────────────────────────────────────────────────

interface EquipItem { label: string; value: string; note?: string }
interface EquipCat  { cat: string; color: string; items: EquipItem[] }

function calcEquipment(age?: number, weight?: number, height?: number, sex?: string): EquipCat[] {
  const isNeonate = age != null && age < 1/12
  const isInfant  = age != null && age < 1
  const isPed     = age != null && age < 18
  const w  = weight ?? (isPed ? 20 : 70)
  const a  = age ?? 35
  const isFemale  = sex === "FEMALE" || sex === "F"
  const bmi       = (weight && height) ? weight / ((height / 100) ** 2) : null

  function ibw(): number | null {
    if (!height) return null
    return Math.max((isFemale ? 45.5 : 50) + 0.906 * (height - 152.4), 0)
  }
  const ibwKg = isPed ? null : ibw()

  function ettResult(): { size: string; cuffed: boolean; depth: string } {
    if (isNeonate) {
      const sz = w < 1 ? 2.5 : w < 2.5 ? 3.0 : 3.5
      return { size: `${sz}`, cuffed: false, depth: `${Math.round(10 + w)}` }
    }
    if (isInfant) return { size: "3.5–4.0", cuffed: false, depth: "12" }
    if (isPed) {
      const uncuffed = Math.round((a / 4 + 4) * 2) / 2
      const cuffed   = Math.round((a / 4 + 3.5) * 2) / 2
      return { size: `${cuffed} cuffed / ${uncuffed} uncuffed`, cuffed: true, depth: `${Math.round(a / 2 + 12)}` }
    }
    const sz    = isFemale ? 7.5 : 8.0
    const depth = height ? Math.round(height / 10 + (isFemale ? 1 : 2)) : sz * 3
    return { size: `${sz}`, cuffed: true, depth: `${depth}` }
  }

  function lmaSize(): string {
    if (w < 5)   return "1"
    if (w < 10)  return "1.5"
    if (w < 20)  return "2"
    if (w < 30)  return "2.5"
    if (w < 50)  return "3"
    if (w < 70)  return "4"
    if (w < 100) return "5"
    return "6"
  }

  function guedel(): string {
    if (w < 3)  return "00"
    if (w < 5)  return "0"
    if (w < 10) return "1"
    if (w < 20) return "2"
    if (w < 35) return "3"
    if (w < 60) return "4"
    if (w < 90) return "5"
    return "6"
  }

  function laryngoscope(): string {
    if (isNeonate)                          return "Miller 0"
    if (isInfant)                           return "Miller 1"
    if (isPed && a < 8)                     return "Miller 2 / Mac 2"
    if (isPed)                              return "Mac 2 / Mac 3"
    if (isFemale || w < 60)                 return "Mac 3"
    if (w > 100 || (height && height > 185)) return "Mac 4"
    return "Mac 3"
  }

  const ett = ettResult()

  function suctionFr(): string {
    const sz = parseFloat(ett.size.split("/")[0].trim())
    if (sz <= 3.5) return "6 Fr"
    if (sz <= 4.5) return "8 Fr"
    if (sz <= 5.5) return "10 Fr"
    if (sz <= 7.0) return "12 Fr"
    return "14 Fr"
  }

  function tidalVolume(): string {
    const ref = ibwKg ?? w
    return `${Math.round(ref * 6)}–${Math.round(ref * 8)} mL`
  }

  function respRate(): string {
    if (isNeonate)      return "40–60 /min"
    if (isInfant)       return "30–40 /min"
    if (isPed && a < 3) return "24–30 /min"
    if (isPed && a < 8) return "18–24 /min"
    if (isPed)          return "14–18 /min"
    return "10–16 /min"
  }

  function peep(): string {
    if (bmi && bmi >= 30) return "8–10 cmH₂O"
    return "5 cmH₂O"
  }

  function maintenance(): string {
    const rate = w <= 10 ? w * 4 : w <= 20 ? 40 + (w - 10) * 2 : 60 + (w - 20)
    return `${Math.round(rate)} mL/hr`
  }

  function urinaryCath(): string {
    if (isNeonate)       return "5–6 Fr"
    if (isInfant)        return "6–8 Fr"
    if (isPed && a < 5)  return "8 Fr"
    if (isPed && a < 10) return "8–10 Fr"
    if (isPed)           return "10–12 Fr"
    if (isFemale)        return "12–14 Fr"
    return "14–16 Fr"
  }

  function ngt(): string {
    if (isNeonate)       return "5 Fr"
    if (isInfant)        return "8 Fr"
    if (isPed && a < 3)  return "8–10 Fr"
    if (isPed && a < 10) return "10 Fr"
    if (isPed)           return "12 Fr"
    if (isFemale)        return "14 Fr"
    return "16 Fr"
  }

  function ngtDepth(): string {
    if (!height) return ""
    if (isPed)   return `${Math.round(a * 2.5 + 15)} cm`
    return `${Math.round(50 + (height - 160) * 0.25)} cm`
  }

  function bpCuff(): string {
    if (isNeonate)             return "Neonatal (2.5–4 cm)"
    if (isInfant)              return "Infant (4–6 cm)"
    if (isPed && a < 6)        return "Child (6–9 cm)"
    if (isPed)                 return "Child / Small adult"
    if (bmi && bmi >= 40)      return "Large adult / Thigh cuff"
    if (bmi && bmi >= 30)      return "Large adult (15–20 cm)"
    return "Adult (12–15 cm)"
  }

  function defibPads(): string {
    if (w < 10) return "Paediatric (4.5 cm), 4 J/kg"
    if (w < 25) return "Paediatric or adult (manufacturer-specific)"
    return "Adult pads"
  }

  const ngtD = ngtDepth()

  return [
    {
      cat: "Airway", color: "#3b82f6",
      items: [
        { label: "ETT size",         value: ett.size,         note: ett.cuffed ? "cuffed" : "uncuffed" },
        { label: "ETT depth (lip)",  value: `${ett.depth} cm` },
        { label: "LMA size",         value: lmaSize() },
        { label: "Laryngoscope",     value: laryngoscope() },
        { label: "Guedel OPA",       value: `Size ${guedel()}` },
        { label: "Suction catheter", value: suctionFr() },
      ],
    },
    {
      cat: "Ventilation", color: "#14b8a6",
      items: [
        { label: "Tidal volume", value: tidalVolume(), note: "6–8 mL/kg IBW" },
        { label: "Rate",         value: respRate() },
        { label: "PEEP",         value: peep() },
        { label: "I:E ratio",    value: "1:2" },
      ],
    },
    {
      cat: "Fluids", color: "#0ea5e9",
      items: [
        { label: "Maintenance", value: maintenance(), note: "4-2-1 rule" },
      ],
    },
    {
      cat: "Catheters", color: "#f59e0b",
      items: [
        { label: "Urinary catheter", value: urinaryCath() },
        { label: "NGT",              value: ngt(), note: ngtD ? `~${ngtD} insertion depth` : undefined },
      ],
    },
    {
      cat: "Monitoring", color: "#22c55e",
      items: [
        { label: "BP cuff",       value: bpCuff() },
        { label: "Defibrillator", value: defibPads() },
      ],
    },
  ]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9) }

function drugColor(name: string): string {
  for (const cat of DRUG_CATS) {
    if ((cat.drugs as readonly { name: string; unit: string }[]).some(d => d.name === name)) return cat.color
  }
  return "#64748b"
}

function formatTs(ts: string): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
}

function fmtElapsed(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function trendArrow(cur?: number, prev?: number): string {
  if (cur == null || prev == null || Math.abs(cur - prev) < 5) return ""
  return cur > prev ? " ↑" : " ↓"
}

function eventLabel(ev: LogEvent, prevVital?: LogEvent): { text: string; color: string; sub?: string } {
  switch (ev.type) {
    case "drug":
      return { text: `${ev.name} ${ev.dose} ${ev.unit}`, color: ev.color ?? drugColor(ev.name ?? ""), sub: ev.category }
    case "vital": {
      const parts: string[] = []
      if (ev.systolic != null && ev.diastolic != null)
        parts.push(`BP ${ev.systolic}${trendArrow(ev.systolic, prevVital?.systolic)}/${ev.diastolic}`)
      if (ev.heartRate != null) parts.push(`HR ${ev.heartRate}${trendArrow(ev.heartRate, prevVital?.heartRate)}`)
      if (ev.spO2     != null) parts.push(`SpO₂ ${ev.spO2}%${trendArrow(ev.spO2, prevVital?.spO2)}`)
      if (ev.etco2    != null) parts.push(`EtCO₂ ${ev.etco2}${trendArrow(ev.etco2, prevVital?.etco2)}`)
      if (ev.temp     != null) parts.push(`${ev.temp}°C`)
      if (ev.bgl      != null) parts.push(`BGL ${ev.bgl}`)
      return { text: parts.join("  "), color: "#22c55e" }
    }
    case "clinical_event":
      return { text: ev.label ?? "", color: clinicalEventColor(ev.label?.split(" (")[0] ?? "") }
    case "infusion_start":
      return { text: `${ev.name} ${ev.rate} ${ev.unit}`, color: ev.color ?? "#6366f1", sub: "Infusion started" }
    case "infusion_rate":
      return { text: `${ev.name} → ${ev.rate} ${ev.unit}`, color: ev.color ?? "#6366f1", sub: "Rate changed" }
    case "infusion_stop":
      return { text: `${ev.name} stopped`, color: "#64748b", sub: "Infusion" }
    case "fluid_start":
      return { text: `${ev.name} ${ev.volume} mL`, color: ev.color ?? "#06b6d4", sub: "Fluid" }
    case "fluid_end":
      return { text: `${ev.name} complete`, color: "#64748b", sub: "Fluid" }
    case "agent_start":
      return { text: `${ev.name} on`, color: ev.color ?? "#a855f7", sub: "Volatile" }
    case "agent_stop":
      return { text: `${ev.name} off`, color: "#64748b", sub: "Volatile" }
    default:
      return { text: "Event", color: "#64748b" }
  }
}

// ─── Events → timetable projection ───────────────────────────────────────────

function eventsToTimetable(log: LogEvent[], startTs: Date, now?: Date): TimetableData {
  function tsToCol(ts: string): number {
    const ms = new Date(ts).getTime() - startTs.getTime()
    return Math.max(0, Math.floor(ms / (5 * 60_000)))
  }
  const nowCol = now ? Math.floor((now.getTime() - startTs.getTime()) / (5 * 60_000)) : 0

  const vitals: VitalsEntry[] = []
  const drugs: { colIdx: number; name: string; dose: string; unit: string }[] = []
  const infusions: any[] = []
  const fluids: any[] = []
  const agents: any[] = []

  // log is newest-first; process oldest-first for state reconstruction
  const chrono = [...log].reverse()

  const activeInfMap: Record<string, { startCol: number; ev: LogEvent; initialRate: string; rateChanges: { col: number; rate: string; unit: string }[] }> = {}
  const activeFluidMap: Record<string, { startCol: number; ev: LogEvent }> = {}
  let agentStart: { name: string; color: string; col: number } | null = null
  let maxCol = 0

  for (const ev of chrono) {
    const col = tsToCol(ev.ts)
    if (col > maxCol) maxCol = col

    if (ev.type === "vital") {
      while (vitals.length <= col) vitals.push({})
      vitals[col] = {
        systolic: ev.systolic, diastolic: ev.diastolic,
        heartRate: ev.heartRate, spO2: ev.spO2, etco2: ev.etco2, temp: ev.temp, bgl: ev.bgl,
      }
    } else if (ev.type === "drug") {
      drugs.push({ colIdx: col, name: ev.name!, dose: ev.dose!, unit: ev.unit! })
    } else if (ev.type === "infusion_start") {
      activeInfMap[ev.infId!] = { startCol: col, ev, initialRate: ev.rate!, rateChanges: [] }
    } else if (ev.type === "infusion_rate" && activeInfMap[ev.infId!]) {
      const entry = activeInfMap[ev.infId!]
      entry.rateChanges = [...(entry.rateChanges ?? []), { col, rate: ev.rate!, unit: ev.unit ?? entry.ev.unit! }]
      // Update ev.rate so it reflects the current running rate for display, but
      // initialRate is preserved so BarRow can show the correct rate for the first segment
      entry.ev = { ...entry.ev, rate: ev.rate }
    } else if (ev.type === "infusion_stop") {
      const entry = activeInfMap[ev.infId!]
      if (entry) {
        const rateChanges = entry.rateChanges?.length ? entry.rateChanges : undefined
        // Use initialRate (not entry.ev.rate which is the final rate) so BarRow
        // correctly shows the original rate for cells before the first rateChange
        infusions.push({ id: ev.infId!, name: entry.ev.name!, rate: entry.initialRate, unit: entry.ev.unit!, color: entry.ev.color!, startCol: entry.startCol, endCol: col, rateChanges })
        delete activeInfMap[ev.infId!]
      }
    } else if (ev.type === "fluid_start") {
      activeFluidMap[ev.fluidId!] = { startCol: col, ev }
    } else if (ev.type === "fluid_end") {
      const entry = activeFluidMap[ev.fluidId!]
      if (entry) {
        fluids.push({ id: ev.fluidId!, name: entry.ev.name!, category: "", volume: entry.ev.volume!, color: entry.ev.color!, startCol: entry.startCol, endCol: col })
        delete activeFluidMap[ev.fluidId!]
      }
    } else if (ev.type === "agent_start") {
      if (agentStart && agentStart.name !== ev.name) {
        agents.push({ name: agentStart.name, color: agentStart.color, startCol: agentStart.col, endCol: col })
      }
      agentStart = { name: ev.name!, color: ev.color!, col }
    } else if (ev.type === "agent_stop" && agentStart) {
      agents.push({ name: agentStart.name, color: agentStart.color, startCol: agentStart.col, endCol: col })
      agentStart = null
    }
  }

  // Open-end bars track the now-marker: extend 1 column past current time (not 12)
  const openEnd = Math.max(maxCol, nowCol) + 1
  for (const [infId, { startCol, ev, initialRate, rateChanges }] of Object.entries(activeInfMap)) {
    const rc = rateChanges?.length ? rateChanges : undefined
    infusions.push({ id: infId, name: ev.name!, rate: initialRate, unit: ev.unit!, color: ev.color!, startCol, endCol: openEnd, rateChanges: rc })
  }
  for (const [fluidId, { startCol, ev }] of Object.entries(activeFluidMap)) {
    fluids.push({ id: fluidId, name: ev.name!, category: "", volume: ev.volume!, color: ev.color!, startCol, endCol: openEnd })
  }
  if (agentStart) {
    agents.push({ name: agentStart.name, color: agentStart.color, startCol: agentStart.col, endCol: openEnd })
  }

  return { vitals, drugs, infusions, fluids, agents }
}

function eventCol(ev: LogEvent, startTs: Date): number {
  const ms = new Date(ev.ts).getTime() - startTs.getTime()
  return Math.max(0, Math.floor(ms / (5 * 60_000)))
}

function timeAtCol(startTs: Date, col: number): Date {
  return new Date(startTs.getTime() + col * 5 * 60_000)
}

function formatDateHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
}

function roundDown5Min(d: Date): Date {
  const m = new Date(d)
  m.setSeconds(0, 0)
  m.setMinutes(Math.floor(m.getMinutes() / 5) * 5)
  return m
}

function pendingKey(caseId: string) {
  return `lospor_pending_intraop_${caseId}`
}

function eventForServer(ev: LogEvent): LogEvent {
  const { syncStatus, ...clean } = ev
  return clean
}

async function loadPendingEvents(caseId: string): Promise<LogEvent[]> {
  const raw = await SecureStore.getItemAsync(pendingKey(caseId))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function storePendingEvents(caseId: string, events: LogEvent[]) {
  if (events.length === 0) {
    await SecureStore.deleteItemAsync(pendingKey(caseId))
    return
  }
  await SecureStore.setItemAsync(pendingKey(caseId), JSON.stringify(events))
}

function mergeLogWithPending(serverLog: LogEvent[], pending: LogEvent[]): LogEvent[] {
  const seen = new Set<string>()
  return [...pending, ...serverLog]
    .filter(ev => {
      if (seen.has(ev.id)) return false
      seen.add(ev.id)
      return true
    })
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
}

// ─── Sheet ────────────────────────────────────────────────────────────────────

function Sheet({ visible, onClose, title, children, full }: {
  visible: boolean; onClose: () => void; title: string
  children: React.ReactNode; full?: boolean
}) {
  const { width: screenWidth } = useWindowDimensions()
  // Cap width at 430 on wide screens; on phones this is just screenWidth.
  const sheetWidth = Math.min(screenWidth, 430)
  // On web, alignSelf:"center" positions relative to the layout parent width, which can be
  // wider than the viewport if a horizontal FlatList has expanded the document. Use explicit
  // marginLeft instead — it's always relative to the element's own layout container.
  // On native the standard alignSelf:"center" works correctly.
  const sheetMarginLeft = Platform.OS === "web" && sheetWidth < screenWidth
    ? (screenWidth - sheetWidth) / 2
    : 0
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex:1 }}>
        <Pressable style={{ flex:1, backgroundColor:"rgba(0,0,0,0.65)" }} onPress={onClose} />
        <View style={{
          backgroundColor:"#1c1c1c", borderTopLeftRadius:22, borderTopRightRadius:22,
          padding:20, paddingBottom:44, maxHeight: full ? "92%" : "72%",
          width: sheetWidth,
          ...(Platform.OS === "web" ? { marginLeft: sheetMarginLeft } : { alignSelf: "center" }),
        }}>
          <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
            <Text style={{ color:"#f8fafc", fontSize:16, fontWeight:"700" }}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
              <Text style={{ color:"#94a3b8", fontSize:20 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function ActionTile({
  label, sub, color, onPress, flex = 1, compact = false, outline = false,
}: {
  label: string
  sub?: string
  color: string
  onPress: () => void
  flex?: number
  compact?: boolean
  outline?: boolean
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={{
        flex,
        minHeight: compact ? 52 : 70,
        borderRadius: compact ? 14 : 18,
        borderCurve: "continuous",
        paddingVertical: compact ? 11 : 14,
        paddingHorizontal: compact ? 10 : 12,
        justifyContent: "center",
        backgroundColor: outline ? "#151515" : color + "24",
        borderWidth: 1,
        borderColor: color + "88",
        boxShadow: outline ? "0 0 0 rgba(0,0,0,0)" : `0 10px 24px ${color}22`,
      }}
    >
      <View style={{ flexDirection:"row", alignItems:"center", gap:8 }}>
        <View style={{
          width: compact ? 5 : 7,
          height: compact ? 30 : 38,
          borderRadius: 999,
          backgroundColor: color,
        }} />
        <View style={{ flex:1 }}>
          <Text style={{ color:"#f8fafc", fontWeight:"800", fontSize:compact ? 13 : 16 }} numberOfLines={1}>
            {label}
          </Text>
          {!!sub && (
            <Text style={{ color:color, fontSize:compact ? 10 : 11, fontWeight:"700", marginTop:2 }} numberOfLines={1}>
              {sub}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function IntraopLiveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router  = useRouter()
  const { isWatching, takeover } = useCaseLock(id, true)
  const { tc } = usePreferences()

  const [caseInfo, setCaseInfo] = useState<{
    caseCode: string; procedure?: string; diagnosis?: string; techniques?: string[]
    status?: string; finalizedAt?: string | null
  } | null>(null)

  const [log,             setLog]             = useState<LogEvent[]>([])
  const logRef = useRef<LogEvent[]>([])
  const [activeInfusions, setActiveInfusions] = useState<ActiveInfusion[]>([])
  const [activeFluids,    setActiveFluids]    = useState<ActiveFluid[]>([])
  const [activeAgent,     setActiveAgent]     = useState<{ name: string; color: string } | null>(null)

  const { width: screenWidth } = useWindowDimensions()
  const tabRailRef  = useRef<ScrollView>(null)
  const tabLayouts  = useRef<Partial<Record<string, { x: number; width: number }>>>({})

  const [tab,       setTab]       = useState<"equipment"|"technique"|"timing"|"position"|"monitoring"|"airway"|"vascular"|"premedication"|"log"|"events">("equipment")
  const [elapsedMs, setElapsedMs] = useState(0)
  const [caseLoaded, setCaseLoaded] = useState(false)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const startRef                  = useRef<Date | null>(null)
  const verticalTimetableRef      = useRef<FlatList<number>>(null)
  const prevCurrentColRef         = useRef(-1)
  const [entryTs, setEntryTs]     = useState<string | null>(null)
  const [slotOpen, setSlotOpen]       = useState(false)
  const [slotTs, setSlotTs]           = useState<Date | null>(null)
  const [slotEventSearch, setSlotEventSearch] = useState("")
  const [slotCompExpanded, setSlotCompExpanded] = useState(false)
  const [syncState, setSyncState] = useState<"saved" | "saving" | "failed" | "offline">("saved")
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  // Drug sheet
  const [drugOpen, setDrugOpen] = useState(false)
  const [drugCat,  setDrugCat]  = useState<typeof DRUG_CATS[number] | null>(null)
  const [drugPick, setDrugPick] = useState<{ name: string; unit: string } | null>(null)
  const [drugDose, setDrugDose] = useState("")

  // Vitals sheet
  const [vitOpen,        setVitOpen]        = useState(false)
  const [vitMode,        setVitMode]        = useState<"full"|"bp">("full")
  const [vitScanBusy,    setVitScanBusy]    = useState(false)
  const [editingVitalId, setEditingVitalId] = useState<string | null>(null)
  const [vSys,     setVSys]     = useState("")
  const [vDia,     setVDia]     = useState("")
  const [vHR,      setVHR]      = useState("")
  const [vSpO2,    setVSpO2]    = useState("")
  const [vEtco2,   setVEtco2]   = useState("")
  const [vTemp,    setVTemp]    = useState("")
  const [vBgl,     setVBgl]     = useState("")
  const vSysRef = useRef<TextInput | null>(null)
  const vDiaRef = useRef<TextInput | null>(null)
  const vHRRef = useRef<TextInput | null>(null)
  const vSpO2Ref = useRef<TextInput | null>(null)
  const vEtco2Ref = useRef<TextInput | null>(null)
  const vTempRef = useRef<TextInput | null>(null)
  const vBglRef = useRef<TextInput | null>(null)

  // Infusion sheets
  const [infOpen,    setInfOpen]    = useState(false)
  const [infDrug,    setInfDrug]    = useState<typeof INF_DRUGS[number] | null>(null)
  const [infRate,    setInfRate]    = useState("")
  const [infActOpen, setInfActOpen] = useState(false)
  const [infActTgt,  setInfActTgt]  = useState<ActiveInfusion | null>(null)
  const [infActRate, setInfActRate] = useState("")

  // Fluid sheet
  const [flOpen,  setFlOpen]  = useState(false)
  const [flFluid, setFlFluid] = useState<typeof FLUID_LIST[number] | null>(null)
  const [flVol,   setFlVol]   = useState("500")

  // Fluid end options
  const [flEndOpen,   setFlEndOpen]   = useState(false)
  const [flEndTarget, setFlEndTarget] = useState<ActiveFluid | null>(null)
  const [flEndCustom, setFlEndCustom] = useState("")

  // Agent sheet
  const [agOpen, setAgOpen] = useState(false)
  const [agPick, setAgPick] = useState<typeof VOLATILE_AGENTS[number] | null>(null)

  // Gas settings (N₂O / O₂) — legacy fields kept for backward compat
  const [n2oPercent,      setN2oPercent]      = useState<string>("")
  const [o2Percent,       setO2Percent]       = useState<string>("")
  const [n2oLitersPerMin, setN2oLitersPerMin] = useState<string>("")
  const [o2LitersPerMin,  setO2LitersPerMin]  = useState<string>("")
  const [gasSaving,       setGasSaving]       = useState(false)
  // Gas settings — new fields
  const [fgfLitersPerMin, setFgfLitersPerMin] = useState<number | undefined>()
  const [carrierGas,      setCarrierGas]      = useState<string | null>("air")
  const [fio2Percent,     setFio2Percent]     = useState<number | undefined>(21)
  const gasSaveTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gasInitializedRef  = useRef(false)
  const awInitializedRef   = useRef(false)

  // Airway detail sheet
  const [airwayOpen,   setAirwayOpen]   = useState(false)
  const [airwayLabel,  setAirwayLabel]  = useState("")
  const [airwayDetail, setAirwayDetail] = useState<AirwayDetail>({ tubeSize:"7.0", cuffed:"yes", tool:"Direct", cl:"" })

  // Edit drug event modal
  const [editOpen, setEditOpen] = useState(false)
  const [editEv,   setEditEv]   = useState<LogEvent | null>(null)
  const [editDose, setEditDose] = useState("")
  const [editTime, setEditTime] = useState("")
  const [undoEv, setUndoEv] = useState<LogEvent | null>(null)

  // End-case cleanup sheet
  const [endCaseOpen, setEndCaseOpen]   = useState(false)
  const [startAtOpen, setStartAtOpen]   = useState(false)
  const [startAtInput, setStartAtInput] = useState("")
  // Per-item decisions when ending with running items: "stop" | "continue"
  const [endCaseDecisions, setEndCaseDecisions] = useState<Record<string, "stop" | "continue">>({})
  // Items the user chose to continue postoperatively (collected at finaliseCase)
  const [continuedPostopItems, setContinuedPostopItems] = useState<string[]>([])

  // Case ended state
  const [caseEnded, setCaseEnded] = useState(false)
  const caseEndedAtRef = useRef<Date | null>(null)
  const [resumeSecsLeft, setResumeSecsLeft] = useState(0)

  // Complications
  const [compOpen,             setCompOpen]             = useState(false)
  const [selectedComplications, setSelectedComplications] = useState<string[]>([])
  const [complicationsNotes,   setComplicationsNotes]   = useState("")
  const [compGroupExpanded,    setCompGroupExpanded]    = useState<Record<string, boolean>>({})
  const [compSaving,           setCompSaving]           = useState(false)

  // Premedication
  const [premedEveningText, setPremedEveningText] = useState("")
  const [premedMorningText, setPremedMorningText] = useState("")
  const [premedSaving,      setPremedSaving]      = useState(false)
  const premedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevTabRef        = useRef<string>("equipment")

  // Equipment tab
  const [preop, setPreop] = useState<{age?: number; weight?: number; height?: number; sex?: string} | null>(null)

  // Timing tab
  const [caseMonthYear,   setCaseMonthYear]   = useState("")
  const [caseStartTime,   setCaseStartTime]   = useState("")
  const [caseEndTime,     setCaseEndTime]     = useState("")
  const [caseEndNextDay,  setCaseEndNextDay]  = useState(false)
  const [timingSaving,    setTimingSaving]    = useState(false)

  // Position / Monitoring / Techniques tab state
  const [positions,      setPositions]      = useState<string[]>([])
  const [monitoring,     setMonitoring]     = useState<string[]>([])
  const [techniques,     setTechniques]     = useState<string[]>([])
  const [fieldSaving,    setFieldSaving]    = useState<string | null>(null)

  // Monitoring advanced section
  const [advMonOpen, setAdvMonOpen] = useState(false)
  const [autoFillVitals, setAutoFillVitals] = useState(false)
  const [autoFillBP,     setAutoFillBP]     = useState(false)
  const [autoFillBg,     setAutoFillBg]     = useState(false)

  // Airway tab (separate from timetable airway event logging)
  const [awTools,          setAwTools]          = useState<string[]>([])
  const [awDevices,        setAwDevices]         = useState<string[]>([])
  const [awTubeSize,       setAwTubeSize]        = useState<string | null>(null)
  const [awCuffedBool,     setAwCuffedBool]      = useState<boolean | null>(null)
  const [awDltType,        setAwDltType]         = useState<"Carlens" | "Robertshaw" | null>(null)
  const [awDltSide,        setAwDltSide]         = useState<"Left" | "Right" | null>(null)
  const [awDltSize,        setAwDltSize]         = useState<number | null>(null)
  const [awEbSize,         setAwEbSize]          = useState<number | null>(null)
  const [awExpandedDevice, setAwExpandedDevice]  = useState<string | null>(null)
  const awExpandedWasComplete = React.useRef(false)
  const [awClGrade,        setAwClGrade]         = useState("")
  const [awVentModes,      setAwVentModes]       = useState<string[]>([])
  const [awVentExpanded,   setAwVentExpanded]    = useState<"assisted" | "controlled" | null>(null)
  const [awNotes,          setAwNotes]           = useState("")
  const [airwaySectionSaving, setAirwaySectionSaving] = useState(false)

  // Vascular access tab
  const [vascularAccesses, setVascularAccesses] = useState<VascularEntry[]>([])
  const [vascMode,         setVascMode]         = useState<null | "add" | "preexisting">(null)
  const [vascTreePath,     setVascTreePath]      = useState<VascTreeNode[]>([])
  const [vascPending,      setVascPending]       = useState<{ v: string; label: string; crumb: string } | null>(null)
  const [vascDetailUnit,   setVascDetailUnit]    = useState("G")
  const [vascDetailSize,   setVascDetailSize]    = useState("")
  const [vascDetailDepth,  setVascDetailDepth]   = useState("")
  const [vascDetailLumens, setVascDetailLumens]  = useState("")
  const [vascularSaving,   setVascularSaving]    = useState(false)

  // Technique tree navigation
  const [techPath,      setTechPath]      = useState<string[]>([])
  const [otherTechText, setOtherTechText] = useState("")

  // Premedication library picker
  const [premedPickOpen,  setPremedPickOpen]  = useState(false)
  const [premedPickPhase, setPremedPickPhase] = useState<"evening"|"morning">("evening")
  const [premedPickCat,   setPremedPickCat]   = useState<string|null>(null)
  const [premedPickDrug,  setPremedPickDrug]  = useState<PremDrug|null>(null)
  const [premedPickDose,  setPremedPickDose]  = useState("")
  const [premedPickRoute, setPremedPickRoute] = useState("PO")

  // Chart tab
  const [timetable,  setTimetable]  = useState<TimetableData>(emptyTimetable())
  const [ttColCount, setTtColCount] = useState(12)
  const [chartPage,  setChartPage]  = useState(0)

  // ── Load auto-fill settings from SecureStore (once) ──────────────────
  useEffect(() => {
    SecureStore.getItemAsync("intraop_autofill_vitals").then(v => setAutoFillVitals(v === "on"))
    SecureStore.getItemAsync("intraop_autofill_bp").then(v => setAutoFillBP(v === "on"))
    SecureStore.getItemAsync("intraop_autofill_bg").then(v => setAutoFillBg(v === "on"))
  }, [])

  // ── Load ──────────────────────────────────────────────────────────────

  const loadCase = useCallback(async (silent = false) => {
    try {
      const data = await apiJson<any>(`/api/cases/${id}`)
      const caseTechniques: string[] = Array.isArray(data.intraop?.techniques) ? data.intraop.techniques as string[] : []
      // Resolve async data before the sync batch
      const kev = (data.intraop?.keyEvents ?? {}) as any
      const serverRaw: LogEvent[] = Array.isArray(kev.log) ? kev.log : []
      const pending = await loadPendingEvents(id)
      const raw = mergeLogWithPending(serverRaw, pending)
      // Batch all synchronous state updates into a single render pass
      runBatched(() => {
      setCaseInfo({
        caseCode:    data.caseCode,
        procedure:   data.preop?.plannedProcedure,
        diagnosis:   data.preop?.diagnosis,
        techniques:  caseTechniques,
        status:      data.status,
        finalizedAt: data.finalizedAt ?? null,
      })
      if (!silent) {
      setTechniques(caseTechniques)
      if (Array.isArray(data.intraop?.positions)) setPositions(data.intraop.positions as string[])
      const mon: string[] = []
      for (const opt of MONITORING_OPTS) {
        if ((data.intraop as any)?.[opt.field]) mon.push(opt.label)
      }
      setMonitoring(mon)

      // Load preop patient data for equipment tab (canonical names: ageYears/weightKg/heightCm)
      const pd = data.preop ?? {}
      setPreop({
        age:    pd.ageYears  != null ? Number(pd.ageYears)  : pd.age    != null ? Number(pd.age)    : undefined,
        weight: pd.weightKg  != null ? Number(pd.weightKg)  : pd.weight != null ? Number(pd.weight) : undefined,
        height: pd.heightCm  != null ? Number(pd.heightCm)  : pd.height != null ? Number(pd.height) : undefined,
        sex:    pd.sex ?? undefined,
      })

      // Load timing fields — auto-populate month/year from device clock if not yet saved
      if (data.intraop?.monthYear) {
        setCaseMonthYear(data.intraop.monthYear)
      } else {
        const now = new Date()
        setCaseMonthYear(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
      }
      // startTime may arrive as a full ISO string (e.g. "0000-01-01T00:00:00.000Z") — extract HH:MM only
      const rawStart = data.intraop?.startTime
      if (rawStart) {
        if (rawStart.includes("T")) {
          const d = new Date(rawStart)
          if (!isNaN(d.getTime())) {
            setCaseStartTime(`${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`)
          }
          // else: bogus epoch date — leave empty so user sets it
        } else {
          setCaseStartTime(rawStart)
        }
      }
      const rawEnd = data.intraop?.endTime
      if (rawEnd) {
        if (rawEnd.includes("T")) {
          const d = new Date(rawEnd)
          if (!isNaN(d.getTime())) {
            setCaseEndTime(`${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`)
          }
        } else {
          setCaseEndTime(rawEnd)
        }
      }
      if (data.intraop?.endTimeNextDay != null) setCaseEndNextDay(!!data.intraop.endTimeNextDay)

      // Load airway tab fields
      if (Array.isArray(data.intraop?.airwayTools))   setAwTools(data.intraop.airwayTools)
      if (Array.isArray(data.intraop?.airwayDevices)) setAwDevices(data.intraop.airwayDevices)
      if (data.intraop?.tubeSize != null) setAwTubeSize(String(data.intraop.tubeSize))
      if (data.intraop?.cuffed != null) setAwCuffedBool(!!data.intraop.cuffed)
      if (data.intraop?.dltType != null) setAwDltType(data.intraop.dltType as "Carlens" | "Robertshaw")
      if (data.intraop?.dltSide != null) setAwDltSide(data.intraop.dltSide as "Left" | "Right")
      if (data.intraop?.dltSize != null) setAwDltSize(Number(data.intraop.dltSize))
      if (data.intraop?.endobronchialSize != null) setAwEbSize(Number(data.intraop.endobronchialSize))
      if (data.intraop?.cormackLehane != null) setAwClGrade(data.intraop.cormackLehane)
      if (Array.isArray(data.intraop?.ventilationModes)) {
        const modes: string[] = data.intraop.ventilationModes
        setAwVentModes(modes)
        // Auto-open the appropriate vent sub-panel if sub-modes present
        if (VENT_ASSISTED.some(a => modes.includes(a.v))) setAwVentExpanded("assisted")
        else if (VENT_CONTROLLED.some(c => modes.includes(c.v))) setAwVentExpanded("controlled")
      }
      if (data.intraop?.airwayNotes != null) setAwNotes(data.intraop.airwayNotes)
      // Init advanced monitoring open if any advanced field is selected
      const advFields = MONITORING_OPTS.filter(o => o.section !== "standard").map(o => o.field)
      if (advFields.some(f => (data.intraop as any)?.[f])) setAdvMonOpen(true)

      // Load vascular accesses
      if (Array.isArray(data.intraop?.vascularAccesses)) setVascularAccesses(data.intraop.vascularAccesses as VascularEntry[])

      // Load gas settings
      if (data.intraop?.n2oPercent      != null) setN2oPercent(String(data.intraop.n2oPercent))
      if (data.intraop?.o2Percent       != null) setO2Percent(String(data.intraop.o2Percent))
      if (data.intraop?.n2oLitersPerMin != null) setN2oLitersPerMin(String(data.intraop.n2oLitersPerMin))
      if (data.intraop?.o2LitersPerMin  != null) setO2LitersPerMin(String(data.intraop.o2LitersPerMin))
      if ((data.intraop as any)?.fgfLitersPerMin != null) setFgfLitersPerMin(Number((data.intraop as any).fgfLitersPerMin))
      if ((data.intraop as any)?.carrierGas      != null) setCarrierGas((data.intraop as any).carrierGas)
      if ((data.intraop as any)?.fio2Percent     != null) setFio2Percent(Number((data.intraop as any).fio2Percent))

      // Load premedication fields
      if (data.intraop?.premedicationEvening != null) setPremedEveningText(data.intraop.premedicationEvening)
      if (data.intraop?.premedicationMorning != null) setPremedMorningText(data.intraop.premedicationMorning)

      // Load complications field — parse back into selectedComplications + notes
      if (data.intraop?.complications) {
        const raw: string = data.intraop.complications
        const dashIdx = raw.indexOf(" — ")
        if (dashIdx !== -1) {
          const compsPart  = raw.slice(0, dashIdx)
          const notesPart  = raw.slice(dashIdx + 3)
          setSelectedComplications(compsPart.split("; ").filter(Boolean))
          setComplicationsNotes(notesPart)
        } else {
          // Could be only notes or only complications — check against known items
          const knownItems = COMPLICATION_GROUPS.flatMap(g => g.items)
          const parts = raw.split("; ").filter(Boolean)
          const allKnown = parts.every(p => knownItems.includes(p))
          if (allKnown && parts.length > 0) {
            setSelectedComplications(parts)
            setComplicationsNotes("")
          } else {
            setSelectedComplications([])
            setComplicationsNotes(raw)
          }
        }
      }
      } // end !silent guard

      setPendingCount(pending.length)
      setSyncState(pending.length > 0 ? "failed" : "saved")
      setLog(raw)

      // Oldest event = start of case
      if (raw.length > 0) {
        startRef.current = new Date(raw[raw.length - 1].ts)
        setElapsedMs(Date.now() - startRef.current.getTime())
      }

      // Rebuild active state from sorted log
      const infMap: Record<string, ActiveInfusion> = {}
      const flMap:  Record<string, ActiveFluid>    = {}
      let agent: { name: string; color: string } | null = null
      for (const ev of [...raw].reverse()) { // process chrono order
        if (ev.type === "infusion_start")
          infMap[ev.infId!] = { infId:ev.infId!, name:ev.name!, rate:ev.rate!, unit:ev.unit!, color:ev.color! }
        else if (ev.type === "infusion_stop") delete infMap[ev.infId!]
        else if (ev.type === "infusion_rate" && infMap[ev.infId!]) infMap[ev.infId!].rate = ev.rate!
        else if (ev.type === "fluid_start")
          flMap[ev.fluidId!] = { fluidId:ev.fluidId!, name:ev.name!, volume:ev.volume!, color:ev.color! }
        else if (ev.type === "fluid_end") delete flMap[ev.fluidId!]
        else if (ev.type === "agent_start") agent = { name:ev.name!, color:ev.color! }
        else if (ev.type === "agent_stop")  agent = null
      }
      setActiveInfusions(Object.values(infMap))
      setActiveFluids(Object.values(flMap))
      setActiveAgent(agent)

      // Project to timetable (use rounded-down 5-min start for column alignment)
      if (raw.length > 0 && startRef.current) {
        const roundedStart = roundDown5Min(startRef.current)
        setTimetable(eventsToTimetable(raw, roundedStart, new Date()))
        setTtColCount(Math.max(12, Math.ceil((Date.now() - roundedStart.getTime()) / (5 * 60_000)) + 12))
      }
      setCaseLoaded(true)
      }) // end runBatched
    } catch (err) {
      if (!silent) {
        const message = err instanceof Error ? err.message : "Could not load case."
        Alert.alert(tc("errorLabel"), message)
      }
    }
  }, [id])

  useEffect(() => {
    loadCase()
  }, [loadCase])

  useCaseLiveUpdates(id, () => loadCase(true), { pollIntervalMs: 15_000 })

  // ── Anesthesia technique → monitoring auto-select ─────────────────────
  // Additive: only adds monitors required by the selected techniques, never removes.
  // Called every time a technique is toggled by the user (not on case load).
  function computeMonitoringDefaults(techs: string[], currentMonitoring: string[]): string[] | null {
    const isGA       = techs.some(t => ["GENERAL_INHALATION","GENERAL_TIVA","GENERAL_COMBINED"].includes(t))
    const isTIVA     = techs.includes("GENERAL_TIVA")
    const isNeuraxial = techs.some(t => t.startsWith("SPINAL") || t.startsWith("EPIDURAL") || t === "CSE" || t === "DPE")
    const next = [...currentMonitoring]
    const add = (label: string) => { if (!next.includes(label)) next.push(label) }
    if (isGA || isNeuraxial) { add("ECG"); add("SpO₂"); add("NIBP"); add("Capnography (EtCO₂)") }
    if (isGA) { add("Temperature"); if (isTIVA) add("BIS") }
    return next.length > currentMonitoring.length ? next : null
  }

  // Save premedication when navigating away from the premed tab
  useEffect(() => {
    if (prevTabRef.current === "premedication" && tab !== "premedication") {
      if (premedDebounceRef.current) { clearTimeout(premedDebounceRef.current); premedDebounceRef.current = null }
      savePremedication()
    }
    prevTabRef.current = tab
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenWidth, tab])

  // ── Resume countdown timer ────────────────────────────────────────────

  useEffect(() => {
    if (resumeSecsLeft <= 0) return
    const t = setInterval(() => {
      if (!caseEndedAtRef.current) return
      const elapsed = Math.floor((Date.now() - caseEndedAtRef.current.getTime()) / 1000)
      const remaining = Math.max(0, 30 * 60 - elapsed)
      setResumeSecsLeft(remaining)
      if (remaining === 0) clearInterval(t)
    }, 1000)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeSecsLeft > 0])

  // ── Airway autosave — debounced 600 ms after any airway field changes ──
  // Most airway fields are buttons/toggles with no onBlur, so we watch all
  // relevant state variables and save automatically after a short pause.
  const airwaySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!caseLoaded) return  // skip during initial load
    if (!awInitializedRef.current) { awInitializedRef.current = true; return } // skip first fire after load
    if (airwaySaveTimerRef.current) clearTimeout(airwaySaveTimerRef.current)
    airwaySaveTimerRef.current = setTimeout(() => { saveAirwaySection() }, 600)
    return () => { if (airwaySaveTimerRef.current) clearTimeout(airwaySaveTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awTools, awDevices, awTubeSize, awCuffedBool, awDltType, awDltSide, awDltSize, awEbSize, awClGrade, awVentModes, awNotes, caseLoaded])

  useEffect(() => {
    if (!caseLoaded) return
    if (!gasInitializedRef.current) { gasInitializedRef.current = true; return } // skip first fire after load
    if (gasSaveTimerRef.current) clearTimeout(gasSaveTimerRef.current)
    gasSaveTimerRef.current = setTimeout(() => { saveGasSettings() }, 600)
    return () => { if (gasSaveTimerRef.current) clearTimeout(gasSaveTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fgfLitersPerMin, carrierGas, fio2Percent, caseLoaded])

  // Keep logRef current so the interval can read the latest log without stale closure
  useEffect(() => { logRef.current = log }, [log])

  // ── Elapsed clock ─────────────────────────────────────────────────────

  useEffect(() => {
    const t = setInterval(() => {
      if (!startRef.current) return
      const now = new Date()
      setElapsedMs(now.getTime() - startRef.current.getTime())
      // Rebuild timetable so open-end fluids/infusions/agents extend to current time
      setTimetable(eventsToTimetable(logRef.current, roundDown5Min(startRef.current), now))
    }, 10_000)
    return () => clearInterval(t)
  }, [])

  // ── Save one event ────────────────────────────────────────────────────

  async function save(partial: Omit<LogEvent, "id" | "ts">, tsOverride?: string, silent = false): Promise<LogEvent> {
    const ev: LogEvent = { id: uid(), ts: tsOverride ?? entryTs ?? new Date().toISOString(), syncStatus: "pending", ...partial }
    const newLog = [ev, ...logRef.current]
    logRef.current = newLog
    setLog(newLog)
    setSyncState("saving")
    const pending = await loadPendingEvents(id)
    await storePendingEvents(id, [ev, ...pending.filter(p => p.id !== ev.id)])
    setPendingCount(pending.length + 1)
    if (!startRef.current) {
      startRef.current = new Date(ev.ts)
      setElapsedMs(0)
    }
    setTimetable(eventsToTimetable(newLog, roundDown5Min(startRef.current!), new Date()))
    try {
      const res = await apiFetch(`/api/cases/${id}/events`, {
        method: "POST",
        body: JSON.stringify(eventForServer(ev)),
      })
      if (!res.ok) throw new Error()
      const remaining = (await loadPendingEvents(id)).filter(p => p.id !== ev.id)
      await storePendingEvents(id, remaining)
      setPendingCount(remaining.length)
      setLog(prev => prev.map(item => item.id === ev.id ? eventForServer(item) : item))
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
      setSyncState(remaining.length > 0 ? "failed" : "saved")
      if (!silent) {
        setUndoEv(eventForServer(ev))
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      }
    } catch {
      setLog(prev => prev.map(item => item.id === ev.id ? { ...item, syncStatus: "failed" } : item))
      setSyncState("failed")
      if (!silent) setUndoEv({ ...ev, syncStatus: "failed" })
      if (!silent) Alert.alert("Saved locally", "Network save failed. The event is still visible and will retry from this screen.")
    }
    setEntryTs(null)
    return ev
  }

  // ── Sync log to server (after edit / delete) ──────────────────────────

  async function syncLog(newLog: LogEvent[]) {
    setLog(newLog)
    if (startRef.current) setTimetable(eventsToTimetable(newLog, roundDown5Min(startRef.current), new Date()))
    setSyncState("saving")
    try {
      const res = await apiFetch(`/api/cases/${id}/events`, {
        method: "PUT",
        body: JSON.stringify({ log: [...newLog].reverse().map(eventForServer) }), // send oldest-first
      })
      if (!res.ok) throw new Error()
      await storePendingEvents(id, [])
      setPendingCount(0)
      setLog(prev => prev.map(eventForServer))
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
      setSyncState("saved")
    } catch {
      setSyncState("failed")
      Alert.alert("Sync error", "Could not save change. Reload to restore.")
    }
  }

  // ── Auto-fill vitals: carry forward values when column advances ────────
  const autoFillPrevColRef = useRef<number | null>(null)
  const autoFillBusyRef = useRef(false)

  async function persistAutoFilledVitals(fromCol: number, toCol: number) {
    if (!startRef.current || autoFillBusyRef.current || toCol < fromCol) return
    autoFillBusyRef.current = true
    try {
      const chartStart = roundDown5Min(startRef.current)
      const autoKeys: (keyof VitalsEntry)[] = autoFillBP
        ? ["etco2","temp","spO2","systolic","diastolic","heartRate"]
        : ["etco2","temp","spO2"]

      for (let col = fromCol; col <= toCol; col++) {
        const colStart = chartStart.getTime() + col * 5 * 60_000
        const colEnd = colStart + 5 * 60_000
        const alreadyRecorded = logRef.current.some(ev => {
          const ts = new Date(ev.ts).getTime()
          return ev.type === "vital" && ts >= colStart && ts < colEnd
        })
        if (alreadyRecorded) continue

        const source = logRef.current.find(ev => ev.type === "vital" && new Date(ev.ts).getTime() < colStart)
        if (!source) continue

        const copied: Omit<LogEvent, "id" | "ts"> = { type:"vital" }
        for (const key of autoKeys) {
          const value = source[key]
          if (typeof value === "number") (copied as any)[key] = value
        }
        if (autoKeys.some(key => typeof (copied as any)[key] === "number")) {
          await save(copied, new Date(colStart).toISOString(), true)
        }
      }
    } finally {
      autoFillBusyRef.current = false
    }
  }
  useEffect(() => {
    if (!autoFillVitals) { autoFillPrevColRef.current = null; return }
    const t = setInterval(() => {
      if (!startRef.current) return
      const ms = Date.now() - roundDown5Min(startRef.current).getTime()
      const col = Math.max(0, Math.floor(ms / (5 * 60_000)))
      const prevCol = autoFillPrevColRef.current
      if (prevCol === null) { autoFillPrevColRef.current = col; return }
      if (col <= prevCol) return
      if (autoFillBusyRef.current) return
      void persistAutoFilledVitals(prevCol + 1, col).finally(() => {
        autoFillPrevColRef.current = col
      })
    }, 10_000)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFillVitals, autoFillBP])

  // ── Background auto-fill: on case load, backfill gap from last entry to now ──
  useEffect(() => {
    if (!caseLoaded) return
    if (!autoFillBg) return
    if (!startRef.current) return
    const chartStart = roundDown5Min(startRef.current)
    const vitalCols = logRef.current
      .filter(ev => ev.type === "vital")
      .map(ev => Math.max(0, Math.floor((new Date(ev.ts).getTime() - chartStart.getTime()) / (5 * 60_000))))
    if (vitalCols.length === 0) return
    const lastDataCol = Math.max(...vitalCols)
    const currentCol = Math.max(0, Math.floor((Date.now() - chartStart.getTime()) / (5 * 60_000)))
    if (currentCol > lastDataCol) void persistAutoFilledVitals(lastDataCol + 1, currentCol)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseLoaded, autoFillBg, autoFillBP])

  // ── Drug ──────────────────────────────────────────────────────────────

  async function retryPendingEvents() {
    const pending = await loadPendingEvents(id)
    if (pending.length === 0) {
      setPendingCount(0)
      setSyncState("saved")
      return
    }

    setSyncState("saving")
    const failed: LogEvent[] = []
    for (const ev of [...pending].reverse()) {
      try {
        const res = await apiFetch(`/api/cases/${id}/events`, {
          method: "POST",
          body: JSON.stringify(eventForServer(ev)),
        })
        if (!res.ok) throw new Error()
        setLog(prev => prev.map(item => item.id === ev.id ? eventForServer(item) : item))
      } catch {
        failed.push({ ...ev, syncStatus: "failed" })
      }
    }

    await storePendingEvents(id, failed)
    setPendingCount(failed.length)
    if (failed.length === 0) {
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
      setSyncState("saved")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } else {
      setSyncState("failed")
      Alert.alert("Still offline", `${failed.length} event${failed.length === 1 ? "" : "s"} could not sync.`)
    }
  }

  async function removeEvent(ev: LogEvent, sync = true) {
    const next = log.filter(x => x.id !== ev.id)
    const remainingPending = (await loadPendingEvents(id)).filter(p => p.id !== ev.id)
    await storePendingEvents(id, remainingPending)
    setPendingCount(remainingPending.length)
    setLog(next)
    if (startRef.current) setTimetable(eventsToTimetable(next, roundDown5Min(startRef.current)))
    if (sync && !ev.syncStatus) await syncLog(next)
    else setSyncState(remainingPending.length > 0 ? "failed" : "saved")
  }

  async function undoLastEvent() {
    if (!undoEv) return
    await removeEvent(undoEv)
    setUndoEv(null)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
  }

  function openDrug(ts?: string) {
    setEntryTs(ts ?? null)
    setDrugCat(null); setDrugPick(null); setDrugDose(""); setDrugOpen(true)
  }

  async function confirmDrug() {
    if (!drugPick || !drugDose) return
    await save({ type:"drug", name:drugPick.name, dose:drugDose, unit:drugPick.unit,
      category: drugCat?.cat, color: drugCat?.color as string })
    setDrugOpen(false); setDrugCat(null); setDrugPick(null); setDrugDose("")
  }

  function startDrugAsInfusion() {
    if (!drugPick) return
    const infMatch = INF_DRUGS.find(d => d.name === drugPick.name)
    if (!infMatch) return
    // Transfer to infusion sheet pre-selected with this drug
    setDrugOpen(false); setDrugCat(null); setDrugPick(null); setDrugDose("")
    setInfDrug(infMatch); setInfRate(""); setInfOpen(true)
  }

  // ── Vitals ────────────────────────────────────────────────────────────

  function openDrugPreset(name: string, dose = "") {
    for (const cat of DRUG_CATS) {
      const found = (cat.drugs as readonly { name: string; unit: string }[]).find(d => d.name === name)
      if (found) {
        setDrugCat(cat)
        setDrugPick(found)
        setDrugDose(dose)
        setDrugOpen(true)
        return
      }
    }
    openDrug()
  }

  function emergencyShortcut(kind: "hypotension" | "desaturation" | "bradycardia" | "airway") {
    const ts = new Date().toISOString()
    if (kind === "hypotension") {
      Alert.alert("Hypotension", "Log event or open a common rescue drug.", [
        { text: "Phenylephrine 100 mcg", onPress: () => { setEntryTs(ts); openDrugPreset("Phenylephrine", "100") } },
        { text: "Ephedrine 10 mg", onPress: () => { setEntryTs(ts); openDrugPreset("Ephedrine", "10") } },
        { text: "Log event", onPress: () => save({ type:"clinical_event", label:"Hypotension", color:"#ef4444" }) },
        { text: tc("cancelLabel"), style:"cancel" },
      ])
    } else if (kind === "desaturation") {
      Alert.alert("Desaturation", "Fast airway/oxygenation event.", [
        { text: "Log desaturation", onPress: () => save({ type:"clinical_event", label:"Desaturation", color:"#06b6d4" }) },
        { text: "Airway note", onPress: () => { setAirwayLabel("Intubated"); setAirwayOpen(true) } },
        { text: tc("cancelLabel"), style:"cancel" },
      ])
    } else if (kind === "bradycardia") {
      Alert.alert("Bradycardia", "Log event or open atropine.", [
        { text: "Atropine 0.5 mg", onPress: () => { setEntryTs(ts); openDrugPreset("Atropine", "0.5") } },
        { text: "Log event", onPress: () => save({ type:"clinical_event", label:"Bradycardia", color:"#22c55e" }) },
        { text: tc("cancelLabel"), style:"cancel" },
      ])
    } else {
      Alert.alert("Difficult airway", "Log a difficult airway event or add airway detail.", [
        { text: "Airway detail", onPress: () => { setAirwayLabel("Intubated"); setAirwayOpen(true) } },
        { text: "Log difficult airway", onPress: () => save({ type:"clinical_event", label:"Difficult airway", color:"#6366f1" }) },
        { text: tc("cancelLabel"), style:"cancel" },
      ])
    }
  }

  function openVitals(mode: "full"|"bp" = "full", ts?: string) {
    setEntryTs(ts ?? null)
    setVitMode(mode)
    // Find existing vital at this 5-min column to support change-not-add
    let existingAtCol: LogEvent | undefined
    if (ts && startRef.current) {
      const tsMs    = new Date(ts).getTime()
      const startMs = startRef.current.getTime()
      const targetCol = Math.floor((tsMs - startMs) / (5 * 60_000))
      existingAtCol = log.find(e => {
        if (e.type !== "vital") return false
        const evCol = Math.floor((new Date(e.ts).getTime() - startMs) / (5 * 60_000))
        return evCol === targetCol
      })
    }
    setEditingVitalId(existingAtCol?.id ?? null)
    const prefill = existingAtCol ?? log.find(e => e.type === "vital")
    setVSys(prefill?.systolic  != null ? String(prefill.systolic)  : "")
    setVDia(prefill?.diastolic != null ? String(prefill.diastolic) : "")
    setVHR( prefill?.heartRate != null ? String(prefill.heartRate) : "")
    setVSpO2(prefill?.spO2     != null ? String(prefill.spO2)      : "")
    setVEtco2(prefill?.etco2   != null ? String(prefill.etco2)     : "")
    setVTemp(prefill?.temp     != null ? String(prefill.temp)      : "")
    setVBgl(prefill?.bgl       != null ? String(prefill.bgl)       : "")
    setVitOpen(true)
  }

  async function confirmVitals() {
    const n = (s: string) => { const v = parseFloat(s); return isNaN(v) ? undefined : v }
    const vitals = { type:"vital" as const, systolic:n(vSys), diastolic:n(vDia),
      heartRate:n(vHR), spO2:n(vSpO2), etco2:n(vEtco2), temp:n(vTemp), bgl:n(vBgl) }
    if ([vitals.systolic,vitals.diastolic,vitals.heartRate,vitals.spO2,vitals.etco2,vitals.temp,vitals.bgl].every(v => v == null)) return
    if (editingVitalId) {
      // Replace existing vital — remove old event, insert new at same timestamp
      const oldEv = log.find(e => e.id === editingVitalId)
      const ts = oldEv?.ts ?? entryTs ?? new Date().toISOString()
      const newEv: LogEvent = { id: uid(), ts, syncStatus: "pending", ...vitals }
      const newLog = [newEv, ...log.filter(e => e.id !== editingVitalId)]
      logRef.current = newLog
      setLog(newLog)
      if (startRef.current) setTimetable(eventsToTimetable(newLog, roundDown5Min(startRef.current), new Date()))
      await syncLog(newLog)
      setEditingVitalId(null)
      setVitOpen(false)
      return
    }
    await save(vitals)
    setVitOpen(false)
  }

  // Lazy require — expo-image-picker needs a full native build; gracefully degrade.
  function getImagePicker() {
    try { return require("expo-image-picker") } catch { return null }
  }

  async function scanVitalsFromCamera() {
    const ImagePicker = getImagePicker()
    if (!ImagePicker) {
      Alert.alert("Not available", "Monitor scanning requires a full native rebuild. Run npx expo run:android to enable.")
      return
    }
    setVitScanBusy(true)
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) {
        Alert.alert("Permission denied", "Camera access is required.")
        return
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: Platform.OS === "ios",
        quality: Platform.OS === "web" ? 1 : 0.25,
        base64: true,
      })
      if (result.canceled || !result.assets?.[0]) return

      const prepared = await prepareVitalsScanImage(result.assets[0] as ScanImageAsset)
      if (!prepared.image) throw new Error("Could not read the captured image.")
      if (prepared.image.length > 5_400_000) {
        throw new Error("The photo is still too large. Move closer to the monitor and try again.")
      }

      const res = await apiFetch(`/api/cases/${id}/vitals-scan`, {
        method: "POST",
        body: JSON.stringify(prepared),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Monitor scan failed (${res.status}).`)
      }
      const v = await res.json()
      if (v.systolic  != null) setVSys(String(v.systolic))
      if (v.diastolic != null) setVDia(String(v.diastolic))
      if (v.heartRate != null) setVHR(String(v.heartRate))
      if (v.spO2      != null) setVSpO2(String(v.spO2))
      if (v.etco2     != null) setVEtco2(String(v.etco2))
      if (v.temp      != null) setVTemp(String(v.temp))
      if ([v.systolic, v.diastolic, v.heartRate, v.spO2, v.etco2, v.temp].every(value => value == null)) {
        Alert.alert("No readings found", "No clear monitor readings were detected. Retake the photo closer to the screen.")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read monitor."
      Alert.alert(tc("errorLabel"), message)
    } finally {
      setVitScanBusy(false)
    }
  }

  function openInfusion(ts?: string) {
    setEntryTs(ts ?? null)
    setInfOpen(true)
  }

  function openFluid(ts?: string) {
    setEntryTs(ts ?? null)
    setFlOpen(true)
  }

  function openAgent(ts?: string) {
    setEntryTs(ts ?? null)
    setAgOpen(true)
  }

  function sameAsPrevious() {
    const last = log.find(e => e.type === "vital")
    if (!last) return
    setVSys(last.systolic  != null ? String(last.systolic)  : "")
    setVDia(last.diastolic != null ? String(last.diastolic) : "")
    setVHR( last.heartRate != null ? String(last.heartRate) : "")
    setVSpO2(last.spO2     != null ? String(last.spO2)      : "")
    setVEtco2(last.etco2   != null ? String(last.etco2)     : "")
    setVTemp(last.temp     != null ? String(last.temp)      : "")
    setVBgl(last.bgl       != null ? String(last.bgl)       : "")
  }

  // ── Infusion ──────────────────────────────────────────────────────────

  function setAndAdvance(value: string, setter: (v: string) => void, next?: React.RefObject<TextInput | null>, maxLen = 3) {
    setter(value)
    if (value.length >= maxLen) next?.current?.focus()
  }

  async function confirmInfusion() {
    if (!infDrug || !infRate) return
    const inf: ActiveInfusion = { infId:uid(), name:infDrug.name, rate:infRate, unit:infDrug.unit, color:infDrug.color }
    setActiveInfusions(prev => [...prev, inf])
    await save({ type:"infusion_start", infId:inf.infId, name:inf.name, rate:inf.rate, unit:inf.unit, color:inf.color })
    setInfOpen(false); setInfDrug(null); setInfRate("")
  }

  async function stopInfusion(inf: ActiveInfusion) {
    setActiveInfusions(prev => prev.filter(x => x.infId !== inf.infId))
    await save({ type:"infusion_stop", infId:inf.infId, name:inf.name, color:inf.color })
  }

  async function changeRate(inf: ActiveInfusion, rate: string) {
    setActiveInfusions(prev => prev.map(x => x.infId === inf.infId ? { ...x, rate } : x))
    // Use the current timestamp so eventsToTimetable can compute the correct column for the split
    await save({ type:"infusion_rate", infId:inf.infId, name:inf.name, rate, unit:inf.unit, color:inf.color })
    setInfActOpen(false); setInfActTgt(null); setInfActRate("")
  }

  // ── Fluid ─────────────────────────────────────────────────────────────

  async function confirmFluid() {
    if (!flFluid) return
    const fl: ActiveFluid = { fluidId:uid(), name:flFluid.name, volume:flVol, color:flFluid.color }
    setActiveFluids(prev => [...prev, fl])
    await save({ type:"fluid_start", fluidId:fl.fluidId, name:fl.name, volume:fl.volume, color:fl.color })
    setFlOpen(false); setFlFluid(null); setFlVol("500")
  }

  function openFluidEnd(fl: ActiveFluid) {
    setFlEndTarget(fl); setFlEndCustom(""); setFlEndOpen(true)
  }

  async function confirmFluidEnd(label?: string) {
    if (!flEndTarget) return
    const fl = flEndTarget
    setActiveFluids(prev => prev.filter(x => x.fluidId !== fl.fluidId))
    const name = label ? `${fl.name} (${label})` : fl.name
    await save({ type:"fluid_end", fluidId:fl.fluidId, name, color:fl.color })
    setFlEndOpen(false); setFlEndTarget(null)
  }

  // Direct fluid stop used by end-case sheet (no modal, no flEndTarget state required)
  async function stopFluidDirect(fl: ActiveFluid) {
    setActiveFluids(prev => prev.filter(x => x.fluidId !== fl.fluidId))
    await save({ type:"fluid_end", fluidId:fl.fluidId, name:fl.name, color:fl.color })
  }

  // ── Agent ─────────────────────────────────────────────────────────────

  async function confirmAgent() {
    if (!agPick) return
    if (activeAgent && activeAgent.name !== agPick.name)
      await save({ type:"agent_stop", name:activeAgent.name, color:activeAgent.color })
    setActiveAgent({ name:agPick.name, color:agPick.color })
    await save({ type:"agent_start", name:agPick.name, color:agPick.color })
    setAgOpen(false); setAgPick(null)
  }

  async function stopAgent() {
    if (!activeAgent) return
    const a = activeAgent
    setActiveAgent(null)
    await save({ type:"agent_stop", name:a.name, color:a.color })
  }

  // ── Airway detail ─────────────────────────────────────────────────────

  function tapClinicalEvent(ev: { label: string; color: string }) {
    save({ type:"clinical_event", label:ev.label, color:ev.color })
  }

  async function confirmAirway() {
    const d = airwayDetail
    const detail = airwayLabel === "Intubated"
      ? `${d.tubeSize}mm ${d.cuffed==="yes"?"cuffed":"uncuffed"} · ${d.tool}${d.cl ? ` · CL ${d.cl}` : ""}`
      : `LMA ${d.tubeSize}`
    const color = clinicalEventColor(airwayLabel)
    await save({ type:"clinical_event", label:`${airwayLabel} (${detail})`, color })
    setAirwayOpen(false)
  }

  // ── Long-press drug event ──────────────────────────────────────────────

  function longPressDrug(ev: LogEvent) {
    Alert.alert(
      `${ev.name} ${ev.dose}${ev.unit}`,
      formatTs(ev.ts),
      [
        { text: "Repeat dose", onPress: () => save({ type:"drug", name:ev.name, dose:ev.dose, unit:ev.unit, category:ev.category, color:ev.color }) },
        { text: "Edit", onPress: () => { setEditEv(ev); setEditDose(ev.dose ?? ""); setEditTime(formatTs(ev.ts)); setEditOpen(true) } },
        { text: "Delete", style:"destructive", onPress: () => removeEvent(ev) },
        { text: tc("cancelLabel"), style:"cancel" },
      ]
    )
  }

  function eventActions(ev: LogEvent) {
    const actions: any[] = []
    if (ev.type === "drug") {
      actions.push({ text: "Repeat dose", onPress: () => save({ type:"drug", name:ev.name, dose:ev.dose, unit:ev.unit, category:ev.category, color:ev.color }) })
      actions.push({ text: "Edit dose/time", onPress: () => { setEditEv(ev); setEditDose(ev.dose ?? ""); setEditTime(formatTs(ev.ts)); setEditOpen(true) } })
    } else {
      actions.push({ text: "Edit time", onPress: () => { setEditEv(ev); setEditDose(""); setEditTime(formatTs(ev.ts)); setEditOpen(true) } })
    }
    actions.push({ text: "Delete", style:"destructive", onPress: () => removeEvent(ev) })
    actions.push({ text: tc("cancelLabel"), style:"cancel" })
    Alert.alert(eventLabel(ev).text, formatTs(ev.ts), actions)
  }

  function confirmEdit() {
    if (!editEv) return
    const newLog = log.map(x => {
      if (x.id !== editEv.id) return x
      const [hh, mm] = editTime.split(":").map(Number)
      const newTs = new Date(x.ts)
      if (!isNaN(hh) && !isNaN(mm)) { newTs.setHours(hh); newTs.setMinutes(mm) }
      return { ...x, ...(x.type === "drug" ? { dose: editDose } : {}), ts: newTs.toISOString() }
    })
    syncLog(newLog)
    setEditOpen(false); setEditEv(null)
  }

  function promptDelete(ev: LogEvent) {
    Alert.alert("Delete event", `Remove "${eventLabel(ev).text}"?`, [
      { text: tc("cancelLabel"), style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => removeEvent(ev) },
    ])
  }

  // ── Start case ────────────────────────────────────────────────────────

  async function startCaseNow() {
    if (startRef.current) return
    const nowHHMM = `${String(new Date().getHours()).padStart(2,"0")}:${String(new Date().getMinutes()).padStart(2,"0")}`
    setCaseStartTime(nowHHMM)
    saveTiming({ startTime: nowHHMM })
    // Optimistically promote status — server promotes DRAFT→IN_PROGRESS when startTime is sent
    setCaseInfo(prev => prev && prev.status === "DRAFT" ? { ...prev, status: "IN_PROGRESS" } : prev)
    await save({ type: "clinical_event", label: "Anaesthesia start", color: "#22c55e" })
  }

  async function startCaseAt(hhmm: string) {
    if (startRef.current) return
    const [h, m] = hhmm.split(":").map(Number)
    if (isNaN(h) || isNaN(m)) return
    const startDate = new Date()
    startDate.setHours(h, m, 0, 0)
    if (startDate.getTime() > Date.now()) startDate.setDate(startDate.getDate() - 1)
    startRef.current = startDate
    setElapsedMs(Date.now() - startDate.getTime())
    setCaseStartTime(hhmm)
    saveTiming({ startTime: hhmm })
    setCaseInfo(prev => prev && prev.status === "DRAFT" ? { ...prev, status: "IN_PROGRESS" } : prev)
    await save({ type: "clinical_event", label: "Anaesthesia start", color: "#22c55e" }, startDate.toISOString())
    setStartAtOpen(false)
  }

  // ── End case ──────────────────────────────────────────────────────────

  function openEndCase() {
    if (activeInfusions.length > 0 || activeFluids.length > 0 || activeAgent) {
      // Reset per-item decisions so the sheet starts fresh each time
      setEndCaseDecisions({})
      setEndCaseOpen(true)
    } else {
      Alert.alert("End case", "All active items clear. Continue to postoperative form?", [
        { text: tc("cancelLabel"), style:"cancel" },
        { text: "Continue", onPress: () => finaliseCase([]) },
      ])
    }
  }

  function finaliseCase(continuedItems: string[]) {
    setEndCaseOpen(false)
    if (continuedItems.length > 0) setContinuedPostopItems(continuedItems)
    const nowHHMM = `${String(new Date().getHours()).padStart(2,"0")}:${String(new Date().getMinutes()).padStart(2,"0")}`
    setCaseEndTime(nowHHMM)
    saveTiming({ endTime: nowHHMM })
    setCaseEnded(true)
    caseEndedAtRef.current = new Date()
    setResumeSecsLeft(30 * 60)
  }

  function resumeCase() {
    setCaseEnded(false)
    caseEndedAtRef.current = null
    setResumeSecsLeft(0)
    setCaseEndTime("")
    apiFetch(`/api/cases/${id}`, { method:"PATCH", body: JSON.stringify({ intraop: { endTime: null } }) }).catch(() => {})
  }

  // ── Complications save ────────────────────────────────────────────

  function buildComplicationsString(): string | null {
    const comps = selectedComplications.join("; ")
    const notes = complicationsNotes.trim()
    if (comps && notes) return `${comps} — ${notes}`
    if (comps) return comps
    if (notes) return notes
    return null
  }

  async function saveComplications() {
    setCompSaving(true)
    try {
      const complications = buildComplicationsString()
      const res = await apiFetch(`/api/cases/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ intraop: { complications } }),
      })
      if (!res.ok) throw new Error()
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      setCompOpen(false)
    } catch {
      Alert.alert(tc("errorLabel"), "Could not save complications.")
    } finally {
      setCompSaving(false)
    }
  }

  // ── Premedication save ────────────────────────────────────────────

  async function savePremedication() {
    setPremedSaving(true)
    try {
      const res = await apiFetch(`/api/cases/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          intraop: {
            premedicationEvening: premedEveningText.trim() || null,
            premedicationMorning: premedMorningText.trim() || null,
          },
        }),
      })
      if (!res.ok) throw new Error()
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch {
      Alert.alert(tc("errorLabel"), "Could not save premedication.")
    } finally {
      setPremedSaving(false)
    }
  }

  function debouncedSavePremed() {
    if (premedDebounceRef.current) clearTimeout(premedDebounceRef.current)
    premedDebounceRef.current = setTimeout(savePremedication, 1200)
  }

  async function saveTiming(overrides?: { startTime?: string; endTime?: string }) {
    setTimingSaving(true)
    try {
      await apiFetch(`/api/cases/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ intraop: {
          monthYear: caseMonthYear || null,
          startTime: (overrides?.startTime ?? caseStartTime) || null,
          endTime:   (overrides?.endTime   ?? caseEndTime)   || null,
          endTimeNextDay: caseEndNextDay,
        }}),
      })
    } catch { /* best-effort */ } finally { setTimingSaving(false) }
  }

  async function saveAirwaySection() {
    setAirwaySectionSaving(true)
    try {
      await apiFetch(`/api/cases/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ intraop: {
          airwayTools:       awTools,
          airwayDevices:     awDevices,
          tubeSize:          awTubeSize != null ? Number(awTubeSize) : null,
          cuffed:            awCuffedBool,
          dltType:           awDltType,
          dltSide:           awDltSide,
          dltSize:           awDltSize,
          endobronchialSize: awEbSize,
          cormackLehane:     awClGrade || null,
          ventilationModes:  awVentModes,
          airwayNotes:       awNotes,
        }}),
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch {
      Alert.alert(tc("errorLabel"), "Could not save airway data.")
    } finally {
      setAirwaySectionSaving(false)
    }
  }

  async function saveVascularAccesses(next: VascularEntry[]) {
    setVascularSaving(true)
    try {
      await apiFetch(`/api/cases/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ intraop: { vascularAccesses: next } }),
      })
    } catch { /* best-effort */ } finally { setVascularSaving(false) }
  }

  async function savePositions(next: string[]) {
    setFieldSaving("positions")
    try {
      await apiFetch(`/api/cases/${id}`, { method:"PATCH", body: JSON.stringify({ intraop: { positions: next } }) })
    } catch { /* best-effort */ } finally { setFieldSaving(null) }
  }

  async function saveMonitoring(next: string[]) {
    setFieldSaving("monitoring")
    const obj: Record<string, boolean> = {}
    for (const opt of MONITORING_OPTS) obj[opt.field] = next.includes(opt.label)
    try {
      await apiFetch(`/api/cases/${id}`, { method:"PATCH", body: JSON.stringify({ intraop: obj }) })
    } catch { /* best-effort */ } finally { setFieldSaving(null) }
  }

  async function saveTechniques(next: string[]) {
    setFieldSaving("techniques")
    try {
      const patch: Record<string, unknown> = { techniques: next }
      const monDefaults = computeMonitoringDefaults(next, monitoring)
      if (monDefaults) {
        setMonitoring(monDefaults)
        for (const opt of MONITORING_OPTS) patch[opt.field] = monDefaults.includes(opt.label)
      }
      await apiFetch(`/api/cases/${id}`, { method:"PATCH", body: JSON.stringify({ intraop: patch }) })
      setCaseInfo(prev => prev ? { ...prev, techniques: next } : prev)
    } catch { /* best-effort */ } finally { setFieldSaving(null) }
  }

  async function saveGasSettings(overrides?: { fgfLitersPerMin?: number; fio2Percent?: number; carrierGasOverride?: string | null }) {
    setGasSaving(true)
    try {
      await apiFetch(`/api/cases/${id}`, { method:"PATCH", body: JSON.stringify({ intraop: {
        fgfLitersPerMin: overrides?.fgfLitersPerMin ?? fgfLitersPerMin ?? null,
        carrierGas:      "carrierGasOverride" in (overrides ?? {}) ? (overrides?.carrierGasOverride ?? null) : (carrierGas ?? null),
        fio2Percent:     overrides?.fio2Percent ?? fio2Percent ?? null,
      }})})
    } catch { /* best-effort */ } finally { setGasSaving(false) }
  }

  function openSlot(col: number) {
    const base = startRef.current ?? new Date()
    setSlotTs(timeAtCol(base, col))
    setSlotOpen(true)
  }

  function openRowQuickAdd(col: number, action: "vital"|"bp"|"drug"|"infusion"|"fluid"|"agent"|"event") {
    const ts = timeAtCol(chartStart, col).toISOString()
    switch (action) {
      case "vital":    openVitals("full", ts); break
      case "bp":       openVitals("bp",   ts); break
      case "drug":     openDrug(ts); break
      case "infusion": openInfusion(ts); break
      case "fluid":    openFluid(ts); break
      case "agent":    openAgent(ts); break
      case "event":    setSlotTs(timeAtCol(chartStart, col)); setSlotOpen(true); break
    }
  }

  function slotIso(): string | undefined {
    return slotTs?.toISOString()
  }

  function openSlotEvent(ev: { label: string; color: string }) {
    const ts = slotIso()
    // Pass ts directly as tsOverride — setEntryTs is async so reading entryTs state
    // immediately after would still see the previous value and default to now.
    save({ type:"clinical_event", label:ev.label, color:ev.color }, ts ?? undefined)
    setSlotOpen(false)
  }

  // ── Computed ──────────────────────────────────────────────────────────

  const lastVitals = log.find(e => e.type === "vital")
  const now        = new Date()
  const timeStr    = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`

  function prevVitalFor(idx: number): LogEvent | undefined {
    for (let i = idx + 1; i < log.length; i++) {
      if (log[i].type === "vital") return log[i]
    }
    return undefined
  }

  const activeTechniques = techniques.length > 0 ? techniques : (caseInfo?.techniques ?? [])
  const isGACase         = activeTechniques.some(t => t.startsWith("GENERAL") || /ga|ett|lma|tiva/i.test(t))

  // Technique-aware favorites
  const favNames: string[] = []
  for (const t of activeTechniques) {
    const hits = TECHNIQUE_FAVORITES[t] ?? []
    for (const n of hits) { if (!favNames.includes(n)) favNames.push(n) }
  }
  const favDrugs = favNames.slice(0, 6).map(name => {
    for (const cat of DRUG_CATS) {
      const found = (cat.drugs as readonly { name: string; unit: string }[]).find(d => d.name === name)
      if (found) return { ...found, color: cat.color, catObj: cat }
    }
    return null
  }).filter(Boolean) as { name: string; unit: string; color: string; catObj: typeof DRUG_CATS[number] }[]

  const ROW_H = 60

  const chartStart = startRef.current ? roundDown5Min(startRef.current) : new Date()
  const currentCol = Math.max(0, Math.floor((Date.now() - chartStart.getTime()) / (5 * 60_000)))
  const nowSlotPercent = Math.max(3, Math.min(97, (((Date.now() - chartStart.getTime()) % (5 * 60_000)) / (5 * 60_000)) * 100))
  const eventRows = log.reduce<Record<number, LogEvent[]>>((acc, ev) => {
    const col = eventCol(ev, chartStart)
    if (!acc[col]) acc[col] = []
    acc[col].push(ev)
    return acc
  }, {})
  const lastEventCol = Math.max(0, ...log.map(ev => eventCol(ev, chartStart)))
  const maxProjectedCol = Math.max(
    currentCol + 6,
    lastEventCol + 6,
    ...timetable.infusions.map(i => i.endCol + 1),
    ...timetable.fluids.map(f => f.endCol + 1),
    ...timetable.agents.map(a => a.endCol + 1),
  )
  const chartRows = Array.from({ length: Math.max(12, maxProjectedCol + 1) }, (_, col) => col)

  function jumpVerticalTimetableToNow() {
    const safeIdx = Math.min(currentCol, chartRows.length - 1)
    if (safeIdx >= 0) {
      verticalTimetableRef.current?.scrollToIndex({ index: safeIdx, animated: true, viewPosition: 0.35 })
    }
  }

  // Auto-scroll to now on mount when switching to timetable tab
  useEffect(() => {
    if (tab !== "log" || !startRef.current) return
    const safeIdx = Math.min(currentCol, chartRows.length - 1)
    if (safeIdx < 0) return
    const timer = setTimeout(() => {
      verticalTimetableRef.current?.scrollToIndex({ index: safeIdx, animated: false, viewPosition: 0.35 })
    }, 80)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // Auto-collapse airway device panel when sub-options are complete
  useEffect(() => {
    if (!awExpandedDevice || awExpandedWasComplete.current) return
    let complete = false
    switch (awExpandedDevice) {
      case "LMA":              complete = awTubeSize != null; break
      case "ORAL_ETT":
      case "NASAL_ETT":        complete = awTubeSize != null && awCuffedBool != null; break
      case "DOUBLE_LUMEN_TUBE":complete = awDltType != null && awDltSide != null && awDltSize != null; break
      case "ENDOBRONCHIAL_TUBE":complete = awEbSize != null; break
    }
    if (complete) setAwExpandedDevice(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awTubeSize, awCuffedBool, awDltType, awDltSide, awDltSize, awEbSize, awExpandedDevice])

  // Auto-scroll when current 5-min slot advances (every 5 min tick)
  useEffect(() => {
    if (tab !== "log" || expandedRow !== null || !startRef.current) return
    if (prevCurrentColRef.current === currentCol) return
    prevCurrentColRef.current = currentCol
    const safeIdx = Math.min(currentCol, chartRows.length - 1)
    if (safeIdx >= 0) {
      verticalTimetableRef.current?.scrollToIndex({ index: safeIdx, animated: true, viewPosition: 0.35 })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCol, tab, expandedRow])

  const TAB_KEYS = ["equipment","technique","timing","position","monitoring","airway","vascular","premedication","log","events"]

  const tabSwipeResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, { dx, dy }) =>
      Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 20,
    onPanResponderRelease: (_, { dx }) => {
      const idx = TAB_KEYS.indexOf(tab)
      if (dx < -50 && idx < TAB_KEYS.length - 1) setTab(TAB_KEYS[idx + 1] as any)
      else if (dx > 50 && idx > 0) setTab(TAB_KEYS[idx - 1] as any)
    },
  }), [tab])

  useEffect(() => {
    const layout = tabLayouts.current[tab]
    if (layout) {
      const scrollX = Math.max(0, layout.x + layout.width / 2 - screenWidth / 2)
      tabRailRef.current?.scrollTo({ x: scrollX, animated: true })
    }
  }, [tab])

  function runningAt(col: number): RunningItem[] {
    const items: RunningItem[] = []
    for (const a of timetable.agents) {
      if (col >= a.startCol && col <= a.endCol) items.push({ id:`agent-${a.name}`, label:a.name, color:a.color })
    }
    for (const i of timetable.infusions) {
      if (col >= i.startCol && col <= i.endCol) items.push({ id:`inf-${i.id}`, label:`${i.name} ${i.rate}`, color:i.color })
    }
    for (const f of timetable.fluids) {
      if (col >= f.startCol && col <= f.endCol) items.push({ id:`fluid-${f.id}`, label:`${f.name} ${f.volume}mL`, color:f.color })
    }
    return items  // no cap — show all parallel infusions, fluids and agents
  }

  function vitalSummary(v?: VitalsEntry) {
    if (!v) return ""
    const parts: string[] = []
    if (v.systolic != null && v.diastolic != null) parts.push(`${v.systolic}/${v.diastolic}`)
    if (v.heartRate != null) parts.push(`HR ${v.heartRate}`)
    if (v.spO2 != null) parts.push(`SpO2 ${v.spO2}`)
    if (v.etco2 != null) parts.push(`CO2 ${v.etco2}`)
    return parts.join("  ")
  }

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex:1, backgroundColor: colors.background }}>
        <AppHeader title="Intraoperative" showNewCase={false} />
        {caseInfo?.status === "COMPLETE" && caseInfo.finalizedAt && (
          <EditWindowBanner finalizedAt={caseInfo.finalizedAt} caseId={id} showBackButton />
        )}
        {isWatching && <WatchingOverlay onTakeover={takeover} />}

        {/* ── Monitor header ─────────────────────────────────────────── */}
        <View style={{ backgroundColor: colors.surface, paddingTop:10, paddingBottom:10,
          paddingHorizontal:16, borderBottomWidth:1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start" }}>
            <View style={{ flex:1, marginRight:12 }}>
              <Text style={{ color:colors.primary, fontSize:10, fontWeight:"700", letterSpacing:1.2, textTransform:"uppercase" }}>
                {caseInfo?.techniques?.map(techniqueLabel).join(" · ") ?? "Anaesthesia"}
              </Text>
              <Text style={{ color:colors.textPrimary, fontSize:16, fontWeight:"700", marginTop:3 }} numberOfLines={1}>
                {caseInfo?.procedure ?? "–"}
              </Text>
              {!!caseInfo?.diagnosis && (
                <Text style={{ color:colors.textSecondary, fontSize:12, marginTop:2 }} numberOfLines={1}>
                  {caseInfo.diagnosis}
                </Text>
              )}
            </View>
            <View style={{ alignItems:"flex-end", gap:4 }}>
              <Text style={{ color:colors.textPrimary, fontSize:30, fontWeight:"200", letterSpacing:1,
                fontVariant:["tabular-nums"] }}>{timeStr}</Text>
              {!startRef.current ? (
                <View style={{ flexDirection:"row", gap:6 }}>
                  <TouchableOpacity
                    onPress={startCaseNow}
                    style={{ borderRadius:10, paddingHorizontal:12, paddingVertical:5,
                      backgroundColor:"#1a1005", borderWidth:1, borderColor:"#f97316aa" }}
                  >
                    <Text style={{ color:"#fb923c", fontSize:11, fontWeight:"900" }}>Start now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      const now = new Date()
                      setStartAtInput(`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`)
                      setStartAtOpen(true)
                    }}
                    style={{ borderRadius:10, paddingHorizontal:12, paddingVertical:5,
                      backgroundColor:"#0f172a", borderWidth:1, borderColor:"#6366f1aa" }}
                  >
                    <Text style={{ color:"#a5b4fc", fontSize:11, fontWeight:"900" }}>Start at…</Text>
                  </TouchableOpacity>
                </View>
              ) : elapsedMs > 60_000 ? (
                <Text style={{ color:colors.textMuted, fontSize:11 }}>+ {fmtElapsed(elapsedMs)}</Text>
              ) : null}
            </View>
          </View>
          <View style={{ marginTop:10, flexDirection:"row", alignItems:"center", justifyContent:"space-between", gap:10 }}>
            <SyncBadge
              state={syncState}
              detail={
                pendingCount > 0 ? `${pendingCount} unsynced`
                : syncState === "saved" && lastSavedAt ? `Saved ${lastSavedAt}`
                : undefined
              }
            />
            {pendingCount > 0 && (
              <TouchableOpacity
                onPress={retryPendingEvents}
                style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:10,
                  borderWidth:1, borderColor:colors.warning, backgroundColor:"#2a210f" }}>
                <Text style={{ color:colors.warning, fontSize:11, fontWeight:"800" }}>Retry sync</Text>
              </TouchableOpacity>
            )}
          </View>
          {lastVitals && (
            <View style={{ flexDirection:"row", gap:18, marginTop:10 }}>
              {lastVitals.systolic != null && lastVitals.diastolic != null && (
                <Text style={{ color:"#ef4444", fontSize:13, fontWeight:"700", fontVariant:["tabular-nums"] }}>
                  {lastVitals.systolic}/{lastVitals.diastolic}
                </Text>
              )}
              {lastVitals.heartRate != null && (
                <Text style={{ color:"#22c55e", fontSize:13, fontWeight:"700", fontVariant:["tabular-nums"] }}>
                  ♥ {lastVitals.heartRate}
                </Text>
              )}
              {lastVitals.spO2 != null && (
                <Text style={{ color:"#06b6d4", fontSize:13, fontWeight:"700", fontVariant:["tabular-nums"] }}>
                  SpO₂ {lastVitals.spO2}%
                </Text>
              )}
              {lastVitals.etco2 != null && (
                <Text style={{ color:"#f59e0b", fontSize:13, fontWeight:"700", fontVariant:["tabular-nums"] }}>
                  CO₂ {lastVitals.etco2}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* ── Case ended banner ──────────────────────────────────────── */}
        {caseEnded && (
          <View style={{ backgroundColor:"#0f2a1a", borderBottomWidth:1, borderBottomColor:"#22c55e44",
            flexDirection:"row", alignItems:"center", justifyContent:"space-between",
            paddingHorizontal:16, paddingVertical:10 }}>
            <Text style={{ color:"#22c55e", fontWeight:"800", fontSize:13 }}>{tc("caseEnded")}</Text>
            <View style={{ flexDirection:"row", alignItems:"center", gap:10 }}>
              {resumeSecsLeft > 0 && (
                <TouchableOpacity onPress={resumeCase}
                  style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:999,
                    borderWidth:1.5, borderColor:"#f59e0b", backgroundColor:"#1a140a" }}>
                  <Text style={{ color:"#f59e0b", fontWeight:"700", fontSize:12 }}>
                    {tc("resumeCase")} ({Math.floor(resumeSecsLeft/60)}:{String(resumeSecsLeft%60).padStart(2,"0")})
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ── Tab bar ────────────────────────────────────────────────── */}
        <View style={{ backgroundColor:"#0a0f1a", borderBottomWidth:1, borderBottomColor:"#1e2d40" }}>
          <ScrollView ref={tabRailRef} horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection:"row", paddingHorizontal:Math.max(0, screenWidth / 2 - 48) }}>
            {([
              ["equipment",tc("tabEquipment")],["technique",tc("tabTechnique")],["timing",tc("tabTiming")],["position",tc("tabPosition")],
              ["monitoring",tc("tabMonitoring")],["airway",tc("tabAirway")],["vascular",tc("tabVascular")],
              ["premedication",tc("tabPremedication")],["log","Timetable"],["events","Event log"],
            ] as [string,string][]).map(([t, label]) => (
              <TouchableOpacity key={t} onPress={() => setTab(t as any)}
                onLayout={(e) => { tabLayouts.current[t] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width } }}
                style={{ paddingHorizontal:16, paddingVertical:8, alignItems:"center",
                  borderBottomWidth:2, borderBottomColor: tab===t ? "#3b82f6" : "transparent" }}>
                <Text style={{ color: tab===t ? "#3b82f6" : "#64748b", fontSize:12, fontWeight:"700" }}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Tab content — swipe gesture wrapper.
            On web, PanResponder gesture handlers on a div can break the flex-1 width
            computation so fixed-padding children overflow the viewport. Explicit
            width + overflow:hidden pins the container to the actual screen width. */}
        <View style={{ flex:1, width: screenWidth, overflow: "hidden" }} {...tabSwipeResponder.panHandlers}>

        {/* ── VERTICAL TIMETABLE TAB ─────────────────────────────────── */}
        {tab === "log" && (
          <View style={{ flex:1, ...(Platform.OS === "web" ? { width: screenWidth } : {}) }}>
            {undoEv && (
              <View style={{ flexDirection:"row", alignItems:"center", gap:10,
                paddingHorizontal:12, paddingVertical:9, backgroundColor:"#17212a",
                borderBottomWidth:1, borderBottomColor:"#2a3a46" }}>
                <Text style={{ color:colors.textSecondary, fontSize:12, flex:1 }} numberOfLines={1}>
                  {eventLabel(undoEv).text} added
                </Text>
                <TouchableOpacity onPress={undoLastEvent}
                  style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:8,
                    backgroundColor:colors.primarySoft, borderWidth:1, borderColor:colors.primary }}>
                  <Text style={{ color:colors.primary, fontSize:11, fontWeight:"900" }}>Undo</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setUndoEv(null)} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                  <Text style={{ color:colors.textMuted, fontSize:13, fontWeight:"800" }}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            )}

            <FlatList
              ref={verticalTimetableRef}
              data={chartRows}
              keyExtractor={col => String(col)}
              style={{ flex:1, ...(Platform.OS === "web" ? { width: screenWidth } : {}) }}
              contentContainerStyle={Platform.OS === "web" ? { width: screenWidth } : undefined}
              getItemLayout={expandedRow === null ? (_data, index) => ({ length: ROW_H, offset: ROW_H * index, index }) : undefined}
              initialNumToRender={24}
              maxToRenderPerBatch={20}
              windowSize={10}
              onScrollToIndexFailed={info => {
                const wait = new Promise(resolve => setTimeout(resolve, 100))
                wait.then(() => {
                  verticalTimetableRef.current?.scrollToIndex({ index: info.highestMeasuredFrameIndex, animated: false })
                })
              }}
              renderItem={({ item: col }) => {
                const t = timeAtCol(chartStart, col)
                const rowEvents = (eventRows[col] ?? []).slice().sort((a,b) =>
                  new Date(a.ts).getTime() - new Date(b.ts).getTime())
                const vital = timetable.vitals[col]
                const running = runningAt(col)
                const isNow = col === currentCol
                const isQuarter = col % 3 === 0
                const isExpanded = col === expandedRow

                // Smart priority summary
                const criticalParts: string[] = []
                const normalParts: string[] = []
                if (vital) {
                  if (vital.systolic != null && vital.systolic < 90)
                    criticalParts.push(`BP ${vital.systolic}/${vital.diastolic ?? "?"}`)
                  else if (vital.systolic != null)
                    normalParts.push(`${vital.systolic}/${vital.diastolic ?? "?"}`)

                  if (vital.heartRate != null && (vital.heartRate < 50 || vital.heartRate > 130))
                    criticalParts.push(`HR ${vital.heartRate}`)
                  else if (vital.heartRate != null)
                    normalParts.push(`HR ${vital.heartRate}`)

                  if (vital.spO2 != null && vital.spO2 < 95)
                    criticalParts.push(`SpO2 ${vital.spO2}`)
                  else if (vital.spO2 != null)
                    normalParts.push(`SpO2 ${vital.spO2}`)

                  if (vital.temp != null && vital.temp < 35)
                    criticalParts.push(`T ${vital.temp}`)
                  else if (vital.temp != null)
                    normalParts.push(`T ${vital.temp}`)

                  if (vital.etco2 != null) normalParts.push(`CO2 ${vital.etco2}`)
                }
                const drugParts = rowEvents
                  .filter(ev => ev.type === "drug" || ev.type === "clinical_event")
                  .slice(0, 4)
                  .map(ev => eventLabel(ev).text)
                const hasCritical = criticalParts.length > 0
                const hasUnsynced = rowEvents.some(ev => ev.syncStatus)

                // ── Expanded row ───────────────────────────────────────────
                if (isExpanded) {
                  return (
                    <View style={{
                      backgroundColor: "#0a1220",
                      borderBottomWidth: 2, borderBottomColor: "#f9731644",
                      borderTopWidth: isNow ? 1 : 0, borderTopColor: "#f9731633",
                    }}>
                      {/* Header — tap to collapse */}
                      <TouchableOpacity
                        onPress={() => setExpandedRow(null)}
                        activeOpacity={0.7}
                        style={{
                          height: ROW_H, flexDirection: "row", alignItems: "center",
                          paddingLeft: 12, paddingRight: 14,
                          borderBottomWidth: 1, borderBottomColor: "#1a2a3a",
                        }}
                      >
                        <Text style={{
                          color: "#fb923c", fontSize: 13, fontWeight: "800",
                          fontVariant: ["tabular-nums"], width: 42,
                        }}>
                          {formatDateHHMM(t)}
                        </Text>
                        <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 4, paddingHorizontal: 8 }}>
                          {vital && (
                            <View style={{ backgroundColor: "#1a3028", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                              <Text style={{ color: hasCritical ? "#ef4444" : "#22c55e", fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                                {criticalParts.length > 0 ? criticalParts.join("  ") : normalParts.slice(0, 2).join("  ")}
                              </Text>
                            </View>
                          )}
                          {rowEvents.filter(ev => ev.type === "drug" || ev.type === "clinical_event").slice(0, 4).map(ev => (
                            <View key={ev.id} style={{
                              backgroundColor: (ev.color ?? "#3b82f6") + "22",
                              borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
                              borderWidth: 1, borderColor: (ev.color ?? "#3b82f6") + "55",
                            }}>
                              <Text style={{ color: ev.color ?? "#3b82f6", fontSize: 11, fontWeight: "600" }}>
                                {eventLabel(ev).text}
                              </Text>
                            </View>
                          ))}
                        </View>
                        <Text style={{ color: "#475569", fontSize: 18, fontWeight: "300" }}>×</Text>
                      </TouchableOpacity>

                      {/* Running items */}
                      {running.length > 0 && (
                        <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}>
                          <Text style={{
                            color: "#475569", fontSize: 10, fontWeight: "700",
                            letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 8,
                          }}>Running</Text>
                          <View style={{ gap: 7 }}>
                            {running.map(item => {
                              const activeInf = activeInfusions.find(i => item.id === `inf-${i.infId}`)
                              const activeFl  = activeFluids.find(f => item.id === `fluid-${f.fluidId}`)
                              const isAgentItem = item.id.startsWith("agent-")
                              const canManage = !!(activeInf || activeFl || (isAgentItem && activeAgent))
                              return (
                                <TouchableOpacity
                                  key={item.id}
                                  activeOpacity={canManage ? 0.7 : 1}
                                  onPress={() => {
                                    if (activeInf) { setInfActTgt(activeInf); setInfActRate(activeInf.rate); setInfActOpen(true) }
                                    else if (activeFl) { openFluidEnd(activeFl) }
                                    else if (isAgentItem && activeAgent) {
                                      Alert.alert(`Stop ${activeAgent.name}?`, undefined, [
                                        { text: tc("cancelLabel"), style: "cancel" },
                                        { text: "Stop", style: "destructive", onPress: stopAgent },
                                      ])
                                    }
                                  }}
                                  style={{
                                    flexDirection: "row", alignItems: "center",
                                    backgroundColor: item.color + "14",
                                    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
                                    borderWidth: 1, borderColor: item.color + "44",
                                    borderLeftWidth: 4, borderLeftColor: item.color,
                                  }}
                                >
                                  <Text style={{ color: item.color, fontSize: 13, fontWeight: "700", flex: 1 }}>
                                    {item.label}
                                  </Text>
                                  {canManage && (
                                    <Text style={{ color: "#64748b", fontSize: 11 }}>
                                      {activeInf ? "Manage" : activeFl ? "End fluid" : "Stop"} →
                                    </Text>
                                  )}
                                </TouchableOpacity>
                              )
                            })}
                          </View>
                        </View>
                      )}

                      {/* Quick-add grid */}
                      <View style={{ paddingHorizontal: 14, paddingTop: running.length > 0 ? 4 : 12, paddingBottom: 16 }}>
                        <Text style={{
                          color: "#475569", fontSize: 10, fontWeight: "700",
                          letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 10,
                        }}>Add now</Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                          {([
                            { label: "Vitals",   action: "vital"    as const, color: "#22c55e" },
                            { label: "Drug",     action: "drug"     as const, color: "#3b82f6" },
                            { label: "Infusion", action: "infusion" as const, color: "#a855f7" },
                            { label: "Fluid",    action: "fluid"    as const, color: "#06b6d4" },
                            { label: "Agent",    action: "agent"    as const, color: "#f59e0b" },
                            { label: "Event",    action: "event"    as const, color: "#6366f1" },
                          ]).map(btn => (
                            <TouchableOpacity
                              key={btn.action}
                              onPress={() => openRowQuickAdd(col, btn.action)}
                              style={{
                                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                                backgroundColor: btn.color + "18",
                                borderWidth: 1, borderColor: btn.color + "44",
                              }}
                            >
                              <Text style={{ color: btn.color, fontSize: 12, fontWeight: "700" }}>
                                {btn.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    </View>
                  )
                }

                // ── Collapsed row ──────────────────────────────────────────
                return (
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setExpandedRow(col)}
                    style={{
                      height: ROW_H,
                      flexDirection: "row",
                      alignItems: "stretch",
                      position: "relative",
                      borderBottomWidth: 1,
                      borderBottomColor: isNow ? "#f9731633" : isQuarter ? "#1e2d40" : "#0f1826",
                      backgroundColor: isNow ? "rgba(249,115,22,0.035)" : "transparent",
                    }}
                  >
                    {/* Now line at exact fractional position within this row */}
                    {isNow && (
                      <View
                        pointerEvents="none"
                        style={{
                          position: "absolute", left: 0, right: 0,
                          top: (nowSlotPercent / 100) * ROW_H - 1,
                          height: 2,
                          backgroundColor: "#f97316",
                          zIndex: 20,
                          boxShadow: "0 0 10px rgba(249,115,22,0.85)",
                        }}
                      />
                    )}

                    {/* Time label */}
                    <View style={{ width: 54, alignItems: "flex-end", paddingRight: 8, justifyContent: "center" }}>
                      <Text style={{
                        color: isNow ? "#fb923c" : isQuarter ? "#cbd5e1" : "#475569",
                        fontSize: isNow || isQuarter ? 12 : 11,
                        fontWeight: isNow || isQuarter ? "700" : "500",
                        fontVariant: ["tabular-nums"],
                      }}>
                        {formatDateHHMM(t)}
                      </Text>
                    </View>

                    {/* Timeline spine + dot */}
                    <View style={{ width: 18, alignItems: "center" }}>
                      <View style={{ position: "absolute", top: 0, bottom: 0, width: 1.5, backgroundColor: "#1a2540" }} />
                      <View style={{
                        marginTop: ROW_H / 2 - 4,
                        width: vital ? 9 : 6,
                        height: vital ? 9 : 6,
                        borderRadius: 8,
                        backgroundColor: hasCritical ? "#ef4444" : vital ? "#22c55e" : isQuarter ? "#2d3e55" : "#151f30",
                        borderWidth: isNow ? 2 : 0,
                        borderColor: "#f97316",
                      }} />
                    </View>

                    {/* Content — priority summary */}
                    <View style={{ flex: 1, justifyContent: "center", paddingLeft: 6, paddingRight: 4 }}>
                      {hasCritical && (
                        <Text style={{
                          color: "#ef4444", fontSize: 12, fontWeight: "800",
                          fontVariant: ["tabular-nums"], lineHeight: 16,
                        }} numberOfLines={1}>
                          {criticalParts.join("  ")}
                        </Text>
                      )}
                      {normalParts.length > 0 && (
                        <Text style={{
                          color: hasCritical ? "#64748b" : "#94a3b8",
                          fontSize: hasCritical ? 10 : 12,
                          fontVariant: ["tabular-nums"],
                          lineHeight: hasCritical ? 14 : 16,
                        }} numberOfLines={1}>
                          {normalParts.join("  ")}
                        </Text>
                      )}
                      {drugParts.length > 0 && (
                        <Text style={{ color: "#4a5c6e", fontSize: 10, lineHeight: 13 }} numberOfLines={1}>
                          {drugParts.join("  ·  ")}
                        </Text>
                      )}
                      {hasUnsynced && (
                        <Text style={{ color: colors.warning, fontSize: 9, fontWeight: "800", lineHeight: 12 }}>
                          unsynced
                        </Text>
                      )}
                    </View>

                    {/* Running strips — full height, stacked from right edge inward (5px each) */}
                    <View style={{ flexDirection: "row", alignSelf: "stretch" }}>
                      {running.slice().reverse().map(item => (
                        <View key={item.id} style={{ width: 5, backgroundColor: item.color + "88" }} />
                      ))}
                    </View>
                  </TouchableOpacity>
                )
              }}
            />

            {/* Footer: Now + End case */}
            <View style={{
              flexDirection: "row", gap: 10,
              paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 16,
              backgroundColor: "#070c14", borderTopWidth: 1, borderTopColor: "#0f172a",
            }}>
              <TouchableOpacity
                onPress={jumpVerticalTimetableToNow}
                disabled={!startRef.current}
                style={{
                  flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center",
                  backgroundColor: "#0f1828",
                  borderWidth: 1, borderColor: "#f9731655",
                  opacity: startRef.current ? 1 : 0.35,
                }}
              >
                <Text style={{ color: "#fb923c", fontSize: 13, fontWeight: "800" }}>↓ Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { if (!isWatching) openEndCase() }}
                disabled={isWatching}
                style={{
                  flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center",
                  backgroundColor: "#1a1005", borderWidth: 1, borderColor: "#f9731644",
                  opacity: isWatching ? 0.4 : 1,
                }}
              >
                <Text style={{ color: "#fb923c", fontSize: 13, fontWeight: "800" }}>End case</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── EQUIPMENT TAB ──────────────────────────────────────────── */}
        {tab === "equipment" && (() => {
          const hasPreop = preop && (preop.age != null || preop.weight != null || preop.height != null)
          const cats = hasPreop ? calcEquipment(preop?.age, preop?.weight, preop?.height, preop?.sex) : []
          return (
            <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
              {!hasPreop ? (
                <View style={{ backgroundColor:"#111111", borderRadius:14, borderWidth:1, borderColor:"#1e2d40",
                  padding:20, alignItems:"center" }}>
                  <Text style={{ color:"#64748b", fontSize:13, textAlign:"center", lineHeight:20 }}>
                    — Add patient details in preop to see suggestions —
                  </Text>
                </View>
              ) : (
                <>
                  {/* Patient summary */}
                  <View style={{ backgroundColor:"#111111", borderRadius:14, borderWidth:1, borderColor:"#1e2d40",
                    padding:14, marginBottom:16, flexDirection:"row", gap:16, flexWrap:"wrap" }}>
                    {preop?.age    != null && <Text style={{ color:"#94a3b8", fontSize:13 }}>Age <Text style={{ color:"#f8fafc", fontWeight:"700" }}>{preop.age < 1 ? `${Math.round(preop.age * 12)}mo` : `${preop.age}y`}</Text></Text>}
                    {preop?.weight != null && <Text style={{ color:"#94a3b8", fontSize:13 }}>Weight <Text style={{ color:"#f8fafc", fontWeight:"700" }}>{preop.weight} kg</Text></Text>}
                    {preop?.height != null && <Text style={{ color:"#94a3b8", fontSize:13 }}>Height <Text style={{ color:"#f8fafc", fontWeight:"700" }}>{preop.height} cm</Text></Text>}
                    {preop?.sex    != null && <Text style={{ color:"#94a3b8", fontSize:13 }}>Sex <Text style={{ color:"#f8fafc", fontWeight:"700" }}>{preop.sex}</Text></Text>}
                  </View>

                  {cats.map((cat, ci) => (
                    <View key={cat.cat} style={{ marginBottom: ci < cats.length - 1 ? 16 : 0 }}>
                      <View style={{ flexDirection:"row", alignItems:"center", marginBottom:8, gap:8 }}>
                        <View style={{ width:3, height:14, borderRadius:2, backgroundColor: cat.color }} />
                        <Text style={{ color: cat.color, fontSize:10, fontWeight:"700", letterSpacing:1.2, textTransform:"uppercase" }}>
                          {cat.cat}
                        </Text>
                      </View>
                      <View style={{ backgroundColor:"#111111", borderRadius:14, borderWidth:1, borderColor:"#1e2d40", padding:14 }}>
                        {cat.items.map((item, ii) => (
                          <View key={item.label} style={{
                            flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start",
                            paddingVertical:8,
                            borderBottomWidth: ii < cat.items.length - 1 ? 1 : 0,
                            borderBottomColor:"#1e2d40",
                          }}>
                            <Text style={{ color:"#64748b", fontSize:13, flex:1 }}>{item.label}</Text>
                            <View style={{ alignItems:"flex-end" }}>
                              <Text style={{ color:"#f8fafc", fontSize:13, fontWeight:"700" }}>{item.value}</Text>
                              {!!item.note && <Text style={{ color:"#475569", fontSize:11, marginTop:1 }}>{item.note}</Text>}
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          )
        })()}

        {/* ── TECHNIQUE TAB ──────────────────────────────────────────── */}
        {tab === "technique" && (() => {
          // Current nodes to display — drill down through techPath
          let currentNodes: TechniqueNode[] = TECHNIQUE_TREE
          const breadcrumbs: TechniqueNode[] = []
          for (const code of techPath) {
            const node = currentNodes.find(n => n.v === code)
            if (!node) break
            breadcrumbs.push(node)
            currentNodes = node.children ?? []
          }
          const showOtherInput = techPath[techPath.length - 1] === "OTHER"

          return (
            <View style={{ flex:1 }}>
              {/* Selected chips */}
              {techniques.length > 0 && (
                <View style={{ paddingHorizontal:14, paddingTop:12, paddingBottom:10,
                  borderBottomWidth:1, borderBottomColor:"#1e2d40" }}>
                  <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700",
                    letterSpacing:1.1, textTransform:"uppercase", marginBottom:8 }}>In use</Text>
                  <View style={{ flexDirection:"row", flexWrap:"wrap", gap:7 }}>
                    {techniques.map(t => {
                      const col = techniqueColor(t)
                      return (
                        <TouchableOpacity key={t} onPress={() => {
                          const next = techniques.filter(x => x !== t)
                          setTechniques(next); saveTechniques(next)
                        }} style={{
                          flexDirection:"row", alignItems:"center", gap:6,
                          paddingHorizontal:11, paddingVertical:7, borderRadius:10,
                          backgroundColor: col + "20", borderWidth:1, borderColor: col + "55",
                        }}>
                          <Text style={{ color: col, fontSize:12, fontWeight:"700" }}>
                            {techniqueLabel(t)}
                          </Text>
                          <Text style={{ color: col + "aa", fontSize:13, fontWeight:"300" }}>×</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>
              )}

              {/* Breadcrumb */}
              {breadcrumbs.length > 0 && (
                <View style={{ flexDirection:"row", alignItems:"center", gap:0,
                  paddingHorizontal:14, paddingVertical:10, borderBottomWidth:1, borderBottomColor:"#1a2030" }}>
                  <TouchableOpacity onPress={() => setTechPath([])} style={{ paddingRight:6 }}>
                    <Text style={{ color:"#475569", fontSize:12 }}>All</Text>
                  </TouchableOpacity>
                  {breadcrumbs.map((b, i) => (
                    <React.Fragment key={b.v}>
                      <Text style={{ color:"#2a3a4a", fontSize:12 }}> › </Text>
                      <TouchableOpacity onPress={() => setTechPath(p => p.slice(0, i + 1))}>
                        <Text style={{ color: i === breadcrumbs.length - 1 ? "#94a3b8" : "#475569", fontSize:12 }}>{b.label}</Text>
                      </TouchableOpacity>
                    </React.Fragment>
                  ))}
                </View>
              )}

              <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:14, paddingBottom:40 }}>
                {/* Back button */}
                {techPath.length > 0 && !showOtherInput && (
                  <TouchableOpacity onPress={() => setTechPath(p => p.slice(0, -1))}
                    style={{ flexDirection:"row", alignItems:"center", gap:6, marginBottom:14,
                      paddingVertical:8 }}>
                    <Text style={{ color:"#3b82f6", fontSize:14 }}>←</Text>
                    <Text style={{ color:"#3b82f6", fontSize:13, fontWeight:"600" }}>Back</Text>
                  </TouchableOpacity>
                )}

                {/* Other free-text input */}
                {showOtherInput ? (
                  <View>
                    <Text style={{ color:"#94a3b8", fontSize:11, marginBottom:10 }}>
                      Describe the technique:
                    </Text>
                    <TextInput
                      style={{ backgroundColor:"#111111", color:"#f8fafc", borderRadius:10,
                        padding:12, fontSize:14, borderWidth:1, borderColor:"#2a3a4a" }}
                      placeholder="e.g. Ketamine dissociative"
                      placeholderTextColor="#475569"
                      value={otherTechText}
                      onChangeText={setOtherTechText}
                      autoFocus
                    />
                    <TouchableOpacity
                      onPress={() => {
                        if (!otherTechText.trim()) return
                        const code = `OTHER:${otherTechText.trim()}`
                        if (!techniques.includes(code)) {
                          const next = [...techniques, code]
                          setTechniques(next); saveTechniques(next)
                        }
                        setOtherTechText(""); setTechPath([])
                      }}
                      style={{ marginTop:12, borderRadius:10, paddingVertical:13, alignItems:"center",
                        backgroundColor:"#1e2d40", borderWidth:1, borderColor:"#64748b44" }}>
                      <Text style={{ color:"#94a3b8", fontWeight:"700", fontSize:14 }}>Add technique</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setOtherTechText(""); setTechPath([]) }}
                      style={{ marginTop:8, paddingVertical:10, alignItems:"center" }}>
                      <Text style={{ color:"#475569", fontSize:13 }}>{tc("cancelLabel")}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ gap:8 }}>
                    {currentNodes.map(node => {
                      const isLeaf = !node.children || node.children.length === 0
                      const isSelected = isLeaf && techniques.includes(node.v)
                      const col = techniqueColor(node.v)
                      return (
                        <TouchableOpacity
                          key={node.v}
                          onPress={() => {
                            if (node.isOther) { setTechPath(p => [...p, node.v]); return }
                            if (isLeaf) {
                              const next = isSelected
                                ? techniques.filter(x => x !== node.v)
                                : [...techniques, node.v]
                              setTechniques(next); saveTechniques(next)
                            } else {
                              setTechPath(p => [...p, node.v])
                            }
                          }}
                          style={{
                            flexDirection:"row", alignItems:"center",
                            paddingHorizontal:14, paddingVertical:13, borderRadius:12,
                            backgroundColor: isSelected ? col + "20" : "#111111",
                            borderWidth:1, borderColor: isSelected ? col + "66" : "#1e2d40",
                          }}
                        >
                          <View style={{ flex:1 }}>
                            <Text style={{ color: isSelected ? col : "#e2e8f0",
                              fontSize:14, fontWeight: isSelected ? "700" : "500" }}>
                              {node.label}
                            </Text>
                          </View>
                          {isSelected && (
                            <Text style={{ color: col, fontSize:16, marginRight:4 }}>✓</Text>
                          )}
                          {!isLeaf && (
                            <Text style={{ color:"#475569", fontSize:16 }}>›</Text>
                          )}
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                )}
              </ScrollView>

              {/* ── Gas settings ─────────────────────────────────────── */}
              {isGACase && (
                <View style={{ borderTopWidth:1, borderTopColor:"#1e2d40", padding:16, paddingBottom:24 }}>
                  <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
                    textTransform:"uppercase", marginBottom:14 }}>
                    {tc("gasSettings")} {gasSaving ? "(saving…)" : ""}
                  </Text>

                  <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", marginBottom:8 }}>FGF (Fresh Gas Flow)</Text>
                  <View style={{ marginBottom:18 }}>
                    <VitalStepper value={fgfLitersPerMin} onChange={setFgfLitersPerMin}
                      min={0} max={100} step={0.5} precision={1} unit="L/min" />
                  </View>

                  {/* Carrier gas */}
                  <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", marginBottom:8 }}>Carrier gas</Text>
                  <View style={{ flexDirection:"row", gap:8, marginBottom:18 }}>
                    <View style={{ flex:1, paddingVertical:11, borderRadius:10, alignItems:"center",
                      backgroundColor:"#1d4ed8", borderWidth:1.5, borderColor:"#3b82f6" }}>
                      <Text style={{ color:"#ffffff", fontSize:13, fontWeight:"800" }}>O₂</Text>
                    </View>
                    {([{ key:"air", label:"Air" }, { key:"n2o", label:"N₂O" }] as const).map(g => {
                      const selected = carrierGas === g.key
                      return (
                        <TouchableOpacity key={g.key} onPress={() => setCarrierGas(g.key)}
                          style={{ flex:1, paddingVertical:11, borderRadius:10, alignItems:"center", borderWidth:1.5,
                            borderColor:selected ? "#3b82f6" : "#1e2d40",
                            backgroundColor:selected ? "#1d4ed8" : "#111111" }}>
                          <Text style={{ color:selected ? "#ffffff" : "#64748b", fontSize:13, fontWeight:"800" }}>{g.label}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>

                  {/* FiO2 */}
                  <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", marginBottom:8 }}>FiO₂</Text>
                  <VitalStepper value={fio2Percent} onChange={setFio2Percent}
                    min={0} max={100} step={1} unit="%" />
                </View>
              )}
            </View>
          )
        })()}

        {/* ── TIMING TAB ─────────────────────────────────────────────── */}
        {tab === "timing" && (() => {
          // Compute duration from caseStartTime / caseEndTime strings (HH:MM)
          let durationStr = ""
          if (caseStartTime && caseEndTime) {
            const [sh, sm] = caseStartTime.split(":").map(Number)
            const [eh, em] = caseEndTime.split(":").map(Number)
            if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
              let mins = (eh * 60 + em) - (sh * 60 + sm)
              if (caseEndNextDay) mins += 24 * 60
              if (mins > 0) {
                const h = Math.floor(mins / 60); const m = mins % 60
                durationStr = h > 0 ? `${h}h ${m}m` : `${m}m`
              }
            }
          }
          const nowHHMM = `${String(new Date().getHours()).padStart(2,"0")}:${String(new Date().getMinutes()).padStart(2,"0")}`
          return (
            <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>

              {/* Month/Year */}
              <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
                textTransform:"uppercase", marginBottom:8 }}>{tc("caseMonthYear")}</Text>
              <TextInput
                style={{ backgroundColor:"#111111", color:"#f8fafc", borderRadius:10, padding:12,
                  fontSize:16, borderWidth:1, borderColor:"#2a3a4a", marginBottom:18 }}
                placeholder="YYYY-MM  (e.g. 2026-05)"
                placeholderTextColor="#475569"
                value={caseMonthYear}
                onChangeText={setCaseMonthYear}
                onBlur={() => saveTiming()}
              />

              {/* Start time */}
              <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
                textTransform:"uppercase", marginBottom:8 }}>{tc("anesthesiaStartTime")}</Text>
              <View style={{ flexDirection:"row", gap:10, marginBottom:8 }}>
                {startRef.current ? (
                  // Locked — once case has started the start time cannot be changed
                  <View style={{ flex:1, backgroundColor:"#0a0f1a", borderRadius:10, padding:12,
                    borderWidth:1, borderColor:"#1e2d40", alignItems:"center", flexDirection:"row", gap:8 }}>
                    <Text style={{ flex:1, color:"#f8fafc", fontSize:22, fontWeight:"700",
                      fontVariant:["tabular-nums"], textAlign:"center" }}>{caseStartTime}</Text>
                    <Text style={{ color:"#475569", fontSize:10, fontWeight:"700" }}>LOCKED</Text>
                  </View>
                ) : (
                  <>
                    <TextInput
                      style={{ flex:1, minWidth:0, backgroundColor:"#111111", color:"#f8fafc", borderRadius:10, padding:12,
                        fontSize:22, fontWeight:"700", borderWidth:1, borderColor:"#2a3a4a", textAlign:"center",
                        fontVariant:["tabular-nums"] }}
                      placeholder="08:00"
                      placeholderTextColor="#475569"
                      value={caseStartTime}
                      onChangeText={setCaseStartTime}
                      onBlur={() => saveTiming()}
                    />
                    <TouchableOpacity
                      onPress={() => { setCaseStartTime(nowHHMM); saveTiming({ startTime: nowHHMM }) }}
                      style={{ paddingHorizontal:14, paddingVertical:12, borderRadius:10,
                        backgroundColor:"#1e3a5f", borderWidth:1, borderColor:"#3b82f644",
                        justifyContent:"center" }}>
                      <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"700" }}>Now</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* End time */}
              <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
                textTransform:"uppercase", marginBottom:8 }}>{tc("anesthesiaEndTime")}</Text>
              <View style={{ flexDirection:"row", gap:10, marginBottom:8 }}>
                <TextInput
                  style={{ flex:1, minWidth:0, backgroundColor:"#111111", color:"#f8fafc", borderRadius:10, padding:12,
                    fontSize:22, fontWeight:"700", borderWidth:1, borderColor:"#2a3a4a", textAlign:"center",
                    fontVariant:["tabular-nums"] }}
                  placeholder="14:30"
                  placeholderTextColor="#475569"
                  value={caseEndTime}
                  onChangeText={setCaseEndTime}
                  onBlur={() => saveTiming()}
                />
                <TouchableOpacity
                  onPress={() => { setCaseEndTime(nowHHMM); saveTiming({ endTime: nowHHMM }) }}
                  style={{ paddingHorizontal:14, paddingVertical:12, borderRadius:10,
                    backgroundColor:"#1e3a5f", borderWidth:1, borderColor:"#3b82f644",
                    justifyContent:"center" }}>
                  <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"700" }}>Now</Text>
                </TouchableOpacity>
              </View>

              {/* Next day toggle */}
              <TouchableOpacity
                onPress={() => { setCaseEndNextDay(v => !v); setTimeout(saveTiming, 100) }}
                style={{ flexDirection:"row", alignItems:"center", gap:10, marginBottom:20,
                  paddingHorizontal:14, paddingVertical:10, borderRadius:10,
                  backgroundColor: caseEndNextDay ? "#1e3a5f" : "#111111",
                  borderWidth:1, borderColor: caseEndNextDay ? "#3b82f6" : "#2a3a4a" }}>
                <View style={{ width:20, height:20, borderRadius:4,
                  backgroundColor: caseEndNextDay ? "#3b82f6" : "transparent",
                  borderWidth: caseEndNextDay ? 0 : 1.5, borderColor:"#475569",
                  alignItems:"center", justifyContent:"center" }}>
                  {caseEndNextDay && <Text style={{ color:"#fff", fontSize:11, fontWeight:"900" }}>✓</Text>}
                </View>
                <Text style={{ color: caseEndNextDay ? "#93c5fd" : "#64748b", fontSize:13, fontWeight:"600" }}>
                  {tc("endTimeNextDay")}
                </Text>
              </TouchableOpacity>

              {/* Duration */}
              {durationStr ? (
                <View style={{ backgroundColor:"#0f1a2e", borderRadius:12, padding:14,
                  borderWidth:1, borderColor:"#1e3a5f", alignItems:"center" }}>
                  <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700",
                    textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Duration</Text>
                  <Text style={{ color:"#93c5fd", fontSize:24, fontWeight:"700" }}>{durationStr}</Text>
                </View>
              ) : null}

              {timingSaving && (
                <Text style={{ color:"#64748b", fontSize:11, textAlign:"center", marginTop:12 }}>Saving…</Text>
              )}
            </ScrollView>
          )
        })()}

        {/* ── POSITION TAB ───────────────────────────────────────────── */}
        {tab === "position" && (
          <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
            <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
              textTransform:"uppercase", marginBottom:12 }}>
              Patient Position {fieldSaving === "positions" ? "(saving…)" : ""}
            </Text>
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
              {POSITIONS_LIST.map(pos => {
                const sel = positions.includes(pos.code) || positions.includes(pos.label)
                return (
                  <TouchableOpacity key={pos.code} onPress={() => {
                    const isSelected = positions.includes(pos.code) || positions.includes(pos.label)
                    const next = isSelected
                      ? positions.filter(p => p !== pos.code && p !== pos.label)
                      : [...positions.filter(p => p !== pos.code && p !== pos.label), pos.code]
                    setPositions(next)
                    savePositions(next)
                  }} style={{
                    width:"30%", paddingHorizontal:10, paddingVertical:12, borderRadius:12,
                    backgroundColor: sel ? pos.color + "22" : "#111111",
                    borderWidth:1, borderColor: sel ? pos.color : "#1e2d40",
                    alignItems:"center",
                  }}>
                    <Text style={{ color: sel ? pos.color : "#64748b", fontSize:12, fontWeight:"700",
                      textAlign:"center" }}>{pos.label}</Text>
                    <Text style={{ color: sel ? pos.color + "aa" : "#334155", fontSize:9, marginTop:3,
                      textAlign:"center" }}>{pos.desc}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </ScrollView>
        )}

        {/* ── MONITORING TAB ─────────────────────────────────────────── */}
        {tab === "monitoring" && (
          <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
            {/* Standard monitoring — always visible */}
            <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
              textTransform:"uppercase", marginBottom:8 }}>
              Standard {fieldSaving === "monitoring" ? "(saving…)" : ""}
            </Text>
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:20 }}>
              {MONITORING_OPTS.filter(o => o.section === "standard").map(opt => {
                const sel = monitoring.includes(opt.label)
                return (
                  <TouchableOpacity key={opt.field} onPress={() => {
                    const next = sel ? monitoring.filter(x => x !== opt.label) : [...monitoring, opt.label]
                    setMonitoring(next)
                    saveMonitoring(next)
                  }} style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
                    backgroundColor: sel ? "#0f2a1a" : "#111111",
                    borderWidth:1, borderColor: sel ? "#22c55e" : "#1e2d40" }}>
                    <Text style={{ color: sel ? "#86efac" : "#64748b", fontSize:12, fontWeight:"700" }}>{opt.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Advanced monitoring — collapsible */}
            {(() => {
              const advOpts = MONITORING_OPTS.filter(o => o.section !== "standard")
              const advCount = advOpts.filter(o => monitoring.includes(o.label)).length
              return (
                <>
                  <TouchableOpacity onPress={() => setAdvMonOpen(v => !v)}
                    style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between",
                      marginBottom: advMonOpen ? 12 : 0 }}>
                    <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2, textTransform:"uppercase" }}>
                      Advanced {advCount > 0 ? `(${advCount})` : ""}
                    </Text>
                    <Text style={{ color:"#475569", fontSize:11, fontWeight:"700" }}>{advMonOpen ? "▲" : "▼"}</Text>
                  </TouchableOpacity>
                  {advMonOpen && [
                    { key:"respiratory",  label:"Respiratory" },
                    { key:"haemodynamic", label:"Haemodynamic" },
                    { key:"depth",        label:"Depth / Neuro" },
                    { key:"other",        label:"Other" },
                  ].map(sec => {
                    const opts = advOpts.filter(o => o.section === sec.key)
                    if (!opts.length) return null
                    return (
                      <View key={sec.key} style={{ marginBottom:16 }}>
                        <Text style={{ color:"#475569", fontSize:9, fontWeight:"700", letterSpacing:1, textTransform:"uppercase",
                          marginBottom:8, paddingLeft:4, borderLeftWidth:2, borderLeftColor:"#1e3a5f" }}>
                          {sec.label}
                        </Text>
                        <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                          {opts.map(opt => {
                            const sel = monitoring.includes(opt.label)
                            return (
                              <TouchableOpacity key={opt.field} onPress={() => {
                                const next = sel ? monitoring.filter(x => x !== opt.label) : [...monitoring, opt.label]
                                setMonitoring(next)
                                saveMonitoring(next)
                              }} style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:10,
                                backgroundColor: sel ? "#0f2a1a" : "#111111",
                                borderWidth:1, borderColor: sel ? "#22c55e" : "#1e2d40" }}>
                                <Text style={{ color: sel ? "#86efac" : "#64748b", fontSize:11, fontWeight:"700" }}>{opt.label}</Text>
                              </TouchableOpacity>
                            )
                          })}
                        </View>
                      </View>
                    )
                  })}
                </>
              )
            })()}

          </ScrollView>
        )}

        {/* ── AIRWAY TAB ─────────────────────────────────────────────── */}
        {tab === "airway" && (
          <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
            {/* Tools used */}
            <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
              textTransform:"uppercase", marginBottom:10 }}>Tools used</Text>
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:20 }}>
              {AIRWAY_TOOLS.map(tool => {
                const sel = awTools.includes(tool.code)
                return (
                  <TouchableOpacity key={tool.code} onPress={() => {
                    setAwTools(prev => sel ? prev.filter(x => x !== tool.code) : [...prev, tool.code])
                  }} style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
                    backgroundColor: sel ? "#1e3a5f" : "#111111",
                    borderWidth:1, borderColor: sel ? "#3b82f6" : "#1e2d40" }}>
                    <Text style={{ color: sel ? "#93c5fd" : "#64748b", fontSize:12, fontWeight:"700" }}>{tool.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Cormack-Lehane grade */}
            {(awTools.includes("DIRECT_LARY") || awTools.includes("VIDEO_LARY")) && (
              <>
                <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
                  textTransform:"uppercase", marginBottom:10 }}>Cormack-Lehane grade</Text>
                <View style={{ flexDirection:"row", gap:8, marginBottom:20 }}>
                  {CL_GRADES.map(g => (
                    <TouchableOpacity key={g.code} onPress={() => setAwClGrade(awClGrade === g.code ? "" : g.code)}
                      style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                        backgroundColor: awClGrade === g.code ? g.color + "33" : "#111111",
                        borderWidth:2, borderColor: awClGrade === g.code ? g.color : "#1e2d40" }}>
                      <Text style={{ color: awClGrade === g.code ? g.color : "#64748b",
                        fontWeight:"800", fontSize:14 }}>{g.code}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Airway devices */}
            {(() => {
              const deviceSummary: Record<string, string | null> = {
                LMA:               awTubeSize ? `LMA ${awTubeSize}` : null,
                ORAL_ETT:          awTubeSize && awCuffedBool != null ? `Oral ETT ${awTubeSize} ${awCuffedBool ? "Cuffed" : "Uncuffed"}` : null,
                NASAL_ETT:         awTubeSize && awCuffedBool != null ? `Nasal ETT ${awTubeSize} ${awCuffedBool ? "Cuffed" : "Uncuffed"}` : null,
                DOUBLE_LUMEN_TUBE: (awDltType || awDltSide || awDltSize) ? `DLT${awDltType ? " "+awDltType : ""}${awDltSide ? " "+awDltSide : ""}${awDltSize ? " "+awDltSize+"Fr" : ""}` : null,
                ENDOBRONCHIAL_TUBE:awEbSize ? `EB ${awEbSize}mm` : null,
              }
              function expandDevice(code: string) {
                let wasComplete = false
                switch (code) {
                  case "LMA":              wasComplete = awTubeSize != null; break
                  case "ORAL_ETT":
                  case "NASAL_ETT":        wasComplete = awTubeSize != null && awCuffedBool != null; break
                  case "DOUBLE_LUMEN_TUBE":wasComplete = awDltType != null && awDltSide != null && awDltSize != null; break
                  case "ENDOBRONCHIAL_TUBE":wasComplete = awEbSize != null; break
                }
                awExpandedWasComplete.current = wasComplete
                setAwExpandedDevice(code)
              }
              return (
                <>
                  <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
                    textTransform:"uppercase", marginBottom:10 }}>Device used</Text>
                  <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:12 }}>
                    {AIRWAY_DEVICES.map(dev => {
                      const sel = awDevices.includes(dev.code)
                      const hasSub = AIRWAY_HAS_SUBOPTIONS.includes(dev.code)
                      const summary = sel && hasSub ? deviceSummary[dev.code] : null
                      const isExpanded = awExpandedDevice === dev.code
                      const btnLabel = summary && !isExpanded ? summary : dev.label
                      return (
                        <TouchableOpacity key={dev.code} onPress={() => {
                          if (sel && hasSub) {
                            isExpanded ? setAwExpandedDevice(null) : expandDevice(dev.code)
                          } else if (sel) {
                            setAwDevices(prev => prev.filter(x => x !== dev.code))
                            if (awExpandedDevice === dev.code) setAwExpandedDevice(null)
                          } else {
                            setAwDevices(prev => [...prev, dev.code])
                            if (hasSub) expandDevice(dev.code)
                          }
                        }} style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
                          backgroundColor: sel ? (summary && !isExpanded ? "#1a2e5a" : "#1e3a5f") : "#111111",
                          borderWidth:1, borderColor: sel ? "#3b82f6" : "#1e2d40" }}>
                          <Text style={{ color: sel ? "#93c5fd" : "#64748b", fontSize:12, fontWeight:"700" }}>{btnLabel}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>

                  {/* Sub-option panel — LMA */}
                  {awDevices.includes("LMA") && awExpandedDevice === "LMA" && (
                    <View style={{ backgroundColor:"#0d1a2d", borderRadius:12, borderWidth:1,
                      borderColor:"#1e3a5f", padding:12, marginBottom:12 }}>
                      <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"700", marginBottom:10 }}>LMA</Text>
                      <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase",
                        letterSpacing:1, marginBottom:6 }}>Size</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection:"row", gap:6 }}>
                          {["1","1.5","2","2.5","3","4","5","6"].map(s => (
                            <TouchableOpacity key={s} onPress={() => setAwTubeSize(awTubeSize === s ? null : s)}
                              style={{ paddingHorizontal:14, paddingVertical:8, borderRadius:8,
                                backgroundColor: awTubeSize === s ? "#3b82f6" : "#1e2d40",
                                borderWidth:1, borderColor:"#3b82f644" }}>
                              <Text style={{ color: awTubeSize === s ? "#fff" : "#93c5fd", fontWeight:"700", fontSize:13 }}>{s}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  )}

                  {/* Sub-option panel — Oral/Nasal ETT */}
                  {awDevices.some(d => ["ORAL_ETT","NASAL_ETT"].includes(d)) && (awExpandedDevice === "ORAL_ETT" || awExpandedDevice === "NASAL_ETT") && (
                    <View style={{ backgroundColor:"#0d1a2d", borderRadius:12, borderWidth:1,
                      borderColor:"#1e3a5f", padding:12, marginBottom:12 }}>
                      <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"700", marginBottom:10 }}>
                        {awExpandedDevice === "ORAL_ETT" ? "Oral ETT" : "Nasal ETT"}
                      </Text>
                      <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase",
                        letterSpacing:1, marginBottom:6 }}>Tube Size (mm ID)</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:10 }}>
                        <View style={{ flexDirection:"row", gap:6 }}>
                          {["4.0","4.5","5.0","5.5","6.0","6.5","7.0","7.5","8.0","8.5","9.0","9.5"].map(s => (
                            <TouchableOpacity key={s} onPress={() => setAwTubeSize(awTubeSize === s ? null : s)}
                              style={{ paddingHorizontal:14, paddingVertical:8, borderRadius:8,
                                backgroundColor: awTubeSize === s ? "#3b82f6" : "#1e2d40",
                                borderWidth:1, borderColor:"#3b82f644" }}>
                              <Text style={{ color: awTubeSize === s ? "#fff" : "#93c5fd", fontWeight:"700", fontSize:13 }}>{s}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                      <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase",
                        letterSpacing:1, marginBottom:6 }}>Cuff</Text>
                      <View style={{ flexDirection:"row", gap:8 }}>
                        {[{ v:true, label:"Cuffed" },{ v:false, label:"Uncuffed" }].map(opt => (
                          <TouchableOpacity key={String(opt.v)} onPress={() => setAwCuffedBool(awCuffedBool === opt.v ? null : opt.v)}
                            style={{ flex:1, paddingVertical:9, borderRadius:8, alignItems:"center",
                              backgroundColor: awCuffedBool === opt.v ? "#1e3a5f" : "#0a0f1a",
                              borderWidth:1, borderColor:"#2a3a4a" }}>
                            <Text style={{ color: awCuffedBool === opt.v ? "#93c5fd" : "#64748b",
                              fontWeight:"700", fontSize:12 }}>{opt.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Sub-option panel — Double Lumen Tube */}
                  {awDevices.includes("DOUBLE_LUMEN_TUBE") && awExpandedDevice === "DOUBLE_LUMEN_TUBE" && (
                    <View style={{ backgroundColor:"#0d1a2d", borderRadius:12, borderWidth:1,
                      borderColor:"#1e3a5f", padding:12, marginBottom:12 }}>
                      <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"700", marginBottom:10 }}>Double Lumen Tube</Text>
                      <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Type</Text>
                      <View style={{ flexDirection:"row", gap:8, marginBottom:10 }}>
                        {(["Carlens","Robertshaw"] as const).map(t => (
                          <TouchableOpacity key={t} onPress={() => setAwDltType(awDltType === t ? null : t)}
                            style={{ flex:1, paddingVertical:9, borderRadius:8, alignItems:"center",
                              backgroundColor: awDltType === t ? "#1e3a5f" : "#0a0f1a",
                              borderWidth:1, borderColor:"#2a3a4a" }}>
                            <Text style={{ color: awDltType === t ? "#93c5fd" : "#64748b", fontWeight:"700", fontSize:12 }}>{t}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Side</Text>
                      <View style={{ flexDirection:"row", gap:8, marginBottom:10 }}>
                        {(["Left","Right"] as const).map(s => (
                          <TouchableOpacity key={s} onPress={() => setAwDltSide(awDltSide === s ? null : s)}
                            style={{ flex:1, paddingVertical:9, borderRadius:8, alignItems:"center",
                              backgroundColor: awDltSide === s ? "#1e3a5f" : "#0a0f1a",
                              borderWidth:1, borderColor:"#2a3a4a" }}>
                            <Text style={{ color: awDltSide === s ? "#93c5fd" : "#64748b", fontWeight:"700", fontSize:13 }}>{s}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Size (Fr)</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection:"row", gap:6 }}>
                          {[26,28,32,35,37,39,41].map(sz => (
                            <TouchableOpacity key={sz} onPress={() => setAwDltSize(awDltSize === sz ? null : sz)}
                              style={{ paddingHorizontal:14, paddingVertical:8, borderRadius:8,
                                backgroundColor: awDltSize === sz ? "#3b82f6" : "#1e2d40",
                                borderWidth:1, borderColor:"#3b82f644" }}>
                              <Text style={{ color: awDltSize === sz ? "#fff" : "#93c5fd", fontWeight:"700", fontSize:13 }}>{sz}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  )}

                  {/* Sub-option panel — Endobronchial Tube */}
                  {awDevices.includes("ENDOBRONCHIAL_TUBE") && awExpandedDevice === "ENDOBRONCHIAL_TUBE" && (
                    <View style={{ backgroundColor:"#0d1a2d", borderRadius:12, borderWidth:1,
                      borderColor:"#1e3a5f", padding:12, marginBottom:12 }}>
                      <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"700", marginBottom:10 }}>Endobronchial Tube</Text>
                      <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Size (mm ID)</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection:"row", gap:6 }}>
                          {[6.0,6.5,7.0,7.5,8.0].map(sz => (
                            <TouchableOpacity key={sz} onPress={() => setAwEbSize(awEbSize === sz ? null : sz)}
                              style={{ paddingHorizontal:14, paddingVertical:8, borderRadius:8,
                                backgroundColor: awEbSize === sz ? "#3b82f6" : "#1e2d40",
                                borderWidth:1, borderColor:"#3b82f644" }}>
                              <Text style={{ color: awEbSize === sz ? "#fff" : "#93c5fd", fontWeight:"700", fontSize:13 }}>{sz}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  )}
                </>
              )
            })()}

            {/* Ventilation mode — hierarchical */}
            <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
              textTransform:"uppercase", marginBottom:10 }}>Ventilation mode</Text>
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:8 }}>
              {/* Spontaneous */}
              {(() => {
                const on = awVentModes.includes("Spontaneous")
                return (
                  <TouchableOpacity onPress={() => setAwVentModes(prev => prev.includes("Spontaneous") ? prev.filter(m => m !== "Spontaneous") : [...prev, "Spontaneous"])}
                    style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
                      backgroundColor: on ? "#0f2a1a" : "#111111",
                      borderWidth:1, borderColor: on ? "#22c55e" : "#1e2d40" }}>
                    <Text style={{ color: on ? "#86efac" : "#64748b", fontSize:12, fontWeight:"700" }}>Spontaneous</Text>
                  </TouchableOpacity>
                )
              })()}
              {/* Assisted expander */}
              {(() => {
                const hasAny = VENT_ASSISTED.some(a => awVentModes.includes(a.v))
                const open = awVentExpanded === "assisted"
                return (
                  <TouchableOpacity onPress={() => setAwVentExpanded(open ? null : "assisted")}
                    style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
                      backgroundColor: hasAny || open ? "#0f2a1a" : "#111111",
                      borderWidth:1, borderColor: hasAny || open ? "#22c55e" : "#1e2d40",
                      flexDirection:"row", alignItems:"center", gap:4 }}>
                    <Text style={{ color: hasAny || open ? "#86efac" : "#64748b", fontSize:12, fontWeight:"700" }}>Assisted</Text>
                    <Text style={{ color:"#475569", fontSize:10 }}>{open ? "▲" : "▼"}</Text>
                  </TouchableOpacity>
                )
              })()}
              {/* Controlled expander */}
              {(() => {
                const hasAny = VENT_CONTROLLED.some(c => awVentModes.includes(c.v))
                const open = awVentExpanded === "controlled"
                return (
                  <TouchableOpacity onPress={() => setAwVentExpanded(open ? null : "controlled")}
                    style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
                      backgroundColor: hasAny || open ? "#0f2a1a" : "#111111",
                      borderWidth:1, borderColor: hasAny || open ? "#22c55e" : "#1e2d40",
                      flexDirection:"row", alignItems:"center", gap:4 }}>
                    <Text style={{ color: hasAny || open ? "#86efac" : "#64748b", fontSize:12, fontWeight:"700" }}>Controlled</Text>
                    <Text style={{ color:"#475569", fontSize:10 }}>{open ? "▲" : "▼"}</Text>
                  </TouchableOpacity>
                )
              })()}
              {/* Jet ventilation */}
              {(() => {
                const on = awVentModes.includes("Jet")
                return (
                  <TouchableOpacity onPress={() => setAwVentModes(prev => prev.includes("Jet") ? prev.filter(m => m !== "Jet") : [...prev, "Jet"])}
                    style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
                      backgroundColor: on ? "#0f2a1a" : "#111111",
                      borderWidth:1, borderColor: on ? "#22c55e" : "#1e2d40" }}>
                    <Text style={{ color: on ? "#86efac" : "#64748b", fontSize:12, fontWeight:"700" }}>Jet ventilation</Text>
                  </TouchableOpacity>
                )
              })()}
            </View>
            {/* Assisted sub-modes */}
            {awVentExpanded === "assisted" && (
              <View style={{ flexDirection:"row", flexWrap:"wrap", gap:6, marginBottom:8,
                paddingLeft:10, borderLeftWidth:2, borderLeftColor:"#1e3a5f" }}>
                {VENT_ASSISTED.map(({ v, label }) => {
                  const on = awVentModes.includes(v)
                  return (
                    <TouchableOpacity key={v} onPress={() => setAwVentModes(prev => {
                      if (prev.includes(v)) return prev.filter(m => m !== v)
                      const controlled = new Set(VENT_CONTROLLED.map(mode => mode.v))
                      return [...prev.filter(m => !controlled.has(m)), v]
                    })}
                      style={{ paddingHorizontal:12, paddingVertical:7, borderRadius:10,
                        backgroundColor: on ? "#0f2a1a" : "#111111",
                        borderWidth:1, borderColor: on ? "#22c55e" : "#1e2d40" }}>
                      <Text style={{ color: on ? "#86efac" : "#64748b", fontSize:11, fontWeight:"700" }}>{label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}
            {/* Controlled sub-modes */}
            {awVentExpanded === "controlled" && (
              <View style={{ flexDirection:"row", flexWrap:"wrap", gap:6, marginBottom:8,
                paddingLeft:10, borderLeftWidth:2, borderLeftColor:"#1e3a5f" }}>
                {VENT_CONTROLLED.map(({ v, label }) => {
                  const on = awVentModes.includes(v)
                  return (
                    <TouchableOpacity key={v} onPress={() => setAwVentModes(prev => {
                      if (prev.includes(v)) return prev.filter(m => m !== v)
                      const assisted = new Set(VENT_ASSISTED.map(mode => mode.v))
                      return [...prev.filter(m => !assisted.has(m)), v]
                    })}
                      style={{ paddingHorizontal:12, paddingVertical:7, borderRadius:10,
                        backgroundColor: on ? "#0f2a1a" : "#111111",
                        borderWidth:1, borderColor: on ? "#22c55e" : "#1e2d40" }}>
                      <Text style={{ color: on ? "#86efac" : "#64748b", fontSize:11, fontWeight:"700" }}>{label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}
            <View style={{ marginBottom:20 }} />

            {/* Notes */}
            <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
              textTransform:"uppercase", marginBottom:8 }}>Notes</Text>
            <TextInput
              style={{ backgroundColor:"#111111", color:"#e2e8f0", borderRadius:10, padding:12,
                fontSize:13, borderWidth:1, borderColor:"#2a3a4a", minHeight:72, marginBottom:20 }}
              placeholder="Additional airway notes…"
              placeholderTextColor="#475569"
              multiline
              value={awNotes}
              onChangeText={setAwNotes}
              onBlur={saveAirwaySection}
            />

          </ScrollView>
        )}

        {/* ── VASCULAR ACCESS TAB ────────────────────────────────────── */}
        {tab === "vascular" && (
          <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
            {/* Existing accesses — pills */}
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:12 }}>
              {vascularAccesses.map((acc, idx) => {
                const clr = vascSiteColor(acc.site)
                const detail = [
                  acc.size && acc.sizeUnit ? `${acc.size}${acc.sizeUnit}` : "",
                  acc.depthCm ? `${acc.depthCm} cm` : "",
                  acc.lumens ? `${acc.lumens} lumen` : "",
                ].filter(Boolean).join(" · ")
                return (
                  <View key={acc.id ?? idx} style={{ flexDirection:"row", alignItems:"center", gap:4,
                    backgroundColor: acc.preexisting ? "#78350f44" : clr + "33",
                    borderRadius:16, paddingHorizontal:10, paddingVertical:6,
                    borderWidth:1, borderColor: acc.preexisting ? "#d97706" : clr }}>
                    {acc.preexisting && (
                      <Text style={{ color:"#f59e0b", fontSize:8, fontWeight:"800", letterSpacing:0.8 }}>PRE</Text>
                    )}
                    <Text style={{ color: acc.preexisting ? "#fbbf24" : clr, fontWeight:"700", fontSize:12 }}>
                      {acc.siteLabel}{detail ? `  (${detail})` : ""}
                    </Text>
                    <TouchableOpacity onPress={() => {
                      const next = vascularAccesses.filter((_, i) => i !== idx)
                      setVascularAccesses(next)
                      saveVascularAccesses(next)
                    }} style={{ marginLeft:2 }}>
                      <Text style={{ color: acc.preexisting ? "#d97706" : clr, fontSize:14, fontWeight:"700" }}>×</Text>
                    </TouchableOpacity>
                  </View>
                )
              })}
              {/* Action buttons */}
              {!vascMode && (
                <>
                  <TouchableOpacity onPress={() => { setVascMode("add"); setVascTreePath([]); setVascPending(null); setVascDetailSize(""); setVascDetailDepth("") }}
                    style={{ flexDirection:"row", alignItems:"center", gap:4, paddingHorizontal:12, paddingVertical:7,
                      borderRadius:16, borderWidth:1.5, borderStyle:"dashed" as any, borderColor:"#1e3a5f" }}>
                    <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"700" }}>
                      + {vascularAccesses.length === 0 ? "Add vascular access" : "Add"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setVascMode("preexisting"); setVascPending(null); setVascDetailSize(""); setVascDetailDepth("") }}
                    style={{ flexDirection:"row", alignItems:"center", gap:4, paddingHorizontal:12, paddingVertical:7,
                      borderRadius:16, borderWidth:1.5, borderStyle:"dashed" as any, borderColor:"#78350f" }}>
                    <Text style={{ color:"#f59e0b", fontSize:12, fontWeight:"700" }}>Already in place</Text>
                  </TouchableOpacity>
                </>
              )}
              {vascMode !== null && !vascPending && (
                <TouchableOpacity onPress={() => setVascMode(null)}
                  style={{ paddingHorizontal:10, paddingVertical:7, alignItems:"center", justifyContent:"center" }}>
                  <Text style={{ color:"#64748b", fontSize:16, fontWeight:"700" }}>×</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Tree picker — Add new */}
            {vascMode === "add" && !vascPending && (() => {
              const nodes = vascTreePath.length === 0 ? VASC_TREE : (vascTreePath[vascTreePath.length - 1].children ?? [])
              return (
                <View style={{ backgroundColor:"#0d1520", borderRadius:12, borderWidth:1, borderColor:"#1e3a5f", padding:12 }}>
                  {vascTreePath.length > 0 && (
                    <View style={{ flexDirection:"row", alignItems:"center", flexWrap:"wrap", gap:2, marginBottom:8 }}>
                      <TouchableOpacity onPress={() => setVascTreePath([])}>
                        <Text style={{ color:"#3b82f6", fontSize:11 }}>Access</Text>
                      </TouchableOpacity>
                      {vascTreePath.map((n, i) => (
                        <View key={n.v} style={{ flexDirection:"row", alignItems:"center", gap:2 }}>
                          <Text style={{ color:"#475569", fontSize:11 }}> › </Text>
                          <TouchableOpacity onPress={() => setVascTreePath(p => p.slice(0, i+1))}>
                            <Text style={{ color:"#3b82f6", fontSize:11 }}>{n.label}</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                    {nodes.map(node => (
                      <TouchableOpacity key={node.v} onPress={() => {
                        if (node.children?.length) { setVascTreePath(p => [...p, node]); return }
                        const crumb = [...vascTreePath, node].map(n => n.label).join(" › ")
                        setVascPending({ v: node.v, label: node.label, crumb })
                        setVascDetailUnit(vascDefaultUnit(node.v))
                        setVascDetailSize("")
                        setVascDetailDepth("")
                        setVascDetailLumens("")
                      }} style={{ flexDirection:"row", alignItems:"center", gap:4, paddingHorizontal:12, paddingVertical:8,
                        borderRadius:10, borderWidth:1, borderColor:"#1e3a5f", backgroundColor:"#111827" }}>
                        <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"600" }}>{node.label}</Text>
                        {node.children && <Text style={{ color:"#475569", fontSize:10 }}>›</Text>}
                      </TouchableOpacity>
                    ))}
                  </View>
                  {vascTreePath.length > 0 && (
                    <TouchableOpacity onPress={() => setVascTreePath(p => p.slice(0,-1))} style={{ marginTop:8 }}>
                      <Text style={{ color:"#475569", fontSize:11 }}>{tc("back")}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            })()}

            {/* Already in place — quick picker */}
            {vascMode === "preexisting" && !vascPending && (
              <View style={{ backgroundColor:"#1c0e00", borderRadius:12, borderWidth:1, borderColor:"#78350f", padding:12 }}>
                <Text style={{ color:"#f59e0b", fontSize:11, fontWeight:"700", marginBottom:8 }}>Select pre-existing access</Text>
                <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                  {VASC_PREEXISTING_QUICK.map(q => (
                    <TouchableOpacity key={q.v} onPress={() => {
                      setVascPending(q)
                      setVascDetailUnit(vascDefaultUnit(q.v))
                      setVascDetailSize("")
                      setVascDetailDepth("")
                      setVascDetailLumens("")
                    }} style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:10,
                      borderWidth:1, borderColor:"#78350f", backgroundColor:"#111827" }}>
                      <Text style={{ color:"#f59e0b", fontSize:12, fontWeight:"600" }}>{q.label}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity onPress={() => { setVascMode("add"); setVascTreePath([]); setVascPending(null) }}
                    style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:10,
                      borderWidth:1, borderColor:"#1e3a5f", backgroundColor:"#111827" }}>
                    <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"600" }}>Other…</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Detail form — after leaf selected */}
            {vascPending && (() => {
              const isCentral = vascPending.v.startsWith("CVK_") || vascPending.v.startsWith("PICC_")
              const sizePresetsG  = ["14","16","18","20","22"]
              const sizePresetsFr = ["4","5","6","7","8","9"]
              const presets = vascDetailUnit === "G" ? sizePresetsG : sizePresetsFr
              const isPreexisting = vascMode === "preexisting"
              const borderClr = isPreexisting ? "#78350f" : "#1e3a5f"
              const bgClr = isPreexisting ? "#1c0e00" : "#0d1520"
              return (
                <View style={{ backgroundColor:bgClr, borderRadius:12, borderWidth:1, borderColor:borderClr, padding:12 }}>
                  <Text style={{ color:"#94a3b8", fontSize:11, marginBottom:10 }}>{vascPending.crumb}</Text>
                  <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Unit</Text>
                  <View style={{ flexDirection:"row", gap:8, marginBottom:12 }}>
                    {["G","Fr"].map(u => (
                      <TouchableOpacity key={u} onPress={() => { setVascDetailUnit(u); setVascDetailSize("") }}
                        style={{ flex:1, paddingVertical:9, borderRadius:8, alignItems:"center",
                          backgroundColor: vascDetailUnit === u ? "#3b82f6" : "#1e2d40",
                          borderWidth:1, borderColor:"#3b82f644" }}>
                        <Text style={{ color: vascDetailUnit === u ? "#fff" : "#93c5fd", fontWeight:"700", fontSize:13 }}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Size ({vascDetailUnit})</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:12 }}>
                    <View style={{ flexDirection:"row", gap:6 }}>
                      {presets.map(p => (
                        <TouchableOpacity key={p} onPress={() => setVascDetailSize(p)}
                          style={{ paddingHorizontal:14, paddingVertical:8, borderRadius:8,
                            backgroundColor: vascDetailSize === p ? "#3b82f6" : "#1e2d40",
                            borderWidth:1, borderColor:"#3b82f644" }}>
                          <Text style={{ color: vascDetailSize === p ? "#fff" : "#93c5fd", fontWeight:"700", fontSize:13 }}>{p}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                  {isCentral && (
                    <>
                      <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Depth from skin (cm)</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:12 }}>
                        <View style={{ flexDirection:"row", gap:6 }}>
                          {["2","4","6","8","10","12","14","16","18","20","22","24"].map(d => (
                            <TouchableOpacity key={d} onPress={() => setVascDetailDepth(d)}
                              style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:8,
                                backgroundColor: vascDetailDepth === d ? "#3b82f6" : "#1e2d40",
                                borderWidth:1, borderColor:"#3b82f644" }}>
                              <Text style={{ color: vascDetailDepth === d ? "#fff" : "#93c5fd", fontWeight:"700", fontSize:13 }}>{d}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                      <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Lumens</Text>
                      <View style={{ flexDirection:"row", gap:8, marginBottom:12 }}>
                        {["1","2","3","4+"].map(l => (
                          <TouchableOpacity key={l} onPress={() => setVascDetailLumens(vascDetailLumens === l ? "" : l)}
                            style={{ paddingHorizontal:18, paddingVertical:9, borderRadius:8, alignItems:"center",
                              backgroundColor: vascDetailLumens === l ? "#3b82f6" : "#1e2d40",
                              borderWidth:1, borderColor:"#3b82f644" }}>
                            <Text style={{ color: vascDetailLumens === l ? "#fff" : "#93c5fd", fontWeight:"700", fontSize:13 }}>{l}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
                  <View style={{ flexDirection:"row", gap:8 }}>
                    <TouchableOpacity disabled={!vascDetailSize} onPress={() => {
                      if (!vascDetailSize || !vascPending) return
                      const entry: VascularEntry = {
                        id:          uid(),
                        site:        vascPending.v,
                        siteLabel:   vascPending.crumb,
                        size:        vascDetailSize,
                        sizeUnit:    vascDetailUnit,
                        depthCm:     vascDetailDepth,
                        lumens:      vascDetailLumens || undefined,
                        preexisting: isPreexisting || undefined,
                      }
                      const next = [...vascularAccesses, entry]
                      setVascularAccesses(next)
                      saveVascularAccesses(next)
                      setVascMode(null)
                      setVascPending(null)
                    }} style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                      backgroundColor: vascDetailSize ? "#3b82f6" : "#1e2d40",
                      borderWidth:1, borderColor:"#3b82f644" }}>
                      <Text style={{ color:"#fff", fontWeight:"700", fontSize:14 }}>Add</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setVascPending(null)}
                      style={{ paddingHorizontal:16, paddingVertical:12, borderRadius:10, alignItems:"center",
                        borderWidth:1, borderColor:"#1e2d40" }}>
                      <Text style={{ color:"#64748b", fontWeight:"700", fontSize:14 }}>{tc("cancelLabel")}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            })()}

            {vascularSaving && (
              <Text style={{ color:"#64748b", fontSize:11, textAlign:"center", marginTop:12 }}>Saving…</Text>
            )}
          </ScrollView>
        )}

        {/* ── PREMEDICATION TAB ──────────────────────────────────────── */}
        {tab === "premedication" && (
          <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
            {/* ── Evening ─────────────────────────────────────────── */}
            {(() => {
              const items = premedEveningText ? premedEveningText.split(";").map(s => s.trim()).filter(Boolean) : []
              return (
                <View style={{ marginBottom:24 }}>
                  <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                    <Text style={{ color:"#64748b", fontSize:11, fontWeight:"700", textTransform:"uppercase", letterSpacing:0.8 }}>{tc("premedEvening")}</Text>
                    <View style={{ flexDirection:"row", gap:8 }}>
                      <TouchableOpacity
                        onPress={() => { const next = "N/A"; setPremedEveningText(next); setTimeout(savePremedication, 100) }}
                        style={{ paddingHorizontal:10, paddingVertical:5, borderRadius:8, backgroundColor:"#1e2d40", borderWidth:1, borderColor:"#2a3a50" }}>
                        <Text style={{ color:"#64748b", fontSize:11, fontWeight:"700" }}>N/A</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setPremedPickPhase("evening"); setPremedPickCat(null); setPremedPickDrug(null); setPremedPickDose(""); setPremedPickRoute("PO"); setPremedPickOpen(true) }}
                        style={{ paddingHorizontal:10, paddingVertical:5, borderRadius:8, backgroundColor:"#1e3a5f", borderWidth:1, borderColor:"#3b82f644" }}>
                        <Text style={{ color:"#93c5fd", fontSize:11, fontWeight:"700" }}>{tc("premedAddFromLibrary")}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {items.length > 0 ? (
                    <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                      {items.map(item => (
                        <View key={item} style={{ flexDirection:"row", alignItems:"center", gap:6, paddingHorizontal:10, paddingVertical:6, borderRadius:999, backgroundColor:"#1e3a5f22", borderWidth:1, borderColor:"#3b82f655" }}>
                          <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"600" }}>{item}</Text>
                          <TouchableOpacity onPress={() => {
                            const next = items.filter(i => i !== item).join("; ")
                            setPremedEveningText(next)
                            setTimeout(savePremedication, 100)
                          }} hitSlop={6}>
                            <Text style={{ color:"#64748b", fontSize:14, fontWeight:"700" }}>×</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={{ color:"#475569", fontSize:12, fontStyle:"italic" }}>Not set — tap + Add from library</Text>
                  )}
                </View>
              )
            })()}

            {/* ── Morning ─────────────────────────────────────────── */}
            {(() => {
              const items = premedMorningText ? premedMorningText.split(";").map(s => s.trim()).filter(Boolean) : []
              return (
                <View>
                  <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                    <Text style={{ color:"#64748b", fontSize:11, fontWeight:"700", textTransform:"uppercase", letterSpacing:0.8 }}>{tc("premedMorning")}</Text>
                    <View style={{ flexDirection:"row", gap:8 }}>
                      <TouchableOpacity
                        onPress={() => { const next = "N/A"; setPremedMorningText(next); setTimeout(savePremedication, 100) }}
                        style={{ paddingHorizontal:10, paddingVertical:5, borderRadius:8, backgroundColor:"#1e2d40", borderWidth:1, borderColor:"#2a3a50" }}>
                        <Text style={{ color:"#64748b", fontSize:11, fontWeight:"700" }}>N/A</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setPremedPickPhase("morning"); setPremedPickCat(null); setPremedPickDrug(null); setPremedPickDose(""); setPremedPickRoute("PO"); setPremedPickOpen(true) }}
                        style={{ paddingHorizontal:10, paddingVertical:5, borderRadius:8, backgroundColor:"#1e3a5f", borderWidth:1, borderColor:"#3b82f644" }}>
                        <Text style={{ color:"#93c5fd", fontSize:11, fontWeight:"700" }}>{tc("premedAddFromLibrary")}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {items.length > 0 ? (
                    <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                      {items.map(item => (
                        <View key={item} style={{ flexDirection:"row", alignItems:"center", gap:6, paddingHorizontal:10, paddingVertical:6, borderRadius:999, backgroundColor:"#1e3a5f22", borderWidth:1, borderColor:"#3b82f655" }}>
                          <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"600" }}>{item}</Text>
                          <TouchableOpacity onPress={() => {
                            const next = items.filter(i => i !== item).join("; ")
                            setPremedMorningText(next)
                            setTimeout(savePremedication, 100)
                          }} hitSlop={6}>
                            <Text style={{ color:"#64748b", fontSize:14, fontWeight:"700" }}>×</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={{ color:"#475569", fontSize:12, fontStyle:"italic" }}>Not set — tap + Add from library</Text>
                  )}
                </View>
              )
            })()}
          </ScrollView>
        )}

        {/* ── EVENT LOG TAB (formerly "timeline") ────────────────────── */}
        {tab === "events" && (
          <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>

            {/* ── Event log ─────────────────────────────────────────── */}
            <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
              textTransform:"uppercase", marginBottom:10 }}>Event log</Text>
            {log.length === 0 ? (
              <View style={{ alignItems:"center", paddingTop:40, paddingBottom:20 }}>
                <Text style={{ color:"#475569", fontSize:14 }}>No events recorded yet.</Text>
              </View>
            ) : log.map((ev, idx) => {
              const prev = ev.type === "vital" ? prevVitalFor(idx) : undefined
              const { text, color, sub } = eventLabel(ev, prev)
              return (
                <TouchableOpacity key={ev.id}
                  onLongPress={() => eventActions(ev)}
                  style={{ flexDirection:"row", alignItems:"center", paddingVertical:11,
                    borderBottomWidth:1, borderBottomColor:"#1a2030" }}>
                  <Text style={{ color:"#64748b", fontSize:11, width:42,
                    fontVariant:["tabular-nums"] }}>{formatTs(ev.ts)}</Text>
                  <View style={{ width:3, height:36, borderRadius:2, backgroundColor:color, marginHorizontal:12 }} />
                  <View style={{ flex:1 }}>
                    <Text style={{ color:"#e2e8f0", fontSize:13, fontWeight:"600" }}>{text}</Text>
                    {!!sub && <Text style={{ color:"#94a3b8", fontSize:11, marginTop:1 }}>{sub}</Text>}
                  </View>
                  <Pressable
                    onPress={() => promptDelete(ev)}
                    hitSlop={12}
                    style={{ paddingHorizontal:8, paddingVertical:4 }}
                  >
                    <Text style={{ color:"#475569", fontSize:18, fontWeight:"300" }}>×</Text>
                  </Pressable>
                </TouchableOpacity>
              )
            })}

            {/* Divider */}
            <View style={{ height:1, backgroundColor:"#1a2030", marginTop:16, marginBottom:16 }} />

            {/* ── Complications section ──────────────────────────────── */}
            <View style={{ marginBottom:8 }}>
              <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between",
                marginBottom:10 }}>
                <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
                  textTransform:"uppercase" }}>Complications</Text>
                <View style={{ flexDirection:"row", gap:8, alignItems:"center" }}>
                  {selectedComplications.length > 0 && (
                    <View style={{ paddingHorizontal:8, paddingVertical:3, borderRadius:8,
                      backgroundColor:"#ef444422", borderWidth:1, borderColor:"#ef444455" }}>
                      <Text style={{ color:"#f87171", fontSize:11, fontWeight:"700" }}>
                        {selectedComplications.length} selected
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => setCompOpen(true)}
                    style={{ paddingHorizontal:10, paddingVertical:5, borderRadius:8,
                      backgroundColor:"#1e2030", borderWidth:1, borderColor:"#ef444444" }}>
                    <Text style={{ color:"#f87171", fontSize:11, fontWeight:"700" }}>
                      {selectedComplications.length > 0 ? `${selectedComplications.length} selected →` : "+ Add complication"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {selectedComplications.length > 0 && (
                <View style={{ flexDirection:"row", flexWrap:"wrap", gap:6, marginBottom:10 }}>
                  {selectedComplications.map(comp => (
                    <View key={comp} style={{ paddingHorizontal:8, paddingVertical:5, borderRadius:8,
                      backgroundColor:"#ef444418", borderWidth:1, borderColor:"#ef444455" }}>
                      <Text style={{ color:"#fca5a5", fontSize:11, fontWeight:"600" }}>{comp}</Text>
                    </View>
                  ))}
                </View>
              )}
              <TextInput
                style={{ backgroundColor:"#111111", color:"#e2e8f0", borderRadius:10, padding:11,
                  fontSize:13, borderWidth:1, borderColor:"#2a2030", minHeight:44 }}
                placeholder="Additional notes (optional)"
                placeholderTextColor="#3e3e4e"
                multiline
                value={complicationsNotes}
                onChangeText={setComplicationsNotes}
                onBlur={() => { if (buildComplicationsString() !== null) saveComplications() }}
              />
            </View>

          </ScrollView>
        )}

        {/* ── CHART TAB (kept for internal use but no tab button) ─────── */}
        {tab === ("chart" as any) && (() => {
          const PAGE_COLS  = 12
          const totalPages = Math.ceil(ttColCount / PAGE_COLS)
          const safePage   = Math.min(chartPage, totalPages - 1)
          const offset     = safePage * PAGE_COLS
          function pageLabel() {
            const h0 = (startRef.current ? startRef.current.getHours() * 60 + startRef.current.getMinutes() : 480) + offset * 5
            const h1 = h0 + PAGE_COLS * 5
            const fmt = (m: number) => `${String(Math.floor(m/60)%24).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`
            return `${fmt(h0)}–${fmt(h1)}`
          }
          return (
            <View style={{ flex:1 }}>
              <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between",
                paddingHorizontal:14, paddingVertical:8, backgroundColor:"#0a0f1a",
                borderBottomWidth:1, borderBottomColor:"#1e2d40" }}>
                <TouchableOpacity onPress={() => setChartPage(p => Math.max(0, p-1))}
                  disabled={safePage === 0} style={{ padding:8 }}>
                  <Text style={{ color: safePage===0 ? "#1e2d40" : "#94a3b8", fontSize:18 }}>←</Text>
                </TouchableOpacity>
                <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"600" }}>
                  Hour {safePage+1}  {pageLabel()}
                </Text>
                <TouchableOpacity onPress={() => {
                    if (safePage < totalPages - 1) setChartPage(p => p+1)
                    else { setTtColCount(c => c + PAGE_COLS); setChartPage(totalPages) }
                  }} style={{ padding:8 }}>
                  <Text style={{ color:"#94a3b8", fontSize:18 }}>→</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection:"row", justifyContent:"flex-end",
                paddingHorizontal:14, paddingVertical:6, backgroundColor:"#0a0f1a" }}>
                <TouchableOpacity onPress={() => setChartPage(totalPages - 1)}
                  style={{ paddingHorizontal:10, paddingVertical:4, borderRadius:6,
                    backgroundColor:"#1e3a5f", borderWidth:1, borderColor:"#3b82f644" }}>
                  <Text style={{ color:"#93c5fd", fontSize:11 }}>Jump to now</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:12 }}>
                <IntraopTimetable
                  startTime={startRef.current
                    ? `${String(startRef.current.getHours()).padStart(2,"0")}:${String(startRef.current.getMinutes()).padStart(2,"0")}`
                    : "08:00"}
                  colCount={PAGE_COLS}
                  colOffset={offset}
                  onColCountChange={n => setTtColCount(offset + n)}
                  data={timetable}
                  onChange={(newData) => {
                    // Detect fluids added via the timetable component's own modal
                    // (time-cell-tap → add modal → fluid tab). These bypass the event
                    // log so we intercept and generate fluid_start events for them,
                    // ensuring they survive the next eventsToTimetable rebuild.
                    if (startRef.current) {
                      const prevIds = new Set(timetable.fluids.map(f => f.id))
                      const base = roundDown5Min(startRef.current)
                      for (const fl of newData.fluids) {
                        if (prevIds.has(fl.id)) continue
                        // New fluid — create a fluid_start event at its startCol time
                        const ts = new Date(base.getTime() + fl.startCol * 5 * 60_000).toISOString()
                        const ev: LogEvent = { id: uid(), ts, type: "fluid_start", fluidId: fl.id, name: fl.name, volume: fl.volume, color: fl.color, syncStatus: "pending" }
                        const newLog = [ev, ...log]
                        setLog(newLog)
                        setActiveFluids(prev => [...prev, { fluidId: fl.id, name: fl.name, volume: fl.volume, color: fl.color }])
                        storePendingEvents(id, newLog.filter(e => e.syncStatus === "pending")).catch(() => {})
                        apiFetch(`/api/cases/${id}/events`, { method:"POST", body: JSON.stringify(eventForServer(ev)) }).catch(() => {})
                      }
                    }
                    setTimetable(newData)
                  }}
                  showActions={false}
                  endTime={caseEnded || caseEndTime ? caseEndTime : undefined}
                  onResumeCase={resumeSecsLeft > 0 ? resumeCase : undefined}
                  onInfusionBarTap={(infId, col) => {
                    // Set entryTs to this column's time so the rate change is recorded
                    // at the tapped column rather than the current wall-clock time
                    const base = startRef.current ?? new Date()
                    const ts = timeAtCol(base, col).toISOString()
                    setEntryTs(ts)
                    const activeInf = activeInfusions.find(x => x.infId === infId)
                    if (activeInf) { setInfActTgt(activeInf); setInfActRate(""); setInfActOpen(true) }
                  }}
                />
              </ScrollView>
            </View>
          )
        })()}

        </View>{/* end tab content gesture wrapper */}

        {/* ── Slot action sheet (tiered: Vitals → Events → Drugs → Infusions → Fluids → Agent) ── */}
        <Sheet visible={slotOpen} onClose={() => { setSlotOpen(false); setSlotEventSearch(""); setSlotCompExpanded(false) }}
          title={`${slotTs ? formatDateHHMM(slotTs) : timeStr}`} full>

          {/* ── Event search ── */}
          <TextInput
            style={{ backgroundColor:"#111820", color:"#f8fafc", borderRadius:10, paddingHorizontal:12, paddingVertical:9,
              fontSize:13, borderWidth:1, borderColor:"#1e2d40", marginBottom:12 }}
            placeholder="Search events…" placeholderTextColor="#475569"
            value={slotEventSearch} onChangeText={setSlotEventSearch}
            autoCapitalize="none" autoCorrect={false}
          />

          {/* ── Events ── */}
          {CLINICAL_EVENT_CATS.map(cat => {
            const visibleEvents = cat.isComplication
              ? (slotCompExpanded
                  ? [...cat.events, ...COMPLICATION_GROUPS.flatMap(g => g.items).filter(label => !cat.events.some(e => e.label === label)).map(label => ({ label, color: "#ef4444" }))]
                  : cat.events
                ).filter(ev => !slotEventSearch || ev.label.toLowerCase().includes(slotEventSearch.toLowerCase()))
              : cat.events.filter(ev => !slotEventSearch || ev.label.toLowerCase().includes(slotEventSearch.toLowerCase()))
            if (visibleEvents.length === 0 && slotEventSearch) return null
            return (
              <View key={cat.cat} style={{ marginBottom:14 }}>
                <View style={{ flexDirection:"row", alignItems:"center", marginBottom:6 }}>
                  <Text style={{ color: cat.color, fontSize:9, fontWeight:"800", letterSpacing:1.2,
                    textTransform:"uppercase", flex:1 }}>{cat.cat}</Text>
                  {cat.isComplication && (
                    <TouchableOpacity onPress={() => setSlotCompExpanded(v => !v)}>
                      <Text style={{ color:"#64748b", fontSize:9, fontWeight:"700" }}>{slotCompExpanded ? "Show less" : "Show all"}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ flexDirection:"row", flexWrap:"wrap", gap:7 }}>
                  {visibleEvents.map(ev => (
                    <TouchableOpacity key={ev.label} onPress={() => openSlotEvent(ev)}
                      style={{ paddingHorizontal:11, paddingVertical:8, borderRadius:10,
                        backgroundColor:ev.color+"18", borderWidth:1, borderColor:ev.color+"55" }}>
                      <Text style={{ color:ev.color, fontSize:11, fontWeight:"700" }}>{ev.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )
          })}

          {/* ── Drugs/Infusions/Fluids sections removed — accessible via timetable row actions ── */}
          {false && favDrugs.length > 0 && (
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:10 }}>
              {favDrugs.map(d => (
                <TouchableOpacity key={d.name}
                  onPress={() => { setSlotOpen(false); setEntryTs(slotIso() ?? null); setDrugCat(d.catObj as any); setDrugPick(d); setDrugDose(""); setDrugOpen(true) }}
                  style={{ paddingHorizontal:12, paddingVertical:9, borderRadius:10,
                    backgroundColor:d.color+"1a", borderWidth:1, borderColor:d.color+"55" }}>
                  <Text style={{ color:d.color, fontWeight:"700", fontSize:12 }}>{d.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TouchableOpacity onPress={() => { const ts = slotIso(); setSlotOpen(false); openDrug(ts) }}
            style={{ borderRadius:10, paddingVertical:10, alignItems:"center",
              backgroundColor:"#1e2d40", borderWidth:1, borderColor:"#3b82f644", marginBottom:18 }}>
            <Text style={{ color:"#93c5fd", fontWeight:"700", fontSize:12 }}>Browse all drugs →</Text>
          </TouchableOpacity>

          {/* ── Inhaled Agent (GA only) ── */}
          {isGACase && (
            <>
              <Text style={{ color:"#a855f7", fontSize:10, fontWeight:"800", letterSpacing:1.2,
                textTransform:"uppercase", marginBottom:8 }}>Inhaled Agent</Text>
              {activeAgent ? (
                <View style={{ flexDirection:"row", gap:8, marginBottom:8 }}>
                  <View style={{ flex:1, borderRadius:10, paddingVertical:10, paddingHorizontal:12,
                    backgroundColor:activeAgent.color+"18", borderWidth:1, borderColor:activeAgent.color+"55" }}>
                    <Text style={{ color:activeAgent.color, fontWeight:"700" }}>{activeAgent.name} running</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setSlotOpen(false); stopAgent() }}
                    style={{ borderRadius:10, paddingHorizontal:14, paddingVertical:10,
                      backgroundColor:"#1e1010", borderWidth:1, borderColor:"#ef444444" }}>
                    <Text style={{ color:"#ef4444", fontWeight:"700", fontSize:12 }}>Stop</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity onPress={() => { const ts = slotIso(); setSlotOpen(false); openAgent(ts) }}
                style={{ borderRadius:10, paddingVertical:10, alignItems:"center",
                  backgroundColor:"#1a1030", borderWidth:1, borderColor:"#a855f744" }}>
                <Text style={{ color:"#d8b4fe", fontWeight:"700", fontSize:12 }}>
                  {activeAgent ? "Switch agent →" : "Start agent →"}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Sheet>

        <Sheet visible={drugOpen} onClose={() => setDrugOpen(false)}
          title={drugPick ? drugPick.name : drugCat ? drugCat.cat : "Add drug"} full>
          {!drugCat ? (
            <View>
              {favDrugs.length > 0 && (
                <View style={{ marginBottom:16 }}>
                  <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase",
                    letterSpacing:1, marginBottom:8 }}>Favourites</Text>
                  <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                    {favDrugs.map(d => (
                      <TouchableOpacity key={d.name}
                        onPress={() => { setDrugCat(d.catObj as any); setDrugPick(d); setDrugDose("") }}
                        style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
                          backgroundColor:d.color+"1a", borderWidth:1, borderColor:d.color+"55" }}>
                        <Text style={{ color:d.color, fontWeight:"700", fontSize:13 }}>{d.name}</Text>
                        <Text style={{ color:"#94a3b8", fontSize:10, marginTop:1 }}>{d.unit}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
                {DRUG_CATS.map(cat => (
                  <TouchableOpacity key={cat.cat} onPress={() => setDrugCat(cat)}
                    style={{ width:"47%", paddingVertical:18, borderRadius:14, alignItems:"center",
                      backgroundColor:cat.color+"1a", borderWidth:1, borderColor:cat.color+"55" }}>
                    <Text style={{ color:cat.color, fontWeight:"700", fontSize:15 }}>{cat.cat}</Text>
                    <Text style={{ color:"#94a3b8", fontSize:10, marginTop:3 }}>
                      {(cat.drugs as readonly { name: string }[]).slice(0,2).map(d => d.name).join(", ")}…
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : !drugPick ? (
            <View>
              <TouchableOpacity onPress={() => setDrugCat(null)} style={{ marginBottom:14 }}>
                <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
              </TouchableOpacity>
              <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
                {(drugCat.drugs as readonly { name: string; unit: string }[]).map(d => (
                  <TouchableOpacity key={d.name} onPress={() => { setDrugPick(d); setDrugDose("") }}
                    style={{ paddingHorizontal:18, paddingVertical:14, borderRadius:12,
                      backgroundColor:drugCat.color+"1a", borderWidth:1, borderColor:drugCat.color+"55" }}>
                    <Text style={{ color:drugCat.color, fontWeight:"700", fontSize:14 }}>{d.name}</Text>
                    <Text style={{ color:"#94a3b8", fontSize:11, marginTop:2 }}>{d.unit}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <View>
              <TouchableOpacity onPress={() => setDrugPick(null)} style={{ marginBottom:14 }}>
                <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
              </TouchableOpacity>
              <Text style={{ color:"#94a3b8", fontSize:12, marginBottom:12 }}>
                Quick dose ({drugPick.unit})
              </Text>
              {DOSE_PRESETS[drugPick.name] && (
                <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10, marginBottom:16 }}>
                  {DOSE_PRESETS[drugPick.name].map(d => (
                    <TouchableOpacity key={d} onPress={() => setDrugDose(String(d))}
                      style={{ paddingHorizontal:22, paddingVertical:16, borderRadius:12,
                        backgroundColor: drugDose===String(d) ? (drugCat?.color ?? "#3b82f6") : (drugCat?.color ?? "#3b82f6")+"1a",
                        borderWidth:1, borderColor: drugCat?.color ?? "#3b82f6" }}>
                      <Text style={{ color: drugDose===String(d) ? "#fff" : (drugCat?.color ?? "#93c5fd"),
                        fontWeight:"700", fontSize:18 }}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TextInput
                style={{ backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:12,
                  fontSize:22, borderWidth:1, borderColor:"#3e3e3e", marginBottom:16, textAlign:"center" }}
                placeholder={`Custom ${drugPick.unit}`} placeholderTextColor="#475569"
                keyboardType="decimal-pad" value={drugDose} onChangeText={setDrugDose}
              />
              <TouchableOpacity onPress={confirmDrug} disabled={!drugDose}
                style={{ backgroundColor: drugDose ? (drugCat?.color ?? "#3b82f6") : "#1e2d40",
                  borderRadius:14, padding:18, alignItems:"center", marginBottom: INF_DRUGS.some(d => d.name === drugPick.name) ? 10 : 0 }}>
                <Text style={{ color:"#fff", fontSize:16, fontWeight:"700" }}>
                  Add {drugPick.name} {drugDose} {drugPick.unit}
                </Text>
              </TouchableOpacity>
              {INF_DRUGS.some(d => d.name === drugPick.name) && (
                <TouchableOpacity onPress={startDrugAsInfusion}
                  style={{ backgroundColor:"#111820", borderRadius:14, padding:16, alignItems:"center",
                    borderWidth:1, borderColor: (drugCat?.color ?? "#3b82f6") + "66" }}>
                  <Text style={{ color: drugCat?.color ?? "#93c5fd", fontSize:14, fontWeight:"700" }}>
                    Start {drugPick.name} as infusion →
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </Sheet>

        {/* ── VITALS SHEET ─────────────────────────────────────────────── */}
        <Sheet visible={vitOpen} onClose={() => { setVitOpen(false); setEditingVitalId(null) }} title={vitMode==="bp" ? "Blood pressure" : editingVitalId ? "Change vitals" : "Vitals"} full>
          {/* Camera scan button */}
          <TouchableOpacity
            onPress={scanVitalsFromCamera}
            disabled={vitScanBusy}
            style={{ flexDirection:"row", alignItems:"center", justifyContent:"center", gap:8,
              paddingVertical:10, paddingHorizontal:16, borderRadius:12, marginBottom:16,
              backgroundColor: vitScanBusy ? "#1e2d40" : "#0f2a1a",
              borderWidth:1, borderColor: vitScanBusy ? "#2a3a50" : "#22c55e55" }}>
            <Text style={{ fontSize:16 }}>📷</Text>
            <Text style={{ color: vitScanBusy ? "#64748b" : "#86efac", fontSize:13, fontWeight:"700" }}>
              {vitScanBusy ? "Reading monitor…" : "Scan monitor screen"}
            </Text>
          </TouchableOpacity>
          {/* GDPR note — image sent to Mistral EU */}
          {!vitScanBusy && (
            <Text style={{ color:"#475569", fontSize:10, marginBottom:14, lineHeight:14 }}>
              Monitor images are sent to Mistral AI (EU-hosted) for extraction only and are not stored. Do not capture patient names or identifiers.
            </Text>
          )}
          <Text style={{ color:"#ef4444", fontSize:11, fontWeight:"700", letterSpacing:1,
            textTransform:"uppercase", marginBottom:8 }}>Blood Pressure</Text>
          <View style={{ flexDirection:"row", gap:10, marginBottom:18 }}>
            <TextInput
              style={{ flex:1, minWidth:0, backgroundColor:"#111111", color:"#ef4444", borderRadius:12,
                padding: Platform.OS === "web" ? 10 : 14,
                fontSize: Platform.OS === "web" ? 20 : 30,
                fontWeight:"700", borderWidth:1, borderColor:"#ef444444", textAlign:"center" }}
              placeholder="Sys" placeholderTextColor="#3e3e3e"
              ref={vSysRef}
              keyboardType="number-pad" value={vSys} onChangeText={v => setAndAdvance(v, setVSys, vDiaRef)}
            />
            <Text style={{ color:"#475569", fontSize: Platform.OS === "web" ? 20 : 28, alignSelf:"center", fontWeight:"200" }}>/</Text>
            <TextInput
              style={{ flex:1, minWidth:0, backgroundColor:"#111111", color:"#f87171", borderRadius:12,
                padding: Platform.OS === "web" ? 10 : 14,
                fontSize: Platform.OS === "web" ? 20 : 30,
                fontWeight:"700", borderWidth:1, borderColor:"#ef444433", textAlign:"center" }}
              placeholder="Dia" placeholderTextColor="#3e3e3e"
              ref={vDiaRef}
              keyboardType="number-pad" value={vDia} onChangeText={v => setAndAdvance(v, setVDia, vHRRef, 2)}
            />
          </View>

          {vitMode === "full" && (
            <>
              <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
                <View style={{ flex:1, minWidth:0 }}>
                  <Text style={{ color:"#22c55e", fontSize:11, fontWeight:"700", marginBottom:6 }}>HEART RATE</Text>
                  <TextInput
                    style={{ backgroundColor:"#111111", color:"#22c55e", borderRadius:10,
                      padding: Platform.OS === "web" ? 9 : 12,
                      fontSize: Platform.OS === "web" ? 18 : 24,
                      fontWeight:"700", borderWidth:1, borderColor:"#22c55e33", textAlign:"center" }}
                    placeholder="—" placeholderTextColor="#3e3e3e"
                    ref={vHRRef}
                    keyboardType="number-pad" value={vHR} onChangeText={v => setAndAdvance(v, setVHR, vSpO2Ref)}
                  />
                </View>
                <View style={{ flex:1, minWidth:0 }}>
                  <Text style={{ color:"#06b6d4", fontSize:11, fontWeight:"700", marginBottom:6 }}>SPO₂ %</Text>
                  <TextInput
                    style={{ backgroundColor:"#111111", color:"#06b6d4", borderRadius:10,
                      padding: Platform.OS === "web" ? 9 : 12,
                      fontSize: Platform.OS === "web" ? 18 : 24,
                      fontWeight:"700", borderWidth:1, borderColor:"#06b6d433", textAlign:"center" }}
                    placeholder="—" placeholderTextColor="#3e3e3e"
                    ref={vSpO2Ref}
                    keyboardType="number-pad" value={vSpO2} onChangeText={v => setAndAdvance(v, setVSpO2, (isGACase || monitoring.some(m => m.includes("EtCO₂"))) ? vEtco2Ref : monitoring.some(m => m.includes("Temperature")) ? vTempRef : undefined)}
                  />
                </View>
              </View>

              {(isGACase || monitoring.some(m => m.includes("EtCO₂"))) && (
                <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
                  <View style={{ flex:1, minWidth:0 }}>
                    <Text style={{ color:"#f59e0b", fontSize:11, fontWeight:"700", marginBottom:6 }}>ETCO₂</Text>
                    <TextInput
                      style={{ backgroundColor:"#111111", color:"#f59e0b", borderRadius:10,
                        padding: Platform.OS === "web" ? 8 : 10,
                        fontSize: Platform.OS === "web" ? 16 : 20,
                        fontWeight:"600", borderWidth:1, borderColor:"#f59e0b33", textAlign:"center" }}
                      placeholder="—" placeholderTextColor="#3e3e3e"
                      ref={vEtco2Ref}
                      keyboardType="decimal-pad" value={vEtco2} onChangeText={v => setAndAdvance(v, setVEtco2, (isGACase || monitoring.some(m => m.includes("Temperature"))) ? vTempRef : undefined, 2)}
                    />
                  </View>
                </View>
              )}

              {(isGACase || monitoring.some(m => m.includes("Temperature"))) && (
                <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
                  <View style={{ flex:1, minWidth:0 }}>
                    <Text style={{ color:"#a78bfa", fontSize:11, fontWeight:"700", marginBottom:6 }}>TEMP °C</Text>
                    <TextInput
                      style={{ backgroundColor:"#111111", color:"#a78bfa", borderRadius:10,
                        padding: Platform.OS === "web" ? 8 : 10,
                        fontSize: Platform.OS === "web" ? 16 : 20,
                        fontWeight:"600", borderWidth:1, borderColor:"#a78bfa33", textAlign:"center" }}
                      placeholder="—" placeholderTextColor="#3e3e3e"
                      ref={vTempRef}
                      keyboardType="decimal-pad" value={vTemp} onChangeText={v => setAndAdvance(v, setVTemp, monitoring.some(m => m.includes("glucose")) ? vBglRef : undefined, 4)}
                    />
                  </View>
                </View>
              )}

              {monitoring.some(m => m.includes("glucose")) && (
                <View style={{ flexDirection:"row", gap:10, marginBottom:20 }}>
                  <View style={{ flex:1, minWidth:0 }}>
                    <Text style={{ color:"#34d399", fontSize:11, fontWeight:"700", marginBottom:6 }}>BGL mmol/L</Text>
                    <TextInput
                      style={{ backgroundColor:"#111111", color:"#34d399", borderRadius:10,
                        padding: Platform.OS === "web" ? 8 : 10,
                        fontSize: Platform.OS === "web" ? 16 : 20,
                        fontWeight:"600", borderWidth:1, borderColor:"#34d39933", textAlign:"center" }}
                      placeholder="—" placeholderTextColor="#3e3e3e"
                      ref={vBglRef}
                      keyboardType="decimal-pad" value={vBgl} onChangeText={setVBgl}
                    />
                  </View>
                </View>
              )}
            </>
          )}

          {vitMode === "bp" && (
            <View style={{ flexDirection:"row", gap:10, marginBottom:18 }}>
              <View style={{ flex:1 }}>
                <Text style={{ color:"#22c55e", fontSize:11, fontWeight:"700", marginBottom:6 }}>HEART RATE</Text>
                <TextInput
                  style={{ backgroundColor:"#111111", color:"#22c55e", borderRadius:10,
                    padding: Platform.OS === "web" ? 9 : 12,
                    fontSize: Platform.OS === "web" ? 18 : 24,
                    fontWeight:"700", borderWidth:1, borderColor:"#22c55e33", textAlign:"center" }}
                  placeholder="—" placeholderTextColor="#3e3e3e"
                  ref={vHRRef}
                  keyboardType="number-pad" value={vHR} onChangeText={setVHR}
                />
              </View>
            </View>
          )}

          <TouchableOpacity onPress={sameAsPrevious}
            style={{ backgroundColor:"#1a1a1a", borderRadius:10, padding:12, alignItems:"center",
              borderWidth:1, borderColor:"#3e3e3e", marginBottom:10 }}>
            <Text style={{ color:"#94a3b8", fontWeight:"600" }}>Same as previous</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmVitals}
            style={{ backgroundColor:"#0f2a1a", borderRadius:14, padding:18, alignItems:"center",
              borderWidth:1, borderColor:"#22c55e" }}>
            <Text style={{ color:"#86efac", fontSize:16, fontWeight:"700" }}>Save vitals</Text>
          </TouchableOpacity>
        </Sheet>

        {/* ── INFUSION SHEET ─────────────────────────────────────────────── */}
        <Sheet visible={infOpen} onClose={() => { setInfOpen(false); setInfDrug(null); setInfRate("") }}
          title="Start infusion">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:16 }}>
            <View style={{ flexDirection:"row", gap:8 }}>
              {INF_DRUGS.map(d => (
                <TouchableOpacity key={d.name} onPress={() => { setInfDrug(d); setInfRate("") }}
                  style={{ paddingHorizontal:12, paddingVertical:10, borderRadius:10,
                    backgroundColor: infDrug?.name===d.name ? d.color : d.color+"1a",
                    borderWidth:1, borderColor:d.color+"66" }}>
                  <Text style={{ color: infDrug?.name===d.name ? "#fff" : d.color, fontSize:12, fontWeight:"600" }}>
                    {d.name}
                  </Text>
                  <Text style={{ color:"#94a3b8", fontSize:9, marginTop:1 }}>{d.unit}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          {infDrug && (
            <>
              {INF_RATE_PRESETS[infDrug.name] && (
                <View style={{ flexDirection:"row", gap:6, marginBottom:12, flexWrap:"wrap" }}>
                  {INF_RATE_PRESETS[infDrug.name].map(r => (
                    <TouchableOpacity key={r} onPress={() => setInfRate(r)}
                      style={{ paddingHorizontal:14, paddingVertical:8, borderRadius:8,
                        backgroundColor: infRate===r ? infDrug.color : infDrug.color+"1a",
                        borderWidth:1, borderColor:infDrug.color+"55" }}>
                      <Text style={{ color: infRate===r ? "#fff" : infDrug.color, fontWeight:"700" }}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <Text style={{ color:"#94a3b8", fontSize:13, marginBottom:8 }}>Rate ({infDrug.unit})</Text>
              <TextInput
                style={{ backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:12,
                  fontSize:22, borderWidth:1, borderColor:"#3e3e3e", marginBottom:14, textAlign:"center" }}
                placeholder="or type custom" placeholderTextColor="#475569"
                keyboardType="decimal-pad" value={infRate} onChangeText={setInfRate}
              />
              <TouchableOpacity onPress={confirmInfusion} disabled={!infRate}
                style={{ backgroundColor: infRate ? infDrug.color : "#1e2d40", borderRadius:12,
                  padding:16, alignItems:"center" }}>
                <Text style={{ color:"#fff", fontWeight:"700" }}>
                  Start {infDrug.name} {infRate} {infDrug.unit}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Sheet>

        {/* ── INFUSION ACTION SHEET ──────────────────────────────────────── */}
        <Sheet visible={infActOpen} onClose={() => { setInfActOpen(false); setInfActTgt(null) }}
          title={infActTgt?.name ?? "Infusion"}>
          {infActTgt && (
            <View style={{ gap:12 }}>
              <Text style={{ color:"#94a3b8", fontSize:13 }}>
                Current: {infActTgt.rate} {infActTgt.unit}
              </Text>
              {INF_RATE_PRESETS[infActTgt.name] && (
                <View style={{ flexDirection:"row", gap:6, flexWrap:"wrap" }}>
                  {INF_RATE_PRESETS[infActTgt.name].map(r => (
                    <TouchableOpacity key={r} onPress={() => setInfActRate(r)}
                      style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:8,
                        backgroundColor: infActRate===r ? "#3b82f6" : "#1e3a5f",
                        borderWidth:1, borderColor:"#3b82f644" }}>
                      <Text style={{ color: infActRate===r ? "#fff" : "#93c5fd", fontWeight:"700" }}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TextInput
                style={{ backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:12,
                  fontSize:20, borderWidth:1, borderColor:"#3e3e3e", textAlign:"center" }}
                placeholder="New rate" placeholderTextColor="#475569"
                keyboardType="decimal-pad" value={infActRate} onChangeText={setInfActRate}
              />
              <TouchableOpacity onPress={() => changeRate(infActTgt, infActRate)} disabled={!infActRate}
                style={{ backgroundColor: infActRate ? "#1e3a5f" : "#111a24", borderRadius:10,
                  padding:14, alignItems:"center", borderWidth:1, borderColor:"#3b82f6" }}>
                <Text style={{ color:"#93c5fd", fontWeight:"700" }}>
                  Change to {infActRate} {infActTgt.unit}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { stopInfusion(infActTgt); setInfActOpen(false); setInfActTgt(null) }}
                style={{ backgroundColor:"#1e1414", borderRadius:10, padding:14, alignItems:"center",
                  borderWidth:1, borderColor:"#ef444444" }}>
                <Text style={{ color:"#ef4444", fontWeight:"700" }}>Stop infusion</Text>
              </TouchableOpacity>
            </View>
          )}
        </Sheet>

        {/* ── FLUID SHEET ───────────────────────────────────────────────── */}
        <Sheet visible={flOpen} onClose={() => { setFlOpen(false); setFlFluid(null); setFlVol("500") }}
          title="Add fluid">
          {(["Crystalloids","Colloids","Blood products","Other"] as const).map(cat => (
            <View key={cat} style={{ marginBottom:14 }}>
              <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase",
                letterSpacing:1, marginBottom:8 }}>{cat}</Text>
              <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                {FLUID_LIST.filter(f => f.cat === cat).map(f => (
                  <TouchableOpacity key={f.name} onPress={() => setFlFluid(f)}
                    style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:10,
                      backgroundColor: flFluid?.name===f.name ? f.color : f.color+"1a",
                      borderWidth:1, borderColor:f.color+"55" }}>
                    <Text style={{ color: flFluid?.name===f.name ? "#fff" : f.color, fontSize:12, fontWeight:"600" }}>
                      {f.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
          {flFluid && (
            <View style={{ marginTop:8 }}>
              <View style={{ flexDirection:"row", gap:8, marginBottom:12 }}>
                {["250","500","1000"].map(v => (
                  <TouchableOpacity key={v} onPress={() => setFlVol(v)}
                    style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                      backgroundColor: flVol===v ? flFluid.color : flFluid.color+"1a",
                      borderWidth:1, borderColor:flFluid.color+"55" }}>
                    <Text style={{ color: flVol===v ? "#fff" : flFluid.color, fontWeight:"700" }}>
                      {v} mL
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={confirmFluid}
                style={{ backgroundColor:flFluid.color, borderRadius:12, padding:16, alignItems:"center" }}>
                <Text style={{ color:"#fff", fontWeight:"700", fontSize:15 }}>
                  Add {flFluid.name} {flVol} mL
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Sheet>

        {/* ── FLUID END OPTIONS SHEET ───────────────────────────────────── */}
        <Sheet visible={flEndOpen} onClose={() => setFlEndOpen(false)}
          title={`End ${flEndTarget?.name ?? "fluid"}`}>
          {flEndTarget && (
            <View style={{ gap:10 }}>
              <TouchableOpacity onPress={() => confirmFluidEnd()}
                style={{ backgroundColor:"#0f2a1a", borderRadius:12, padding:16, alignItems:"center",
                  borderWidth:1, borderColor:"#22c55e" }}>
                <Text style={{ color:"#86efac", fontWeight:"700", fontSize:15 }}>
                  Full bag ({flEndTarget.volume} mL)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmFluidEnd("partial")}
                style={{ backgroundColor:"#1c2a1a", borderRadius:12, padding:16, alignItems:"center",
                  borderWidth:1, borderColor:"#22c55e44" }}>
                <Text style={{ color:"#4ade80", fontWeight:"700" }}>Partial — bag not finished</Text>
              </TouchableOpacity>
              <View style={{ flexDirection:"row", gap:8, alignItems:"center" }}>
                <TextInput
                  style={{ flex:1, minWidth:0, backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:12,
                    fontSize:18, borderWidth:1, borderColor:"#3e3e3e", textAlign:"center" }}
                  placeholder="Custom mL given" placeholderTextColor="#475569"
                  keyboardType="number-pad" value={flEndCustom} onChangeText={setFlEndCustom}
                />
                <TouchableOpacity onPress={() => confirmFluidEnd(flEndCustom + " mL")}
                  disabled={!flEndCustom}
                  style={{ backgroundColor: flEndCustom ? "#22c55e" : "#1c1c1c", borderRadius:10,
                    padding:14, borderWidth:1, borderColor:"#22c55e44" }}>
                  <Text style={{ color:"#fff", fontWeight:"700" }}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Sheet>

        {/* ── AGENT SHEET ───────────────────────────────────────────────── */}
        <Sheet visible={agOpen} onClose={() => { setAgOpen(false); setAgPick(null) }} title="Volatile agent">
          <View style={{ flexDirection:"row", gap:10, marginBottom:18 }}>
            {VOLATILE_AGENTS.map(a => (
              <TouchableOpacity key={a.name} onPress={() => setAgPick(a)}
                style={{ flex:1, paddingVertical:18, borderRadius:14, alignItems:"center",
                  backgroundColor: agPick?.name===a.name ? a.color : a.color+"1a",
                  borderWidth:2, borderColor:a.color }}>
                <Text style={{ color: agPick?.name===a.name ? "#fff" : a.color,
                  fontWeight:"700", fontSize:14 }}>{a.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {agPick && (
            <TouchableOpacity onPress={confirmAgent}
              style={{ backgroundColor:agPick.color, borderRadius:12, padding:16, alignItems:"center" }}>
              <Text style={{ color:"#fff", fontWeight:"700", fontSize:15 }}>
                {activeAgent && activeAgent.name !== agPick.name
                  ? `Switch to ${agPick.name}`
                  : `Start ${agPick.name}`}
              </Text>
            </TouchableOpacity>
          )}
        </Sheet>

        {/* ── AIRWAY DETAIL SHEET ───────────────────────────────────────── */}
        <Sheet visible={airwayOpen} onClose={() => setAirwayOpen(false)} title={airwayLabel} full>
          {airwayLabel === "Intubated" ? (
            <View style={{ gap:16 }}>
              <View>
                <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", textTransform:"uppercase",
                  letterSpacing:1, marginBottom:8 }}>Tube size (mm ID)</Text>
                <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                  {["6.0","6.5","7.0","7.5","8.0","8.5"].map(s => (
                    <TouchableOpacity key={s} onPress={() => setAirwayDetail(d => ({ ...d, tubeSize:s }))}
                      style={{ paddingHorizontal:18, paddingVertical:12, borderRadius:10,
                        backgroundColor: airwayDetail.tubeSize===s ? "#6366f1" : "#6366f11a",
                        borderWidth:1, borderColor:"#6366f155" }}>
                      <Text style={{ color: airwayDetail.tubeSize===s ? "#fff" : "#a5b4fc",
                        fontWeight:"700", fontSize:16 }}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View>
                <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", textTransform:"uppercase",
                  letterSpacing:1, marginBottom:8 }}>Cuff</Text>
                <View style={{ flexDirection:"row", gap:10 }}>
                  {["yes","no"].map(v => (
                    <TouchableOpacity key={v} onPress={() => setAirwayDetail(d => ({ ...d, cuffed: v as "yes"|"no" }))}
                      style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                        backgroundColor: airwayDetail.cuffed===v ? "#6366f1" : "#6366f11a",
                        borderWidth:1, borderColor:"#6366f155" }}>
                      <Text style={{ color: airwayDetail.cuffed===v ? "#fff" : "#a5b4fc", fontWeight:"700" }}>
                        {v === "yes" ? "Cuffed" : "Uncuffed"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View>
                <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", textTransform:"uppercase",
                  letterSpacing:1, marginBottom:8 }}>Laryngoscope</Text>
                <View style={{ flexDirection:"row", gap:8 }}>
                  {["Direct","Video","FOB"].map(t => (
                    <TouchableOpacity key={t} onPress={() => setAirwayDetail(d => ({ ...d, tool:t }))}
                      style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                        backgroundColor: airwayDetail.tool===t ? "#6366f1" : "#6366f11a",
                        borderWidth:1, borderColor:"#6366f155" }}>
                      <Text style={{ color: airwayDetail.tool===t ? "#fff" : "#a5b4fc",
                        fontWeight:"700", fontSize:13 }}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View>
                <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", textTransform:"uppercase",
                  letterSpacing:1, marginBottom:8 }}>Cormack-Lehane</Text>
                <View style={{ flexDirection:"row", gap:8 }}>
                  {["I","IIa","IIb","III","IV"].map(g => (
                    <TouchableOpacity key={g} onPress={() => setAirwayDetail(d => ({ ...d, cl:g }))}
                      style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                        backgroundColor: airwayDetail.cl===g ? "#6366f1" : "#6366f11a",
                        borderWidth:1, borderColor:"#6366f155" }}>
                      <Text style={{ color: airwayDetail.cl===g ? "#fff" : "#a5b4fc",
                        fontWeight:"700", fontSize:13 }}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          ) : (
            <View style={{ gap:14 }}>
              <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", textTransform:"uppercase",
                letterSpacing:1, marginBottom:4 }}>LMA size</Text>
              <View style={{ flexDirection:"row", gap:8 }}>
                {["1","1.5","2","2.5","3","4","5"].map(s => (
                  <TouchableOpacity key={s} onPress={() => setAirwayDetail(d => ({ ...d, tubeSize:s }))}
                    style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                      backgroundColor: airwayDetail.tubeSize===s ? "#6366f1" : "#6366f11a",
                      borderWidth:1, borderColor:"#6366f155" }}>
                    <Text style={{ color: airwayDetail.tubeSize===s ? "#fff" : "#a5b4fc",
                      fontWeight:"700" }}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          <TouchableOpacity onPress={confirmAirway}
            style={{ backgroundColor:"#6366f1", borderRadius:12, padding:16, alignItems:"center", marginTop:20 }}>
            <Text style={{ color:"#fff", fontWeight:"700", fontSize:15 }}>Log {airwayLabel}</Text>
          </TouchableOpacity>
        </Sheet>

        {/* ── EDIT DRUG EVENT MODAL ─────────────────────────────────────── */}
        <Sheet visible={editOpen} onClose={() => setEditOpen(false)}
          title={`Edit ${editEv?.name ?? "event"}`}>
          {editEv && (
            <View style={{ gap:14 }}>
              <View>
                {editEv.type === "drug" && (
                  <>
                    <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", letterSpacing:1,
                      textTransform:"uppercase", marginBottom:8 }}>Dose ({editEv.unit})</Text>
                    <TextInput
                      style={{ backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:12,
                        fontSize:22, borderWidth:1, borderColor:"#3e3e3e", textAlign:"center" }}
                      keyboardType="decimal-pad" value={editDose} onChangeText={setEditDose}
                    />
                  </>
                )}
              </View>
              <View>
                <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", letterSpacing:1,
                  textTransform:"uppercase", marginBottom:8 }}>Time (HH:MM)</Text>
                <TextInput
                  style={{ backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:12,
                    fontSize:22, borderWidth:1, borderColor:"#3e3e3e", textAlign:"center" }}
                  placeholder="e.g. 09:15" placeholderTextColor="#475569"
                  value={editTime} onChangeText={setEditTime}
                />
              </View>
              <TouchableOpacity onPress={confirmEdit}
                style={{ backgroundColor:"#2563eb", borderRadius:12, padding:16, alignItems:"center" }}>
                <Text style={{ color:"#fff", fontWeight:"700", fontSize:15 }}>Save changes</Text>
              </TouchableOpacity>
            </View>
          )}
        </Sheet>

        {/* ── COMPLICATIONS PICKER SHEET ───────────────────────────────── */}
        <Sheet visible={compOpen} onClose={() => setCompOpen(false)} title="Complications" full>
          <View style={{ gap:4 }}>
            {COMPLICATION_GROUPS.map(group => {
              const expanded = !!compGroupExpanded[group.id]
              const groupSelected = group.items.filter(i => selectedComplications.includes(i))
              return (
                <View key={group.id} style={{ borderRadius:12, overflow:"hidden",
                  borderWidth:1, borderColor: groupSelected.length > 0 ? "#ef444455" : "#1e2d40",
                  marginBottom:6 }}>
                  <TouchableOpacity
                    onPress={() => setCompGroupExpanded(prev => ({ ...prev, [group.id]: !expanded }))}
                    style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between",
                      paddingHorizontal:14, paddingVertical:12,
                      backgroundColor: groupSelected.length > 0 ? "#ef444412" : "#111820" }}>
                    <View style={{ flexDirection:"row", alignItems:"center", gap:8 }}>
                      <Text style={{ color: groupSelected.length > 0 ? "#f87171" : "#cbd5e1",
                        fontSize:13, fontWeight:"700" }}>
                        {COMPLICATION_TC_TITLES[group.id] ? tc(COMPLICATION_TC_TITLES[group.id]) : group.title}
                      </Text>
                      {groupSelected.length > 0 && (
                        <View style={{ paddingHorizontal:6, paddingVertical:2, borderRadius:6,
                          backgroundColor:"#ef444433" }}>
                          <Text style={{ color:"#fca5a5", fontSize:10, fontWeight:"700" }}>
                            {groupSelected.length}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color:"#64748b", fontSize:12 }}>{expanded ? "▲" : "▼"}</Text>
                  </TouchableOpacity>
                  {expanded && (
                    <View style={{ paddingHorizontal:12, paddingBottom:10, paddingTop:4,
                      backgroundColor:"#0d1520", flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                      {group.items.map(item => {
                        const checked = selectedComplications.includes(item)
                        return (
                          <TouchableOpacity key={item}
                            onPress={() => {
                              setSelectedComplications(prev =>
                                checked ? prev.filter(x => x !== item) : [...prev, item]
                              )
                            }}
                            style={{ flexDirection:"row", alignItems:"center", gap:6,
                              paddingHorizontal:10, paddingVertical:8, borderRadius:9,
                              backgroundColor: checked ? "#ef444420" : "#151c28",
                              borderWidth:1, borderColor: checked ? "#ef4444" : "#263246" }}>
                            <View style={{ width:14, height:14, borderRadius:3,
                              backgroundColor: checked ? "#ef4444" : "transparent",
                              borderWidth: checked ? 0 : 1.5, borderColor:"#475569",
                              alignItems:"center", justifyContent:"center" }}>
                              {checked && <Text style={{ color:"#fff", fontSize:9, fontWeight:"900" }}>✓</Text>}
                            </View>
                            <Text style={{ color: checked ? "#fca5a5" : "#94a3b8",
                              fontSize:12, fontWeight: checked ? "700" : "500" }}>{item}</Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  )}
                </View>
              )
            })}
          </View>
          <View style={{ marginTop:12, gap:10 }}>
            {selectedComplications.length > 0 && (
              <TouchableOpacity
                onPress={() => setSelectedComplications([])}
                style={{ paddingVertical:10, borderRadius:10, alignItems:"center",
                  backgroundColor:"#1c1414", borderWidth:1, borderColor:"#ef444433" }}>
                <Text style={{ color:"#ef4444", fontSize:12, fontWeight:"700" }}>Clear all</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={saveComplications}
              disabled={compSaving}
              style={{ paddingVertical:16, borderRadius:12, alignItems:"center",
                backgroundColor: compSaving ? "#1a1a1a" : "#7f1d1d",
                borderWidth:1, borderColor: compSaving ? "#3e3e3e" : "#ef4444" }}>
              <Text style={{ color: compSaving ? "#64748b" : "#fca5a5", fontSize:15, fontWeight:"700" }}>
                {compSaving ? "Saving…" : `Save${selectedComplications.length > 0 ? ` (${selectedComplications.length} complication${selectedComplications.length === 1 ? "" : "s"})` : ""}`}
              </Text>
            </TouchableOpacity>
          </View>
        </Sheet>

        {/* ── END CASE CLEANUP SHEET ────────────────────────────────────── */}
        {/* ── START AT SHEET ──────────────────────────────────────────── */}
        <Sheet visible={startAtOpen} onClose={() => setStartAtOpen(false)} title="Start at…">
          <Text style={{ color:colors.textSecondary, fontSize:13, marginBottom:16 }}>
            Enter the time the anaesthesia actually started. The timetable will open from that time and the current time will be highlighted as "now".
          </Text>
          <Text style={{ color:colors.textMuted, fontSize:10, fontWeight:"700", letterSpacing:1.1,
            textTransform:"uppercase", marginBottom:8 }}>Start time (HH:MM)</Text>
          <TextInput
            style={{ backgroundColor:"#111111", color:"#a5b4fc", borderRadius:12, padding:16,
              fontSize:36, fontWeight:"200", borderWidth:1, borderColor:"#6366f166",
              textAlign:"center", fontVariant:["tabular-nums"], marginBottom:16, letterSpacing:4 }}
            value={startAtInput}
            onChangeText={v => {
              // Accept digits only, auto-insert colon
              const digits = v.replace(/\D/g, "").slice(0, 4)
              if (digits.length <= 2) setStartAtInput(digits)
              else setStartAtInput(`${digits.slice(0,2)}:${digits.slice(2)}`)
            }}
            placeholder="HH:MM"
            placeholderTextColor="#334155"
            keyboardType="number-pad"
            maxLength={5}
            autoFocus
          />
          <TouchableOpacity
            onPress={() => startCaseAt(startAtInput)}
            disabled={startAtInput.length < 5}
            style={{ backgroundColor: startAtInput.length >= 5 ? "#1e1a40" : "#111111",
              borderRadius:14, padding:18, alignItems:"center",
              borderWidth:1, borderColor: startAtInput.length >= 5 ? "#6366f1" : "#1e2d40" }}>
            <Text style={{ color: startAtInput.length >= 5 ? "#a5b4fc" : "#334155",
              fontWeight:"900", fontSize:16 }}>
              Start case at {startAtInput || "–"}
            </Text>
          </TouchableOpacity>
        </Sheet>

        <Sheet visible={endCaseOpen} onClose={() => setEndCaseOpen(false)} title="End case" full>
          {(() => {
            const runningItems: { key: string; label: string; sublabel: string; color: string; onStop: () => void | Promise<void> }[] = []
            if (activeAgent) runningItems.push({
              key: `agent-${activeAgent.name}`,
              label: activeAgent.name,
              sublabel: "Volatile · inhalational",
              color: activeAgent.color,
              onStop: stopAgent,
            })
            activeInfusions.forEach(inf => runningItems.push({
              key: `inf-${inf.infId}`,
              label: inf.name,
              sublabel: `${inf.rate} ${inf.unit} infusion`,
              color: inf.color,
              onStop: () => stopInfusion(inf),
            }))
            activeFluids.forEach(fl => runningItems.push({
              key: `fluid-${fl.fluidId}`,
              label: fl.name,
              sublabel: `${fl.volume} mL · fluid`,
              color: fl.color,
              onStop: () => stopFluidDirect(fl),
            }))
            const allDecided = runningItems.length > 0 && runningItems.every(item => !!endCaseDecisions[item.key])
            return (
              <>
                <Text style={{ color:"#94a3b8", fontSize:13, marginBottom:16 }}>
                  Choose what to do with each active item, then finalise.
                </Text>
                {runningItems.map(item => {
                  const dec = endCaseDecisions[item.key]
                  return (
                    <View key={item.key} style={{ marginBottom:10,
                      backgroundColor:item.color+"1a", borderRadius:12, padding:12,
                      borderWidth:1, borderColor:item.color+"44" }}>
                      <View style={{ marginBottom:8 }}>
                        <Text style={{ color:item.color, fontWeight:"700" }}>{item.label}</Text>
                        <Text style={{ color:"#94a3b8", fontSize:11 }}>{item.sublabel}</Text>
                      </View>
                      <View style={{ flexDirection:"row", gap:8 }}>
                        <TouchableOpacity
                          onPress={() => setEndCaseDecisions(prev => ({ ...prev, [item.key]: "stop" }))}
                          style={{ flex:1, paddingVertical:8, borderRadius:8, alignItems:"center",
                            backgroundColor: dec === "stop" ? "#2a0a0a" : "#1c1c1c",
                            borderWidth:1, borderColor: dec === "stop" ? "#ef4444" : "#ef444433" }}>
                          <Text style={{ color: dec === "stop" ? "#ef4444" : "#64748b",
                            fontWeight:"700", fontSize:13 }}>Stop</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setEndCaseDecisions(prev => ({ ...prev, [item.key]: "continue" }))}
                          style={{ flex:1, paddingVertical:8, borderRadius:8, alignItems:"center",
                            backgroundColor: dec === "continue" ? "#0a1f2a" : "#1c1c1c",
                            borderWidth:1, borderColor: dec === "continue" ? "#38bdf8" : "#38bdf833" }}>
                          <Text style={{ color: dec === "continue" ? "#38bdf8" : "#64748b",
                            fontWeight:"700", fontSize:13 }}>Continue postop</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )
                })}
                {allDecided && (
                  <TouchableOpacity
                    onPress={async () => {
                      for (const item of runningItems) {
                        if (endCaseDecisions[item.key] === "stop") await item.onStop()
                      }
                      const continued = runningItems
                        .filter(item => endCaseDecisions[item.key] === "continue")
                        .map(item => `${item.label} (${item.sublabel})`)
                      finaliseCase(continued)
                    }}
                    style={{ marginTop:8, backgroundColor:"#1a2e1a", borderRadius:12,
                      padding:18, alignItems:"center", borderWidth:1, borderColor:"#22c55e" }}>
                    <Text style={{ color:"#86efac", fontWeight:"700", fontSize:16 }}>
                      {tc("continuePostop")}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )
          })()}
        </Sheet>

        {/* ── PREMED LIBRARY SHEET ─────────────────────────────────────── */}
        <Sheet visible={premedPickOpen} onClose={() => { setPremedPickOpen(false); setPremedPickCat(null); setPremedPickDrug(null) }}
          title={`Premedication library — ${premedPickPhase}`} full>
          {!premedPickDrug ? (
            <View>
              {PREMED_LIBRARY.map(cat => {
                const open = premedPickCat === cat.category
                return (
                  <View key={cat.category} style={{ marginBottom:6, borderRadius:10, overflow:"hidden",
                    borderWidth:1, borderColor:"#1e2d40" }}>
                    <TouchableOpacity
                      onPress={() => setPremedPickCat(open ? null : cat.category)}
                      style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center",
                        paddingHorizontal:14, paddingVertical:12, backgroundColor:"#111820" }}>
                      <Text style={{ color:"#cbd5e1", fontSize:13, fontWeight:"700" }}>{cat.category}</Text>
                      <Text style={{ color:"#64748b" }}>{open ? "▲" : "▼"}</Text>
                    </TouchableOpacity>
                    {open && (
                      <View style={{ paddingHorizontal:12, paddingBottom:10, paddingTop:4,
                        backgroundColor:"#0d1520", flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                        {cat.drugs.map(drug => (
                          <TouchableOpacity key={drug.name}
                            onPress={() => { setPremedPickDrug(drug); setPremedPickDose(String(drug.dose)); setPremedPickRoute(drug.defaultRoute) }}
                            style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:9,
                              backgroundColor:"#1e2d40", borderWidth:1, borderColor:"#2a3a50" }}>
                            <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"700" }}>{drug.name}</Text>
                            <Text style={{ color:"#64748b", fontSize:10, marginTop:2 }}>{drug.dose} {drug.unit}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
          ) : (
            <View style={{ gap:14 }}>
              <TouchableOpacity onPress={() => setPremedPickDrug(null)}>
                <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
              </TouchableOpacity>
              <Text style={{ color:"#f8fafc", fontSize:16, fontWeight:"700" }}>{premedPickDrug.name}</Text>

              <View>
                <Text style={{ color:"#64748b", fontSize:11, fontWeight:"700", textTransform:"uppercase",
                  letterSpacing:1, marginBottom:8 }}>Dose ({premedPickDrug.unit})</Text>
                <View style={{ flexDirection:"row", alignItems:"center", gap:8 }}>
                  <TouchableOpacity
                    onPress={() => { const v = parseFloat(premedPickDose) || premedPickDrug.dose; setPremedPickDose(String(Math.max(premedPickDrug.min, Math.round((v - premedPickDrug.step) * 1000) / 1000))) }}
                    style={{ width:44, height:44, borderRadius:10, backgroundColor:"#1e2d40", alignItems:"center", justifyContent:"center", borderWidth:1, borderColor:"#2a3a50" }}>
                    <Text style={{ color:"#93c5fd", fontSize: Platform.OS === "web" ? 18 : 22, fontWeight:"700" }}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={{ flex:1, minWidth:0, backgroundColor:"#111111", color:"#fff", borderRadius:10,
                      padding: Platform.OS === "web" ? 9 : 12,
                      fontSize: Platform.OS === "web" ? 18 : 22,
                      borderWidth:1, borderColor:"#3e3e3e", textAlign:"center" }}
                    keyboardType="decimal-pad"
                    value={premedPickDose}
                    onChangeText={setPremedPickDose}
                  />
                  <TouchableOpacity
                    onPress={() => { const v = parseFloat(premedPickDose) || premedPickDrug.dose; setPremedPickDose(String(Math.min(premedPickDrug.max, Math.round((v + premedPickDrug.step) * 1000) / 1000))) }}
                    style={{ width:44, height:44, borderRadius:10, backgroundColor:"#1e2d40", alignItems:"center", justifyContent:"center", borderWidth:1, borderColor:"#2a3a50" }}>
                    <Text style={{ color:"#93c5fd", fontSize: Platform.OS === "web" ? 18 : 22, fontWeight:"700" }}>+</Text>
                  </TouchableOpacity>
                </View>
                {!!premedPickDrug.hint && <Text style={{ color:"#475569", fontSize:11, marginTop:6 }}>{premedPickDrug.hint}</Text>}
              </View>

              <View>
                <Text style={{ color:"#64748b", fontSize:11, fontWeight:"700", textTransform:"uppercase",
                  letterSpacing:1, marginBottom:8 }}>Route</Text>
                <View style={{ flexDirection:"row", gap:8 }}>
                  {premedPickDrug.routes.map(r => (
                    <TouchableOpacity key={r} onPress={() => setPremedPickRoute(r)}
                      style={{ flex:1, paddingVertical:10, borderRadius:8, alignItems:"center",
                        backgroundColor: premedPickRoute === r ? "#1e3a5f" : "#111111",
                        borderWidth:1, borderColor: premedPickRoute === r ? "#3b82f6" : "#2a3a4a" }}>
                      <Text style={{ color: premedPickRoute === r ? "#93c5fd" : "#64748b",
                        fontWeight:"700", fontSize:13 }}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                onPress={() => {
                  const entry = `${premedPickDrug.name} ${premedPickDose} ${premedPickDrug.unit} ${premedPickRoute}`
                  const drugName = premedPickDrug.name
                  const addEntry = (prev: string) => {
                    // Remove existing entry for same drug, then append new one (web behaviour)
                    const items = prev ? prev.split(";").map(s => s.trim()).filter(Boolean) : []
                    const filtered = items.filter(s => !s.startsWith(drugName + " "))
                    return [...filtered, entry].join("; ")
                  }
                  if (premedPickPhase === "evening") {
                    setPremedEveningText(prev => addEntry(prev))
                  } else {
                    setPremedMorningText(prev => addEntry(prev))
                  }
                  setPremedPickOpen(false)
                  setPremedPickDrug(null)
                  setPremedPickCat(null)
                  setTimeout(savePremedication, 200)
                }}
                disabled={!premedPickDose}
                style={{ backgroundColor: premedPickDose ? "#1e3a5f" : "#111111", borderRadius:12,
                  padding:16, alignItems:"center", borderWidth:1, borderColor:"#3b82f6" }}>
                <Text style={{ color:"#93c5fd", fontWeight:"700", fontSize:15 }}>
                  Add to {premedPickPhase}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Sheet>

        {/* ── Continue to Postoperative button (pinned bottom when case ended) ── */}
        {caseEnded && (
          <View style={{ padding:16, backgroundColor:"#0a0f1a", borderTopWidth:1, borderTopColor:"#1e2d40" }}>
            <TouchableOpacity
              onPress={() => {
                const params = continuedPostopItems.length > 0
                  ? `?continuedItems=${encodeURIComponent(continuedPostopItems.join("|"))}`
                  : ""
                router.replace(`/(app)/cases/postop/${id}${params}`)
              }}
              style={{ backgroundColor:"#0f2a1a", borderRadius:14, padding:18, alignItems:"center",
                borderWidth:1, borderColor:"#22c55e" }}>
              <Text style={{ color:"#86efac", fontWeight:"900", fontSize:16 }}>
                {tc("continuePostop")}
              </Text>
              {continuedPostopItems.length > 0 && (
                <Text style={{ color:"#38bdf8", fontSize:11, marginTop:4 }}>
                  {continuedPostopItems.length} item{continuedPostopItems.length > 1 ? "s" : ""} continuing postop
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

      </View>
    </>
  )
}
