import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "src/lib/resumes/assetManifest.json");
const integrity = bytes => `sha384-${createHash("sha384").update(bytes).digest("base64")}`;

// Copy every bundled face. The browser's normal unicode-range selection decides
// which files to load; no document text or glyph filtering enters this build.
export async function prepareResumeAssets({ updateManifest = false, outputRoot = path.join(root, "public/resume-assets") } = {}) {
  const fonts = path.join(root, "node_modules/@fontsource/noto-sans-kr");
  const files = new Map();
  for (const weight of [400, 700]) {
    const css = (await readFile(path.join(fonts, `${weight}.css`), "utf8"))
      .replace(/, url\([^)]*\.woff\) format\('woff'\)/g, "");
    files.set(`${weight}.css`, Buffer.from(css));
    for (const match of css.matchAll(/url\(\.\/files\/([^)]*\.woff2)\)/g))
      files.set(`files/${match[1]}`, await readFile(path.join(fonts, "files", match[1])));
  }
  files.set("paged.min.js", await readFile(path.join(root, "node_modules/pagedjs/dist/paged.min.js")));
  const hashes = [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, bytes]) =>
    [name, createHash("sha256").update(bytes).digest("hex")]);
  const version = createHash("sha256").update(JSON.stringify(hashes)).digest("hex");
  const manifest = { version, styles: [400, 700].map(w => ({ file: `${w}.css`, integrity: integrity(files.get(`${w}.css`)) })),
    script: { file: "paged.min.js", integrity: integrity(files.get("paged.min.js")) } };
  if (updateManifest) await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  else if (JSON.stringify(JSON.parse(await readFile(manifestPath, "utf8"))) !== JSON.stringify(manifest))
    throw new Error("Resume asset bytes changed. Review the font/pagination update, then regenerate assetManifest.json explicitly.");
  const directory = path.join(outputRoot, version);
  await mkdir(path.join(directory, "files"), { recursive: true });
  await Promise.all([...files].map(async ([name, bytes]) => {
    const target = path.join(directory, name);
    const existing = await readFile(target).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (existing?.equals(bytes)) return;
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, target);
  }));
  return { manifest, directory, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareResumeAssets({ updateManifest: process.argv.includes("--update-manifest") })
    .then(result => console.log(`Prepared ${result.files.size} unchanged resume assets: ${result.manifest.version}`))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
