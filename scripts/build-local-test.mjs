import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist-local-test");
const productionOrigin = "https://vetasist-app.vercel.app";
const localOrigin = "http://127.0.0.1:3000";
const localStorageOrigin = "http://127.0.0.1:54321";

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const skippedEntries = new Set([".git", "dist-local-test", "scripts", "tests", "REMOTE_CHECKS.md"]);
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (skippedEntries.has(entry.name)) continue;
  await cp(path.join(root, entry.name), path.join(output, entry.name), { recursive: true });
}

async function replaceExactlyOnce(relativePath, before, after) {
  const file = path.join(output, relativePath);
  const source = await readFile(file, "utf8");
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${relativePath}: expected one backend endpoint occurrence, found ${occurrences}`);
  }
  await writeFile(file, source.replace(before, after));
}

await replaceExactlyOnce(
  "service_worker.js",
  'const VALIDATE_URL = "https://vetasist-app.vercel.app/api/license/validate";',
  `const VALIDATE_URL = "${localOrigin}/api/license/validate";`,
);
await replaceExactlyOnce(
  "service_worker.js",
  'const TOOL_FETCH_URL = "https://vetasist-app.vercel.app/api/tool/fetch";',
  `const TOOL_FETCH_URL = "${localOrigin}/api/tool/fetch";`,
);
await replaceExactlyOnce(
  "service_worker.js",
  'const EXTENSION_VERSION_URL = "https://vetasist-app.vercel.app/api/extension/version";',
  `const EXTENSION_VERSION_URL = "${localOrigin}/api/extension/version";`,
);
await replaceExactlyOnce(
  "remote-worker.js",
  "const ENDPOINT = 'https://vetasist-app.vercel.app/api/automation/worker';",
  `const ENDPOINT = '${localOrigin}/api/automation/worker';`,
);

const manifestPath = path.join(output, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.name = "VetAssist LOCAL TEST";
manifest.host_permissions = (manifest.host_permissions || [])
  .filter((permission) => !permission.startsWith(productionOrigin))
  .concat(`${localOrigin}/*`, `${localStorageOrigin}/*`);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(target) : [target];
  }));
  return nested.flat();
}

const runtimeFiles = (await listFiles(output)).filter((file) => /\.(js|json)$/i.test(file));
for (const file of runtimeFiles) {
  const contents = await readFile(file, "utf8");
  if (contents.includes(productionOrigin)) {
    throw new Error(`Production backend URL remains in local test package: ${path.relative(output, file)}`);
  }
}

console.log(`Built isolated local test extension at ${output}`);
console.log(`Backend: ${localOrigin}`);
