import React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import RichText from "@/components/ui/rich-text";
import { cn } from "@/lib/utils";
import { useCareerT } from "@/i18n/useCareerT";

type TimelineKind = "work" | "education" | "extra";
type SubtitleTone = "primary" | "muted";

const getTimelineBadgeLabel = (kind: TimelineKind) =>
  kind === "education" ? "Education" : kind === "extra" ? "Extra" : "Work";

export const TimelineBlock = ({
  title,
  subtitle,
  subtitleTone = "muted",
  secondarySubtitle,
  description,
  memo,
  meta,
  icon,
  kind = "work",
  logoUrl,
  logoAlt,
  logoText,
  isLast,
  onAdd,
  addLabel,
}: {
  title: string;
  subtitle?: string;
  subtitleTone?: SubtitleTone;
  secondarySubtitle?: string;
  description?: string;
  memo?: string;
  meta?: string;
  icon: React.ReactNode;
  kind?: TimelineKind;
  logoUrl?: string | null;
  logoAlt?: string;
  logoText?: string;
  isLast?: boolean;
  onAdd?: () => void;
  addLabel?: string;
}) => {
  const t = useCareerT();
  const badgeLabel = getTimelineBadgeLabel(kind);
  const fallbackLogoText = (logoText ?? logoAlt ?? title)
    .trim()
    .slice(0, 1)
    .toUpperCase();

  return (
    <div
      className={cn(
        "relative grid grid-cols-[40px_minmax(0,1fr)] gap-4 py-3 first:pt-0 last:pb-0",
        !isLast && "pb-5"
      )}
    >
      {onAdd ? (
        <BareButton
          type="button"
          onClick={onAdd}
          aria-label={addLabel}
          className="absolute right-0 top-0 z-2 inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-neutral-1000-a05 bg-bg-floating text-neutral-muted shadow-xs transition-colors hover:border-neutral-400 hover:bg-bg-weak hover:text-neutral-primary"
        >
          <Plus className="h-4 w-4" />
        </BareButton>
      ) : null}
      {!isLast && (
        <div className="absolute bottom-[-8px] left-[19px] top-[46px] w-px bg-linear-to-b from-neutral-1000-a10 via-neutral-1000-a05 to-transparent" />
      )}
      <div className="relative z-1 flex h-10 w-10 items-center justify-center overflow-hidden rounded-[10px] border-2 border-bg-default bg-bg-weak text-[17px] font-semibold leading-none text-neutral-muted shadow-sm">
        <span className="absolute inset-0 flex items-center justify-center">
          {fallbackLogoText || icon}
        </span>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={logoAlt ?? title}
            className="relative h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}
      </div>
      <div className={cn("min-w-0", onAdd && "pr-10")}>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="rounded-[4px] bg-bg-weak px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-neutral-muted">
            {badgeLabel}
          </span>
          {meta && (
            <span className="text-[11.5px] leading-5 text-neutral-muted">
              {meta}
            </span>
          )}
        </div>
        <div className="text-[14px] font-medium leading-[1.35] text-neutral-primary">
          {title}
        </div>
        {(subtitle || secondarySubtitle) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12.5px] leading-5">
            {subtitle ? (
              <span
                className={
                  subtitleTone === "primary"
                    ? "text-neutral-primary"
                    : "text-neutral-muted"
                }
              >
                {subtitle}
              </span>
            ) : null}
            {subtitle && secondarySubtitle ? (
              <span className="text-neutral-muted">·</span>
            ) : null}
            {secondarySubtitle ? (
              <span className="text-neutral-muted">{secondarySubtitle}</span>
            ) : null}
          </div>
        )}
        {description && (
          <RichText
            content={description}
            className="mt-2 text-neutral-muted [&_a]:text-neutral-muted [&_blockquote]:text-[13px] [&_code]:text-[12px] [&_em]:text-neutral-muted [&_li]:text-[13px] [&_ol]:text-[13px] [&_p]:text-[13px] [&_strong]:text-neutral-primary [&_ul]:text-[13px]"
          />
        )}
        {memo && (
          <div className="mt-3 flex items-start gap-2 rounded-[6px] px-1 py-2">
            {/* <div>
              <Face size={28} />
            </div> */}
            <div className="min-w-0">
              <div className="mb-1 text-[12px] text-primary">
                {t(
                  "career.profile.career_talent_profile_panel.1d7d70h",
                  "Harper 메모"
                )}
              </div>
              <div className="whitespace-pre-wrap text-[13px] leading-5 text-neutral-primary">
                {memo}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ProfileSectionHeader = ({
  count,
  icon,
  label,
}: {
  count?: number;
  icon: React.ReactNode;
  label: string;
}) => (
  <div className="flex items-center gap-2 px-1 pt-4">
    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-muted">
      {icon}
    </span>
    <span className="font-halant text-lg leading-none text-neutral-primary">
      {label}
    </span>
    {typeof count === "number" ? (
      <span className="text-[13px] leading-none text-neutral-soft">
        {count}
      </span>
    ) : null}
    <span className="h-px min-w-8 flex-1 bg-neutral-1000-a05" />
  </div>
);

export const EmptyEditState = ({ label }: { label: string }) => (
  <div className="rounded-[10px] border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-4 text-sm text-neutral-muted">
    {label}
  </div>
);

const ItemRemoveButton = ({ onClick }: { onClick: () => void }) => (
  <BareButton
    type="button"
    onClick={onClick}
    className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-neutral-1000-a05 bg-bg-floating text-neutral-muted transition-colors hover:border-neutral-400 hover:bg-bg-weak hover:text-neutral-primary md:h-8 md:w-8"
    aria-label="항목 삭제"
  >
    <Trash2 className="h-4 w-4" />
  </BareButton>
);

const profileEditMobileFieldClassName =
  "rounded-md border border-neutral-1000-a10 bg-bg-floating px-2.5 text-[13px] font-normal leading-5 text-neutral-primary placeholder:text-neutral-placeholder hover:bg-bg-floating focus:border-neutral-400 focus:bg-bg-floating focus:ring-2 focus:ring-neutral-1000-a05";

export const profileEditPlainInputClassName = cn(
  profileEditMobileFieldClassName,
  "h-9 py-1.5 md:h-auto md:rounded-[4px] md:border-neutral-1000-a05 md:px-1.5 md:py-1 md:hover:bg-bg-weak md:focus:border-neutral-1000-a10 md:focus:ring-1"
);

export const profileEditPlainTextareaClassName = cn(
  profileEditMobileFieldClassName,
  "min-h-[72px] py-1.5 md:min-h-[74px] md:rounded-[6px] md:border-neutral-1000-a05 md:px-1.5 md:py-1.5 md:hover:bg-bg-weak md:focus:border-neutral-1000-a10 md:focus:ring-1"
);

export const TimelineEditBlock = ({
  children,
  kind = "work",
  logoUrl,
  logoAlt,
  logoText,
  isLast,
  onRemove,
  onLogoFileChange,
  logoUploadPending = false,
}: {
  children: React.ReactNode;
  kind?: TimelineKind;
  logoUrl?: string | null;
  logoAlt?: string;
  logoText?: string;
  isLast?: boolean;
  onRemove: () => void;
  onLogoFileChange?: (file: File) => void;
  logoUploadPending?: boolean;
}) => {
  const badgeLabel = getTimelineBadgeLabel(kind);
  const fallbackLogoText = (logoText ?? logoAlt ?? badgeLabel)
    .trim()
    .slice(0, 1)
    .toUpperCase();

  return (
    <div
      className={cn(
        "relative grid grid-cols-[40px_minmax(0,1fr)] gap-4 py-3 first:pt-0 last:pb-0",
        !isLast && "pb-5"
      )}
    >
      {!isLast && (
        <div className="absolute bottom-[-8px] left-[19px] top-[46px] w-px bg-linear-to-b from-neutral-1000-a10 via-neutral-1000-a05 to-transparent" />
      )}
      <label
        className={cn(
          "relative z-1 flex h-10 w-10 items-center justify-center overflow-hidden rounded-[10px] border-2 border-bg-default bg-bg-weak text-[17px] font-semibold leading-none text-neutral-muted",
          onLogoFileChange &&
            "cursor-pointer transition-transform hover:scale-[1.03]",
          logoUploadPending && "pointer-events-none opacity-75"
        )}
        aria-label={onLogoFileChange ? "로고 이미지 업로드" : undefined}
      >
        {onLogoFileChange ? (
          <UiInput
            unstyled
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onLogoFileChange(file);
            }}
          />
        ) : null}
        <span className="absolute inset-0 flex items-center justify-center">
          {fallbackLogoText}
        </span>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={logoAlt ?? badgeLabel}
            className="relative h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}
        {onLogoFileChange ? (
          <span className="absolute bottom-[-3px] right-[-3px] z-2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-bg-default bg-positive text-neutral-00">
            {logoUploadPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
            )}
          </span>
        ) : null}
      </label>
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-[4px] bg-bg-weak px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-neutral-muted">
            {badgeLabel}
          </span>
          <ItemRemoveButton onClick={onRemove} />
        </div>
        {children}
      </div>
    </div>
  );
};
