import { getServerConfigFromClient } from "../../core/configuration/ConfigLoader";
import { GameMapSize } from "../../core/game/Game";
import {
  ResolveGeneratedMapRequest,
  ResolveGeneratedMapRequestSchema,
  ResolveGeneratedMapResponse,
  ResolveGeneratedMapResponseSchema,
} from "../../core/WorkerSchemas";

type ResolveGeneratedMapOptions = {
  gameID: string;
  seed: string;
  mapSize: GameMapSize;
  nationCountHint?: number;
};

const paramsByMapSize: Record<
  GameMapSize,
  Omit<ResolveGeneratedMapRequest["params"], "nationCountHint">
> = {
  [GameMapSize.Normal]: {
    width: 2048,
    height: 2048,
    macroInfluence: 1.3,
    smoothStrength: 0.5,
    riverThickness: 2,
    seaLevel: 0.2,
    minIslandTiles: 10000,
    minLakeTiles: 10000,
  },
  [GameMapSize.Compact]: {
    width: 1024,
    height: 1024,
    macroInfluence: 1.1,
    smoothStrength: 0.5,
    riverThickness: 2,
    seaLevel: 0.2,
    minIslandTiles: 10000,
    minLakeTiles: 10000,
  },
};

const requestCache = new Map<string, Promise<ResolveGeneratedMapResponse>>();

export function buildGeneratedMapResolveRequest(
  seed: string,
  mapSize: GameMapSize,
  nationCountHint?: number,
): ResolveGeneratedMapRequest {
  const trimmedSeed = seed.trim();
  if (!trimmedSeed) {
    throw new Error("Generated map seed cannot be empty");
  }

  const baseParams = paramsByMapSize[mapSize];
  const params =
    nationCountHint !== undefined
      ? { ...baseParams, nationCountHint }
      : baseParams;

  return ResolveGeneratedMapRequestSchema.parse({
    generator: "perlin_islands",
    generatorVersion: 1,
    seed: trimmedSeed,
    params,
  });
}

export async function resolveGeneratedMap(
  options: ResolveGeneratedMapOptions,
): Promise<ResolveGeneratedMapResponse> {
  const request = buildGeneratedMapResolveRequest(
    options.seed,
    options.mapSize,
    options.nationCountHint,
  );

  const config = await getServerConfigFromClient();
  const url = `/${config.workerPath(options.gameID)}/api/maps/resolve`;
  const cacheKey = `${url}:${JSON.stringify(request)}`;
  const cached = requestCache.get(cacheKey);
  if (cached) {
    return await cached;
  }

  const pending = (async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to resolve generated map (${response.status}): ${body}`,
      );
    }

    const payload = await response.json();
    return ResolveGeneratedMapResponseSchema.parse(payload);
  })();

  requestCache.set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    requestCache.delete(cacheKey);
    throw error;
  }
}
