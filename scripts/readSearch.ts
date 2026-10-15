/** Read-only local invocation; intentionally not registered in the company agent. */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { formatSearchText, readSearchData } from "./lib/readSearch";

config({ path: ".env.local", quiet: true });
const option = (name: string) => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main() {
  process.umask(0o077);
  const input = option("input");
  if (input) {
    const original = readFileSync(path.resolve(input), "utf8");
    const formatted = formatSearchText(JSON.parse(original));
    const output = path.resolve(input).replace(/\.json$/, "") + ".txt";
    writeFileSync(output, formatted + "\n", { mode: 0o600, flag: "wx" });
    process.stdout.write(formatted + "\n");
    process.stderr.write(`Saved exact text: ${output}\nCharacters: ${original.trimEnd().length} → ${formatted.length}\n`);
    return;
  }
  const workspaceId = option("workspace"), roleId = option("role");
  if (!workspaceId || !roleId) throw new Error("Use --workspace=<uuid> --role=<uuid> [--search=<uuid>] [--samples=3]");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing server database configuration");
  // Defense in depth: this process can only GET/HEAD the configured Data API.
  const origin = new URL(url).origin;
  const readOnlyFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const target = new URL(request.url);
    if (target.origin !== origin || !target.pathname.startsWith("/rest/v1/") ||
        target.pathname.startsWith("/rest/v1/rpc/") || !["GET", "HEAD"].includes(request.method)) {
      throw new Error("read_search preview blocked a non-read request");
    }
    return fetch(request, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  };
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: readOnlyFetch } });
  const result = await readSearchData({ admin, workspaceId, roleId, searchRef: option("search"), sampleLimit: Number(option("samples") ?? 3) });
  const raw = JSON.stringify(result, null, 2) + "\n";
  const dir = path.resolve(".local/read-search");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const filename = `${roleId}-${new Date().toISOString().replaceAll(":", "-")}.json`;
  writeFileSync(path.join(dir, filename), raw, { mode: 0o600, flag: "wx" });
  const formatted = formatSearchText(result);
  const textPath = path.join(dir, filename.replace(/\.json$/, ".txt"));
  writeFileSync(textPath, formatted + "\n", { mode: 0o600, flag: "wx" });
  process.stdout.write(formatted + "\n");
  process.stderr.write(`Saved internal data: ${path.join(dir, filename)}\nSaved exact text: ${textPath}\n`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
