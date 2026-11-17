import assert from "node:assert/strict";
import test from "node:test";
import { authorProfileUrl, exaSearchCost, resultKind } from "./signals";

test("what kind of page a result is, and who it stands for", () => {
  assert.equal(resultKind("https://kr.linkedin.com/in/jane-doe-123"), "linkedin_profile");
  assert.equal(resultKind("https://www.linkedin.com/posts/jane-doe-123_opentowork-activity-7390"), "linkedin_post");
  assert.equal(resultKind("https://www.threads.net/@jane/post/ABC123"), "threads_post");
  assert.equal(resultKind("https://www.threads.com/@jane"), "threads_profile");
  assert.equal(resultKind("https://example.com/blog"), "other");
  assert.equal(authorProfileUrl("https://kr.linkedin.com/in/Jane-Doe-123/?trk=x"), "https://linkedin.com/in/jane-doe-123");
  assert.equal(authorProfileUrl("https://www.linkedin.com/posts/jane-doe-123_opentowork-activity-7390-abcd"), "https://linkedin.com/in/jane-doe-123");
  assert.equal(authorProfileUrl("https://www.threads.net/@Jane.Dev/post/ABC"), "https://threads.net/@jane.dev");
  assert.equal(authorProfileUrl("https://www.linkedin.com/feed/update/urn:li:activity:1"), null);
});

test("search cost: as reported, else Exa's list price", () => {
  assert.equal(exaSearchCost(0.012, 10), 0.012);
  assert.equal(exaSearchCost(undefined, 10), 0.007);
  assert.equal(exaSearchCost(null, 15), 0.007 + 0.005);
});
