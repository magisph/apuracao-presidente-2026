import { test } from "node:test";
import assert from "node:assert/strict";
import { SectionLedger } from "../src/core/ledger.ts";
import * as municipal from "../src/collector/municipal.ts";
import { estimateMunicipalObservations, parseAndamento } from "../src/collector/municipal.ts";
import type { Observation, SectionBase } from "../src/core/types.ts";

const identity = { election: "6258", round: 2, office: "0001", candidates: ["13", "22"] as [string, string] };
const section = (n: number, over: Partial<SectionBase> = {}): SectionBase => {
  const id = `ac/01066/0001/${String(n).padStart(4, "0")}`;
  return { id, uf: "AC", region: "Norte", municipality: "01066", name: "Bujari", capital: false, electorate: 300,
    firstA: 100, firstB: 100, firstOther: 40, firstValid: 240, members: [id], matched: true, ...over };
};
const sections = [section(1, { firstA: 150, firstB: 50 }), section(2), section(3, { firstA: 40, firstB: 160 }), section(4)];
const real = (s: SectionBase, version = 1000): Observation => ({ ...identity, id: s.id, version, hash: `bu-${s.id}`,
  status: "totalized", a: 120, b: 100, valid: 220, blank: 5, null: 5, turnout: 230, electorate: 300,
  sourceTime: "2026-10-25T20:10:00.000Z", retrievedAt: "2026-10-25T20:11:00.000Z" });
const partial = (a: number, b: number, countedSections: number, blank = 10, nul = 12) =>
  ({ a, b, blank, null: nul, countedSections, sourceTime: "2026-10-25T20:30:00.000Z" });
const order = new Map(sections.map((s, i) => [s.id, [30, 10, 20, 40][i]]));
const totals = (rows: Observation[]) => rows.filter(o => o.status === "totalized")
  .reduce((n, o) => ({ a: n.a + o.a, b: n.b + o.b, blank: n.blank + o.blank, null: n.null + o.null }), { a: 0, b: 0, blank: 0, null: 0 });

