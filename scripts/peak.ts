import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { SectionLedger } from "../src/core/ledger.ts";
import { IDENTITY } from "../src/core/demo.ts";
import { partitionUFs } from "../src/collector/partition.ts";
import { projectHierarchy } from "../src/core/model.ts";
import { municipalTerritories } from "../src/core/territories.ts";
import { makeSnapshot } from "../src/core/snapshot.ts";
import { gzipText, gunzipText } from "../src/core/codec.ts";
import { decodePresidentialBU } from "../src/collector/ber.ts";
import type { Observation, SectionBase, Snapshot } from "../src/core/types.ts";

const endpoint = process.env.PEAK_URL;
if (endpoint && !/^https:\/\/apuracao-presidente-2026-peak-20261024\.phdtemiranda\.workers\.dev$/.test(endpoint))
  throw Error("Only the isolated peak worker is allowlisted; production is forbidden");
const token = endpoint ? (await readFile("data/peak-secret.txt", "utf8")).trim() : "";
const raw = await readFile("data/base.json", "utf8"), loaded = JSON.parse(raw),
  base = loaded.sections as SectionBase[], baseHash = createHash("sha256").update(raw).digest("hex");
const runId = `peak-${Date.now()}`, owner = runId;
const report: any = { runId, startedAt: new Date().toISOString(), kind: "synthetic-national-peak-on-real-geography",
  independentPrecisionValidation: false, endpoint: endpoint ?? "local", productionWrites: 0, units: base.length,
  modelHash: createHash("sha256").update(await readFile("src/core/model.ts")).digest("hex"),
  requests: {}, publications: [], faults: [], fullNationalRoundTrip: false };
