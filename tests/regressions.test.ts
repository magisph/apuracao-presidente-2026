import { test } from "node:test";
import assert from "node:assert/strict";
import { ReliableClient } from "../src/collector/http.ts";
import { collectSection } from "../src/collector/tse.ts";
import { validateSnapshot } from "../src/core/validation.ts";
import { makeDemo, IDENTITY } from "../src/core/demo.ts";
import { csvRows } from "../src/collector/csv.ts";
import { LoadGeneration } from "../src/ui/state.ts";
test("previously totalized BU is withdrawn on explicit source exclusion or ambiguous totalized versions", async () => {
  const previous = {
    ...IDENTITY,
    id: "ac/01066/0004/0077",
    version: 1,
    hash: "ab12",
    status: "totalized" as const,
    a: 100,
    b: 100,
    valid: 200,
    blank: 0,
    null: 0,
    turnout: 200,
    electorate: 300,
    sourceTime: "2026-10-25T20:00:00Z",
    retrievedAt: "2026-10-25T20:00:00Z",
  };
  for (const raw of [
    { st: "Excluída", hashes: [] },
    {
      st: "Totalizada",
      hashes: [
        { hash: "ab12", st: "Totalizado", arq: [{ tp: "bu", nm: "o-bu.dat" }] },
        { hash: "cd34", st: "Totalizado", arq: [{ tp: "bu", nm: "o-bu.dat" }] },
      ],
    },
  ]) {
    const client = new ReliableClient();
    client.official = async () => ({
      ...raw,
      dg: "25/10/2026",
      hg: "18:05:00",
    });
    const o = await collectSection(
      client,
      "3221",
      previous.id,
      IDENTITY,
      previous,
    );
    assert.equal(o?.status, "excluded");
    assert.equal(o?.version, Date.parse("2026-10-25T21:05:00Z"));
  }
});
test("snapshot rejects impossible projections, duplicate territories and false calibrated seal", () => {
  const s = makeDemo(1)[0];
  validateSnapshot(s);
  for (const p of [
    { share: 2 },
    { a: -10 },
    { low: 0.9, high: 0.1 },
    { winner: "13" },
  ])
    assert.throws(() =>
      validateSnapshot({ ...s, projection: { ...s.projection, ...p } }),
    );
  assert.throws(() =>
    validateSnapshot({
      ...s,
      territories: [s.territories[0], s.territories[0]],
    }),
  );
});
test("CSV parser preserves quoted delimiters and newlines across chunk boundaries", async () => {
  async function* input() {
    yield '"A";"B"\r';
    yield '\n"one;two";"line\n';
    yield 'next"\n"say "';
    yield '"hello""";4';
  }
  const out = [];
  for await (const row of csvRows(input())) out.push(row);
  assert.deepEqual(out, [
    ["A", "B"],
    ["one;two", "line\nnext"],
    ['say "hello"', "4"],
  ]);
});
test("late response from prior data mode cannot overwrite the current dashboard", () => {
  const state = new LoadGeneration();
  const old = state.begin();
  const current = state.begin();
  assert.equal(state.current(old), false);
  assert.equal(state.current(current), true);
});
test("a pending municipal response cannot overwrite a newer territory selection", () => {
  const loads=new LoadGeneration();
  const request=loads.begin();
  assert.equal(loads.current(request,"AC","AC"),true);
  assert.equal(loads.current(request,"AC","BA"),false);
  assert.equal(loads.current(request,"AC","BR"),false);
});
