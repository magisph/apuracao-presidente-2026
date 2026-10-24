import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { ReliableClient } from "../src/collector/http.ts";
import { openCsvZip } from "../src/collector/zip.ts";
import { parseBweb } from "../src/collector/base.ts";
import { verifiedArchive } from "../src/collector/download.ts";
import { STATES } from "../src/core/demo.ts";
import type { SectionBase } from "../src/core/types.ts";

// First-round 2026 receipt order (DT_BU_RECEBIDO), aligned with the frozen base, for the municipal fallback.
const raw = await readFile("data/base.json", "utf8"), base = JSON.parse(raw).sections as SectionBase[],
  baseSha256 = createHash("sha256").update(raw).digest("hex");
const client = new ReliableClient();
const catalog = await client.json("https://dadosabertos.tse.jus.br/api/3/action/package_show?id=resultados-2026-boletim-de-urna");
const receipt = new Map<string, number>(), provenance: any[] = [];
const epoch = Date.parse("2026-10-04T17:00:00-03:00");
const parseTime = (v: string) => {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/);
  return m ? Math.round((Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4]}-03:00`) - epoch) / 1000) : null;
};
await mkdir("data/historical", { recursive: true });
for (const [uf] of STATES) {
  const resource = catalog.result.resources.find((r: any) => new RegExp(`bweb_1t_${uf}_.*\\.zip$`, "i").test(r.url));
  if (!resource) throw Error(`BWEB indisponível ${uf}`);
  const url = new URL(resource.url);
  if (url.origin !== "https://cdn.tse.jus.br" || !url.pathname.startsWith("/estatistica/sead/")) throw Error("untrusted resource");
  const sha512 = (await client.text(url.href + ".sha512")).match(/\b[a-f0-9]{128}\b/i)?.[0]?.toLowerCase();
  if (!sha512) throw Error(`checksum missing ${uf}`);
  const file = `data/historical/bweb-${uf.toLowerCase()}.zip`;
  await verifiedArchive(url.href, file, sha512);
  const zip = await openCsvZip(file);
  let rows;
  try {
    async function* chunks() {
      const d = new TextDecoder("windows-1252");
      for await (const b of zip.stream) yield d.decode(b, { stream: true });
      yield d.decode();
    }
    rows = await parseBweb(chunks());
  } finally { zip.close(); }
  for (const r of rows) {
    const t = parseTime(r.receipt);
    if (t !== null) for (const m of r.members) receipt.set(m, Math.min(receipt.get(m) ?? Infinity, t));
  }
  provenance.push({ uf, url: url.href, sha512, rows: rows.length });
  console.log(`${uf}: ${rows.length} seções com recebimento`);
}
const receipts = base.map(s => {
  const times = s.members.map(m => receipt.get(m)).filter((t): t is number => t !== undefined);
  return times.length ? Math.min(...times) : -1;
});
await mkdir("config", { recursive: true });
const out = { kind: "first-round-2026-receipt-order", epoch: "2026-10-04T17:00:00-03:00", unit: "seconds",
  baseSha256, missing: receipts.filter(t => t < 0).length, provenance, receipts };
await writeFile("config/ordem-1t-2026.json.gz", gzipSync(JSON.stringify(out)));
console.log(JSON.stringify({ units: receipts.length, missing: out.missing }));
