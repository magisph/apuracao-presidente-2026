export function partitionUFs(sections: { uf: string }[]) {
  const counts = new Map<string, number>();
  for (const s of sections) counts.set(s.uf, (counts.get(s.uf) ?? 0) + 1);
  const bins: { ufs: string[]; count: number }[] = Array.from(
    { length: 5 },
    () => ({ ufs: [], count: 0 }),
  );
  for (const [uf, count] of [...counts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )) {
    const bin = bins.reduce((a, b) => (b.count < a.count ? b : a));
    bin.ufs.push(uf);
    bin.count += count;
  }
  return bins;
}
