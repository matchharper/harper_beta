import assert from "node:assert/strict";
import test from "node:test";
import {
  OFFICIAL_JOBS_SIMILAR_REQUEST_PATH,
  OFFICIAL_JOBS_SIMILAR_RESUME_MAX_BYTES,
} from "./similarRequest";
import {
  buildOfficialJobsSimilarRequestForm,
  isSimilarResumeTooLarge,
  sendOfficialJobsSimilarRequest,
  type OfficialJobsSimilarRequestInput,
} from "./similarRequestClient";

const base: OfficialJobsSimilarRequestInput = {
  slug: "example-role",
  kind: "role",
  email: " someone@example.com ",
  linkedinUrl: "https://www.linkedin.com/in/example",
  resumeFile: null,
  locale: "ko",
  consent: true,
  lid: "visitor-123456",
};

test("builds the multipart fields of the contract", () => {
  const form = buildOfficialJobsSimilarRequestForm({
    ...base,
    resumeFile: new File(["cv"], "cv.pdf", { type: "application/pdf" }),
  });
  assert.equal(form.get("slug"), "example-role");
  assert.equal(form.get("kind"), "role");
  assert.equal(form.get("email"), "someone@example.com");
  assert.equal(form.get("linkedinUrl"), "https://www.linkedin.com/in/example");
  assert.equal(form.get("locale"), "ko");
  assert.equal(form.get("consent"), "true");
  assert.equal(form.get("lid"), "visitor-123456");
  assert.equal((form.get("resume") as File).name, "cv.pdf");
});

test("leaves out empty optional fields", () => {
  const form = buildOfficialJobsSimilarRequestForm({
    ...base,
    linkedinUrl: "  ",
    lid: null,
  });
  assert.equal(form.has("linkedinUrl"), false);
  assert.equal(form.has("resume"), false);
  assert.equal(form.has("lid"), false);
});

test("stops a CV over the limit before sending", async () => {
  let called = false;
  const big = { size: OFFICIAL_JOBS_SIMILAR_RESUME_MAX_BYTES + 1, name: "cv.pdf" } as File;
  assert.equal(isSimilarResumeTooLarge(big), true);
  assert.equal(isSimilarResumeTooLarge({ size: OFFICIAL_JOBS_SIMILAR_RESUME_MAX_BYTES }), false);
  const result = await sendOfficialJobsSimilarRequest({ ...base, resumeFile: big }, (async () => {
    called = true;
    return new Response(null, { status: 202 });
  }) as typeof fetch);
  assert.deepEqual(result, { ok: false, code: "FILE_TOO_LARGE", error: "" });
  assert.equal(called, false);
});

test("202 is accepted; errors carry the server's code and message", async () => {
  let url = "";
  const accepted = await sendOfficialJobsSimilarRequest(base, (async (input: RequestInfo | URL) => {
    url = String(input);
    return new Response(JSON.stringify({ ok: true }), { status: 202 });
  }) as typeof fetch);
  assert.deepEqual(accepted, { ok: true });
  assert.equal(url, OFFICIAL_JOBS_SIMILAR_REQUEST_PATH);

  // The server could not read the CV and went on with the LinkedIn only.
  const resumeIgnored = await sendOfficialJobsSimilarRequest(base, (async () =>
    new Response(JSON.stringify({ ok: true, resumeIgnored: true }), { status: 202 })) as typeof fetch);
  assert.deepEqual(resumeIgnored, { ok: true, resumeIgnored: true });
  const emptyAccepted = await sendOfficialJobsSimilarRequest(base, (async () =>
    new Response(null, { status: 202 })) as typeof fetch);
  assert.deepEqual(emptyAccepted, { ok: true });

  const limited = await sendOfficialJobsSimilarRequest(base, (async () =>
    new Response(JSON.stringify({ code: "RATE_LIMIT", error: "잠시 뒤 다시 시도해 주세요." }), {
      status: 429,
    })) as typeof fetch);
  assert.deepEqual(limited, { ok: false, code: "RATE_LIMIT", error: "잠시 뒤 다시 시도해 주세요." });

  const broken = await sendOfficialJobsSimilarRequest(base, (async () =>
    new Response("oops", { status: 500 })) as typeof fetch);
  assert.deepEqual(broken, { ok: false, code: "FAILED", error: "" });

  const offline = await sendOfficialJobsSimilarRequest(base, (async () => {
    throw new TypeError("network");
  }) as typeof fetch);
  assert.deepEqual(offline, { ok: false, code: "FAILED", error: "" });
});
