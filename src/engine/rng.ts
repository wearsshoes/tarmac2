/** xmur3 + sfc32: compact, stable string-seeded random streams (harvest H1). */
function xmur3(value: string): () => number {
  let h = 1779033703 ^ value.length;
  for (let i = 0; i < value.length; i++) {
    h = Math.imul(h ^ value.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export class RNG {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  private readonly seedString: string;

  constructor(seed: string, stream = "root") {
    this.seedString = `${seed}::${stream}`;
    const hash = xmur3(this.seedString);
    this.a = hash();
    this.b = hash();
    this.c = hash();
    this.d = hash();
    // Warm-up: human-typed seeds differing by one character diverge immediately.
    for (let i = 0; i < 12; i++) this.next();
  }

  next(): number {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    const t = (this.a + this.b + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = ((this.c << 21) | (this.c >>> 11));
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  float(min: number, max: number): number { return min + (max - min) * this.next(); }
  int(min: number, max: number): number { return Math.floor(this.float(min, max + 1)); }
  chance(probability: number): boolean { return this.next() < probability; }
  pick<T>(items: readonly T[]): T { return items[Math.floor(this.next() * items.length)]!; }
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((sum, [, w]) => sum + w, 0);
    let roll = this.next() * total;
    for (const [item, w] of items) { roll -= w; if (roll <= 0) return item; }
    return items[items.length - 1]![0];
  }
  gauss(mean = 0, stdev = 1): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return mean + stdev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }
  /** Fork an independent labeled stream (harvest H1 derive). */
  derive(label: string): RNG { return new RNG(this.seedString, label); }
  fork(stream: string): RNG { return this.derive(stream); }
}
