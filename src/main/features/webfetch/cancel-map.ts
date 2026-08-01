export class CancelMap {
  private readonly map = new Map<string, AbortController>();

  register(id: string, ctrl: AbortController): void {
    this.map.set(id, ctrl);
  }

  abort(id: string): boolean {
    const ctrl = this.map.get(id);
    if (!ctrl) {
      return false;
    }
    ctrl.abort();
    this.map.delete(id);
    return true;
  }

  size(): number {
    return this.map.size;
  }
}
