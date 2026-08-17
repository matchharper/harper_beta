import {
  formatKstRelativeDate,
  formatKstRelativeDateTime,
} from "@/components/ops/dateUtils";
import { cx, opsTheme } from "@/components/ops/theme";
import type {
  OpsOpportunityRoleRecord,
  OpportunityEmploymentType,
  OpportunitySourceType,
  OpportunityStatus,
  OpportunityWorkMode,
} from "@/lib/ops/opportunity";
import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { BareButton } from "@/components/ui/button";

export type DraftMode = "edit" | "new";

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
  request: string;
  workMode: OpportunityWorkMode | null;
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
  request: "",
  workMode: null,
};

export const EMPLOYMENT_LABEL: Record<OpportunityEmploymentType, string> = {
  contract: "계약",
  full_time: "풀타임",
  internship: "인턴",
  part_time: "파트타임",
};

export const STATUS_LABEL: Record<OpportunityStatus, string> = {
  active: "진행",
  draft: "작성중",
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

const formatDateValue = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

export const formatShortDate = (value: string | null | undefined) => {
  return formatKstRelativeDate(value);
};

export const formatUpdatedAt = (value: string | null | undefined) => {
  return formatKstRelativeDateTime(value);
};

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
  request: role?.request ?? "",
  workMode: role?.workMode ?? null,
});

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
    <BareButton
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-md px-3 py-2 text-xs transition",
        active
          ? "bg-black text-neutral-00"
          : "bg-bg-default/65 text-neutral-primary border border-neutral-1000-a10 hover:bg-black/5"
      )}
    >
      {children}
    </BareButton>
  );
}

export function EmptyState({ copy }: { copy: string }) {
  return (
    <div
      className={cx(opsTheme.panelSoft, "px-4 py-4 text-sm text-neutral-muted")}
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
        "inline-flex items-center rounded-md px-2 py-1 text-[11px]",
        active
          ? "bg-black text-neutral-00"
          : "bg-bg-floating text-neutral-primary"
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
  onEdit,
  onSelect,
  role,
}: {
  action?: ReactNode;
  active?: boolean;
  onEdit?: () => void;
  onSelect: () => void;
  role: OpsOpportunityRoleRecord;
}) {
  return (
    <div
      className={cx(
        "rounded-md px-3 py-3 transition border-2 border-neutral-1000-a05",
        active
          ? "bg-black text-neutral-00"
          : "bg-bg-default/65 text-neutral-primary"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <BareButton
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 text-left"
        >
          <div className="truncate text-base font-normal">{role.name}</div>
          <div
            className={cx(
              "mt-2 text-xs",
              active ? "text-neutral-00/70" : "text-neutral-muted"
            )}
          >
            {role.companyName} -{" "}
            {role.locationText ||
              (role.postedAt &&
                [role.locationText, formatShortDate(role.postedAt)]
                  .filter(Boolean)
                  .join(" · "))}
          </div>
        </BareButton>
        {action || onEdit ? (
          <div className="flex shrink-0 items-start gap-2">
            {action}
            {onEdit ? (
              <BareButton
                type="button"
                onClick={onEdit}
                className={cx(
                  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-[11px] transition",
                  active
                    ? "bg-neutral-00/10 text-neutral-00 hover:bg-neutral-00/20"
                    : "bg-bg-weak text-neutral-primary hover:bg-bg-weak"
                )}
              >
                <Pencil className="h-3.5 w-3.5" />
                수정
              </BareButton>
            ) : null}
          </div>
        ) : null}
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
    </div>
  );
}
