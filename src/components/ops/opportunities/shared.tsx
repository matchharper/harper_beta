import { cx, opsTheme } from "@/components/ops/theme";
import type {
  OpsOpportunityCandidateRecord,
  OpsOpportunityRecommendationRecord,
  OpsOpportunityRoleRecord,
  OpsOpportunitySavedStage,
  OpsOpportunityWorkspaceRecord,
  OpportunityEmploymentType,
  OpportunitySourceType,
  OpportunityStatus,
  OpportunityWorkMode,
} from "@/lib/opsOpportunity";
import { Mail, Search } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

export type PageView = "catalog" | "company_match" | "talent_recommendation";
export type SourceFilter = "all" | OpportunitySourceType;
export type DraftMode = "edit" | "new";

export type WorkspaceDraft = {
  careerUrl: string;
  companyDescription: string;
  companyName: string;
  homepageUrl: string;
  linkedinUrl: string;
};

export type RoleDraft = {
  description: string;
  descriptionSummary: string;
  employmentTypes: OpportunityEmploymentType[];
  expiresAt: string;
  externalJdUrl: string;
  locationText: string;
  name: string;
  postedAt: string;
  sourceJobId: string;
  sourceProvider: string;
  sourceType: OpportunitySourceType;
  status: OpportunityStatus;
  workMode: OpportunityWorkMode | null;
};

export type CandidateMailDraft = {
  content: string;
  fromEmail: string;
  subject: string;
};

export const EMPTY_WORKSPACE_DRAFT: WorkspaceDraft = {
  careerUrl: "",
  companyDescription: "",
  companyName: "",
  homepageUrl: "",
  linkedinUrl: "",
};

export const EMPTY_ROLE_DRAFT: RoleDraft = {
  description: "",
  descriptionSummary: "",
  employmentTypes: [],
  expiresAt: "",
  externalJdUrl: "",
  locationText: "",
  name: "",
  postedAt: "",
  sourceJobId: "",
  sourceProvider: "",
  sourceType: "internal",
  status: "active",
  workMode: null,
};

export const EMPTY_CANDIDATE_MAIL_DRAFT: CandidateMailDraft = {
  content: "",
  fromEmail: "",
  subject: "",
};

export const PAGE_VIEW_QUERY_KEY = "view";

export const isPageView = (value: unknown): value is PageView =>
  value === "catalog" ||
  value === "company_match" ||
  value === "talent_recommendation";

export const getPageViewFromQuery = (
  value: string | string[] | undefined
): PageView | null => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isPageView(candidate) ? candidate : null;
};

export const EMPLOYMENT_LABEL: Record<OpportunityEmploymentType, string> = {
  contract: "계약",
  full_time: "풀타임",
  internship: "인턴",
  part_time: "파트타임",
};

export const STATUS_LABEL: Record<OpportunityStatus, string> = {
  active: "진행",
  ended: "종료",
  paused: "중단",
  top_priority: "최우선",
};

export const WORK_MODE_LABEL: Record<OpportunityWorkMode, string> = {
  hybrid: "하이브리드",
  onsite: "상주",
  remote: "리모트",
};

export const SOURCE_LABEL: Record<OpportunitySourceType, string> = {
  external: "외부",
  internal: "내부",
};

export const RECOMMENDATION_FEEDBACK_LABEL: Record<
  NonNullable<OpsOpportunityRecommendationRecord["feedback"]>,
  string
> = {
  dislike: "Negative",
  like: "Positive",
};

export const SAVED_STAGE_LABEL: Record<OpsOpportunitySavedStage, string> = {
  applied: "관심 표시함 / 지원함",
  closed: "종료됨",
  connected: "연결됨",
  saved: "저장됨",
};

const formatDateValue = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

export const formatShortDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

export const formatUpdatedAt = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const workspaceToDraft = (
  workspace?: OpsOpportunityWorkspaceRecord | null
): WorkspaceDraft => ({
  careerUrl: workspace?.careerUrl ?? "",
  companyDescription: workspace?.companyDescription ?? "",
  companyName: workspace?.companyName ?? "",
  homepageUrl: workspace?.homepageUrl ?? "",
  linkedinUrl: workspace?.linkedinUrl ?? "",
});

export const roleToDraft = (
  role?: OpsOpportunityRoleRecord | null
): RoleDraft => ({
  description: role?.description ?? "",
  descriptionSummary: role?.descriptionSummary ?? "",
  employmentTypes: role?.employmentTypes ?? [],
  expiresAt: formatDateValue(role?.expiresAt),
  externalJdUrl: role?.externalJdUrl ?? "",
  locationText: role?.locationText ?? "",
  name: role?.name ?? "",
  postedAt: formatDateValue(role?.postedAt),
  sourceJobId: role?.sourceJobId ?? "",
  sourceProvider: role?.sourceProvider ?? "",
  sourceType: role?.sourceType ?? "internal",
  status: role?.status ?? "active",
  workMode: role?.workMode ?? null,
});

