import { openCsvZip } from "../src/collector/zip.ts";
import { parseBweb } from "../src/collector/base.ts";
import { historicalReference, evaluateOperational } from "../src/core/evaluation.ts";
import { AtomicStore } from "../src/collector/store.ts";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Observation } from "../src/core/types.ts";
async function parse(path: string, election: number, round: number) {
  const zip = await openCsvZip(path);
  try {
    async function* chunks() {
      const d = new TextDecoder("windows-1252");
      for await (const b of zip.stream) yield d.decode(b, { stream: true });
      yield d.decode();
    }
    return await parseBweb(chunks(), {
      year: 2022,
      election,
      round,
      candidates: [13, 22],
    });
  } finally {
    zip.close();
  }
}
const firstPath = process.argv[2] ?? "data/holdout/ac-2022-1t.zip",
  secondPath = process.argv[3] ?? "data/holdout/ac-2022-2t.zip";
const first = await parse(firstPath, 544, 1),
  second = await parse(secondPath, 545, 2),
  base = historicalReference(
    second.map((s) => ({
      ...s,
      region: "Norte",
      capital: s.municipality === "01392",
      matched: false,
    })),
    first,
  );
const matched = new Set(
  base.filter((s) => s.matched && s.firstValid).map((s) => s.id),
);
const normalizedReceipt = (s: string) => {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4}) (.*)/);
  if (!m) throw Error("unknown historical receipt format");
  return `${m[3]}-${m[2]}-${m[1]} ${m[4]}`;
};
const events = second
  .sort(
    (a, b) =>
      normalizedReceipt(a.receipt).localeCompare(
        normalizedReceipt(b.receipt),
      ) || a.id.localeCompare(b.id),
  );
const observations: Observation[] = events.map((s, i) => ({
      election: "545",
      round: 2,
      office: "0001",
      candidates: ["13", "22"],
      id: s.id,
      version: i+1,
      hash: `holdout-${s.id}`,
      status: "totalized",
      a: s.firstA,
      b: s.firstB,
      valid: s.firstValid,
      blank: s.blank,
      null: s.null,
      turnout: s.turnout!,
      electorate: s.electorate,
      sourceTime: normalizedReceipt(s.receipt).replace(" ","T")+"-03:00",
      retrievedAt: normalizedReceipt(s.receipt).replace(" ","T")+"-03:00",
    }));
const evaluated=evaluateOperational(base,observations,
  {election:"545",round:2,office:"0001",candidates:["13","22"]},
  {a:second.reduce((n,s)=>n+s.firstA,0),b:second.reduce((n,s)=>n+s.firstB,0)});
const report = {
  kind: "real-counts-reconstructed-receipt-order",
  year: 2022,
  uf: "AC",
  training: false,
  parameterTuningPerformed: false,
  calibrationSufficient: false,
  limitations: [
    "Apenas uma UF e uma eleição; não avalia viés nacional.",
    "Arquivos finais de BU ordenados pelo recebimento; histórico completo de correções e snapshots não recuperado.",
    "Não é ensaio temporal independente completo para habilitar selo.",
  ],
  firstUnits: first.length,
  secondUnits: second.length,
  matched: matched.size,
  operationalLedger: true,
  electorateReference: "1T por correspondência exata, igual à preparação operacional",
  ...evaluated,
  sourceHashes: {
    first: createHash("sha256")
      .update(await readFile(firstPath))
      .digest("hex"),
    second: createHash("sha256")
      .update(await readFile(secondPath))
      .digest("hex"),
  },
};
await new AtomicStore("data/holdout-ac-2022.json").write(report);
console.log(JSON.stringify(report, null, 2));
