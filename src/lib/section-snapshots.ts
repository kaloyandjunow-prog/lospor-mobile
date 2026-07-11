// App-wide "last payload the server confirmed" store (per case+section),
// backing field-level saves: screens diff against it and PATCH only the
// fields that actually changed. In-memory by design — after an app restart
// the first save is a full payload again, which converges server-side.
import { createSectionSnapshotStore } from "@lospor/core/sync"

export const sectionSnapshots = createSectionSnapshotStore()
