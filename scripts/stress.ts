import { project } from "../src/core/model.ts";
import { STATES, IDENTITY } from "../src/core/demo.ts";
import { AtomicStore } from "../src/collector/store.ts";
import type { SectionBase, Observation } from "../src/core/types.ts";
const base: SectionBase[] = STATES.flatMap(([uf, name, region], u) =>
  Array.from({ length: 60 }, (_, j) => {
    const id = `${uf.toLowerCase()}/${String(u * 20 + Math.floor(j / 3)).padStart(5, "0")}/0001/${String(j + 1).padStart(4, "0")}`,
      a = 60 + ((u * 19 + j * 7) % 100);
    return {
      id,
      uf,
      name,
      region,
      capital: j < 15,
      municipality: String(u * 20 + Math.floor(j / 3)),
      electorate: 300,
      firstA: a,
      firstB: 210 - a,
      firstOther: 30,
      firstValid: 240,
      members: [id],
      matched: true,
    };
  }),
);
const full = base.map((s, i): Observation => {
  const valid = 230 + (i % 5) * 3,
    a = Math.round(
      (valid * (s.firstA + (s.capital ? 0.35 : 0.65) * s.firstOther)) / 240,
    );
  return {
    ...IDENTITY,
    id: s.id,
    version: 1,
    hash: `stress-${i}`,
    status: "totalized",
    a,
    b: valid - a,
    valid,
    blank: 4,
    null: 6,
    turnout: valid + 10,
    electorate: 300,
    sourceTime: "2026-10-25T20:00:00Z",
    retrievedAt: "2026-10-25T20:00:00Z",
  };
});
const truth =
    full.reduce((n, o) => n + o.a, 0) / full.reduce((n, o) => n + o.valid, 0),
  report: any[] = [];
for (const order of ["capital-first", "interior-first", "random"]) {
  const ids = base
    .map((s, i) => ({ s, i }))
    .sort((a, b) =>
      order === "random"
        ? Math.sin(a.i * 437.7) - Math.sin(b.i * 437.7)
        : order === "capital-first"
          ? Number(b.s.capital) - Number(a.s.capital)
          : Number(a.s.capital) - Number(b.s.capital),
    );
  for (const fraction of [0.01, 0.03, 0.05, 0.1, 0.15, 0.2, 0.5, 1]) {
    const observations = ids
        .slice(0, Math.max(1, Math.floor(fraction * base.length)))
        .map((x) => full[x.i]),
      start = performance.now(),
      p = project(base, observations);
    report.push({
      order,
      fraction: p.progress,
      estimate: p.share,
      errorPP: Math.abs(p.share! - truth) * 100,
      covered: p.low! <= truth && p.high! >= truth,
      widthPP: (p.high! - p.low!) * 100,
      ms: performance.now() - start,
      winner: p.winner,
    });
  }
}
const result = {
  kind: "synthetic-data-and-order",
  independentCalibration: false,
  truth,
  units: base.length,
  maePP: report.reduce((n, r) => n + r.errorPP, 0) / report.length,
  maxErrorPP: Math.max(...report.map((r) => r.errorPP)),
  coverage: report.filter((r) => r.covered).length / report.length,
  rows: report,
};
await new AtomicStore("data/stress.json").write(result);
console.log(JSON.stringify(result, null, 2));
