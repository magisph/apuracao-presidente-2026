// Conservative upper bound: each elector in not-totalized sections can cast at most one valid vote.
export function mathematicalDecision(
  a: number,
  b: number,
  remainingElectorate: number | null,
): "a" | "b" | null {
  if (
    remainingElectorate === null ||
    ![a, b, remainingElectorate].every((x) => Number.isSafeInteger(x) && x >= 0)
  )
    return null;
  return a - b > remainingElectorate
    ? "a"
    : b - a > remainingElectorate
      ? "b"
      : null;
}
