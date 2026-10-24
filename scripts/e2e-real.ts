import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { ReliableClient, selectAuxiliary } from "../src/collector/http.ts";
import { TSE, inventory, fetchAuxiliary, downloadBU } from "../src/collector/tse.ts";
import { gzipText, gunzipText } from "../src/core/codec.ts";

// Real first-round 2026 BUs through the production transport and decoder, compared with the signed EA20 totals.
const endpoint = process.env.E2E_URL;
if (endpoint && !/^https:\/\/apuracao-presidente-2026-peak-20261024\.phdtemiranda\.workers\.dev$/.test(endpoint))
  throw Error("Only the isolated peak worker is allowlisted; production is forbidden");
const uf = (process.env.E2E_UF ?? "ac").toLowerCase();
if (!/^[a-z]{2}$/.test(uf)) throw Error("invalid E2E_UF");
const identity = { election: "6257", round: 1, office: "0001", candidates: ["13", "22"] as [string, string] };
const client = new ReliableClient({ rps: 5 }), runId = `e2e-${Date.now()}`;
const report: any = { runId, kind: "real-first-round-2026-end-to-end", uf, startedAt: new Date().toISOString(),
  endpoint: endpoint ?? "local", productionWrites: 0, failures: {} };
let config: any;
try {
  config = await client.official(`${TSE}/comum/config/ele-c.json`);
  const plea = (config.pl ?? []).find((p: any) => p.e?.some((e: any) => String(e.cd) === identity.election));
  const election = plea?.e.find((e: any) => String(e.cd) === identity.election);
  assert.ok(plea && plea.c === "ele2026" && Number(election.t) === 1, "first-round identity rejected");
  const contest = String(plea.cd);
  report.contest = contest;
  const sections = inventory(await client.official(
    `${TSE}/ele2026/arquivo-urna/${contest}/config/${uf}/${uf}-p${contest.padStart(6, "0")}-cs.json`), contest);
  const totals = { a: 0, b: 0, other: 0, blank: 0, null: 0 }, records: any[] = [];
  let next = 0, totalized = 0, totalizedMembers = 0, notTotalized = 0;
  const started = performance.now();
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < sections.length) {
      const section = sections[next++];
      try {
        const { raw, root } = await fetchAuxiliary(client, contest, section.id);
        const selected = selectAuxiliary(raw);
        if (!selected) { notTotalized++; continue; }
        const { bytes, decode } = await downloadBU(client, root, selected, identity), bu = decode();
        for (const k of ["a", "b", "other", "blank", "null"] as const) totals[k] += bu[k];
        totalized++; totalizedMembers += section.members.length;
        records.push({ id: section.id, hash: selected.hash, bytes: bytes.length, ...bu });
      } catch (error) {
        const reason = String(error).slice(0, 120);
        report.failures[reason] = (report.failures[reason] ?? 0) + 1;
      }
      if ((totalized + notTotalized) % 250 === 0) console.log(`${totalized + notTotalized}/${sections.length}`);
    }
  }));
  report.collection = { sections: sections.length, totalized, totalizedMembers, notTotalized,
    ms: performance.now() - started, totals };
  const raw = await client.official(`${TSE}/ele2026/${identity.election}/dados/${uf}/${uf}-c0001-e00${identity.election}-u.json`);
  const office = raw.carg.find((c: any) => String(c.cd).padStart(4, "0") === identity.office);
  const candidates = office.agr.flatMap((g: any) => g.par.flatMap((p: any) => p.cand));
  const vote = (n: string) => Number(candidates.find((c: any) => String(c.n) === n)?.vap ?? NaN);
  const official = { a: vote("13"), b: vote("22"), valid: Number(raw.v.vvc), blank: Number(raw.v.vb),
    null: Number(raw.v.vn), countedSections: Number(raw.s.st), totalSections: Number(raw.s.ts) };
  report.official = official;
  report.matches = { a: totals.a === official.a, b: totals.b === official.b,
    valid: totals.a + totals.b + totals.other === official.valid, blank: totals.blank === official.blank,
    null: totals.null === official.null,
    sections: [totalized, totalizedMembers].includes(official.countedSections) };
  if (endpoint) {
    const token = (await readFile("data/peak-secret.txt", "utf8")).trim(),
      headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const http = async (path: string, body?: unknown) => {
      const r = await fetch(`${endpoint}${path}`, { method: body === undefined ? "GET" : "POST", headers,
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw Error(`${path.split("?")[0]}: ${r.status} ${(await r.text()).slice(0, 160)}`);
      return r.json() as Promise<any>;
    };
    const lease = await http("/ingest/lease", { shard: "g0", owner: `${runId}-${randomUUID()}` });
    let startCursor = 0;
    for (;;) {
      const page = await http(`/ingest/batches?shard=g0&after=${startCursor}`);
      if (page.length) startCursor = page.at(-1).cursor;
      if (page.length < 100) break;
    }
    const roundTrip = performance.now();
    let batches = 0;
    for (let i = 0; i < records.length; i += 128) {
      const slice = records.slice(i, i + 128), id = `${runId}-${i}`, payload = { encoding: "gzip-base64",
        data: await gzipText(JSON.stringify({ baseHash: "e2e-real-first-round", records: slice, cursor: i + slice.length, queue: 0 })) };
      await http("/ingest/batch", { lease, id, payload }); batches++;
      if (i === 0) await http("/ingest/batch", { lease, id, payload }); // lost acknowledgement retry
    }
    const recovered: any[] = [];
    for (let after = startCursor; ;) {
      const page = await http(`/ingest/batches?shard=g0&after=${after}`);
      for (const b of page) if (b.id.startsWith(`${runId}-`))
        recovered.push(...JSON.parse(await gunzipText(b.payload.data)).records);
      if (page.length < 100) break;
      after = page.at(-1).cursor;
    }
    const sum = (rows: any[], k: string) => rows.reduce((n, r) => n + r[k], 0);
    report.roundTrip = { batches, records: recovered.length, ms: performance.now() - roundTrip,
      equal: recovered.length === records.length && ["a", "b", "other", "blank", "null"].every(k => sum(recovered, k) === sum(records, k)) };
  }
  report.completed = Object.values(report.matches).every(Boolean) && !Object.keys(report.failures).length
    && (!endpoint || report.roundTrip.equal);
} catch (error) {
  report.completed = false; report.error = String(error); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile("data/e2e-real-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
