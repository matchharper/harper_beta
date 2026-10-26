import assert from "node:assert/strict";
import test from "node:test";
import {
  projectCompanyPublicProfile,
  projectCompanyPublicProfileFromDetail,
} from "./publicProfile";
import type { OrgTalentDetailResponse } from "./server";

test("explicit full public profiles preserve all professional rows and source text, excluding private fields", () => {
  const description = "source detail ".repeat(300);
  const row = {
    description,
    start_date: "2001-01-01",
    end_date: "2002-12-31",
    memo: "PRIVATE_MEMO",
    email: "PRIVATE_EMAIL",
  };
  const profile = projectCompanyPublicProfile({
    bio: description,
    location: "Seoul",
    experiences: Array.from({ length: 12 }, (_, index) => ({
      ...row,
      company_name: `Company ${index}`,
    })),
    education: Array.from({ length: 7 }, (_, index) => ({
      ...row,
      school: `School ${index}`,
    })),
    extras: Array.from({ length: 8 }, (_, index) => ({
      title: `Project ${index}`,
      ...row,
    })),
  });
  assert.equal(profile.bio, description);
  assert.equal(profile.experiences.length, 12);
  assert.equal(profile.education.length, 7);
  assert.equal(profile.extras.length, 8);
  assert.equal(profile.experiences[11].description, description);
  assert.equal(profile.education[6].description, description);
  assert.equal(profile.extras[7].description, description);
  assert.ok(!JSON.stringify(profile).includes("PRIVATE_"));
});

test("authorized card details use the same public profile contract, including education dates and public extras", () => {
  const profile = {
    bio: "Full bio",
    location: "Seoul",
    documents: [{ fileName: "PRIVATE_DOCUMENT" }],
    registeredLinks: ["PRIVATE_LINK"],
    experiences: [
      {
        companyName: "Company",
        role: "Engineer",
        employmentType: "Full-time",
        companyLocation: "Remote",
        startDate: "2020-01-01",
        endDate: null,
        description: "Full detail",
        memo: "PRIVATE_MEMO",
      },
    ],
    educations: [
      {
        school: "School",
        degree: "BA",
        field: "Field",
        startDate: "2010-09-01",
        endDate: "2014-06-01",
        description: "Degree detail",
        memo: "PRIVATE_MEMO",
      },
    ],
    extras: [
      {
        title: "Publication",
        date: "2018",
        description: "Public text",
        memo: "PRIVATE_MEMO",
      },
    ],
  } as OrgTalentDetailResponse["profile"];
  const result = projectCompanyPublicProfileFromDetail(profile);
  assert.equal(result.education[0].start_date, "2010-09-01");
  assert.equal(result.education[0].end_date, "2014-06-01");
  assert.equal(result.experiences[0].employment_type, "Full-time");
  assert.equal(result.extras[0].description, "Public text");
  assert.ok(!JSON.stringify(result).includes("PRIVATE_"));
});
