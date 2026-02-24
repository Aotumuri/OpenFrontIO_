import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { GameMapType } from "../../core/game/Game";
import { PseudoRandom } from "../../core/PseudoRandom";
import {
  GeneratedMapParams,
  MapIntegrity,
  MapIntegritySchema,
} from "../../core/Schemas";
import { simpleHash } from "../../core/Util";
import {
  GeneratedMapManifestSchema,
  ResolveGeneratedMapRequest,
  ResolveGeneratedMapResponse,
  ResolveGeneratedMapResponseSchema,
} from "../../core/WorkerSchemas";
import { logger } from "../Logger";
import { generatedMapsRootDir } from "./GeneratedMapPaths";
import { PerlinNoise } from "./PerlinNoise";

const log = logger.child({ component: "GeneratedMapService" });

const LAND = 1;
const WATER = 0;
const GENERATED_MAPS_RELATIVE_PATH = "/maps/generated";
const MAP_ALGORITHM_REVISION = 12;

type TerrainGrid = {
  width: number;
  height: number;
  type: Uint8Array;
  magnitude: Float32Array;
  shoreline: Uint8Array;
  ocean: Uint8Array;
};

type GeneratedMapResult = {
  manifest: ReturnType<typeof GeneratedMapManifestSchema.parse>;
  mapData: Uint8Array;
  map4xData: Uint8Array;
  map16xData: Uint8Array;
  thumbnail: Buffer;
};

export class GeneratedMapService {
  private readonly rootDir: string;
  private fallbackThumbnail: Buffer | null = null;

  public constructor(rootDir: string = generatedMapsRootDir()) {
    this.rootDir = rootDir;
  }

  public outputDir(): string {
    return this.rootDir;
  }

  public async resolve(
    request: ResolveGeneratedMapRequest,
  ): Promise<ResolveGeneratedMapResponse> {
    const normalizedParams = normalizeParams(request.params);
    const mapId = computeMapId(request, normalizedParams);
    const mapDir = path.join(this.rootDir, mapId);
    await fs.mkdir(mapDir, { recursive: true });

    const loaded = await this.tryLoadExisting(
      mapId,
      mapDir,
      request,
      normalizedParams,
    );
    if (loaded) {
      return loaded;
    }

    log.info("Generating map from seed", { mapId });
    const generated = await this.generate(
      { ...request, params: normalizedParams },
      mapId,
    );
    const mapRef = {
      kind: "generated" as const,
      generator: request.generator,
      generatorVersion: request.generatorVersion,
      seed: request.seed,
      params: normalizedParams,
      mapId,
      integrity: generated.integrity,
    };

    await this.writeAssets(mapDir, generated.result, generated.integrity);

    return ResolveGeneratedMapResponseSchemaSafeParse({
      mapRef,
      manifest: generated.result.manifest,
      thumbnailPath: `${GENERATED_MAPS_RELATIVE_PATH}/${mapId}/thumbnail.webp`,
      fallbackGameMap: GameMapType.World,
    });
  }

  private async tryLoadExisting(
    mapId: string,
    mapDir: string,
    request: ResolveGeneratedMapRequest,
    normalizedParams: GeneratedMapParams,
  ): Promise<ResolveGeneratedMapResponse | null> {
    const manifestPath = path.join(mapDir, "manifest.json");
    const integrityPath = path.join(mapDir, "integrity.json");
    const mapPath = path.join(mapDir, "map.bin");
    const map4xPath = path.join(mapDir, "map4x.bin");
    const map16xPath = path.join(mapDir, "map16x.bin");
    const thumbPath = path.join(mapDir, "thumbnail.webp");

    const allExist = await Promise.all([
      fileExists(manifestPath),
      fileExists(integrityPath),
      fileExists(mapPath),
      fileExists(map4xPath),
      fileExists(map16xPath),
      fileExists(thumbPath),
    ]);
    if (!allExist.every(Boolean)) {
      return null;
    }

    try {
      const [manifestRaw, integrityRaw] = await Promise.all([
        fs.readFile(manifestPath, "utf-8"),
        fs.readFile(integrityPath, "utf-8"),
      ]);

      const manifest = GeneratedMapManifestSchema.parse(
        JSON.parse(manifestRaw),
      );
      const integrity = MapIntegritySchema.parse(JSON.parse(integrityRaw));
      const mapRef = {
        kind: "generated" as const,
        generator: request.generator,
        generatorVersion: request.generatorVersion,
        seed: request.seed,
        params: normalizedParams,
        mapId,
        integrity,
      };
      return ResolveGeneratedMapResponseSchemaSafeParse({
        mapRef,
        manifest,
        thumbnailPath: `${GENERATED_MAPS_RELATIVE_PATH}/${mapId}/thumbnail.webp`,
        fallbackGameMap: GameMapType.World,
      });
    } catch (error) {
      log.warn("Failed to load generated map cache, regenerating", {
        mapId,
        error: String(error),
      });
      return null;
    }
  }

