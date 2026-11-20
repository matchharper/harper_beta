import assert from "node:assert/strict";
import test from "node:test";
import { companyIdentityOf } from "./linked";

test("only a site's own address or a LinkedIn company page can add a company", () => {
  assert.deepEqual(
    { ...companyIdentityOf("https://www.ledgerly.example/") },
    { name: "Ledgerly", homepageUrl: "https://ledgerly.example", match: "%ledgerly.example%", column: "homepage_url", canAdd: true },
  );
  assert.equal(companyIdentityOf("ledgerly.example").canAdd, true);
  // A page can still name a company Harper already has on that site, but cannot add one:
  // an article on a news site is not the news site's company.
  const article = companyIdentityOf("https://technews.example/tessellate-seoul");
  assert.equal(article.canAdd, false);
  assert.equal(article.match, "%technews.example%");
  assert.equal(companyIdentityOf("https://ledgerly.example/careers").canAdd, false);
  assert.equal(companyIdentityOf("https://ledgerly.example/?ref=x").canAdd, false);
  assert.deepEqual(
    { ...companyIdentityOf("https://www.linkedin.com/company/vela-agents/about") },
    { name: "Vela Agents", linkedinUrl: "https://www.linkedin.com/company/vela-agents", match: "%linkedin.com/company/vela-agents%", column: "linkedin_url", canAdd: true },
  );
  assert.throws(() => companyIdentityOf("https://www.linkedin.com/posts/parcelhub-cto"), /not a company page/);
  // A country domain's second level is not the company's name.
  assert.equal(companyIdentityOf("https://www.scatterlab.co.kr").name, "Scatterlab");
  assert.equal(companyIdentityOf("example.com.au").name, "Example");
  assert.equal(companyIdentityOf("https://x.ai").name, "X");
  assert.throws(() => companyIdentityOf("https://exa mple"), /not a usable address/);
});
