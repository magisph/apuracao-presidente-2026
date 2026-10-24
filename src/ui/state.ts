import type { Projection } from '../core/types.ts';
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
export function displayProjection(p:Projection,mode:'live'|'simulation'):Projection {
  if(projectionDisplay(p.available,p.progress,mode)!=='hidden') return p;
  return {...p,available:false,a:null,b:null,share:null,low:null,high:null,
    diagnostics:{...p.diagnostics,transfer:null,swing:null,proportional:null}};
}