  private async generate(
    request: ResolveGeneratedMapRequest,
    mapId: string,
  ): Promise<{ result: GeneratedMapResult; integrity: MapIntegrity }> {
    const terrain = createTerrainFromNoise(request.params, request.seed);
    processWater(terrain, 0);

    const terrain4x = downscaleTerrain(terrain);
    processWater(terrain4x, 0);

    const terrain16x = downscaleTerrain(terrain4x);
    processWater(terrain16x, 0);

    const mapData = packTerrain(terrain);
    const map4xData = packTerrain(terrain4x);
    const map16xData = packTerrain(terrain16x);
    const mapLandTiles = countLandTiles(terrain);
    const map4xLandTiles = countLandTiles(terrain4x);
    const map16xLandTiles = countLandTiles(terrain16x);

    if (mapLandTiles === 0) {
      throw new Error("Generated map has zero land tiles");
    }

    const nations = generateNations(
      terrain,
      request.params.nationCountHint,
      request.seed,
    );
    const manifest = GeneratedMapManifestSchema.parse({
      name: `Generated-${mapId.slice(0, 8)}`,
      map: {
        width: terrain.width,
        height: terrain.height,
        num_land_tiles: mapLandTiles,
      },
      map4x: {
        width: terrain4x.width,
        height: terrain4x.height,
        num_land_tiles: map4xLandTiles,
      },
      map16x: {
        width: terrain16x.width,
        height: terrain16x.height,
        num_land_tiles: map16xLandTiles,
      },
      nations,
    });

    const thumbnail = await this.getFallbackThumbnail();
    const manifestBytes = Buffer.from(
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );
    const integrity = MapIntegritySchema.parse({
      manifestSha256: sha256Hex(manifestBytes),
      mapSha256: sha256Hex(mapData),
      map4xSha256: sha256Hex(map4xData),
      map16xSha256: sha256Hex(map16xData),
    });

    return {
      result: {
        manifest,
        mapData,
        map4xData,
        map16xData,
        thumbnail,
      },
      integrity,
    };
  }

  private async writeAssets(
    mapDir: string,
    result: GeneratedMapResult,
    integrity: MapIntegrity,
  ) {
    await Promise.all([
      fs.writeFile(
        path.join(mapDir, "manifest.json"),
        JSON.stringify(result.manifest, null, 2),
      ),
      fs.writeFile(path.join(mapDir, "map.bin"), result.mapData),
      fs.writeFile(path.join(mapDir, "map4x.bin"), result.map4xData),
      fs.writeFile(path.join(mapDir, "map16x.bin"), result.map16xData),
      fs.writeFile(path.join(mapDir, "thumbnail.webp"), result.thumbnail),
      fs.writeFile(
        path.join(mapDir, "integrity.json"),
        JSON.stringify(integrity, null, 2),
      ),
    ]);
  }

  private async getFallbackThumbnail(): Promise<Buffer> {
    if (this.fallbackThumbnail) {
      return this.fallbackThumbnail;
    }
    const candidates = [
      path.join(process.cwd(), "static", "maps", "world", "thumbnail.webp"),
      path.join(process.cwd(), "resources", "maps", "world", "thumbnail.webp"),
    ];

    for (const candidate of candidates) {
      if (await fileExists(candidate)) {
        this.fallbackThumbnail = await fs.readFile(candidate);
        return this.fallbackThumbnail;
      }
    }

    throw new Error(
      "Failed to find fallback thumbnail.webp (checked static/maps/world and resources/maps/world)",
    );
  }
}

function ResolveGeneratedMapResponseSchemaSafeParse(
  value: unknown,
): ResolveGeneratedMapResponse {
  return ResolveGeneratedMapResponseSchema.parse(value);
}

