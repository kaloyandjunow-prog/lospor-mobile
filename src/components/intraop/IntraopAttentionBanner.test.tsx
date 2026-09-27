import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { intraopAttentionItems } from "@lospor/core/intraop-attention"
import { INTRAOP_ATTENTION_SCENARIOS } from "@lospor/core/intraop-attention-scenarios"

vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key, language: "en" }) }))

import { logAfterAttentionAnswer } from "@/lib/use-intraop-attention"
import { render } from "@/test/render"
import { IntraopAttentionBanner } from "./IntraopAttentionBanner"

// The PWA against Core's shared scenarios (9.13.0). The web app runs the same
// scenarios; if either lists or writes differently, its own test fails.

const answerTestIds = {
  stopped: "attention-stopped",
  still_running: "attention-still-running",
  happened: "end-case-after-end-move",
  did_not_happen: "end-case-after-end-delete",
} as const

describe.each(INTRAOP_ATTENTION_SCENARIOS)("$name", scenario => {
  it("shows exactly the items Core lists, and each answer reaches Core unchanged", () => {
    const resolve = vi.fn(async () => {})
    const items = intraopAttentionItems(scenario.log, scenario.context)
    const tree = render(
      <IntraopAttentionBanner attention={{ items, resolve, clockOf: () => "00:00", labelOf: event => event.id }} />,
    )
    const shown = tree.root.findAll(node => typeof node.props?.testID === "string" && node.props.testID.startsWith("attention-stopped-")
      || typeof node.props?.testID === "string" && node.props.testID.startsWith("end-case-after-end-move-"))
      .map(node => String(node.props.testID).replace(/^(attention-stopped|end-case-after-end-move)-/, ""))
    expect([...new Set(shown)]).toEqual(scenario.expected.map(item => item.key))
    for (const resolution of scenario.resolutions) {
      const button = tree.root.findAll(node => node.props?.testID === `${answerTestIds[resolution.action]}-${resolution.key}`)[0]
      act(() => { button.props.onPress() })
      expect(resolve).toHaveBeenLastCalledWith(resolution.key, resolution.action)
    }
  })

  it.each(scenario.resolutions.map(resolution => [resolution.action, resolution] as const))(
    "%s writes Core's operations into the log",
    (_action, resolution) => {
      const next = logAfterAttentionAnswer(scenario.log, resolution.key, resolution.action, scenario.context)!
      for (const removed of resolution.removes ?? []) expect(next.some(event => event.id === removed)).toBe(false)
      for (const [id, fields] of Object.entries(resolution.updates ?? {})) {
        expect(next.find(event => event.id === id)).toMatchObject(fields)
      }
    },
  )
})
