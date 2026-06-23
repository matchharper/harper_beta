import type { useCareerT } from "@/i18n/useCareerT";
import type { JobsDisplayTab } from "@/components/career/mobile/jobs/types";

export function getCareerMobileJobsEmptyStateMessage(
  tab: JobsDisplayTab,
  t: ReturnType<typeof useCareerT>
) {
  if (tab === "new")
    return t(
      "career.history.career_mobile_jobs_view.0f42kd7",
      "아직 새로 추천된 포지션이 없습니다."
    );
  if (tab === "saved")
    return t(
      "career.history.career_mobile_jobs_view.1m3uw9j",
      "저장한 포지션이 없습니다."
    );
  if (tab === "active")
    return t(
      "career.history.career_mobile_jobs_view.mobile_active_empty",
      "지원한 포지션이 없습니다."
    );
  if (tab === "closed")
    return t(
      "career.history.career_mobile_jobs_view.mobile_closed_empty",
      "종료된 포지션이 없습니다."
    );
  if (tab === "hidden")
    return t(
      "career.history.career_mobile_jobs_view.mobile_hidden_empty",
      "숨긴 포지션이 없습니다."
    );
  return t(
    "career.history.career_mobile_jobs_view.0llq6g8",
    "제외된 포지션이 없습니다."
  );
}
