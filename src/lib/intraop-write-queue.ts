// Thin adapter over the shared per-case write queue in @lospor/core/sync.
// One app-wide instance: ALL case writes (events, section patches, flushes)
// are serialized per case through this queue.
import { createCaseWriteQueue } from "@lospor/core/sync"

const queue = createCaseWriteQueue()

export function enqueueIntraopCaseWrite<T>(
  caseId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return queue.enqueue(caseId, operation)
}

export function waitForIntraopCaseWrites(caseId: string): Promise<void> {
  return queue.idle(caseId)
}

export function clearIntraopWriteQueuesForTest(): void {
  queue.clear()
}
