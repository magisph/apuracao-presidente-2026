import { test } from "node:test";
import assert from "node:assert/strict";
import { publishMunicipalPages } from "../src/collector/publication.ts";
import type { Territory } from "../src/core/types.ts";
const town = (uf: string, i: number): Territory => ({
  code: `${uf}/${String(i).padStart(5, "0")}`, parent: uf, name: `Town ${i}`, region: "Norte",
  projection: { available: false } as any,
});
const towns = (uf: string, n: number) => Array.from({ length: n }, (_, i) => town(uf, i));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
test("manifest follows UF order and page index despite out-of-order completion", async () => {
  const manifest = await publishMunicipalPages([...towns("SP", 1), ...towns("AC", 250)], ["AC", "AL", "SP"],
    async p => { await sleep(30 - p.page * 10); return { hash: `${p.uf}-${p.page}` }; });
  assert.deepEqual(manifest, [
    { uf: "AC", pages: 3, hashes: ["AC-0", "AC-1", "AC-2"] },
    { uf: "SP", pages: 1, hashes: ["SP-0"] },
  ]);
});
test("pages carry at most one hundred municipalities of their own UF", async () => {
  const sizes: number[] = [];
  await publishMunicipalPages(towns("AC", 250), ["AC"], async p => {
    assert.ok(p.territories.every(t => t.parent === "AC")); sizes[p.page] = p.territories.length;
    return { hash: String(p.page) };
  });
  assert.deepEqual(sizes, [100, 100, 50]);
});
test("never exceeds four pages in flight", async () => {
  const ufs = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA"];
  let inFlight = 0, max = 0;
  await publishMunicipalPages(ufs.flatMap(uf => towns(uf, 100)), ufs, async p => {
    max = Math.max(max, ++inFlight); await sleep(5); inFlight--;
    return { hash: p.uf };
  });
  assert.equal(max, 4);
});
test("first failure stops dispatch, waits in-flight pages and rejects", async () => {
  const ufs = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA"];
  let inFlight = 0, calls = 0;
  await assert.rejects(publishMunicipalPages(ufs.flatMap(uf => towns(uf, 100)), ufs, async p => {
    const call = ++calls; inFlight++;
    try {
      await sleep(call === 3 ? 1 : 20);
      if (call === 3) throw Error("ingestion /ingest/territories: 503");
      return { hash: p.uf };
    } finally { inFlight--; }
  }), /503/);
  assert.equal(inFlight, 0);
  assert.ok(calls <= 6, `calls=${calls}`);
});