test("real BU replaces an estimated observation regardless of version", () => {
  const ledger = new SectionLedger(identity, sections);
  const [estimated] = estimateMunicipalObservations({ sections, partial: partial(200, 150, 1), real: [], previous: [],
    order, identity, retrievedAt: "2026-10-25T20:31:00.000Z" });
  assert.equal(estimated.estimated, true);
  assert.equal(ledger.apply(estimated), true);
  const bu = real(sections.find(s => s.id === estimated.id)!, 1);
  assert.equal(ledger.apply(bu), true);
  assert.equal(ledger.records.get(bu.id)!.hash, bu.hash);
});
test("estimated observation never replaces a real BU", () => {
  const ledger = new SectionLedger(identity, sections), bu = real(sections[1]);
  ledger.apply(bu);
  const estimated = { ...bu, version: Date.parse("2026-10-25T21:00:00Z"), hash: "est", estimated: true, a: 1, valid: 101, turnout: 111 };
  assert.equal(ledger.apply(estimated), false);
  assert.equal(ledger.records.get(bu.id)!.hash, bu.hash);
});
test("counted sections follow first-round receipt order and reproduce the municipal partial exactly", () => {
  const rows = estimateMunicipalObservations({ sections, partial: partial(301, 250, 2), real: [], previous: [],
    order, identity, retrievedAt: "2026-10-25T20:31:00.000Z" });
  assert.deepEqual(rows.map(o => o.id).sort(), [sections[1].id, sections[2].id].sort());
  assert.deepEqual(totals(rows), { a: 301, b: 250, blank: 10, null: 12 });
  for (const o of rows) {
    assert.equal(o.valid, o.a + o.b); assert.equal(o.turnout, o.valid + o.blank + o.null);
    assert.ok(o.turnout <= o.electorate); assert.equal(o.version, Date.parse("2026-10-25T20:30:00.000Z"));
  }
  // Each section keeps its own first-round profile, so the municipal swing is shared instead of flattened.
  const byId = new Map(rows.map(o => [o.id, o]));
  assert.ok(byId.get(sections[2].id)!.a < byId.get(sections[1].id)!.a);
});
test("real BUs count toward the municipal partial and only the residual is estimated", () => {
  const bu = real(sections[1]);
  const rows = estimateMunicipalObservations({ sections, partial: partial(250, 200, 2), real: [bu], previous: [],
    order, identity, retrievedAt: "2026-10-25T20:31:00.000Z" });
  assert.deepEqual(rows.map(o => o.id), [sections[2].id]);
  assert.deepEqual(totals([bu, ...rows]), { a: 250, b: 200, blank: 10, null: 12 });
});
test("section configuration timestamps select the counted set when they match the municipal count", () => {
  const rows = estimateMunicipalObservations({ sections, partial: partial(301, 250, 2), real: [], previous: [],
    totalized: new Set([sections[0].id, sections[3].id]), order, identity, retrievedAt: "2026-10-25T20:31:00.000Z" });
  assert.deepEqual(rows.map(o => o.id).sort(), [sections[0].id, sections[3].id].sort());
});
test("estimates respect each section electorate", () => {
  const small = [section(1, { electorate: 100, firstA: 40, firstB: 40, firstOther: 10, firstValid: 90 }), section(2)];
  const rows = estimateMunicipalObservations({ sections: small, partial: partial(200, 150, 2, 20, 20), real: [], previous: [],
    order: new Map(), identity, retrievedAt: "2026-10-25T20:31:00.000Z" });
  assert.deepEqual(totals(rows), { a: 200, b: 150, blank: 20, null: 20 });
  for (const o of rows) assert.ok(o.turnout <= o.electorate, `${o.id} ${o.turnout}>${o.electorate}`);
});
test("a negative residual from file timing never produces negative votes", () => {
  const bu = real(sections[1]);
  const rows = estimateMunicipalObservations({ sections, partial: partial(100, 90, 2, 3, 3), real: [bu], previous: [],
    order, identity, retrievedAt: "2026-10-25T20:31:00.000Z" });
  for (const o of rows) for (const k of ["a", "b", "blank", "null"] as const) assert.ok(o[k] >= 0);
});
test("an estimate no longer counted is withdrawn", () => {
  const first = estimateMunicipalObservations({ sections, partial: partial(301, 250, 2), real: [], previous: [],
    totalized: new Set([sections[0].id, sections[3].id]), order, identity, retrievedAt: "2026-10-25T20:31:00.000Z" });
  const next = estimateMunicipalObservations({ sections, partial: { ...partial(310, 260, 2), sourceTime: "2026-10-25T20:40:00.000Z" },
    real: [], previous: first, totalized: new Set([sections[0].id, sections[1].id]), order, identity, retrievedAt: "2026-10-25T20:41:00.000Z" });
  const withdrawn = next.find(o => o.id === sections[3].id)!;
  assert.equal(withdrawn.status, "excluded"); assert.equal(withdrawn.estimated, true);
  const ledger = new SectionLedger(identity, sections);
  for (const o of [...first, ...next]) ledger.apply(o);
  assert.deepEqual(ledger.values().map(o => o.id).sort(), [sections[0].id, sections[1].id].sort());
});
test("no counted sections yields no estimates", () => {
  assert.deepEqual(estimateMunicipalObservations({ sections, partial: partial(0, 0, 0, 0, 0), real: [], previous: [],
    order, identity, retrievedAt: "2026-10-25T20:31:00.000Z" }), []);
});
test("andamento lists counted sections and electorate per municipality", () => {
  const rows = parseAndamento({ ele: "6258", abr: [
    { tpabr: "mun", cdabr: "01066", dt: "25/10/2026", ht: "17:31:02", and: "n", s: { ts: "34", st: "3" }, e: { te: "8032", est: "700" } },
    { tpabr: "uf", cdabr: "AC", s: { ts: "1", st: "1" }, e: { te: "1", est: "1" } },
  ] }, "6258");
  assert.deepEqual(rows, [{ municipality: "01066", totalSections: 34, countedSections: 3, electorate: 8032,
    countedElectorate: 700, signature: "3|25/10/2026 17:31:02|n" }]);
  assert.throws(() => parseAndamento({ ele: "6257", abr: [] }, "6258"), /identity/);
});
test("selected sections too small for the partial expand by receipt order instead of dropping votes", () => {
  const rows = estimateMunicipalObservations({ sections, partial: partial(380, 300, 2, 10, 10), real: [], previous: [],
    order, identity, retrievedAt: "2026-10-25T20:31:00.000Z" });
  assert.deepEqual(totals(rows), { a: 380, b: 300, blank: 10, null: 10 });
  assert.equal(rows.length, 3);
});

