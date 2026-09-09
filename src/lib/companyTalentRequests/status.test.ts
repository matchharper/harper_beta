import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCompanyTalentRequestStatus } from "./status";

const NOW = Date.parse("2026-09-08T00:00:00.000Z");
const FUTURE = "2026-09-15T00:00:00.000Z";

test("company talent request statuses preserve every completed milestone", () => {
  const cases = [
    {
      input: { workflow_status: "draft" },
      expected:
        "후보자 메일 초안 작성됨 · 발송 전 · 후보자 답변 수신 전 · 회사 전달 전",
    },
    {
      input: {
        candidate_delivery_status: "queued",
        workflow_status: "queued",
      },
      expected:
        "후보자 메일 초안 확정됨 · 발송 예정 · 후보자 답변 수신 전 · 회사 전달 전",
    },
    {
      input: {
        candidate_delivery_status: "processing",
        workflow_status: "queued",
      },
      expected:
        "후보자 메일 초안 확정됨 · 발송 중 · 후보자 답변 수신 전 · 회사 전달 전",
    },
    {
      input: {
        candidate_delivery_status: "sent",
        workflow_status: "awaiting_talent",
      },
      expected:
        "후보자 메일 발송됨 · 후보자 답변 대기 · 발송 후 답변 기한 없음 · 회사 전달 전",
    },
    {
      input: {
        candidate_delivery_status: "sent",
        company_delivery_status: "queued",
        has_candidate_response: true,
        workflow_status: "relay_queued",
      },
      expected: "후보자 메일 발송됨 · 후보자 답변 수신됨 · 회사 전달 준비 중",
    },
    {
      input: {
        candidate_delivery_status: "sent",
        company_delivery_status: "cancelled",
        has_candidate_response: true,
        workflow_status: "review_required",
      },
      expected: "후보자 메일 발송됨 · 후보자 답변 수신됨 · 회사 전달 보류",
    },
    {
      input: {
        candidate_delivery_status: "sent",
        company_delivery_status: "sent",
        has_candidate_response: true,
        workflow_status: "delivered",
      },
      expected: "후보자 메일 발송됨 · 후보자 답변 수신됨 · 회사 전달됨",
    },
  ] as const;

  for (const { input, expected } of cases) {
    assert.equal(
      summarizeCompanyTalentRequestStatus({
        ...input,
        expires_at: FUTURE,
        now: NOW,
      }).status,
      expected
    );
  }
});

test("company talent request statuses distinguish failures, cancellation, and expiry", () => {
  assert.deepEqual(
    summarizeCompanyTalentRequestStatus({
      candidate_delivery_status: "failed",
      expires_at: FUTURE,
      now: NOW,
      workflow_status: "failed",
    }),
    {
      candidateEmail: "초안 작성됨 · 발송 실패",
      candidateResponse: "수신 전",
      companyRelay: "전달 전",
      status:
        "후보자 메일 초안 작성됨 · 발송 실패 · 후보자 답변 수신 전 · 회사 전달 전",
    }
  );

  assert.equal(
    summarizeCompanyTalentRequestStatus({
      candidate_delivery_status: "cancelled",
      candidate_cancellation_source: "company",
      expires_at: "2026-09-07T00:00:00.000Z",
      now: NOW,
      workflow_status: "closed",
    }).status,
    "후보자 메일 초안 작성됨 · 회사 요청으로 발송 취소됨 · 후보자 답변 수신 전 · 회사 전달 전"
  );

  assert.equal(
    summarizeCompanyTalentRequestStatus({
      candidate_delivery_status: "sent",
      expires_at: "2026-09-07T00:00:00.000Z",
      now: NOW,
      workflow_status: "closed",
    }).status,
    "후보자 메일 발송됨 · 후보자 답변 대기 · 발송 후 답변 기한 없음 · 회사 전달 전"
  );

  assert.equal(
    summarizeCompanyTalentRequestStatus({
      candidate_delivery_status: "queued",
      expires_at: "2026-09-07T00:00:00.000Z",
      now: NOW,
      workflow_status: "queued",
    }).status,
    "후보자 메일 초안 작성됨 · 발송하지 않고 종료 · 후보자 답변 수신 전 · 회사 전달 전"
  );

  assert.equal(
    summarizeCompanyTalentRequestStatus({
      expires_at: FUTURE,
      now: NOW,
      workflow_status: "closed",
    }).status,
    "후보자 메일 초안 작성됨 · 회사 요청으로 발송 취소됨 · 후보자 답변 수신 전 · 회사 전달 전"
  );

  assert.equal(
    summarizeCompanyTalentRequestStatus({
      candidate_delivery_status: "sent",
      expires_at: FUTURE,
      now: NOW,
      workflow_status: "closed",
    }).status,
    "후보자 메일 발송됨 · 후보자 답변 대기 · 발송 후 답변 기한 없음 · 회사 전달 전"
  );

  assert.equal(
    summarizeCompanyTalentRequestStatus({
      candidate_delivery_status: "sent",
      company_delivery_status: "failed",
      expires_at: FUTURE,
      has_candidate_response: true,
      now: NOW,
      workflow_status: "failed",
    }).status,
    "후보자 메일 발송됨 · 후보자 답변 수신됨 · 회사 전달 실패"
  );
});

test("pre-send terminal states explain why the approved draft was not sent", () => {
  assert.equal(
    summarizeCompanyTalentRequestStatus({
      candidate_delivery_error: "stage_changed_before_send",
      candidate_delivery_status: "cancelled",
      workflow_status: "closed",
    }).candidateEmail,
    "초안 작성됨 · Role 진행 상태 변경으로 발송 취소됨"
  );

  assert.equal(
    summarizeCompanyTalentRequestStatus({
      candidate_delivery_error: "missing_talent_email",
      candidate_delivery_status: "cancelled",
      workflow_status: "failed",
    }).candidateEmail,
    "초안 작성됨 · 후보자 이메일을 확인하지 못해 미발송"
  );
});

test("a sent request only stops waiting when its Role has ended", () => {
  assert.equal(
    summarizeCompanyTalentRequestStatus({
      candidate_delivery_status: "sent",
      expires_at: "2026-09-07T00:00:00.000Z",
      now: NOW,
      role_is_open: false,
      workflow_status: "closed",
    }).candidateResponse,
    "미수신 · Role 종료"
  );
});

test("resume requests label the candidate milestone as material rather than an answer", () => {
  assert.equal(
    summarizeCompanyTalentRequestStatus({
      candidate_delivery_status: "sent",
      company_delivery_status: "sent",
      expects_document: true,
      has_candidate_response: true,
      workflow_status: "delivered",
    }).status,
    "후보자 메일 발송됨 · 후보자 자료 수신됨 · 회사 전달됨"
  );
});
