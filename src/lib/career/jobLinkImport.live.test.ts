import assert from "node:assert/strict";
import test from "node:test";
import { fetchCareerJobPosting } from "@/lib/career/jobLinkImport";
import { getExaClient } from "@/lib/tools/exaClient";

const LIVE_TEST_ENABLED = process.env.RUN_LIVE_JOB_LINK_IMPORT_TESTS === "1";

const livePostings = [
  {
    company: "Engine",
    provider: "greenhouse",
    title: "Director, Data Engineering",
    url: "https://job-boards.greenhouse.io/engine/jobs/7801172003?gh_src=live_test",
  },
  {
    company: "Speechify",
    provider: "greenhouse",
    title: "Go-to-Market Engineer",
    url: "https://job-boards.greenhouse.io/speechify/jobs/6003596004",
  },
  {
    company: "Backblaze",
    provider: "greenhouse",
    title: "Lead Software Engineer",
    url: "https://job-boards.greenhouse.io/backblaze/jobs/5378831008",
  },
  {
    company: "Sourcegraph",
    provider: "greenhouse",
    title: "Agent Engineer [IC4]",
    url: "https://job-boards.greenhouse.io/sourcegraph91/jobs/6103567004",
  },
  {
    company: "Box",
    provider: "greenhouse",
    title: "AI Business Automation Engineer",
    url: "https://job-boards.greenhouse.io/boxinc/jobs/8077850",
  },
  {
    company: "Check",
    provider: "ashby",
    title: "Software Engineer, Senior",
    url: "https://jobs.ashbyhq.com/check-technologies/0906bd9a-0ab5-471a-a688-00de9f2df91a",
  },
  {
    company: "Sandbar",
    provider: "ashby",
    title: "Software Engineer, Web & Desktop",
    url: "https://jobs.ashbyhq.com/sandbar/316bc5bf-a60c-4022-9efb-39b35c2ffe4f",
  },
  {
    company: "Sazabi",
    provider: "ashby",
    title: "Software Engineer, Product",
    url: "https://jobs.ashbyhq.com/sazabi/4bc5d49b-1731-41de-a66d-82730166053c",
  },
  {
    company: "Proximal",
    provider: "ashby",
    title: "Software Engineer",
    url: "https://jobs.ashbyhq.com/Proximal/382319f1-f4e6-4a53-b32b-e486079a6163",
  },
  {
    company: "Alex AI",
    provider: "ashby",
    title: "Full-Stack Software Engineer",
    url: "https://jobs.ashbyhq.com/alexai/d103c4cb-973c-47f1-b603-412ceb6f0bca",
  },
  {
    company: "Flex",
    provider: "lever",
    title: "Senior Software Engineer, Backend",
    url: "https://jobs.lever.co/Flex/151e09c6-398f-4fe0-8da7-8fd7814d1bae",
  },
  {
    company: "Level AI",
    provider: "lever",
    title: "Lead Software Engineer - AI Agents",
    url: "https://jobs.lever.co/levelai/30eaa8f7-fb66-4ed4-9ac8-e2f343a84ad3",
  },
  {
    company: "넥스트증권",
    provider: "wanted",
    title: "AI Engineer",
    url: "https://www.wanted.co.kr/wd/312314?utm_source=live_test",
  },
  {
    company: "더블엔씨",
    provider: "wanted",
    title: "AI Engineer",
    url: "https://www.wanted.co.kr/wd/119755",
  },
  {
    company: "씨제이올리브네트웍스(CJ올리브네트웍스)",
    provider: "wanted",
    title: "AI실 AI Engineer(개인화 추천)",
    url: "https://www.wanted.co.kr/wd/289382",
  },
  {
    company: "셀렉트스타",
    provider: "wanted",
    title: "AI Engineer (주니어)",
    url: "https://www.wanted.co.kr/wd/326900",
  },
  {
    company: "뉴런소프트",
    provider: "wanted",
    title: "AI Engineer (인공지능)",
    url: "https://www.wanted.co.kr/wd/330403",
  },
  {
    company: "디카르고",
    provider: "wanted",
    title: "AI Engineer",
    url: "https://www.wanted.co.kr/wd/297026",
  },
  {
    company: "코어16",
    provider: "wanted",
    title: "AI Engineer / Data Engineer / Developer",
    url: "https://www.wanted.co.kr/wd/318228",
  },
  {
    company: "에이뉴트",
    provider: "wanted",
    title: "AI Engineer",
    url: "https://www.wanted.co.kr/wd/319301",
  },
  {
    company: "누비랩",
    provider: "wanted",
    title: "AI Engineer",
    url: "https://www.wanted.co.kr/wd/302266",
  },
  {
    company: "데센코리아",
    provider: "wanted",
    title: "Senior AI Engineer",
    url: "https://www.wanted.co.kr/wd/321274",
  },
  {
    company: "그룹바이에이치알",
    provider: "jumpit",
    title: "AI 개발자 채용[신입]",
    url: "https://jumpit.saramin.co.kr/position/51832763",
  },
  {
    company: "코비젼",
    provider: "jumpit",
    title: "경력직 개발자 채용 - JAVA/프론트엔드/백엔드/전문연구요원",
    url: "https://jumpit.saramin.co.kr/position/50154427",
  },
  {
    company: "한우리아이티",
    provider: "jumpit",
    title: "배치시스템 개발자 채용",
    url: "https://jumpit.saramin.co.kr/position/51381988",
  },
  {
    company: "팬딩",
    provider: "jumpit",
    title: "백엔드 주니어 개발자 (2~4년차)",
    url: "https://jumpit.saramin.co.kr/position/50347686",
  },
] as const;

for (const posting of livePostings) {
  test(
    `resolves live ${posting.provider} posting: ${posting.company} / ${posting.title}`,
    { skip: !LIVE_TEST_ENABLED, timeout: 20_000 },
    async () => {
      const result = await fetchCareerJobPosting({ url: posting.url });

      assert.equal(result.provider, posting.provider);
      assert.equal(result.companyName, posting.company);
      assert.equal(result.title, posting.title);
      assert.ok((result.description?.length ?? 0) >= 100);
      assert.ok(result.canonicalUrl.startsWith("https://"));
      if (posting.provider !== "wanted" && posting.provider !== "jumpit") {
        assert.ok(result.providerCompanyId);
      }
      assert.ok(result.providerJobId);
      assert.match(
        result.userSubmittedSourceJobId,
        new RegExp(`^${posting.provider}:`)
      );
    }
  );
}

test(
  "extracts a clean Juicebox posting through Exa structured summary",
  { skip: !LIVE_TEST_ENABLED, timeout: 30_000 },
  async () => {
    const result = await fetchCareerJobPosting({
      exa: getExaClient(),
      url: "https://juicebox.ai/careers/senior-software-engineer",
    });

    assert.equal(result.provider, "other");
    assert.equal(result.extractedBy, "exa_summary");
    assert.equal(result.companyName, "Juicebox");
    assert.equal(result.title, "Senior Software Engineer");
    assert.equal(result.salaryRange, "$180K - $300K");
    assert.deepEqual(result.employmentTypes, ["full_time"]);
    assert.ok((result.description?.length ?? 0) >= 1_000);
    assert.doesNotMatch(
      result.description ?? "",
      /Cookie Choices|try for free/i
    );
    assert.ok((result.descriptionSummary?.length ?? 0) >= 100);
    assert.notEqual(result.descriptionSummary, result.description);
  }
);
