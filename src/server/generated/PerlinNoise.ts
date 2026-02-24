import { PseudoRandom } from "../../core/PseudoRandom";
import { simpleHash } from "../../core/Util";

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function grad(hash: number, x: number, y: number): number {
  const h = hash & 7;
  const u = h < 4 ? x : y;
  const v = h < 4 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export class PerlinNoise {
  private permutation: Uint8Array;

  public constructor(seed: string) {
    const random = new PseudoRandom(simpleHash(seed));
    const base = Array.from({ length: 256 }, (_, i) => i);
    for (let i = base.length - 1; i > 0; i--) {
      const j = random.nextInt(0, i + 1);
      [base[i], base[j]] = [base[j], base[i]];
    }

    this.permutation = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.permutation[i] = base[i & 255];
    }
  }

  public noise(x: number, y: number): number {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = fade(xf);
    const v = fade(yf);

    const aa = this.permutation[this.permutation[xi] + yi];
    const ab = this.permutation[this.permutation[xi] + yi + 1];
    const ba = this.permutation[this.permutation[xi + 1] + yi];
    const bb = this.permutation[this.permutation[xi + 1] + yi + 1];

    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  }
}

export function fbm2d(
  perlin: PerlinNoise,
  x: number,
  y: number,
  octaves: number,
  persistence: number,
): number {
  let frequency = 1;
  let amplitude = 1;
  let total = 0;
  let amplitudeSum = 0;

  for (let i = 0; i < octaves; i++) {
    total += perlin.noise(x * frequency, y * frequency) * amplitude;
    amplitudeSum += amplitude;
    frequency *= 2;
    amplitude *= persistence;
  }

  return amplitudeSum === 0 ? 0 : total / amplitudeSum;
}
