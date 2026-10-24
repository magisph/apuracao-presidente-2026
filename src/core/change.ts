import type { Snapshot, Observation } from "./types.ts";
// Exclude transport clocks, retaining source clocks: a correction with unchanged section counts still changes the signature.
export function snapshotContent(s: Snapshot, observations: Observation[] = []) {
  const official = (o: any) => {
    if (!o) return null;
    const { retrievedAt, ...fields } = o;
    return fields;
  };
  return JSON.stringify({
    identity: s.identity,
    projection: s.projection,
    official: official(s.official),
    territories: s.territories.map((t) => ({
      ...t,
      official: official(t.official),
    })),
    baseHash: s.health.baseHash,
    modelHash: s.health.modelHash,
    configHash: s.health.configHash,
    unmatchedSections: s.health.unmatchedSections,
    unknownElectorateSections: s.health.unknownElectorateSections,
    ledger: [...observations]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((o) => [
        o.id,
        o.version,
        o.hash,
        o.status,
        o.a,
        o.b,
        o.valid,
        o.blank,
        o.null,
        o.electorate,
      ]),
  });
}
