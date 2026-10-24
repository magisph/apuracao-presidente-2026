import { createWriteStream, createReadStream } from "node:fs";
import { stat, mkdir, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { openCsvZip } from "../src/collector/zip.ts";
import { parseBweb } from "../src/collector/base.ts";
import { ReliableClient } from "../src/collector/http.ts";
import { TSE, inventory, discoverElection } from "../src/collector/tse.ts";
import { STATES } from "../src/core/demo.ts";
import { groupHistorical, validateBase } from "../src/core/ledger.ts";
import { AtomicStore } from "../src/collector/store.ts";
import type { SectionBase } from "../src/core/types.ts";
import { verifiedArchive } from "../src/collector/download.ts";
import { historicalReference } from "../src/core/evaluation.ts";
const requested = (process.argv[2] ?? "AC").toUpperCase(),
  ufs = requested === "ALL" ? STATES.map((s) => s[0]) : requested.split(",");
if (ufs.some((uf) => !STATES.some((s) => s[0] === uf)))
  throw Error("UF inválida");
const client = new ReliableClient(),
  config = discoverElection(
    await client.official(`${TSE}/comum/config/ele-c.json`),
    "6258",
  );
const catalog = await client.json(
  "https://dadosabertos.tse.jus.br/api/3/action/package_show?id=resultados-2026-boletim-de-urna",
);
const municipalityConfig = await client.official(
  `${TSE}/ele2026/6258/config/mun-e006258-cm.json`,
);
const capitals: Record<string, string> = Object.fromEntries(
  municipalityConfig.abr.map((u: any) => [
    u.cd.toUpperCase(),
    u.mu.find((m: any) => m.c === "s")?.cd ?? "",
  ]),
);
const all: SectionBase[] = [],
  manifests: any[] = [];
await mkdir("data/historical", { recursive: true });
for (const uf of ufs) {
  const resource = catalog.result.resources.find((r: any) =>
    new RegExp(`bweb_1t_${uf}_.*\\.zip$`, "i").test(r.url),
  );
  if (!resource) throw Error(`BWEB indisponível ${uf}`);
  const url = new URL(resource.url);
  if (
    url.origin !== "https://cdn.tse.jus.br" ||
    !url.pathname.startsWith("/estatistica/sead/")
  )
    throw Error("untrusted resource");
  const expected = (await client.text(url.href + ".sha512"))
    .match(/\b[a-f0-9]{128}\b/i)?.[0]
    ?.toLowerCase();
  if (!expected) throw Error(`checksum missing ${uf}`);
  const rawInventory = JSON.stringify(
    await client.official(
      `${TSE}/ele2026/arquivo-urna/${config.contest}/config/${uf.toLowerCase()}/${uf.toLowerCase()}-p${config.contest.padStart(6, "0")}-cs.json`,
    ),
  );
  const currentUnits = inventory(JSON.parse(rawInventory), config.contest);
  try {
    const cached = await new AtomicStore(
        `data/historical/base-${uf.toLowerCase()}.json`,
      ).read<{ sections: SectionBase[]; manifest: any }>(),
      byId = new Map(cached.sections.map((s) => [s.id, s]));
    const digest = createHash("sha256")
      .update(JSON.stringify(cached.sections))
      .digest("hex");
    if (
      cached.manifest.url === url.href &&
      cached.manifest.sha512 === expected &&
      cached.manifest.sectionsSha256 === digest &&
      cached.sections.length === currentUnits.length &&
      currentUnits.every((u) => {
        const s = byId.get(u.id);
        return !!s && JSON.stringify(s.members) === JSON.stringify(u.members);
      })
    ) {
      validateBase(cached.sections);
      cached.manifest.sectionsSha256 = digest;
      all.push(...cached.sections);
      manifests.push(cached.manifest);
      console.log(
        `${uf}: ${cached.sections.length} urnas restauradas de derivado verificado`,
      );
      continue;
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const file = `data/historical/bweb-${uf.toLowerCase()}.zip`;
  const downloaded = await verifiedArchive(url.href, file, expected),
    actual = expected;
  const opened = await openCsvZip(file);
  let historical: SectionBase[];
  try {
    async function* chunks() {
      const d = new TextDecoder("windows-1252");
      for await (const b of opened.stream) yield d.decode(b, { stream: true });
      yield d.decode();
    }
    historical = await parseBweb(chunks());
  } finally {
    opened.close();
  }
  const units = inventory(JSON.parse(rawInventory), config.contest),
    byMember = new Map<string, SectionBase>();
  for (const h of historical) for (const m of h.members) byMember.set(m, h);
  const current: SectionBase[] = units.map((u) => {
    const m = u.id.split("/")[1],
      hist = [...new Set(u.members.map((id) => byMember.get(id)))];
    if (
      hist.some((h) => !h) ||
      hist.some((h) => h!.members.some((id) => !u.members.includes(id)))
    )
      return {
        id: u.id,
        uf,
        name: u.name,
        region: STATES.find((s) => s[0] === uf)![2],
        municipality: m,
        capital: false,
        electorate: null,
        firstA: 0,
        firstB: 0,
        firstOther: 0,
        firstValid: 0,
        members: u.members,
        matched: false,
      };
    return {
      id: u.id,
      uf,
      name: u.name,
      region: STATES.find((s) => s[0] === uf)![2],
      municipality: m,
      capital: m === capitals[uf] && uf !== "ZZ",
      electorate: hist.reduce((n, h) => n + (h!.electorate ?? 0), 0),
      firstA: 0,
      firstB: 0,
      firstOther: 0,
      firstValid: 0,
      members: u.members,
      matched: false,
    };
  });
  const grouped = historicalReference(current, historical);
  validateBase(grouped);
  all.push(...grouped);
  const manifest = {
    uf,
    url: url.href,
    sha512: actual,
    checksumVerified: true,
    sectionsSha256: createHash("sha256")
      .update(JSON.stringify(grouped))
      .digest("hex"),
    inventorySha256: createHash("sha256").update(rawInventory).digest("hex"),
    units: grouped.length,
    matched: grouped.filter((s) => s.matched).length,
    electorateSource:
      "1T por correspondência exata; deve ser confrontado com cada BU 2T",
  };
  manifests.push(manifest);
  await new AtomicStore(`data/historical/base-${uf.toLowerCase()}.json`).write({
    sections: grouped,
    manifest,
  });
  console.log(
    `${uf}: ${manifest.units} urnas; ${manifest.matched} correspondências`,
  );
  if (downloaded && !process.argv.includes("--keep-archives"))
    await unlink(file);
}
await new AtomicStore(
  requested === "ALL" ? "data/base.json" : "data/base-partial.json",
).write({
  schemaVersion: 1,
  sections: all,
  manifest: {
    createdAt: new Date().toISOString(),
    complete: ufs.length === 28,
    contest: config.contest,
    resources: manifests,
    provisional: true,
    warning:
      "Eleitorado 1T como referência; diferenças no eleitorado do BU 2T são registradas, respeitando o eleitorado do próprio BU. Base não comprova precisão estatística.",
  },
});