function normalizeParams(params: GeneratedMapParams): GeneratedMapParams {
  const width = normalizeDimension(params.width);
  const height = normalizeDimension(params.height);
  const riverThickness = Math.max(
    1,
    Math.min(25, Math.floor(params.riverThickness ?? 1)),
  );

  return {
    ...params,
    width,
    height,
    seaLevel: clamp(params.seaLevel, 0, 1),
    macroInfluence: clamp(params.macroInfluence ?? 1, 0.1, 4),
    smoothStrength: clamp(params.smoothStrength ?? 0, 0, 1),
    riverThickness,
  };
}

function normalizeDimension(v: number): number {
  const clamped = Math.max(64, Math.min(8192, Math.floor(v)));
  return clamped - (clamped % 4);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createTerrainFromNoise(
  params: GeneratedMapParams,
  seed: string,
): TerrainGrid {
  const width = params.width;
  const height = params.height;
  const size = width * height;
  const threshold = clamp(params.seaLevel, 0, 1);
  const minIslandTiles = Math.max(0, Math.floor(params.minIslandTiles));
  const minLakeTiles = Math.max(0, Math.floor(params.minLakeTiles));
  const macroInfluence = params.macroInfluence ?? 1;
  const smoothStrength = params.smoothStrength ?? 0;
  const riverThickness = Math.max(1, Math.floor(params.riverThickness ?? 1));

  // 1) Initial height
  const heights = new Float32Array(size);
  const baseNoise = new PerlinNoise(`${seed}:1234`);
  const baseFrequency = 6;
  for (let y = 0; y < height; y++) {
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const idx = y * width + x;
      const value = samplePerlin01(
        baseNoise,
        baseFrequency * nx,
        baseFrequency * ny,
      );
      heights[idx] = Math.max(0, value - 0.2);
    }
  }

  // 2) Add roughness (10 passes)
  for (let r = 0; r < 10; r++) {
    const roughNoise = new PerlinNoise(`${seed}:${1234 + 9999 + 1234 * r}`);
    const frequency = baseFrequency * (2 + 1.5 * r);
    for (let y = 0; y < height; y++) {
      const ny = y / height;
      for (let x = 0; x < width; x++) {
        const nx = x / width;
        const idx = y * width + x;
        const rough = samplePerlin01(
          roughNoise,
          frequency * nx,
          frequency * ny,
        );
        heights[idx] = clamp(heights[idx] + 0.18 * (rough - 0.5), 0, 1);
      }
    }
  }

  // 3) Multiply by macro noise
  const macroNoise = new PerlinNoise(`${seed}:${1234 + 123456}`);
  const macroFrequency = baseFrequency * 0.8;
  const macroGain = 3 * macroInfluence;
  for (let y = 0; y < height; y++) {
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const idx = y * width + x;
      const g = samplePerlin01(
        macroNoise,
        macroFrequency * nx,
        macroFrequency * ny,
      );
      const factor = 1 + macroGain * (g - 0.5);
      heights[idx] = clamp(heights[idx] * factor, 0, 1);
    }
  }

  // 4) coarse smooth (strength configurable, fixed scale)
  if (smoothStrength > 0) {
    applyCoarseSmoothing(heights, width, height, 0.08, smoothStrength);
  }

  // 5) Pre-cleaning
  cleanHeightsByThreshold(
    heights,
    width,
    height,
    threshold,
    minLakeTiles,
    minIslandTiles,
  );

  // 6) Carve a few random meandering rivers.
  carveRandomRivers(heights, width, height, threshold, seed, riverThickness);

  // 7) Fill large inland seas that are not connected to edge ocean.
  fillDisconnectedWater(heights, width, height, threshold);

  const type = new Uint8Array(size);
  const magnitude = new Float32Array(size);
  const shoreline = new Uint8Array(size);
  const ocean = new Uint8Array(size);

  for (let i = 0; i < size; i++) {
    const h = heights[i];
    if (h >= threshold) {
      type[i] = LAND;
      const denom = Math.max(0.0001, 1 - threshold);
      magnitude[i] = clamp(((h - threshold) / denom) * 31, 0, 31);
    } else {
      type[i] = WATER;
      magnitude[i] = 0;
    }
  }

  return { width, height, type, magnitude, shoreline, ocean };
}

