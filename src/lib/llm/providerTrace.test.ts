import assert from "node:assert/strict";
import test from "node:test";
import { tracedLlmFetch, withLlmProviderTrace, type LlmProviderExchange } from "./providerTrace";

test("provider diagnostics isolate concurrent callers, preserve responses and omit credentials", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => new Response(init?.body as string, { headers: { "content-type": "application/json" } });
  try {
    const left: LlmProviderExchange[] = [];
    const right: LlmProviderExchange[] = [];
    const call = (id: string) => tracedLlmFetch("https://api.example.test/v1/chat?token=secret", {
      method: "POST", headers: { Authorization: "Bearer secret" }, body: JSON.stringify({ id }),
    });
    const responses = await Promise.all([
      withLlmProviderTrace(value => left.push(value), () => call("left")),
      withLlmProviderTrace(value => right.push(value), () => call("right")),
      call("unobserved"),
    ]);
    assert.deepEqual(left.map(value => value.request), [{ id: "left" }]);
    assert.deepEqual(right.map(value => value.response), [{ id: "right" }]);
    assert.equal(left[0].endpoint, "https://api.example.test/v1/chat");
    assert.equal(JSON.stringify([...left, ...right]).includes("secret"), false);
    assert.deepEqual(await responses[0].json(), { id: "left" });
    const response = await withLlmProviderTrace(() => { throw new Error("observer failed"); }, () => call("intact"));
    assert.deepEqual(await response.json(), { id: "intact" });
  } finally { globalThis.fetch = original; }
});
