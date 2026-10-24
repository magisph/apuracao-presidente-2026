import { readFile } from "node:fs/promises";
import { municipalTerritories } from "../src/core/territories.ts";
import { gzipText } from "../src/core/codec.ts";
import { IDENTITY } from "../src/core/demo.ts";
import { AtomicStore } from "../src/collector/store.ts";
import type { SectionBase, Observation } from "../src/core/types.ts";
const base = JSON.parse(await readFile("data/base.json", "utf8"))
  .sections as SectionBase[];
const seen = base.filter(
  (s, i) =>
    s.matched && s.electorate !== null && s.firstValid > 0 && i % 5 === 0,
);
const obs: Observation[] = seen.map((s) => {
  const a = s.firstA + Math.round(s.firstOther * 0.6);
  return {
    ...IDENTITY,
    id: s.id,
    version: 1,
    hash: "synthetic-budget",
    status: "totalized",
    a,
    b: s.firstValid - a,
    valid: s.firstValid,
    blank: 0,
    null: 0,
    turnout: s.firstValid,
    electorate: s.electorate!,
    sourceTime: "2026-10-25T20:00:00Z",
    retrievedAt: "2026-10-25T20:00:00Z",
  };
});
const towns = municipalTerritories(base, obs);
let pages = 0,
  rawBytes = 0,
  maxPageBytes = 0,
  storedBytes = 0;
for (const uf of new Set(towns.map((t) => t.parent))) {
  const rows = towns.filter((t) => t.parent === uf);
  for (let i = 0; i < rows.length; i += 100) {
    const text = JSON.stringify(rows.slice(i, i + 100));
    pages++;
    maxPageBytes=Math.max(maxPageBytes,Buffer.byteLength(JSON.stringify({lease:{shard:"coordinator",owner:"x".repeat(100),epoch:1,expires:1793000000000},sequence:999999,uf,page:i/100,territories:rows.slice(i,i+100),contentAddressed:true})));
    rawBytes += Buffer.byteLength(text);
    storedBytes += Buffer.byteLength(await gzipText(text));
  }
}
const batchStored = Buffer.byteLength(
    await gzipText(JSON.stringify({ records: obs.slice(0, 128) })),
  ),
  batchCount = Math.ceil(base.length / 128),
  versions = 240;
const report = {
  kind: "planning-estimate-not-production-verification",
  scenario:
    "6h de mudanças; publicação a cada90s, verificação oficial15s, bateladas128; todas as páginas mudam em todas as versões (conservador para blobs).",
  municipalities: towns.length,
  pagesPerVersion: pages,
  rawMunicipalBytes: rawBytes,
  maxIngestPageBytes:maxPageBytes,
  ingestPageLimit:90000,
  initialReplayRequests:Math.ceil(versions/120),
  compressedMunicipalBytes: storedBytes,
  storedBatchBytes: batchStored,
  estimatedDataBytes:
    storedBytes * versions + batchStored * batchCount + 40000 * versions,
  estimatedRowsWritten24h:
    pages * versions * 2 +
    batchCount * 3 +
    versions * 4 +
    5 * 1440 +
    5760 +
    6 * 1920,
  estimatedWorkerRequests24h:
    pages * versions +
    batchCount +
    versions +
    5 * 1440 +
    5760 +
    6 * 1920 +
    5760 +
    5760 +
    3 * 5760,
  limits: {
    d1DatabaseBytes: 500 * 1024 * 1024,
    d1WritesPerDay: 100000,
    workerRequestsPerDay: 100000,
  },
  limitations: [
    "Não mede CPU no Worker, latência real, índices reais ou amplificação causada por retries.",
    "Requer ensaio na conta real antes de habilitar encadeamento.",
    "Rajadas, uso por terceiros e duração maior da apuração alteram o orçamento.",
  ],
};
await new AtomicStore("data/storage-budget.json").write(report);
console.log(JSON.stringify(report, null, 2));
