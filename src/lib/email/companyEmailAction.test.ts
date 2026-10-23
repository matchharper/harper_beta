import assert from "node:assert/strict";
import test from "node:test";
import { OrgHttpError } from "@/lib/org/httpError";
import { WorkspaceBillingError, billingErrorCopy } from "@/lib/org/billing/types";
import { EmailPermanentError } from "./runtime/types";
import {
  acceptedConnectionStatusFromTags,
  classifyCompanyEmailActionError,
  companyEmailActionLocale,
  parseCompanyEmailActionInput,
} from "./companyEmailAction";
import {
  companyEmailActionCopy,
  companyEmailActionText,
  companyEmailCandidateStatusLabel,
} from "./companyEmailActionCopy";

const classify = (error: unknown, stillActionable = false, action: "request_intro" | "pass" | "accept_connection" = "request_intro", locale: "ko" | "en" = "ko") =>
  classifyCompanyEmailActionError(error, { action, locale, stillActionable });

test("a decision made elsewhere is recorded; the same refusal on an open candidate is not", () => {
  assert.deepEqual(classify(new OrgHttpError(409, "이미 처리되었거나 답변을 기다리는 후보자입니다.")), { kind: "handled_elsewhere" });
  // Role paused or ended, candidate visibility changed: the server message stays as is.
  assert.deepEqual(classify(new OrgHttpError(409, "현재 이 역할에는 먼저 제안할 수 없습니다."), true),
    { kind: "error", message: "현재 이 역할에는 먼저 제안할 수 없습니다." });
  assert.deepEqual(classify(new OrgHttpError(409, "후보자의 공개 또는 추천 수신 설정이 바뀌어 먼저 제안할 수 없습니다."), true),
    { kind: "error", message: "후보자의 공개 또는 추천 수신 설정이 바뀌어 먼저 제안할 수 없습니다." });
  assert.deepEqual(classify({ message: "company_intro_not_passable" }, false, "pass"), { kind: "handled_elsewhere" });
});

test("billing, permission, recipient and unknown failures are shown but never recorded", () => {
  const billing = classify(new WorkspaceBillingError("credits_exhausted"));
  assert.deepEqual(billing, { kind: "error", message: billingErrorCopy("credits_exhausted", "ko") });
  const copy = companyEmailActionCopy("ko");
  assert.deepEqual(classify(new OrgHttpError(403, "Forbidden")), { kind: "error", message: copy.noPermission });
  assert.equal(copy.noPermission, "이 후보는 볼 수 있지만 결정은 할 수 없어요. Owner나 Admin에게 요청해 주세요.");
  assert.deepEqual(classify(new EmailPermanentError("company_email_membership_revoked")), { kind: "error", message: copy.recipientInvalid });
  assert.deepEqual(classify(new Error("socket hang up")), { kind: "error", message: copy.unknown });
  assert.match(copy.unknown, /^처리 결과를 확인하지 못했어요\./);
  assert.deepEqual(classify(new OrgHttpError(400, "후보자에게 전할 회사의 관심 이유를 입력해 주세요."), true),
    { kind: "field_error", message: "후보자에게 전할 회사의 관심 이유를 입력해 주세요." });
  assert.equal(classify(new Error("x"), false, "request_intro", "en").kind, "error");
  assert.match((classify(new Error("x"), false, "request_intro", "en") as { message: string }).message, /couldn't confirm/);
});

test("only Request intro needs the interest reason", () => {
  assert.deepEqual(parseCompanyEmailActionInput("request_intro", { appeal: "   " }, "ko"), { fieldError: "관심 이유를 한 줄 이상 적어 주세요." });
  assert.deepEqual(parseCompanyEmailActionInput("request_intro", { appeal: " 결제 경험 " }, "ko"), { appeal: "결제 경험" });
  assert.ok("fieldError" in parseCompanyEmailActionInput("request_intro", { appeal: "a".repeat(2001) }, "en"));
  assert.deepEqual(parseCompanyEmailActionInput("pass", {}, "ko"), { appeal: "" });
  assert.deepEqual(parseCompanyEmailActionInput("reject_connection", null, "ko"), { appeal: "" });
});

test("Ready to connect stays open only until another stage is recorded", () => {
  assert.deepEqual(acceptedConnectionStatusFromTags(["내부:연결대기"]), { actionable: true, status: "pending_connection" });
  assert.deepEqual(acceptedConnectionStatusFromTags(["내부:연결대기", "내부:연결됨"]), { actionable: false, status: "connected" });
  assert.deepEqual(acceptedConnectionStatusFromTags(["내부:프로세스중단"]), { actionable: false, status: "process_stopped" });
  assert.equal(acceptedConnectionStatusFromTags(["내부단계:abc"]).actionable, false);
  assert.deepEqual(acceptedConnectionStatusFromTags([]), { actionable: false, status: "unavailable" });
  assert.equal(companyEmailCandidateStatusLabel({ status: "connected" }, "ko"), "연결됨");
  assert.equal(companyEmailCandidateStatusLabel({ status: "awaiting_talent", candidateSentAt: "2026-10-22" }, "ko"), "후보자 답변 대기");
});

test("confirm copy follows the copy document and has an English counterpart", () => {
  const request = companyEmailActionText("ko", "request_intro", "김민준", "jisoo@example.com");
  assert.equal(request.title, "김민준님에게 먼저 제안할까요?");
  assert.equal(request.confirm, "제안 확정하기");
  assert.equal(request.doneTitle, "먼저 제안을 요청했어요. 지금 후보에게 전달할 준비를 하고 있어요.");
  assert.equal(request.doneDescription, "김민준님이 수락하면 jisoo@example.com로 소개 메일이 가요.");
  assert.equal(companyEmailActionText("ko", "pass", "김민준", "").confirm, "제외 확정하기");
  assert.equal(companyEmailActionText("ko", "accept_connection", "김민준", "").title, "김민준님과 연결할까요?");
  assert.equal(companyEmailActionText("ko", "reject_connection", "김민준", "").confirm, "거절 확정하기");
  assert.equal(companyEmailActionCopy("ko").actingAs("김지수", "jisoo@example.com"), "김지수님(jisoo@example.com)으로 처리돼요");
  assert.equal(companyEmailActionCopy("ko").introEmailNotice("jisoo@example.com"), "소개 메일은 jisoo@example.com로 가요.");
  assert.equal(companyEmailActionCopy("ko").expired, "이 버튼은 기간이 지났어요.");
  assert.equal(companyEmailActionCopy("ko").notFound, "링크를 찾지 못했어요.");
  assert.equal(companyEmailActionText("en", "accept_connection", "Minjun", "").confirm, "Confirm connection");
  assert.equal(companyEmailActionCopy("en").actingAs("Jisoo", "j@example.com"), "Acting as Jisoo (j@example.com)");
});

test("links that do not exist answer in the browser language", () => {
  assert.equal(companyEmailActionLocale("ko-KR,ko;q=0.9"), "ko");
  assert.equal(companyEmailActionLocale("en-US"), "en");
  assert.equal(companyEmailActionLocale(null), "en");
});
