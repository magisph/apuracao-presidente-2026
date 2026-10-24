import { readFile, mkdir, appendFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { ReliableClient } from "../src/collector/http.ts";
import {
  TSE,
  discoverElection,
  collectSection,
  inventory,
} from "../src/collector/tse.ts";
import { AtomicStore } from "../src/collector/store.ts";
import { SectionLedger } from "../src/core/ledger.ts";
import { parseOfficial } from "../src/core/official.ts";
import { makeSnapshot } from "../src/core/snapshot.ts";
import { IDENTITY, STATES } from "../src/core/demo.ts";
import { changedSections, sourceAdvanced } from "../src/collector/scanner.ts";
import { municipalTerritories } from "../src/core/territories.ts";
import { snapshotContent } from "../src/core/change.ts";
import { readEvents } from "../src/collector/events.ts";
import { gzipText, gunzipText } from "../src/core/codec.ts";
import { partitionUFs } from "../src/collector/partition.ts";
import { publishMunicipalPages } from "../src/collector/publication.ts";
import { DurableOutbox } from "../src/collector/outbox.ts";
import { collectionHealth } from "../src/collector/health.ts";
import { projectHierarchy } from "../src/core/model.ts";
import { verifyResourceHashes } from "../src/collector/provenance.ts";
import { collectionStopAt, fetchBeforeDeadline } from "../src/collector/schedule.ts";
import type { SectionBase, Observation, Snapshot } from "../src/core/types.ts";

const args = process.argv.slice(2),
  once = args.includes("--once"),
  shard = process.env.COLLECTOR_SHARD ?? "coordinator";
if (!/^coordinator$|^g[0-4]$/.test(shard))
  throw Error("invalid COLLECTOR_SHARD");
const stopAt=collectionStopAt(Number(process.env.COLLECTOR_MINUTES ?? 350),process.env.COLLECTION_DEADLINE_UTC);
if(Date.now()>=stopAt) { console.log("Prazo de coleta encerrado."); process.exit(0); }
const endpoint = process.env.INGEST_URL,
  token = process.env.INGEST_TOKEN,
  owner = `${process.env.GITHUB_RUN_ID ?? "local"}-${shard}-${randomUUID()}`;
if (endpoint && (!token || !endpoint.startsWith("https://")))
  throw Error("HTTPS ingest endpoint and secret required");
const guardedFetch=fetchBeforeDeadline(stopAt);
const client = new ReliableClient({ rps: shard === "coordinator" ? 5 : 15, fetch:guardedFetch });
const config = discoverElection(
  await client.official(`${TSE}/comum/config/ele-c.json`),
  IDENTITY.election,
);
const modelHash = createHash("sha256")
  .update(await readFile(new URL("../src/core/model.ts", import.meta.url)))
  .digest("hex");
let base: SectionBase[] = [],
  baseHash: string | null = null;
let baseComplete = false;
let denominators: Record<string, number> = {};
try {
  const raw = await readFile(process.env.BASE_FILE ?? "data/base.json", "utf8"),
    loaded = JSON.parse(raw);
  base = loaded.sections;
  if (loaded.manifest?.resources) verifyResourceHashes(loaded);
  baseComplete = loaded.manifest?.complete === true;
  denominators = Object.fromEntries(
    (loaded.manifest?.reconciliation?.rows ?? []).map((r: any) => [
      r.uf,
      r.electorateOfficial,
    ]),
  );
  baseHash = createHash("sha256").update(raw).digest("hex");
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
if (shard !== "coordinator" && !base.length)
  throw Error(
    "Bloqueado: importar base histórica e correspondências antes de coletar BUs",
  );
const bins = partitionUFs(base);
if (shard !== "coordinator") {
  const owned = new Set(bins[Number(shard.slice(1))].ufs);
  base = base.filter((s) => owned.has(s.uf));
}
const ledger = new SectionLedger(IDENTITY, base),
  store = new AtomicStore(
    `data/checkpoint-${shard}-${baseHash?.slice(0, 12) ?? "no-base"}.json`,
  );
const applyObservation = (o: Observation) => {
  try {
    return ledger.apply(o);
  } catch (e) {
    if (ledger.quarantined.has(o.id)) return true;
    throw e;
  }
};
let sequence = 0,
  cursor = 0,
  lease: any = null,
  lastLease = 0;
let remoteCursors: Record<string, number> = {},
  lastSignature = "";
let lastPublishedAt = 0;
const publishInterval = Number(
  process.env.PUBLISH_INTERVAL_MS ?? (endpoint ? 90000 : 15000),
);
const groupHealth: Record<
  string,
  { checkedAt: string | null; queue: number; state: "ok" | "stale" | "waiting" }
> = {};
const post = async (path: string, body: unknown) => {
  const r = await guardedFetch(`${endpoint}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw Error(`ingestion ${path}: ${r.status}`);
  return r.json() as Promise<any>;
};
const outbox = endpoint && shard !== "coordinator"
  ? await DurableOutbox.open(`data/outbox-${shard}-${baseHash?.slice(0, 12)}.json`, baseHash!)
  : null;
let deliveryRetryAt = 0, deliveryFailures = 0;
async function deliverPending() {
  if (!outbox?.size) return true;
  if (Date.now() < deliveryRetryAt) {
    await new Promise(r => setTimeout(r, Math.min(1000, deliveryRetryAt - Date.now())));
    return false;
  }
  try {
    await outbox.flush(async batch => { await post("/ingest/batch", { lease, ...batch }); });
    deliveryFailures = 0;
    return true;
  } catch (e) {
    // Keep the durable payload, including after a lost response to a committed request.
    deliveryRetryAt = Date.now() + Math.min(60000, 1000 * 2 ** Math.min(deliveryFailures++, 6));
    const health = { checkedAt: new Date().toISOString(), queue: outbox.size, state: "stale" };
    await new AtomicStore(`data/health-${shard}.json`).write(health);
    try { await post("/ingest/heartbeat", { lease, ...health }); } catch {}
    console.error("Entrega pendente; lote preservado:", String(e));
    return false;
  }
}
const renew = async () => {
  if (endpoint && Date.now() - lastLease > 45000) {
    for (let attempt = 0; ; attempt++) {
      try {
        lease = await post("/ingest/lease", { shard, owner });
        break;
      } catch (e) {
        if (!String(e).includes("409") || attempt >= 6) throw e;
        await new Promise((r) => setTimeout(r, 20000));
      }
    }
    lastLease = Date.now();
  }
};
const batches = async (group: string) => {
  const out: any[] = [];
  let after = remoteCursors[group] ?? 0;
  for (;;) {
    await renew();
    const r = await guardedFetch(
      `${endpoint}/ingest/batches?shard=${group}&after=${after}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!r.ok) throw Error(`checkpoint restore ${r.status}`);
    const page = (await r.json()) as any[];
    for (const b of page)
      if (b.payload?.encoding === "gzip-base64")
        b.payload = JSON.parse(await gunzipText(b.payload.data));
    out.push(...page);
    if (page.length < 100) break;
    after = page.at(-1).cursor;
  }
  return out;
};
try {
  const saved = await store.read<any>();
  if (saved.baseHash !== baseHash) throw Error("checkpoint base hash mismatch");
  ledger.restore(saved.ledger);
  sequence = saved.sequence;
  cursor = saved.cursor;
  remoteCursors = saved.remoteCursors ?? {};
  lastSignature = saved.lastSignature ?? "";
  lastPublishedAt = saved.lastPublishedAt ?? 0;
  Object.assign(groupHealth, saved.groupHealth ?? {});
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
await renew();
if (shard === "coordinator")
  try {
    const prior = await new AtomicStore("data/latest.json").read<Snapshot>();
    sequence = Math.max(sequence, prior.sequence);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
if (!endpoint) {
  const local = await readEvents(`data/events-${shard}.ndjson`);
  for (const b of local.events) {
    if (b.baseHash !== baseHash) continue;
    for (const o of b.records ?? []) {
      try {
        ledger.apply(o);
      } catch (e) {
        console.error(String(e));
      }
    }
  }
}
if (endpoint) {
  for (const b of await batches(shard)) {
    if (b.payload.baseHash !== baseHash)
      throw Error("remote base hash mismatch");
    for (const o of b.payload.records ?? []) applyObservation(o);
    cursor = b.payload.cursor ?? cursor;
    remoteCursors[shard] = b.cursor;
  }
  if (shard === "coordinator") {
    const sequenceResponse = await guardedFetch(`${endpoint}/ingest/sequence`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!sequenceResponse.ok) throw Error("publication recovery unavailable");
    sequence = Math.max(
      sequence,
      ((await sequenceResponse.json()) as { sequence: number }).sequence,
    );
    const r = await guardedFetch(`${endpoint}/api/latest`);
    if (r.ok)
      sequence = Math.max(sequence, ((await r.json()) as Snapshot).sequence);
  }
}
// Greedy partition by principal-section count, rather than five fixed UF lists.
const group = shard === "coordinator" ? null : bins[Number(shard.slice(1))],
  sections = base.filter((s) => group?.ufs.includes(s.uf));
const sectionIds = new Set(sections.map((s) => s.id)),
  known = new Map(
    [...ledger.records].map(([id, o]) => [id, o.inventoryGeneration ?? ""]),
  );
const pending = new Map<string, string>();
const retryAt = new Map<string, number>();
let lastCheckpoint = 0;
const errors = new Set<string>();
let scannedAt = 0,
  lastBatch = 0;
let running = true;
process.on("SIGINT", () => {
  running = false;
});
process.on("SIGTERM", () => {
  running = false;
});
do {
  const loopStarted = Date.now();
  try {
    if(Date.now()>=stopAt) break;
    await renew();
    if(Date.now()>=stopAt) break;
    if (!(await deliverPending())) continue;
    if (shard === "coordinator") {
      if (endpoint) {
        const r = await guardedFetch(`${endpoint}/ingest/health`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(30000),
        });
        if (r.ok)
          for (const g of (await r.json()) as any[])
            if (/^g[0-4]$/.test(g.shard))
              groupHealth[g.shard] = {
                checkedAt: g.checkedAt,
                queue: g.queue ?? 0,
                state:
                  Date.now() - Date.parse(g.checkedAt) > 120000
                    ? "stale"
                    : (g.collectionState ?? "waiting"),
              };
      }
      if (!endpoint && base.length)
        for (let i = 0; i < 5; i++) {
          const key = `local-g${i}`,
            page = await readEvents(
              `data/events-g${i}.ndjson`,
              remoteCursors[key] ?? 0,
            );
          for (const b of page.events) {
            if (b.baseHash !== baseHash) continue;
            for (const o of b.records ?? []) {
              try {
                ledger.apply(o);
              } catch (e) {
                console.error(String(e));
              }
            }
          }
          remoteCursors[key] = page.offset;
          try {
            groupHealth[`g${i}`] = await new AtomicStore(
              `data/health-g${i}.json`,
            ).read();
          } catch {
            groupHealth[`g${i}`] = {
              checkedAt: null,
              queue: 0,
              state: "waiting",
            };
          }
        }
      if (endpoint && base.length)
        for (const b of await batches("all")) {
          if (b.payload.baseHash !== baseHash)
            throw Error("remote base hash mismatch");
          for (const o of b.payload.records ?? []) {
            try {
              ledger.apply(o);
            } catch (e) {
              console.error("Quarentena de versão:", String(e));
            }
          }
          remoteCursors.all = b.cursor;
        }
      Object.assign(groupHealth, collectionHealth(groupHealth).groups);
      const url = `${TSE}/ele2026/6258/dados/br/br-c0001-e006258-u.json`,
        official = parseOfficial(
          await client.official(url),
          IDENTITY,
          url.replace(".json", ".jws"),
        );
      if (
        endpoint &&
        !once &&
        lastSignature &&
        Date.now() - lastPublishedAt < publishInterval
      ) {
        const heartbeat = {
          checkedAt: new Date().toISOString(),
          official,
          groups: groupHealth,
          queue: Object.values(groupHealth).reduce((n, g) => n + g.queue, 0),
          state: Object.values(groupHealth).some((g) => g.state !== "ok")
            ? "stale"
            : "ok",
          message:
            "Oficial atualizado; projeção aguarda a próxima publicação para respeitar o orçamento gratuito.",
        };
        await post("/ingest/heartbeat", { lease, ...heartbeat });
      } else {
        const fitted = projectHierarchy(base, ledger.values(), {
          universeElectorate: official.electorate, universeByUF: denominators,
        });
        const snapshot = makeSnapshot(
          base,
          ledger.values(),
          official,
          ++sequence,
          baseHash,
          base.length
            ? "Coleta por seção; intervalo nominal sem calibração independente."
            : "Oficial disponível. Projeção bloqueada: base histórica ainda não importada.",
          denominators,
          fitted,
        );
        snapshot.health.modelHash = modelHash;
        snapshot.health.electorateDifferences = ledger.electorateDifferences().length;
        snapshot.health.configHash = createHash("sha256")
          .update(
            JSON.stringify({
              identity: IDENTITY,
              contest: config.contest,
              baseHash,
              modelHash,
              nationalRps: 5,
              shardRps: 15,
              seed: 20261025,
              replicates: 400,
              publishInterval,
            }),
          )
          .digest("hex");
        if (
          base.length &&
          (!baseComplete || base.length !== official.totalSections)
        ) {
          snapshot.projection = makeSnapshot(
            [],
            [],
            null,
            sequence,
            null,
            "",
          ).projection;
          snapshot.health.message =
            "Base parcial: projeção nacional indisponível. Estimativas territoriais usam a hierarquia ajustada ao universo importado.";
        }
        if (base.length) {
          Object.assign(groupHealth, collectionHealth(groupHealth).groups);
          snapshot.health.groups = groupHealth;
          snapshot.health.queue = Object.values(groupHealth).reduce(
            (n, g) => n + g.queue,
            0,
          );
          if (Object.values(groupHealth).some((g) => g.state !== "ok")) {
            snapshot.health.state = "stale";
            snapshot.health.message =
              "Coleta por seção incompleta ou sem confirmação recente de todos os grupos. Resultado oficial permanece independente.";
          }
        }
        // Geographic official watermarks are independent; never synthesize section observations from EA20.
        for (const t of snapshot.territories) {
          const uf = t.code.toLowerCase(),
            u = `${TSE}/ele2026/6258/dados/${uf}/${uf}-c0001-e006258-u.json`;
          try {
            t.official = parseOfficial(
              await client.official(u),
              IDENTITY,
              u.replace(".json", ".jws"),
            );
          } catch {
            /* Missing UF stays unavailable. */
          }
        }
        const signature = createHash("sha256")
          .update(snapshotContent(snapshot, ledger.values()))
          .digest("hex");
        if (
          signature !== lastSignature &&
          (once ||
            !lastSignature ||
            Date.now() - lastPublishedAt >= publishInterval)
        ) {
          const municipalities = municipalTerritories(base, ledger.values(), fitted);
          await new AtomicStore(`data/municipalities-${sequence}.json`).write(
            municipalities,
          );
          if (endpoint) {
            snapshot.municipalityPages = await publishMunicipalPages(
              municipalities,
              STATES.map(([uf]) => uf),
              async (page) => {
                await renew();
                return post("/ingest/territories", {
                  lease,
                  sequence,
                  ...page,
                  contentAddressed: true,
                });
              },
            );
            await post("/ingest/snapshot", { lease, snapshot });
          }
          await new AtomicStore("data/latest.json").write(snapshot);
          await mkdir("data", { recursive: true });
          await appendFile(
            "data/history.ndjson",
            JSON.stringify(snapshot) + "\n",
          );
          lastSignature = signature;
          lastPublishedAt = Date.now();
        } else sequence--;
        const heartbeat = {
          checkedAt: new Date().toISOString(),
          message: snapshot.health.message,
          queue: snapshot.health.queue,
          groups: groupHealth,
          state: snapshot.health.state,
          official,
        };
        await new AtomicStore("data/heartbeat.json").write(heartbeat);
        if (endpoint) await post("/ingest/heartbeat", { lease, ...heartbeat });
        console.log(
          `${snapshot.createdAt} #${sequence} official=${official.progress} sections=${ledger.values().length}`,
        );
      }
    } else {
      if (Date.now() - scannedAt > 30000) {
        // EA14/EA15 watermarks detect territorial updates; EA16 is always refreshed as a correction safeguard.
        await client.official(
          `${TSE}/ele2026/6258/dados/br/br-e006258-ab.json`,
        );
        for (const ufCode of group!.ufs) {
          if(Date.now()>=stopAt) break;
          await renew();
          const uf = ufCode.toLowerCase();
          await client.official(
            `${TSE}/ele2026/6258/dados/${uf}/${uf}-e006258-ab.json`,
          );
          const inv = await client.official(
            `${TSE}/ele2026/arquivo-urna/${config.contest}/config/${uf}/${uf}-p${config.contest.padStart(6, "0")}-cs.json`,
          );
          for (const change of changedSections(inv, config.contest, known))
            if (sectionIds.has(change.id))
              pending.set(change.id, change.generation);
        }
        scannedAt = Date.now();
      }
      const changed: Observation[] = [],
        slice = [...pending]
          .filter(([id]) => Date.now() >= (retryAt.get(id) ?? 0))
          .slice(0, 128);
      for (const [id, generation] of slice) {
        if(Date.now()>=stopAt) break;
        await renew();
        try {
          const old = ledger.records.get(id),
            o = await collectSection(client, config.contest, id, IDENTITY, old);
          if (o) {
            errors.delete(id);
            o.inventoryGeneration = generation;
            if (
              !old ||
              o.hash !== old.hash ||
              o.status !== old.status ||
              o.version !== old.version
            ) {
              if (applyObservation(o)) changed.push(o);
            }
            if (sourceAdvanced(old, o) && !ledger.quarantined.has(id)) {
              known.set(id, generation);
              pending.delete(id);
            } else
              retryAt.set(
                id,
                Date.now() + (ledger.quarantined.has(id) ? 300000 : 10000),
              );
          } else retryAt.set(id, Date.now() + 10000);
        } catch (e) {
          errors.add(id);
          retryAt.set(
            id,
            Date.now() + (String(e).includes("404") ? 60000 : 10000),
          );
          console.error(`Falha na coleta ${id}: ${String(e)}`);
        }
      }
      cursor += slice.length;
      if (endpoint && changed.length) {
        try { await outbox!.stage({
            encoding: "gzip-base64",
            data: await gzipText(
              JSON.stringify({
                baseHash,
                records: changed,
                cursor,
                queue: pending.size,
              }),
            ),
        }); } catch (e) { throw Error(`ingestion outbox persistence: ${String(e)}`); }
        if (!(await deliverPending())) continue;
      }
      const sourceState =
        errors.size || ledger.quarantined.size ? "stale" : "ok";
      if (endpoint && Date.now() - lastBatch > 60000) {
        await post("/ingest/heartbeat", {
          lease,
          queue: pending.size,
          state: sourceState,
        });
        lastBatch = Date.now();
      }
      if (!endpoint && changed.length)
        await appendFile(
          `data/events-${shard}.ndjson`,
          JSON.stringify({
            baseHash,
            records: changed,
            cursor,
            queue: pending.size,
          }) + "\n",
        );
      await new AtomicStore(`data/health-${shard}.json`).write({
        checkedAt: new Date().toISOString(),
        queue: pending.size,
        state: sourceState,
      });
    }
    if (Date.now() - lastCheckpoint > 30000 || once || !running) {
      await store.write({
        baseHash,
        ledger: ledger.checkpoint(),
        sequence,
        cursor,
        remoteCursors,
        lastSignature,
        lastPublishedAt,
        groupHealth,
      });
      lastCheckpoint = Date.now();
    }
  } catch (e) {
    console.error(String(e));
    if (String(e).includes("ingestion") || String(e).includes("hash mismatch"))
      throw e;
  }
  if (!once && running)
    await new Promise((r) =>
      setTimeout(
        r,
        shard === "coordinator"
          ? Math.max(250, 15000 - (Date.now() - loopStarted))
          : 250,
      ),
    );
} while (!once && running && Date.now() < stopAt);
