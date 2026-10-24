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