const requestStats = new Map<string, { times: number[]; bytes: number; statuses: Record<string, number> }>();
const leases = new Map<string, any>(), renewed = new Map<string, number>();
async function http(path: string, body?: any) {
  const start = performance.now(), serialized = body === undefined ? undefined : JSON.stringify(body);
  const r = await fetch(`${endpoint}${path}`, { method: serialized ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: serialized,
    signal: AbortSignal.timeout(60000) });
  const text = await r.text(), key = path.split("?")[0];
  const stats = requestStats.get(key) ?? { times: [], bytes: 0, statuses: {} };
  stats.times.push(performance.now() - start); stats.bytes += Buffer.byteLength(serialized ?? "");
  stats.statuses[r.status] = (stats.statuses[r.status] ?? 0) + 1; requestStats.set(key, stats);
  if (!r.ok) throw Error(`${key}: ${r.status} ${text.slice(0, 160)}`);
  return JSON.parse(text);
}
async function renew(shard: string) {
  if (!endpoint) return null;
  if (Date.now() - (renewed.get(shard) ?? 0) > 40000) {
    leases.set(shard, await http("/ingest/lease", { shard, owner })); renewed.set(shard, Date.now());
  }
  return leases.get(shard);
}
async function post(path: string, shard: string, data: any) {
  const lease = await renew(shard);
  return http(path, { lease, ...data });
}
function summary() {
  for (const [path, s] of requestStats) {
    s.times.sort((a, b) => a - b);
    report.requests[path] = { count: s.times.length, bytesSent: s.bytes, statuses: s.statuses,
      p50Ms: s.times[Math.floor(s.times.length * .5)], p95Ms: s.times[Math.floor(s.times.length * .95)],
      p99Ms: s.times[Math.min(s.times.length - 1, Math.floor(s.times.length * .99))] };
  }
  report.rssBytes = process.memoryUsage().rss;
}
const time = new Date().toISOString();
const all: Observation[] = base.map((s, i) => {
  const electorate = s.electorate ?? 300, valid = Math.min(electorate, s.firstValid || Math.floor(electorate * .8)),
    a = Math.min(valid, s.firstA + Math.round(s.firstOther * .6));
  return { ...IDENTITY, id: s.id, version: 1, status: "totalized", hash: randomBytes(32).toString("hex"),
    payloadSha256: randomBytes(32).toString("hex"), inventoryGeneration: time,
    a, b: valid - a, valid, blank: 0, null: 0, turnout: valid, electorate,
    sourceTime: time, retrievedAt: time };
});
const ledger = new SectionLedger(IDENTITY, base);
let consumed = 0, sequence = 0, lastSnapshot: Snapshot | undefined;
async function publish(fraction: number) {
  const end = Math.floor(all.length * fraction);
  const applyStart = performance.now();
  while (consumed < end) ledger.apply(all[consumed++]);
  const ledgerMs = performance.now() - applyStart, observations = ledger.values(), modelStart = performance.now();
  const fitted = projectHierarchy(base, observations, { universeElectorate: 158745502 });
  const modelMs = performance.now() - modelStart, towns = municipalTerritories(base, observations, fitted);
  const snapshot = makeSnapshot(base, observations, null, ++sequence, baseHash, "ISOLATED SYNTHETIC LOAD TEST", {}, fitted);
  snapshot.id = `${runId}-${sequence}`;
  const publication: any = { fraction, observations: observations.length, ledgerMs, modelMs, municipalities: towns.length,
    ufs: fitted.ufs.size, aggregateDifferenceA: Math.abs([...fitted.ufs.values()].reduce((n, p) => n + (p.a ?? 0), 0) - fitted.national.a!),
    requestMaxBytes: 0 };
  assert.ok(publication.aggregateDifferenceA < .01);
  if (endpoint) {
    const started = performance.now(); snapshot.municipalityPages = [];
    for (const uf of new Set(towns.map(t => t.parent!))) {
      const rows = towns.filter(t => t.parent === uf), hashes: string[] = [];
      for (let i = 0; i < rows.length; i += 100) {
        const data = { sequence, uf, page: i / 100, contentAddressed: true, territories: rows.slice(i, i + 100) };
        publication.requestMaxBytes = Math.max(publication.requestMaxBytes, Buffer.byteLength(JSON.stringify({ lease: leases.get("coordinator"), ...data })));
        hashes.push((await post("/ingest/territories", "coordinator", data)).hash);
      }
      snapshot.municipalityPages.push({ uf, pages: hashes.length, hashes });
    }
    await post("/ingest/snapshot", "coordinator", { snapshot });
    const fetched = await http("/api/latest");
    assert.equal(fetched.id, snapshot.id); assert.equal(fetched.projection.a, snapshot.projection.a);
    const municipal = await http(`/api/municipalities?uf=SP&sequence=${sequence}&compressed=1`);
    let count = 0; for (const page of municipal.pages) count += JSON.parse(await gunzipText(page)).length;
    assert.equal(count, towns.filter(t => t.parent === "SP").length);
    publication.remotePublicationMs = performance.now() - started;
  }
  report.publications.push(publication); lastSnapshot = snapshot;
  summary(); await writeFile("data/peak-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(publication));
}
try {
  await mkdir("data", { recursive: true });
  if (endpoint) {
    // New isolated database only. Never overwrite an earlier test run.
    assert.equal((await http("/ingest/sequence")).sequence, 0);
    await renew("coordinator");
  }
  for (const fraction of [.01, .1, .5, 1]) await publish(fraction);
  assert.equal(ledger.records.size, base.length);
  const expectedA = all.filter((_, i) => base[i].matched && base[i].firstValid > 0).reduce((n, o) => n + o.a, 0);
  assert.equal(lastSnapshot!.projection.a, expectedA);
  const decodeStart = performance.now(), bytes = new Uint8Array(await readFile("tests/fixtures/ac-01066-0004-0077-bu.dat"));
  for (let i = 0; i < base.length; i++) {
    const decoded = decodePresidentialBU(bytes, 6257, 1, 13, 22);
    assert.equal(decoded.a, 99); assert.equal(decoded.b, 103);
  }
  report.fullUniverseBerDecodeMs = performance.now() - decodeStart;
  if (endpoint) {
    const bins = partitionUFs(base), batchStart = performance.now();
    let batches = 0, maxBytes = 0;
    await Promise.all(bins.map(async (bin, index) => {
      const shard = `g${index}`, ufSet = new Set(bin.ufs), rows = all.filter(o => ufSet.has(o.id.slice(0, 2).toUpperCase()));
      for (let i = 0; i < rows.length; i += 128) {
        const records = rows.slice(i, i + 128), id = `${runId}-${shard}-${i}`,
          payload = { encoding: "gzip-base64", data: await gzipText(JSON.stringify({ baseHash, records, cursor: i + records.length, queue: rows.length - i - records.length })) };
        maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(payload)));
        await post("/ingest/batch", shard, { id, payload }); batches++;
        if (i === 0) await post("/ingest/batch", shard, { id, payload }); // lost acknowledgement retry
        if (batches % 500 === 0) console.log(`Persisted ${batches} batches`);
      }
    }));
    report.ingestion = { batches, ms: performance.now() - batchStart, maxPayloadBytes: maxBytes, records: all.length };
    report.ingestion.recordsPerSecond = all.length / (report.ingestion.ms / 1000);
    const recovered = new SectionLedger(IDENTITY, base), recoveryStart = performance.now(); let after = 0;
    for (;;) {
      const page = await http(`/ingest/batches?shard=all&after=${after}`);
      for (const b of page) {
        const payload = JSON.parse(await gunzipText(b.payload.data));
        assert.equal(payload.baseHash, baseHash);
        for (const record of payload.records) recovered.apply(record);
      }
      if (page.length < 100) break;
      after = page.at(-1).cursor;
    }
    assert.equal(recovered.records.size, base.length);
    assert.equal(recovered.values().reduce((n, o) => n + o.a, 0), all.reduce((n, o) => n + o.a, 0));
    assert.equal(recovered.values().reduce((n, o) => n + o.b, 0), all.reduce((n, o) => n + o.b, 0));
    report.recoveryMs = performance.now() - recoveryStart; report.fullNationalRoundTrip = true;
    // Concurrent readers against immutable snapshots while heartbeat writes continue.
    const readersStart = performance.now();
    await Promise.all(Array.from({ length: 10 }, async (_, worker) => {
      for (let i = 0; i < 40; i++) {
        if (worker === 0 && i % 10 === 0) await post("/ingest/heartbeat", "coordinator", { state: "ok", queue: 0 });
        const latest = await http("/api/latest"); assert.equal(latest.id, lastSnapshot!.id);
        await http("/api/health");
      }
    }));
    report.concurrentReads = { clients: 10, requests: 800, ms: performance.now() - readersStart };
  }
  const correctionStart = performance.now(); let corrections = 0, exclusions = 0;
  for (let i = 0; i < all.length; i += 100) {
    const old = all[i], corrected = { ...old, version: 2, hash: randomBytes(32).toString("hex"), a: old.b, b: old.a };
    assert.equal(ledger.apply(corrected), true); assert.equal(ledger.apply(corrected), false); corrections++;
    if (i % 1000 === 0) { ledger.apply({ ...corrected, version: 3, status: "excluded" }); exclusions++; }
  }
  report.corrections = { corrections, exclusions, ms: performance.now() - correctionStart, recordsAfter: ledger.values().length };
  report.completed = true;
} catch (error) {
  report.completed = false; report.faults.push(String(error)); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString(); summary();
  await writeFile("data/peak-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
