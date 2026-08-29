import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeProfessionalQuestion } from "@/lib/companyTalentRequests/policy";

test("relay policy accepts a neutral professional request without classifying it", () => {
  assert.equal(
    assertSafeProfessionalQuestion(
      "초기 단계의 소규모 팀 환경도 적극적으로 검토하는지 확인"
    ),
    "초기 단계의 소규모 팀 환경도 적극적으로 검토하는지 확인"
  );
});

test("relay policy does not reject a request merely because it has related questions", () => {
  assert.equal(
    assertSafeProfessionalQuestion(
      "소규모 팀도 괜찮으신가요? 합류 시점은 언제쯤 가능하신가요?"
    ),
    "소규모 팀도 괜찮으신가요? 합류 시점은 언제쯤 가능하신가요?"
  );
});

test("relay policy allows age and nationality questions", () => {
  for (const request of [
    "후보자의 나이와 생년월일, 국적, 출신 국가, 시민권, 영주권 확인",
    "Confirm the candidate's age, birth date, nationality, citizenship, and residency",
  ]) {
    assert.equal(assertSafeProfessionalQuestion(request), request);
  }
});

test("relay policy blocks remaining sensitive questions without requiring a question enum", () => {
  assert.throws(() =>
    assertSafeProfessionalQuestion("후보자의 결혼 여부와 건강 상태 확인")
  );
  assert.equal(
    assertSafeProfessionalQuestion(
      "현재 희망 연봉을 어떤 표현으로 공유할지 확인"
    ),
    "현재 희망 연봉을 어떤 표현으로 공유할지 확인"
  );
});