function samplePerlin01(noise: PerlinNoise, x: number, y: number): number {
  return clamp((noise.noise(x, y) + 1) / 2, 0, 1);
}

function terrainFromHeightThreshold(
  heights: Float32Array,
  width: number,
  height: number,
  threshold: number,
): TerrainGrid {
  const type = new Uint8Array(heights.length);
  for (let i = 0; i < heights.length; i++) {
    type[i] = heights[i] >= threshold ? LAND : WATER;
  }
  return {
    width,
    height,
    type,
    magnitude: new Float32Array(heights.length),
    shoreline: new Uint8Array(heights.length),
    ocean: new Uint8Array(heights.length),
  };
}

function cleanHeightsByThreshold(
  heights: Float32Array,
  width: number,
  height: number,
  threshold: number,
  minWaterTiles: number,
  minLandTiles: number,
): void {
  if (minWaterTiles > 0) {
    const waterGrid = terrainFromHeightThreshold(
      heights,
      width,
      height,
      threshold,
    );
    const waterComponents = labelComponents(waterGrid, WATER);
    for (let i = 0; i < waterGrid.type.length; i++) {
      if (waterGrid.type[i] !== WATER) {
        continue;
      }
      const componentId = waterComponents.componentByTile[i];
      if (
        componentId >= 0 &&
        waterComponents.componentSizes[componentId] <= minWaterTiles
      ) {
        heights[i] = threshold;
      }
    }
  }

  if (minLandTiles > 0) {
    const landGrid = terrainFromHeightThreshold(
      heights,
      width,
      height,
      threshold,
    );
    const landComponents = labelComponents(landGrid, LAND);
    for (let i = 0; i < landGrid.type.length; i++) {
      if (landGrid.type[i] !== LAND) {
        continue;
      }
      const componentId = landComponents.componentByTile[i];
      if (
        componentId >= 0 &&
        landComponents.componentSizes[componentId] <= minLandTiles
      ) {
        heights[i] = 0;
      }
    }
  }
}

function carveRandomRivers(
  heights: Float32Array,
  width: number,
  height: number,
  threshold: number,
  seed: string,
  riverThickness: number,
): void {
  const size = width * height;
  const random = new PseudoRandom(simpleHash(`${seed}:rivers`));
  const riverCount = Math.max(4, Math.min(18, Math.floor(size / 500000)));
  const selectedSources: number[] = [];
  const minSpacing = Math.max(20, Math.floor(Math.min(width, height) * 0.08));
  const minSpacingSq = minSpacing * minSpacing;
  const xMargin = Math.min(
    Math.max(2, Math.floor(width * 0.08)),
    Math.floor((width - 1) / 2),
  );
  const yMargin = Math.min(
    Math.max(2, Math.floor(height * 0.08)),
    Math.floor((height - 1) / 2),
  );
  const minX = xMargin;
  const maxXExclusive = Math.max(minX + 1, width - xMargin);
  const minY = yMargin;
  const maxYExclusive = Math.max(minY + 1, height - yMargin);
  const farEnough = (tile: number): boolean => {
    const tx = tile % width;
    const ty = Math.floor(tile / width);
    for (const selected of selectedSources) {
      const sx = selected % width;
      const sy = Math.floor(selected / width);
      const dx = tx - sx;
      const dy = ty - sy;
      if (dx * dx + dy * dy < minSpacingSq) {
        return false;
      }
    }
    return true;
  };

  const maxAttempts = riverCount * 250;
  let attempts = 0;
  while (selectedSources.length < riverCount && attempts++ < maxAttempts) {
    const x = random.nextInt(minX, maxXExclusive);
    const y = random.nextInt(minY, maxYExclusive);
    const candidate = y * width + x;
    if (!farEnough(candidate)) {
      continue;
    }
    selectedSources.push(candidate);
  }
  if (selectedSources.length === 0) {
    const fallbackX = random.nextInt(minX, maxXExclusive);
    const fallbackY = random.nextInt(minY, maxYExclusive);
    selectedSources.push(fallbackY * width + fallbackX);
  }

  for (let i = 0; i < selectedSources.length; i++) {
    const start = selectedSources[i];
    const riverRandom = new PseudoRandom(
      simpleHash(`${seed}:river:${i}:${start}`),
    );
    carveSingleRandomRiver(
      heights,
      width,
      height,
      threshold,
      riverThickness,
      start,
      riverRandom,
    );
  }
}

