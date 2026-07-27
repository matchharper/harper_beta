import assert from "node:assert/strict";
import test from "node:test";

import { validateRoleSummaryLanguage } from "./roleSummaryLanguage";

test("accepts a clearly English summary with a short Korean proper noun", () => {
  const result = validateRoleSummaryLanguage(
    "토스 builds financial products for customers in Korea. The company operates a large consumer platform with strong adoption. This Backend Engineer role owns payment APIs, platform reliability, and core service architecture.",
    "en"
  );

  assert.equal(result.confidentMatch, true);
  assert.equal(result.reason, "confident_english");
});

test("rejects a Korean summary stored for English", () => {
  const result = validateRoleSummaryLanguage(
    "이 회사는 인공지능 기반 제품을 개발하는 기술 기업입니다. 이 역할은 핵심 백엔드 시스템을 설계하고 제품 개발을 주도합니다. 여러 팀과 협업하며 서비스 안정성과 확장성을 책임집니다.",
    "en"
  );

  assert.equal(result.confidentMatch, false);
});

test("rejects a short fallback because its language is not confidently known", () => {
  const result = validateRoleSummaryLanguage(
    "Backend Engineer at Example AI",
    "en"
  );

  assert.equal(result.confidentMatch, false);
  assert.equal(result.reason, "insufficient_english");
});

test("accepts a clearly Korean summary containing natural English technical terms", () => {
  const result = validateRoleSummaryLanguage(
    "이 회사는 기업 고객을 위한 AI 기반 업무 자동화 제품을 개발합니다. 이 Backend Engineer 역할은 TypeScript와 Python을 사용해 API와 데이터 파이프라인을 설계하고, 서비스 안정성과 확장성을 책임집니다.",
    "ko"
  );

  assert.equal(result.confidentMatch, true);
  assert.equal(result.reason, "confident_korean");
});

test("rejects an English summary stored for Korean", () => {
  const result = validateRoleSummaryLanguage(
    "The company builds applied AI products for enterprise customers. This Backend Engineer role owns API design, data pipelines, platform reliability, and scalable service architecture.",
    "ko"
  );

  assert.equal(result.confidentMatch, false);
});
