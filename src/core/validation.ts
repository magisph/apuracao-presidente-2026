import type { Snapshot, Projection, Official } from "./types.ts";
const unit = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const count = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
export function validateProjection(p: Projection) {
  if (
    !p ||
    p.winner !== null ||
    p.interval !== "nominal" ||
    !unit(p.progress) ||
    (p.coverage !== null && !unit(p.coverage)) ||
    ![
      p.observedA,
      p.observedB,
      p.observedSections,
      p.modeledSections,
      p.electorate,
    ].every(count) ||
    p.observedSections > p.modeledSections
  )
    throw Error("invalid projection");
  if (p.available) {
    if (
      ![p.a, p.b].every(count) ||
      ![p.share, p.low, p.high].every(unit) ||
      p.low! > p.share! ||
      p.high! < p.share! ||
      p.a! < p.observedA ||
      p.b! < p.observedB ||
      Math.abs(p.a! / (p.a! + p.b!) - p.share!) > 1e-8
    )
      throw Error("inconsistent projection");
  } else if ([p.a, p.b, p.share, p.low, p.high].some((v) => v !== null))
    throw Error("unavailable projection must be null");
}
function validateOfficial(o: Official) {
  if (
    ![
      o.a,
      o.b,
      o.valid,
      o.blank,
      o.null,
      o.electorate,
      o.totalSections,
      o.countedSections,
    ].every((v) => Number.isSafeInteger(v) && v >= 0) ||
    o.a + o.b !== o.valid ||
    o.countedSections > o.totalSections ||
    !unit(o.progress)
  )
    throw Error("invalid official totals");
}
export function validateSnapshot(value: unknown): asserts value is Snapshot {
  const s = value as Snapshot;
  if (
    s?.schemaVersion !== 1 ||
    !["live", "simulation"].includes(s.mode) ||
    !Number.isSafeInteger(s.sequence) ||
    s.sequence < 1 ||
    typeof s.id !== "string" ||
    !Number.isFinite(Date.parse(s.createdAt)) ||
    s.health?.calibrated !== false
  )
    throw Error("invalid snapshot");
  if (
    s.identity?.election !== "6258" ||
    s.identity.office !== "0001" ||
    s.identity.round !== 2 ||
    JSON.stringify(s.identity.candidates) !== '["13","22"]'
  )
    throw Error("snapshot identity");
  validateProjection(s.projection);
  if (s.official) validateOfficial(s.official);
  if (!Array.isArray(s.territories) || s.territories.length > 6000)
    throw Error("invalid territories");
  const ids = new Set<string>();
  for (const t of s.territories) {
    if (ids.has(t.code) || typeof t.name !== "string")
      throw Error("duplicate territory");
    ids.add(t.code);
    validateProjection(t.projection);
    if (t.official) validateOfficial(t.official);
  }
}
