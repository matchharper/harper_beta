import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import {
  DEFAULT_MATCHING_TAG_BADGE_CLASS,
  DEFAULT_MATCHING_TAG_DOT_CLASS,
  getMatchingTagLabel,
  getMatchingTagOption,
  isMatchingReviewStageTag,
} from "@/components/ops/matching/tagMeta";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input as UiInput } from "@/components/ui/input";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { useCreateOpsCareerProfileMemo } from "@/hooks/ops/useOpsCareer";
import {
  useAddOpsMatchingTalentTag,
  useDeleteOpsMatchingTalentTag,
  useOpsMatchingTagOptions,
} from "@/hooks/ops/useOpsMatching";
import type {
  OpsMatchingTalentItem,
  OpsMatchingTalentTag,
} from "@/lib/ops/matching";

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

function normalizeTagKey(value: string) {
  return value.trim().toLowerCase();
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
  hideReviewStageTags = false,
  roleId,
  showAddButton = true,
  talent,
}: {
  compact?: boolean;
  hideReviewStageTags?: boolean;
  roleId?: string | null;
  showAddButton?: boolean;
  talent: {
    tags: OpsMatchingTalentTag[];
    userId: OpsMatchingTalentItem["userId"];
  };
}) {
  const [newTagDraft, setNewTagDraft] = useState("");
  const addTag = useAddOpsMatchingTalentTag();
  const deleteTag = useDeleteOpsMatchingTalentTag();
  const tagOptionsQuery = useOpsMatchingTagOptions(showAddButton);
  const pending = addTag.isPending || deleteTag.isPending;
  const selectedTagKeys = useMemo(
    () => new Set(talent.tags.map((tag) => normalizeTagKey(tag.tag))),
    [talent.tags]
  );
  const visibleTags = useMemo(
    () =>
      hideReviewStageTags
        ? talent.tags.filter((tag) => !isMatchingReviewStageTag(tag.tag))
        : talent.tags,
    [hideReviewStageTags, talent.tags]
  );
  const tagOptionItems = useMemo(() => {
    const items: { count: number | null; tag: string }[] = [];
    const seenKeys = new Set<string>();
    for (const option of tagOptionsQuery.data?.items ?? []) {
      const tag = option.tag.trim();
      const tagKey = normalizeTagKey(tag);
      if (!tagKey || seenKeys.has(tagKey)) continue;
      seenKeys.add(tagKey);
      items.push({ count: option.count, tag });
    }
    for (const tag of visibleTags) {
      const tagKey = normalizeTagKey(tag.tag);
      if (!tagKey || seenKeys.has(tagKey)) continue;
      seenKeys.add(tagKey);
      items.push({ count: null, tag: tag.tag });
    }
    return items;
  }, [tagOptionsQuery.data?.items, visibleTags]);

  const addTagValue = (tag: string, onSuccess?: () => void) => {
    const normalizedTag = tag.trim();
    if (!normalizedTag || selectedTagKeys.has(normalizeTagKey(normalizedTag))) {
      onSuccess?.();
      return;
    }
    if (pending) return;
    addTag.mutate(
      { roleId: roleId ?? null, tag: normalizedTag, talentId: talent.userId },
      { onSuccess }
    );
  };

  const deleteTagValue = (tag: string) => {
    if (pending) return;
    const tagKey = normalizeTagKey(tag);
    const currentTag = talent.tags.find(
      (item) => normalizeTagKey(item.tag) === tagKey
    );
    if (!currentTag) return;
    deleteTag.mutate({
      roleId: roleId ?? null,
      tagId: currentTag.id,
      talentId: talent.userId,
    });
  };

  const handleCreateTag = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const tag = newTagDraft.trim();
    if (!tag || pending) return;
    addTagValue(tag, () => setNewTagDraft(""));
  };

  if (visibleTags.length === 0 && !showAddButton) {
    return null;
  }

  return (
    <InlineActionRoot compact={compact}>
      {visibleTags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {visibleTags.map((tag) => (
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
      {showAddButton ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <BareButton
              type="button"
              disabled={pending}
              className={cx(
                opsTheme.buttonSecondary,
                "h-8 px-2 text-[11px]",
                visibleTags.length > 0 && "mt-2"
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
          <DropdownMenuContent align="start" className="w-[180px]">
            <form
              className="space-y-2 p-1"
              onSubmit={handleCreateTag}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <UiInput
                unstyled
                value={newTagDraft}
                onChange={(event) => setNewTagDraft(event.target.value)}
                maxLength={40}
                className="h-8 w-full rounded-md border border-neutral-1000-a10 bg-bg-default px-2 text-xs text-neutral-primary outline-none placeholder:text-neutral-placeholder focus:border-neutral-400 focus:ring-2 focus:ring-neutral-1000-a05"
                placeholder="새 태그"
              />
              <BareButton
                type="submit"
                disabled={!newTagDraft.trim() || pending}
                className={cx(opsTheme.buttonPrimary, "h-7 w-full text-[11px]")}
              >
                {addTag.isPending ? (
                  <LoaderCircle className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                추가
              </BareButton>
            </form>
            <DropdownMenuSeparator />
            {tagOptionsQuery.isLoading ? (
              <div className="flex items-center justify-center py-4">
                <LoaderCircle className="h-4 w-4 animate-spin text-neutral-soft" />
              </div>
            ) : tagOptionsQuery.error ? (
              <div className="px-2 py-3 text-xs leading-5 text-critical">
                태그 목록을 불러오지 못했습니다.
              </div>
            ) : tagOptionItems.length === 0 ? (
              <div className="px-2 py-3 text-xs leading-5 text-neutral-soft">
                기존 태그가 없습니다.
              </div>
            ) : (
              tagOptionItems.map((option) => {
                const selected = selectedTagKeys.has(
                  normalizeTagKey(option.tag)
                );
                const tagOption = getMatchingTagOption(option.tag);
                const dotClassName =
                  tagOption?.dotClassName ?? DEFAULT_MATCHING_TAG_DOT_CLASS;
                const label = getMatchingTagLabel(option.tag);
                return (
                  <DropdownMenuCheckboxItem
                    key={option.tag}
                    checked={selected}
                    disabled={pending}
                    className="gap-2 pl-7 pr-2 text-xs"
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={(checked) => {
                      if (checked === true) addTagValue(option.tag);
                      else deleteTagValue(option.tag);
                    }}
                  >
                    <span
                      className={cx(
                        "h-2 w-2 shrink-0 rounded-full",
                        dotClassName
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {option.count !== null ? (
                      <span className="text-[10px] text-neutral-soft">
                        {option.count}
                      </span>
                    ) : null}
                  </DropdownMenuCheckboxItem>
                );
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </InlineActionRoot>
  );
}
