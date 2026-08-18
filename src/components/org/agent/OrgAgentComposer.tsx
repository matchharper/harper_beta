import { ArrowUp, FileText, LoaderCircle, Paperclip, X } from "lucide-react";
import Image from "next/image";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { formatKstDateOnly } from "@/components/ops/dateUtils";
import { ChatComposerFrame } from "@/components/chat/ChatComposer";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrgAgentMentionCandidates } from "@/hooks/org/useOrgAgent";
import {
  createDraftFileAttachment,
  dedupeDraftAttachments,
  type DraftChatAttachment,
} from "@/lib/chat/attachmentClient";
import { getDisplayableProfileImageUrl } from "@/lib/imageUrl";
import {
  ORG_AGENT_CLAUDE_MODEL,
  ORG_AGENT_DEEPSEEK_FLASH_MODEL,
  ORG_AGENT_DEEPSEEK_PRO_MODEL,
  ORG_AGENT_GROK_MODEL,
  ORG_AGENT_LUNA_MODEL,
  ORG_AGENT_TERRA_MODEL,
  isOrgAgentModelId,
  type OrgAgentModelId,
} from "@/lib/org/agent/modelConfig";
import {
  resolveOrgAgentDraftMentions,
  serializeOrgAgentDraftMentions,
  splitOrgAgentMentionText,
} from "@/lib/org/agent/mentionText";
import {
  readRoleCreationAttachments,
  validateRoleCreationDraftAttachments,
} from "@/lib/org/agent/roleCreationAttachmentClient";
import { ROLE_CREATION_FILE_ACCEPT } from "@/lib/org/agent/roleCreationDocumentTypes";
import type {
  OrgAgentMention,
  OrgAgentMentionCandidate,
} from "@/lib/org/agent/types";
import { cn } from "@/lib/utils";

const ROLE_CREATION_TEXTAREA_MAX_ROWS = 4;

function resizeRoleCreationTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";

  const styles = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
  const paddingHeight =
    Number.parseFloat(styles.paddingTop) +
    Number.parseFloat(styles.paddingBottom);
  const borderHeight =
    Number.parseFloat(styles.borderTopWidth) +
    Number.parseFloat(styles.borderBottomWidth);
  const maxHeight =
    lineHeight * ROLE_CREATION_TEXTAREA_MAX_ROWS + paddingHeight + borderHeight;
  const contentHeight = textarea.scrollHeight + borderHeight;

  textarea.style.height = `${Math.min(contentHeight, maxHeight)}px`;
  textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
}

function getMentionSearch(value: string, cursor: number) {
  const prefix = value.slice(0, cursor);
  const atIndex = prefix.lastIndexOf("@");
  if (atIndex < 0) return null;
  const afterAt = prefix.slice(atIndex + 1);
  if (afterAt.includes("\n") || afterAt.includes("  ")) return null;
  return {
    query: afterAt.trim(),
    start: atIndex,
  };
}

function formatMentionDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : formatKstDateOnly(date);
}