function carveSingleRandomRiver(
  heights: Float32Array,
  width: number,
  height: number,
  threshold: number,
  riverThickness: number,
  startTile: number,
  random: PseudoRandom,
): void {
  const riverHeight = Math.max(0, threshold - 0.028);
  const mapLength = Math.max(width, height);
  const maxSteps = mapLength + random.nextInt(0, mapLength + 1);
  const tinyTurnRadians = Math.PI / 45; // about 4 deg per tile

  let posX = (startTile % width) + 0.5;
  let posY = Math.floor(startTile / width) + 0.5;
  let heading = random.nextFloat(-Math.PI, Math.PI);

  for (let step = 0; step < maxSteps; step++) {
    posX += Math.cos(heading);
    posY += Math.sin(heading);
    if (posX < 0 || posX >= width || posY < 0 || posY >= height) {
      break;
    }

    const x = clamp(Math.floor(posX), 0, width - 1);
    const y = clamp(Math.floor(posY), 0, height - 1);
    carveRiverBrush(heights, width, height, x, y, riverHeight, riverThickness);

    heading = normalizeAngle(
      heading + random.nextFloat(-tinyTurnRadians, tinyTurnRadians),
    );
  }
}

function carveRiverBrush(
  heights: Float32Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  riverHeight: number,
  riverThickness: number,
): void {
  const radius = Math.max(0.5, riverThickness / 2);
  const radiusSq = radius * radius;
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > radiusSq) {
        continue;
      }
      const idx = y * width + x;
      heights[idx] = Math.min(heights[idx], riverHeight);
    }
  }
}

function fillDisconnectedWater(
  heights: Float32Array,
  width: number,
  height: number,
  threshold: number,
): void {
  const grid = terrainFromHeightThreshold(heights, width, height, threshold);
  const { componentByTile, componentSizes } = labelComponents(grid, WATER);
  if (componentSizes.length === 0) {
    return;
  }

  const oceanConnected = new Uint8Array(componentSizes.length);
  for (let x = 0; x < width; x++) {
    const top = x;
    const bottom = (height - 1) * width + x;
    if (grid.type[top] === WATER) {
      oceanConnected[componentByTile[top]] = 1;
    }
    if (grid.type[bottom] === WATER) {
      oceanConnected[componentByTile[bottom]] = 1;
    }
  }
  for (let y = 0; y < height; y++) {
    const left = y * width;
    const right = left + (width - 1);
    if (grid.type[left] === WATER) {
      oceanConnected[componentByTile[left]] = 1;
    }
    if (grid.type[right] === WATER) {
      oceanConnected[componentByTile[right]] = 1;
    }
  }

  let hasOceanConnected = false;
  for (let i = 0; i < oceanConnected.length; i++) {
    if (oceanConnected[i] === 1) {
      hasOceanConnected = true;
      break;
    }
  }
  if (!hasOceanConnected) {
    oceanConnected[getLargestComponentId(componentSizes)] = 1;
  }
  const minDisconnectedSeaTiles = Math.max(
    4000,
    Math.floor(width * height * 0.0025),
  );

  for (let i = 0; i < grid.type.length; i++) {
    if (grid.type[i] !== WATER) {
      continue;
    }
    const componentId = componentByTile[i];
    if (
      componentId >= 0 &&
      oceanConnected[componentId] === 0 &&
      componentSizes[componentId] >= minDisconnectedSeaTiles
    ) {
      heights[i] = threshold;
    }
  }
}

function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let wrapped = angle % twoPi;
  if (wrapped <= -Math.PI) {
    wrapped += twoPi;
  }
  if (wrapped > Math.PI) {
    wrapped -= twoPi;
  }
  return wrapped;
}

