import assert from "node:assert/strict";
import test from "node:test";
import {
  extractJobPostingJsonLd,
  fetchCareerJobPosting,
  parseCareerJobUrl,
} from "@/lib/career/jobLinkImport";

test("canonicalizes Greenhouse tracking URLs into a stable role identity", () => {
  const identity = parseCareerJobUrl(
    "https://boards.greenhouse.io/Acme/jobs/12345?gh_src=email&utm_source=test#apply"
  );

  assert.equal(identity.provider, "greenhouse");
  assert.equal(identity.providerCompanyId, "acme");
  assert.equal(identity.providerJobId, "12345");
  assert.equal(
    identity.canonicalUrl,
    "https://job-boards.greenhouse.io/Acme/jobs/12345"
  );
  assert.equal(identity.userSubmittedSourceJobId, "greenhouse:12345");
  assert.ok(
    identity.roleUrlVariants.includes(
      "https://boards.greenhouse.io/acme/jobs/12345"
    )
  );
});

test("canonicalizes LinkedIn search links using currentJobId", () => {
  const identity = parseCareerJobUrl(
    "https://www.linkedin.com/jobs/search/?keywords=design&currentJobId=4452474383&trackingId=x"
  );

  assert.equal(identity.provider, "linkedin");
  assert.equal(identity.providerJobId, "4452474383");
  assert.equal(
    identity.canonicalUrl,
    "https://linkedin.com/jobs/view/4452474383"
  );
});

test("canonicalizes Wanted links using the public posting id", () => {
  const identity = parseCareerJobUrl(
    "https://www.wanted.co.kr/wd/274775?client_id=campaign&utm_source=test"
  );

  assert.equal(identity.provider, "wanted");
  assert.equal(identity.providerJobId, "274775");
  assert.equal(identity.canonicalUrl, "https://wanted.co.kr/wd/274775");
  assert.equal(identity.userSubmittedSourceJobId, "wanted:274775");
});

test("canonicalizes Jumpit links using the public position id", () => {
  const identity = parseCareerJobUrl(
    "https://jumpit.saramin.co.kr/position/51832763?utm_source=test"
  );

  assert.equal(identity.provider, "jumpit");
  assert.equal(identity.providerJobId, "51832763");
  assert.equal(
    identity.canonicalUrl,
    "https://jumpit.saramin.co.kr/position/51832763"
  );
  assert.equal(identity.userSubmittedSourceJobId, "jumpit:51832763");
});

test("rejects non-http URLs and credential-bearing URLs", () => {
  assert.throws(
    () => parseCareerJobUrl("file:///etc/passwd"),
    /invalid_job_url/
  );
  assert.throws(
    () => parseCareerJobUrl("https://user:password@example.com/job"),
    /invalid_job_url/
  );
});

test("extracts a nested JobPosting JSON-LD block", () => {
  const posting = extractJobPostingJsonLd(`
    <script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"JobPosting","title":"Platform Engineer"}]}
    </script>
  `);

  assert.equal(posting?.title, "Platform Engineer");
});

test("uses the Greenhouse API without invoking the general fallback", async () => {
  let fallbackCalled = false;
  const result = await fetchCareerJobPosting({
    exa: {
      getContents: async () => {
        fallbackCalled = true;
        throw new Error("unexpected fallback");
      },
    } as never,
    fetcher: async () =>
      new Response(
        JSON.stringify({
          application_deadline: "2026-12-31",
          company_name: "Acme",
          content:
            "&lt;h2&gt;The role&lt;/h2&gt;&lt;p&gt;Build systems.&lt;/p&gt;",
          first_published: "2026-09-01",
          location: { name: "Remote - Korea" },
          title: "Platform Engineer",
        }),
        { headers: { "content-type": "application/json" } }
      ),
    url: "https://job-boards.greenhouse.io/acme/jobs/12345",
  });

  assert.equal(fallbackCalled, false);
  assert.equal(result.companyName, "Acme");
  assert.equal(result.title, "Platform Engineer");
  assert.equal(result.workMode, "remote");
  assert.match(result.description ?? "", /Build systems\./);
});

