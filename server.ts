import { createServer } from "node:http";
import { createServer as createVite } from "vite";
import { readFile } from "node:fs/promises";
import { AtomicStore } from "./src/collector/store.ts";
import { ReliableClient } from "./src/collector/http.ts";
import { parseOfficial } from "./src/core/official.ts";
import { IDENTITY } from "./src/core/demo.ts";
import { makeSnapshot } from "./src/core/snapshot.ts";
import type { Snapshot } from "./src/core/types.ts";
import { historyPage } from "./src/core/history.ts";
const vite = await createVite({
    server: {
      middlewareMode: true,
      hmr: { port: Number(process.env.HMR_PORT ?? 24689) },
      fs: { strict: true },
    },
    appType: "spa",
  }),
  client = new ReliableClient({ rps: 5 });
let latest: Snapshot | null = null,
  updated = 0,
  sequence = 0;
let refresh: Promise<void> | null = null;
let fallbackHealth: any = null;
async function update() {
  try {
    const disk = await new AtomicStore("data/latest.json").read<Snapshot>();
    latest = disk;
    sequence = Math.max(sequence, disk.sequence);
    let checked = disk.createdAt;
    try {
      checked = (await new AtomicStore("data/heartbeat.json").read<any>())
        .checkedAt;
    } catch {}
    if (Date.parse(checked) > Date.now() - 120000) {
      latest = disk;
      fallbackHealth = null;
      return;
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT")
      console.error("Checkpoint indisponível:", String(e));
  }
  const url =
    "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json";
  const official = parseOfficial(
    await client.official(url),
    IDENTITY,
    url.replace(".json", ".jws"),
  );
  if (latest) {
    fallbackHealth = {
      checkedAt: new Date().toISOString(),
      official,
      state: "stale",
      collectionState: "stale",
      sourceTime: official.sourceTime,
      message:
        "Coleta de BUs sem confirmação recente. Exibindo a última projeção preservada e o resultado oficial atualizado.",
    };
    return;
  }
  latest = makeSnapshot(
    [],
    [],
    official,
    ++sequence,
    null,
    "Oficial disponível. Projeção bloqueada: importar base histórica e iniciar coleta por seção.",
  );
}
createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? "/", "http://localhost"),
    path = requestUrl.pathname;
  if (path.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    try {
      if (Date.now() - updated > 15000) {
        refresh ??= update()
          .then(() => {
            updated = Date.now();
          })
          .finally(() => {
            refresh = null;
          });
        await refresh;
      }
      if (!latest) throw Error("no snapshot");
      if (path === "/api/latest") res.end(JSON.stringify(latest));
      else if (path === "/api/history") {
        let past: Snapshot[] = [];
        try {
          past = (await readFile("data/history.ndjson", "utf8"))
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((x) => JSON.parse(x));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
        res.end(JSON.stringify(historyPage(past,Number(requestUrl.searchParams.get("before") ?? Number.MAX_SAFE_INTEGER))));
      } else if (path === "/api/territories")
        res.end(JSON.stringify(latest.territories));
      else if (path === "/api/municipalities") {
        const uf = requestUrl.searchParams.get("uf"),
          seq = requestUrl.searchParams.get("sequence");
        if (!/^[A-Z]{2}$/.test(uf ?? "") || !/^\d+$/.test(seq ?? "")) {
          res.statusCode = 400;
          res.end("{}");
          return;
        }
        try {
          const rows = JSON.parse(
            await readFile(`data/municipalities-${seq}.json`, "utf8"),
          );
          res.end(JSON.stringify(rows.filter((t: any) => t.parent === uf)));
        } catch {
          res.statusCode = 404;
          res.end(
            JSON.stringify({
              error: "municipalities unavailable for this snapshot",
            }),
          );
        }
      } else if (path === "/api/health") {
        let beat: any = { checkedAt: latest.createdAt };
        try {
          beat = await new AtomicStore("data/heartbeat.json").read();
        } catch {}
        res.end(
          JSON.stringify({ ...latest.health, ...beat, ...fallbackHealth }),
        );
      } else {
        res.statusCode = 404;
        res.end("{}");
      }
    } catch {
      res.statusCode = 503;
      res.end(
        JSON.stringify({
          error: "Fonte indisponível; última versão preservada",
          last: latest?.id ?? null,
        }),
      );
    }
    return;
  }
  vite.middlewares(req, res);
}).listen(Number(process.env.PORT ?? 4268), "127.0.0.1", () =>
  console.log(
    `Vértice disponível em http://127.0.0.1:${process.env.PORT ?? 4268}`,
  ),
);
