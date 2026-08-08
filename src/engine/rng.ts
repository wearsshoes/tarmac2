/** xmur3 + sfc32: compact, stable string-seeded random streams. */
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

  constructor(seed: string, stream = "root") {
    const hash = xmur3(`${seed}:${stream}`);
    this.a = hash();
    this.b = hash();
    this.c = hash();
    this.d = hash();
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
  fork(stream: string): RNG { return new RNG(`${this.a}:${this.b}:${this.c}:${this.d}`, stream); }
}
