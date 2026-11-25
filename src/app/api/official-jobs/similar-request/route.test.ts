import assert from "node:assert/strict";
import Module from "node:module";
import { before, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";
import {
  OFFICIAL_JOBS_ONESCREEN_COOKIE,
  OFFICIAL_JOBS_ONESCREEN_ROLLOUT,
} from "@/lib/officialJobs/oneScreen";
import type { NewRequestRow } from "@/lib/gtmPlays/agent/request";

// The actual handler with its posting, mail, store and file reading replaced; no database, mail or PDF parsing.
const CV_TEXT = "백엔드 개발자로 결제 시스템을 6년 동안 만들었어요. ".repeat(20);
let fileOk = true;
let fileText: string | null = CV_TEXT;
let extracted = 0;
const accepted: NewRequestRow[] = [];
const background: Array<() => Promise<unknown>> = [];
let POST: typeof import("./route").POST;

before(async () => {
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  const mocks: Record<string, unknown> = {
    "@/lib/gtmPlays/agent/request.server": {
      acceptJobPageRequest: async (row: NewRequestRow) => {
        accepted.push(row);
        return { status: "accepted", personId: "person-1" };
      },
      requestMailDomainOk: async () => true,
      runJobPageRequest: async () => "done",
    },
    "@/lib/officialJobs/server": {
      getOfficialJobPage: async () => ({
        job: {
          id: "job-1", slug: "example-role", roleId: "role-1", companyName: "예시회사", roleTitle: "Engineer",
          seniority: null, location: null, roleDescriptionMarkdown: "Build things.", shortDescription: null,
        },
        linkedRole: { workspaceId: OFFICIAL_JOBS_ONESCREEN_ROLLOUT.abWorkspaceIds[0], open: true },
      }),
    },
    "@/lib/officialJobs/similarRequest.server": { isOfficialJobsSimilarRequestOpen: async () => true },
    "@/lib/talentOnboarding/documentUpload": {
      validateResumeFileContent: () => fileOk,
      extractTalentDocumentTextContentBestEffort: async () => {
        extracted += 1;
        return fileText;
      },
    },
  };
  loader._load = function (name, ...args) {
    if (name === "next/server") {
      return { ...(original.call(this, name, ...args) as object), after: (fn: () => Promise<unknown>) => background.push(fn) };
    }
    return name in mocks ? mocks[name] : original.call(this, name, ...args);
  };
  try {
    ({ POST } = await import("./route"));
  } finally {
    loader._load = original;
  }
});

beforeEach(() => {
  fileOk = true;
  fileText = CV_TEXT;
  extracted = 0;
  accepted.length = 0;
  background.length = 0;
});

async function send(fields: { linkedinUrl?: string; resume?: boolean; locale?: "ko" | "en" }) {
  const form = new FormData();
  form.set("slug", "example-role");
  form.set("kind", "role");
  form.set("email", "someone@example.com");
  form.set("locale", fields.locale ?? "ko");
  form.set("consent", "true");
  if (fields.linkedinUrl) form.set("linkedinUrl", fields.linkedinUrl);
  if (fields.resume) form.set("resume", new File(["%PDF-1.4 cv"], "cv.pdf", { type: "application/pdf" }));
  const response = await POST(
    new NextRequest("https://example.invalid/api/official-jobs/similar-request", {
      method: "POST",
      body: form,
      headers: { cookie: `${OFFICIAL_JOBS_ONESCREEN_COOKIE}=B` },
    })
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const LINKEDIN = "https://www.linkedin.com/in/example-person";

test("a readable CV is used, with or without a LinkedIn URL", async () => {
  const both = await send({ linkedinUrl: LINKEDIN, resume: true });
  assert.deepEqual(both, { status: 202, body: { ok: true } });
  assert.equal(accepted[0].request.material, "both");
  const cvOnly = await send({ resume: true });
  assert.deepEqual(cvOnly, { status: 202, body: { ok: true } });
  assert.equal(accepted[1].request.material, "cv");
});

test("with a LinkedIn URL, a CV that can't be used is left out the same way and the answer says so", async () => {
  // A file the form does not take: not even read.
  fileOk = false;
  const wrongFile = await send({ linkedinUrl: LINKEDIN, resume: true });
  assert.deepEqual(wrongFile, { status: 202, body: { ok: true, resumeIgnored: true } });
  assert.equal(extracted, 0);
  assert.equal(accepted[0].request.material, "linkedin");
  assert.equal(accepted[0].profileText, null);
  // A file with no text in it (a scanned PDF).
  fileOk = true;
  fileText = "   ";
  const noText = await send({ linkedinUrl: LINKEDIN, resume: true });
  assert.deepEqual(noText, { status: 202, body: { ok: true, resumeIgnored: true } });
  assert.equal(accepted[1].request.material, "linkedin");
  assert.equal(background.length, 2);
});

test("without a LinkedIn URL, a CV that can't be used is refused as before", async () => {
  fileOk = false;
  const wrongFile = await send({ resume: true });
  assert.equal(wrongFile.status, 400);
  assert.equal(wrongFile.body.code, "FILE_INVALID");
  assert.equal(wrongFile.body.error, "PDF, DOCX, TXT, MD 파일만 올릴 수 있어요.");
  fileOk = true;
  fileText = null;
  const noText = await send({ resume: true, locale: "en" });
  assert.equal(noText.status, 400);
  assert.equal(noText.body.code, "FILE_INVALID");
  assert.equal(noText.body.error, "We couldn't read text from this CV. Upload another CV file or add your LinkedIn URL.");
  assert.equal(accepted.length, 0);
});

test("nothing given: the message names the CV first, as the page does", async () => {
  const ko = await send({});
  assert.equal(ko.status, 400);
  assert.equal(ko.body.code, "MATERIAL_REQUIRED");
  assert.equal(ko.body.error, "이력서나 LinkedIn 주소 중 하나를 넣어 주세요.");
  const en = await send({ locale: "en" });
  assert.equal(en.body.error, "Add a CV or your LinkedIn URL.");
});
