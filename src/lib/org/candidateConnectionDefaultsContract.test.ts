import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const execution = readFileSync(
  new URL("./agent/toolExecution.ts", import.meta.url),
  "utf8"
);
const dialog = readFileSync(
  new URL(
    "../../components/org/OrgCandidateDecisionDialogs.tsx",
    import.meta.url
  ),
  "utf8"
);
const webCallSites = [
  "../../components/org/OrgPipeline.tsx",
  "../../components/org/OrgRoleTalentBoard.tsx",
  "../../components/org/TalentDetailSimpleView.tsx",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

test("company-side LLM defaults both preparation and execution to a CC introduction", () => {
  const defaultedMethods = execution.match(
    /decision === "accept" \? \(requestedConnectionMethod \?\? "intro_email"\) : null/g
  );

  assert.equal(defaultedMethods?.length, 2);
  assert.doesNotMatch(
    execution,
    /must choose CC introduction or direct contact before accepting/
  );
  assert.match(execution, /immediatelyPresentedCandidateDecision/);
  assert.match(execution, /status: "confirmation_required"/);
  assert.match(execution, /Email intro로 연결하면 Harper가 후보자와/);
  assert.match(execution, /previousStage !== "pending_connection"/);
  assert.match(execution, /End connection을 진행할까요/);
});

test("web connection choices are exposed only to matchharper.com accounts", () => {
  assert.match(
    dialog,
    /const usesDirectContact = allowContactDirectly && contactDirectly/
  );
  assert.match(dialog, /\{allowContactDirectly \? \(/);
  for (const callSite of webCallSites) {
    assert.match(
      callSite,
      /allowContactDirectly=\{isInternalDomainEmail\(currentUserEmail\)\}/
    );
  }
});

test("web candidate decisions use the career modal as a mobile bottom sheet", () => {
  assert.match(
    dialog,
    /import TalentCareerModal from "@\/components\/common\/TalentCareerModal"/
  );
  assert.equal(dialog.match(/<TalentCareerModal/g)?.length, 2);
  assert.equal(dialog.match(/mobileBottomSheet/g)?.length, 2);
  assert.doesNotMatch(dialog, /@\/components\/ui\/dialog/);
  assert.match(dialog, /form=\{acceptFormId\}/);
  assert.match(dialog, /form=\{stopFormId\}/);
  assert.equal(dialog.match(/closeOnBackdrop=\{!pending\}/g)?.length, 2);
});

test("the acceptance dialog presents a compact introduction email confirmation", () => {
  assert.match(dialog, /Send intro & connect/);
  assert.match(dialog, /aria-label="Email intro"/);
  assert.match(dialog, /Recipients/);
  assert.match(dialog, /메일 내용 보기/);
  assert.match(dialog, /Connection note/);
  assert.match(dialog, /보낸 이메일은 회수할 수 없어요/);
  assert.doesNotMatch(dialog, /Gmail 연결 메일 상세/);
  assert.doesNotMatch(dialog, /함께 연결할 멤버/);
  assert.doesNotMatch(dialog, /후보자측에 공유되지 않습니다/);
});

test("the rejection dialog makes the candidate-visible irreversible result explicit", () => {
  assert.match(dialog, /Reject candidate/);
  assert.match(dialog, /연결을 거절하는 이유/);
  assert.match(dialog, /종료 결정이 표시되고 Harper가 이를 안내해요/);
  assert.match(dialog, /보이거나 전달된 안내는 회수할 수 없어요/);
  assert.match(dialog, /connectionStarted \? "warn" : "critical"/);
  assert.doesNotMatch(dialog, /Pass 이유 \(선택\)/);
  assert.match(dialog, /variant=\{connectionStarted \? "warn" : "critical"\}/);
});
