/**
 * A small in-memory record of what the app just did, readable on the device.
 *
 * This exists because a performance complaint from a phone in another building
 * is otherwise unfalsifiable. Chasing "tabs take 5-10 seconds" through a
 * browser harness produced three confident and wrong diagnoses; the PWA cannot
 * reproduce native timing, and there is no profiler to attach remotely. A
 * number the clinician can read aloud is worth more than any amount of
 * inference.
 *
 * Deliberately in memory only: it is a live diagnostic, not a log, and clinical
 * storage is not the place for telemetry.
 */

const MAX_SAMPLES = 20

export type TimingSample = {
  label: string
  ms: number
  /** Milliseconds since the app started, so samples can be ordered. */
  at: number
}

const started = Date.now()
const samples: TimingSample[] = []

export function recordTiming(label: string, ms: number): void {
  samples.unshift({ label, ms, at: Date.now() - started })
  if (samples.length > MAX_SAMPLES) samples.length = MAX_SAMPLES
}

export function recentTimings(): readonly TimingSample[] {
  return samples
}

export function clearTimings(): void {
  samples.length = 0
}

export function timingSummary(): { count: number; worst: number; median: number } {
  if (samples.length === 0) return { count: 0, worst: 0, median: 0 }
  const sorted = [...samples].map(s => s.ms).sort((a, b) => a - b)
  return {
    count: sorted.length,
    worst: sorted[sorted.length - 1] ?? 0,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
  }
}