function applyCoarseSmoothing(
  heights: Float32Array,
  width: number,
  height: number,
  scale: number,
  blend: number,
): void {
  if (blend <= 0 || scale <= 0 || width < 2 || height < 2) {
    return;
  }
  const coarseWidth = Math.max(2, Math.floor(width * scale));
  const coarseHeight = Math.max(2, Math.floor(height * scale));
  const coarse = new Float32Array(coarseWidth * coarseHeight);

  for (let cy = 0; cy < coarseHeight; cy++) {
    const y0 = Math.floor((cy * height) / coarseHeight);
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * height) / coarseHeight));
    for (let cx = 0; cx < coarseWidth; cx++) {
      const x0 = Math.floor((cx * width) / coarseWidth);
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * width) / coarseWidth));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1 && y < height; y++) {
        for (let x = x0; x < x1 && x < width; x++) {
          sum += heights[y * width + x];
          count++;
        }
      }
      coarse[cy * coarseWidth + cx] = count === 0 ? 0 : sum / count;
    }
  }

  const keepWeight = 1 - blend;
  for (let y = 0; y < height; y++) {
    const sampleY = (y / Math.max(1, height - 1)) * (coarseHeight - 1);
    for (let x = 0; x < width; x++) {
      const sampleX = (x / Math.max(1, width - 1)) * (coarseWidth - 1);
      const smooth = bilinearSample(
        coarse,
        coarseWidth,
        coarseHeight,
        sampleX,
        sampleY,
      );
      const idx = y * width + x;
      heights[idx] = clamp(heights[idx] * keepWeight + smooth * blend, 0, 1);
    }
  }
}

function bilinearSample(
  grid: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const v00 = grid[y0 * width + x0];
  const v10 = grid[y0 * width + x1];
  const v01 = grid[y1 * width + x0];
  const v11 = grid[y1 * width + x1];
  const v0 = v00 + (v10 - v00) * tx;
  const v1 = v01 + (v11 - v01) * tx;
  return v0 + (v1 - v0) * ty;
}

function processWater(grid: TerrainGrid, minLakeTiles: number): void {
  for (let i = 0; i < grid.shoreline.length; i++) {
    grid.shoreline[i] = 0;
    grid.ocean[i] = 0;
  }

  if (minLakeTiles > 1) {
    removeSmallLakes(grid, minLakeTiles);
  }
  markOceanTiles(grid);
  markShorelines(grid);
  setWaterDistanceMagnitude(grid);
}

function removeSmallLakes(grid: TerrainGrid, minLakeTiles: number): void {
  const { componentByTile, componentSizes } = labelComponents(grid, WATER);
  if (componentSizes.length === 0) {
    return;
  }
  const largestComponentId = getLargestComponentId(componentSizes);
  for (let i = 0; i < grid.type.length; i++) {
    if (grid.type[i] !== WATER) {
      continue;
    }
    const componentId = componentByTile[i];
    if (
      componentId >= 0 &&
      componentId !== largestComponentId &&
      componentSizes[componentId] < minLakeTiles
    ) {
      grid.type[i] = LAND;
      grid.magnitude[i] = 0;
    }
  }
}

function markOceanTiles(grid: TerrainGrid): void {
  const { componentByTile, componentSizes } = labelComponents(grid, WATER);
  if (componentSizes.length === 0) {
    return;
  }
  const largestComponentId = getLargestComponentId(componentSizes);
  for (let i = 0; i < grid.type.length; i++) {
    if (grid.type[i] === WATER && componentByTile[i] === largestComponentId) {
      grid.ocean[i] = 1;
    }
  }
}

function markShorelines(grid: TerrainGrid): void {
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const idx = y * grid.width + x;
      const isLand = grid.type[idx] === LAND;
      let hasLandNeighbor = false;
      let hasWaterNeighbor = false;

      if (x > 0) {
        if (grid.type[idx - 1] === LAND) hasLandNeighbor = true;
        else hasWaterNeighbor = true;
      }
      if (x < grid.width - 1) {
        if (grid.type[idx + 1] === LAND) hasLandNeighbor = true;
        else hasWaterNeighbor = true;
      }
      if (y > 0) {
        if (grid.type[idx - grid.width] === LAND) hasLandNeighbor = true;
        else hasWaterNeighbor = true;
      }
      if (y < grid.height - 1) {
        if (grid.type[idx + grid.width] === LAND) hasLandNeighbor = true;
        else hasWaterNeighbor = true;
      }

      if (isLand && hasWaterNeighbor) {
        grid.shoreline[idx] = 1;
      } else if (!isLand && hasLandNeighbor) {
        grid.shoreline[idx] = 1;
      }
    }
  }
}

