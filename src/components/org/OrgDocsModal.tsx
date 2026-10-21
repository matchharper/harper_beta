import { useOrgSourceT, useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { MoreHorizontal, Pencil, Plus } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { MuteButton } from "@/components/ui/button";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { cn } from "@/lib/utils";
import { CANDIDATE_DECISION_LABELS } from "@/lib/org/candidateDecision";

const DOCS_SECTIONS = [
  { id: "review", label: "후보자 검토" },
  { id: "decision", label: "연결 결정" },
  { id: "feedback", label: "메모" },
  { id: "pipeline", label: "파이프라인" },
  { id: "settings", label: "회사와 Role" },
] as const;

type DocsSectionId = (typeof DOCS_SECTIONS)[number]["id"];

function DocsSection({
  children,
  description,
  id,
  title,
}: {
  children?: ReactNode;
  description: string;
  id: DocsSectionId;
  title: string;
}) {
  return (
    <section
      data-docs-section={id}
      className="border-b border-neutral-1000-a05 py-5 last:border-b-0"
    >
      <h2 className="text-[14px] font-medium leading-5 text-neutral-primary">
        {title}
      </h2>
      <p className="mt-1.5 text-[12px] font-normal leading-5 text-neutral-muted">
        {description}
      </p>
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

export function OrgDocsModal({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { c } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<DocsSectionId>("review");

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      setActiveSection("review");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const updateActiveSection = () => {
    const container = scrollRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom <= 4) {
      setActiveSection("settings");
      return;
    }

    const containerTop = container.getBoundingClientRect().top;
    let nextSection: DocsSectionId = "review";
    for (const section of DOCS_SECTIONS) {
      const element = container.querySelector<HTMLElement>(
        `[data-docs-section="${section.id}"]`
      );
      if (element && element.getBoundingClientRect().top - containerTop <= 40) {
        nextSection = section.id;
      }
    }
    setActiveSection(nextSection);
  };

  const scrollToSection = (sectionId: DocsSectionId) => {
    const container = scrollRef.current;
    const target = container?.querySelector<HTMLElement>(
      `[data-docs-section="${sectionId}"]`
    );
    if (!container || !target) return;
    container.scrollTo({
      top:
        container.scrollTop +
        target.getBoundingClientRect().top -
        container.getBoundingClientRect().top -
        8,
    });
    setActiveSection(sectionId);
  };

  return (
    <TalentCareerModal
      open={open}
      onClose={() => onOpenChange(false)}
      mobileBottomSheet
      title={c("Harper Docs", "Harper Docs")}
      description={c(
        "후보자를 검토하고 관리하는 방법입니다.",
        "How to review and manage candidates."
      )}
      panelClassName="h-[min(680px,calc(100svh-48px))]"
      headerClassName="border-b border-neutral-1000-a05"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <nav
        aria-label={c("Docs 목차", "Docs table of contents")}
        className="flex shrink-0 gap-4 overflow-x-auto border-b border-neutral-1000-a05 px-4 sm:px-5 scrollbar-none"
      >
        {DOCS_SECTIONS.map((section) => {
          const selected = section.id === activeSection;
          return (
            <button
              key={section.id}
              type="button"
              aria-current={selected ? "location" : undefined}
              onClick={() => scrollToSection(section.id)}
              className={cn(
                "h-9 shrink-0 border-b text-[11px] font-normal outline-none",
                selected
                  ? "border-neutral-1000 font-medium text-neutral-primary"
                  : "border-transparent text-neutral-muted hover:text-neutral-primary"
              )}
            >
              {sourceT(section.label)}
            </button>
          );
        })}
      </nav>

      <div
        ref={scrollRef}
        onScroll={updateActiveSection}
        className="min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10"
      >
        <div className="mx-auto max-w-[620px]">
          <DocsSection
            id="review"
            title={c("후보자 검토", "Candidate review")}
            description={c(
              "Role 탭에서 후보자 카드를 누르세요. 상세 화면에서 추천 이유, 경력, 이력서와 링크, 이전 피드를 확인할 수 있습니다.",
              "Open a candidate card in the Role tab to review Harper's notes, experience, resume, links, and activity history."
            )}
          >
            <ol className="space-y-1.5 text-[12px] font-normal leading-5 text-neutral-muted">
              <li>
                <span className="mr-2 font-medium text-neutral-primary">
                  {c("1.", "1.")}
                </span>
                {c(
                  "추천 이유와 경력을 확인합니다.",
                  "View recommendation reason and experience."
                )}
              </li>
              <li>
                <span className="mr-2 font-medium text-neutral-primary">
                  {c("2.", "2.")}
                </span>
                {c(
                  "이력서와 등록 링크를 확인합니다.",
                  "View resume and application links."
                )}
              </li>
              <li>
                <span className="mr-2 font-medium text-neutral-primary">
                  {c("3.", "3.")}
                </span>
                {c(
                  "피드에서 이전 판단과 메모를 확인합니다.",
                  "View past decisions and notes in the feed."
                )}
              </li>
            </ol>
          </DocsSection>

          <DocsSection
            id="decision"
            title={c("연결 수락과 연결 거절", "Accept or reject connection")}
            description={c(
              "Accept Intro를 누르면 이메일로 소개받거나 바로 인터뷰를 요청하는 방식을 선택할 수 있습니다. 내용을 확인하고 수락하면 선택한 방식으로 진행합니다. Reject는 이번 역할의 진행을 끝내는 결정입니다. 이유는 선택 사항이며 다음 추천에 참고합니다.",
              "Choose Accept Intro to get introduced by email or request an interview. Review the details and confirm to proceed with your chosen method. Reject ends consideration for this role. A reason is optional and helps improve future recommendations."
            )}
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <MuteButton
                type="button"
                size="sm"
                tabIndex={-1}
                className="pointer-events-none w-full bg-primary text-white sm:w-auto"
              >
                {CANDIDATE_DECISION_LABELS.connect}
              </MuteButton>
              <MuteButton
                type="button"
                size="sm"
                tabIndex={-1}
                className="pointer-events-none w-full border-red-500 sm:w-auto"
              >
                {c("Reject", "Reject")}
              </MuteButton>
            </div>
            <p className="mt-3 text-xs font-normal leading-5 text-neutral-muted">
              {c(
                "연결 거절은 임시 보류가 아니에요. 후보자에게 회사의 종료 결정이 안내되며 이미 보이거나 전달된 안내는 회수할 수 없어요.",
                "Rejecting a connection is not a temporary hold. The candidate is notified that the company has ended consideration and any notices already visible or sent cannot be retracted."
              )}
            </p>
          </DocsSection>

          <DocsSection
            id="feedback"
            title={c("메모", "Notes")}
            description={c(
              "피드에는 상태 변경, 연결 시작·거절과 이유, 회사 멤버가 남긴 메모만 표시됩니다. 자신이 남긴 메모는 수정하거나 삭제할 수 있습니다.",
              "The feed shows status changes, connection decisions and reasons, and notes from your team. You can edit or delete your own notes."
            )}
          >
            <div className="max-w-[440px] overflow-hidden rounded-md border border-neutral-1000-a10">
              <div className="min-h-[64px] px-3 py-2.5 text-xs font-normal leading-5 text-neutral-muted">
                {c(
                  "다음 인터뷰에서는 0-1 제품 의사결정 사례를 확인해 주세요.",
                  "For the next interview, review a 0-1 product decision case."
                )}
              </div>
              <div className="flex justify-end border-t border-neutral-1000-a05 px-2 py-2">
                <span className="inline-flex h-8 items-center gap-1 rounded-sm bg-neutral-1000 px-2.5 text-xs font-medium text-neutral-00">
                  <Plus className="h-3.5 w-3.5" />
                  {c("메모 추가", "Add note")}
                </span>
              </div>
            </div>
          </DocsSection>

          <DocsSection
            id="pipeline"
            title={c("파이프라인", "Pipeline")}
            description={c(
              "후보자 카드를 실제 진행 상태에 맞게 옮기세요. Role별 인터뷰 단계가 더 필요하면 + 버튼으로 추가할 수 있습니다.",
              "Move candidate cards to match actual progress. Add interview stages per role with the + button if needed."
            )}
          >
            <div className="overflow-x-auto text-[12px] font-normal text-neutral-primary">
              <div className="flex min-w-max items-center gap-3">
                <span>{c("연결 대기", "Ready to connect")}</span>
                <span className="text-neutral-soft">→</span>
                <span>{c("연결됨", "Connected")}</span>
                <span className="text-neutral-soft">→</span>
                <span>{c("최종 오퍼", "Final offer")}</span>
                <span className="text-neutral-soft">/</span>
                <span>{c("프로세스 중단", "Process closed")}</span>
              </div>
            </div>
          </DocsSection>

          <DocsSection
            id="settings"
            title={c("회사와 Role", "Company and role")}
            description={c(
              "회사 정보와 채용 기준이 바뀌면 바로 수정하세요. Harper는 최신 내용을 추천과 후보자 안내에 사용합니다.",
              "Update company info and hiring criteria whenever they change. Harper uses the latest information for recommendations and candidate communications."
            )}
          >
            <div className="flex flex-wrap items-center gap-3">
              <MuteButton
                type="button"
                variant="default"
                size="sm"
                tabIndex={-1}
                className="pointer-events-none"
              >
                <Pencil className="h-4 w-4" />
                {c("회사", "Company")}
              </MuteButton>
              <span className="inline-flex h-8 items-center gap-2 rounded-md border border-neutral-1000-a10 px-3 text-xs font-medium">
                {c("Product Lead", "Product Lead")}
                <MoreHorizontal className="h-4 w-4" />
              </span>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-1000-a10 px-2.5 text-xs font-medium">
                <Pencil className="h-3.5 w-3.5" />
                {c("역할 수정", "Edit role")}
              </span>
            </div>
            <p className="mt-3 text-xs font-normal leading-5 text-neutral-muted">
              {c(
                "Pitch에는 후보자에게 어필할 내용을, Role에는 원하는 인재의 조건을 적습니다.",
                "Use Pitch to explain why candidates might be interested. Use Role to define who you're looking for."
              )}
            </p>
          </DocsSection>
        </div>
      </div>
    </TalentCareerModal>
  );
}
