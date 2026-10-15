import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("a single candidate option is selected without an LLM call", async () => {
  process.env.OPENAI_API_KEY ||= "test-openai-key";
  const { selectMeetingOption } = await import("./selection");
  const result = await selectMeetingOption({
    additionalMessage: null,
    candidateName: "Ito",
    options: [
      {
        dateKey: "2026-08-28",
        endAt: "2026-08-28T02:00:00.000Z",
        slotId: "slot-1",
        startAt: "2026-08-28T01:00:00.000Z",
      },
    ],
    timezone: "Asia/Seoul",
  });

  assert.equal(result.chosenSlotId, "slot-1");
  assert.equal(result.method, "single_option");
  assert.equal(result.model, null);
  assert.equal(result.companyMessage, null);
  assert.equal(result.companyMessage, null);
});

test("a stale LLM choice falls back without hiding the candidate's original options", async () => {
  process.env.OPENAI_API_KEY ||= "test-openai-key";
  const { selectMeetingOptionDeterministically } = await import("./selection");
  const submitted = [
    {
      dateKey: "2026-08-28",
      endAt: "2026-08-28T02:00:00.000Z",
      slotId: "stale-slot",
      startAt: "2026-08-28T01:00:00.000Z",
    },
    {
      dateKey: "2026-08-28",
      endAt: "2026-08-28T04:00:00.000Z",
      slotId: "valid-slot",
      startAt: "2026-08-28T03:00:00.000Z",
    },
  ];
  const result = selectMeetingOptionDeterministically({
    candidateName: "Ito",
    reportedOptions: submitted,
    timezone: "Asia/Seoul",
    validOptions: [submitted[1]],
  });

  assert.equal(result.chosenSlotId, "valid-slot");
  assert.equal(result.method, "fallback_earliest");
  assert.equal(result.companyMessage, null);
});

test("time selection does not author a company notice, regardless of locale", async () => {
  const { selectMeetingOptionDeterministically } = await import("./selection");
  const result = selectMeetingOptionDeterministically({
    candidateName: "Ito",
    locale: "en",
    timezone: "America/Los_Angeles",
    validOptions: [
      {
        dateKey: "2026-08-28",
        endAt: "2026-08-28T02:00:00.000Z",
        slotId: "slot-1",
        startAt: "2026-08-28T01:00:00.000Z",
      },
    ],
  });
  assert.equal(result.companyMessage, null);
  assert.equal(result.companyMessage, null);
});

test("public submission calls the LLM selector at most once", () => {
  const invitationServer = readFileSync(
    resolve(process.cwd(), "src/lib/meetings/invitationServer.ts"),
    "utf8"
  );

  assert.equal(
    invitationServer.match(/await selectMeetingOption\(/g)?.length,
    1
  );
  assert.match(invitationServer, /selectMeetingOptionDeterministically\(/);
  assert.match(
    invitationServer,
    /p_candidate_options: selected as unknown as Json/
  );
  assert.match(
    invitationServer,
    /timezone: result\.availability\?\.timezone \?\? snapshot\.timezone/
  );
  assert.match(
    invitationServer,
    /available\.timezone !== selectionTimezoneAtRead/
  );
  assert.match(invitationServer, /timezone: available\.timezone/);
});
