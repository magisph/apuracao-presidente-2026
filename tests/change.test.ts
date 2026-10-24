import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshotContent } from "../src/core/change.ts";
import { makeDemo } from "../src/core/demo.ts";
import { municipalTerritories } from "../src/core/territories.ts";
test("transport heartbeat cannot create vote history, but same-count correction can", () => {
  const s = makeDemo(1)[0],
    t = structuredClone(s);
  t.createdAt = "2026-10-25T22:00:00Z";
  t.sequence = 2;
  t.health.collectedAt = t.createdAt;
  assert.equal(snapshotContent(s), snapshotContent(t));
  t.projection.observedA++;
  assert.notEqual(snapshotContent(s), snapshotContent(t));
});
test("municipal historical comparison keeps first-turn other votes separate", () => {
  const id = "ac/01066/0004/0077",
    rows = municipalTerritories(
      [
        {
          id,
          uf: "AC",
          region: "Norte",
          municipality: "01066",
          name: "Porto Walter",
          capital: false,
          electorate: 289,
          firstA: 99,
          firstB: 103,
          firstOther: 15,
          firstValid: 217,
          members: [id],
          matched: true,
        },
      ],
      [],
    );
  assert.deepEqual(rows[0].historical, {
    a: 99,
    b: 103,
    other: 15,
    valid: 217,
  });
  assert.equal(rows[0].projection.available, false);
});
test("offsetting municipal corrections still create a new immutable result", () => {
  const s = makeDemo(1)[0];
  const before = [
      { id: "ac/a", a: 100, b: 100 },
      { id: "ac/b", a: 100, b: 100 },
    ],
    after = [
      { id: "ac/a", a: 90, b: 110 },
      { id: "ac/b", a: 110, b: 90 },
    ];
  assert.notEqual(
    snapshotContent(s, before as any),
    snapshotContent(s, after as any),
  );
});
