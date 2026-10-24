import { projectHierarchy } from "./model.ts";
import type {
  ElectionIdentity,
  SectionBase,
  Observation,
  Snapshot,
} from "./types.ts";
export const IDENTITY: ElectionIdentity = {
  election: "6258",
  round: 2,
  office: "0001",
  candidates: ["13", "22"],
};
export const STATES: [string, string, string][] = [
  ["AC", "Acre", "Norte"],
  ["AL", "Alagoas", "Nordeste"],
  ["AP", "Amapá", "Norte"],
  ["AM", "Amazonas", "Norte"],
  ["BA", "Bahia", "Nordeste"],
  ["CE", "Ceará", "Nordeste"],
  ["DF", "Distrito Federal", "Centro-Oeste"],
  ["ES", "Espírito Santo", "Sudeste"],
  ["GO", "Goiás", "Centro-Oeste"],
  ["MA", "Maranhão", "Nordeste"],
  ["MT", "Mato Grosso", "Centro-Oeste"],
  ["MS", "Mato Grosso do Sul", "Centro-Oeste"],
  ["MG", "Minas Gerais", "Sudeste"],
  ["PA", "Pará", "Norte"],
  ["PB", "Paraíba", "Nordeste"],
  ["PR", "Paraná", "Sul"],
  ["PE", "Pernambuco", "Nordeste"],
  ["PI", "Piauí", "Nordeste"],
  ["RJ", "Rio de Janeiro", "Sudeste"],
  ["RN", "Rio Grande do Norte", "Nordeste"],
  ["RS", "Rio Grande do Sul", "Sul"],
  ["RO", "Rondônia", "Norte"],
  ["RR", "Roraima", "Norte"],
  ["SC", "Santa Catarina", "Sul"],
  ["SP", "São Paulo", "Sudeste"],
  ["SE", "Sergipe", "Nordeste"],
  ["TO", "Tocantins", "Norte"],
  ["ZZ", "Exterior", "Exterior"],
];
export function makeDemo(steps = 32): Snapshot[] {
  const base: SectionBase[] = STATES.flatMap(([uf, name, region], i) =>
    Array.from({ length: 12 }, (_, j) => {
      const firstA = Math.round(80 + 65 * Math.sin(i * 1.7) + j * 2),
        firstB = 210 - firstA;
      const id = `${uf.toLowerCase()}/${String(i + 1).padStart(5, "0")}/0001/${String(j + 1).padStart(4, "0")}`;
      return {
        id,
        uf,
        name,
        region,
        municipality: String(i * 3 + Math.floor(j / 4)),
        capital: j < 4 && uf !== "ZZ",
        electorate: 320,
        firstA,
        firstB,
        firstOther: 40,
        firstValid: 250,
        members: [id],
        matched: true,
      };
    }),
  );
  const ordered = [...base].sort(
    (a, b) => Math.sin(base.indexOf(a) * 47) - Math.sin(base.indexOf(b) * 47),
  );
  return Array.from({ length: steps }, (_, step) => {
    const seen = ordered.slice(
      0,
      Math.max(1, Math.floor(((step + 1) / steps) * base.length * 0.86)),
    );
    const time = new Date(
      Date.UTC(2026, 9, 25, 20, 0) + step * 90000,
    ).toISOString();
    const observations: Observation[] = seen.map((s) => {
      const a = Math.round((s.firstA + s.firstOther * 0.58) * 1.01);
      return {
        ...IDENTITY,
        id: s.id,
        version: 1,
        hash: `synthetic-${s.id}`,
        status: "totalized",
        a,
        b: 250 - a,
        valid: 250,
        blank: 8,
        null: 6,
        turnout: 264,
        electorate: 320,
        sourceTime: time,
        retrievedAt: time,
      };
    });
    const fitted = projectHierarchy(base, observations, { replicates: 120 });
    return {
      schemaVersion: 1,
      id: `demo-${step + 1}`,
      sequence: step + 1,
      createdAt: time,
      mode: "simulation",
      identity: IDENTITY,
      projection: fitted.national,
      official: null,
      territories: STATES.map(([code, name, region]) => ({
        code,
        name,
        region,
        projection: fitted.ufs.get(code)!,
      })),
      health: {
        state: "ok",
        message:
          "Ensaio com dados inteiramente sintéticos. Não representa resultado eleitoral.",
        queue: 0,
        sourceTime: time,
        collectedAt: time,
        baseHash: "synthetic-v1",
        modelVersion: "transfer-logit-v2-coherent",
        calibrated: false,
      },
    };
  });
}
