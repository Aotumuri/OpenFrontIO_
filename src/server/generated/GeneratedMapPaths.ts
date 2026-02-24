import os from "os";
import path from "path";

const GENERATED_MAPS_SUBDIR = "openfront-generated-maps";

export function generatedMapsRootDir(): string {
  return path.join(os.tmpdir(), GENERATED_MAPS_SUBDIR);
}
