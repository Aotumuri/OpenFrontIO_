import { z } from "zod";
import rawTerritoryPatterns from "../../resources/territory_patterns.json";

import checkerboard from "../../resources/pattern/checkerboard.bin";
import cross from "../../resources/pattern/cross.bin";
import diagonal from "../../resources/pattern/diagonal.bin";
import horizontal_stripes from "../../resources/pattern/horizontal_stripes.bin";
import openfront from "../../resources/pattern/openfront.bin";
import sparse_dots from "../../resources/pattern/sparse_dots.bin";
import stripes_h from "../../resources/pattern/stripes_h.bin";
import stripes_v from "../../resources/pattern/stripes_v.bin";

const binPatterns: Record<string, string> = {
  checkerboard,
  cross,
  diagonal,
  horizontal_stripes,
  openfront,
  sparse_dots,
  stripes_h,
  stripes_v,
};

const PatternSchema = z.object({
  tileWidth: z.number(),
  tileHeight: z.number(),
  scale: z.number(),
  pattern: z.array(z.array(z.number())),
});

const TerritoryPatternsSchema = z.object({
  patterns: z.record(PatternSchema),
});

export const territoryPatterns: z.infer<typeof TerritoryPatternsSchema> =
  TerritoryPatternsSchema.parse(rawTerritoryPatterns);

(async () => {
  for (const [key, value] of Object.entries(territoryPatterns.patterns)) {
    const binData = binPatterns[key];
    if (binData) {
      const bytes = new Uint8Array(await (await fetch(binData)).arrayBuffer());
      const bits = Array.from(bytes).flatMap((byte) =>
        [...Array(8)].map((_, i) => (byte >> (7 - i)) & 1),
      );
      const pattern: number[][] = [];
      for (let y = 0; y < value.tileHeight; y++) {
        const row: number[] = [];
        for (let x = 0; x < value.tileWidth; x++) {
          const index = y * value.tileWidth + x;
          row.push(bits[index] ?? 0);
        }
        pattern.push(row);
      }
      value.pattern = pattern;
    }
  }
})();

export class TerritoryPatternStorage {
  private static readonly KEY = "territoryPattern";

  static getSelectedPattern(): string | undefined {
    return localStorage.getItem(TerritoryPatternStorage.KEY) ?? undefined;
  }

  static setSelectedPattern(patternKey: string): void {
    localStorage.setItem(TerritoryPatternStorage.KEY, patternKey);
  }
}
