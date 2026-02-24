import { z } from "zod";
import {
  GameConfigSchema,
  GeneratedMapParamsSchema,
  GeneratedMapRefSchema,
} from "./Schemas";
import { GameMapType } from "./game/Game";

export const CreateGameInputSchema = GameConfigSchema.or(
  z
    .object({})
    .strict()
    .transform((val) => undefined),
);

export const GameInputSchema = GameConfigSchema.partial();

const GeneratedMapMetadataSchema = z.object({
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  num_land_tiles: z.number().int().min(0),
});

const GeneratedMapNationSchema = z.object({
  coordinates: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  flag: z.string().min(1).max(128),
  name: z.string().min(1).max(64),
});

export const GeneratedMapManifestSchema = z.object({
  name: z.string().min(1).max(128),
  map: GeneratedMapMetadataSchema,
  map4x: GeneratedMapMetadataSchema,
  map16x: GeneratedMapMetadataSchema,
  nations: z.array(GeneratedMapNationSchema),
});

export const ResolveGeneratedMapRequestSchema = z.object({
  generator: z.literal("perlin_islands"),
  generatorVersion: z.literal(1),
  seed: z.string().min(1).max(256),
  params: GeneratedMapParamsSchema,
});

export const ResolveGeneratedMapResponseSchema = z.object({
  mapRef: GeneratedMapRefSchema,
  manifest: GeneratedMapManifestSchema,
  thumbnailPath: z.string().min(1),
  fallbackGameMap: z.enum(GameMapType),
});

export type ResolveGeneratedMapRequest = z.infer<
  typeof ResolveGeneratedMapRequestSchema
>;
export type ResolveGeneratedMapResponse = z.infer<
  typeof ResolveGeneratedMapResponseSchema
>;
