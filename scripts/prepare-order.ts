import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync,gunzipSync } from "node:zlib";
import { ReliableClient } from "../src/collector/http.ts";
import { openCsvZip } from "../src/collector/zip.ts";
import { readFirstRoundReceipts } from "../src/collector/receipt-order.ts";
import { verifiedArchive } from "../src/collector/download.ts";
import { STATES } from "../src/core/demo.ts";
import type { SectionBase } from "../src/core/types.ts";

// First-round 2026 receipt order (DT_BU_RECEBIDO), aligned with the frozen base, for the municipal fallback.
const raw = await readFile("data/base.json", "utf8"), base = JSON.parse(raw).sections as SectionBase[],
  baseSha256 = createHash("sha256").update(raw).digest("hex");
const client = new ReliableClient();
const catalog = await client.json("https://dadosabertos.tse.jus.br/api/3/action/package_show?id=resultados-2026-boletim-de-urna");
const receipt = new Map<string, number>(), provenance: any[] = [];
await mkdir("data/historical", { recursive: true });
for (const [uf] of STATES) {
  const resource = catalog.result.resources.find((r: any) => new RegExp(`bweb_1t_${uf}_.*\\.zip$`, "i").test(r.url));
  if (!resource) throw Error(`BWEB indisponível ${uf}`);
  const url = new URL(resource.url);
  if (url.origin !== "https://cdn.tse.jus.br" || !url.pathname.startsWith("/estatistica/sead/")) throw Error("untrusted resource");
  const sha512 = (await client.text(url.href + ".sha512")).match(/\b[a-f0-9]{128}\b/i)?.[0]?.toLowerCase();
  if (!sha512) throw Error(`checksum missing ${uf}`);
  const file = `data/historical/bweb-${uf.toLowerCase()}.zip`;
  const cache=`data/historical/receipt-order-${uf.toLowerCase()}.json.gz`;
  let rows:Map<string,number>;
  try {
    const saved=JSON.parse(gunzipSync(await readFile(cache)).toString('utf8'));
    if(saved.schemaVersion!==1||saved.sha512!==sha512||saved.entriesSha256!==createHash('sha256').update(JSON.stringify(saved.entries)).digest('hex'))
      throw Error(`receipt cache integrity mismatch ${uf}`);
    rows=new Map(saved.entries);
  } catch(e) {
    if((e as NodeJS.ErrnoException).code!=='ENOENT') throw e;
    await verifiedArchive(url.href, file, sha512);
    const zip = await openCsvZip(file);
    try {
    async function* chunks() {
      const d = new TextDecoder("windows-1252");
      for await (const b of zip.stream) yield d.decode(b, { stream: true });
      yield d.decode();
    }
      rows = await readFirstRoundReceipts(chunks());
    } finally { zip.close(); }
    const entries=[...rows];
    await writeFile(cache,gzipSync(JSON.stringify({schemaVersion:1,sha512,entries,entriesSha256:createHash('sha256').update(JSON.stringify(entries)).digest('hex')})));
  }
  for(const [id,time] of rows) receipt.set(id,Math.min(receipt.get(id)??Infinity,time));
  provenance.push({ uf, url: url.href, sha512, rows: rows.size });
  console.log(`${uf}: ${rows.size} seções com recebimento`);
}
const receipts = base.map(s => {
  const times = s.members.map(m => receipt.get(m)).filter((t): t is number => t !== undefined);
  return times.length ? Math.min(...times) : -1;
});
await mkdir("config", { recursive: true });
const out = { kind: "first-round-2026-receipt-order", epoch: "1970-01-01T00:00:00Z", unit: "seconds",
  baseSha256, missing: receipts.filter(t => t < 0).length, provenance, receipts };
if(receipts.every(t=>t<0)) throw Error('receipt order is empty; refusing invalid asset');
await writeFile("config/ordem-1t-2026.json.gz", gzipSync(JSON.stringify(out)));
console.log(JSON.stringify({ units: receipts.length, missing: out.missing }));
