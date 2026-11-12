import test from "node:test";
import assert from "node:assert/strict";
import { buildCareerActionItemsContext, type CareerActionItem } from "./actionItems";
import { readCareerMatchingIndex } from "./matching/store";
import { buildTalentProfileContext } from "../talentOnboarding/profileStore";
import { renderTalentContextPrompt } from "../talentOnboarding/talentContexts";
import { formatRecentRecommendedOpportunitiesForPrompt } from "../talentOpportunity";
import { fetchPendingOpportunityFeedbackPromptContext } from "../talentOnboarding/activityEvents";

test("populated action context explicitly says that all ten items are provided", () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ id: `item-${i}`, revision: 1,
    title: `Task ${i}`, description: "Details", buttonText: "Open", priority: i, urgency: "normal",
    action: { type: "send_message", text: "Open this task" },
  })) as CareerActionItem[];
  const text = buildCareerActionItemsContext(items);
  assert.match(text, /Current visible actions \(all 10\)/);
  assert.equal((text.match(/\bItem item-/g) ?? []).length, 10);
  assert.match(buildCareerActionItemsContext([]), /all 0/);
  assert.doesNotMatch(buildCareerActionItemsContext(null), /all 0/);
});

test("matching index distinguishes an exact full page from an omitted seventh record", async () => {
  for (const size of [0, 6, 7]) {
    const data = Array.from({ length: size }, (_, i) => ({ id: String(i), title: `matching ${i}`, revision: 1 }));
    const admin = { from(table: string) {
      const q: any = { select: () => q, eq: () => q, is: () => q, in: () => q, order: () => q,
        limit: (n: number) => Promise.resolve({ data: table === "talent_matchings" ? data.slice(0, n) : [], error: null }) };
      return q;
    } };
    const text = await readCareerMatchingIndex({ admin: admin as any, userId: "fixture" });
    assert.ok(text.includes(size > 6 ? "Active matchings (6 shown; more)" : `Active matchings (all ${size})`));
    assert.match(text, /Active searches \(all 0\)/);
    assert.doesNotMatch(text, /matching 6;/);
  }
});

test("profile section coverage reflects truncation rather than declaring the entire profile complete", () => {
  const text = buildTalentProfileContext({ profile: { resume_links: Array(13).fill("https://example.test/resume") } as any,
    structuredProfile: { talentExperiences: Array.from({length: 13}, (_, i) => ({ id:i, role:`Role ${i}` })),
      talentEducations: [], talentExtras: [], talentUser: null } as any });
  assert.match(text, /Experiences \(12 shown; more\)/);
  assert.match(text, /Resume Links \(12 shown; more\)/);
  assert.match(text, /Educations \(all 0\)/);
});

test("Brief and Memory have independent complete versus selected scopes", () => {
  const row = {ref:1,label:"Location",content:"Seoul"};
  const text = renderTalentContextPrompt({allBriefs:[row],briefs:[row],memories:[row],memorySelection:"semantic",memoryTruncated:true} as any);
  assert.match(text, /Search Brief \(all 1\)/);
  assert.match(text, /1 shown; more/);
  const complete = renderTalentContextPrompt({allBriefs:[],briefs:[],memories:[row],memorySelection:"all",memoryTruncated:false} as any);
  assert.match(complete, /참고 맥락 \(all 1\)/);
});

test("recommendation count retains an empty complete scope and never invents a missing total", () => {
  assert.equal(formatRecentRecommendedOpportunitiesForPrompt({items:[],total:0}), "0/0");
  assert.equal(formatRecentRecommendedOpportunitiesForPrompt({items:[],total:null}), "0 shown; total unknown");
});

test("failed feedback reads and a page exhausted by unrenderable rows do not claim all zero", async () => {
  for (const failed of [false, true]) {
    const admin = { from(table: string) {
      const q: any = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: any) => Promise.resolve({
          data: failed ? null : Array.from({length: 11}, (_, i) => ({ id: String(i), created_at: "2026-11-01T00:00:00Z", summary: "" })),
          error: failed ? {message: "Unavailable fixture"} : null,
        }).then(resolve),
      };
      assert.ok(["talent_messages", "talent_activity_events"].includes(table));
      return q;
    } };
    const text = await fetchPendingOpportunityFeedbackPromptContext({admin: admin as any, userId: "fixture", conversationId: "fixture"});
    assert.doesNotMatch(text, /all 0/);
    assert.match(text, failed ? /unavailable/ : /rest unknown/);
  }
});
