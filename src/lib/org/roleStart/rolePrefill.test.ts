import assert from "node:assert/strict";
import test from "node:test";

// Modules build clients at import time; nothing here reaches them.
process.env.OPENAI_API_KEY ||= "test-only-not-used";
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";

test("in the JD's first chat turn, the chat never replaces a fact already filled, typed or read", async () => {
  const { holdPrefilledFacts, withoutPrefilledFacts } = await import("./rolePrefill");
  holdPrefilledFacts("role-a", ["locationText"]);
  const current = { name: "새 역할", locationText: "서울", workMode: null, employmentTypes: [], salaryRange: "연봉 7,000만 원" };
  const input = { name: "백엔드 엔지니어", locationText: "부산", workMode: "remote", employmentTypes: ["full_time"], salaryRange: "연봉 8,000만 원" };
  assert.deepEqual(withoutPrefilledFacts("role-a", input, current), {
    name: "백엔드 엔지니어",
    workMode: "remote",
    employmentTypes: ["full_time"],
  });
  // No hold (another turn, or no JD read): the chat saves as before.
  assert.deepEqual(withoutPrefilledFacts("role-b", input, current), input);
});
