export type SingleFlightQueue = {
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>
  idle: () => Promise<void>
}

export function createSingleFlightQueue(): SingleFlightQueue {
  let current: Promise<void> = Promise.resolve()

  return {
    enqueue<T>(operation: () => Promise<T>): Promise<T> {
      const run = current.catch(() => {}).then(operation)
      current = run.then(() => undefined, () => undefined)
      return run
    },
    idle(): Promise<void> {
      return current.catch(() => {})
    },
  }
}
