import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeOpenUrl,
  openUrlsWithDocumentsCache,
  openUrlWithDocumentsCache,
} from "@/lib/talentOnboarding/openUrlTool";
import { saveDocumentCache } from "@/lib/tools/documentCache";
import { formatToolError } from "@/lib/llm/toolError";

function createOpenUrlAdmin(cached: Record<string, unknown> | null = null) {
  let inserted: Record<string, unknown> | null = null;
  let captured: Record<string, unknown> | null = null;
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
      async rpc(name: string, args: Record<string, unknown>) {
        if(name==="career_claim_public_fetch_v1")return {data:true,error:null};
        assert.equal(name, "career_capture_public_source_v1");
        captured=args;
        inserted = { title: args.p_title, url: args.p_url, markdown: args.p_content };
        return { data: { documentId: 42, observationId: "public-observation", observedAt: "2026-08-11T00:00:00.000Z" }, error: null };
      },
      from(table: string) {
        assert.equal(table, "documents");
        return builder;
      },
    } as never,
    getInserted: () => inserted,
    getCaptured: () => captured,
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

test("submits fifteen misses in one Exa request and matches out-of-order results, errors and freshness to the original URLs", async () => {
  const urls = Array.from({ length: 15 }, (_, index) => `https://example.test/jobs/${index}`);
  const calls: string[][] = [];
  const { admin } = createOpenUrlAdmin();
  const pages = await openUrlsWithDocumentsCache({
    admin, urls: [...urls, urls[0]], maxAgeHours: 0,
    exa: { getContents: async (batch: string[], options: unknown) => {
      calls.push(batch);
      assert.deepEqual(options, { text: true, maxAgeHours: 0 });
      return {
        results: batch.slice().reverse().filter(url => url !== urls[4]).map(id => ({
          id, url: id === urls[2] ? urls[4] : id, text: `Body for ${id}`,
        })),
        statuses: batch.map(id => ({
          id, status: id === urls[4] ? "error" : "success", source: id === urls[2] ? "crawled" : "cached",
          ...(id === urls[4] ? { error: { httpStatusCode: 405 } } : {}),
        })),
      };
    } } as never,
  });
  assert.deepEqual(calls, [urls]);
  for (const [index, page] of pages.entries()) {
    const url = urls[index % urls.length];
    if (index === 4) {
      assert.equal(page.status, "rejected");
      assert.match(page.reason.message, /HTTP 405/);
      continue;
    }
    assert.equal(page.status, "fulfilled");
    assert.equal(page.value.markdown, `Body for ${url}`);
    assert.equal(Boolean(page.value.sourceFetchedAt), index === 2);
    assert.equal(page.value.sourceScope, "unclassified_not_shared");
    if (index === 2) assert.equal("resolvedUrl" in page.value && page.value.resolvedUrl, urls[4]);
  }
});

test("splits at the provider's 100-URL limit and keeps pages from a successful chunk", async () => {
  const urls = Array.from({ length: 101 }, (_, i) => `https://example.test/${i}`);
  const sizes: number[] = [];
  const { admin } = createOpenUrlAdmin();
  const results = await openUrlsWithDocumentsCache({ admin, urls, exa: {
    async getContents(batch: string[]) {
      sizes.push(batch.length);
      if (batch.length === 1) throw new Error("HTTP 429");
      return { results: batch.map(id => ({ id, url: id, text: id })) };
    },
  } as never });
  assert.deepEqual(sizes, [100, 1]);
  assert.equal(results.filter(page => page.status === "fulfilled").length, 100);
  const last = results[100];
  assert.equal(last.status, "rejected");
  assert.match(last.reason.cause.message, /429/);
});

