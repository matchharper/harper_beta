import test from "node:test";
import assert from "node:assert/strict";
import { inspectAshbyForm } from "./ashbyFormInspection";
import {
  inspectApplicationForm,
  FORM_INSPECTION_TIMEOUT_MS,
} from "./applicationFormInspection";
import type { agentsRequest } from "./agentsApi";
const entry = (
  title: string,
  type: string,
  path?: string,
  isHidden = false
) => ({
  field: { title, type, path },
  isRequired: true,
  descriptionHtml: "Exact instructions",
  isHidden,
});
const payload = {
  data: {
    jobPosting: {
      applicationForm: {
        sections: [
          {
            title: null,
            isHidden: false,
            fieldEntries: [
              entry("Why join?", "LongText"),
              entry("Cover letter", "File", "_systemfield_cover_letter"),
              entry("Work sample", "Url"),
              entry("Name", "String", "_systemfield_name"),
              entry("Work authorization", "Boolean"),
              entry("Secret conditional essay", "LongText", undefined, true),
            ],
          },
        ],
      },
    },
  },
};
test("Ashby direct read retains the full public inventory and leaves preparation judgment to analysis", async () => {
  const request: typeof fetch = async (_url, init) => {
    assert.equal(init?.method, "POST");
    assert.match(String(init?.body), /query ApiJobPosting/);
    return Response.json(payload);
  };
  const result = await inspectAshbyForm(
    new URL("https://jobs.ashbyhq.com/org/id/application"),
    AbortSignal.timeout(1000),
    request
  );
  assert.deepEqual(
    result?.fields.map((f) => f.label),
    ["Why join?", "Cover letter", "Work sample", "Name", "Work authorization"]
  );
  assert.equal(result?.status, "partial");
});
test("fast path avoids hosted session creation while the fallback has a three-minute budget", async () => {
  const result = await inspectApplicationForm(
    "https://jobs.ashbyhq.com/org/id",
    undefined,
    {
      fetch: async () => Response.json(payload),
      request: (async () => {
        throw new Error("Must not start a browser");
      }) as typeof agentsRequest,
    }
  );
  assert.equal(result.fields.length, 5);
  assert.equal(FORM_INSPECTION_TIMEOUT_MS, 180000);
});
test("changed public schema and unsupported sites fall back rather than claiming no materials", async () => {
  assert.equal(
    await inspectAshbyForm(
      new URL("https://jobs.ashbyhq.com/org/id/application"),
      AbortSignal.timeout(1000),
      async () => Response.json({ data: {} })
    ),
    null
  );
  assert.equal(
    await inspectAshbyForm(
      new URL("https://example.com/application"),
      AbortSignal.timeout(1000)
    ),
    null
  );
});
