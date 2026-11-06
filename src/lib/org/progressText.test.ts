import assert from "node:assert/strict";
import test from "node:test";
import { companyProgressText, currentStageLabel } from "@/lib/org/progressText";

test("older stage-change records read with current names; company stage names stay", () => {
  const read = (text: string) => companyProgressText("org_stage_change", text);
  assert.equal(read("수락에서 아카이브로 옮겼습니다."), "Harper가 확인 중에서 보관으로 옮겼습니다.");
  assert.equal(read("연결 대기에서 최종 오퍼로 옮겼습니다."), "연결을 기다리는 후보에서 오퍼로 옮겼습니다.");
  assert.equal(read("프로세스 중단에서 연결 대기로 옮겼습니다."), "진행 종료에서 연결을 기다리는 후보로 옮겼습니다.");
  assert.equal(read("Technical Interview에서 아카이브로 옮겼습니다."), "Technical Interview에서 보관으로 옮겼습니다.");
  assert.equal(
    read("연결 수락한 후보에서 연결됨으로 옮기고 warm intro를 요청했습니다.\n수락 이유: 팀과 잘 맞음"),
    "연결을 기다리는 후보에서 연결됨으로 옮기고 소개 메일을 요청했습니다.\n수락 이유: 팀과 잘 맞음"
  );
  assert.equal(
    read("아카이브에서 수락으로 옮겼습니다. Site CTO 역할에서 이동했습니다."),
    "보관에서 Harper가 확인 중으로 옮겼습니다. Site CTO 역할에서 이동했습니다."
  );
  assert.equal(read("프로세스 중단으로 옮겼습니다."), "진행 종료로 옮겼습니다.");
  assert.equal(read("연결 요청함으로 옮겼습니다."), "연결 요청함으로 옮겼습니다.");
  assert.equal(currentStageLabel("1차 인터뷰"), "1차 인터뷰");
});

test("other system records use current names, people's own words are kept", () => {
  assert.equal(
    companyProgressText(
      "internal_process_stopped_notified",
      "Harper가 회사의 결정으로 이 역할의 프로세스 종료를 안내했습니다."
    ),
    "Harper가 회사의 결정으로 이 역할의 진행 종료를 안내했습니다."
  );
  assert.equal(companyProgressText("org_note", "아카이브로 옮길지 고민 중"), "아카이브로 옮길지 고민 중");
  assert.equal(companyProgressText("org_stage_change", "내부:아카이브"), "내부:아카이브");
  assert.equal(companyProgressText("org_stage_change", null), "");
});

test("every stage-change writer stores the stage value, so readers never depend on the words", async () => {
  // Candidate-side, Ops and Worker readers find a stopped process by
  // metadata.stage first; the sentence is only a fallback for very old rows.
  const { readFileSync } = await import("node:fs");
  const root = new URL("../../../", import.meta.url);
  for (const file of ["src/lib/org/server.ts", "src/lib/ops/matching.ts"]) {
    const source = readFileSync(new URL(file, root), "utf8");
    const writes = [...source.matchAll(/kind: "org_stage_change"/g)];
    assert.ok(writes.length > 0, file);
    for (const write of writes) {
      const before = source.slice(Math.max(0, write.index - 2500), write.index);
      const after = source.slice(write.index, write.index + 400);
      assert.match(`${before}${after}`, /\bmetadata\b[\s\S]*\bstage,|\bstage,[\s\S]*\bmetadata\b/, file);
    }
  }
});
