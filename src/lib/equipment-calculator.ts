import { suggestsDifficultAirwayEquipment, type AirwayFindings } from "./risk-derivation"

export interface EquipItem { label: string; value: string; note?: string }
export interface EquipCat  { cat: string; color: string; items: EquipItem[] }

export function calcEquipment(age?: number, weight?: number, height?: number, sex?: string, airway?: AirwayFindings): EquipCat[] {
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

  // ── Difficult airway (from today's exam findings, not history) ─────────────
  const difficultAirway = airway ? suggestsDifficultAirwayEquipment(airway) : false
  function backupEttSize(): string {
    const primary = parseFloat(ett.size.split("/")[0].trim())
    return Number.isFinite(primary) ? `${primary - 0.5}` : ett.size
  }

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
    ...(difficultAirway ? [{
      cat: "Difficult Airway", color: "#ef4444",
      items: [
        { label: "Video laryngoscope", value: "Have available", note: "from today's airway exam" },
        { label: "Bougie / stylet",    value: "Have available" },
        { label: "Backup ETT",         value: `${backupEttSize()} (0.5 smaller)` },
        { label: "Difficult airway trolley", value: "Confirm location" },
      ],
    }] : []),
  ]
}
