import { project, projectHierarchy } from "./model.ts";
import type { ProjectionHierarchy } from "./model.ts";
import type { SectionBase, Observation, Territory } from "./types.ts";
export function municipalTerritories(
  base: SectionBase[],
  observations: Observation[],
  hierarchy?: ProjectionHierarchy,
): Territory[] {
  const fitted = hierarchy ?? projectHierarchy(base, observations);
  const groups = new Map<string, SectionBase[]>();
  for (const s of base) {
    const key = `${s.uf}/${s.municipality}`;
    const g = groups.get(key) ?? [];
    g.push(s);
    groups.set(key, g);
  }
  return [...groups].map(([code, sections]) => ({
    code,
    name: sections[0].name,
    region: sections[0].region,
    parent: sections[0].uf,
    ibge: sections[0].ibge,
    projection: fitted.municipalities.get(code) ?? project([], []),
    historical: {
      a: sections.reduce((n, s) => n + s.firstA, 0),
      b: sections.reduce((n, s) => n + s.firstB, 0),
      other: sections.reduce((n, s) => n + s.firstOther, 0),
      valid: sections.reduce((n, s) => n + s.firstValid, 0),
    },
  }));
}
