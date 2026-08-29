import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeOpenUrl,
  openUrlWithDocumentsCache,
} from "@/lib/talentOnboarding/openUrlTool";
import { saveDocumentCache } from "@/lib/tools/documentCache";

function createOpenUrlAdmin(cached: Record<string, unknown> | null = null) {
  let inserted: Record<string, unknown> | null = null;
  const builder = {
    eq() {
      return builder;
    },
    in() {
      return builder;
    },
    insert(value: Record<string, unknown>) {
      inserted = value;
      return builder;
    },
    limit() {
      return builder;
    },
    maybeSingle: async () => ({ data: cached, error: null }),
    order() {
      return builder;
    },
    select() {
      return builder;
    },
    single: async () => ({
      data: { created_at: "2026-08-11T00:00:00.000Z", id: 42 },
      error: null,
    }),
  };

  return {
    admin: {
      from(table: string) {
        assert.equal(table, "documents");
        return builder;
      },
    } as never,
    getInserted: () => inserted,
  };
}

test("canonicalizes LinkedIn job search URLs with currentJobId", () => {
  assert.equal(
    normalizeOpenUrl(
      "https://www.linkedin.com/jobs/search/?keywords=designer&currentJobId=4452474383#details"
    ),
    "https://www.linkedin.com/jobs/view/4452474383"
  );
  assert.equal(
    normalizeOpenUrl(
      "https://kr.linkedin.com/jobs/search?currentJobId=123456789&trackingId=x"
    ),
    "https://kr.linkedin.com/jobs/view/123456789"
  );
});

test("leaves other LinkedIn and non-numeric job search URLs on the general Exa path", () => {
  assert.equal(
    normalizeOpenUrl("https://www.linkedin.com/company/example/#about"),
    "https://www.linkedin.com/company/example/"
  );
  assert.equal(
    normalizeOpenUrl(
      "https://www.linkedin.com/jobs/search/?currentJobId=not-a-job-id"
    ),
    "https://www.linkedin.com/jobs/search/?currentJobId=not-a-job-id"
  );
});

test("returns a documents cache hit without calling Exa", async () => {
  const { admin } = createOpenUrlAdmin({
    created_at: "2026-08-10T00:00:00.000Z",
    excerpt: "Cached excerpt",
    id: 7,
    markdown: "Cached full text",
    title: "Cached title",
    url: "https://example.com/article",
  });
  const result = await openUrlWithDocumentsCache({
    admin,
    exa: {
      getContents: async () => {
        throw new Error("Exa should not be called for a cache hit");
      },
    } as never,
    url: "https://example.com/article",
  });

  assert.equal(result.cached, true);
  assert.equal(result.markdown, "Cached full text");
});

test("gets uncached LinkedIn content from Exa and saves it under the canonical URL", async () => {
  const { admin, getInserted } = createOpenUrlAdmin();
  let requestedUrls: unknown = null;
  let requestedOptions: unknown = null;
  const result = await openUrlWithDocumentsCache({
    admin,
    exa: {
      getContents: async (urls: unknown, options: unknown) => {
        requestedUrls = urls;
        requestedOptions = options;
        return {
          requestId: "request-1",
          results: [
            {
              id: "linkedin-job",
              text: "Full LinkedIn job text from Exa",
              title: "Product Designer",
              url: "https://www.linkedin.com/jobs/view/4452474383",
            },
          ],
        };
      },
    } as never,
    url: "https://www.linkedin.com/jobs/search/?currentJobId=4452474383",
  });

  assert.deepEqual(requestedUrls, [
    "https://www.linkedin.com/jobs/view/4452474383",
  ]);
  assert.deepEqual(requestedOptions, {
    text: { maxCharacters: 20_000 },
  });
  assert.equal(
    getInserted()?.url,
    "https://www.linkedin.com/jobs/view/4452474383"
  );
  assert.equal(getInserted()?.markdown, "Full LinkedIn job text from Exa");
  assert.equal(result.cached, false);
  assert.equal(result.markdown, "Full LinkedIn job text from Exa");
});

test("reads an Ashby JD's official title and description directly before Exa", async () => {
  const { admin, getInserted } = createOpenUrlAdmin();
  let requestedUrl = "";
  const result = await openUrlWithDocumentsCache({
    admin,
    exa: {
      getContents: async () => {
        throw new Error("Exa should not be called for a readable Ashby JD");
      },
    } as never,
    fetcher: async (input) => {
      requestedUrl = String(input);
      return new Response(
        `<html><head><script type="application/ld+json">${JSON.stringify({
          "@context": "https://schema.org/",
          "@type": "JobPosting",
          description:
            "<h2>About the role</h2><p>Own customer AI agent launches.</p>",
          hiringOrganization: {
            "@type": "Organization",
            name: "Sierra",
          },
          title: "Agent Strategist",
        })}</script></head><body></body></html>`,
        {
          headers: { "content-type": "text/html; charset=utf-8" },
          status: 200,
        }
      );
    },
    url: "https://jobs.ashbyhq.com/Sierra/posting-id",
  });

  assert.equal(requestedUrl, "https://jobs.ashbyhq.com/Sierra/posting-id");
  assert.equal(result.title, "Agent Strategist");
  assert.match(result.markdown, /^# Agent Strategist/);
  assert.match(result.markdown, /Company: Sierra/);
  assert.match(result.markdown, /Own customer AI agent launches\./);
  assert.equal(getInserted()?.title, "Agent Strategist");
  assert.match(String(getInserted()?.markdown ?? ""), /# Agent Strategist/);
});

test("updates an existing URL by id without requiring a unique URL constraint", async () => {
  let updated: Record<string, unknown> | null = null;
  let updatedId: unknown = null;
  const getUpdated = (): Record<string, unknown> | null => updated;
  const builder = {
    eq(column: string, value: unknown) {
      if (column === "id") updatedId = value;
      return builder;
    },
    limit() {
      return builder;
    },
    maybeSingle: async () => ({ data: { id: 17 }, error: null }),
    order() {
      return builder;
    },
    select() {
      return builder;
    },
    single: async () => ({
      data: { created_at: "2026-08-12T00:00:00.000Z", id: 17 },
      error: null,
    }),
    update(value: Record<string, unknown>) {
      updated = value;
      return builder;
    },
  };

  const saved = await saveDocumentCache({
    admin: {
      from(table: string) {
        assert.equal(table, "documents");
        return builder;
      },
    } as never,
    document: {
      markdown: "Refreshed Exa content",
      title: "Updated title",
      url: "https://example.com/existing",
    },
  });

  assert.equal(updatedId, 17);
  assert.equal(getUpdated()?.markdown, "Refreshed Exa content");
  assert.equal(saved.documentId, 17);
});