export const matchesWorkspaceQuery = (
  workspace: OpsOpportunityWorkspaceRecord,
  query: string
) => {
  if (!query) return true;
  const haystack = [
    workspace.companyName,
    workspace.companyDescription,
    workspace.careerUrl,
    workspace.homepageUrl,
    workspace.linkedinUrl,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
};

export const matchesRoleQuery = (
  role: OpsOpportunityRoleRecord,
  query: string
) => {
  if (!query) return true;
  const haystack = [
    role.name,
    role.companyName,
    role.description,
    role.descriptionSummary,
    role.locationText,
    role.sourceProvider,
    role.externalJdUrl,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
};

export const toggleEmploymentType = (
  current: OpportunityEmploymentType[],
  next: OpportunityEmploymentType
) =>
  current.includes(next)
    ? current.filter((item) => item !== next)
    : [...current, next];

export function ActionButton({
  active = false,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-md px-3 py-2 font-geist text-xs transition",
        active
          ? "bg-beige900 text-beige100"
          : "bg-white/65 text-beige900 hover:bg-white"
      )}
    >
      {children}
    </button>
  );
}

export function PanelHeader({
  action,
  title,
}: {
  action?: ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="font-geist text-[13px] font-medium text-beige900/70">
        {title}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ copy }: { copy: string }) {
  return (
    <div
      className={cx(
        opsTheme.panelSoft,
        "px-4 py-4 font-geist text-sm text-beige900/55"
      )}
    >
      {copy}
    </div>
  );
}

export function Token({
  active = false,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md px-2 py-1 font-geist text-[11px]",
        active ? "bg-beige900 text-beige100" : "bg-white/70 text-beige900/70"
      )}
    >
      {children}
    </span>
  );
}

export function ToggleGrid({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export function RoleOptionCard({
  action,
  active,
  onSelect,
  role,
}: {
  action?: ReactNode;
  active?: boolean;
  onSelect: () => void;
  role: OpsOpportunityRoleRecord;
}) {
  return (
    <div
      className={cx(
        "rounded-md px-3 py-3 transition",
        active ? "bg-beige900 text-beige100" : "bg-white/65 text-beige900"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 text-left"
        >
          <div className="truncate font-geist text-sm font-medium">
            {role.name}
          </div>
          <div
            className={cx(
              "mt-1 text-xs",
              active ? "text-beige100/70" : "text-beige900/50"
            )}
          >
            {role.companyName} · {role.matchedCandidateCount} matches
          </div>
        </button>
        {action}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Token active={active}>{SOURCE_LABEL[role.sourceType]}</Token>
        <Token active={active}>{STATUS_LABEL[role.status]}</Token>
        {role.workMode ? (
          <Token active={active}>{WORK_MODE_LABEL[role.workMode]}</Token>
        ) : null}
        {role.employmentTypes.map((type) => (
          <Token key={type} active={active}>
            {EMPLOYMENT_LABEL[type]}
          </Token>
        ))}
      </div>
      {role.locationText || role.postedAt ? (
        <div
          className={cx(
            "mt-2 text-xs",
            active ? "text-beige100/70" : "text-beige900/50"
          )}
        >
          {[role.locationText, formatShortDate(role.postedAt)]
            .filter(Boolean)
            .join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

export function TalentOptionCard({
  active,
  item,
  onSendMail,
  onSelect,
}: {
  active?: boolean;
  item: OpsOpportunityCandidateRecord;
  onSendMail?: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      className={cx(
        "w-full rounded-md px-3 py-3 transition",
        active
          ? "bg-beige900 text-beige100"
          : "bg-white/65 text-beige900 hover:bg-white"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 text-left"
        >
          <div className="truncate font-geist text-sm font-medium">
            {item.name ?? "Unnamed talent"}
          </div>
          <div
            className={cx(
              "mt-1 text-xs",
              active ? "text-beige100/70" : "text-beige900/55"
            )}
          >
            {item.headline ?? item.location ?? "-"}
          </div>
          {item.email && (
            <div
              className={cx(
                "mt-2 truncate text-[11px]",
                active ? "text-beige100/70" : "text-beige900/50"
              )}
            >
              {item.email}
            </div>
          )}
        </button>

        <div className="flex flex-col items-end gap-2">
          {onSendMail && (
            <button
              type="button"
              onClick={onSendMail}
              disabled={!item.email}
              className={cx(
                "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 font-geist text-[11px] transition disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? "bg-white/10 text-beige100 hover:bg-white/20"
                  : "bg-beige500/70 text-beige900 hover:bg-beige500/90"
              )}
            >
              <Mail className="h-3.5 w-3.5" />
              {item.email ? "메일 보내기" : "메일 없음"}
            </button>
          )}
          <div className="flex flex-wrap justify-end gap-1.5">
            {item.matched && <Token active={active}>matched</Token>}
            {!item.candidId && <Token active={active}>candid 없음</Token>}
          </div>
        </div>
      </div>
      {item.summary ? (
        <div
          className={cx(
            "mt-2 line-clamp-2 text-xs leading-5",
            active ? "text-beige100/70" : "text-beige900/60"
          )}
        >
          {item.summary}
        </div>
      ) : null}
    </div>
  );
}

export function SearchInput({
  onChange,
  onEnter,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  onEnter: () => void;
  placeholder: string;
  value: string;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    onEnter();
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/35" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cx(opsTheme.input, "pl-9")}
        />
      </div>
      <div className="text-xs text-beige900/40">Enter로 검색</div>
    </div>
  );
}

export function SelectionSummary({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className={cx(opsTheme.panelSoft, "space-y-2 px-3 py-3")}>
      <div className="font-geist text-[11px] text-beige900/40">{title}</div>
      {children}
    </div>
  );
}
