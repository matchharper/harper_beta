import TalentCareerModal from "@/components/common/TalentCareerModal";
import { cx, opsTheme } from "@/components/ops/theme";
import type {
  OpportunityEmploymentType,
  OpportunityStatus,
  OpportunityWorkMode,
} from "@/lib/ops/opportunity";
import { LoaderCircle, Save } from "lucide-react";
import type { ClipboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import TurndownService from "turndown";
import {
  ActionButton,
  type DraftMode,
  EMPLOYMENT_LABEL,
  type RoleDraft,
  STATUS_LABEL,
  toggleEmploymentType,
  ToggleGrid,
  WORK_MODE_LABEL,
} from "./shared";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { Textarea as UiTextarea } from "@/components/ui/textarea";

function convertHtmlPasteToMarkdown(html: string) {
  const trimmedHtml = html.trim();
  if (!trimmedHtml) return "";

  const turndown = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    headingStyle: "atx",
    hr: "---",
    strongDelimiter: "**",
  });

  turndown.remove(["script", "style"]);

  return turndown
    .turndown(trimmedHtml)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildNextTextareaValue(args: {
  currentValue: string;
  insertedText: string;
  selectionEnd: number;
  selectionStart: number;
}) {
  return [
    args.currentValue.slice(0, args.selectionStart),
    args.insertedText,
    args.currentValue.slice(args.selectionEnd),
  ].join("");
}

function handleMarkdownRichPaste(args: {
  currentValue: string;
  event: ClipboardEvent<HTMLTextAreaElement>;
  onChange: (nextValue: string) => void;
}) {
  const target = args.event.currentTarget;
  const html = args.event.clipboardData.getData("text/html");
  if (!html.trim()) return;

  const markdown = convertHtmlPasteToMarkdown(html);
  if (!markdown) return;

  args.event.preventDefault();

  const selectionStart = target.selectionStart ?? 0;
  const selectionEnd = target.selectionEnd ?? selectionStart;
  const nextValue = buildNextTextareaValue({
    currentValue: args.currentValue,
    insertedText: markdown,
    selectionEnd,
    selectionStart,
  });

  args.onChange(nextValue);

  const caret = selectionStart + markdown.length;
  requestAnimationFrame(() => {
    target.setSelectionRange(caret, caret);
  });
}

function RoleDescriptionMarkdownPreview({ markdown }: { markdown: string }) {
  const trimmedMarkdown = markdown.trim();

  return (
    <div className="space-y-2">
      <div className={opsTheme.eyebrow}>Markdown Preview</div>
      <div
        className={cx(
          opsTheme.panelSoft,
          "overflow-hidden px-4 py-4 text-sm leading-6 text-neutral-primary"
        )}
      >
        {trimmedMarkdown ? (
          <div className="space-y-3">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSanitize]}
              components={{
                h1: ({ children }) => (
                  <h1 className="font-halant text-[1.7rem] leading-none tracking-tighter text-neutral-primary">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="font-halant text-[1.35rem] leading-[1.05] tracking-[-0.04em] text-neutral-primary">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-base font-semibold text-neutral-primary">
                    {children}
                  </h3>
                ),
                hr: () => (
                  <hr className="my-4 border-0 border-t border-neutral-1000-a10" />
                ),
                p: ({ children }) => (
                  <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-muted">
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-neutral-muted">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-neutral-muted">
                    {children}
                  </ol>
                ),
                li: ({ children }) => <li className="pl-1">{children}</li>,
                strong: ({ children }) => (
                  <strong className="font-semibold text-neutral-primary">
                    {children}
                  </strong>
                ),
              }}
            >
              {trimmedMarkdown}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="text-sm text-neutral-muted">
            Description에 markdown을 입력하면 여기서 미리보기로 렌더링됩니다.
          </div>
        )}
      </div>
    </div>
  );
}

