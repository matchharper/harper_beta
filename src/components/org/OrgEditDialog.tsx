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
  top_priority: "최우선",
};

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  contract: "계약",
  full_time: "풀타임",
  internship: "인턴",
  part_time: "파트타임",
};

const WORK_MODE_LABEL: Record<string, string> = {
  hybrid: "하이브리드",
  onsite: "상주",
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
  value,
  ...props
}: ComponentProps<typeof Textarea>) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <Textarea
      ref={ref}
      value={value}
      className={cx("resize-none overflow-hidden", className)}
      {...props}
    />
  );
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
          <div className="grid min-h-0 flex-1 auto-rows-max content-start gap-4 overflow-y-auto px-5 py-5">
            {mode === "workspace" ? (
              <>
                <label className={fieldClassName}>
                  <span className={opsTheme.label}>Pitch</span>
                  <Textarea
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
                  <Textarea
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
                  <div className={opsTheme.label}>Employment Type</div>
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
                  <div className={opsTheme.label}>Work Mode</div>
                  <ToggleGrid>
                    <ToggleButton
                      active={!draft.workMode}
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, workMode: null }))
                      }
                    >
                      미정
                    </ToggleButton>
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
                  <span className={opsTheme.label}>External JD Link</span>
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
                  <span className={opsTheme.label}>Location</span>
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
                <label className={fieldClassName}>
                  <span className={opsTheme.label}>Request</span>
                  <Textarea
                    value={draft.request ?? ""}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        request: event.target.value,
                      }))
                    }
                    rows={4}
                  />
                </label>
                <label className={fieldClassName}>
                  <span className={opsTheme.label}>Description</span>
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
            {mode === "workspace" ? (
              <label className={fieldClassName}>
                <span className={opsTheme.label}>Request</span>
                <Textarea
                  value={draft.request ?? ""}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      request: event.target.value,
                    }))
                  }
                  rows={4}
                />
              </label>
            ) : null}
          </div>
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
        </form>
      </aside>
    </div>
  );
}
