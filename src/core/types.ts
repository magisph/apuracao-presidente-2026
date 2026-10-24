export interface ElectionIdentity {
  election: string;
  round: number;
  office: string;
  candidates: [string, string];
}
export interface SectionBase {
  id: string;
  uf: string;
  region: string;
  municipality: string;
  name: string;
  capital: boolean;
  electorate: number | null;
  firstA: number;
  firstB: number;
  firstOther: number;
  firstValid: number;
  members: string[];
  matched: boolean;
  ibge?: string;
}
export interface Observation extends ElectionIdentity {
  id: string;
  version: number;
  hash: string;
  status: "received" | "totalized" | "excluded";
  a: number;
  b: number;
  valid: number;
  blank: number;
  null: number;
  turnout: number;
  electorate: number;
  sourceTime: string;
  retrievedAt: string;
  inventoryGeneration?: string;
  payloadSha256?: string;
  // Derived from the municipal partial, not from a BU; any real BU for the section supersedes it.
  estimated?: boolean;
}
export interface Projection {
  available: boolean;
  a: number | null;
  b: number | null;
  share: number | null;
  low: number | null;
  high: number | null;
  progress: number;
  coverage: number | null;
  observedA: number;
  observedB: number;
  observedSections: number;
  modeledSections: number;
  electorate: number;
  method: string;
  interval: "nominal";
  winner: null;
  diagnostics: {
    transfer: number | null;
    swing: number | null;
    proportional: number | null;
    blend: number;
  };
}
export interface Official {
  a: number;
  b: number;
  valid: number;
  blank: number;
  null: number;
  electorate: number;
  progress: number;
  totalSections: number;
  countedSections: number;
  candidates: [
    { number: string; name: string },
    { number: string; name: string },
  ];
  final: boolean;
  sourceTime: string | null;
  retrievedAt: string;
  source: string;
  remainingElectorate?: number;
}
export interface Territory {
  code: string;
  name: string;
  region: string;
  projection: Projection;
  official?: Official;
  parent?: string;
  ibge?: string;
  historical?: { a: number; b: number; other: number; valid: number };
}
export interface Snapshot {
  schemaVersion: 1;
  id: string;
  sequence: number;
  createdAt: string;
  mode: "simulation" | "live";
  municipalityPages?: { uf: string; pages: number; hashes?: string[] }[];
  identity: ElectionIdentity;
  projection: Projection;
  official: Official | null;
  territories: Territory[];
  health: {
    state: "ok" | "stale" | "error" | "waiting";
    message: string;
    queue: number;
    sourceTime: string | null;
    collectedAt: string | null;
    baseHash: string | null;
    modelVersion: string;
    calibrated: false;
    modelHash?: string;
    configHash?: string;
    unmatchedSections?: number;
    unknownElectorateSections?: number;
    electorateDifferences?: number;
    groups?: Record<
      string,
      {
        checkedAt: string | null;
        queue: number;
        state: "ok" | "stale" | "waiting";
      }
    >;
  };
}