function TalentMentionAvatar({
  name,
  src,
}: {
  name: string;
  src?: string | null;
}) {
  const profilePicture = getDisplayableProfileImageUrl(src);
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);

  if (profilePicture && failedImageSrc !== profilePicture) {
    return (
      <Image
        alt=""
        className="size-6 shrink-0 rounded-full object-cover"
        height={24}
        onError={() => setFailedImageSrc(profilePicture)}
        src={profilePicture}
        unoptimized
        width={24}
      />
    );
  }

  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bg-weak text-[12px] font-medium text-neutral-muted">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function MentionMenu({
  candidates,
  currentRoleId,
  highlightedIndex,
  isLoading,
  listId,
  onHighlight,
  onSelect,
}: {
  candidates: OrgAgentMentionCandidate[];
  currentRoleId?: string | null;
  highlightedIndex: number;
  isLoading: boolean;
  listId: string;
  onHighlight: (index: number) => void;
  onSelect: (candidate: OrgAgentMentionCandidate) => void;
}) {
  const highlightedOptionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    highlightedOptionRef.current?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const normalizedCurrentRoleId = currentRoleId?.trim() ?? "";
  const currentRoleCandidates = normalizedCurrentRoleId
    ? candidates.filter(
        (candidate) => candidate.roleId === normalizedCurrentRoleId
      )
    : [];
  const otherRoleCandidates = candidates.filter(
    (candidate) => candidate.roleId !== normalizedCurrentRoleId
  );

  const renderCandidate = (
    candidate: OrgAgentMentionCandidate,
    index: number,
    showRoleName: boolean
  ) => (
    <button
      ref={index === highlightedIndex ? highlightedOptionRef : null}
      aria-selected={index === highlightedIndex}
      id={`${listId}-option-${index}`}
      key={`${candidate.talentId}:${candidate.recommendationId}`}
      role="option"
      type="button"
      className={cn(
        "grid grid-cols-[24px_1fr_160px_60px] w-full items-center gap-3 px-3 py-1.5 text-left transition",
        index === highlightedIndex
          ? "bg-bg-basement text-neutral-primary"
          : "text-neutral-primary hover:bg-bg-weak"
      )}
      onMouseEnter={() => onHighlight(index)}
      onMouseDown={(event) => {
        event.preventDefault();
        onSelect(candidate);
      }}
    >
      <TalentMentionAvatar
        name={candidate.label}
        src={candidate.profilePicture}
      />
      <span className="min-w-0 flex-1 truncate text-[12px] font-normal">
        {candidate.label}
      </span>
      {showRoleName ? (
        <div className="text-[11px] font-normal max-w-39 truncate text-neutral-muted">
          {candidate.roleName}
        </div>
      ) : null}
      <div className="text-[11px] font-normal">{candidate.stageLabel}</div>
      {/* <Badge
        className="max-w-28 truncate"
        radius="full"
        size="sm"
        variant="faded"
      >
       
      </Badge> */}
      {/* <span
        aria-label={`연결 제안일 ${formatMentionDate(candidate.recommendedAt)}`}
        className="shrink-0 text-[11px] tabular-nums text-neutral-soft"
      >
        {formatMentionDate(candidate.recommendedAt)}
      </span> */}
    </button>
  );

  return (
    <div className="absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden rounded-lg border border-neutral-1000-a10 bg-bg-floating shadow-xl sm:w-[60%] sm:min-w-[480px]">
      <div className="flex items-center justify-between px-3 py-2 text-[11px] text-neutral-muted">
        <span>연결 목록</span>
        {!isLoading && candidates.length > 0 ? (
          <span>{candidates.length}명</span>
        ) : null}
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-neutral-muted">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          talent 불러오는 중
        </div>
      ) : candidates.length === 0 ? (
        <div className="px-3 py-3 text-[12px] text-neutral-muted">
          아직 연결된 인재가 없습니다.
        </div>
      ) : (
        <div
          className="max-h-72 overflow-y-auto py-1"
          id={listId}
          role="listbox"
        >
          {currentRoleCandidates.map((candidate, index) =>
            renderCandidate(candidate, index, false)
          )}
          {currentRoleCandidates.length > 0 &&
          otherRoleCandidates.length > 0 ? (
            <div
              aria-hidden="true"
              className="mx-3 my-1 border-t border-neutral-1000-a10"
              role="separator"
            />
          ) : null}
          {otherRoleCandidates.map((candidate, index) =>
            renderCandidate(
              candidate,
              currentRoleCandidates.length + index,
              true
            )
          )}
        </div>
      )}
    </div>
  );
}

