import assert from "node:assert/strict";
import test from "node:test";
import {
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
