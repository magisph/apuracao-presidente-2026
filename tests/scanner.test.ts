import { test } from "node:test";
import assert from "node:assert/strict";
import { changedSections, sourceAdvanced } from "../src/collector/scanner.ts";
test("cached old auxiliary cannot acknowledge the new inventory watermark", () => {
  const old = { version: 1, hash: "old", status: "totalized" };
  assert.equal(sourceAdvanced(old, old), false);
  assert.equal(sourceAdvanced(old, { ...old, version: 2, hash: "new" }), true);
});
test("section generation schedules work without treating generation as totalized votes", () => {
  const raw = {
    cdp: "3221",
    abr: [
      {
        cd: "ac",
        mu: [
          {
            cd: "01066",
            nm: "PORTO WALTER",
            zon: [
              {
                cd: "0004",
                sec: [
                  { ns: "0077" },
                  { ns: "0078", da: "25/10/2026", ha: "18:01:00" },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  assert.deepEqual(changedSections(raw, "3221", new Map()), [
    { id: "ac/01066/0004/0078", generation: "25/10/2026 18:01:00" },
  ]);
  assert.equal(
    changedSections(
      raw,
      "3221",
      new Map([["ac/01066/0004/0078", "25/10/2026 18:01:00"]]),
    ).length,
    0,
  );
});