test('configuration refresh removes withdrawn sections for that UF only',()=>{
  const configured=new Set(['ac/01066/0001/0001','ba/00001/0001/0001']);
  assert.equal(typeof (municipal as any).replaceConfiguredSections,'function');
  (municipal as any).replaceConfiguredSections(configured,'AC',[{id:'ac/01066/0001/0002',generation:'25/10/2026 17:30:00'}]);
  assert.deepEqual([...configured].sort(),['ac/01066/0001/0002','ba/00001/0001/0001']);
});
test('an outdated municipal partial cannot invent residual votes after newer real BUs',()=>{
  const bu=real(sections[1]);
  const previous=estimateMunicipalObservations({sections,partial:partial(200,150,1),real:[],previous:[],order,identity,retrievedAt:bu.retrievedAt});
  const rows=estimateMunicipalObservations({sections,partial:partial(100,90,2,3,3),real:[bu],previous,order,identity,retrievedAt:bu.retrievedAt});
  assert.equal(rows.filter(r=>r.status==='totalized').length,0);
});

for (const status of ['excluded', 'received'] as const) {
  test(`real ${status} BU cannot absorb municipal residual assigned to a free section`, () => {
    const units = [section(1), section(2)], bu = {...real(units[0]), status};
    const ledger = new SectionLedger(identity, units);
    ledger.apply(bu);
    const rows = estimateMunicipalObservations({sections: units, partial: partial(120,90,1,0,0),
      real:[bu],previous:[],order:new Map(),identity,retrievedAt:bu.retrievedAt});
    for (const row of rows) ledger.apply(row);
    assert.deepEqual(ledger.values().map(o=>o.id), [units[1].id]);
    assert.deepEqual(totals(ledger.values()), {a:120,b:90,blank:0,null:0});
    assert.equal(ledger.records.get(bu.id)!.status,status);
  });
}

test('municipal partial above all eligible historical capacity is rejected instead of truncating B', () => {
  const units=[section(1)];
  assert.throws(()=>estimateMunicipalObservations({sections:units,partial:partial(220,120,1,10,10),
    real:[],previous:[],order:new Map(),identity,retrievedAt:'2026-10-25T20:31:00Z'}),/capacity|conservation/);
});

test('positive municipal votes with zero counted sections cannot be silently acknowledged',()=>{
  assert.throws(()=>estimateMunicipalObservations({sections,partial:partial(120,90,0,0,0),
    real:[],previous:[],order,identity,retrievedAt:'2026-10-25T20:31:00Z'}),/conservation/);
});

test('regressed municipal partial withdraws unsafe estimates after a newer BU outside their set', () => {
  const ledger=new SectionLedger(identity,sections), sourceTime='2026-10-25T20:40:00.000Z';
  const initial=estimateMunicipalObservations({sections,partial:{...partial(220,200,2,0,0),sourceTime},
    real:[],previous:[],order:new Map(),identity,retrievedAt:sourceTime});
  initial.forEach(o=>ledger.apply(o));
  const bu={...real(sections[2]),sourceTime:'2026-10-25T20:50:00.000Z',blank:0,null:0,turnout:220};
  ledger.apply(bu);
  const next=estimateMunicipalObservations({sections,partial:partial(220,200,2,0,0),real:[bu],previous:initial,
    order:new Map(),identity,retrievedAt:bu.sourceTime});
  next.forEach(o=>ledger.apply(o));
  assert.deepEqual(ledger.values().map(o=>o.id),[bu.id]);
  assert.deepEqual(totals(ledger.values()),{a:120,b:100,blank:0,null:0});
  assert.equal(ledger.quarantined.size,0);
});
