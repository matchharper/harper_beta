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
import { opsTheme } from "@/components/ops/theme";
import { BareButton, MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type OrgEditDialogValue = {
  companyDescription?: string | null;
  companyName?: string | null;
  description?: string | null;
  employeeCountEnd?: number | null;
  employeeCountStart?: number | null;
  employmentTypes?: string[];
  externalJdUrl?: string | null;
  foundedYear?: number | null;
  homepageUrl?: string | null;
  lastFundingRoundDescription?: string | null;
  lastFundingStage?: string | null;
  linkedinUrl?: string | null;
  locationText?: string | null;
  logoUrl?: string | null;
  mainInvestors?: string | null;
  name?: string | null;
  pitch?: string | null;
  request?: string | null;
  shortDescription?: string | null;
  totalFundingRaised?: string | null;
  workMode?: string | null;
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

const EMPTY_EMPLOYEE_COUNT_RANGE = "empty";

const EMPLOYEE_COUNT_RANGE_OPTIONS = [
  { end: 10, label: "1–10명", start: 1, value: "1-10" },
  { end: 50, label: "11–50명", start: 11, value: "11-50" },
  { end: 200, label: "51–200명", start: 51, value: "51-200" },
  { end: 500, label: "201–500명", start: 201, value: "201-500" },
  { end: 1_000, label: "501–1,000명", start: 501, value: "501-1000" },
  {
    end: 5_000,
    label: "1,001–5,000명",
    start: 1_001,
    value: "1001-5000",
  },
  {
    end: 10_000,
    label: "5,001–10,000명",
    start: 5_001,
    value: "5001-10000",
  },
  { end: null, label: "10,001명 이상", start: 10_001, value: "10001+" },
] as const;

const fieldClassName = "flex flex-col gap-2";

function getEmployeeCountRangeValue(start: number | null, end: number | null) {
  if (start === null && end === null) return EMPTY_EMPLOYEE_COUNT_RANGE;
  return (
    EMPLOYEE_COUNT_RANGE_OPTIONS.find(
      (option) => option.start === start && option.end === end
    )?.value ?? null
  );
}

function getEmployeeCountRangePlaceholder(
  start: number | null,
  end: number | null
) {
  const format = (value: number) =>
    new Intl.NumberFormat("ko-KR").format(value);
  if (start !== null && end !== null) {
    return `현재 ${format(start)}–${format(end)}명 · 새 범위를 선택해 주세요`;
  }
  if (start !== null) {
    return `현재 ${format(start)}명 이상 · 새 범위를 선택해 주세요`;
  }
  if (end !== null) {
    return `현재 ${format(end)}명 이하 · 새 범위를 선택해 주세요`;
  }
  return "직원 수 범위를 선택해 주세요";
}

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
      className={cn(
        "rounded-md px-3 py-2 text-[13px] transition",
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
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

function WorkspaceEditSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="border-b border-neutral-1000-a05 pb-6 last:border-b-0">
      <div className="mb-4">
        <h3 className="text-[15px] font-medium text-neutral-primary">
          {title}
        </h3>
        {description ? (
          <p className="mt-1 text-[12px] font-light leading-5 text-neutral-muted">
            {description}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
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
      className={cn(
        "resize-none overflow-hidden px-3 py-2.5 pb-3.5 text-[13px] leading-5",
        className
      )}
      {...props}
    />
  );
}

function normalizeEditValue(value: OrgEditDialogValue) {
  return {
    companyDescription: value.companyDescription ?? "",
    companyName: value.companyName ?? "",
    description: value.description ?? "",
    employeeCountEnd: value.employeeCountEnd ?? null,
    employeeCountStart: value.employeeCountStart ?? null,
    employmentTypes: [...(value.employmentTypes ?? [])].sort(),
    externalJdUrl: value.externalJdUrl ?? "",
    foundedYear: value.foundedYear ?? null,
    homepageUrl: value.homepageUrl ?? "",
    lastFundingRoundDescription: value.lastFundingRoundDescription ?? "",
    lastFundingStage: value.lastFundingStage ?? "",
    linkedinUrl: value.linkedinUrl ?? "",
    locationText: value.locationText ?? "",
    logoUrl: value.logoUrl ?? "",
    mainInvestors: value.mainInvestors ?? "",
    name: value.name ?? "",
    pitch: value.pitch ?? "",
    request: value.request ?? "",
    shortDescription: value.shortDescription ?? "",
    totalFundingRaised: value.totalFundingRaised ?? "",
    workMode: value.workMode ?? "",
  };
}

function RoleDescriptionMarkdownPreview({ markdown }: { markdown: string }) {
  const trimmedMarkdown = markdown.trim();

  return (
    <div className="grid gap-2">
      <div className={opsTheme.label}>Markdown Preview</div>
      <div
        className={cn(
          opsTheme.panelSoft,
          "min-h-[112px] px-4 py-3.5 text-[13px] leading-6 text-neutral-primary"
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
                <h1 className="mt-4 text-[16px] font-medium text-neutral-primary first:mt-0">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="mt-4 text-[15px] font-medium text-neutral-primary first:mt-0">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mt-3 text-[13px] font-medium text-neutral-primary first:mt-0">
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
                <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-neutral-muted first:mt-0">
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
          <div className="text-[13px] text-neutral-muted">
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
  const valueKey = JSON.stringify(normalizeEditValue(value));

  const hasChanges = JSON.stringify(normalizeEditValue(draft)) !== valueKey;

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
        className="absolute bottom-0 right-0 top-0 flex w-full min-w-0 flex-col overflow-hidden bg-bg-default shadow-[0_24px_90px_color-mix(in_srgb,var(--color-neutral-1000)_22%,transparent)] animate-in slide-in-from-right-6 duration-200 sm:w-[820px]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-1000-a05 bg-bg-default px-5 py-3">
          <div className="text-[15px] font-medium text-neutral-primary">
            {title}
          </div>
          <MuteButton
            type="button"
            onClick={onClose}
            disabled={pending}
            size="md"
            variant="transparent"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </MuteButton>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="grid min-h-0 flex-1 auto-rows-max content-start gap-6 overflow-y-auto px-5 py-5">
            {mode === "workspace" ? (
              <>
                <WorkspaceEditSection
                  description="회사 상세 상단에 표시되는 이름, 로고와 한 줄 소개입니다."
                  title="브랜드"
                >
                  <label className={fieldClassName}>
                    <span className={opsTheme.label}>회사명</span>
                    <Input
                      required
                      value={draft.companyName ?? ""}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          companyName: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className={fieldClassName}>
                    <span className={opsTheme.label}>로고 URL</span>
                    <Input
                      type="url"
                      placeholder="https://"
                      value={draft.logoUrl ?? ""}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          logoUrl: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className={cn(fieldClassName, "sm:col-span-2")}>
                    <span className={opsTheme.label}>한 줄 소개</span>
                    <Input
                      value={draft.shortDescription ?? ""}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          shortDescription: event.target.value,
                        }))
                      }
                    />
                  </label>
                </WorkspaceEditSection>

                <WorkspaceEditSection
                  description="Harper가 회사를 소개하고 후보자에게 강점을 전달할 때 사용합니다."
                  title="회사 소개"
                >
                  <label className={cn(fieldClassName, "sm:col-span-2")}>
                    <span className={opsTheme.label}>회사 Pitch</span>
                    <span className="text-xs leading-4 text-neutral-muted">
                      투자, 매출, 팀과 제품처럼 후보자에게 어필할 장점을 적어
                      주세요.
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
                  <label className={cn(fieldClassName, "sm:col-span-2")}>
                    <span className={opsTheme.label}>회사 설명</span>
                    <span className="text-xs leading-4 text-neutral-muted">
                      회사에 대한 객관적인 설명을 3~5문장 정도로 적어주세요.
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
                </WorkspaceEditSection>

                <WorkspaceEditSection title="기본 정보">
                  <label className={fieldClassName}>
                    <span className={opsTheme.label}>본사 위치</span>
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
                    <span className={opsTheme.label}>설립 연도</span>
                    <Input
                      inputMode="numeric"
                      min={1000}
                      max={new Date().getFullYear() + 1}
                      type="number"
                      value={draft.foundedYear ?? ""}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          foundedYear: event.target.value
                            ? Number(event.target.value)
                            : null,
                        }))
                      }
                    />
                  </label>
                  <label className={fieldClassName}>
                    <span className={opsTheme.label}>직원 수</span>
                    <Select
                      value={getEmployeeCountRangeValue(
                        draft.employeeCountStart ?? null,
                        draft.employeeCountEnd ?? null
                      )}
                      onValueChange={(value) => {
                        if (!value) return;
                        if (value === EMPTY_EMPLOYEE_COUNT_RANGE) {
                          setDraft((prev) => ({
                            ...prev,
                            employeeCountEnd: null,
                            employeeCountStart: null,
                          }));
                          return;
                        }
                        const selectedRange = EMPLOYEE_COUNT_RANGE_OPTIONS.find(
                          (option) => option.value === value
                        );
                        if (!selectedRange) return;
                        setDraft((prev) => ({
                          ...prev,
                          employeeCountEnd: selectedRange.end,
                          employeeCountStart: selectedRange.start,
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={getEmployeeCountRangePlaceholder(
                            draft.employeeCountStart ?? null,
                            draft.employeeCountEnd ?? null
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent align="start">
                        <SelectItem value={EMPTY_EMPLOYEE_COUNT_RANGE}>
                          정보 없음
                        </SelectItem>
                        {EMPLOYEE_COUNT_RANGE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs leading-4 text-neutral-muted">
                      LinkedIn 회사 규모 기준으로 표시됩니다.
                    </span>
                  </label>
                </WorkspaceEditSection>

                <WorkspaceEditSection title="링크">
                  {(
                    [
                      ["홈페이지", "homepageUrl"],
                      ["LinkedIn", "linkedinUrl"],
                    ] as const
                  ).map(([label, field]) => (
                    <label className={fieldClassName} key={field}>
                      <span className={opsTheme.label}>{label}</span>
                      <Input
                        type="url"
                        placeholder="https://"
                        value={draft[field] ?? ""}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            [field]: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ))}
                </WorkspaceEditSection>

                <WorkspaceEditSection
                  description="Talent의 회사 상세에 표시되는 투자 관련 정보입니다."
                  title="투자 정보"
                >
                  <label className={fieldClassName}>
                    <span className={opsTheme.label}>최근 투자 단계</span>
                    <Input
                      value={draft.lastFundingStage ?? ""}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          lastFundingStage: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className={fieldClassName}>
                    <span className={opsTheme.label}>총 투자</span>
                    <Input
                      value={draft.totalFundingRaised ?? ""}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          totalFundingRaised: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className={cn(fieldClassName, "sm:col-span-2")}>
                    <span className={opsTheme.label}>주요 투자자</span>
                    <Input
                      value={draft.mainInvestors ?? ""}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          mainInvestors: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className={cn(fieldClassName, "sm:col-span-2")}>
                    <span className={opsTheme.label}>최근 투자 라운드</span>
                    <AutoResizeTextarea
                      rows={3}
                      value={draft.lastFundingRoundDescription ?? ""}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          lastFundingRoundDescription: event.target.value,
                        }))
                      }
                    />
                  </label>
                </WorkspaceEditSection>
              </>
            ) : (
              <>
                <div className="rounded-md bg-primary-faded/30 p-4">
                  <label className={fieldClassName}>
                    <span className="text-[14px] font-medium text-primary">
                      Role Request & Criteria
                    </span>
                    <span className="text-[13px] font-normal leading-6 text-black/60">
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
                <div className="flex items-center gap-3 py-6">
                  <div className="h-px flex-1 bg-neutral-1000-a10" />
                  <span className="shrink-0 text-[12px] font-light text-neutral-muted">
                    기본 역할 정보
                  </span>
                  <div className="h-px flex-1 bg-neutral-1000-a10" />
                </div>
                <label className={fieldClassName}>
                  <span className={opsTheme.label}>Role title</span>
                  <Input
                    className="h-10 px-3 py-2 text-[13px]"
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
                    className="h-10 px-3 py-2 text-[13px]"
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
                    className="h-10 px-3 py-2 text-[13px]"
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
                  <span className="mb-1 text-[13px] text-black/60">
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
              <MuteButton
                type="button"
                size="md"
                onClick={onClose}
                disabled={pending}
              >
                취소
              </MuteButton>
              <MuteButton
                type="submit"
                variant="primary"
                size="md"
                disabled={pending}
              >
                {pending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : null}
                저장
              </MuteButton>
            </div>
          ) : null}
        </form>
      </aside>
    </div>
  );
}
