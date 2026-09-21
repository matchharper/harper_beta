import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpsBlogAnalytics,
  buildOpsBlogSlugBase,
  deriveOpsBlogLocalizedContent,
  getOpsBlogPublishedDate,
  inferOpsBlogSchemaType,
  type OpsBlogLocalizedContent,
} from "@/lib/ops/blogServer";

const localizedContent: OpsBlogLocalizedContent = {
  category: "old category",
  content: "# Title\n\n## FAQ\n\n**Question?**\nAnswer.",
  excerpt: "Short summary",
  seoDescription: "old description",
  seoTitle: "old SEO title",
  title: "Visible title",
};

test("blog publication date always uses the current Korea date", () => {
  assert.equal(
    getOpsBlogPublishedDate(new Date("2026-09-14T15:01:00.000Z")),
    "2026-09-15"
  );
});

test("blog slug is generated from the title without the Harper suffix", () => {
  assert.equal(
    buildOpsBlogSlugBase("What a Forward Deployed Engineer Does | Harper"),
    "what-a-forward-deployed-engineer-does"
  );
  assert.equal(
    buildOpsBlogSlugBase("Café & AI: What's New? | Harper"),
    "cafe-ai-whats-new"
  );
  assert.equal(buildOpsBlogSlugBase("한국어로만 쓴 제목 | Harper"), "");
});

test("blog category and SEO fields are derived from tags and visible copy", () => {
  assert.deepEqual(
    deriveOpsBlogLocalizedContent(localizedContent, "Roles", true),
    {
      ...localizedContent,
      category: "Roles",
      seoDescription: localizedContent.excerpt,
      seoTitle: localizedContent.title,
    }
  );
});

test("an absent language version does not retain hidden metadata", () => {
  assert.deepEqual(
    deriveOpsBlogLocalizedContent(localizedContent, "Roles", false),
    {
      category: "",
      content: "",
      excerpt: "",
      seoDescription: "",
      seoTitle: "",
      title: "",
    }
  );
});

test("blog schema follows whether any language contains an FAQ section", () => {
  const empty: OpsBlogLocalizedContent = {
    category: "",
    content: "",
    excerpt: "",
    seoDescription: "",
    seoTitle: "",
    title: "",
  };
  assert.equal(
    inferOpsBlogSchemaType({ en: empty, ko: localizedContent }),
    "faq"
  );
  assert.equal(
    inferOpsBlogSchemaType({
      en: empty,
      ko: { ...localizedContent, content: "# Title\n\nRegular body" },
    }),
    "article"
  );
});

test("blog analytics groups Korea dates, posts, unique visitors, and detailed actions", () => {
  const analytics = buildOpsBlogAnalytics({
    from: "2026-09-20",
    logs: [
      {
        created_at: "2026-09-20T14:58:00.000Z",
        id: 1,
        local_id: "visitor-a",
        type: "blog_view:first-post",
      },
      {
        created_at: "2026-09-20T14:59:00.000Z",
        id: 2,
        local_id: "visitor-a",
        type: "blog_view:first-post",
      },
      {
        created_at: "2026-09-20T15:01:00.000Z",
        id: 3,
        local_id: "visitor-b",
        type: "blog_view:first-post",
      },
      {
        created_at: "2026-09-20T15:02:00.000Z",
        id: 4,
        local_id: "visitor-b",
        type: "blog_conversion:first-post",
      },
      {
        created_at: "2026-09-20T15:03:00.000Z",
        id: 5,
        local_id: "visitor-b",
        type: "blog_conversion:first-post",
      },
      {
        created_at: "2026-09-20T15:04:00.000Z",
        id: 6,
        local_id: "visitor-a",
        type: "blog_view:second-post",
      },
      {
        created_at: "2026-09-20T15:05:00.000Z",
        id: 7,
        local_id: "visitor-a",
        type: "blog_post_open:list:second-post",
      },
      {
        created_at: "2026-09-20T15:06:00.000Z",
        id: 8,
        local_id: "visitor-a",
        type: "blog_job_open:second-post:software-engineer",
      },
      {
        created_at: "2026-09-20T15:07:00.000Z",
        id: 9,
        local_id: "visitor-a",
        type: "blog_all_jobs_open:second-post",
      },
      {
        created_at: "2026-09-20T15:08:00.000Z",
        id: 10,
        local_id: "visitor-a",
        type: "blog_copy_link:second-post",
      },
      {
        created_at: "2026-09-20T15:09:00.000Z",
        id: 11,
        local_id: "visitor-a",
        type: "blog_list_view",
      },
    ],
    postTitles: {
      "first-post": "첫 번째 글",
      "second-post": "두 번째 글",
    },
    through: "2026-09-21",
  });

  assert.deepEqual(analytics.summary, {
    allJobsOpens: 1,
    conversionRate: 0.5,
    copyClicks: 1,
    ctaClickers: 1,
    ctaClicks: 2,
    jobOpens: 1,
    postOpens: 1,
    views: 4,
    visitors: 2,
  });
  assert.equal(analytics.daily[0].date, "2026-09-20");
  assert.deepEqual(analytics.daily[0].posts, [
    {
      allJobsOpens: 0,
      copyClicks: 0,
      ctaClickers: 0,
      ctaClicks: 0,
      jobOpens: 0,
      postOpens: 0,
      slug: "first-post",
      views: 2,
      visitors: 1,
    },
  ]);
  assert.deepEqual(analytics.daily[0].summary, {
    allJobsOpens: 0,
    conversionRate: 0,
    copyClicks: 0,
    ctaClickers: 0,
    ctaClicks: 0,
    jobOpens: 0,
    postOpens: 0,
    views: 2,
    visitors: 1,
  });
  assert.equal(analytics.daily[1].date, "2026-09-21");
  assert.deepEqual(analytics.daily[1].summary, {
    allJobsOpens: 1,
    conversionRate: 0.5,
    copyClicks: 1,
    ctaClickers: 1,
    ctaClicks: 2,
    jobOpens: 1,
    postOpens: 1,
    views: 2,
    visitors: 2,
  });
  assert.equal(analytics.posts[0].title, "첫 번째 글");
  assert.equal(analytics.posts[0].visitors, 2);
  assert.equal(analytics.posts[1].title, "두 번째 글");
  assert.equal(analytics.posts[1].visitors, 1);
  assert.equal(analytics.posts[1].jobOpens, 1);
  assert.equal(analytics.posts[1].allJobsOpens, 1);
  assert.equal(analytics.posts[1].copyClicks, 1);
});
