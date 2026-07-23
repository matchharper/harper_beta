import {
  type ComponentProps,
  type FormEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { LoaderCircle, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type OrgEditDialogValue = {
  companyDescription?: string | null;
  description?: string | null;
  employmentTypes?: string[];
  externalJdUrl?: string | null;
  locationText?: string | null;
  name?: string | null;
  pitch?: string | null;
  request?: string | null;
  status?: string | null;
  workMode?: string | null;
};

const ROLE_STATUS_LABEL: Record<string, string> = {
  active: "진행",
  ended: "종료",
  paused: "중단",
};

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  contract: "계약",
  full_time: "풀타임",
  internship: "인턴",
  part_time: "파트타임",
};

const WORK_MODE_LABEL: Record<string, string> = {
  hybrid: "하이브리드",
  onsite: "대면근무",
  remote: "리모트",
};

const fieldClassName = "flex flex-col gap-2";

function toggleListValue(values: string[] | undefined, value: string) {
  const current = values ?? [];
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

function ToggleButton({
  active,
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
          : "border border-neutral-1000-a10 bg-bg-floating text-neutral-primary hover:bg-bg-weak"
      )}
    >
      {children}
    </BareButton>
  );
}

function ToggleGrid({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function AutoResizeTextarea({
  className,
  maxRows,
  value,
  ...props
}: ComponentProps<typeof Textarea> & { maxRows?: number }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    if (!maxRows) {
      textarea.style.height = `${textarea.scrollHeight}px`;
      return;
    }

    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 24;
    const paddingHeight =
      Number.parseFloat(styles.paddingTop) +
      Number.parseFloat(styles.paddingBottom);
    const borderHeight =
      Number.parseFloat(styles.borderTopWidth) +
      Number.parseFloat(styles.borderBottomWidth);
    const maxHeight = lineHeight * maxRows + paddingHeight + borderHeight;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [maxRows, value]);

  return (
    <Textarea
      ref={ref}
      value={value}
      className={cx("resize-none overflow-hidden pb-4", className)}
      {...props}
    />
  );
}

function normalizeEditValue(value: OrgEditDialogValue) {
  return {
    companyDescription: value.companyDescription ?? "",
    description: value.description ?? "",
    employmentTypes: [...(value.employmentTypes ?? [])].sort(),
    externalJdUrl: value.externalJdUrl ?? "",
    locationText: value.locationText ?? "",
    name: value.name ?? "",
    pitch: value.pitch ?? "",
    request: value.request ?? "",
    status: value.status ?? "",
    workMode: value.workMode ?? "",
  };
}

function RoleDescriptionMarkdownPreview({ markdown }: { markdown: string }) {
  const trimmedMarkdown = markdown.trim();

  return (
    <div className="grid gap-2">
      <div className={opsTheme.label}>Markdown Preview</div>
      <div
        className={cx(
          opsTheme.panelSoft,
          "min-h-[120px] px-4 py-4 text-sm leading-6 text-neutral-primary"
        )}
      >
        {trimmedMarkdown ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSanitize]}
            components={{
              a: ({ children, href }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className={opsTheme.link}
                >
                  {children}
                </a>
              ),
              h1: ({ children }) => (
                <h1 className="mt-5 text-lg font-semibold text-neutral-primary first:mt-0">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="mt-5 text-base font-semibold text-neutral-primary first:mt-0">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mt-4 text-sm font-semibold text-neutral-primary first:mt-0">
                  {children}
                </h3>
              ),
              hr: () => (
                <hr className="my-4 border-0 border-t border-neutral-1000-a10" />
              ),
              li: ({ children }) => <li className="pl-1">{children}</li>,
              ol: ({ children }) => (
                <ol className="mt-3 list-decimal space-y-1 pl-5 first:mt-0">
                  {children}
                </ol>
              ),
              p: ({ children }) => (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-muted first:mt-0">
                  {children}
                </p>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-neutral-primary">
                  {children}
                </strong>
              ),
              ul: ({ children }) => (
                <ul className="mt-3 list-disc space-y-1 pl-5 first:mt-0">
                  {children}
                </ul>
              ),
            }}
          >
            {trimmedMarkdown}
          </ReactMarkdown>
        ) : (
          <div className="text-sm text-neutral-muted">
            Description에 markdown을 입력하면 여기서 미리보기로 렌더링됩니다.
          </div>
        )}
      </div>
    </div>
  );
}

