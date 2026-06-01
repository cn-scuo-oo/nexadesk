import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rcedit } from "rcedit";

export default async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  await applyWindowsBrand({
    appOutDir: context.appOutDir,
    rootDir: context.packager.projectDir,
    productName: context.packager.appInfo.productName,
    version: context.packager.appInfo.version
  });
}

async function applyWindowsBrand({ appOutDir, rootDir, productName, version }) {
  const exePath = resolveAppExe(appOutDir, productName);
  const iconPath = join(rootDir, "build-resources", "icon.ico");

  for (const requiredPath of [exePath, iconPath]) {
    if (!existsSync(requiredPath)) {
      throw new Error(`Windows brand resource not found: ${requiredPath}`);
    }
  }

  await rcedit(exePath, {
    icon: iconPath,
    "file-version": version,
    "product-version": version,
    "version-string": {
      CompanyName: "NexaDesk Contributors",
      FileDescription: "NexaDesk multi-agent desktop workbench",
      ProductName: "NexaDesk",
      InternalName: "NexaDesk",
      OriginalFilename: "NexaDesk.exe",
      LegalCopyright: "Copyright (C) 2026 NexaDesk Contributors"
    }
  });
}

function resolveAppExe(appOutDir, productName) {
  const expectedPath = join(appOutDir, `${productName}.exe`);
  if (existsSync(expectedPath)) {
    return expectedPath;
  }

  const exeName = readdirSync(appOutDir).find((name) => name.toLowerCase().endsWith(".exe"));
  if (!exeName) {
    throw new Error(`No Windows executable found in ${appOutDir}`);
  }
  return join(appOutDir, exeName);
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isCli) {
  const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
  await applyWindowsBrand({
    appOutDir: resolve(process.argv[2] ?? join(rootDir, "release", "win-unpacked")),
    rootDir,
    productName: packageJson.build?.productName ?? packageJson.name,
    version: packageJson.version
  });
}

