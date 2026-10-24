import { test } from "node:test";
import assert from "node:assert/strict";
import { project } from "../src/core/model.ts";
import type { SectionBase, Observation } from "../src/core/types.ts";
const identity = { election: "6258", round: 2, office: "0001", candidates: ["13", "22"] as [string, string] };
const ufs = [["AC", "Norte"], ["BA", "Nordeste"], ["SP", "Sudeste"], ["RS", "Sul"]];
const base: SectionBase[] = ufs.flatMap(([uf, region], u) => Array.from({ length: 600 }, (_, i) => {
  const id = `${uf.toLowerCase()}/${String(1000 + (i % 30)).padStart(5, "0")}/0001/${String(i + 1).padStart(4, "0")}`;
  const lean = 60 + ((i * 37 + u * 11) % 80);
  return { id, uf, municipality: String(1000 + (i % 30)).padStart(5, "0"), region, name: uf, capital: false,
    electorate: 300, firstA: lean, firstB: 200 - lean, firstOther: 40, firstValid: 240, members: [id], matched: true };
}));
const observe = (fraction: number): Observation[] => base.filter((_, i) => i % Math.round(1 / fraction) === 0).map(s => {
  const a = s.firstA + 22, b = s.firstB + 14;
  return { ...identity, id: s.id, version: 1, hash: s.id, status: "totalized", a, b, valid: a + b, blank: 4, null: 6,
    turnout: a + b + 10, electorate: 300, sourceTime: "2026-10-25T20:00:00Z", retrievedAt: "2026-10-25T20:00:00Z" };
});
const width = (p: ReturnType<typeof project>) => (p.high! - p.low!) * 100;
test("calibrated band is informative early and narrows as the remaining electorate shrinks", () => {
  const early = project(base, observe(0.1), { seed: 7 }), late = project(base, observe(0.5), { seed: 7 });
  assert.ok(early.available && late.available);
  assert.ok(width(early) < 3.5, `early width ${width(early)}`);
  assert.ok(width(late) < width(early), `${width(late)} >= ${width(early)}`);
  assert.ok(early.low! <= early.share! && early.share! <= early.high!);
});
test("shock scales are options so a replay can calibrate them", () => {
  const narrow = project(base, observe(0.1), { seed: 7, nationalShock: 0.01, ufShock: 0.01 }),
    wide = project(base, observe(0.1), { seed: 7, nationalShock: 0.2, ufShock: 0.2 });
  assert.ok(width(narrow) < width(wide));
  assert.deepEqual([narrow.a,narrow.b,narrow.share,narrow.winner],[wide.a,wide.b,wide.share,null]);
});
