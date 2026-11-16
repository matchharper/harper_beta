import assert from "node:assert/strict";
import test from "node:test";
import { correspondenceProgressText } from "./data";

// #105: the stage-change projection stores the team's reason in the progress
// text. A run that can write to the candidate side reads the stage change only.
test("a correspondence run reads a stage change without the team's stop or accept reason", () => {
  const stopped = { kind: "org_stage_change", text: "회사에서 이 역할의 채용 프로세스를 중단했습니다.\n이유: 연봉 기대치가 예산보다 높음" };
  const accepted = { kind: "org_stage_change", text: "회사에서 이 역할의 진행을 수락했습니다.\n이유: 도메인 경험" };
  const moved = { kind: "org_stage_change", text: "연결 대기에서 연결됨으로 옮기고 직접 연락하기로 했습니다.\n수락 이유: 빠른 합류" };
  assert.equal(correspondenceProgressText(stopped, true), "회사에서 이 역할의 채용 프로세스를 중단했습니다.");
  assert.equal(correspondenceProgressText(accepted, true), "회사에서 이 역할의 진행을 수락했습니다.");
  assert.doesNotMatch(correspondenceProgressText(moved, true), /이유|빠른 합류/);
  // The team's own reads keep the full record, and other kinds are unchanged.
  assert.match(correspondenceProgressText(stopped, false), /연봉 기대치/);
  const activity = { kind: "org_candidate_activity", text: "커피챗 진행\n이유: 팀원이 남긴 기록" };
  assert.equal(correspondenceProgressText(activity, true), activity.text);
});
