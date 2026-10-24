import type { SectionBase, Observation, Official, Snapshot } from "./types.ts";
import { project, projectHierarchy } from "./model.ts";
import type { ProjectionHierarchy } from "./model.ts";
import { IDENTITY, STATES } from "./demo.ts";
export function makeSnapshot(
  base: SectionBase[],
  observations: Observation[],
  official: Official | null,
  sequence: number,
  baseHash: string | null,
  message: string,
  denominators: Record<string, number> = {},
  hierarchy?: ProjectionHierarchy,
): Snapshot {
  const now = new Date().toISOString();
  const fitted = hierarchy ?? projectHierarchy(base, observations, {
    universeElectorate: official?.electorate, universeByUF: denominators,
  });
  return {
    schemaVersion: 1,
    id: `live-${sequence}`,
    sequence,
    createdAt: now,
    mode: "live",
    identity: IDENTITY,
    projection: fitted.national,
    official,
    territories: STATES.map(([code, name, region]) => {
      const rows = base.filter((s) => s.uf === code);
      return {
        code,
        name,
        region,
        projection: fitted.ufs.get(code) ?? project([], []),
        historical: rows.length
          ? {
              a: rows.reduce((n, s) => n + s.firstA, 0),
              b: rows.reduce((n, s) => n + s.firstB, 0),
              other: rows.reduce((n, s) => n + s.firstOther, 0),
              valid: rows.reduce((n, s) => n + s.firstValid, 0),
            }
          : undefined,
      };
    }),
    health: {
      state: official ? "ok" : "waiting",
      message,
      queue: 0,
      sourceTime: official?.sourceTime ?? null,
      collectedAt: observations.at(-1)?.retrievedAt ?? null,
      baseHash,
      modelVersion: "transfer-logit-v2-coherent",
      calibrated: false,
      unmatchedSections: base.filter((s) => !s.matched).length,
      unknownElectorateSections: base.filter((s) => s.electorate === null)
        .length,
    },
  };
}
