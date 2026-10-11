import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "@/app/api/resume-assets/[version]/route";
import { RESUME_RENDER_VERSION } from "./template";

test("public assets are allowlisted, cacheable and individually below serverless response limits", async () => {
  for (const asset of ["400", "700", "script"]) {
    const response = await GET(
      new Request(`https://example.com/assets?asset=${asset}`),
      { params: Promise.resolve({ version: RESUME_RENDER_VERSION }) }
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /immutable/);
    const text = await response.text();
    assert.ok(Buffer.byteLength(text) < 4_000_000);
    assert.ok(text.length > 1000);
  }
  assert.equal(
    (
      await GET(
        new Request("https://example.com/assets?asset=../../.env.local"),
        { params: Promise.resolve({ version: RESUME_RENDER_VERSION }) }
      )
    ).status,
    404
  );
  assert.equal(
    (
      await GET(new Request("https://example.com/assets?asset=400"), {
        params: Promise.resolve({ version: "old" }),
      })
    ).status,
    404
  );
});
