export class LoadGeneration {
  value = 0;
  begin() {
    return ++this.value;
  }
  current(generation: number, requestedScope?: string, currentScope?: string) {
    return this.value === generation && requestedScope === currentScope;
  }
}
// Same display rule as the live first-round reference method: hidden below 1% observed, flagged until 2.5%.
export function projectionDisplay(available: boolean, progress: number, mode: "live" | "simulation" = "live") {
  if (!available) return "hidden";
  if (mode === "simulation") return "shown";
  return progress < 0.01 ? "hidden" : progress < 0.025 ? "unreliable" : "shown";
}