test("uses Ashby JSON-LD as authoritative structured metadata", async () => {
  const result = await fetchCareerJobPosting({
    fetcher: async () =>
      new Response(
        `<script type="application/ld+json">${JSON.stringify({
          "@type": "JobPosting",
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: "USD",
            value: {
              "@type": "QuantitativeValue",
              maxValue: 180000,
              minValue: 150000,
              unitText: "YEAR",
            },
          },
          datePosted: "2026-09-01",
          description: "<p>Build reliable products.</p>",
          employmentType: "FULL_TIME",
          hiringOrganization: {
            logo: "https://example.com/logo.png",
            name: "Example",
            sameAs: "https://example.com/",
          },
          jobLocationType: "TELECOMMUTE",
          title: "Product Engineer",
        })}</script>`,
        { headers: { "content-type": "text/html" } }
      ),
    url: "https://jobs.ashbyhq.com/example/00000000-0000-4000-8000-000000000001",
  });

  assert.equal(result.extractedBy, "ashby_jsonld");
  assert.equal(result.companyName, "Example");
  assert.deepEqual(result.employmentTypes, ["full_time"]);
  assert.equal(result.salaryRange, "USD 150,000 –180,000 /year");
  assert.equal(result.workMode, "remote");
  assert.equal("companyHomepageUrl" in result, false);
  assert.equal("companyLinkedinUrl" in result, false);
  assert.equal("postedAt" in result, false);
  assert.equal("expiresAt" in result, false);
  assert.equal("salaryCurrency" in result, false);
  assert.equal("salaryMin" in result, false);
  assert.equal("salaryMax" in result, false);
  assert.equal("salaryPeriod" in result, false);
});

test("uses Lever JSON-LD to preserve the company's display name", async () => {
  const result = await fetchCareerJobPosting({
    fetcher: async () =>
      new Response(
        `<script type="application/ld+json">${JSON.stringify({
          "@type": "JobPosting",
          datePosted: "2026-09-01",
          description: "<p>Build reliable financial systems.</p>",
          employmentType: "Full-time",
          hiringOrganization: {
            logo: "https://example.com/flex.png",
            name: "Flex",
          },
          jobLocation: {
            "@type": "Place",
            address: {
              "@type": "PostalAddress",
              addressLocality: "Remote / USA",
            },
          },
          title: "Senior Software Engineer, Backend",
        })}</script>`,
        { headers: { "content-type": "text/html" } }
      ),
    url: "https://jobs.lever.co/Flex/151e09c6-398f-4fe0-8da7-8fd7814d1bae",
  });

  assert.equal(result.extractedBy, "lever_jsonld");
  assert.equal(result.companyName, "Flex");
  assert.equal(result.title, "Senior Software Engineer, Backend");
  assert.equal(result.workMode, "remote");
});

test("uses Wanted JSON-LD without invoking the general fallback", async () => {
  let fallbackCalled = false;
  const result = await fetchCareerJobPosting({
    exa: {
      getContents: async () => {
        fallbackCalled = true;
        throw new Error("unexpected fallback");
      },
    } as never,
    fetcher: async () =>
      new Response(
        `<script type="application/ld+json">${JSON.stringify({
          "@type": "JobPosting",
          description: "<p>정확한 공고 설명입니다.</p>",
          hiringOrganization: {
            "@type": "Organization",
            name: "예시회사",
          },
          title: "시니어 백엔드 개발자 [플랫폼]",
        })}</script>`,
        { headers: { "content-type": "text/html" } }
      ),
    url: "https://www.wanted.co.kr/wd/274775?client_id=campaign",
  });

  assert.equal(fallbackCalled, false);
  assert.equal(result.extractedBy, "wanted_jsonld");
  assert.equal(result.companyName, "예시회사");
  assert.equal(result.title, "시니어 백엔드 개발자 [플랫폼]");
});

