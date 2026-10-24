import { csvRows } from "./csv.ts";
import { validateBase } from "../core/ledger.ts";
import type { SectionBase } from "../core/types.ts";
export interface BwebSection extends SectionBase {
  electorate: number;
  blank: number;
  null: number;
  turnout: number | null;
  receipt: string;
}
export async function parseBweb(
  chunks: AsyncIterable<string>,
  expected = {
    year: 2026,
    election: 6257,
    round: 1,
    candidates: [13, 22] as [number, number],
  },
): Promise<BwebSection[]> {
  let header: string[] = [];
  const sections = new Map<string, BwebSection>(),
    seen = new Set<string>();
  for await (const row of csvRows(chunks)) {
    if (!header.length) {
      header = row.map((x) => x.replace(/^\uFEFF/, ""));
      if (expected.year === 2022)
        header = header.map((k) =>
          k === "DS_AGREGADAS" ? "DS_SECOES_AGREGADAS" : k,
        );
      for (const k of [
        "ANO_ELEICAO",
        "CD_ELEICAO",
        "NR_TURNO",
        "CD_CARGO_PERGUNTA",
        "SG_UF",
        "CD_MUNICIPIO",
        "NR_ZONA",
        "NR_SECAO",
        "QT_APTOS",
        "NR_VOTAVEL",
        "QT_VOTOS",
        "CD_TIPO_VOTAVEL",
        "DS_SECOES_AGREGADAS",
      ])
        if (!header.includes(k)) throw Error(`BWEB missing ${k}`);
      continue;
    }
    if (row.length !== header.length) throw Error("BWEB column mismatch");
    const get = (k: string) => row[header.indexOf(k)];
    const n = (k: string) => {
      if (!/^\d+$/.test(get(k))) throw Error(`BWEB invalid ${k}`);
      return Number(get(k));
    };
    if (n("ANO_ELEICAO") !== expected.year)
      throw Error("BWEB identity year mismatch");
    if (n("NR_TURNO") !== expected.round || n("CD_CARGO_PERGUNTA") !== 1)
      continue;
    if (n("CD_ELEICAO") !== expected.election)
      throw Error("BWEB identity election mismatch");
    const uf = get("SG_UF").toUpperCase(),
      m = get("CD_MUNICIPIO").padStart(5, "0"),
      z = get("NR_ZONA").padStart(4, "0"),
      section = get("NR_SECAO").padStart(4, "0"),
      id = `${uf.toLowerCase()}/${m}/${z}/${section}`;
    const duplicates = `${id}/${get("CD_TIPO_VOTAVEL")}/${get("NR_VOTAVEL")}`;
    if (seen.has(duplicates))
      throw Error("BWEB duplicate vote row; reconcile retransmissions first");
    seen.add(duplicates);
    const members = [
      id,
      ...(get("DS_SECOES_AGREGADAS").match(/\d+/g) ?? []).map(
        (s) => `${uf.toLowerCase()}/${m}/${z}/${s.padStart(4, "0")}`,
      ),
    ];
    const s = sections.get(id) ?? {
      id,
      uf,
      region: "",
      municipality: m,
      name: get("NM_MUNICIPIO") ?? m,
      capital: false,
      electorate: n("QT_APTOS"),
      firstA: 0,
      firstB: 0,
      firstOther: 0,
      firstValid: 0,
      members,
      matched: true,
      blank: 0,
      null: 0,
      turnout: header.includes("QT_COMPARECIMENTO")
        ? n("QT_COMPARECIMENTO")
        : null,
      receipt: get("DT_BU_RECEBIDO") ?? "",
    };
    if (
      s.electorate !== n("QT_APTOS") ||
      JSON.stringify(s.members) !== JSON.stringify(members)
    )
      throw Error("BWEB membership/electorate conflict");
    if (n("CD_TIPO_VOTAVEL") === 1) {
      const candidate = n("NR_VOTAVEL"),
        votes = n("QT_VOTOS");
      if (candidate === expected.candidates[0]) s.firstA += votes;
      else if (candidate === expected.candidates[1]) s.firstB += votes;
      else s.firstOther += votes;
      s.firstValid += votes;
    } else if (n("CD_TIPO_VOTAVEL") === 2) s.blank += n("QT_VOTOS");
    else if (n("CD_TIPO_VOTAVEL") === 3) s.null += n("QT_VOTOS");
    else throw Error("unknown presidential vote type");
    sections.set(id, s);
  }
  const out = [...sections.values()];
  validateBase(out);
  for (const s of out)
    if (s.turnout !== null && s.firstValid + s.blank + s.null !== s.turnout)
      throw Error("BWEB turnout mismatch");
  return out;
}
