export class LoadGeneration {
  value = 0;
  begin() {
    return ++this.value;
  }
  current(generation: number, requestedScope?: string, currentScope?: string) {
    return this.value === generation && requestedScope === currentScope;
  }
}
