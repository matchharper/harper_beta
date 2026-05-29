import type { Tables } from "@/types/database.types";
import { OFFICIAL_JOBS_LANDING_SOURCE } from "@/lib/officialJobLandingLogs";

export const OFFICIAL_JOBS_LOGIN_HREF = buildOfficialJobsLoginHref();

export const OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE = "internal_internal";
export const OFFICIAL_JOBS_INTERNAL_COPY_SLUG = "internal-internal";

export function buildOfficialJobsLoginHref(localId?: string | null) {
  const params = new URLSearchParams({
    next: "/career",
    source: OFFICIAL_JOBS_LANDING_SOURCE,
  });
  const normalizedLocalId = String(localId ?? "").trim();
  if (normalizedLocalId) params.set("lid", normalizedLocalId);
  return `/career_login?${params.toString()}`;
}

export type OfficialJobRow = Tables<"official_jobs">;

export type OfficialJob = {
  ashbyJobPostingId: string | null;
  id: string;
  slug: string;
  companyName: string;
  roleTitle: string;
  location: string;
  vertical: string;
  shortDescription: string;
  companyDescriptionMarkdown: string;
  roleDescriptionMarkdown: string;
  harperDescriptionMarkdown: string;
  harperStepsMarkdown: string;
  compensation: string | null;
  employmentType: string | null;
  seniority: string | null;
  companyLogoUrl: string | null;
  companyWebsiteUrl: string | null;
  displayOrder: number;
  publishedAt: string | null;
};

export type OfficialJobsLandingCopy = {
  harperDescriptionMarkdown: string;
  harperStepsMarkdown: string;
};

export function isOfficialJobsInternalCopyIdentity(input: {
  roleTitle?: string | null;
  role_title?: string | null;
  slug?: string | null;
}) {
  const roleTitle = String(input.roleTitle ?? input.role_title ?? "").trim();
  const slug = String(input.slug ?? "")
    .trim()
    .toLowerCase();

  return (
    roleTitle === OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE ||
    slug === OFFICIAL_JOBS_INTERNAL_COPY_SLUG
  );
}

export const DEFAULT_HARPER_DESCRIPTION_MARKDOWN = `'스포츠 선수들은 대신해서 이적과 연봉 협상을 책임져주는 에이전트가 있는데, 왜 직장인들은 없을까?' 상상해 본 적 있으시나요? 잡보드를 뒤지며 수십 시간을 낭비하고, 이력서를 고치며 무한정 지원을 반복하는 기존의 구직 방식은 지난 30년간 본질적으로 바뀐 게 없습니다.
\nHarper는 글로벌 VC의 투자를 받아 이 비효율적인 파이프라인과 구직 탐색 비용을 완전히 지우기 위해 탄생한 당신의 전속 AI 탤런트 에이전트입니다. 지원을 위해 정형화된 이력서를 밤새워 쓸 필요가 없습니다. Harper와 가볍게 이야기하며 지금 어떤 상황이고 다음으로는 어떤 기회를 찾고 계신지 알려주세요. 대화를 통해 정적인 이력서 이면에 담긴 진짜 맥락과 잠재력을 깊이 있게 추출해 냅니다.
\n여러분이 할 일은 가만히 앉아 Harper가 고른 완벽하게 핏이 맞는 포지션 제안을 수락하는 것뿐입니다. 그럼 여러분의 프로필은 채용 결정권자의 책상 위로 즉시 올라갑니다.
\n **포지션에 대하여** : 이 공고는 여러분의 전속 탤런트 에이전트 Harper가 파트너사를 대신해 진행하는 비공개 채용 건입니다. 지원자님의 엔지니어링 역량을 정밀하게 분석해 가장 완벽한 핏을 가진 포지션을 제안해 드립니다. Harper를 통해 지원하시면 그 다음 과정은 저희가 알아서 진행합니다.
`;

export const DEFAULT_HARPER_STEPS_MARKDOWN = `**Step 1.** Harper 링크를 통해 이 포지션에 지원해 주세요.\n
**Step 2.** 정형화된 이력서를 작성할 필요 없이, Harper와 가볍게 이야기하며 지금 어떤 상황이고 다음으로는 어떤 기회를 찾고 계신지 알려주세요.\n
**Step 3.** Harper가 대화 속에서 추출한 진짜 맥락을 바탕으로 지원자님이 이 포지션과 완벽한 핏이라고 분석되면, 즉시 고객사에 여러분을 추천합니다.\n
**Step 4.** 조건 및 일정 조율, 회사와 포지션에 대한 궁금한 사항 등을 중간에서 Harper가 전부 조율해 드립니다.\n
**Step 5.** 만약 이번 포지션이 지원자님과 맞지 않더라도 걱정하지 마세요. Harper 네트워크 내의 다른 훌륭한 포지션들을 자동으로 찾아 제안해 드립니다. 지원자에게는 전 과정이 무료입니다.
`;

export const DEFAULT_OFFICIAL_JOBS_LANDING_COPY: OfficialJobsLandingCopy = {
  harperDescriptionMarkdown: DEFAULT_HARPER_DESCRIPTION_MARKDOWN,
  harperStepsMarkdown: DEFAULT_HARPER_STEPS_MARKDOWN,
};

export function normalizeOfficialJobsLandingCopy(
  copy?: Partial<OfficialJobsLandingCopy> | null
): OfficialJobsLandingCopy {
  const harperDescriptionMarkdown = String(
    copy?.harperDescriptionMarkdown ?? ""
  ).trim();
  const harperStepsMarkdown = String(copy?.harperStepsMarkdown ?? "").trim();

  return {
    harperDescriptionMarkdown:
      harperDescriptionMarkdown ||
      DEFAULT_OFFICIAL_JOBS_LANDING_COPY.harperDescriptionMarkdown,
    harperStepsMarkdown:
      harperStepsMarkdown ||
      DEFAULT_OFFICIAL_JOBS_LANDING_COPY.harperStepsMarkdown,
  };
}

export function mapOfficialJobRow(
  row: OfficialJobRow,
  landingCopy?: Partial<OfficialJobsLandingCopy> | null
): OfficialJob {
  const normalizedLandingCopy = normalizeOfficialJobsLandingCopy(landingCopy);

  return {
    ashbyJobPostingId: row.ashby_job_posting_id ?? null,
    id: row.id,
    slug: row.slug,
    companyName: row.company_name,
    roleTitle: row.role_title,
    location: row.location,
    vertical: row.vertical,
    shortDescription: row.short_description,
    companyDescriptionMarkdown: row.company_description_markdown,
    roleDescriptionMarkdown: row.role_description_markdown,
    harperDescriptionMarkdown: normalizedLandingCopy.harperDescriptionMarkdown,
    harperStepsMarkdown: normalizedLandingCopy.harperStepsMarkdown,
    compensation: row.compensation,
    employmentType: row.employment_type,
    seniority: row.seniority,
    companyLogoUrl: row.company_logo_url,
    companyWebsiteUrl: row.company_website_url,
    displayOrder: row.display_order,
    publishedAt: row.published_at,
  };
}
