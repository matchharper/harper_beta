import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGmailCareerHistorySummaryInstruction,
  normalizeGmailCareerEntries,
  renderGmailCareerHistoryMarkdown,
} from "./gmailCareerHistoryCore";

test("asks for a compact localized summary without repeating company or role", () => {
  const koreanInstruction =
    buildGmailCareerHistorySummaryInstruction("Korean");
  assert.match(koreanInstruction, /Write summary in Korean/);
  assert.match(koreanInstruction, /Do not repeat their actual names/);
  assert.match(koreanInstruction, /해당 직무 지원, 이후 기록 없음/);
  assert.match(koreanInstruction, /최종 결과 없음/);

  const englishInstruction =
    buildGmailCareerHistorySummaryInstruction("English");
  assert.match(englishInstruction, /Write summary in English/);
  assert.match(englishInstruction, /Applied; no later record/);
  assert.match(englishInstruction, /no final result/);
});

test("normalizes and orders while preserving separate application cycles", () => {
  const entries = normalizeGmailCareerEntries({
    entries: [
      {
        appliedAt: "2026-01-01T00:00:00.000Z",
        company: "Acme",
        endedAt: null,
        role: "Engineer",
        summary: "Application confirmation",
      },
      {
        appliedAt: "2026-03-01T00:00:00.000Z",
        company: " Acme ",
        endedAt: null,
        role: "Engineer",
        summary: "A separate application cycle reached an interview.",
      },
      {
        appliedAt: "not-a-date",
        company: "Beta Labs",
        endedAt: "2026-02-15T00:00:00.000Z",
        role: null,
        summary: "A role-specific resume was sent and the process ended.",
      },
      {
        appliedAt: null,
        company: "",
        endedAt: null,
        role: null,
        summary: "Must be ignored",
      },
    ],
  });

  assert.deepEqual(entries, [
    {
      appliedAt: "2026-03-01",
      company: "Acme",
      endedAt: null,
      role: "Engineer",
      summary: "A separate application cycle reached an interview.",
    },
    {
      appliedAt: null,
      company: "Beta Labs",
      endedAt: "2026-02-15",
      role: null,
      summary: "A role-specific resume was sent and the process ended.",
    },
    {
      appliedAt: "2026-01-01",
      company: "Acme",
      endedAt: null,
      role: "Engineer",
      summary: "Application confirmation",
    },
  ]);
});

test("does not merge employers whose names overlap", () => {
  const entries = normalizeGmailCareerEntries({
    entries: [
      {
        appliedAt: "2025-05-08",
        company: "Toss",
        endedAt: null,
        role: "ML Engineer",
        summary: "Applied and advanced to an interview.",
      },
      {
        appliedAt: "2024-09-30",
        company: "Toss Bank",
        endedAt: null,
        role: "Data Scientist",
        summary: "Application received.",
      },
    ],
  });

  assert.deepEqual(
    entries.map((entry) => entry.company),
    ["Toss", "Toss Bank"]
  );
});

test("renders each application as one compact Markdown line", () => {
  const markdown = renderGmailCareerHistoryMarkdown({
    entries: [
      {
        appliedAt: "2026-01-12",
        company: "Acme",
        endedAt: "2026-03-09",
        role: "Engineer",
        summary: "Applied and later scheduled an interview.",
      },
      {
        appliedAt: null,
        company: "Beta Labs",
        endedAt: "2025-12-04",
        role: null,
        summary: "The process ended after a final interview.",
      },
      {
        appliedAt: null,
        company: "Gamma",
        endedAt: null,
        role: "Product Engineer",
        summary: "A role-specific resume was submitted.",
      },
      {
        appliedAt: "2025-05-08",
        company: "Toss",
        endedAt: null,
        role: "ML Engineer (Image Generation)",
        summary:
          "Applied and passed screening and the first job interview, with a second interview scheduled.",
      },
    ],
  });

  assert.equal(
    markdown,
    [
      "- Acme - Engineer : 2026.01.12 ~ 2026.03.09, Applied and later scheduled an interview.",
      "- Beta Labs : ~ 2025.12.04, The process ended after a final interview.",
      "- Gamma - Product Engineer : A role-specific resume was submitted.",
      "- Toss - ML Engineer (Image Generation) : 2025.05.08, Applied and passed screening and the first job interview, with a second interview scheduled.",
      "",
    ].join("\n")
  );
  assert.doesNotMatch(markdown, /Not confirmed|Application date|End date/);
});

test("renders an explicit empty result instead of inventing history", () => {
  const markdown = renderGmailCareerHistoryMarkdown({
    entries: [],
  });

  assert.equal(markdown, "- No reliable application history found.\n");
});
