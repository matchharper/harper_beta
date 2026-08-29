import { ArrowUp, FileText, FileUp, LoaderCircle, Plus, X } from "lucide-react";
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
import { ChatComposerFrame } from "@/components/chat/ChatComposer";
import { ChatComposerActionMenu } from "@/components/chat/ChatComposerActionMenu";
import { ChatComposerTokenOverlay } from "@/components/chat/ChatComposerTokenOverlay";
import {
  ChatComposerPicker,
  type ChatComposerPickerItem,
  useChatComposerPickerKeyboard,
} from "@/components/chat/ChatComposerPicker";
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
import { useChatComposerTokens } from "@/hooks/chat/useChatComposerTokens";
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
import { serializeOrgAgentDraftMentionTokens } from "@/lib/org/agent/mentionText";
import {
  readRoleCreationAttachments,
  validateRoleCreationDraftAttachments,
} from "@/lib/org/agent/roleCreationAttachmentClient";
import { ROLE_CREATION_FILE_ACCEPT } from "@/lib/org/agent/roleCreationDocumentTypes";
import type {
  OrgAgentMention,
  OrgAgentMentionCandidate,
} from "@/lib/org/agent/types";
import {
  applyChatComposerPickerSelection,
  getChatComposerTriggerSearch,
} from "@/lib/chat/composerPicker";
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
        aria-label="Harper 모델 선택"
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
  const [mentionSearch, setMentionSearch] = useState<{
    query: string;
    start: number;
  } | null>(null);
  const mentionQuery = mentionSearch?.query ?? "";
  const mentionCandidates = useOrgAgentMentionCandidates({
    enabled: Boolean(workspaceId) && !disabled,
    query: mentionQuery,
    roleId,
    workspaceId,
  });

  const candidates = mentionCandidates.candidates;
  const mentionTokens = useChatComposerTokens<OrgAgentMention>({
    onValueChange: setDraft,
    textareaRef,
    value: draft,
  });
  const hasHighlightedMention = mentionTokens.tokens.length > 0;

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

  const closeMentionPicker = useCallback(() => setMentionSearch(null), []);
  const handleSelectMention = useCallback(
    (candidate: OrgAgentMentionCandidate) => {
      if (!mentionSearch) return;
      const textarea = textareaRef.current;
      const cursor = textarea?.selectionStart ?? draft.length;
      const selection = applyChatComposerPickerSelection({
        cursor,
        search: mentionSearch,
        selectedText: candidate.label,
        value: draft,
      });
      mentionTokens.insertToken({
        cursor: selection.cursor,
        data: {
          displayName: candidate.label,
          recommendationId: candidate.recommendationId,
          roleId: candidate.roleId,
          talentId: candidate.talentId,
        },
        end: selection.selectedEnd,
        id: `${candidate.talentId}:${crypto.randomUUID()}`,
        start: selection.selectedStart,
        text: candidate.label,
        value: selection.value,
      });
      setMentionSearch(null);
    },
    [draft, mentionSearch, mentionTokens]
  );
  const mentionPickerCountLabel =
    mentionCandidates.totalCount > candidates.length
      ? `${candidates.length}/${mentionCandidates.totalCount}명`
      : candidates.length > 0
        ? `${candidates.length}명`
        : undefined;
  const normalizedRoleId = roleId?.trim() ?? "";
  const mentionPickerItems: ChatComposerPickerItem[] = [
    {
      id: "title",
      text: "연결 목록",
      trailingText: mentionPickerCountLabel,
      type: "text",
    },
    ...(mentionCandidates.isLoading && candidates.length === 0
      ? [
          {
            announcement: "status" as const,
            id: "loading",
            text: "Searching...",
            type: "text" as const,
          },
        ]
      : mentionCandidates.error && candidates.length === 0
        ? [
            {
              announcement: "alert" as const,
              id: "error",
              text: "후보자를 불러오지 못했어요.",
              type: "text" as const,
            },
          ]
        : candidates.length === 0
          ? [
              {
                id: "empty",
                text: "아직 연결된 후보자가 없어요.",
                type: "text" as const,
              },
            ]
          : candidates.map((candidate) => ({
              icon: (
                <TalentMentionAvatar
                  name={candidate.label}
                  src={candidate.profilePicture}
                />
              ),
              id: `${candidate.talentId}:${candidate.recommendationId}`,
              onSelect: () => handleSelectMention(candidate),
              subText:
                normalizedRoleId && candidate.roleId !== normalizedRoleId
                  ? candidate.roleName
                  : undefined,
              text: candidate.label,
              trailingText: candidate.stageLabel,
              type: "option" as const,
            }))),
    ...(mentionCandidates.hasNextPage
      ? [
          {
            disabled: mentionCandidates.isFetchingNextPage,
            icon: mentionCandidates.isFetchingNextPage ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Plus />
            ),
            id: "load-more",
            onSelect: () => {
              void mentionCandidates.fetchNextPage();
            },
            text: "더 불러오기",
            type: "action" as const,
          },
        ]
      : []),
  ];
  const {
    activeDescendantId: mentionActiveDescendantId,
    highlightedIndex: mentionHighlightedIndex,
    navigationDirection: mentionNavigationDirection,
    onKeyDown: handleMentionPickerKeyDown,
    resetHighlight: resetMentionHighlight,
    setHighlightedIndex: setMentionHighlightedIndex,
  } = useChatComposerPickerKeyboard({
    isOpen: Boolean(mentionSearch),
    items: mentionPickerItems,
    listId: mentionListId,
    onClose: closeMentionPicker,
  });

  const updateMentionSearch = useCallback(
    (value: string) => {
      const cursor = textareaRef.current?.selectionStart ?? value.length;
      const search = getChatComposerTriggerSearch({
        cursor,
        triggers: ["@"],
        value,
      });
      setMentionSearch(search);
      resetMentionHighlight();
    },
    [resetMentionHighlight]
  );

  const handleChange = (
    value: string,
    textarea?: HTMLTextAreaElement | null
  ) => {
    if (allowAttachments && textarea) {
      resizeRoleCreationTextarea(textarea);
    }
    mentionTokens.updateValue(value);
    updateMentionSearch(value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isComposing = event.nativeEvent.isComposing;

    if (mentionSearch) {
      if (handleMentionPickerKeyDown(event)) return;
      if (event.key === " ") {
        const now = event.timeStamp;
        if (lastSpaceAtRef.current > 0 && now - lastSpaceAtRef.current < 650) {
          setMentionSearch(null);
        }
        lastSpaceAtRef.current = now;
      }
    }

    if (mentionTokens.handleKeyDown(event)) return;

    if (event.key === "Enter" && !event.shiftKey && !isComposing) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    const serialized = serializeOrgAgentDraftMentionTokens(
      draft,
      mentionTokens.tokens
    );
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
      mentionTokens.resetTokens();
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
  const attachmentMenuItems = [
    {
      disabled: disabled || isPreparingAttachments || isStreaming,
      icon: <FileUp />,
      id: "upload-file",
      label: "파일 업로드",
      loading: isPreparingAttachments,
      onSelect: () => fileInputRef.current?.click(),
      sectionLabel: "도구",
      trailingText: "PDF, DOCX",
    },
  ];
  const attachmentContext =
    attachments.length > 0 ? (
      <div className="flex flex-wrap gap-1.5">
        {attachments.map((attachment) => (
          <span
            key={attachment.id}
            className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-xl border border-neutral-1000-a10 bg-bg-floating pl-2.5 pr-1 text-[12px] text-neutral-primary"
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
    ) : undefined;

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
        <ChatComposerFrame
          ref={textareaRef}
          actionLayout={allowAttachments ? "footer" : "overlay"}
          className="overflow-visible"
          context={attachmentContext}
          value={draft}
          rows={allowAttachments ? 2 : 3}
          autoFocus={autoFocus}
          disabled={disabled || isStreaming || isPreparingAttachments}
          aria-activedescendant={mentionActiveDescendantId}
          aria-autocomplete="list"
          aria-controls={mentionSearch ? mentionListId : undefined}
          aria-expanded={Boolean(mentionSearch)}
          placeholder="Ask anything, @ for choosing talent"
          mobileLeadingAction={
            allowAttachments ? (
              <ChatComposerActionMenu
                disabled={disabled || isPreparingAttachments || isStreaming}
                items={attachmentMenuItems}
              />
            ) : undefined
          }
          onChange={(event) =>
            handleChange(event.target.value, event.currentTarget)
          }
          onBeforeInput={mentionTokens.handleBeforeInput}
          onKeyDown={handleKeyDown}
          onSelect={mentionTokens.handleSelect}
          onScroll={(event) => syncMentionHighlight(event.currentTarget)}
          textareaClassName={cn(
            allowAttachments &&
              "min-h-12 py-3 [&::placeholder]:block [&::placeholder]:truncate",
            hasHighlightedMention &&
              "relative z-10 text-transparent caret-neutral-primary"
          )}
          overlay={
            <>
              {hasHighlightedMention ? (
                <ChatComposerTokenOverlay
                  ref={mentionHighlightRef}
                  className={cn(allowAttachments && "min-h-12 py-3")}
                  segments={mentionTokens.segments}
                />
              ) : null}
              {mentionSearch ? (
                <ChatComposerPicker
                  highlightedIndex={mentionHighlightedIndex}
                  items={mentionPickerItems}
                  listId={mentionListId}
                  navigationDirection={mentionNavigationDirection}
                  onClose={closeMentionPicker}
                  onHighlight={setMentionHighlightedIndex}
                />
              ) : null}
            </>
          }
          action={
            <div className="w-full flex items-end justify-between gap-2">
              {allowAttachments ? (
                <ChatComposerActionMenu
                  className="hidden md:inline-flex"
                  disabled={disabled || isPreparingAttachments || isStreaming}
                  items={attachmentMenuItems}
                />
              ) : null}
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
