import assert from "node:assert/strict";
import test from "node:test";
import { parseReadTalentProfileView, parseReadTalentProfileSections, projectReadTalentProfile } from "./readTalentInput";
import { serializeOrgAgentToolResult } from "./promptFormat";

test("profile outline preserves every timeline row without confusing omitted prose with missing evidence", () => {
  const description = "Original detailed evidence. ".repeat(900);
  const item = { candidate: { talentId: "candidate", name: "Example" }, profileIncluded: true,
    profile: { location: "Example City", bio: description,
      experiences: Array.from({ length: 35 }, (_, i) => ({ company_name: `Employer ${i}`, role: `Role ${i}`, start_date: "2020-01-01", end_date: null, description })),
      education: [{ school: "School", degree: "Degree", start_date: "2010-01-01", description }],
      extras: [{ title: "Project", date: "2024", description }],
    },
  };
  const outline = projectReadTalentProfile(item, "outline");
  assert.equal(outline.profile.experiences.length, 35);
  assert.equal(outline.profile.experiences[34].company_name, "Employer 34");
  assert.equal(outline.profile.experiences[34].end_date, null);
  assert.ok(!("description" in outline.profile.experiences[0]));
  assert.ok(!("bio" in outline.profile));
  assert.equal(item.profile.experiences[0].description, description);
  assert.equal(projectReadTalentProfile(item, "full"), item);
  const formatted = serializeOrgAgentToolResult("read_talent", outline);
  assert.ok(formatted.includes("profile_view=outline"));
  assert.ok(formatted.includes("Employer 34"));
  assert.ok(formatted.includes("profileView=full"));
  assert.ok(!formatted.includes(description));
});

test("explicit profile view is optional and rejects contradictory structural input", () => {
  assert.equal(parseReadTalentProfileView({}), undefined);
  assert.equal(parseReadTalentProfileView({ profileView: "outline" }), "outline");
  assert.equal(parseReadTalentProfileView({ includeProfile: true, profileView: "full" }), "full");
  assert.throws(() => parseReadTalentProfileView({ profileView: "unknown" }));
  assert.throws(() => parseReadTalentProfileView({ profileView: "outline", includeProfile: false }));
});

test("selected profile sections preserve full source rows and access facts without claiming other sections are empty", () => {
  const description = "full original work evidence ".repeat(600);
  const item = { candidate: { talentId: "candidate", name: "Example" }, profileIncluded: true,
    capabilities: { canContact: false }, positions: [], profile: { location: "City", bio: "Bio",
      experiences: [{ company_name: "Employer", description }], education: [{ school: "School" }], extras: [] } };
  const selected = projectReadTalentProfile(item, "full", ["experience"]);
  assert.equal(selected.profile.experiences[0].description, description);
  assert.deepEqual(selected.capabilities, item.capabilities);
  assert.equal(selected.profile.location, "City");
  assert.ok(!("education" in selected.profile));
  assert.ok("education" in item.profile);
  const rendered = serializeOrgAgentToolResult("read_talent", selected);
  assert.ok(rendered.includes(description.trim()));
  assert.match(rendered, /profile_sections=experience/);
  assert.match(rendered, /unexamined, not empty/);
  assert.match(rendered, /absent end date is unrecorded, not confirmation/);
  assert.doesNotMatch(rendered, /<education>|<extras>|bio\tBio/);
  assert.deepEqual(parseReadTalentProfileSections({ profileSections: ["experience", "experience"] }), ["experience"]);
  assert.deepEqual(parseReadTalentProfileSections({ profileSections: [] }), []);
  assert.throws(() => parseReadTalentProfileSections({ profileSections: ["private_resume"] }));
  assert.throws(() => parseReadTalentProfileSections({ profileSections: [], includeProfile: false }));
});
