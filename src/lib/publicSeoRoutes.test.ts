import assert from "node:assert/strict";
import test from "node:test";
import {
  getCompanyLanguageEntryUrl,
  getCompanyLocalePath,
  getCompanyLocaleUrl,
} from "@/lib/companyLandingSeo";
import {
  buildSitemapXml,
  buildStaticSitemapEntries,
} from "@/pages/sitemap.xml";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";

const SITE_URL = getConfiguredPublicSiteUrl();

test("company locale routes have stable canonical URLs", () => {
  assert.equal(getCompanyLocalePath("ko"), "/ko/company");
  assert.equal(getCompanyLocalePath("en"), "/en/company");
  assert.equal(getCompanyLocaleUrl("ko"), `${SITE_URL}/ko/company`);
  assert.equal(getCompanyLocaleUrl("en"), `${SITE_URL}/en/company`);
  assert.equal(getCompanyLanguageEntryUrl(), `${SITE_URL}/company`);
});

test("static sitemap contains canonical pages and omits redirect-only pages", () => {
  const entries = buildStaticSitemapEntries();
  const locations = entries.map((entry) => entry.loc);

  assert.equal(locations.includes(`${SITE_URL}/search`), false);
  assert.equal(locations.includes(`${SITE_URL}/company`), false);
  assert.equal(locations.includes(`${SITE_URL}/ko/company`), true);
  assert.equal(locations.includes(`${SITE_URL}/en/company`), true);
  assert.equal(locations.includes(`${SITE_URL}/about`), true);
});

test("sitemap XML emits reciprocal company hreflang links", () => {
  const companyEntries = buildStaticSitemapEntries().filter((entry) =>
    entry.loc.endsWith("/company")
  );
  const xml = buildSitemapXml(companyEntries);

  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.equal(
    xml.match(/hreflang="en"/g)?.length,
    2,
    "each localized URL should list the English alternate"
  );
  assert.equal(
    xml.match(/hreflang="ko"/g)?.length,
    2,
    "each localized URL should list the Korean alternate"
  );
  assert.equal(xml.match(/hreflang="x-default"/g)?.length, 2);
});
