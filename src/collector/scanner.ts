import { inventory } from "./tse.ts";
export function sourceAdvanced(
  previous: { version: number; hash: string; status: string } | undefined,
  next: { version: number; hash: string; status: string },
) {
  return (
    next.status === "totalized" &&
    (!previous ||
      next.version > previous.version ||
      next.hash !== previous.hash ||
      next.status !== previous.status)
  );
}
export function changedSections(
  raw: any,
  contest: string,
  known: Map<string, string>,
): { id: string; generation: string }[] {
  return inventory(raw, contest)
    .filter((s) => s.generation.trim() && known.get(s.id) !== s.generation)
    .map(({ id, generation }) => ({ id, generation }));
}
