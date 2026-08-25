import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLinkedinCompanyUrl } from "@/lib/companyLinkedin";

test("normalizes LinkedIn company URLs to a canonical form", () => {
  assert.equal(
    normalizeLinkedinCompanyUrl("linkedin.com/company/Harper/?trk=public"),
    "https://www.linkedin.com/company/harper"
  );
  assert.equal(
    normalizeLinkedinCompanyUrl("https://kr.linkedin.com/company/Harper/"),
    "https://www.linkedin.com/company/harper"
  );
});

test("rejects non-company LinkedIn URLs", () => {
  assert.equal(
    normalizeLinkedinCompanyUrl("https://www.linkedin.com/in/harper"),
    null
  );
  assert.equal(
    normalizeLinkedinCompanyUrl("https://example.com/company/a"),
    null
  );
});
