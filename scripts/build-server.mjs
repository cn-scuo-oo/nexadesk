import { build } from "esbuild";
import { rm } from "node:fs/promises";

await rm("apps/server/dist", { recursive: true, force: true });

await build({
  entryPoints: ["apps/server/src/index.ts"],
  outfile: "apps/server/dist/index.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: false,
  packages: "bundle"
});