function setWaterDistanceMagnitude(grid: TerrainGrid): void {
  const visited = new Uint8Array(grid.type.length);
  const queue: number[] = [];
  let head = 0;

  for (let i = 0; i < grid.type.length; i++) {
    if (grid.type[i] === WATER) {
      grid.magnitude[i] = 0;
      if (grid.shoreline[i] === 1) {
        visited[i] = 1;
        queue.push(i);
      }
    }
  }

  if (queue.length === 0) {
    for (let i = 0; i < grid.type.length; i++) {
      if (grid.type[i] === WATER) {
        grid.magnitude[i] = 31;
      }
    }
    return;
  }

  while (head < queue.length) {
    const idx = queue[head++];
    const nextDist = grid.magnitude[idx] + 1;
    const x = idx % grid.width;
    const y = Math.floor(idx / grid.width);

    if (x > 0) {
      const n = idx - 1;
      if (grid.type[n] === WATER && visited[n] === 0) {
        visited[n] = 1;
        grid.magnitude[n] = nextDist;
        queue.push(n);
      }
    }
    if (x < grid.width - 1) {
      const n = idx + 1;
      if (grid.type[n] === WATER && visited[n] === 0) {
        visited[n] = 1;
        grid.magnitude[n] = nextDist;
        queue.push(n);
      }
    }
    if (y > 0) {
      const n = idx - grid.width;
      if (grid.type[n] === WATER && visited[n] === 0) {
        visited[n] = 1;
        grid.magnitude[n] = nextDist;
        queue.push(n);
      }
    }
    if (y < grid.height - 1) {
      const n = idx + grid.width;
      if (grid.type[n] === WATER && visited[n] === 0) {
        visited[n] = 1;
        grid.magnitude[n] = nextDist;
        queue.push(n);
      }
    }
  }
}

function downscaleTerrain(grid: TerrainGrid): TerrainGrid {
  const width = grid.width / 2;
  const height = grid.height / 2;
  const type = new Uint8Array(width * height);
  const magnitude = new Float32Array(width * height);
  const shoreline = new Uint8Array(width * height);
  const ocean = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i0 = 2 * y * grid.width + 2 * x;
      const i1 = i0 + 1;
      const i2 = i0 + grid.width;
      const i3 = i2 + 1;
      const target = y * width + x;

      const src = [i0, i1, i2, i3];
      const hasWater = src.some((idx) => grid.type[idx] === WATER);

      if (hasWater) {
        type[target] = WATER;
        magnitude[target] = Math.max(
          ...src
            .filter((idx) => grid.type[idx] === WATER)
            .map((idx) => grid.magnitude[idx]),
          0,
        );
      } else {
        type[target] = LAND;
        magnitude[target] =
          (grid.magnitude[i0] +
            grid.magnitude[i1] +
            grid.magnitude[i2] +
            grid.magnitude[i3]) /
          4;
      }
    }
  }

  return { width, height, type, magnitude, shoreline, ocean };
}

function packTerrain(grid: TerrainGrid): Uint8Array {
  const packed = new Uint8Array(grid.type.length);

  for (let i = 0; i < grid.type.length; i++) {
    let b = 0;
    const isLand = grid.type[i] === LAND;
    if (isLand) b |= 0b10000000;
    if (grid.shoreline[i] === 1) b |= 0b01000000;
    if (grid.ocean[i] === 1) b |= 0b00100000;

    const mag = isLand
      ? clamp(Math.ceil(grid.magnitude[i]), 0, 31)
      : clamp(Math.ceil(grid.magnitude[i] / 2), 0, 31);
    b |= mag;
    packed[i] = b;
  }

  return packed;
}

function countLandTiles(grid: TerrainGrid): number {
  let land = 0;
  for (let i = 0; i < grid.type.length; i++) {
    if (grid.type[i] === LAND) land++;
  }
  return land;
}

