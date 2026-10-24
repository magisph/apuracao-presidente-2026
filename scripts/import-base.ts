import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseBweb } from "../src/collector/base.ts";
import { openCsvZip } from "../src/collector/zip.ts";
import { AtomicStore } from "../src/collector/store.ts";
import { validateBase, groupHistorical } from "../src/core/ledger.ts";
import type { SectionBase } from "../src/core/types.ts";
const [file, currentFile, output = "data/base.json"] = process.argv.slice(2);
if (!file || !currentFile)
  throw Error(
    "Uso: npm run import:base -- BWEB.csv-ou-zip inventario-verificado.json [saida]",
  );
const current = JSON.parse(
  await readFile(currentFile, "utf8"),
) as SectionBase[];
validateBase(current);
const opened = file.endsWith(".zip") ? await openCsvZip(file) : null,
  stream = opened?.stream ?? createReadStream(file),
  hash = createHash("sha256");
async function* chunks() {
  const d = new TextDecoder("windows-1252");
  for await (const b of stream) {
    hash.update(b);
    yield d.decode(b, { stream: true });
  }
  yield d.decode();
}
try {
  const historical = await parseBweb(chunks()),
    sections = groupHistorical(current, historical);
  validateBase(sections);
  await new AtomicStore(output).write({
    schemaVersion: 1,
    sections,
    manifest: {
      source: file,
      csvSha256: hash.digest("hex"),
      encoding: "windows-1252",
      createdAt: new Date().toISOString(),
      matched: sections.filter((s) => s.matched).length,
      total: sections.length,
      currentManifest: currentFile,
    },
  });
  console.log(
    `${sections.length} unidades; ${sections.filter((s) => s.matched).length} correspondências completas.`,
  );
} finally {
  opened?.close();
}
