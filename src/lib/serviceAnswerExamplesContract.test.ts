import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const lookup = read("./serviceAnswerExamples.ts");
const migration = read(
  "../../supabase/migrations/20260821120000_service_answer_example_audiences.sql"
);
const orgChat = read("./org/agent/chat.ts");
const roleCreationChat = read("./org/agent/roleCreationChat.ts");
const companySeed = read("../../scripts/seedCompanyServiceAnswerExamples.ts");
const careerRoute = read("../app/api/talent/chat/route.ts");
const careerTurn = read("./career/chatTurn.ts");

test("answer example lookup is fail-closed and audience scoped", () => {
  assert.match(lookup, /audience: ServiceAnswerExampleAudience/);
  assert.match(lookup, /audience_filter: options\.audience/);
  assert.doesNotMatch(lookup, /PGRST202/);
  assert.match(lookup, /DEFAULT_LOOKUP_TIMEOUT_MS = 2_500/);

  assert.match(migration, /set audience = 'career'/);
  assert.match(migration, /check \(audience in \('company', 'career'\)\)/);
  assert.match(migration, /and e\.audience = audience_filter/);
  assert.match(migration, /to service_role/);
});

test("only company-side text chat paths perform automatic lookup", () => {
  assert.match(orgChat, /lookupAnswerExamples\(llmUserMessage, \{/);
  assert.match(orgChat, /audience: "company"/);
  assert.match(roleCreationChat, /lookupAnswerExamples\(message, \{/);
  assert.match(roleCreationChat, /audience: "company"/);
  assert.doesNotMatch(
    careerRoute,
    /serviceAnswerExamples|lookupAnswerExamples/
  );
  assert.doesNotMatch(careerTurn, /serviceAnswerExamples|lookupAnswerExamples/);
});

test("Company FAQ seed updates a uniquely tagged row when its question changes", () => {
  assert.match(companySeed, /\.contains\("tags", \[\.\.\.item\.tags\]\)/);
  assert.match(companySeed, /if \(tagMatches\?\.length === 1\) existingId/);
  assert.match(companySeed, /id: existingId/);
});