function generateNations(
  terrain: TerrainGrid,
  nationCountHint: number | undefined,
  seed: string,
): Array<{ coordinates: [number, number]; flag: string; name: string }> {
  const landTiles: number[] = [];
  for (let i = 0; i < terrain.type.length; i++) {
    if (terrain.type[i] === LAND) {
      landTiles.push(i);
    }
  }

  if (landTiles.length === 0) {
    return [];
  }

  const defaultCount = clamp(Math.floor(landTiles.length / 40000), 8, 80);
  const targetCount = Math.min(
    landTiles.length,
    Math.max(1, nationCountHint ?? defaultCount),
  );
  const random = new PseudoRandom(simpleHash(`${seed}:nations`));

  const selected: number[] = [];
  const selectedSet = new Set<number>();
  const minDist = Math.max(
    6,
    Math.floor(
      Math.sqrt((terrain.width * terrain.height) / targetCount) * 0.35,
    ),
  );
  const minDist2 = minDist * minDist;
  const maxAttempts = Math.max(landTiles.length * 4, targetCount * 20);

  for (
    let attempt = 0;
    attempt < maxAttempts && selected.length < targetCount;
    attempt++
  ) {
    const candidate = landTiles[random.nextInt(0, landTiles.length)];
    if (selectedSet.has(candidate)) {
      continue;
    }
    const cx = candidate % terrain.width;
    const cy = Math.floor(candidate / terrain.width);
    let farEnough = true;
    for (const existing of selected) {
      const ex = existing % terrain.width;
      const ey = Math.floor(existing / terrain.width);
      const dx = ex - cx;
      const dy = ey - cy;
      if (dx * dx + dy * dy < minDist2) {
        farEnough = false;
        break;
      }
    }
    if (farEnough) {
      selected.push(candidate);
      selectedSet.add(candidate);
    }
  }

  while (selected.length < targetCount) {
    const candidate = landTiles[random.nextInt(0, landTiles.length)];
    if (selectedSet.has(candidate)) {
      continue;
    }
    selected.push(candidate);
    selectedSet.add(candidate);
  }

  return selected.map((tile, index) => {
    const x = tile % terrain.width;
    const y = Math.floor(tile / terrain.width);
    return {
      coordinates: [x, y] as [number, number],
      flag: "jp",
      name: `Nation ${index + 1}`,
    };
  });
}

function labelComponents(
  grid: TerrainGrid,
  targetType: typeof LAND | typeof WATER,
): { componentByTile: Int32Array; componentSizes: number[] } {
  const componentByTile = new Int32Array(grid.type.length).fill(-1);
  const componentSizes: number[] = [];
  const queue: number[] = [];

  for (let i = 0; i < grid.type.length; i++) {
    if (grid.type[i] !== targetType || componentByTile[i] !== -1) {
      continue;
    }
    const componentId = componentSizes.length;
    let size = 0;
    let head = 0;
    queue.length = 0;
    queue.push(i);
    componentByTile[i] = componentId;

    while (head < queue.length) {
      const idx = queue[head++];
      size++;
      const x = idx % grid.width;
      const y = Math.floor(idx / grid.width);

      if (x > 0) {
        const n = idx - 1;
        if (grid.type[n] === targetType && componentByTile[n] === -1) {
          componentByTile[n] = componentId;
          queue.push(n);
        }
      }
      if (x < grid.width - 1) {
        const n = idx + 1;
        if (grid.type[n] === targetType && componentByTile[n] === -1) {
          componentByTile[n] = componentId;
          queue.push(n);
        }
      }
      if (y > 0) {
        const n = idx - grid.width;
        if (grid.type[n] === targetType && componentByTile[n] === -1) {
          componentByTile[n] = componentId;
          queue.push(n);
        }
      }
      if (y < grid.height - 1) {
        const n = idx + grid.width;
        if (grid.type[n] === targetType && componentByTile[n] === -1) {
          componentByTile[n] = componentId;
          queue.push(n);
        }
      }
    }
    componentSizes.push(size);
  }

  return { componentByTile, componentSizes };
}

function getLargestComponentId(componentSizes: number[]): number {
  let largestId = 0;
  let largestSize = componentSizes[0] ?? 0;
  for (let i = 1; i < componentSizes.length; i++) {
    if (componentSizes[i] > largestSize) {
      largestSize = componentSizes[i];
      largestId = i;
    }
  }
  return largestId;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sha256Hex(data: Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => canonicalize(v));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, canonicalize(v)]);
    return Object.fromEntries(entries);
  }
  return value;
}

function computeMapId(
  request: ResolveGeneratedMapRequest,
  normalizedParams: GeneratedMapParams,
): string {
  const canonicalInput = canonicalize({
    mapAlgorithmRevision: MAP_ALGORITHM_REVISION,
    generator: request.generator,
    generatorVersion: request.generatorVersion,
    seed: request.seed,
    params: normalizedParams,
  });
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalInput))
    .digest("hex");
}