test("requested freshness is recorded only for a confirmed crawl, never a cached fallback",async()=>{
  for(const source of ["cached","crawled"]){
    const url="https://example.com/known-public",fixture=createOpenUrlAdmin({id:42,url,title:"Known source",markdown:"Old content",source_scope:"public",provenance:{contract:"exa-public-contents-v1"},created_at:"2026-01-01T00:00:00Z"});
    await openUrlWithDocumentsCache({admin:fixture.admin,url,maxAgeHours:0,exa:{getContents:async()=>({results:[{url,text:"Returned content"}],statuses:[{id:url,status:"success",source}]})} as never});
    const capture=fixture.getCaptured();assert.ok(capture);
    if(source==="cached")assert.equal(capture.p_fetched_at,null);
    else assert.ok(Number.isFinite(Date.parse(String(capture.p_fetched_at))));
  }
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

test("empty page reads preserve uncertainty and offer another source without caching empty content", async () => {
  const { admin, getInserted } = createOpenUrlAdmin();
  await assert.rejects(openUrlWithDocumentsCache({
    admin, url: "https://example.com/unreadable",
    exa: { getContents: async () => ({ results: [{ text: "" }] }) } as never,
  }), error => {
    const diagnostic = JSON.parse(formatToolError(error));
    assert.match(diagnostic.message, /no text/);
    assert.match(diagnostic.recovery, /not proof|not.*missing/);
    assert.match(diagnostic.recovery, /web search/);
    return true;
  });
  assert.equal(getInserted(), null);
});

test("reader failures retain the underlying cause and explain that no content was read", async () => {
  const { admin, getInserted } = createOpenUrlAdmin();
  const cause = { code: "upstream_unavailable", status: 503, message: "reader temporarily unavailable" };
  await assert.rejects(openUrlWithDocumentsCache({
    admin, url: "https://example.com/article",
    exa: { getContents: async () => { throw cause; } } as never,
  }), error => {
    const diagnostic = JSON.parse(formatToolError(error));
    assert.equal(diagnostic.cause.code, cause.code);
    assert.equal(diagnostic.cause.status, 503);
    assert.match(diagnostic.recovery, /No page content was read/);
    return true;
  });
  assert.equal(getInserted(), null);
});

test("reader cancellation remains a cancellation instead of a recoverable page error", async () => {
  const { admin } = createOpenUrlAdmin();
  const abort = new DOMException("Cancelled", "AbortError");
  await assert.rejects(openUrlWithDocumentsCache({
    admin, url: "https://example.com/article",
    exa: { getContents: async () => { throw abort; } } as never,
  }), error => error === abort);
});

test("reads an uncached supplied URL without promoting it into shared public storage", async () => {
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
  assert.deepEqual(requestedOptions, { text: true });
  assert.equal(getInserted(), null);
  assert.equal(result.sourceScope, "unclassified_not_shared");
  assert.equal(result.cached, false);
  assert.equal(result.markdown, "Full LinkedIn job text from Exa");
});

for (const [provider, url, directUrl] of [
  ["Ashby", "https://jobs.ashbyhq.com/Sierra/posting-id", "https://jobs.ashbyhq.com/Sierra/posting-id"],
  ["Wanted", "https://www.wanted.co.kr/wd/386733?client_id=campaign", "https://www.wanted.co.kr/wd/386733"],
]) {
  test(`reads a ${provider} JD's official title and description directly before Exa`, async () => {
    const { admin, getInserted } = createOpenUrlAdmin();
    let requestedUrl = "";
    const result = await openUrlWithDocumentsCache({
      admin,
      exa: {
        getContents: async () => {
          throw new Error("Exa should not be called for a readable JD");
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
      url,
    });

    assert.equal(requestedUrl, directUrl);
    assert.equal(result.title, "Agent Strategist");
    assert.match(result.markdown, /^# Agent Strategist/);
    assert.match(result.markdown, /Company: Sierra/);
    assert.match(result.markdown, /Own customer AI agent launches\./);
    assert.equal(getInserted()?.title, "Agent Strategist");
    assert.match(String(getInserted()?.markdown ?? ""), /# Agent Strategist/);
  });
}

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
