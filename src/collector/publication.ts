import type { Snapshot, Territory } from "../core/types.ts";
export type MunicipalPage = { uf: string; page: number; territories: Territory[] };
// Bounded concurrency; manifest order and per-page hash positions never depend on completion order.
export async function publishMunicipalPages(
  municipalities: Territory[],
  ufs: readonly string[],
  send: (page: MunicipalPage) => Promise<{ hash: string }>,
  concurrency = 4,
): Promise<NonNullable<Snapshot["municipalityPages"]>> {
  const manifest: { uf: string; pages: number; hashes: string[] }[] = [],
    pages: { page: MunicipalPage; manifest: (typeof manifest)[number] }[] = [];
  for (const uf of ufs) {
    const rows = municipalities.filter((t) => t.parent === uf);
    if (!rows.length) continue;
    const entry = { uf, pages: Math.ceil(rows.length / 100), hashes: [] as string[] };
    manifest.push(entry);
    for (let page = 0; page * 100 < rows.length; page++)
      pages.push({ page: { uf, page, territories: rows.slice(page * 100, (page + 1) * 100) }, manifest: entry });
  }
  let next = 0, failure: { error: unknown } | null = null;
  const worker = async () => {
    while (!failure && next < pages.length) {
      const { page, manifest: entry } = pages[next++];
      try {
        entry.hashes[page.page] = (await send(page)).hash;
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, pages.length) }, worker));
  if (failure) throw (failure as { error: unknown }).error;
  return manifest;
}
