import { readFile } from "node:fs/promises";
import { projectHierarchy } from "../src/core/model.ts";
import { IDENTITY } from "../src/core/demo.ts";
import { AtomicStore } from "../src/collector/store.ts";
import type { SectionBase, Observation } from "../src/core/types.ts";
const loaded = JSON.parse(await readFile("data/base.json", "utf8")),
  base = loaded.sections as SectionBase[],
  matched = base.filter(
    (s) => s.matched && s.electorate !== null && s.firstValid > 0,
  ),
  sample = matched.filter((_, i) => i % 100 === 0);
const observations: Observation[] = sample.map((s) => {
  const a = s.firstA + Math.round(s.firstOther * 0.6),
    b = s.firstValid - a;
  return {
    ...IDENTITY,
    id: s.id,
    version: 1,
    hash: "synthetic-benchmark",
    status: "totalized",
    a,
    b,
    valid: s.firstValid,
    blank: 0,
    null: 0,
    turnout: s.firstValid,
    electorate: s.electorate!,
    sourceTime: "2026-10-25T20:00:00Z",
    retrievedAt: "2026-10-25T20:00:00Z",
  };
});
const start = performance.now(),
  fitted = projectHierarchy(base, observations, {
    universeElectorate: loaded.manifest.reconciliation.rows.reduce(
      (n: number, r: any) => n + r.electorateOfficial,
      0,
    ),
  }), p=fitted.national;
const result = {
  kind: "synthetic-observations-on-real-2026-base",
  precisionValidation: false,
  units: base.length,
  observed: observations.length,
  replicates: 400,
  ms: performance.now() - start,
  rssBytes: process.memoryUsage().rss,
  coverage: p.coverage,
  progress: p.progress,
  territorialHierarchy:true,
  municipalityCount:fitted.municipalities.size,
  ufCount:fitted.ufs.size,
  aggregateDifferenceA:Math.abs([...fitted.ufs.values()].reduce((n,q)=>n+(q.a??0),0)-p.a!),
  aggregateDifferenceB:Math.abs([...fitted.ufs.values()].reduce((n,q)=>n+(q.b??0),0)-p.b!),
};
await new AtomicStore("data/benchmark.json").write(result);
console.log(JSON.stringify(result, null, 2));
