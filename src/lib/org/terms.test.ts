import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ALL_COMPANY_TERMS,
  COMPANY_TERMS,
  companyStageName,
  companyTermsPrompt,
  withKoreanRo,
} from "@/lib/org/terms";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Everything a company sees or Harper reads as company copy. */
const COMPANY_FACING = [
  "src/components/org",
  "src/components/review-pipeline",
  "src/hooks/org",
  "src/i18n/org",
  "src/lib/org",
  "src/lib/companyFirstSearch/candidateDigestEmail.ts",
  "src/lib/email/companyEmailAction.ts",
  "src/lib/email/companyEmailActionCopy.ts",
  "src/app/api/org",
  "src/components/progress-feed/OrgIntroEmailFeedCard.tsx",
  "src/lib/companyFirstSearch/resultContext.ts",
  "src/lib/email/companyEmailAction.server.ts",
  "src/pages/slack.tsx",
  "src/content/org-documents.md",
  "src/content/org-documents.en.md",
  "docs/company-side-agent-engineering-contract-ko.md",
  "src/lib/ops/autoIntroToCompanyMessage.ts",
  "src/lib/ops/autoIntroToCompanyPolicy.ts",
  "src/lib/ops/autoIntroToCompanyNotifications.ts",
  "src/app/api/internal/slack/interactivity/route.ts",
  "src/app/api/internal/org-agent/slack-turn/route.ts",
  "src/app/api/internal/company-first/result-notice/route.ts",
  "src/lib/meetings/scheduleDraftServer.ts",
  "src/lib/agentContacts/introductionContext.ts",
];

/**
 * English model instructions may keep the data's working names (the Brief is
 * company_internal_roles.request); Harper's name table tells it what to call
 * them. Korean text there is still copy.
 */
const INSTRUCTION_DIR = path.join("src", "lib", "org", "agent");
const WORKING_NAMES = new Set(["Hiring Brief", "Brief", "Evaluation Criteria", "TL;DR", "Harper Note"]);
/** The ops candidate brief keeps its working labels in the model format; it renders current names. */
const WORKING_NAME_FILES = [INSTRUCTION_DIR, path.join("src", "lib", "ops", "autoIntroToCompanyMessage.ts")];

function files(entry: string): string[] {
  const full = path.join(ROOT, entry);
  if (!statSync(full).isDirectory()) return [full];
  return readdirSync(full).flatMap((name) => files(path.join(entry, name)));
}

/** Code comments may name things however developers do; only copy counts. */
function withoutComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/**
 * A one-word English former name ("Pass", "Brief") is only wrong as a whole
 * label or inside Korean copy; it is still an ordinary word in English text
 * ("Pass for now") and a part of identifiers.
 */
/** Korean copy, not an English sentence that quotes a few Korean words. */
function koreanText(text: string) {
  const hangul = text.match(/[가-힣]/g)?.length ?? 0;
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  return hangul > 0 && hangul >= 0.25 * (hangul + latin);
}

function formerPattern(former: string, koreanOnly = false) {
  const escaped = former.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const inKorean = `(\\b${escaped}s?(?= ?[가-힣]))|((?<=[가-힣] ?)\\b${escaped}s?\\b)`;
  // The Korean side of c("…", "…") or a { ko: "…" } label is Korean copy too.
  const koreanSlot = `(\\bc\\(\\s*|\\bko:\\s*)["'\`]${escaped}["'\`]`;
  if (koreanOnly) return new RegExp(`${inKorean}|${koreanSlot}`);
  if (/^[A-Za-z]+$/.test(former)) {
    return new RegExp(`(["'\`>]\\s*${escaped}\\s*["'\`<])|${inKorean}`);
  }
  // Stored tags such as 내부:아카이브 are values, not names.
  return new RegExp(`(?<!내부:)${escaped}`);
}

test("former company names are written only in terms.ts", () => {
  const checks = ALL_COMPANY_TERMS.flatMap((value) => [
    ...value.former.map((former) => ({
      former,
      current: value.ko,
      koreanOnly: false,
      pattern: formerPattern(former),
    })),
    ...value.formerKo.map((former) => ({
      former,
      current: value.ko,
      koreanOnly: true,
      pattern: formerPattern(former, true),
    })),
  ]);
  const hits: string[] = [];
  for (const file of COMPANY_FACING.flatMap(files)) {
    if (!/\.(tsx?|md)$/.test(file) || /\.test\.tsx?$/.test(file)) continue;
    if (file.endsWith(path.join("lib", "org", "terms.ts"))) continue;
    const source = readFileSync(file, "utf8");
    const text = file.endsWith(".md") ? source : withoutComments(source);
    text.split("\n").forEach((line, index) => {
      // Readers of records written before stage values existed keep the old words.
      if (source.split("\n")[index]?.includes("legacy-text")) return;
      for (const check of checks) {
        if (
          WORKING_NAME_FILES.some((dir) => file.includes(dir)) &&
          WORKING_NAMES.has(check.former) &&
          !koreanText(line)
        ) {
          continue;
        }
        if (check.pattern.test(line)) {
          hits.push(`${path.relative(ROOT, file)}:${index + 1} "${check.former}" -> "${check.current}"`);
        }
      }
    });
  }
  assert.deepEqual(hits, []);
});

test("every stored pipeline stage has one name, and names are unique per meaning", () => {
  for (const stage of [
    "company_intro",
    "pending_connection",
    "intro_requested",
    "connected",
    "final_offer",
    "process_stopped",
    "archived",
    "accepted",
  ]) {
    assert.ok(companyStageName(stage, "ko"), stage);
    assert.ok(companyStageName(stage, "en"), stage);
  }
  assert.equal(companyStageName("custom:abc", "ko"), null);
  const formers = ALL_COMPANY_TERMS.flatMap((value) => value.former);
  const currents = new Set(ALL_COMPANY_TERMS.flatMap((value) => [value.ko, value.en]));
  for (const former of formers) assert.ok(!currents.has(former), `${former} is both former and current`);
});

test("Harper's name table carries stored values, current names and former names", () => {
  const ko = companyTermsPrompt("ko");
  assert.match(ko, /^- process_stopped = 진행 종료 \(예전 프로세스 중단, 프로세스 종료, Process ended\)$/m);
  assert.match(ko, /^- 연결하기 \(예전 Accept Intro\)$/m);
  assert.match(ko, /^- 연결 \(예전 Intro, 크레딧, Credit\)$/m);
  assert.match(companyTermsPrompt("en"), /^- Intro \(formerly 크레딧, Credit\)$/m);
  assert.match(companyTermsPrompt("en"), /^- pending_connection = Waiting to connect \(formerly /m);
  assert.ok(ko.includes(COMPANY_TERMS.brief.whoWeAreLookingFor.ko));
});

test("Korean (으)로 follows the last syllable of a name", () => {
  assert.equal(withKoreanRo("연결을 요청할 후보"), "연결을 요청할 후보로");
  assert.equal(withKoreanRo("연결 요청함"), "연결 요청함으로");
  assert.equal(withKoreanRo("연결됨"), "연결됨으로");
  assert.equal(withKoreanRo("보관"), "보관으로");
  assert.equal(withKoreanRo("1차 인터뷰"), "1차 인터뷰로");
  assert.equal(withKoreanRo("기술 면접 (2차)"), "기술 면접 (2차)(으)로");
});
