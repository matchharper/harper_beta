import { getVisibleOrgStage } from "@/lib/org/visibleStage";
import type { OrgCustomStageId } from "@/lib/org/server";
import { getOrgCompanyIntroBoardStage } from "@/lib/org/pipelineStage";
import type { CompanyDashboardRole } from "./companyDashboardTypes";

type Row = Record<string, any>;
export const COMPANY_ROLE_STAGES = [
  { id: "recommended", label: "추천됨" },
  { id: "company_intro", label: "회사 제안" },
  { id: "intro_requested", label: "Intro 요청" },
  { id: "accepted", label: "후보자 수락" },
  { id: "pending_connection", label: "연결 대기" },
  { id: "connected", label: "연결됨" },
  { id: "in_progress", label: "전형 중" },
  { id: "final_offer", label: "최종 오퍼" },
  { id: "held", label: "보류" },
  { id: "ended", label: "종료됨" },
] as const;

export function buildCompanyRoleCounts(args: {
  recommendations: Row[];
  intros: Row[];
  tags: Row[];
  stages: Row[];
  connections: Row[];
}): Map<string, CompanyDashboardRole["candidateCounts"]> {
  const customStageByTagKey = new Map<string, OrgCustomStageId>(
    args.stages.map((row) => [
      `내부단계:${String(row.id).replace(/-/g, "").toLowerCase()}`,
      `custom:${row.id}` as OrgCustomStageId,
    ])
  );
  const tagsByPair = new Map<string, Row[]>();
  for (const tag of args.tags) {
    const key = `${tag.opportunity_id}:${tag.talent_id}`;
    const rows = tagsByPair.get(key) ?? [];
    rows.push(tag);
    tagsByPair.set(key, rows);
  }
  const connected = new Set(
    args.connections.map((row) => row.recommendation_id)
  );
  const pairs = new Map<string, { roleId: string; stage: string }>();
  const compactStage = (stage: string) =>
    stage.startsWith("custom:")
      ? "in_progress"
      : ["process_stopped", "archived"].includes(stage)
        ? "ended"
        : stage;
  // The effective recommendation view already selects the current recommendation.
  for (const row of args.recommendations) {
    const key = `${row.role_id}:${row.talent_id}`;
    const tags = tagsByPair.get(key) ?? [];
    const visible = getVisibleOrgStage({
      connectedByOrgAction: connected.has(row.id),
      customStageByTagKey,
      feedback: row.feedback,
      savedStage: row.saved_stage,
      includeInternalAccepted: true,
      isInternalRecommendation: true,
      tags: tags as any,
    });
    const saved = String(row.saved_stage ?? "").toLowerCase();
    let stage = visible?.stage as string | undefined;
    if (!stage) {
      if (
        tags.some((tag) => tag.tag === "내부:거절") ||
        ["negative", "dislike", "rejected"].includes(row.feedback) ||
        ["closed", "rejected", "archived"].includes(saved)
      )
        stage = "ended";
      else if (tags.some((tag) => tag.tag === "내부:보류")) stage = "held";
      else stage = "recommended";
    }
    pairs.set(key, { roleId: row.role_id, stage: compactStage(stage) });
  }
  // Company proposals replace the same role/person's recommendation on the board.
  for (const row of args.intros) {
    pairs.set(`${row.role_id}:${row.talent_id}`, {
      roleId: row.role_id,
      stage: compactStage(getOrgCompanyIntroBoardStage(row.status)),
    });
  }
  const totals = new Map<string, Map<string, number>>();
  for (const { roleId, stage } of pairs.values()) {
    const counts = totals.get(roleId) ?? new Map();
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
    totals.set(roleId, counts);
  }
  return new Map(
    [...totals].map(([id, counts]) => [
      id,
      COMPANY_ROLE_STAGES.map((stage) => ({
        ...stage,
        count: counts.get(stage.id) ?? 0,
      })),
    ])
  );
}
