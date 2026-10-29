// A number that counts to its target (quart-out), or jumps there when motion is reduced.
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
      this.value = from + (target - from) * (1 - (1 - p) ** 4);
      if (p < 1) this.#raf = requestAnimationFrame(step);
    };
    this.#raf = requestAnimationFrame(step);
  }

  stop() {
    cancelAnimationFrame(this.#raf);
  }
}