function ModelSelector({
  model,
  onChange,
  visible,
}: {
  model: OrgAgentModelId;
  onChange: (model: OrgAgentModelId) => void;
  visible: boolean;
}) {
  const options: Array<{ label: string; value: OrgAgentModelId }> = [
    {
      label: "DeepSeek V4 Flash · high",
      value: ORG_AGENT_DEEPSEEK_FLASH_MODEL,
    },
    { label: "DeepSeek V4 Pro · high", value: ORG_AGENT_DEEPSEEK_PRO_MODEL },
    { label: "Luna · GPT-5.6", value: ORG_AGENT_LUNA_MODEL },
    { label: "Terra · GPT-5.6", value: ORG_AGENT_TERRA_MODEL },
    { label: "Claude Sonnet 5", value: ORG_AGENT_CLAUDE_MODEL },
    { label: "Grok 4.3", value: ORG_AGENT_GROK_MODEL },
  ];

  if (!visible) return null;
  return (
    <Select
      items={options}
      value={model}
      onValueChange={(value) => {
        if (isOrgAgentModelId(value)) onChange(value);
      }}
    >
      <SelectTrigger
        aria-label="company-side LLM 모델"
        className="w-56 text-xs"
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function OrgAgentComposer({
  allowAttachments,
  autoFocus,
  compactWidth,
  disabled,
  isStreaming,
  model,
  onModelChange,
  onSend,
  roleId,
  workspaceId,
}: {
  allowAttachments?: boolean;
  autoFocus?: boolean;
  compactWidth?: boolean;
  disabled?: boolean;
  isStreaming: boolean;
  model: OrgAgentModelId;
  onModelChange: (model: OrgAgentModelId) => void;
  onSend: (args: {
    attachments: Awaited<ReturnType<typeof readRoleCreationAttachments>>;
    mentions: OrgAgentMention[];
    message: string;
  }) => void | Promise<void>;
  roleId?: string | null;
  workspaceId: string;
}) {
  const mentionListId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mentionHighlightRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastSpaceAtRef = useRef<number>(0);
  const submissionPendingRef = useRef(false);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<DraftChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [isPreparingAttachments, setIsPreparingAttachments] = useState(false);
  const [mentions, setMentions] = useState<OrgAgentMention[]>([]);
  const [mentionSearch, setMentionSearch] = useState<{
    query: string;
    start: number;
  } | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const mentionQuery = mentionSearch?.query ?? "";
  const mentionCandidates = useOrgAgentMentionCandidates({
    enabled: Boolean(workspaceId),
    query: mentionQuery,
    roleId,
    workspaceId,
  });

  const candidates = mentionCandidates.data ?? [];
  const resolvedDraft = resolveOrgAgentDraftMentions(draft, mentions);
  const highlightedDraftSegments = splitOrgAgentMentionText(
    resolvedDraft.serializedText
  );
  const hasHighlightedMention = highlightedDraftSegments.some(
    (segment) => segment.kind === "mention"
  );

  const syncMentionHighlight = useCallback(
    (textarea: HTMLTextAreaElement | null) => {
      const highlight = mentionHighlightRef.current;
      if (!textarea || !highlight) return;
      highlight.style.height = `${textarea.clientHeight}px`;
      highlight.style.width = `${textarea.clientWidth}px`;
      highlight.scrollTop = textarea.scrollTop;
    },
    []
  );

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (allowAttachments) resizeRoleCreationTextarea(textarea);
    syncMentionHighlight(textarea);
  }, [allowAttachments, draft, syncMentionHighlight]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !window.ResizeObserver) return;

    let previousWidth = textarea.getBoundingClientRect().width;
    const observer = new window.ResizeObserver(([entry]) => {
      const nextWidth = entry?.contentRect.width ?? 0;
      if (nextWidth <= 0 || Math.abs(previousWidth - nextWidth) < 1) return;
      previousWidth = nextWidth;
      if (allowAttachments) resizeRoleCreationTextarea(textarea);
      syncMentionHighlight(textarea);
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [allowAttachments, syncMentionHighlight]);

  const updateMentionSearch = useCallback((value: string) => {
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const search = getMentionSearch(value, cursor);
    setMentionSearch(search);
    setHighlightedIndex(0);
  }, []);

  const handleChange = (
    value: string,
    textarea?: HTMLTextAreaElement | null
  ) => {
    if (allowAttachments && textarea) {
      resizeRoleCreationTextarea(textarea);
    }
    setDraft(value);
    updateMentionSearch(value);
  };

  const handleSelectMention = (candidate: OrgAgentMentionCandidate) => {
    if (!mentionSearch) return;
    if (!mentionSearch) return;
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? draft.length;
    const before = draft.slice(0, mentionSearch.start);
    const after = draft.slice(cursor);
    const insertion = `@${candidate.label}${after.startsWith(" ") ? "" : " "}`;
    const nextDraft = `${before}${insertion}${after}`;
    setDraft(nextDraft);
    setMentions((current) => [
      ...current.filter((mention) => mention.talentId !== candidate.talentId),
      {
        displayName: candidate.label,
        recommendationId: candidate.recommendationId,
        roleId: candidate.roleId,
        talentId: candidate.talentId,
      },
    ]);
    setMentionSearch(null);
    requestAnimationFrame(() => {
      textarea?.focus();
      const nextCursor = before.length + insertion.length;
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isComposing = event.nativeEvent.isComposing;

    if (mentionSearch) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionSearch(null);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((index) =>
          candidates.length ? (index + 1) % candidates.length : 0
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((index) =>
          candidates.length
            ? (index - 1 + candidates.length) % candidates.length
            : 0
        );
        return;
      }
      if (
        event.key === "Enter" &&
        !isComposing &&
        candidates[highlightedIndex]
      ) {
        event.preventDefault();
        handleSelectMention(candidates[highlightedIndex]);
        return;
      }
      if (event.key === " ") {
        const now = event.timeStamp;
        if (lastSpaceAtRef.current > 0 && now - lastSpaceAtRef.current < 650) {
          setMentionSearch(null);
        }
        lastSpaceAtRef.current = now;
      }
    }

    if (event.key === "Enter" && !event.shiftKey && !isComposing) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    const serialized = serializeOrgAgentDraftMentions(draft, mentions);
    if (
      (!serialized.text && attachments.length === 0) ||
      disabled ||
      isStreaming ||
      submissionPendingRef.current
    ) {
      return;
    }
    submissionPendingRef.current = true;
    setAttachmentError("");
    setIsPreparingAttachments(true);
    try {
      const preparedAttachments = allowAttachments
        ? await readRoleCreationAttachments({ attachments, workspaceId })
        : [];
      setDraft("");
      setAttachments([]);
      setMentions([]);
      setMentionSearch(null);
      await onSend({
        attachments: preparedAttachments,
        mentions: serialized.mentions,
        message: serialized.text,
      });
    } catch (error) {
      setAttachmentError(
        error instanceof Error ? error.message : "파일을 읽지 못했습니다."
      );
    } finally {
      submissionPendingRef.current = false;
      setIsPreparingAttachments(false);
    }
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    try {
      let next = attachments;
      for (const file of Array.from(files)) {
        next = dedupeDraftAttachments(next, createDraftFileAttachment(file));
      }
      validateRoleCreationDraftAttachments(next);
      setAttachments(next);
      setAttachmentError("");
    } catch (error) {
      setAttachmentError(
        error instanceof Error ? error.message : "파일을 첨부하지 못했습니다."
      );
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <form
      className="w-full px-4 pb-3 pt-2 md:px-5 md:pb-6 md:pt-0"
      onSubmit={handleSubmit}
    >
      <div
        className={cn(
          "mx-auto w-full",
          compactWidth ? "max-w-[760px]" : "max-w-[1120px]"
        )}
      >
        {allowAttachments ? (
          <input
            ref={fileInputRef}
            accept={ROLE_CREATION_FILE_ACCEPT}
            className="hidden"
            multiple
            onChange={(event) => addFiles(event.target.files)}
            type="file"
          />
        ) : null}
        {attachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-neutral-1000-a10 bg-bg-floating pl-2.5 pr-1 text-[12px] text-neutral-primary"
              >
                <FileText className="size-3.5 shrink-0 text-neutral-muted" />
                <span className="max-w-56 truncate">{attachment.name}</span>
                <MuteButton
                  aria-label={`${attachment.name} 제거`}
                  disabled={isPreparingAttachments || isStreaming}
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter((item) => item.id !== attachment.id)
                    )
                  }
                  size="sm"
                  type="button"
                  variant="transparent"
                >
                  <X className="size-3" />
                </MuteButton>
              </span>
            ))}
          </div>
        ) : null}
        <ChatComposerFrame
          ref={textareaRef}
          actionLayout={allowAttachments ? "footer" : "overlay"}
          className="overflow-visible"
          value={draft}
          rows={allowAttachments ? 2 : 3}
          autoFocus={autoFocus}
          disabled={disabled || isStreaming || isPreparingAttachments}
          aria-activedescendant={
            mentionSearch && candidates[highlightedIndex]
              ? `${mentionListId}-option-${highlightedIndex}`
              : undefined
          }
          aria-autocomplete="list"
          aria-controls={mentionSearch ? mentionListId : undefined}
          aria-expanded={Boolean(mentionSearch)}
          placeholder="Ask anything, @ for choosing talent"
          onChange={(event) =>
            handleChange(event.target.value, event.currentTarget)
          }
          onKeyDown={handleKeyDown}
          onScroll={(event) => syncMentionHighlight(event.currentTarget)}
          textareaClassName={cn(
            allowAttachments && "min-h-12 py-3",
            hasHighlightedMention &&
              "relative z-10 text-transparent caret-neutral-primary"
          )}
          overlay={
            <>
              {hasHighlightedMention ? (
                <div
                  ref={mentionHighlightRef}
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute left-0 top-0 z-0 min-h-[72px] select-none overflow-hidden whitespace-pre-wrap break-words border-none px-3.5 py-4 text-base leading-5 text-neutral-primary md:text-sm lg:text-[14px]",
                    allowAttachments && "min-h-12 py-3"
                  )}
                >
                  {highlightedDraftSegments.map((segment, index) =>
                    segment.kind === "mention" ? (
                      <span
                        key={`${segment.talentId}:${index}`}
                        className="font-medium text-link"
                      >
                        {segment.text}
                      </span>
                    ) : (
                      <span key={`text:${index}`}>{segment.text}</span>
                    )
                  )}
                </div>
              ) : null}
              {mentionSearch ? (
                <MentionMenu
                  candidates={candidates}
                  currentRoleId={roleId}
                  highlightedIndex={highlightedIndex}
                  isLoading={mentionCandidates.isLoading}
                  listId={mentionListId}
                  onHighlight={setHighlightedIndex}
                  onSelect={handleSelectMention}
                />
              ) : null}
            </>
          }
          action={
            <div className="w-full flex items-end justify-between gap-2">
              {allowAttachments && (
                <MuteButton
                  aria-label="파일 첨부"
                  className="rounded-full"
                  disabled={isPreparingAttachments || isStreaming}
                  onClick={() => fileInputRef.current?.click()}
                  size="sm"
                  type="button"
                  variant="transparent"
                >
                  <Paperclip className="size-4" />
                </MuteButton>
              )}
              <MuteButton
                type="submit"
                aria-label="메시지 보내기"
                variant="primary"
                className="rounded-full"
                disabled={
                  disabled ||
                  isStreaming ||
                  isPreparingAttachments ||
                  (!draft.trim() && attachments.length === 0)
                }
              >
                {isStreaming || isPreparingAttachments ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </MuteButton>
            </div>
          }
        />
        {attachmentError ? (
          <div className="mt-2 px-1 text-[12px] text-critical" role="alert">
            {attachmentError}
          </div>
        ) : null}
        {/* <div className="mt-2 flex items-center justify-between gap-2">
            <ModelSelector
              model={model}
              onChange={onModelChange}
              visible={true}
            />
          </div> */}
      </div>
    </form>
  );
}
