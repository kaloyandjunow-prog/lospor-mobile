import { expect, test } from "@playwright/test"

/**
 * The served service worker must be able to retire what it has cached.
 *
 * This exists because it could not. The cache names were a hand-written "v4"
 * that no release had ever changed, bundles were served cache-first and never
 * revalidated, and anything with an ok status was stored. One interrupted
 * download put a truncated bundle in a phone's cache under the exact filename
 * the app asks for, and that phone then failed to parse it on every visit
 * afterwards — no splash, no error, a black screen — while the same build
 * loaded correctly for everyone else and in a private window.
 *
 * Nothing could reach that phone. Every later release served the same cache
 * names, so nothing retired the entry, and the storage it sat in is not cleared
 * by clearing cookies. The build id below is what makes a deploy able to fix a
 * device it has already broken.
 */
test.describe("the service worker", () => {
  test("names its caches after the build, so a deploy retires the old ones", async ({ request }) => {
    const response = await request.get("/sw.js")
    expect(response.status()).toBe(200)
    const source = await response.text()

    expect(source, "the build id placeholder was never stamped").not.toContain("__BUILD_ID__")

    const buildId = /const BUILD_ID = "([0-9a-f]{12})"/.exec(source)?.[1]
    expect(buildId, "sw.js declares no stamped build id").toBeTruthy()

    // Both caches carry it, so activate's "delete everything that is not
    // current" sweep reaches the shell and the bundles alike.
    expect(source).toContain("`lospor-shell-${BUILD_ID}`")
    expect(source).toContain("`lospor-static-${BUILD_ID}`")
  })

  test("stores only a whole first-party response", async ({ request }) => {
    // A 206 is a fragment and an opaque response has a status of 0. Either one
    // kept under the name of a script is a file the app can never parse and,
    // being cache-first, will never fetch again.
    const source = await (await request.get("/sw.js")).text()

    expect(source).toContain('response.status === 200 && response.type === "basic"')
  })
})
