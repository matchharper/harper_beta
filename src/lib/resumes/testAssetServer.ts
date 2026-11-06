import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { prepareResumeAssets } from "../../../scripts/prepareResumeAssets.mjs";

/** Local verification only: serves the exact generated public bundle. */
export async function startResumeAssetServer() {
  const { manifest, files } = await prepareResumeAssets();
  const prefix = `/resume-assets/${manifest.version}/`;
  const requests: string[] = [];
  const server = createServer((req, res) => {
    const pathname = new URL(req.url!, "http://localhost").pathname;
    const name = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
    const file = files.get(name);
    if (!file) { res.writeHead(404).end(); return; }
    requests.push(name);
    res.writeHead(200, { "Content-Type": name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "application/javascript" : "font/woff2",
      "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=31536000, immutable" });
    res.end(file);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { origin, requests, files, close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}
