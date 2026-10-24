import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { ReliableClient } from "../src/collector/http.ts";
import { TSE, inventory } from "../src/collector/tse.ts";
import { AtomicStore } from "../src/collector/store.ts";
import { validateBase } from "../src/core/ledger.ts";
import { refreshResourceHashes, verifyResourceHashes } from "../src/collector/provenance.ts";
import type { SectionBase } from "../src/core/types.ts";
const path = process.argv[2] ?? "data/base.json",
  loaded = JSON.parse(await readFile(path, "utf8")),
  base = loaded.sections as SectionBase[],
  client = new ReliableClient();
const metadata = await client.official(
    `${TSE}/ele2026/6258/config/mun-e006258-cm.json`,
  ),
  national = await client.official(
    `${TSE}/ele2026/6258/dados/br/br-e006258-ab.json`,
  ),
  report: any[] = [];
for (const uf of new Set(base.map((s) => s.uf))) {
  const raw = await client.official(
      `${TSE}/ele2026/arquivo-urna/3221/config/${uf.toLowerCase()}/${uf.toLowerCase()}-p003221-cs.json`,
    ),
    units = inventory(raw, "3221"),
    sections = base.filter((s) => s.uf === uf),
    m = metadata.abr.find((r: any) => r.cd === uf.toLowerCase());
  const byId = new Map(sections.map((s) => [s.id, s]));
  if (
    units.length !== sections.length ||
    units.some((u) => {
      const s = byId.get(u.id);
      return (
        !s ||
        JSON.stringify([...s.members].sort()) !==
          JSON.stringify([...u.members].sort())
      );
    })
  )
    throw Error(`inventory drift ${uf}`);
  for (const s of sections) {
    const city = m?.mu.find(
      (x: any) => String(x.cd).padStart(5, "0") === s.municipality,
    );
    if (!city) throw Error(`missing EA12 ${s.id}`);
    s.capital = city.c === "s" && uf !== "ZZ";
    s.ibge = city.cdi;
  }
  const off = national.abr.find((x: any) => x.cdabr === uf.toLowerCase()),
    electorate = sections.reduce((n, s) => n + (s.electorate ?? 0), 0);
  report.push({
    uf,
    units: units.length,
    electorateFirstTurn: electorate,
    electorateOfficial: Number(off.e.te),
    difference: electorate - Number(off.e.te),
  });
}
validateBase(base);
loaded.manifest.reconciliation = {
  checkedAt: new Date().toISOString(),
  source: "EA12/EA14/EA16 JWS oficiais",
  units: base.length,
  rows: report,
  sourceHash: createHash("sha256")
    .update(JSON.stringify(metadata))
    .digest("hex"),
};
refreshResourceHashes(loaded);
verifyResourceHashes(loaded);
await new AtomicStore(path).write(loaded);
await new AtomicStore("data/base-reconciliation.json").write(
  loaded.manifest.reconciliation,
);
console.log(JSON.stringify(loaded.manifest.reconciliation, null, 2));
