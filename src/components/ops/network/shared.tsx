import { cx, opsTheme } from "@/components/ops/theme";
import type {
  NetworkLeadMessage,
  NetworkLeadProgress,
  NetworkLeadProgressStep,
  NetworkLeadSummary,
  TalentInternalEntry,
} from "@/lib/opsNetwork";
import { NETWORK_LEAD_PROGRESS_STEP_ORDER } from "@/lib/opsNetwork";
import { getTalentEngagementLabels } from "@/lib/talentNetworkOptions";
import {
  Check,
  ExternalLink,
  FileText,
  FileUp,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Pencil,
  Phone,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { BareButton } from "@/components/ui/button";
import { Textarea as UiTextarea } from "@/components/ui/textarea";

export type DetailTab = "internal" | "messages" | "profile" | "waitlist";

export const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "profile", label: "구조화 프로필" },
  { id: "waitlist", label: "원본 제출 정보" },
  { id: "messages", label: "대화 내역" },
  { id: "internal", label: "내부 활동" },
];

const PAGINATION_BUTTON_COUNT = 5;

export const NETWORK_PROGRESS_STEP_LABELS: Record<
  NetworkLeadProgressStep,
  string
> = {
  emailSent: "이메일 전송",
  signedUp: "회원가입",
  conversationStarted: "대화 시작",
  conversationCompleted: "대화 완료",
  roleRecommended: "Role 추천함",
};

const NETWORK_STRUCTURED_PROGRESS_LABEL = "구조화 완료";

export const formatKst = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatKstDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

export const daysAgo = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
};

export const copyToClipboard = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
};

export const escapeCsvCell = (value: string | null | undefined) => {
  const safe = String(value ?? "");
  if (!/[",\n]/.test(safe)) return safe;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function readQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePositiveQueryNumber(value: string | string[] | undefined) {
  const raw = readQueryValue(value);
  const numeric = Number(raw ?? "");
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
}

export function buildPaginationNumbers(
  currentPage: number,
  totalPages: number
) {
  if (totalPages <= 0) return [];

  const half = Math.floor(PAGINATION_BUTTON_COUNT / 2);
  const start = Math.max(
    1,
    Math.min(currentPage - half, totalPages - PAGINATION_BUTTON_COUNT + 1)
  );
  const end = Math.min(totalPages, start + PAGINATION_BUTTON_COUNT - 1);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function getLatestExperienceText(lead: NetworkLeadSummary) {
  const latestExperience = lead.latestExperience;
  if (latestExperience?.companyName || latestExperience?.role) {
    return {
      meta: [
        latestExperience.startDate || latestExperience.endDate
          ? `${latestExperience.startDate ?? "-"} ~ ${
              latestExperience.endDate ?? "Present"
            }`
          : null,
        latestExperience.companyLocation,
      ]
        .filter(Boolean)
        .join(" · "),
      primary: [
        latestExperience.companyName ?? "회사 없음",
        latestExperience.role ?? "역할 없음",
      ].join(" / "),
    };
  }

  return {
    meta: null,
    primary: lead.selectedRole ?? "구조화된 최근 경력 없음",
  };
}

export function getLeadPreferenceLabels(lead: NetworkLeadSummary) {
  return {
    engagementLabels: getTalentEngagementLabels(lead.engagementTypes),
  };
}

export function getLeadProgressLabel(
  currentStep: NetworkLeadProgress["currentStep"],
  structuredReady = false
) {
  if (currentStep) {
    return NETWORK_PROGRESS_STEP_LABELS[currentStep];
  }

  return structuredReady ? NETWORK_STRUCTURED_PROGRESS_LABEL : "접수됨";
}

export function formatEntryType(type: TalentInternalEntry["type"]) {
  if (type === "mail") return "메일";
  if (type === "memo") return "메모";
  return "대화";
}

export function isEditableEntryType(
  type: TalentInternalEntry["type"]
): type is "conversation" | "memo" {
  return type === "conversation" || type === "memo";
}

export function getProfileLinkChipLabel(raw: string) {
  const normalized = String(raw ?? "").trim();
  const lower = normalized.toLowerCase();

  if (lower.includes("linkedin.com")) return "LinkedIn";
  if (lower.includes("github.com")) return "GitHub";
  if (lower.includes("scholar.google.")) return "Scholar";

  try {
    const url = new URL(
      normalized.startsWith("http://") || normalized.startsWith("https://")
        ? normalized
        : `https://${normalized}`
    );
    return url.hostname.replace(/^www\./, "");
  } catch {
    return normalized;
  }
}

export function formatTalentInsightLabel(key: string) {
  if (key === "technical_strengths") return "기술적 강점";
  if (key === "desired_teams") return "원하는 팀";
  return key.replace(/_/g, " ");
}

export function Badge({
  children,
  tone = "default",
  onClick,
}: {
  children: ReactNode;
  tone?: "default" | "inverse" | "strong";
  onClick?: () => void;
}) {
  return (
    <span
      onClick={onClick}
      className={cx(
        tone === "strong"
          ? opsTheme.badgeStrong
          : tone === "inverse"
            ? opsTheme.badgeInverse
            : opsTheme.badge,
        onClick ? "cursor-pointer hover:bg-neutral-300" : ""
      )}
    >
      {children}
    </span>
  );
}

export function ProfileChip({
  children,
  href,
  onClick,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const className =
    "inline-flex items-center gap-2 rounded-md bg-bg-weak px-3 py-2 text-sm text-neutral-primary transition hover:bg-bg-weak";

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }

  if (onClick) {
    return (
      <BareButton type="button" onClick={onClick} className={className}>
        {children}
      </BareButton>
    );
  }

  return <div className={className}>{children}</div>;
}

export function StatCard({ hint, value }: { hint: string; value: string }) {
  return (
    <div className="flex flex-row items-center justify-center gap-2 bg-bg-default p-2">
      <div className="font-hedvig text-[1.4rem] leading-none text-neutral-primary">
        {value}
      </div>
      <div className="text-sm text-neutral-muted">{hint}</div>
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[160px_1fr] sm:gap-4">
      <div className={opsTheme.eyebrow}>{label}</div>
      <div className="text-sm leading-6 text-neutral-primary">{value}</div>
    </div>
  );
}

export function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <BareButton
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-md px-3 py-2 text-sm transition",
        active
          ? "bg-black text-neutral-00"
          : "bg-bg-default/60 text-neutral-primary hover:bg-bg-default/80"
      )}
    >
      {label}
    </BareButton>
  );
}

