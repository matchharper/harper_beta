import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import {
  DEFAULT_MATCHING_TAG_BADGE_CLASS,
  DEFAULT_MATCHING_TAG_DOT_CLASS,
  getMatchingTagLabel,
  getMatchingTagOption,
  MATCHING_TAG_OPTIONS,
} from "@/components/ops/matching/tagMeta";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { useCreateOpsCareerProfileMemo } from "@/hooks/useOpsCareer";
import {
  useAddOpsMatchingTalentTag,
  useDeleteOpsMatchingTalentTag,
} from "@/hooks/useOpsMatching";
import type {
  OpsMatchingTalentItem,
  OpsMatchingTalentTag,
} from "@/lib/opsMatching";

type InlineActionRootProps = {
  children: ReactNode;
  compact?: boolean;
};

function InlineActionRoot({ children, compact }: InlineActionRootProps) {
  return (
    <div
      className={compact ? "min-w-0" : "min-w-[220px]"}
      onClick={(event) => event.stopPropagation()}
      onDragStart={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function MatchingTagPill({
  removable,
  tag,
  onRemove,
}: {
  onRemove?: () => void;
  removable?: boolean;
  tag: string;
}) {
  const tagOption = getMatchingTagOption(tag);
  return (
    <span
      className={cx(
        "inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium",
        tagOption?.badgeClassName ?? DEFAULT_MATCHING_TAG_BADGE_CLASS
      )}
    >
      <span
        className={cx(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          tagOption?.dotClassName ?? DEFAULT_MATCHING_TAG_DOT_CLASS
        )}
        aria-hidden
      />
      <span className="truncate">{getMatchingTagLabel(tag)}</span>
      {removable ? (
        <BareButton
          type="button"
          onClick={onRemove}
          className="inline-flex h-4 w-4 items-center justify-center rounded text-current opacity-70 transition hover:bg-white/70 hover:opacity-100 disabled:cursor-not-allowed"
          aria-label={`${getMatchingTagLabel(tag)} 태그 삭제`}
        >
          <X className="h-3 w-3" />
        </BareButton>
      ) : null}
    </span>
  );
}

export function MatchingMemoQuickAdd({
  compact = false,
  memoPreview,
  talentId,
}: {
  compact?: boolean;
  memoPreview: string | null;
  talentId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const createMemo = useCreateOpsCareerProfileMemo(talentId);
  const trimmedDraft = draft.trim();

  return (
    <InlineActionRoot compact={compact}>
      {memoPreview ? (
        <div
          className={cx(
            "line-clamp-3 rounded-md border border-neutral-1000-a05 bg-bg-default px-2 py-1.5 text-xs leading-5 text-neutral-muted",
            compact && "line-clamp-2 text-[11px] leading-4"
          )}
          title={memoPreview}
        >
          {memoPreview}
        </div>
      ) : null}

      {editing ? (
        <div className="mt-2">
          <UiTextarea
            unstyled
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={compact ? 2 : 3}
            className={cx(
              "w-full resize-y rounded-md border border-neutral-1000-a10 bg-bg-floating px-2 py-2 text-xs leading-5 text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-400 focus:ring-2 focus:ring-neutral-1000-a10",
              compact ? "min-h-[64px]" : "min-h-[84px]"
            )}
            placeholder="새 메모 입력"
            autoFocus
          />
          <div className="mt-1.5 flex items-center justify-end gap-1.5">
            <BareButton
              type="button"
              onClick={() => {
                setDraft("");
                setEditing(false);
              }}
              className="h-7 rounded-md px-2 text-[11px] text-neutral-muted hover:bg-bg-weak"
            >
              취소
            </BareButton>
            <BareButton
              type="button"
              onClick={() => {
                if (!trimmedDraft) return;
                createMemo.mutate(trimmedDraft, {
                  onSuccess: () => {
                    setDraft("");
                    setEditing(false);
                  },
                });
              }}
              disabled={!trimmedDraft || createMemo.isPending}
              className={cx(opsTheme.buttonPrimary, "h-7 px-2 text-[11px]")}
            >
              {createMemo.isPending ? (
                <LoaderCircle className="h-3 w-3 animate-spin" />
              ) : null}
              저장
            </BareButton>
          </div>
        </div>
      ) : (
        <BareButton
          type="button"
          onClick={() => setEditing(true)}
          className={cx(
            "mt-1.5 inline-flex h-7 items-center gap-1.5 rounded-md bg-bg-floating px-2 text-[11px] font-medium text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary",
            compact && !memoPreview && "mt-0"
          )}
        >
          <Plus className="h-3 w-3" />
          메모 추가
        </BareButton>
      )}
    </InlineActionRoot>
  );
}

export function MatchingTagEditor({
  compact = false,
  roleId,
  talent,
}: {
  compact?: boolean;
  roleId?: string | null;
  talent: {
    tags: OpsMatchingTalentTag[];
    userId: OpsMatchingTalentItem["userId"];
  };
}) {
  const addTag = useAddOpsMatchingTalentTag();
  const deleteTag = useDeleteOpsMatchingTalentTag();
  const pending = addTag.isPending || deleteTag.isPending;
  const selectedTagValues = useMemo(
    () => new Set(talent.tags.map((tag) => tag.tag)),
    [talent.tags]
  );

  const addFixedTag = (tag: string) => {
    if (!tag || selectedTagValues.has(tag) || pending) return;
    addTag.mutate({ roleId: roleId ?? null, tag, talentId: talent.userId });
  };

  return (
    <InlineActionRoot compact={compact}>
      {talent.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {talent.tags.map((tag) => (
            <MatchingTagPill
              key={tag.id}
              tag={tag.tag}
              removable
              onRemove={() =>
                deleteTag.mutate({
                  roleId: roleId ?? null,
                  tagId: tag.id,
                  talentId: talent.userId,
                })
              }
            />
          ))}
        </div>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <BareButton
            type="button"
            disabled={pending}
            className={cx(
              opsTheme.buttonSecondary,
              "h-8 px-2 text-[11px]",
              talent.tags.length > 0 && "mt-2"
            )}
          >
            {addTag.isPending ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            태그 추가
          </BareButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          {MATCHING_TAG_OPTIONS.map((option) => {
            const selected = selectedTagValues.has(option.value);
            return (
              <DropdownMenuItem
                key={option.value}
                disabled={selected || pending}
                onSelect={() => addFixedTag(option.value)}
              >
                <span
                  className={cx(
                    "h-2 w-2 shrink-0 rounded-full",
                    option.dotClassName
                  )}
                  aria-hidden
                />
                <span>{option.label}</span>
                {selected ? (
                  <span className="ml-auto text-[11px] text-neutral-soft">
                    선택됨
                  </span>
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </InlineActionRoot>
  );
}
