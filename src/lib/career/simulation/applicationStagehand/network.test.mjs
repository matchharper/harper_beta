import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("hosted WebSocket connections use the executor proxy without replacing explicit agents", () => {
  const requests = [];
  const https = { request: (...args) => requests.push(args) };
  class ProxyAgent { constructor(url) { this.url = url; } }
  vm.runInNewContext(readFileSync(new URL("./network.cjs", import.meta.url), "utf8"), {
    process: { env: { HTTPS_PROXY: "http://executor-proxy.test" } },
    require: (id) => id === "node:https" ? https : id === "https-proxy-agent"
      ? { HttpsProxyAgent: ProxyAgent }
      : { EnvHttpProxyAgent: ProxyAgent, setGlobalDispatcher: () => {} },
  });
  https.request({ headers: { Upgrade: "websocket" } });
  assert.equal(requests[0][0].agent.url, "http://executor-proxy.test");
  const agent = {};
  https.request({ headers: { Upgrade: "websocket" }, agent });
  assert.equal(requests[1][0].agent, agent);
  const normal = { headers: {} };
  https.request(normal);
  assert.equal(requests[2][0], normal);
});
