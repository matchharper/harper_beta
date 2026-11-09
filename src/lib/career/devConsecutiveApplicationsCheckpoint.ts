// Private account data stays in the ignored local snapshot, never in the bundle.
export const CONSECUTIVE_APPLICATIONS_CHECKPOINT = {
  file: ".local/consecutive-applications/baseline-six-opportunities.json",
  sha256: "305a0b34a2af27d9bb99edcb3db3ff0515b989dad42652824223c06bcde1547c",
  label: "연속 지원 QA · 11/08 계정 기준 · 공고 6개",
};

// Separate frozen retest state; preserves the real introduction made after v1.
export const POST_INTRODUCTION_APPLICATION_CHECKPOINT = {
  file: ".local/consecutive-applications/baseline-post-introduction.json",
  sha256: "f7aead5a29f9b9430bd3b0132569c40193c42971774f4e2594b5ae2160d85f41",
  label: "지원 재검증 · 2026-11-09 11:01 KST · 기존 소개 기록 보존",
};

export const COMPANY_EXPLORATION_CHECKPOINT = {
  file: ".local/consecutive-applications/baseline-company-exploration.json",
  sha256: "dc7c692dad48e32cec8513549671b5e34f7fec11b81d85170405d620f12b3e49",
  label: "회사 진입 경로 QA · 2026-11-09 11:24 KST · 기존 활동 보존",
};

export const POST_MAIL_COMPANY_EXPLORATION_CHECKPOINT = {
  file: ".local/consecutive-applications/baseline-company-exploration-post-mail.json",
  sha256: "0a98e1ad0a82b9d6e7c8ff214d26cca7bc3646fe7f09951d239482d47e4590c4",
  label: "회사 진입 경로 재검증 · 2026-11-09 11:39 KST · 새 이메일 요청 보존",
};
