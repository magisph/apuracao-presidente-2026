import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SectionLedger, groupHistorical } from "../src/core/ledger.ts";
import { parseOfficial } from "../src/core/official.ts";
import { project } from "../src/core/model.ts";
import type { SectionBase, Observation } from "../src/core/types.ts";

export const identity = {
  election: "6258",
  round: 2,
  office: "0001",
  candidates: ["13", "22"] as [string, string],
};
export const base: SectionBase[] = [
  {
    id: "ac/01066/0004/0077",
    uf: "AC",
    region: "Norte",
    municipality: "01066",
    name: "Bujari",
    capital: false,
    electorate: 300,
    firstA: 90,
    firstB: 90,
    firstOther: 60,
    firstValid: 240,
    members: ["ac/01066/0004/0077"],
    matched: true,
  },
  {
    id: "ac/01066/0004/0078",
    uf: "AC",
    region: "Norte",
    municipality: "01066",
    name: "Bujari",
    capital: false,
    electorate: 300,
    firstA: 90,
    firstB: 90,
    firstOther: 60,
    firstValid: 240,
    members: ["ac/01066/0004/0078"],
    matched: true,
  },
];
export function obs(
  id = base[0].id,
  version = 1,
  a = 130,
  b = 110,
): Observation {
  return {
    ...identity,
    id,
    version,
    hash: `hash-${version}-${a}-${b}`,
    status: "totalized",
    a,
    b,
    valid: a + b,
    blank: 5,
    null: 5,
    turnout: a + b + 10,
    electorate: 300,
    sourceTime: "2026-10-25T21:00:00Z",
    retrievedAt: "2026-10-25T21:00:01Z",
  };
}

