import assert from "node:assert/strict";
import test from "node:test";
import {
  REVIEW_SCHEMA, REVIEW_SYSTEM_PROMPT, cleanReviewReason, parseGrade, parseReviews, reviewPostingText, reviewUserPrompt,
  verdictAgrees, withReviews, withVerdict,
} from "./review";
import type { AgentPosting } from "./types";

const AT = "2026-11-17T05:00:00.000Z";

const posting = (roleId: string | null, title: string, patch: Partial<AgentPosting> = {}): AgentPosting => ({
  kind: "external", roleId, url: null, companyName: "Alpha", title, location: "Seoul", why: "결제 경험이 맞아요", ...patch,
});

test("a grade is one of the three codes, or its Korean label; anything else is no grade", () => {
  assert.equal(parseGrade("good"), "good");
  assert.equal(parseGrade(" Unsure "), "unsure");
  assert.equal(parseGrade("poor"), "poor");
  assert.equal(parseGrade("잘 맞음"), "good");
  assert.equal(parseGrade("애매"), "unsure");
  assert.equal(parseGrade("안맞음"), "poor");
  assert.equal(parseGrade("great"), null);
  assert.equal(parseGrade(""), null);
  assert.equal(parseGrade(3), null);
  assert.equal(parseGrade(null), null);
  assert.deepEqual(REVIEW_SCHEMA.properties.reviews.items.properties.grade.enum, ["good", "unsure", "poor"]);
});

test("the grader's answer: one per posting in order, known indexes only, the first answer wins, bad grades dropped", () => {
  const reviews = parseReviews({
    reviews: [
      { index: 1, grade: "poor", reason: "7년 이상을 요구하는데\n경력이 2년이에요." },
      { index: 0, grade: "good", reason: "백엔드 5년 경력과 **시니어 백엔드** 자리가 맞아요 https://example.com/job" },
      { index: 1, grade: "good", reason: "second answer for the same posting" },
      { index: 2, grade: "maybe", reason: "not a grade" },
      { index: 7, grade: "good", reason: "no such posting" },
      { index: "x", grade: "good" },
    ],
  }, 3, AT);
  assert.deepEqual(reviews, [
    { grade: "good", reason: "백엔드 5년 경력과 시니어 백엔드 자리가 맞아요", at: AT },
    { grade: "poor", reason: "7년 이상을 요구하는데 경력이 2년이에요.", at: AT },
    null,
  ]);
  // Not the expected shape (or a failed call): no grades at all.
  assert.deepEqual(parseReviews({ invalidJson: "…" }, 2, AT), [null, null]);
  assert.deepEqual(parseReviews(null, 2, AT), [null, null]);
  // A grade without a reason still counts.
  assert.deepEqual(parseReviews({ reviews: [{ index: 0, grade: "unsure" }] }, 1, AT), [{ grade: "unsure", reason: "", at: AT }]);
  assert.equal(cleanReviewReason("x".repeat(300)).length, 160);
});

test("grades go on their postings; a posting the grader left out stays as it was", () => {
  const postings = [posting("r1", "Backend"), posting("r2", "Data")];
  const graded = withReviews(postings, [null, { grade: "poor", reason: "직무가 달라요", at: AT }]);
  assert.equal("review" in graded[0], false);
  assert.deepEqual(graded[1].review, { grade: "poor", reason: "직무가 달라요", at: AT });
  assert.equal(postings[1].review, undefined);
});

test("the grader reads the person and each posting's own text, never the matcher's note or score", () => {
  const prompt = reviewUserPrompt("Headline: Backend Engineer", [
    { companyName: "Alpha", title: "Senior Backend Engineer", location: "Seoul", text: "Work mode: onsite\nKotlin 7+ years" },
    { companyName: "Beta", title: "Data Engineer", location: null, text: null },
  ]);
  assert.match(prompt, /^PERSON\nHeadline: Backend Engineer/);
  assert.match(prompt, /#0 Senior Backend Engineer · Alpha \(Seoul\)\nWork mode: onsite\nKotlin 7\+ years/);
  assert.match(prompt, /#1 Data Engineer · Beta\n\(no posting text: judge from the title and location\)/);
  assert.doesNotMatch(prompt, /결제 경험이 맞아요|score/i);
  // The rubric names its five points and is stricter than the picker's (between good and unsure: unsure).
  for (const point of ["Role family", "Level", "Must-haves", "Location and remote", "Domain", "choose unsure"]) {
    assert.ok(REVIEW_SYSTEM_PROMPT.includes(point), point);
  }
});

test("a posting's text for the grader: how and at what level it is worked, then its description (cleaned)", () => {
  assert.equal(
    reviewPostingText({ work_mode: "remote", seniority_level: "senior", type: ["full_time"], description: "  Hidden Co builds ledgers.  " },
      (text) => text.replace("Hidden Co", "핀테크 스타트업")),
    "Work mode: remote · Seniority: senior · Employment: full_time\n핀테크 스타트업 builds ledgers.",
  );
  assert.equal(reviewPostingText({ description: "Only text" }), "Only text");
  assert.equal(reviewPostingText({ work_mode: "onsite" }), "Work mode: onsite");
  assert.equal(reviewPostingText({ work_mode: " ", description: "" }), null);
  assert.equal(reviewPostingText({ description: "x".repeat(5_000) })?.length, 3_000);
});

test("Ops's verdict lands on the posting it was clicked on, and only while that posting is still there", () => {
  const postings = [posting("r1", "Backend"), posting(null, "Known by URL"), posting("r3", "Data")];
  const verdict = { value: "wrong" as const, by: "user-1", at: AT };
  const marked = withVerdict(postings, { index: 1, roleId: null, title: "Known by URL" }, verdict);
  assert.deepEqual(marked?.map((item) => item.verdict ?? null), [null, verdict, null]);
  // Changed: 맞음 now.
  const changed = withVerdict(marked!, { index: 1, roleId: null, title: "Known by URL" }, { ...verdict, value: "right" });
  assert.equal(changed?.[1].verdict?.value, "right");
  // Cleared: no verdict key at all.
  const cleared = withVerdict(changed!, { index: 1, roleId: null, title: "Known by URL" }, null);
  assert.equal(cleared && "verdict" in cleared[1], false);
  // The list changed under the screen (a closed posting dropped, another title there): nothing changes.
  assert.equal(withVerdict(postings, { index: 2, roleId: "r2", title: "Data" }, verdict), null);
  assert.equal(withVerdict(postings, { index: 0, roleId: "r1", title: "Frontend" }, verdict), null);
  assert.equal(withVerdict(postings, { index: 5, roleId: "r1", title: "Backend" }, verdict), null);
});

test("Ops and the grader agree when 맞음 meets 잘 맞음 and 안 맞음 meets 안 맞음; 애매 is not compared", () => {
  const review = (grade: "good" | "unsure" | "poor") => ({ grade, reason: "", at: AT });
  const verdict = (value: "right" | "wrong") => ({ value, by: "user-1", at: AT });
  assert.equal(verdictAgrees({ review: review("good"), verdict: verdict("right") }), true);
  assert.equal(verdictAgrees({ review: review("poor"), verdict: verdict("wrong") }), true);
  assert.equal(verdictAgrees({ review: review("good"), verdict: verdict("wrong") }), false);
  assert.equal(verdictAgrees({ review: review("poor"), verdict: verdict("right") }), false);
  assert.equal(verdictAgrees({ review: review("unsure"), verdict: verdict("right") }), null);
  assert.equal(verdictAgrees({ review: null, verdict: verdict("right") }), null);
  assert.equal(verdictAgrees({ review: review("good") }), null);
});
