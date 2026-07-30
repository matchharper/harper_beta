import { MoreHorizontal, Pencil, Plus } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const DOCS_SECTIONS = [
  { id: "review", label: "후보자 검토" },
  { id: "decision", label: "수락과 거절" },
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(680px,calc(100svh-24px))] max-w-[720px] grid-rows-[auto_auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-lg p-0 sm:h-[min(680px,calc(100svh-48px))]">
        <DialogHeader className="border-b border-neutral-1000-a05 px-4 py-3 pr-12 sm:px-5">
          <DialogTitle className="text-[16px] font-medium">
            Harper Docs
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-[12px] font-normal leading-4">
            후보자를 검토하고 관리하는 방법입니다.
          </DialogDescription>
        </DialogHeader>

        <nav
          aria-label="Docs 목차"
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
                {section.label}
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
              title="후보자 검토"
              description="Role 탭에서 후보자 카드를 누르세요. 상세 화면에서 추천 이유, 경력, 이력서와 링크, 이전 피드를 확인할 수 있습니다."
            >
              <ol className="space-y-1.5 text-[12px] font-normal leading-5 text-neutral-muted">
                <li>
                  <span className="mr-2 font-medium text-neutral-primary">
                    1.
                  </span>
                  추천 이유와 경력을 확인합니다.
                </li>
                <li>
                  <span className="mr-2 font-medium text-neutral-primary">
                    2.
                  </span>
                  이력서와 등록 링크를 확인합니다.
                </li>
                <li>
                  <span className="mr-2 font-medium text-neutral-primary">
                    3.
                  </span>
                  피드에서 이전 판단과 메모를 확인합니다.
                </li>
              </ol>
            </DocsSection>

            <DocsSection
              id="decision"
              title="수락과 거절"
              description="수락 이유와 거절 이유는 모두 선택 사항입니다. 이유를 구체적으로 남길수록 다음 추천이 정확해집니다."
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  size="sm"
                  tabIndex={-1}
                  className="pointer-events-none w-full bg-primary text-white sm:w-auto"
                >
                  이 후보자를 만나보겠습니다.
                </Button>
                <Button
                  type="button"
                  size="sm"
                  tabIndex={-1}
                  className="pointer-events-none w-full border-red-500 sm:w-auto"
                >
                  이 후보자는 거절하겠습니다.
                </Button>
              </div>
              <p className="mt-3 text-xs font-normal leading-5 text-neutral-muted">
                수락하면 연결됨으로, 연결받지 않으면 프로세스 중단으로
                이동합니다.
              </p>
            </DocsSection>

            <DocsSection
              id="feedback"
              title="메모"
              description="피드에는 상태 변경, 수락·거절과 이유, 회사 멤버가 남긴 메모만 표시됩니다. 자신이 남긴 메모는 수정하거나 삭제할 수 있습니다."
            >
              <div className="max-w-[440px] overflow-hidden rounded-md border border-neutral-1000-a10">
                <div className="min-h-[64px] px-3 py-2.5 text-xs font-normal leading-5 text-neutral-muted">
                  다음 인터뷰에서는 0-1 제품 의사결정 사례를 확인해 주세요.
                </div>
                <div className="flex justify-end border-t border-neutral-1000-a05 px-2 py-2">
                  <span className="inline-flex h-8 items-center gap-1 rounded-sm bg-neutral-1000 px-2.5 text-xs font-medium text-neutral-00">
                    <Plus className="h-3.5 w-3.5" />
                    메모 추가
                  </span>
                </div>
              </div>
            </DocsSection>

            <DocsSection
              id="pipeline"
              title="파이프라인"
              description="후보자 카드를 실제 진행 상태에 맞게 옮기세요. Role별 인터뷰 단계가 더 필요하면 + 버튼으로 추가할 수 있습니다."
            >
              <div className="overflow-x-auto text-[12px] font-normal text-neutral-primary">
                <div className="flex min-w-max items-center gap-3">
                  <span>연결 대기</span>
                  <span className="text-neutral-soft">→</span>
                  <span>연결됨</span>
                  <span className="text-neutral-soft">→</span>
                  <span>최종 오퍼</span>
                  <span className="text-neutral-soft">/</span>
                  <span>프로세스 중단</span>
                </div>
              </div>
            </DocsSection>

            <DocsSection
              id="settings"
              title="회사와 Role"
              description="회사 정보와 채용 기준이 바뀌면 바로 수정하세요. Harper는 최신 내용을 추천과 후보자 안내에 사용합니다."
            >
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  tabIndex={-1}
                  className="pointer-events-none"
                >
                  <Pencil className="h-4 w-4" />
                  회사
                </Button>
                <span className="inline-flex h-8 items-center gap-2 rounded-md border border-neutral-1000-a10 px-3 text-xs font-medium">
                  Product Lead
                  <MoreHorizontal className="h-4 w-4" />
                </span>
                <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-1000-a10 px-2.5 text-xs font-medium">
                  <Pencil className="h-3.5 w-3.5" />
                  역할 수정
                </span>
              </div>
              <p className="mt-3 text-xs font-normal leading-5 text-neutral-muted">
                Pitch에는 후보자에게 어필할 내용을, Role에는 원하는 인재의
                조건을 적습니다.
              </p>
            </DocsSection>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
