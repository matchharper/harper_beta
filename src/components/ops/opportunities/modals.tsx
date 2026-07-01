import TalentCareerModal from "@/components/common/TalentCareerModal";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  DEFAULT_OPS_TALENT_RECOMMENDATION_PROMPT,
  OPS_TALENT_RECOMMENDATION_PROMPT_PLACEHOLDERS,
} from "@/lib/ops/opportunityRecommendationPrompt";
import type {
  OpsOpportunityCandidateRecord,
  OpportunityEmploymentType,
  OpportunityStatus,
  OpportunityWorkMode,
} from "@/lib/ops/opportunity";
import { LoaderCircle, Mail, Save, Trash2 } from "lucide-react";
import type { ClipboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import TurndownService from "turndown";
import {
  ActionButton,
  type CandidateMailDraft,
  type DraftMode,
  EMPLOYMENT_LABEL,
  type RoleDraft,
  STATUS_LABEL,
  toggleEmploymentType,
  ToggleGrid,
  WORK_MODE_LABEL,
  type WorkspaceDraft,
} from "./shared";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { Checkbox as UiCheckbox } from "@/components/ui/checkbox";

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

export function CandidateMailModal({
  draft,
  onChange,
  onClose,
  onSubmit,
  pending,
  talent,
}: {
  draft: CandidateMailDraft;
  onChange: (next: CandidateMailDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  pending: boolean;
  talent: OpsOpportunityCandidateRecord | null;
}) {
  if (!talent) return null;

  return (
    <TalentCareerModal
      open={Boolean(talent)}
      onClose={onClose}
      title="후보자에게 메일 보내기"
      description=""
      panelClassName="max-w-[720px] border border-neutral-1000-a05 bg-bg-default"
      bodyClassName="bg-bg-default px-5 py-5"
      footer={
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
            disabled={
              pending ||
              !draft.fromEmail.trim() ||
              !draft.subject.trim() ||
              !draft.content.trim()
            }
            className={cx(opsTheme.buttonPrimary, "h-10 px-4")}
          >
            {pending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            보내기
          </BareButton>
        </div>
      }
      closeButtonClassName="right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-default/70 text-neutral-muted transition-colors hover:border-neutral-1000-a10 hover:text-neutral-primary"
    >
      <div className="space-y-4">
        <div className={cx(opsTheme.panelSoft, "space-y-2 px-4 py-4")}>
          <div className="text-[11px] text-neutral-soft">받는 사람</div>
          <div className="text-sm text-neutral-primary">
            {talent.name ?? "Unnamed talent"}
          </div>
          <div className="text-xs text-neutral-muted">
            {talent.email ?? "등록된 이메일 없음"}
          </div>
        </div>

        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>보내는 사람</div>
          <UiInput
            unstyled
            value={draft.fromEmail}
            onChange={(event) =>
              onChange({
                ...draft,
                fromEmail: event.target.value,
              })
            }
            className={opsTheme.input}
            placeholder="sender@matchharper.com"
          />
        </div>

        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>제목</div>
          <UiInput
            unstyled
            value={draft.subject}
            onChange={(event) =>
              onChange({
                ...draft,
                subject: event.target.value,
              })
            }
            className={opsTheme.input}
            placeholder="메일 제목"
          />
        </div>

        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>내용</div>
          <UiTextarea
            unstyled
            value={draft.content}
            onChange={(event) =>
              onChange({
                ...draft,
                content: event.target.value,
              })
            }
            className={cx(opsTheme.textarea, "min-h-[220px]")}
            placeholder="보낼 내용을 입력하세요."
          />
        </div>
      </div>
    </TalentCareerModal>
  );
}

export function RecommendationPromptModal({
  onChange,
  onClose,
  onReset,
  onSave,
  open,
  value,
}: {
  onChange: (value: string) => void;
  onClose: () => void;
  onReset: () => void;
  onSave: () => void;
  open: boolean;
  value: string;
}) {
  if (!open) return null;

  return (
    <TalentCareerModal
      open={open}
      onClose={onClose}
      title="추천 문구 프롬프트 수정"
      description=""
      panelClassName="max-w-[880px] border border-neutral-1000-a05 bg-bg-default"
      bodyClassName="bg-bg-default px-5 py-5"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <BareButton
            type="button"
            onClick={onReset}
            className={cx(opsTheme.buttonSecondary, "h-10 px-4")}
          >
            기본값 복원
          </BareButton>
          <div className="flex flex-wrap items-center gap-2">
            <BareButton
              type="button"
              onClick={onClose}
              className={cx(opsTheme.buttonSecondary, "h-10 px-4")}
            >
              취소
            </BareButton>
            <BareButton
              type="button"
              onClick={onSave}
              disabled={!value.trim()}
              className={cx(opsTheme.buttonPrimary, "h-10 px-4")}
            >
              저장
            </BareButton>
          </div>
        </div>
      }
      closeButtonClassName="right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-default/70 text-neutral-muted transition-colors hover:border-neutral-1000-a10 hover:text-neutral-primary"
    >
      <div className="space-y-4">
        <div className={cx(opsTheme.panelSoft, "space-y-2 px-4 py-4")}>
          <div className="text-sm text-neutral-muted">
            프롬프트는 브라우저 로컬 스토리지에 저장됩니다.
          </div>
          <div className="text-xs leading-5 text-neutral-muted">
            아래 placeholder를 유지하면 선택된 후보자/role 정보가 자동으로
            들어갑니다.
          </div>
        </div>

        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>프롬프트</div>
          <UiTextarea
            unstyled
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={cx(opsTheme.textarea, "min-h-[320px]")}
            placeholder={DEFAULT_OPS_TALENT_RECOMMENDATION_PROMPT}
          />
        </div>

        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>사용 가능한 placeholder</div>
          <div className="grid gap-2 md:grid-cols-2">
            {OPS_TALENT_RECOMMENDATION_PROMPT_PLACEHOLDERS.map((item) => (
              <div
                key={item.key}
                className={cx(opsTheme.panelSoft, "space-y-1 px-3 py-3")}
              >
                <div className="text-xs font-medium text-neutral-primary">
                  {item.key}
                </div>
                <div className="text-xs leading-5 text-neutral-muted">
                  {item.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </TalentCareerModal>
  );
}

export function WorkspaceCreateModal({
  draft,
  extractPending,
  mode,
  onChange,
  onClose,
  onExtract,
  onSubmit,
  open,
  pending,
}: {
  draft: WorkspaceDraft;
  extractPending: boolean;
  mode: DraftMode;
  onChange: (next: WorkspaceDraft) => void;
  onClose: () => void;
  onExtract: () => void;
  onSubmit: () => void;
  open: boolean;
  pending: boolean;
}) {
  if (!open) return null;

  return (
    <TalentCareerModal
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "회사 수정" : "회사 추가"}
      description=""
      overlayClassName="items-start overflow-y-auto px-4 py-10 sm:px-6 sm:py-14 lg:py-16"
      panelClassName="max-w-[720px] border border-neutral-1000-a05 bg-bg-default"
      bodyClassName="bg-bg-default px-5 py-5"
      footer={
        <div className="flex items-center justify-end gap-2">
          <BareButton
            type="button"
            onClick={onClose}
            disabled={pending || extractPending}
            className={cx(opsTheme.buttonSecondary, "h-10 px-4")}
          >
            취소
          </BareButton>
          <BareButton
            type="button"
            onClick={onSubmit}
            disabled={pending || extractPending || !draft.companyName.trim()}
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
      }
      closeButtonClassName="right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-default/70 text-neutral-muted transition-colors hover:border-neutral-1000-a10 hover:text-neutral-primary"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>회사명</div>
          <UiInput
            unstyled
            value={draft.companyName}
            onChange={(event) =>
              onChange({
                ...draft,
                companyName: event.target.value,
              })
            }
            placeholder="회사명"
            className={opsTheme.input}
          />
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>홈페이지</div>
          <UiInput
            unstyled
            value={draft.homepageUrl}
            onChange={(event) =>
              onChange({
                ...draft,
                homepageUrl: event.target.value,
              })
            }
            placeholder="homepage"
            className={opsTheme.input}
          />
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>LinkedIn</div>
          <div className="flex gap-2">
            <UiInput
              unstyled
              value={draft.linkedinUrl}
              onChange={(event) =>
                onChange({
                  ...draft,
                  linkedinUrl: event.target.value,
                })
              }
              placeholder="linkedin company url"
              className={cx(opsTheme.input, "flex-1")}
            />
            <BareButton
              type="button"
              onClick={onExtract}
              disabled={extractPending || !draft.linkedinUrl.trim()}
              className={cx(opsTheme.buttonSecondary, "h-10 shrink-0 px-4")}
            >
              {extractPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : null}
              추출하기
            </BareButton>
          </div>
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>Career</div>
          <UiInput
            unstyled
            value={draft.careerUrl}
            onChange={(event) =>
              onChange({
                ...draft,
                careerUrl: event.target.value,
              })
            }
            placeholder="career url"
            className={opsTheme.input}
          />
        </div>
        <label className="flex items-center gap-3 rounded-md border border-neutral-1000-a05 bg-bg-default/70 px-3 py-3 text-sm text-neutral-primary">
          <UiCheckbox
            unstyled
            checked={draft.isInternal}
            onChange={(event) =>
              onChange({
                ...draft,
                isInternal: event.target.checked,
              })
            }
            className="h-4 w-4 rounded border-neutral-1000-a10 accent-black"
          />
          <span>is_internal</span>
        </label>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>소개</div>
          <UiTextarea
            unstyled
            value={draft.companyDescription}
            onChange={(event) =>
              onChange({
                ...draft,
                companyDescription: event.target.value,
              })
            }
            placeholder="간단한 소개"
            className={cx(opsTheme.textarea, "min-h-[140px] px-3 py-3")}
          />
        </div>
        <div className="space-y-2">
          <div className={opsTheme.eyebrow}>Pitch</div>
          <UiTextarea
            unstyled
            value={draft.pitch}
            onChange={(event) =>
              onChange({
                ...draft,
                pitch: event.target.value,
              })
            }
            placeholder="회사/기회 pitch"
            className={cx(opsTheme.textarea, "min-h-[120px] px-3 py-3")}
          />
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
            placeholder="회사 요청사항"
            className={cx(opsTheme.textarea, "min-h-[120px] px-3 py-3")}
          />
        </div>
      </div>
    </TalentCareerModal>
  );
}

export function RoleCreateModal({
  deletePending = false,
  draft,
  mode,
  onChange,
  onClose,
  onDelete,
  onSubmit,
  open,
  pending,
  workspaceName,
}: {
  deletePending?: boolean;
  draft: RoleDraft;
  mode: DraftMode;
  onChange: (next: RoleDraft) => void;
  onClose: () => void;
  onDelete?: () => void;
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
        <div className="flex w-full items-center justify-between gap-3">
          <div>
            {mode === "edit" && onDelete ? (
              <BareButton
                type="button"
                onClick={onDelete}
                disabled={pending || deletePending}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-critical/30 bg-critical-faded px-4 text-sm font-medium text-critical transition hover:bg-critical-faded/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletePending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                완전 삭제
              </BareButton>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2">
            <BareButton
              type="button"
              onClick={onClose}
              disabled={pending || deletePending}
              className={cx(opsTheme.buttonSecondary, "h-10 px-4")}
            >
              취소
            </BareButton>
            <BareButton
              type="button"
              onClick={onSubmit}
              disabled={pending || deletePending || !draft.name.trim()}
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
