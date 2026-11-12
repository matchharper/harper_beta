import type { CareerHistoryOpportunity } from "../../types";
import { OpportunityType } from "@/lib/opportunityType";
import type { Job } from "./data";

const workModes: Record<string, string> = {
  원격: "remote",
  하이브리드: "hybrid",
  대면: "onsite",
};

export function toOpportunity(job: Job): CareerHistoryOpportunity {
  return {
    id: job.id,
    roleId: job.id,
    title: job.role,
    companyName: job.company,
    companyLogoUrl: null,
    companyDescription: null,
    companyHomepageUrl: null,
    companyLinkedinUrl: null,
    location: job.location,
    workMode: workModes[job.mode] ?? job.mode,
    employmentTypes: [job.type === "파트타임" ? "part_time" : "full_time"],
    description:
      job.id === "1"
        ? "고객사와 함께 해결할 문제와 성공 기준을 정의합니다. 데이터를 연결하고 AI 제품을 실제 환경에 배포한 뒤, 현장에서 발견한 문제를 제품팀에 전달합니다."
        : null,
    recommendationNote: job.reason,
    recommendationReasons: [],
    recommendationConcerns: [job.concern],
    isAccepted: false,
    isInternal: Boolean(job.intro),
    kind: "recommendation",
    sourceType: job.intro ? "internal" : "external",
    opportunityType: job.intro
      ? OpportunityType.InternalRecommendation
      : OpportunityType.ExternalJd,
    status: "recommended",
    savedStage: null,
    externalJdUrl: null,
    href: null,
    sourceJobId: null,
    sourceProvider: null,
    clickedAt: null,
    feedback: null,
    feedbackAt: null,
    feedbackReason: null,
    postedAt: null,
    recommendedAt: "2026-11-11T00:00:00.000Z",
    viewedAt: null,
  };
}
