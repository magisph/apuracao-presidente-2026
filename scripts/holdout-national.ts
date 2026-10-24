import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { openCsvZip } from "../src/collector/zip.ts";
import { parseBweb } from "../src/collector/base.ts";
import { verifiedArchive } from "../src/collector/download.ts";
import { historicalReference, evaluateOperational, evaluateMunicipal } from "../src/core/evaluation.ts";
import { STATES } from "../src/core/demo.ts";
import type { BwebSection } from "../src/collector/base.ts";
import type { Observation, SectionBase } from "../src/core/types.ts";

// Frozen model: this runner evaluates; it never tunes parameters or enables a winner.
const directory = "data/holdout-national-2022";
await mkdir(directory, { recursive: true });
const catalogUrl = "https://dadosabertos.tse.jus.br/api/3/action/package_show?id=resultados-2022-boletim-de-urna";
const response = await fetch(catalogUrl, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw Error(`catalog ${response.status}`);
const catalog = await response.json() as any;
await writeFile(`${directory}/catalog.json`, JSON.stringify(catalog));
const resources = catalog.result.resources as { name: string; url: string }[];
const provenance: any[] = [], base: SectionBase[] = [], current: BwebSection[] = [];
// HOLDOUT_MODE=municipal replays only municipal partials; counted sections are guessed by first-round receipt order.
const municipalMode = process.env.HOLDOUT_MODE === "municipal", firstReceipt = new Map<string, number>();
const receipt = (value: string) => {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/);
  if (!m) throw Error(`unknown receipt ${value}`);
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}-03:00`;
};
// Capital codes come from the already-read operational geography, not outcomes.
const capitalsByUF = new Map<string, Set<string>>();
for (const s of JSON.parse(await readFile("data/base.json", "utf8")).sections as SectionBase[])
  if (s.capital) {
    if (!capitalsByUF.has(s.uf)) capitalsByUF.set(s.uf, new Set());
    capitalsByUF.get(s.uf)!.add(s.municipality);
  }
for (const [uf, , region] of STATES) {
  const rounds: BwebSection[][] = [];
  for (const round of [1, 2]) {
    const resource = resources.find(r => r.name.startsWith(`${uf} - Boletim de Urna - ${round === 1 ? "Primeiro" : "Segundo"} turno`));
    if (!resource || !resource.url.startsWith("https://cdn.tse.jus.br/")) throw Error(`missing official archive ${uf}/${round}`);
    const checksumResponse = await fetch(`${resource.url}.sha512`, { signal: AbortSignal.timeout(30000) });
    if (!checksumResponse.ok) throw Error(`checksum ${checksumResponse.status}`);
    const expected = (await checksumResponse.text()).match(/[a-f0-9]{128}/i)?.[0].toLowerCase();
    if (!expected) throw Error("checksum missing");
    const path = `${directory}/${uf}-${round}.zip`, cached = `${directory}/${uf}-${round}.json.gz`;
    let rows: BwebSection[];
    try {
      const parsed = JSON.parse(gunzipSync(await readFile(cached)).toString("utf8"));
      if (parsed.sha512 !== expected) throw Error("cached source mismatch");
      rows = parsed.sections;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await verifiedArchive(resource.url, path, expected);
      const zip = await openCsvZip(path);
      try {
        async function* chunks() {
          const decoder = new TextDecoder("windows-1252");
          for await (const bytes of zip.stream) yield decoder.decode(bytes, { stream: true });
          yield decoder.decode();
        }
        rows = await parseBweb(chunks(), { year: 2022, election: round === 1 ? 544 : 545, round, candidates: [13, 22] });
      } finally { zip.close(); }
      await writeFile(cached, gzipSync(JSON.stringify({ sha512: expected, sections: rows })));
    }
    provenance.push({ uf, round, url: resource.url, sha512: expected, units: rows.length });
    rounds.push(rows);
    console.log(`${uf}/${round}: ${rows.length} sections`);
  }
  const geography = rounds[1].map(s => ({ ...s, region, capital: false, matched: false }));
  const capitals = capitalsByUF.get(uf) ?? new Set<string>();
  for (const s of geography) s.capital = capitals.has(s.municipality);
  for (const s of rounds[0]) for (const m of s.members) firstReceipt.set(m, Date.parse(receipt(s.receipt)));
  base.push(...historicalReference(geography, rounds[0]));
  current.push(...rounds[1]);
  await writeFile(`${directory}/progress.json`, JSON.stringify({ provenance, units: base.length }));
}
current.sort((a, b) => receipt(a.receipt).localeCompare(receipt(b.receipt)) || a.id.localeCompare(b.id));
const identity = { election: "545", round: 2, office: "0001", candidates: ["13", "22"] as [string, string] };
const events: Observation[] = current.map((s, i) => ({ ...identity, id: s.id, version: i + 1,
  hash: createHash("sha256").update(JSON.stringify(s)).digest("hex"), status: "totalized",
  a: s.firstA, b: s.firstB, valid: s.firstValid, blank: s.blank, null: s.null,
  turnout: s.turnout!, electorate: s.electorate, sourceTime: receipt(s.receipt), retrievedAt: receipt(s.receipt) }));
const truth = { a: current.reduce((n, s) => n + s.firstA, 0), b: current.reduce((n, s) => n + s.firstB, 0) };
// HOLDOUT_ORDER=oracle uses the real second-round arrival (the section configuration known live); default: first round.
const order = process.env.HOLDOUT_ORDER === "oracle"
  ? new Map(events.map((e, i) => [e.id, i] as [string, number]))
  : new Map(base.map(s => [s.id, Math.min(...s.members.map(m => firstReceipt.get(m) ?? Number.MAX_SAFE_INTEGER))] as [string, number]));
// HOLDOUT_SHOCKS="n:u,n:u" sweeps the uncertainty shocks in both modes; point estimates do not depend on them.
if (process.env.HOLDOUT_SHOCKS) {
  const runs: any[] = [];
  for (const variant of process.env.HOLDOUT_SHOCKS.split(",")) {
    const [nationalShock, ufShock] = variant.split(":").map(Number), options = { nationalShock, ufShock };
    for (const mode of ["section", "municipal"]) {
      const r = mode === "municipal" ? evaluateMunicipal(base, events, identity, truth, order, undefined, options)
        : evaluateOperational(base, events, identity, truth, undefined, options);
      const row = { mode, nationalShock, ufShock, samples: r.samples.map((s: any) =>
        ({ target: s.target, errorPP: s.errorPP, covered: s.covered, widthPP: s.widthPP })) };
      runs.push(row); console.log(JSON.stringify(row));
    }
  }
  await writeFile(`${directory}/report-calibration.json`, JSON.stringify({ truth: truth.a / (truth.a + truth.b), runs }, null, 2));
  process.exit(0);
}
const result = { kind: "national-real-counts-reconstructed-final-receipt-order", year: 2022,
  modelSha256: createHash("sha256").update(await readFile("src/core/model.ts")).digest("hex"),
  training: false, parameterTuningPerformed: false, calibrationSufficient: false,
  limitations: ["Uma eleição nacional não demonstra cobertura de 95% entre eleições.",
    "Recibos finais não recuperam versões substituídas, exclusões e atrasos reais de disponibilidade.",
    "Capital histórica usa código municipal operacional; divergências territoriais exigem auditoria."],
  provenance, mode: municipalMode ? "municipal-partials-first-round-order" : "section-bus",
  ...(municipalMode
    ? evaluateMunicipal(base, events, identity, truth, order)
    : evaluateOperational(base, events, identity, truth)) };
await writeFile(`${directory}/${municipalMode ? `report-municipal${process.env.HOLDOUT_ORDER === "oracle" ? "-oracle" : ""}` : "report"}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
