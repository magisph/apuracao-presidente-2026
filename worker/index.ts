import {
  validateSnapshot,
  validateProjection,
} from "../src/core/validation.ts";
import { gzipText, gunzipText } from "../src/core/codec.ts";
interface Statement {
  bind(...p: unknown[]): Statement;
  first(): Promise<any>;
  all(): Promise<{ results: any[] }>;
  run(): Promise<unknown>;
}
export interface Env {
  DB: {
    prepare(sql: string): Statement;
    batch(statements: Statement[]): Promise<unknown>;
  };
  INGEST_TOKEN: string;
  ORIGIN: string;
}
type Lease = { shard: string; owner: string; epoch: number; expires: number };
const safe = (s: unknown) =>
  typeof s === "string" && /^[a-zA-Z0-9_.-]{1,100}$/.test(s);
const hash = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function authorized(request: Request, token: string) {
  if (!token || token.length < 32) return false;
  const a = await hash(request.headers.get("Authorization") ?? ""),
    b = await hash(`Bearer ${token}`);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function active(env: Env, lease: Lease) {
  return (
    !!lease &&
    !!(await env.DB.prepare(
      "SELECT 1 FROM leases WHERE shard=? AND owner=? AND epoch=? AND expires>?",
    )
      .bind(lease.shard, lease.owner, lease.epoch, Date.now())
      .first())
  );
}
function validSnapshot(s: any) {
  try {
    validateSnapshot(s);
  } catch {
    return false;
  }
  return (
    s?.schemaVersion === 1 &&
    safe(s.id) &&
    Number.isSafeInteger(s.sequence) &&
    s.sequence > 0 &&
    s.mode === "live" &&
    s.identity?.election === "6258" &&
    s.identity.round === 2 &&
    s.identity.office === "0001" &&
    JSON.stringify(s.identity.candidates) === '["13","22"]' &&
    s.projection?.winner === null &&
    s.health?.calibrated === false &&
    Array.isArray(s.territories) &&
    Number.isFinite(Date.parse(s.createdAt))
  );
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url),
      path = url.pathname;
    try {
      if (request.method === "GET" && path.startsWith("/api/")) {
        let out: unknown;
        if (path === "/api/latest") {
          const row = await env.DB.prepare(
            "SELECT s.payload FROM snapshots s JOIN latest l ON s.sequence=l.sequence WHERE l.singleton=1",
          ).first();
          if (!row)
            return json({ error: "waiting for first publication" }, 503);
          out = JSON.parse(row.payload);
        } else if (path === "/api/history") {
          const before = Number(
            url.searchParams.get("before") ?? Number.MAX_SAFE_INTEGER,
          );
          const rows = await env.DB.prepare(
            "SELECT payload FROM snapshots WHERE sequence<? ORDER BY sequence DESC LIMIT 120",
          )
            .bind(before)
            .all();
          out = rows.results.map((r) => JSON.parse(r.payload)).reverse();
        } else if (path === "/api/health") {
          const row = await env.DB.prepare(
            "SELECT s.payload FROM snapshots s JOIN latest l ON s.sequence=l.sequence WHERE l.singleton=1",
          ).first();
          const s = row ? JSON.parse(row.payload) : null;
          const beat = await env.DB.prepare(
            "SELECT payload,checked_at FROM heartbeat WHERE shard=?",
          )
            .bind("coordinator")
            .first();
          out = {
            ...s?.health,
            ...(beat ? JSON.parse(beat.payload) : {}),
            state: !s
              ? "waiting"
              : Date.now() - (beat?.checked_at ?? Date.parse(s.createdAt)) >
                  120000
                ? "stale"
                : beat
                  ? (JSON.parse(beat.payload).collectionState ?? s.health.state)
                  : s.health.state,
            checkedAt: beat
              ? new Date(beat.checked_at).toISOString()
              : (s?.createdAt ?? null),
          };
        } else if (path === "/api/territories") {
          const row = await env.DB.prepare(
            "SELECT s.payload FROM snapshots s JOIN latest l ON s.sequence=l.sequence WHERE l.singleton=1",
          ).first();
          out = row ? JSON.parse(row.payload).territories : [];
        } else if (path === "/api/municipalities") {
          const uf = url.searchParams.get("uf"),
            sequence = Number(url.searchParams.get("sequence"));
          if (!/^[A-Z]{2}$/.test(uf ?? "") || !Number.isSafeInteger(sequence))
            return json({ error: "invalid territorial query" }, 400);
          const existing = await env.DB.prepare(
            "SELECT payload FROM snapshots WHERE sequence=?",
          )
            .bind(sequence)
            .first();
          if (!existing) return json({ error: "snapshot unavailable" }, 404);
          const manifest = JSON.parse(existing.payload).municipalityPages?.find(
            (g: any) => g.uf === uf,
          );
          const rows = manifest?.hashes
            ? await env.DB.prepare(
                "SELECT b.payload FROM json_each(?) j JOIN territorial_blobs b ON b.hash=j.value ORDER BY CAST(j.key AS INTEGER)",
              )
                .bind(JSON.stringify(manifest.hashes))
                .all()
            : await env.DB.prepare(
                "SELECT b.payload FROM territorial_pages p JOIN territorial_blobs b ON b.hash=p.hash WHERE p.sequence=? AND p.uf=? ORDER BY p.page",
              )
                .bind(sequence, uf)
                .all();
          out =
            url.searchParams.get("compressed") === "1"
              ? {
                  encoding: "gzip-base64-pages",
                  pages: rows.results.map((r) => r.payload),
                }
              : (
                  await Promise.all(
                    rows.results.map(async (r) =>
                      JSON.parse(await gunzipText(r.payload)),
                    ),
                  )
                ).flat();
        } else return json({ error: "not found" }, 404);
        const response = json(out);
        if (env.ORIGIN)
          response.headers.set("Access-Control-Allow-Origin", env.ORIGIN);
        return response;
      }
      if (!path.startsWith("/ingest/"))
        return json({ error: "not found" }, 404);
      if (!(await authorized(request, env.INGEST_TOKEN)))
        return json({ error: "unauthorized" }, 401);
      if (request.method === "GET" && path === "/ingest/sequence") {
        const row = await env.DB.prepare(
          "SELECT MAX(n) AS sequence FROM (SELECT MAX(sequence) AS n FROM snapshots UNION ALL SELECT MAX(sequence) AS n FROM territorial_pages UNION ALL SELECT MAX(sequence) AS n FROM staged_publications)",
        ).first();
        return json({ sequence: row?.sequence ?? 0 });
      }
      if (request.method === "GET" && path === "/ingest/health") {
        const rows = await env.DB.prepare(
          "SELECT shard,payload,checked_at FROM heartbeat",
        ).all();
        return json(
          rows.results.map((r) => ({
            shard: r.shard,
            ...JSON.parse(r.payload),
            checkedAt: new Date(r.checked_at).toISOString(),
          })),
        );
      }
      if (request.method === "GET" && path === "/ingest/batches") {
        const shard = url.searchParams.get("shard"),
          after = Number(url.searchParams.get("after") ?? 0);
        if (!safe(shard)) return json({ error: "invalid shard" }, 400);
        const rows =
          shard === "all"
            ? await env.DB.prepare(
                "SELECT serial AS cursor,shard,id,payload,created_at FROM batches WHERE serial>? ORDER BY serial LIMIT 100",
              )
                .bind(after)
                .all()
            : await env.DB.prepare(
                "SELECT rowid AS cursor,shard,id,payload,created_at FROM batches WHERE shard=? AND rowid>? ORDER BY rowid LIMIT 100",
              )
                .bind(shard, after)
                .all();
        return json(
          rows.results.map((r) => ({
            id: r.id,
            payload: JSON.parse(r.payload),
            createdAt: r.created_at,
            cursor: r.cursor,
            shard: r.shard,
          })),
        );
      }
      if (request.method !== "POST")
        return json({ error: "method not allowed" }, 405);
      if (Number(request.headers.get("Content-Length") ?? 0) > 90000)
        return json({ error: "payload too large" }, 413);
      const text = await request.text();
      if (new TextEncoder().encode(text).length > 90000)
        return json({ error: "payload too large" }, 413);
      const body = JSON.parse(text);
      if (path === "/ingest/lease") {
        if (!safe(body.shard) || !safe(body.owner))
          return json({ error: "invalid lease identity" }, 400);
        const now = Date.now();
        const row = await env.DB.prepare(
          "INSERT INTO leases(shard,owner,epoch,expires) VALUES(?,?,1,?) ON CONFLICT(shard) DO UPDATE SET owner=excluded.owner,epoch=CASE WHEN leases.owner=excluded.owner THEN leases.epoch ELSE leases.epoch+1 END,expires=excluded.expires WHERE leases.expires<? OR leases.owner=excluded.owner RETURNING *",
        )
          .bind(body.shard, body.owner, now + 120000, now)
          .first();
        return row ? json(row) : json({ error: "lease already held" }, 409);
      }
      const lease: Lease = body.lease;
      if (!(await active(env, lease)))
        return json({ error: "lease expired or fenced" }, 409);
      if (path === "/ingest/heartbeat") {
        await env.DB.prepare(
          "INSERT INTO heartbeat(shard,payload,checked_at) SELECT ?,?,? FROM leases WHERE shard=? AND owner=? AND epoch=? AND expires>? ON CONFLICT(shard) DO UPDATE SET payload=excluded.payload,checked_at=excluded.checked_at",
        )
          .bind(
            lease.shard,
            JSON.stringify({
              message: String(body.message ?? "").slice(0, 500),
              queue: Number(body.queue) || 0,
              groups: body.groups ?? {},
              collectionState: body.state ?? "waiting",
              official: body.official ?? undefined,
            }),
            Date.now(),
            lease.shard,
            lease.owner,
            lease.epoch,
            Date.now(),
          )
          .run();
        return json({ ok: true });
      }
      if (path === "/ingest/territories") {
        if (
          lease.shard !== "coordinator" ||
          !Number.isSafeInteger(body.sequence) ||
          body.sequence < 1 ||
          !Number.isSafeInteger(body.page) ||
          body.page < 0 ||
          !/^[A-Z]{2}$/.test(body.uf) ||
          !Array.isArray(body.territories) ||
          body.territories.length > 100
        )
          return json({ error: "invalid territorial page" }, 400);
        for (const t of body.territories) {
          validateProjection(t.projection);
          if (
            t.parent !== body.uf ||
            !new RegExp(`^${body.uf}/\\d{5}$`).test(t.code) ||
            typeof t.name !== "string"
          )
            return json({ error: "invalid municipality" }, 400);
        }
        const payload = JSON.stringify(body.territories),
          digest = await hash(payload),
          old = await env.DB.prepare(
            "SELECT hash FROM territorial_pages WHERE sequence=? AND uf=? AND page=?",
          )
            .bind(body.sequence, body.uf, body.page)
            .first();
        if (old)
          return old.hash === digest
            ? json({ ok: true })
            : json({ error: "immutable territorial conflict" }, 409);
        const blob = await env.DB.prepare(
          "SELECT hash FROM territorial_blobs WHERE hash=?",
        )
          .bind(digest)
          .first();
        if (body.contentAddressed) {
          await env.DB.batch([
            env.DB.prepare(
              "INSERT OR IGNORE INTO staged_publications(sequence) SELECT ? FROM leases WHERE shard=? AND owner=? AND epoch=? AND expires>?",
            ).bind(
              body.sequence,
              lease.shard,
              lease.owner,
              lease.epoch,
              Date.now(),
            ),
            ...(!blob
              ? [
                  env.DB.prepare(
                    "INSERT OR IGNORE INTO territorial_blobs(hash,payload,uf) SELECT ?,?,? FROM leases WHERE shard=? AND owner=? AND epoch=? AND expires>?",
                  ).bind(
                    digest,
                    await gzipText(payload),
                    body.uf,
                    lease.shard,
                    lease.owner,
                    lease.epoch,
                    Date.now(),
                  ),
                ]
              : []),
          ]);
          return (await active(env, lease))
            ? json({ hash: digest }, blob ? 200 : 201)
            : json({ error: "lease fenced" }, 409);
        }
        await env.DB.batch([
          ...(!blob
            ? [
                env.DB.prepare(
                  "INSERT OR IGNORE INTO territorial_blobs(hash,payload) SELECT ?,? FROM leases WHERE shard=? AND owner=? AND epoch=? AND expires>?",
                ).bind(
                  digest,
                  await gzipText(payload),
                  lease.shard,
                  lease.owner,
                  lease.epoch,
                  Date.now(),
                ),
              ]
            : []),
          env.DB.prepare(
            "INSERT INTO territorial_pages(sequence,uf,page,hash) SELECT ?,?,?,? FROM leases WHERE shard=? AND owner=? AND epoch=? AND expires>?",
          ).bind(
            body.sequence,
            body.uf,
            body.page,
            digest,
            lease.shard,
            lease.owner,
            lease.epoch,
            Date.now(),
          ),
        ]);
        return (await env.DB.prepare(
          "SELECT hash FROM territorial_pages WHERE sequence=? AND uf=? AND page=?",
        )
          .bind(body.sequence, body.uf, body.page)
          .first())
          ? json({ ok: true }, 201)
          : json({ error: "lease fenced" }, 409);
      }
      if (path === "/ingest/snapshot") {
        const s = body.snapshot;
        if (lease.shard !== "coordinator" || !validSnapshot(s))
          return json({ error: "invalid snapshot" }, 400);
        if (s.municipalityPages)
          for (const group of s.municipalityPages) {
            if (
              !/^[A-Z]{2}$/.test(group.uf) ||
              !Number.isSafeInteger(group.pages) ||
              group.pages < 1
            )
              return json({ error: "invalid pages manifest" }, 400);
            if (group.hashes) {
              if (
                group.hashes.length !== group.pages ||
                group.hashes.some(
                  (h: any) =>
                    typeof h !== "string" || !/^[a-f0-9]{64}$/.test(h),
                )
              )
                return json({ error: "invalid content addresses" }, 400);
              const blobs = await env.DB.prepare(
                "SELECT hash,uf FROM territorial_blobs WHERE hash IN (SELECT value FROM json_each(?))",
              )
                .bind(JSON.stringify(group.hashes))
                .all();
              if (
                blobs.results.length !== group.hashes.length ||
                blobs.results.some((b) => b.uf !== group.uf)
              )
                return json({ error: "missing territorial content" }, 409);
              continue;
            }
            const pages = await env.DB.prepare(
              "SELECT COUNT(*) AS n,MIN(page) AS lo,MAX(page) AS hi FROM territorial_pages WHERE sequence=? AND uf=?",
            )
              .bind(s.sequence, group.uf)
              .first();
            if (
              pages.n !== group.pages ||
              pages.lo !== 0 ||
              pages.hi !== group.pages - 1
            )
              return json({ error: "incomplete territorial publication" }, 409);
          }
        const payload = JSON.stringify(s),
          digest = await hash(payload);
        const old = await env.DB.prepare(
          "SELECT hash FROM snapshots WHERE id=? OR sequence=?",
        )
          .bind(s.id, s.sequence)
          .first();
        if (old)
          return old.hash === digest
            ? json({ id: s.id })
            : json({ error: "immutable snapshot conflict" }, 409);
        const latest = await env.DB.prepare(
          "SELECT sequence FROM latest WHERE singleton=1",
        ).first();
        if (latest && s.sequence <= latest.sequence)
          return json({ error: "older snapshot" }, 409);
        await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO snapshots(sequence,id,hash,payload,created_at) SELECT ?,?,?,?,? FROM leases WHERE shard=? AND owner=? AND epoch=? AND expires>?",
          ).bind(
            s.sequence,
            s.id,
            digest,
            payload,
            s.createdAt,
            lease.shard,
            lease.owner,
            lease.epoch,
            Date.now(),
          ),
          env.DB.prepare(
            "INSERT INTO latest(singleton,sequence) SELECT 1,sequence FROM snapshots WHERE id=? ON CONFLICT(singleton) DO UPDATE SET sequence=excluded.sequence WHERE excluded.sequence>latest.sequence",
          ).bind(s.id),
        ]);
        const inserted = await env.DB.prepare(
          "SELECT id FROM snapshots WHERE id=?",
        )
          .bind(s.id)
          .first();
        return inserted
          ? json({ id: s.id }, 201)
          : json({ error: "lease fenced" }, 409);
      }
      if (path === "/ingest/batch") {
        if (!safe(body.id)) return json({ error: "invalid batch" }, 400);
        const payload = JSON.stringify(body.payload),
          digest = await hash(payload);
        const old = await env.DB.prepare(
          "SELECT hash FROM batches WHERE shard=? AND id=?",
        )
          .bind(lease.shard, body.id)
          .first();
        if (old)
          return old.hash === digest
            ? json({ id: body.id })
            : json({ error: "immutable batch conflict" }, 409);
        await env.DB.prepare(
          "INSERT INTO batches(shard,id,hash,payload,created_at) SELECT ?,?,?,?,? FROM leases WHERE shard=? AND owner=? AND epoch=? AND expires>?",
        )
          .bind(
            lease.shard,
            body.id,
            digest,
            payload,
            Date.now(),
            lease.shard,
            lease.owner,
            lease.epoch,
            Date.now(),
          )
          .run();
        return (await env.DB.prepare(
          "SELECT id FROM batches WHERE shard=? AND id=?",
        )
          .bind(lease.shard, body.id)
          .first())
          ? json({ id: body.id }, 201)
          : json({ error: "lease fenced" }, 409);
      }
      return json({ error: "not found" }, 404);
    } catch (error) {
      return json(
        {
          error:
            error instanceof SyntaxError ? "invalid JSON" : "request rejected",
        },
        400,
      );
    }
  },
};
