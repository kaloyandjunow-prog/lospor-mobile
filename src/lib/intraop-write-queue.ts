import { createSingleFlightQueue, type SingleFlightQueue } from "@/lib/single-flight-queue"

const queues = new Map<string, SingleFlightQueue>()

function queueForCase(caseId: string): SingleFlightQueue {
  const existing = queues.get(caseId)
  if (existing) return existing
  const queue = createSingleFlightQueue()
  queues.set(caseId, queue)
  return queue
}

export function enqueueIntraopCaseWrite<T>(
  caseId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return queueForCase(caseId).enqueue(operation)
}

export function waitForIntraopCaseWrites(caseId: string): Promise<void> {
  return queueForCase(caseId).idle()
}

export function clearIntraopWriteQueuesForTest(): void {
  queues.clear()
}