test("uses Jumpit page metadata without invoking the general fallback", async () => {
  let fallbackCalled = false;
  const result = await fetchCareerJobPosting({
    exa: {
      getContents: async () => {
        fallbackCalled = true;
        throw new Error("unexpected fallback");
      },
    } as never,
    fetcher: async () =>
      new Response(
        [
          '<meta property="og:image" content="https://example.com/job.png">',
          "<main>",
          "<h1>AI 개발자 채용[신입]</h1>",
          '<a href="/company/example"><span>그룹바이에이치알</span></a>',
          "<section><h2>주요업무</h2><p>AI 제품을 개발합니다.</p></section>",
          "</main>",
        ].join(""),
        { headers: { "content-type": "text/html" } }
      ),
    url: "https://jumpit.saramin.co.kr/position/51832763",
  });

  assert.equal(fallbackCalled, false);
  assert.equal(result.extractedBy, "jumpit_html");
  assert.equal(result.companyName, "그룹바이에이치알");
  assert.equal(result.title, "AI 개발자 채용[신입]");
  assert.match(result.description ?? "", /AI 제품을 개발합니다/);
});

test("uses Exa structured summary without retrieving or storing raw page text", async () => {
  const requestedOptions: Record<string, unknown>[] = [];
  const result = await fetchCareerJobPosting({
    exa: {
      getContents: async (_ids: unknown, options: Record<string, unknown>) => {
        requestedOptions.push(options);
        return {
          requestId: "request-1",
          results: [
            {
              id: "job-1",
              summary: JSON.stringify({
                hiringCompany: "Example Labs",
                jobDescription:
                  "# The role\n\nBuild reliable systems.\n\n# Requirements\n\nOwn production services.",
                jobLocation: "Remote, Korea",
                roleSummary:
                  "Example Labs is hiring a Staff Engineer. The role builds reliable production systems. The engineer will own production services.",
                employmentTypes: ["full_time"],
                isJobPosting: true,
                roleTitle: "Staff Engineer",
                salaryRange: "$180,000–$220,000/year",
                workArrangement: "remote",
              }),
              url: "https://careers.example.com/staff-engineer",
            },
          ],
        };
      },
    } as never,
    url: "https://careers.example.com/staff-engineer?utm_source=mail",
  });

  assert.equal(result.extractedBy, "exa_summary");
  assert.equal(result.companyName, "Example Labs");
  assert.equal(result.title, "Staff Engineer");
  assert.equal(result.salaryRange, "$180,000–$220,000/year");
  assert.equal(result.location, "Remote, Korea");
  assert.equal(result.workMode, "remote");
  assert.deepEqual(result.employmentTypes, ["full_time"]);
  assert.match(result.description ?? "", /Own production services/);
  assert.match(result.descriptionSummary ?? "", /Staff Engineer/);
  const requestOptions = requestedOptions[0];
  assert.ok(requestOptions);
  assert.equal("text" in requestOptions, false);
  assert.equal(requestOptions.maxAgeHours, 24);
  const summaryOptions = (
    requestOptions as {
      summary?: { query?: string; schema?: Record<string, unknown> };
    }
  ).summary;
  assert.match(summaryOptions?.query ?? "", /Never infer/);
  assert.equal(summaryOptions?.schema?.type, "object");
});

test("does not treat a generic public page as a job posting", async () => {
  await assert.rejects(
    fetchCareerJobPosting({
      exa: {
        getContents: async () => ({
          requestId: "request-2",
          results: [
            {
              id: "page-1",
              summary: JSON.stringify({
                hiringCompany: "Example Labs",
                jobDescription: "",
                jobLocation: "",
                roleSummary: "",
                employmentTypes: [],
                isJobPosting: false,
                roleTitle: "Example Labs",
                salaryRange: "",
                workArrangement: "",
              }),
              url: "https://example.com/about",
            },
          ],
        }),
      } as never,
      url: "https://example.com/about",
    }),
    /job_details_required/
  );
});

test("allows explicit company and title when a public page cannot be read", async () => {
  const result = await fetchCareerJobPosting({
    manual: { companyName: "Private Company", title: "Founding Engineer" },
    url: "https://example.com/private-posting",
  });

  assert.equal(result.extractedBy, "manual");
  assert.equal(result.companyName, "Private Company");
  assert.equal(result.title, "Founding Engineer");
  assert.equal(result.description, null);
});

test("requests manual details when neither retrieval nor explicit fields work", async () => {
  await assert.rejects(
    fetchCareerJobPosting({ url: "https://example.com/unreadable" }),
    /job_details_required/
  );
});
