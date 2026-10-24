import { test } from "node:test";
import assert from "node:assert/strict";
import { refreshResourceHashes, verifyResourceHashes } from "../src/collector/provenance.ts";
test("final resource hashes cover reconciled metadata and preserve original stage hashes", () => {
  const base={sections:[{uf:"AC",ibge:"1200013"}],manifest:{resources:[{uf:"AC",sectionsSha256:"original"}]}};
  assert.throws(()=>verifyResourceHashes(base),/hash/);
  refreshResourceHashes(base);
  verifyResourceHashes(base);
  const resource=base.manifest.resources[0] as any;
  assert.equal(resource.historicalSectionsSha256,"original");
  base.sections[0].ibge="changed";
  assert.throws(()=>verifyResourceHashes(base),/hash/);
});
