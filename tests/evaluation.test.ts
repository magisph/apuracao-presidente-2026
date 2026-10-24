import { test } from "node:test";
import assert from "node:assert/strict";
import { historicalReference, evaluateOperational } from "../src/core/evaluation.ts";
import type { SectionBase, Observation } from "../src/core/types.ts";
const id = "ac/01066/0001/0001";
const identity = { election:"545", round:2, office:"0001", candidates:["13","22"] as [string,string] };
const first: SectionBase = { id, uf:"AC", municipality:"01066", region:"Norte", name:"Test", capital:false,
  electorate:300, firstA:100, firstB:100, firstOther:40, firstValid:240, members:[id], matched:true };
test("operational replay preserves historical electorate, audits differences and rejects impossible counts", () => {
  const base=historicalReference([{...first,electorate:301}], [first]);
  assert.equal(base[0].electorate,300);
  const o: Observation = { ...identity,id,version:1,hash:"h",status:"totalized",a:150,b:90,valid:240,
    blank:0,null:0,turnout:240,electorate:301,sourceTime:"2022-10-30T20:00:00Z",retrievedAt:"2022-10-30T20:00:00Z" };
  const report=evaluateOperational(base,[o],identity,{a:150,b:90},[1]);
  assert.equal(report.rejected,0);
  assert.equal(report.accepted,1);
  assert.equal(report.electorateDifferences,1);
  assert.equal(report.samples[0].estimate,150/240);
  assert.equal(report.truth,150/240);
  assert.equal(report.samples[0].progress,1);
  assert.equal(evaluateOperational(base,[{...o,electorate:200}],identity,{a:150,b:90},[1]).rejected,1);
  assert.throws(()=>evaluateOperational(base,[o,{...o,version:2,retrievedAt:"2022-10-30T19:00:00Z"}],identity,{a:1,b:1}),/chronolog/);
});
test("municipal replay rebuilds counted sections from municipal partials and converges to the truth", async () => {
  const { evaluateMunicipal } = await import("../src/core/evaluation.ts");
  const ids = ["ac/01066/0001/0001", "ac/01066/0001/0002", "ac/01066/0001/0003"];
  const base = ids.map((sid, i): SectionBase => ({ ...first, id: sid, members: [sid], firstA: 100 + i * 20, firstB: 100 - i * 20 }));
  const events: Observation[] = ids.map((sid, i) => ({ ...identity, id: sid, version: i + 1, hash: `h${i}`, status: "totalized",
    a: 140 + i * 10, b: 90 - i * 10, valid: 230, blank: 5, null: 5, turnout: 240, electorate: 300,
    sourceTime: `2022-10-30T20:0${i}:00Z`, retrievedAt: `2022-10-30T20:0${i}:00Z` }));
  const truth = { a: events.reduce((n, o) => n + o.a, 0), b: events.reduce((n, o) => n + o.b, 0) };
  const report = evaluateMunicipal(base, events, identity, truth, new Map([[ids[2], 1], [ids[0], 2], [ids[1], 3]]), [1 / 3, 1]);
  assert.equal(report.samples.length, 2);
  assert.equal(report.samples[0].estimatedSections, 1);
  assert.equal(report.samples[1].estimatedSections, 3);
  assert.ok(Math.abs(report.samples[1].estimate - truth.a / (truth.a + truth.b)) < 1e-12);
});
