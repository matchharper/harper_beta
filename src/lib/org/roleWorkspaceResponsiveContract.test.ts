import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const roleWorkspace = readFileSync(
  new URL(
    "../../components/org/workspace/pages/OrgRoleCreationPage.tsx",
    import.meta.url
  ),
  "utf8"
);
const talentDetail = readFileSync(
  new URL("../../components/org/TalentDetailSimpleView.tsx", import.meta.url),
  "utf8"
);
const talentBoard = readFileSync(
  new URL("../../components/org/OrgRoleTalentBoard.tsx", import.meta.url),
  "utf8"
);
const talentPipeline = readFileSync(
  new URL("../../components/org/OrgPipeline.tsx", import.meta.url),
  "utf8"
);
const orgServer = readFileSync(new URL("./server.ts", import.meta.url), "utf8");

test("talent detail escapes transformed role panels through a body portal", () => {
  assert.match(talentDetail, /import \{ createPortal \} from "react-dom"/);
  assert.match(talentDetail, /return createPortal\([\s\S]*document\.body/);
});

test("mobile role pipeline always uses the board without a display menu", () => {
  assert.match(
    roleWorkspace,
    /const resolvedDisplay = mobile \? "board" : display/
  );
  assert.match(roleWorkspace, /const displayControl = mobile \? null : \(/);
  assert.match(
    roleWorkspace,
    /mobile \|\| requestedView === "board" \? "board" : "pipeline"/
  );
  assert.match(
    talentBoard,
    /\{displayControl \? \([\s\S]*\{displayControl\}[\s\S]*\) : null\}/
  );
});

test("board cards open from the full surface and keep actions independent", () => {
  assert.match(
    talentBoard,
    /<CardButton[\s\S]*?onClick=\{onOpen\}[\s\S]*?<\/CardButton>/
  );
  assert.match(talentBoard, /pointer-events-auto mt-6/);
});

test("board cards show up to four recent experiences responsively", () => {
  assert.match(talentBoard, /recentCompanies\.slice\(0, 4\)/);
  assert.match(talentBoard, /return `\$\{role\} at \$\{companyName\}`/);
  assert.match(talentBoard, /size-3[\s\S]*md:size-7/);
  assert.match(talentBoard, /line-clamp-2[\s\S]*getExperienceTitle\(company\)/);
  assert.match(talentBoard, /function formatExperienceYearPeriod/);
  assert.match(talentBoard, /formatExperienceYearPeriod\(company\.period\)/);
});

test("board cards show candidate-specific company criteria evaluations", () => {
  assert.doesNotMatch(talentBoard, /<MatchSignal/);
  assert.doesNotMatch(talentBoard, /highlights\.slice/);
  assert.match(talentBoard, /item\.criteriaEvaluations\.length > 0/);
  assert.match(talentBoard, /평가 기준별 적합도/);
  assert.match(talentBoard, /evaluation\.name/);
  assert.match(talentBoard, /evaluation\.content/);
  assert.match(talentBoard, /CRITERIA_FITNESS_PRESENTATION/);
  assert.match(orgServer, /company_criteria_evaluations/);
  assert.match(orgServer, /normalizeOrgCompanyCriteriaEvaluations/);
  assert.match(orgServer, /criteriaEvaluationsByKey/);
});

test("role board and pipeline provide candidate lists to detail navigation", () => {
  assert.match(
    talentBoard,
    /selectTalent\([\s\S]*?item,[\s\S]*?items,[\s\S]*?getStageLabel\(selectedStage, activeRole\?\.name \?\? null\)/
  );
  assert.match(talentPipeline, /onSelect\(selectedItem, items, stage\.label\)/);
  assert.match(talentDetail, /<TalentDetailPager[\s\S]*navigation=/);
  assert.match(talentDetail, /useOptionalOrgJobsBoard\(\)/);
  assert.match(
    talentDetail,
    /filter\(\(item\) => item\.stage === detail\.recommendation\.stage\)/
  );
  assert.match(talentDetail, /resolvedTalentNavigationLabel/);
});

test("mobile talent detail uses compact navigation, decision actions, and shared tabs", () => {
  assert.match(talentDetail, /<ChevronLeft[^>]*className="size-4\.5"/);
  assert.match(talentDetail, /bg-critical text-neutral-00/);
  assert.match(talentDetail, /bg-positive text-neutral-00/);
  assert.match(talentDetail, /variant="pills-elevated"/);
  assert.match(
    talentDetail,
    /currentStage === "pending_connection" \? null : \(/
  );
});

test("pending connection detail uses a neutral decision card", () => {
  assert.match(talentDetail, /연결 여부를 결정해 주세요/);
  assert.match(talentDetail, /\{candidateName\}와 연결을 진행할까요\?/);
  assert.match(talentDetail, /CANDIDATE_DECISION_LABELS\.connect/);
  assert.match(talentDetail, /CANDIDATE_DECISION_LABELS\.reject/);
  assert.match(
    talentDetail,
    /aria-label="후보자 연결 결정"[\s\S]*?bg-bg-default[\s\S]*?variant="positive"[\s\S]*?variant="critical"/
  );
  assert.doesNotMatch(talentDetail, /결정이 필요합니다/);
  assert.doesNotMatch(talentDetail, /이 후보자를 만나보겠습니다/);
  assert.doesNotMatch(talentDetail, /이번에는 연결받지 않겠습니다/);
});