export function OrgEditDialog({
  mode,
  onClose,
  onSubmit,
  open,
  pending,
  value,
}: {
  mode: "workspace" | "role";
  onClose: () => void;
  onSubmit: (value: OrgEditDialogValue) => void;
  open: boolean;
  pending?: boolean;
  value: OrgEditDialogValue;
}) {
  const [draft, setDraft] = useState<OrgEditDialogValue>(value);
  const hasChanges =
    JSON.stringify(normalizeEditValue(draft)) !==
    JSON.stringify(normalizeEditValue(value));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasChanges) return;
    onSubmit(draft);
  };

  if (!open) return null;

  const title = mode === "workspace" ? "회사 수정" : "Role 수정";

  return (
    <div className="fixed inset-0 z-[75]">
      <BareButton
        type="button"
        aria-label="닫기"
        onClick={onClose}
        disabled={pending}
        className="absolute inset-0 h-full w-full cursor-default bg-black/35 disabled:cursor-not-allowed"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute bottom-0 right-0 top-0 flex w-full min-w-0 flex-col overflow-hidden bg-bg-default shadow-[0_24px_90px_color-mix(in_srgb,var(--color-neutral-1000)_22%,transparent)] animate-in slide-in-from-right-6 duration-200 sm:w-[784px]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-1000-a05 bg-bg-default px-5 py-3">
          <div className="text-sm font-medium text-neutral-primary">
            {title}
          </div>
          <BareButton
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </BareButton>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="grid min-h-0 flex-1 auto-rows-max content-start gap-6 overflow-y-auto px-5 py-5">
            {mode === "workspace" ? (
              <>
                <label className={fieldClassName}>
                  <span className={opsTheme.label}>Pitch</span>
                  <span className="text-xs leading-4 text-neutral-muted">
                    연결할 인재에게 어필될 수 있는 회사의 장점들을 최대한 자세히
                    적어주세요. Harper가 잘 다듬어 적절한 순간에 전달하고 더 잘
                    연결될 수 있게 돕습니다. 투자, 매출, 구성원 등의 내용을
                    포함할 수 있습니다.
                  </span>
                  <AutoResizeTextarea
                    value={draft.pitch ?? ""}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        pitch: event.target.value,
                      }))
                    }
                    rows={4}
                  />
                </label>
                <label className={fieldClassName}>
                  <span className={opsTheme.label}>설명</span>
                  <span className="text-xs leading-4 text-neutral-muted">
                    회사에 대한 객관적인 설명을 짧게 3~5문장 정도로 적어주세요.
                  </span>
                  <AutoResizeTextarea
                    value={draft.companyDescription ?? ""}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        companyDescription: event.target.value,
                      }))
                    }
                    rows={5}
                  />
                </label>
              </>
            ) : (
              <>
                <div className="rounded-md bg-primary-faded/30 p-4">
                  <label className={fieldClassName}>
                    <span className="text-sm font-medium text-primary">
                      Role Request & Criteria
                    </span>
                    <span className="text-[13px] font-normal leading-5 text-black/60">
                      이 내용은 매번 인재를 탐색하고 연결하거나 후보자를 추천할
                      때 기준으로 반영됩니다. 여러가지 사항이 있다면 무엇이 더
                      우선순위가 높은지 등을 자세히 알려주실 수록 좋습니다.
                    </span>
                    <AutoResizeTextarea
                      value={draft.request ?? ""}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          request: event.target.value,
                        }))
                      }
                      className="mt-1 border-primary/50 text-black focus:border-primary focus:ring-primary/15"
                      maxRows={20}
                      rows={5}
                    />
                  </label>
                </div>
                <div className="flex items-center gap-3 py-8">
                  <div className="h-px flex-1 bg-neutral-1000-a10" />
                  <span className="shrink-0 text-[11px] font-light text-neutral-muted">
                    기본 역할 정보
                  </span>
                  <div className="h-px flex-1 bg-neutral-1000-a10" />
                </div>
                <label className={fieldClassName}>
                  <span className={opsTheme.label}>Role title</span>
                  <Input
                    value={draft.name ?? ""}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <div className="grid gap-2">
                  <div className={opsTheme.label}>Status</div>
                  <ToggleGrid>
                    {Object.entries(ROLE_STATUS_LABEL).map(
                      ([status, label]) => (
                        <ToggleButton
                          key={status}
                          active={(draft.status ?? "active") === status}
                          onClick={() =>
                            setDraft((prev) => ({ ...prev, status }))
                          }
                        >
                          {label}
                        </ToggleButton>
                      )
                    )}
                  </ToggleGrid>
                </div>
                <div className="grid gap-2">
                  <div className={opsTheme.label}>고용 형태</div>
                  <ToggleGrid>
                    {Object.entries(EMPLOYMENT_TYPE_LABEL).map(
                      ([type, label]) => (
                        <ToggleButton
                          key={type}
                          active={(draft.employmentTypes ?? []).includes(type)}
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              employmentTypes: toggleListValue(
                                prev.employmentTypes,
                                type
                              ),
                            }))
                          }
                        >
                          {label}
                        </ToggleButton>
                      )
                    )}
                  </ToggleGrid>
                </div>
                <div className="grid gap-2">
                  <div className={opsTheme.label}>근무 방식</div>
                  <ToggleGrid>
                    {Object.entries(WORK_MODE_LABEL).map(
                      ([workMode, label]) => (
                        <ToggleButton
                          key={workMode}
                          active={draft.workMode === workMode}
                          onClick={() =>
                            setDraft((prev) => ({ ...prev, workMode }))
                          }
                        >
                          {label}
                        </ToggleButton>
                      )
                    )}
                  </ToggleGrid>
                </div>
                <label className={fieldClassName}>
                  <span className={opsTheme.label}>외부 JD 링크</span>
                  <Input
                    value={draft.externalJdUrl ?? ""}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        externalJdUrl: event.target.value,
                      }))
                    }
                    placeholder="Optional"
                  />
                </label>
                <label className={fieldClassName}>
                  <span className={opsTheme.label}>근무 지역</span>
                  <Input
                    value={draft.locationText ?? ""}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        locationText: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className={cn(fieldClassName, "mt-2")}>
                  <span className={opsTheme.label}>Description</span>
                  <span className="text-sm text-black/60 mb-1">
                    후보자에게 전달되는 역할 설명입니다. 아래에서 미리보기로
                    실제로 어떻게 보여지는지 확인할 수 있습니다.
                  </span>
                  <AutoResizeTextarea
                    value={draft.description ?? ""}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                    rows={7}
                  />
                </label>
                <RoleDescriptionMarkdownPreview
                  markdown={draft.description ?? ""}
                />
              </>
            )}
          </div>
          {hasChanges ? (
            <div className="flex shrink-0 justify-start gap-2 border-t border-neutral-1000-a05 bg-bg-default px-5 py-4">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={onClose}
                disabled={pending}
              >
                취소
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={pending}
              >
                {pending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : null}
                저장
              </Button>
            </div>
          ) : null}
        </form>
      </aside>
    </div>
  );
}
