export interface GroupHealth {
  checkedAt: string | null;
  queue: number;
  state: "ok" | "stale" | "waiting";
}
export function collectionHealth(input: Record<string, GroupHealth>, now = Date.now()) {
  const groups: Record<string, GroupHealth> = {};
  for (let i = 0; i < 5; i++) {
    const g = input[`g${i}`];
    const recent = g?.checkedAt && Number.isFinite(Date.parse(g.checkedAt)) &&
      now - Date.parse(g.checkedAt) <= 120000;
    groups[`g${i}`] = {
      checkedAt: g?.checkedAt ?? null,
      queue: g?.queue ?? 0,
      state: !g?.checkedAt ? "waiting" : !recent ? "stale" : g.state,
    };
  }
  return {
    groups,
    state: Object.values(groups).every(g => g.state === "ok") ? "ok" as const : "stale" as const,
    queue: Object.values(groups).reduce((n, g) => n + g.queue, 0),
  };
}
