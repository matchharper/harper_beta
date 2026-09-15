import assert from "node:assert/strict";
import test from "node:test";

import { buildOnboardingInitialSearchStartedContent } from "./onboardingInitialSearchStartedCopy";

test("builds navigable Korean onboarding search actions for incomplete setup", () => {
  const content = buildOnboardingInitialSearchStartedContent({
    gmailConnected: false,
    hasUploadedResume: false,
    locale: "ko",
    opportunityRunId: "00000000-0000-4000-8000-000000000001",
  });

  assert.match(
    content,
    /\[Gmail 연결하기\]\(\/career\/profile\?profileSection=links\)/
  );
  assert.match(
    content,
    /\[이력서 업로드하기\]\(\/career\/profile\?profileSection=links\)/
  );
  assert.match(
    content,
    /\[초대 프로그램 확인하기\]\(\/career\?intent=referral\)/
  );
  assert.match(content, /\*\*Harper와 계속 대화하기\*\*/);
  assert.doesNotMatch(content, /\[Harper와 계속 대화하기\]\(/);
});

test("omits completed Gmail and resume actions from the English chat receipt", () => {
  const content = buildOnboardingInitialSearchStartedContent({
    gmailConnected: true,
    hasUploadedResume: true,
    locale: "en",
    opportunityRunId: "00000000-0000-4000-8000-000000000001",
  });

  assert.doesNotMatch(content, /Connect Gmail/);
  assert.doesNotMatch(content, /Upload your resume/);
  assert.match(content, /\[View the invite program\]/);
  assert.match(content, /\*\*Keep chatting with Harper\*\*/);
});