export function RoleCreateModal({
  draft,
  mode,
  onChange,
  onClose,
  onSubmit,
  open,
  pending,
  workspaceName,
}: {
  draft: RoleDraft;
  mode: DraftMode;
  onChange: (next: RoleDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
  pending: boolean;
  workspaceName: string | null;
}) {
  if (!open) return null;

  return (
    <TalentCareerModal
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "기회 수정" : "기회 추가"}
      description=""
      overlayClassName="items-start overflow-y-auto px-4 py-10 sm:px-6 sm:py-14 lg:py-16"
      panelClassName="flex max-h-[calc(100svh-4rem)] max-w-[860px] flex-col border border-neutral-1000-a05 bg-bg-default"
      bodyClassName="flex-1 overflow-y-auto bg-bg-default px-5 py-5"
      footerClassName="shrink-0 border-t border-neutral-1000-a05 bg-bg-default"
      footer={
        <div className="flex w-full items-center justify-end gap-3">
          <div className="flex items-center justify-end gap-2">
            <BareButton
              type="button"
              onClick={onClose}
              disabled={pending}
              className={cx(opsTheme.buttonSecondary, "h-10 px-4")}
            >
              취소
            </BareButton>
            <BareButton
              type="button"
              onClick={onSubmit}
              disabled={pending || !draft.name.trim()}
              className={cx(opsTheme.buttonPrimary, "h-10 px-4")}
            >
              {pending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              저장
            </BareButton>
          </div>
        </div>
      }
      closeButtonClassName="right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-default/70 text-neutral-muted transition-colors hover:border-neutral-1000-a10 hover:text-neutral-primary"
    >
      <div className="space-y-4">
        <div className="text-lg text-neutral-primary">
          {workspaceName ?? "선택된 회사 없음"}
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>Role Title</div>
          <UiInput
            unstyled
            value={draft.name}
            onChange={(event) =>
              onChange({
                ...draft,
                name: event.target.value,
              })
            }
            placeholder="role title"
            className={opsTheme.input}
          />
        </div>
        <div className="grid grid-cols-2 w-full items-start justify-between gap-2">
          <div className="space-y-2">
            <div className={opsTheme.eyebrow}>Source Type</div>
            <ToggleGrid>
              <ActionButton
                active={draft.sourceType === "internal"}
                onClick={() =>
                  onChange({
                    ...draft,
                    sourceType: "internal",
                  })
                }
              >
                내부
              </ActionButton>
              <ActionButton
                active={draft.sourceType === "external"}
                onClick={() =>
                  onChange({
                    ...draft,
                    sourceType: "external",
                  })
                }
              >
                외부
              </ActionButton>
            </ToggleGrid>
          </div>
          <div className="space-y-2">
            <div className={opsTheme.eyebrow}>Status</div>
            <ToggleGrid>
              {(Object.keys(STATUS_LABEL) as OpportunityStatus[]).map(
                (status) => (
                  <ActionButton
                    key={status}
                    active={draft.status === status}
                    onClick={() =>
                      onChange({
                        ...draft,
                        status,
                      })
                    }
                  >
                    {STATUS_LABEL[status]}
                  </ActionButton>
                )
              )}
            </ToggleGrid>
          </div>
        </div>
        <div className="grid grid-cols-2 w-full items-start justify-between gap-2">
          <div className="space-y-2">
            <div className={opsTheme.eyebrow}>Employment Type</div>
            <ToggleGrid>
              {(
                Object.keys(EMPLOYMENT_LABEL) as OpportunityEmploymentType[]
              ).map((type) => (
                <ActionButton
                  key={type}
                  active={draft.employmentTypes.includes(type)}
                  onClick={() =>
                    onChange({
                      ...draft,
                      employmentTypes: toggleEmploymentType(
                        draft.employmentTypes,
                        type
                      ),
                    })
                  }
                >
                  {EMPLOYMENT_LABEL[type]}
                </ActionButton>
              ))}
            </ToggleGrid>
          </div>
          <div className="space-y-2">
            <div className={opsTheme.eyebrow}>Work Mode</div>
            <ToggleGrid>
              <ActionButton
                active={draft.workMode === null}
                onClick={() =>
                  onChange({
                    ...draft,
                    workMode: null,
                  })
                }
              >
                미정
              </ActionButton>
              {(Object.keys(WORK_MODE_LABEL) as OpportunityWorkMode[]).map(
                (mode) => (
                  <ActionButton
                    key={mode}
                    active={draft.workMode === mode}
                    onClick={() =>
                      onChange({
                        ...draft,
                        workMode: mode,
                      })
                    }
                  >
                    {WORK_MODE_LABEL[mode]}
                  </ActionButton>
                )
              )}
            </ToggleGrid>
          </div>
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>External JD URL</div>
          <UiInput
            unstyled
            value={draft.externalJdUrl}
            onChange={(event) =>
              onChange({
                ...draft,
                externalJdUrl: event.target.value,
              })
            }
            placeholder="external jd url"
            className={opsTheme.input}
          />
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <div className="space-y-2">
            <div className={opsTheme.eyebrow}>Location</div>
            <UiInput
              unstyled
              value={draft.locationText}
              onChange={(event) =>
                onChange({
                  ...draft,
                  locationText: event.target.value,
                })
              }
              placeholder="location"
              className={opsTheme.input}
            />
          </div>
          <div className="space-y-2">
            <div className={opsTheme.eyebrow}>Posted At</div>
            <UiInput
              unstyled
              value={draft.postedAt}
              onChange={(event) =>
                onChange({
                  ...draft,
                  postedAt: event.target.value,
                })
              }
              placeholder="posted at / YYYY-MM-DD"
              className={opsTheme.input}
            />
          </div>
          <div className="space-y-2">
            <div className={opsTheme.eyebrow}>Expires At</div>
            <UiInput
              unstyled
              value={draft.expiresAt}
              onChange={(event) =>
                onChange({
                  ...draft,
                  expiresAt: event.target.value,
                })
              }
              placeholder="expires at / YYYY-MM-DD"
              className={opsTheme.input}
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>Request</div>
          <UiTextarea
            unstyled
            value={draft.request}
            onChange={(event) =>
              onChange({
                ...draft,
                request: event.target.value,
              })
            }
            placeholder="기회 요청사항"
            rows={6}
            className={cx(opsTheme.textarea, "min-h-[120px]")}
          />
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>Description</div>
          <UiTextarea
            unstyled
            value={draft.description}
            onChange={(event) =>
              onChange({
                ...draft,
                description: event.target.value,
              })
            }
            onPaste={(event) =>
              handleMarkdownRichPaste({
                currentValue: draft.description,
                event,
                onChange: (nextValue) =>
                  onChange({
                    ...draft,
                    description: nextValue,
                  }),
              })
            }
            placeholder="role description"
            className={cx(opsTheme.textarea, "min-h-[220px] px-3 py-3")}
          />
          <div className="text-xs leading-5 text-neutral-muted">
            노션이나 웹 문서에서 붙여 넣으면 가능한 범위에서 markdown으로
            변환합니다.
          </div>
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>Description Summary</div>
          <UiTextarea
            unstyled
            value={draft.descriptionSummary}
            onChange={(event) =>
              onChange({
                ...draft,
                descriptionSummary: event.target.value,
              })
            }
            placeholder="role description summary"
            className={cx(opsTheme.textarea, "min-h-[120px]")}
          />
        </div>
        <RoleDescriptionMarkdownPreview markdown={draft.description} />
      </div>
    </TalentCareerModal>
  );
}
