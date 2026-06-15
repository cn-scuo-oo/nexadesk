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
  // packages: "bundle",
  external: ["better-sqlite3", "node:child_process", "node:readline", "node:crypto", "node:fs", "node:path", "node:os", "node:url", "node:net", "node:tls", "node:http", "node:https", "node:stream", "node:events", "node:util", "node:string_decoder", "node:buffer", "node:timers", "node:zlib", "node:querystring"]
});
