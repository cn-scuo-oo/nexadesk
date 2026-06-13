import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { build } from "esbuild";
import { rm } from "node:fs/promises";
import { join } from "node:path";

await rm("apps/server/dist", { recursive: true, force: true });

await build({
  entryPoints: ["apps/server/src/index.ts"],
  outfile: "apps/server/dist/index.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: false,
  external: ["better-sqlite3"],
  packages: "bundle"
});

const runtimeNodeModules = ["better-sqlite3", "bindings", "file-uri-to-path"];
const runtimeModulesDir = "apps/server/dist/node_modules";
mkdirSync(runtimeModulesDir, { recursive: true });
for (const moduleName of runtimeNodeModules) {
  cpSync(join("node_modules", moduleName), join(runtimeModulesDir, moduleName), {
    recursive: true,
    force: true
  });
}

await rm("bundled-node", { recursive: true, force: true });
mkdirSync("bundled-node", { recursive: true });
copyFileSync(process.execPath, join("bundled-node", "node.exe"));
