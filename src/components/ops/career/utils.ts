import type { DateRange } from "react-day-picker";
import type {
  CareerTalentDetailResponse,
  CareerTalentMailHistoryItem,
  CareerTalentProfileResponse,
  CareerTalentRecommendationItem,
  CareerTalentRegisteredLinkType,
  CareerTalentSummary,
} from "@/lib/ops/careerServer";
import { formatKstRelativeDateTime } from "@/components/ops/dateUtils";

export type RecommendationSourceFilter = "all" | "internal" | "external";

export const RECOMMENDATION_SOURCE_FILTER_OPTIONS = [
  { id: "all", label: "전체 보기" },
  { id: "internal", label: "Internal만 보기" },
  { id: "external", label: "External만 보기" },
] as const satisfies readonly {
  id: RecommendationSourceFilter;
  label: string;
}[];

export const toDateOnly = (date: Date | undefined) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatShortDate = (date: Date | undefined) => {
  if (!date) return "";
  return date.toLocaleDateString("ko-KR", {
    day: "2-digit",
    month: "2-digit",
  });
};

export const formatDateRangeButtonLabel = (range: DateRange | undefined) => {
  if (!range?.from) return "가입일 전체";
  const from = formatShortDate(range.from);
  const to = formatShortDate(range.to ?? range.from);
  return from === to ? `가입 ${from}` : `${from} - ${to}`;
};

export const formatKst = formatKstRelativeDateTime;

export const onboardingStatusLabel = (isDone: boolean) =>
  isDone ? "완료" : "온보딩 미완료";

export const onboardingStatusBadgeClass = (isDone: boolean) =>
  isDone ? "bg-positive-faded text-positive" : "bg-info-faded text-info";

export const mailActorLabel = (item: CareerTalentMailHistoryItem) => {
  if (item.direction === "inbound") return "유저";
  if (item.mailType === "manual_ops") return "Ops 수동";
  return "시스템";
};

export const mailTypeLabel = (mailType: string) => {
  switch (mailType) {
    case "manual_ops":
      return "수동 발송";
    case "user_reply":
      return "유저 답장";
    case "auto_reply":
      return "자동 답장";
    case "onboarding":
      return "온보딩 1차";
    case "onboarding_review":
      return "온보딩 리뷰";
    case "opportunity_recommendation":
      return "추천 메일";
    case "internal_connection_confirmed":
      return "연결 확정 안내";
    default:
      return mailType;
  }
};

export const mailStatusLabel = (status: string) => {
  switch (status) {
    case "queued":
      return "대기";
    case "sent":
      return "발송";
    case "received":
      return "수신";
    case "failed":
      return "실패";
    case "skipped":
      return "스킵";
    default:
      return status || "-";
  }
};

export const mailStatusClass = (status: string) => {
  if (status === "sent" || status === "received") {
    return "bg-positive-faded text-positive";
  }
  if (status === "failed") return "bg-critical-faded text-critical";
  return "bg-bg-weak text-neutral-muted";
};

export const profileVisibilityLabel = (value: string | null | undefined) => {
  switch (value) {
    case "open_to_matches":
      return "Open to matches";
    case "exceptional_only":
      return "Exceptional only";
    case "dont_share":
      return "Don't share";
    default:
      return value?.trim() || "미설정";
  }
};

export const profileVisibilityBadgeClass = (
  value: string | null | undefined
) => {
  switch (value) {
    case "open_to_matches":
      return "bg-positive-faded text-positive";
    case "exceptional_only":
      return "bg-info-faded text-info";
    case "dont_share":
      return "bg-critical-faded text-critical";
    default:
      return "bg-bg-weak text-neutral-muted";
  }
};

export const externalRecommendationLabel = (
  value: boolean | null | undefined
) => {
  if (value === true) return "true";
  if (value === false) return "false";
  return "미설정";
};

export const externalRecommendationBadgeClass = (
  value: boolean | null | undefined
) => {
  if (value === true) return "bg-positive-faded text-positive";
  if (value === false) return "bg-critical-faded text-critical";
  return "bg-bg-weak text-neutral-muted";
};

export const talentStatusLabel = (value: string | null | undefined) =>
  value?.trim() || "미설정";

export const talentStatusBadgeClass = (
  value: string | null | undefined
) => {
  switch (value) {
    case "active":
      return "bg-positive-faded text-positive";
    case "passive":
      return "bg-info-faded text-info";
    case "stopped":
      return "bg-critical-faded text-critical";
    default:
      return "bg-bg-weak text-neutral-muted";
  }
};

export const compactMailAddress = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized || "-";
};

export const recommendationSourceLabel = (
  sourceType: CareerTalentRecommendationItem["sourceType"]
) => (sourceType === "internal" ? "Internal" : "External");

export const recommendationSourceClass = (
  sourceType: CareerTalentRecommendationItem["sourceType"]
) =>
  sourceType === "internal"
    ? "bg-positive-faded text-positive"
    : "bg-bg-weak text-neutral-muted";

export const recommendationFeedbackLabel = (
  feedback: string | null | undefined
) => {
  const normalized = String(feedback ?? "").toLowerCase();
  if (normalized === "like" || normalized === "positive") return "수락";
  if (normalized === "dislike" || normalized === "negative") return "거절";
  return "-";
};

export const recommendationFeedbackClass = (
  feedback: string | null | undefined
) => {
  const normalized = String(feedback ?? "").toLowerCase();
  if (normalized === "like" || normalized === "positive") {
    return "bg-positive-faded text-positive";
  }
  if (normalized === "dislike" || normalized === "negative") {
    return "bg-critical-faded text-critical";
  }
  return "bg-bg-weak text-neutral-soft";
};

export const formatCurrentPositionLabel = (talent: CareerTalentSummary) => {
  const company = talent.currentCompanyName?.trim();
  const role = talent.currentRole?.trim();
  if (company && role) return `${company} · ${role}`;
  return company || role || null;
};

export const registeredLinkTypeLabel = (
  type: CareerTalentRegisteredLinkType
) => {
  switch (type) {
    case "linkedin":
      return "LinkedIn 링크 있음";
    case "github":
      return "GitHub 링크 있음";
    default:
      return "등록 링크 있음";
  }
};

export const getLinkedinProfileUrl = (links: string[]) =>
  links.find((link) => /linkedin\.com\/in\//i.test(link)) ?? null;

export const normalizeRegisteredLinkHref = (link: string) =>
  /^https?:\/\//i.test(link) ? link : `https://${link}`;

export const formatRegisteredLinkLabel = (link: string) => {
  try {
    const url = new URL(normalizeRegisteredLinkHref(link));
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/$/, "");
    return `${host}${path}`;
  } catch {
    return link;
  }
};

export const getResumeFileDisplayName = (
  detail: Pick<
    CareerTalentProfileResponse,
    "resumeFileName" | "resumeStoragePath"
  >
) => {
  const fileName = detail.resumeFileName?.trim();
  if (fileName) return fileName;
  return detail.resumeStoragePath?.trim() ? "파일명 없이 저장됨" : null;
};
