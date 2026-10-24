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
test("projection is hidden below 1% observed and flagged as unreliable until 2.5%", async () => {
  const { projectionDisplay } = await import("../src/ui/state.ts");
  assert.equal(projectionDisplay(false, 0.5), "hidden");
  assert.equal(projectionDisplay(true, 0.009), "hidden");
  assert.equal(projectionDisplay(true, 0.01), "unreliable");
  assert.equal(projectionDisplay(true, 0.0249), "unreliable");
  assert.equal(projectionDisplay(true, 0.025), "shown");
  assert.equal(projectionDisplay(true, 0.005, "simulation"), "shown");
});

test('display projection strips hidden estimates for graph, maps and territory consumers without changing the source',async()=>{
  const state=await import('../src/ui/state.ts');
  assert.equal(typeof (state as any).displayProjection,'function');
  const {makeDemo}=await import('../src/core/demo.ts');
  const p={...makeDemo(1)[0].projection,available:true,progress:.009,a:51,b:49,share:.51,low:.48,high:.54};
  const hidden=(state as any).displayProjection(p,'live');
  assert.equal(hidden.available,false);
  assert.deepEqual([hidden.a,hidden.b,hidden.share,hidden.low,hidden.high],[null,null,null,null,null]);
  assert.equal(p.share,.51);assert.equal((state as any).displayProjection(p,'simulation').share,.51);
});
