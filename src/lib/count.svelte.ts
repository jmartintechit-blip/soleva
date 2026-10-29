// An amount in cents that counts to its target (quart-out), or jumps there when motion is reduced.
// Whole euros on the way, so the cents only show (if any) once it lands.
export class Count {
  value = $state(0);
  #raf = 0;

  to(target: number, ms: number) {
    cancelAnimationFrame(this.#raf);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.value = target;
      return;
    }
    const from = this.value;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      this.value =
        p < 1 ? Math.round((from + (target - from) * (1 - (1 - p) ** 4)) / 100) * 100 : target;
      if (p < 1) this.#raf = requestAnimationFrame(step);
    };
    this.#raf = requestAnimationFrame(step);
  }

  stop() {
    cancelAnimationFrame(this.#raf);
  }
}