export function StructuredSection({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <section className={cx(opsTheme.panelSoft, "p-4")}>
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-bg-weak p-2 text-neutral-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-sm font-semibold text-neutral-primary">
          {title}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function NetworkLeadProgressTrack({
  progress,
  selected = false,
  showCurrent = true,
  structuredReady = false,
}: {
  progress: NetworkLeadProgress;
  selected?: boolean;
  showCurrent?: boolean;
  structuredReady?: boolean;
}) {
  const getStepClassName = (done: boolean) =>
    cx(
      "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition",
      done
        ? selected
          ? "border-neutral-00/20 bg-bg-default/10 text-neutral-00"
          : "border-primary/40 bg-accent-200 text-neutral-primary"
        : selected
          ? "border-neutral-00/10 bg-transparent text-neutral-00/40"
          : "border-neutral-1000-a05 bg-bg-default/55 text-neutral-soft"
    );

  return (
    <div className="space-y-2">
      {showCurrent ? (
        <div
          className={cx(
            "text-xs font-medium",
            selected ? "text-neutral-00/80" : "text-neutral-muted"
          )}
        >
          현재 {getLeadProgressLabel(progress.currentStep, structuredReady)}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <span className={getStepClassName(structuredReady)}>
          {structuredReady ? (
            <Check className="h-3 w-3 shrink-0" />
          ) : (
            <span
              className={cx(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                selected ? "bg-bg-default/40" : "bg-bg-weak"
              )}
            />
          )}
          {NETWORK_STRUCTURED_PROGRESS_LABEL}
        </span>
        {NETWORK_LEAD_PROGRESS_STEP_ORDER.map((step) => {
          const done = progress[step];

          return (
            <span key={step} className={getStepClassName(done)}>
              {done ? (
                <Check className="h-3 w-3 shrink-0" />
              ) : (
                <span
                  className={cx(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    selected ? "bg-bg-default/40" : "bg-bg-weak"
                  )}
                />
              )}
              {NETWORK_PROGRESS_STEP_LABELS[step]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function ActivityEntryCard({
  deletePending,
  editPending,
  editingValue,
  entry,
  isEditing,
  onDelete,
  onEditCancel,
  onEditChange,
  onEditSave,
  onEditStart,
}: {
  deletePending: boolean;
  editPending: boolean;
  editingValue: string;
  entry: TalentInternalEntry;
  isEditing: boolean;
  onDelete: (entry: TalentInternalEntry) => void;
  onEditCancel: () => void;
  onEditChange: (value: string) => void;
  onEditSave: (entry: TalentInternalEntry) => void;
  onEditStart: (entry: TalentInternalEntry) => void;
}) {
  const editable = isEditableEntryType(entry.type);

  return (
    <div className={cx(opsTheme.panelSoft, "px-4 py-4")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={entry.type === "mail" ? "strong" : "default"}>
            {formatEntryType(entry.type)}
          </Badge>
          <span className="text-xs text-neutral-muted">
            {formatKst(entry.created_at)}
          </span>
        </div>

        {editable ? (
          <div className="flex flex-wrap items-center gap-2">
            {isEditing ? (
              <>
                <BareButton
                  type="button"
                  onClick={onEditCancel}
                  disabled={editPending}
                  className={cx(opsTheme.buttonSecondary, "h-8 px-3 text-xs")}
                >
                  <X className="h-3.5 w-3.5" />
                  취소
                </BareButton>
                <BareButton
                  type="button"
                  onClick={() => onEditSave(entry)}
                  disabled={editPending || !editingValue.trim()}
                  className={cx(opsTheme.buttonSoft, "h-8 px-3 text-xs")}
                >
                  {editPending ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  저장
                </BareButton>
              </>
            ) : (
              <>
                <BareButton
                  type="button"
                  onClick={() => onEditStart(entry)}
                  disabled={deletePending}
                  className={cx(opsTheme.buttonSecondary, "h-8 px-3 text-xs")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  수정
                </BareButton>
                <BareButton
                  type="button"
                  onClick={() => onDelete(entry)}
                  disabled={deletePending}
                  className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-critical-faded px-3 text-xs font-medium text-critical transition hover:bg-critical-faded disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deletePending ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  삭제
                </BareButton>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-3 space-y-2 text-sm text-neutral-muted">
        <div>작성자: {entry.created_by}</div>
        {entry.type === "mail" && entry.subject ? (
          <div>제목: {entry.subject}</div>
        ) : null}
        {entry.type === "mail" && entry.from_email ? (
          <div>보낸 사람: {entry.from_email}</div>
        ) : null}
        {entry.type === "mail" && entry.to_email ? (
          <div>받는 사람: {entry.to_email}</div>
        ) : null}
      </div>

      {isEditing ? (
        <UiTextarea
          unstyled
          value={editingValue}
          onChange={(event) => onEditChange(event.target.value)}
          className={cx(opsTheme.textarea, "mt-4 min-h-[140px]")}
          placeholder="내용을 수정하세요."
        />
      ) : (
        <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-neutral-primary">
          {entry.content}
        </div>
      )}
    </div>
  );
}

function getMessageTypeMeta(messageType: string | null) {
  if (!messageType || messageType === "chat") {
    return {
      icon: MessageSquareText,
    };
  }

  if (messageType === "profile_submit") {
    return {
      icon: FileUp,
    };
  }

  if (messageType === "call_transcript" || messageType === "call_wrapup") {
    return {
      icon: Phone,
    };
  }

  if (messageType === "mail") {
    return {
      icon: Mail,
    };
  }

  if (messageType === "system") {
    return null;
  }

  if (
    [
      "onboarding_interest_prompt",
      "onboarding_pause_close",
      "onboarding_status",
    ].includes(messageType)
  ) {
    return {
      icon: Sparkles,
    };
  }

  return {
    icon: FileText,
  };
}

export function MessageHistoryCard({
  message,
}: {
  message: NetworkLeadMessage;
}) {
  const isAssistant = message.role === "assistant";
  const roleLabel = isAssistant ? "Harper" : "Talent";
  const RoleIcon = isAssistant ? Sparkles : User;
  const typeMeta = getMessageTypeMeta(message.messageType);
  const TypeIcon = typeMeta?.icon ?? null;

  return (
    <div className="border-b border-neutral-1000-a10 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-neutral-primary">
            <RoleIcon className="h-3.5 w-3.5" />
            {roleLabel}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-bg-default/65 px-2 py-1 text-[11px] text-neutral-muted">
            {TypeIcon ? <TypeIcon className="h-3.5 w-3.5" /> : null}
            {message.messageType ?? "chat"}
          </span>
        </div>
        <span className="text-[11px] text-neutral-soft">
          {formatKst(message.createdAt)}
        </span>
      </div>
      <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-primary">
        {message.content}
      </div>
    </div>
  );
}

export function externalLinkValue(url: string | null | undefined) {
  if (!url) return "-";

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cx(opsTheme.link, "inline-flex items-center gap-2")}
    >
      열기
      <ExternalLink className="h-4 w-4" />
    </a>
  );
}

export function onEnterOrSpace(
  event: KeyboardEvent<HTMLElement>,
  callback: () => void
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    callback();
  }
}
