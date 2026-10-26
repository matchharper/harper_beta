import assert from "node:assert/strict";
import test from "node:test";

process.env.OPENAI_API_KEY ||= "test-only-not-used";

test("resume text loses contact lines but keeps career facts", async () => {
  const { withoutContacts } = await import("./profiles");
  const text = withoutContacts(
    "Email: someone@example.test | Tel 010-1234-5678 | +82 10 1234 5678 | https://example.test/me\n2019.03 - 2023.02 데이터 엔지니어, 하루 10억 건 이벤트 처리"
  );
  assert.ok(!/@|010-1234|1234 5678|https?:/.test(text), text);
  assert.ok(text.includes("2019.03 - 2023.02 데이터 엔지니어"));
  assert.ok(text.includes("10억 건"));
});

test("stated move destinations read as Korean country names", async () => {
  const { relocationNames } = await import("./profiles");
  assert.equal(relocationNames(["KR", "JP"]), "한국, 일본");
  assert.equal(relocationNames([]), "");
  assert.equal(relocationNames(null), "");
});
