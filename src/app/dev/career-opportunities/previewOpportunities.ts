import type { CareerHistoryOpportunity } from "@/components/career/types";
import { OpportunityType } from "@/lib/opportunityType";
import { history, jobs, type PreviewJob } from "./fixtures";

function opportunity(job: PreviewJob): CareerHistoryOpportunity {
  const day = job.date.match(/(\d+)일/)?.[1] ?? "28";
  return {
    id: job.id,
    roleId: `role-${job.id}`,
    title: job.title,
    companyName: job.company,
    companyDescription: "AI 기반 협업 제품을 만드는 팀입니다.",
    companyHomepageUrl: null,
    companyLinkedinUrl: null,
    companyLogoUrl: null,
    description: `${job.reason}\n\n제품 기획부터 설계, 구현, 출시까지 팀과 함께 맡습니다.\n\n근무 조건: ${job.location}\n보상: ${job.pay}`,
    employmentTypes: ["full_time"],
    externalJdUrl: null,
    feedback: null,
    feedbackAt: null,
    feedbackReason: null,
    href: null,
    clickedAt: null,
    isAccepted: false,
    isInternal: false,
    kind: "recommendation",
    location: job.location.split(" · ")[0],
    opportunityType: OpportunityType.ExternalJd,
    postedAt: "2026-10-01T00:00:00Z",
    recommendedAt: `2026-10-${day.padStart(2, "0")}T00:00:00Z`,
    recommendationReasons: [job.reason],
    recommendationConcerns: [job.concern],
    sourceJobId: null,
    savedStage:
      job.id === "demo-7" ? "saved" : job.id === "demo-8" ? "applied" : null,
    sourceProvider: null,
    sourceType: "external",
    status: "active",
    viewedAt: null,
    workMode: ["Layer Works", "Paperplane"].includes(job.company)
      ? "remote"
      : job.company === "Daylight"
        ? "onsite"
        : job.company === "Common Ground"
          ? null
          : "hybrid",
  };
}

export const previewOpportunities: CareerHistoryOpportunity[] = [
  {
    ...opportunity(jobs[0]),
    id: "preview-connection",
    roleId: "preview-connection-role",
    title: "Product Engineer",
    companyName: "Meridian AI",
    isInternal: true,
    sourceType: "internal" as const,
    kind: "match" as const,
    opportunityType: OpportunityType.IntroRequest,
    recommendedAt: "2026-10-28T00:00:00Z",
    recommendationReasons: [
      "제품 개발 경험을 보고 회사에서 대화를 요청했어요.",
    ],
  },
  ...history.map(opportunity),
  ...jobs
    .filter((job) => job.id === "demo-10" || job.id === "demo-11")
    .map(opportunity),
].map((item) =>
  item.savedStage
    ? { ...item, feedback: "positive", feedbackAt: "2026-10-28T00:00:00Z" }
    : item
);