test("correction replaces prior votes, replay is idempotent and older versions cannot reverse latest", () => {
  const ledger = new SectionLedger(identity, base);
  ledger.apply(obs());
  ledger.apply(obs());
  ledger.apply(obs(base[0].id, 2, 120, 120));
  ledger.apply(obs());
  assert.equal(ledger.values().length, 1);
  assert.equal(ledger.values()[0].a, 120);
});
test("same version with conflicting payload is quarantined instead of silently selected", () => {
  const ledger = new SectionLedger(identity, base);
  ledger.apply(obs());
  assert.throws(() => ledger.apply(obs(base[0].id, 1, 120, 120)), /conflict/i);
  assert.equal(ledger.values().length, 0);
});
test("rejects invalid identity, negative counts, wrong turnout, overlapping membership and overcount", () => {
  const ledger = new SectionLedger(identity, base);
  for (const change of [
    { election: "6257" },
    { a: -1 },
    { turnout: 299 },
    { a: 301, valid: 411 },
  ])
    assert.throws(() => ledger.apply({ ...obs(), ...change }));
  assert.throws(
    () =>
      new SectionLedger(identity, [
        base[0],
        { ...base[1], members: [base[1].id, base[0].id] },
      ]),
    /overlap/i,
  );
});
test("a verified current BU uses its own electorate and reports historical differences", () => {
  const ledger = new SectionLedger(identity, base);
  ledger.apply({...obs(),electorate:301});
  assert.equal(ledger.values().length,1);
  assert.equal(ledger.electorateDifferences().length,1);
  assert.equal(ledger.base.get(base[0].id)!.electorate,300);
  const restored=new SectionLedger(identity,base);
  restored.restore(ledger.checkpoint());
  assert.equal(restored.electorateDifferences().length,1);
  assert.throws(()=>ledger.apply({...obs(base[0].id,2),electorate:249}));
});
test("received and excluded versions cannot contribute to counted universe", () => {
  const ledger = new SectionLedger(identity, base);
  ledger.apply({ ...obs(), status: "received" });
  assert.equal(ledger.values().length, 0);
  ledger.apply(obs(base[0].id, 2));
  ledger.apply({ ...obs(base[0].id, 3), status: "excluded" });
  assert.equal(ledger.values().length, 0);
});
test("historical aggregation requires every exact member and never double counts", () => {
  const grouped = groupHistorical(
    [{ ...base[0], members: [base[0].id, base[1].id] }],
    base,
  );
  assert.equal(grouped[0].firstValid, 480);
  assert.equal(grouped[0].firstA, 180);
  assert.equal(
    groupHistorical([{ ...base[0], members: [base[0].id, "unknown"] }], base)[0]
      .matched,
    false,
  );
});
test("historical already aggregated unit is counted once and partial split cannot be matched", () => {
  const h = { ...base[0], members: [base[0].id, base[1].id] };
  assert.equal(groupHistorical([h], [h])[0].firstValid, 240);
  assert.equal(groupHistorical([base[0]], [h])[0].matched, false);
});
test("projection is unavailable before observations and exact at full modeled count", () => {
  assert.equal(project(base, []).available, false);
  const p = project(base, [obs(), obs(base[1].id, 1, 100, 140)]);
  assert.equal(p.a, 230);
  assert.equal(p.b, 250);
  assert.equal(p.low, 230 / 480);
  assert.equal(p.high, p.low);
  assert.equal(p.winner, null);
});
test("projection keeps observed totals, deterministic interval, electorate progress and missing-history coverage", () => {
  const p = project(base, [obs()]);
  const p2 = project(base, [obs()]);
  assert.equal(p.available, true);
  assert.equal(p.progress, 0.5);
  assert.ok(p.a! >= 130);
  assert.ok(p.low! <= p.share! && p.high! >= p.share!);
  assert.deepEqual(p, p2);
  const partial = project([base[0], { ...base[1], matched: false }], [obs()]);
  assert.equal(partial.coverage, 0.5);
  assert.throws(() => project(base, [obs(), obs()]), /duplicate/i);
});
test("unknown historical electorate remains null and does not become a fabricated national denominator", () => {
  const unknown = {
    ...base[1],
    matched: false,
    electorate: null,
    firstA: 0,
    firstB: 0,
    firstOther: 0,
    firstValid: 0,
  };
  const p = project([base[0], unknown], [obs()]);
  assert.equal(p.coverage, null);
  assert.equal(
    project([base[0], unknown], [obs()], { universeElectorate: 600 }).coverage,
    0.5,
  );
});
test("a newer internally inconsistent BU removes stale prior votes until a valid correction arrives", () => {
  const ledger = new SectionLedger(identity, base);
  ledger.apply(obs());
  assert.throws(() => ledger.apply({ ...obs(base[0].id, 2), turnout: 1 }));
  assert.equal(ledger.values().length, 0);
  ledger.apply(obs(base[0].id, 3));
  assert.equal(ledger.values().length, 1);
});
test("EA20 preserves official values, null does not become zero and invalid destination is rejected", () => {
  const raw = {
    ele: "6258",
    t: "2",
    carper: [
      {
        cd: "0001",
        dv: "s",
        md: "e",
        tf: "n",
        pst: "25,00",
        st: "10",
        s: "40",
        e: "1000",
        vvc: "600",
        vb: "10",
        vn: "20",
        a: "370",
        cand: [
          { n: "13", nm: "Candidato A", vap: "310" },
          { n: "22", nm: "Candidato B", vap: "290" },
        ],
      },
    ],
  };
  const r = parseOfficial(raw, identity);
  assert.equal(r.a, 310);
  assert.equal(r.valid, 600);
  assert.equal(r.progress, 0.25);
  assert.throws(
    () => parseOfficial({ ...raw, ele: "6257" }, identity),
    /identity/i,
  );
  assert.throws(
    () =>
      parseOfficial(
        { ...raw, carper: [{ ...raw.carper[0], dv: "n" }] },
        identity,
      ),
    /destination/i,
  );
  assert.throws(() =>
    parseOfficial(
      { ...raw, carper: [{ ...raw.carper[0], vvc: null }] },
      identity,
    ),
  );
});
test("parses the real EA20 envelope with nested candidates and electorate before totalization", () => {
  const raw = JSON.parse(
    readFileSync(
      new URL("./fixtures/ea20-2026-2t-before.json", import.meta.url),
      "utf8",
    ),
  );
  const r = parseOfficial(raw, identity);
  assert.equal(r.totalSections, 499248);
  assert.equal(r.electorate, 158745502);
  assert.equal(r.a, 0);
  assert.equal(r.candidates[0].name, "LULA");
});
