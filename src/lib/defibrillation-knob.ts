import { DEFIBRILLATION_MAX_J, DEFIBRILLATION_MIN_J, clampDefibrillationEnergy } from "@lospor/core/defibrillation"

/**
 * The energy knob (10.1.0): 1 J at the left end of a 300° sweep, 360 J at the
 * right, the gap at the bottom. Angles in degrees, 0 at the top, clockwise.
 */
export const KNOB_SWEEP = 300
const HALF = KNOB_SWEEP / 2

export function knobAngleForEnergy(energy: number): number {
  const share = (clampDefibrillationEnergy(energy) - DEFIBRILLATION_MIN_J) / (DEFIBRILLATION_MAX_J - DEFIBRILLATION_MIN_J)
  return -HALF + share * KNOB_SWEEP
}

/** The energy at a touch point inside a knob of `size`; a touch in the gap goes to the nearer end. */
export function knobEnergyForPoint(x: number, y: number, size: number): number {
  const dx = x - size / 2
  const dy = size / 2 - y
  // The gap is centred at the bottom: its right half is nearer 360 J, its left half nearer 1 J.
  const angle = Math.min(HALF, Math.max(-HALF, Math.atan2(dx, dy) * 180 / Math.PI))
  const share = (angle + HALF) / KNOB_SWEEP
  return clampDefibrillationEnergy(DEFIBRILLATION_MIN_J + share * (DEFIBRILLATION_MAX_J - DEFIBRILLATION_MIN_J))
}

/** A point on the knob's circle at an angle, for drawing. */
export function knobPoint(angle: number, radius: number, center: number): { x: number; y: number } {
  const rad = angle * Math.PI / 180
  return { x: center + radius * Math.sin(rad), y: center - radius * Math.cos(rad) }
}

/** The SVG path of the arc from the start of the sweep to an angle. */
export function knobArcPath(toAngle: number, radius: number, center: number): string {
  const start = knobPoint(-HALF, radius, center)
  const end = knobPoint(toAngle, radius, center)
  const large = toAngle + HALF > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`
}

type Listener = () => void
let openAt: string | null = null
const listeners = new Set<Listener>()

/** The Defibrillation sheet is opened from the slot sheet with the slot's time; one at a time. */
export const defibrillationSheet = {
  open(ts: string) { openAt = ts; listeners.forEach(listener => listener()) },
  close() { openAt = null; listeners.forEach(listener => listener()) },
  current: () => openAt,
  subscribe(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
}
