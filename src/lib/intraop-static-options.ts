import { COMPLICATION_CATEGORIES } from "@lospor/core/complications"

// Single source of truth is @lospor/core/complications (shared with
// lospor-app), headings and their Bulgarian titles included.
export const COMPLICATION_ITEMS = COMPLICATION_CATEGORIES.flatMap(category => category.items)
