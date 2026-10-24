import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseBweb } from "../src/collector/base.ts";
import { inventory } from "../src/collector/tse.ts";
test("EA16 principals include nsa members and nsp records do not become independent urns", () => {
  const raw = JSON.parse(
    readFileSync(
      new URL("./fixtures/ea16-ac-2t.json", import.meta.url),
      "utf8",
    ),
  );
  const list = inventory(raw, "3221"),
    row = list.find((s) => s.id === "ac/01392/0001/0192");
  assert.deepEqual(row?.members, ["ac/01392/0001/0192", "ac/01392/0001/0193"]);
  const members = list.flatMap((x) => x.members);
  assert.equal(new Set(members).size, members.length);
});
const header =
  "ANO_ELEICAO;CD_ELEICAO;NR_TURNO;CD_CARGO_PERGUNTA;SG_UF;CD_MUNICIPIO;NM_MUNICIPIO;NR_ZONA;NR_SECAO;QT_APTOS;NR_VOTAVEL;QT_VOTOS;CD_TIPO_VOTAVEL;DS_SECOES_AGREGADAS\n";
const row = "2026;6257;1;1;AC;1392;RIO BRANCO;1;192;312;13;99;1;193\n";
async function* csv(text: string) {
  yield text;
}
test("BWEB validates election identity, counts aggregation once, refuses repeated vote rows", async () => {
  const result = await parseBweb(csv(header + row));
  assert.equal(result[0].firstA, 99);
  assert.equal(result[0].members.length, 2);
  await assert.rejects(
    parseBweb(csv(header + row.replace("2026", "2022"))),
    /identity/i,
  );
  await assert.rejects(
    parseBweb(csv(header + row.replace("6257", "544"))),
    /identity/i,
  );
  await assert.rejects(parseBweb(csv(header + row + row)), /duplicate/i);
});
test("historical adapter requires explicit election and supports the observed 2022 aggregation column", async () => {
  const text = (header + row)
    .replaceAll("DS_SECOES_AGREGADAS", "DS_AGREGADAS")
    .replaceAll("2026", "2022")
    .replaceAll("6257", "544");
  const r = await parseBweb(csv(text), {
    year: 2022,
    election: 544,
    round: 1,
    candidates: [13, 22],
  });
  assert.equal(r[0].firstA, 99);
  assert.equal(r[0].members.length, 2);
});
