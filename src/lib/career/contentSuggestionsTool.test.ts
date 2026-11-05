import assert from "node:assert/strict";
import test from "node:test";
import {
  CAREER_CONTENT_SUGGESTION_TOOLS,
  careerContentJobPostingUrl,
} from "./contentSuggestionsTool";

const tool = CAREER_CONTENT_SUGGESTION_TOOLS.manage_content_suggestions;
const userId = "00000000-0000-4000-8000-000000000001";

function fixtureAdmin(answer: (args: Record<string, any>) => unknown) {
  const calls: Record<string, any>[] = [];
  return {
    calls,
    admin: {
      rpc: async (name: string, args: Record<string, any>) => {
        assert.equal(name, "manage_career_content_suggestion");
        calls.push(args);
        const value = answer(args);
        return value instanceof Error
          ? { data: null, error: { message: value.message } }
          : { data: value, error: null };
      },
    },
  };
}

const row = (item: Record<string, any>) => ({
  id: "00000000-0000-4000-8000-000000000010",
  kind: item.kind,
  url: item.url,
  title: item.title,
  source: null,
  reason: item.reason,
  starts_at: item.startsAt ?? null,
  ends_at: null,
  location: null,
  published_at: null,
  expires_at: "2026-12-05T00:00:00.000Z",
  status: "new",
  origin: "user_request",
  created_at: "2026-11-05T00:00:00.000Z",
});

test("job posting links are sent to Jobs instead of the content list", () => {
  for (const url of [
    "https://job-boards.greenhouse.io/acme/jobs/123",
    "https://www.linkedin.com/jobs/view/4012345678",
    "https://www.wanted.co.kr/wd/1234",
  ])
    assert.ok(careerContentJobPostingUrl(url), url);
  for (const url of [
    "https://www.linkedin.com/posts/founder_hiring-activity-1",
    "https://lu.ma/ai-forum",
    "https://example.com/blog/post",
  ])
    assert.equal(careerContentJobPostingUrl(url), null, url);
});

test("add normalizes links and dates, rejects postings and records who started it", async () => {
  const fixture = fixtureAdmin((args) =>
    args.p_item.title === "끝난 행사"
      ? new Error("Event already ended")
      : { status: "saved", id: row(args.p_item).id, item: row(args.p_item) }
  );
  const result = (await tool.execute!(
    {
      operation: "add",
      origin: "harper_offer",
      items: [
        { kind: "post", url: "https://job-boards.greenhouse.io/acme/jobs/1", title: "공고", reason: "이유" },
        {
          kind: "event",
          url: "https://lu.ma/ai-forum?utm_source=x#top",
          title: "AI 포럼",
          reason: "관심과 맞아요",
          startsAt: "2026-11-11T14:00:00+09:00",
          deadline: "2026-11-09",
        },
        { kind: "event", url: "https://lu.ma/old", title: "끝난 행사", reason: "이유", startsAt: "2020-01-01T00:00:00Z" },
      ],
    },
    { admin: fixture.admin, userId, conversationId: "00000000-0000-4000-8000-000000000003" }
  )) as { results: { status: string }[]; modelOutput: string };
  assert.deepEqual(
    result.results.map((item) => item.status),
    ["rejected_job_posting", "saved", "rejected"]
  );
  assert.match(result.modelOutput, /use save_job_posting with mode suggest/);
  assert.equal(fixture.calls.length, 2, "the posting never reaches the database");
  const saved = fixture.calls[0];
  assert.equal(saved.p_item.url, "https://lu.ma/ai-forum");
  assert.equal(saved.p_item.startsAt, "2026-11-11T05:00:00.000Z");
  assert.equal(saved.p_item.deadline, new Date("2026-11-09").toISOString());
  assert.equal(saved.p_origin, "harper_offer");
  assert.equal(saved.p_run_id, null);
});

test("scheduled background work is always recorded as Harper's own find", async () => {
  const fixture = fixtureAdmin((args) => ({
    status: "saved",
    id: row(args.p_item).id,
    item: row(args.p_item),
  }));
  await tool.execute!(
    {
      operation: "add",
      origin: "user_request",
      items: [{ kind: "article", url: "https://example.com/a", title: "글", reason: "이유" }],
    },
    {
      admin: fixture.admin,
      userId,
      conversationId: "00000000-0000-4000-8000-000000000003",
      backgroundInvocation: { runId: "00000000-0000-4000-8000-000000000009", sourceMessageCursor: 0 },
    }
  );
  assert.equal(fixture.calls[0].p_origin, "harper_background");
  assert.equal(fixture.calls[0].p_run_id, "00000000-0000-4000-8000-000000000009");
});
