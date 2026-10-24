import { test } from "node:test";
import assert from "node:assert/strict";
import { makeSnapshot } from "../src/core/snapshot.ts";
import { municipalTerritories } from "../src/core/territories.ts";
import { projectHierarchy } from "../src/core/model.ts";
import type { SectionBase, Observation } from "../src/core/types.ts";
const identity = { election: "6258", round: 2, office: "0001", candidates: ["13", "22"] as [string,string] };
const base: SectionBase[] = ["AC", "BA"].flatMap((uf) => Array.from({ length: 20 }, (_, i) => {
  const id = `${uf.toLowerCase()}/01000/0001/${String(i+1).padStart(4,"0")}`;
  return { id, uf, municipality: "01000", region: uf === "AC" ? "Norte" : "Nordeste", name: uf,
    capital: false, electorate: 300, firstA: 90, firstB: 90, firstOther: 60, firstValid: 240,
    members: [id], matched: true };
}));
const obs: Observation[] = base.filter((s,i) => i < 10 || (s.uf === "BA" && i < 23)).map(s => ({
  ...identity, id:s.id, version:1, hash:s.id, status:"totalized", a:s.uf === "AC" ? 220 : 60,
  b:s.uf === "AC" ? 20 : 180, valid:240, blank:0, null:0, turnout:240, electorate:300,
  sourceTime:"2026-10-25T20:00:00Z", retrievedAt:"2026-10-25T20:00:01Z",
}));
test("national, UF and municipality totals aggregate the same unit predictions", () => {
  const snapshot = makeSnapshot(base, obs, null, 1, "test", "test");
  const available = snapshot.territories.filter(t => t.projection.available);
  for (const field of ["a", "b", "observedA", "observedB"] as const) {
    const sum = available.reduce((n,t) => n + t.projection[field]!,0);
    assert.ok(Math.abs(sum - snapshot.projection[field]!) < 1e-8, `${field}: ${sum} vs ${snapshot.projection[field]}`);
  }
  const hierarchy = projectHierarchy(base, obs);
  const cities = municipalTerritories(base, obs, hierarchy);
  assert.ok(Math.abs(cities.reduce((n,t) => n+t.projection.a!,0)-snapshot.projection.a!)<1e-8);
  assert.equal(hierarchy.national.winner, null);
});
test("an unobserved territory borrows the fitted national hierarchy without fabricating observations", () => {
  const hierarchy = projectHierarchy(base, obs.filter(o=>o.id.startsWith("ac/")));
  const ba = hierarchy.ufs.get("BA")!;
  assert.equal(ba.available,true);
  assert.equal(ba.observedSections,0);
  assert.equal(ba.progress,0);
  assert.equal(ba.observedA,0);
  assert.ok(ba.low! <= ba.share! && ba.high! >= ba.share!);
  assert.equal(projectHierarchy(base, []).ufs.get("BA")!.available,false);
});
