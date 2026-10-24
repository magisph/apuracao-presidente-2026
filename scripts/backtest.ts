import { readFile } from "node:fs/promises";
import { SectionLedger } from "../src/core/ledger.ts";
import { project } from "../src/core/model.ts";
import { AtomicStore } from "../src/collector/store.ts";
import { IDENTITY } from "../src/core/demo.ts";
import type { SectionBase, Observation } from "../src/core/types.ts";
const [baseFile, eventsFile, truthFile] = process.argv.slice(2);
if (!baseFile || !eventsFile || !truthFile)
  throw Error("Uso: npm run backtest -- base.json eventos.ndjson verdade.json");
const base = (
  JSON.parse(await readFile(baseFile, "utf8")) as { sections: SectionBase[] }
).sections;
const truth = JSON.parse(await readFile(truthFile, "utf8")) as {
  a: number;
  b: number;
  kind: "real-temporal" | "synthetic-order";
  training: boolean;
};
if (
  !Number.isFinite(truth.a) ||
  !Number.isFinite(truth.b) ||
  truth.a + truth.b <= 0
)
  throw Error("invalid ground truth");
const events = (await readFile(eventsFile, "utf8"))
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((x) => JSON.parse(x) as Observation);
const ledger = new SectionLedger(IDENTITY, base),
  samples: any[] = [];
let last = -Infinity;
const target = truth.a / (truth.a + truth.b);
for (const o of events) {
  const time = Date.parse(o.retrievedAt);
  if (time < last) throw Error("replay events not chronological");
  last = time;
  ledger.apply(o);
  const started = performance.now(),
    p = project(base, ledger.values());
  if (p.available)
    samples.push({
      at: o.retrievedAt,
      progress: p.progress,
      errorPP: Math.abs(p.share! - target) * 100,
      covered: p.low! <= target && p.high! >= target,
      widthPP: (p.high! - p.low!) * 100,
      ms: performance.now() - started,
    });
}
const mean = (key: string) =>
  samples.reduce((n, s) => n + Number(s[key]), 0) / (samples.length || 1);
const report = {
  kind: truth.kind,
  training: truth.training,
  independent: truth.kind === "real-temporal" && !truth.training,
  calibratesWinner: false,
  samples: samples.length,
  maePP: mean("errorPP"),
  maxErrorPP: Math.max(0, ...samples.map((s) => s.errorPP)),
  coverage: mean("covered"),
  meanWidthPP: mean("widthPP"),
  meanMs: mean("ms"),
  checkpoints: [0.01, 0.03, 0.05, 0.1, 0.15, 0.2, 0.5].map((progress) => ({
    progress,
    sample: samples.find((s) => s.progress >= progress) ?? null,
  })),
  series: samples,
};
await new AtomicStore("data/backtest.json").write(report);
console.log(JSON.stringify({ ...report, series: undefined }, null, 2));
