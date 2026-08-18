import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import {
  extractOrgDocumentsHeadings,
  OrgDocumentsMarkdown,
  type OrgDocumentsHeading,
} from "@/components/org/workspace/OrgDocumentsMarkdown";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { openCustomCrispWidget } from "@/lib/feedback/customCrispEvents";
import { buildOrgHref } from "@/lib/org/routes";
import { cn } from "@/lib/utils";

type DocumentNavigationItem = OrgDocumentsHeading & { label: string };

const FAQ_NAVIGATION_ITEM: DocumentNavigationItem = {
  id: "faq",
  label: "자주 묻는 질문",
  level: 2,
  text: "자주 묻는 질문",
};

const FAQ_ITEMS = [
  {
    answer:
      "Organization의 Integration에서 Slack이 연결되어 있는지, 이 역할의 알림을 받을 채널이 추가되어 있는지 먼저 확인해 주세요. 비공개 채널이라면 Slack에서 /invite @Harper로 Harper를 초대한 뒤 채널을 다시 추가해야 합니다. 회사에서 Slack 앱 설치 승인을 따로 받는 경우에는 Slack 관리자에게 Harper 설치가 승인되었는지도 확인해 주세요.",
    question: "Slack 알림이 오지 않아요.",
  },
  {
    answer:
      "Harper의 추천은 지원자 목록을 바로 채우는 방식이 아닙니다. 역할에 맞는 사람을 찾은 뒤 회사와 역할을 먼저 설명하고, 실제로 대화할 의사가 있는지 확인합니다. 이 과정을 마친 사람만 연결 대기로 들어오기 때문에 첫 추천까지는 시간이 걸릴 수 있습니다. 꼭 필요한 조건이나 제외해야 할 조건이 분명하다면 역할 대화에 더 구체적으로 남겨 주세요.",
    question: "역할을 등록했는데 추천이 바로 오지 않아요.",
  },
  {
    answer:
      "한 역할에 연결 대기 후보자가 5명 이상이면 회사가 먼저 기존 후보자를 검토할 수 있도록 새 연결이 잠시 멈춥니다. Inbox에서 기다리는 후보자를 수락하거나 거절하면 다시 이어집니다. 대기 후보자가 많지 않다면 해당 역할이 진행 중인지, 잠시 중단되었거나 종료되지는 않았는지 역할 설정도 확인해 주세요.",
    question: "새 추천이 멈춘 것 같아요.",
  },
  {
    answer:
      "Owner와 Admin은 후보자를 수락하거나 거절하고, Pipeline 단계를 옮기고, 역할 기준을 수정할 수 있습니다. Viewer는 후보자와 진행 상황을 볼 수 있지만 최종 결정은 할 수 없습니다. 함께 검토만 할 동료는 Viewer로, 결정을 맡길 동료는 Admin으로 초대하면 됩니다.",
    question: "누가 후보자를 수락하거나 거절할 수 있나요?",
  },
  {
    answer:
      "CC로 연결할 때 고른 회사 멤버와 후보자에게 소개 메일이 갑니다. 후보자는 받는 사람에, 회사 멤버는 참조에 들어갑니다. 채용 담당자와 현업 리더가 함께 후속 대화를 이어가야 한다면 두 사람을 모두 선택해 주세요. 필요한 사람이 보이지 않으면 먼저 Organization의 Members에서 초대해야 합니다.",
    question: "소개 메일은 누구에게 가나요?",
  },
  {
    answer:
      "역할을 잠시 중단하면 새로운 후보자를 찾고 연결 의사를 확인하는 일만 멈춥니다. 이미 연결 대기에 있거나 연결이 시작된 후보자는 사라지지 않으므로 회사가 계속 검토하고 다음 단계를 정해야 합니다. 채용 계획 자체가 끝났다면 잠시 중단이 아니라 종료를 선택해 주세요.",
    question: "역할을 잠시 중단하면 기존 후보자는 어떻게 되나요?",
  },
] as const;

function SectionNavigation({
  activeSection,
  items,
  mobile = false,
  onNavigate,
}: {
  activeSection: string;
  items: readonly DocumentNavigationItem[];
  mobile?: boolean;
  onNavigate: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Documents 목차"
      className={cn(
        mobile
          ? "flex gap-5 overflow-x-auto border-y border-neutral-1000-a10 bg-bg-default/95 px-4 py-3.5 backdrop-blur scrollbar-none"
          : "space-y-1"
      )}
      data-documents-mobile-nav={mobile ? "true" : undefined}
    >
      {items.map((item) => {
        const active = activeSection === item.id;
        return (
          <a
            aria-current={active ? "location" : undefined}
            className={cn(
              "block shrink-0 py-0.5 text-[13px] font-normal leading-6 outline-none transition-[color,transform] duration-200 focus-visible:underline motion-reduce:transition-none",
              item.level === 2 && "pl-3",
              active
                ? "translate-x-1 text-neutral-primary"
                : "text-neutral-soft hover:text-neutral-muted",
              mobile && active && "translate-x-0"
            )}
            data-documents-section-link={item.id}
            href={`#${item.id}`}
            key={item.id}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(item.id);
            }}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

export function OrgDocumentsPage({ markdown }: { markdown: string }) {
  const { workspace } = useOrgWorkspace();
  const headings = useMemo(
    () => extractOrgDocumentsHeadings(markdown),
    [markdown]
  );
  const navigationItems = useMemo<DocumentNavigationItem[]>(
    () => [
      ...headings.map((heading) => ({ ...heading, label: heading.text })),
      FAQ_NAVIGATION_ITEM,
    ],
    [headings]
  );
  const [activeSection, setActiveSection] = useState(
    headings[0]?.id ?? FAQ_NAVIGATION_ITEM.id
  );
  const orgId = workspace.workspaceId;
  const linkTargets = {
    company: buildOrgHref({ orgId, page: "team" }),
    inbox: buildOrgHref({ orgId, page: "inbox" }),
    members: buildOrgHref({ orgId, page: "member" }),
    newRole: buildOrgHref({ orgId, page: "new-role" }),
    pipeline: buildOrgHref({ orgId, page: "jobs", roleId: "all" }),
    slack: buildOrgHref({ orgId, page: "settings" }),
  };

  const navigateToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    window.history.pushState(null, "", `#${id}`);
    setActiveSection(id);
    element.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  useEffect(() => {
    let frame = 0;
    const updateActiveSection = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const anchor = window.innerWidth >= 1024 ? 96 : 150;
        let next = navigationItems[0]?.id ?? FAQ_NAVIGATION_ITEM.id;
        const firstSection = document.getElementById(next);
        const scrollContainer = firstSection?.closest("main");
        const mainIsScrollable = Boolean(
          scrollContainer &&
          scrollContainer.scrollHeight > scrollContainer.clientHeight + 1
        );
        const atBottom = mainIsScrollable
          ? Boolean(
              scrollContainer &&
              scrollContainer.scrollTop + scrollContainer.clientHeight >=
                scrollContainer.scrollHeight - 8
            )
          : window.scrollY + window.innerHeight >=
            document.documentElement.scrollHeight - 8;

        if (atBottom) {
          setActiveSection(navigationItems.at(-1)?.id ?? next);
          return;
        }

        for (const item of navigationItems) {
          const element = document.getElementById(item.id);
          if (element && element.getBoundingClientRect().top <= anchor) {
            next = item.id;
          }
        }
        setActiveSection(next);
      });
    };
    const restoreHash = () => {
      const id = window.location.hash.slice(1);
      if (!navigationItems.some((item) => item.id === id)) return;
      const element = document.getElementById(id);
      if (!element) return;
      setActiveSection(id);
      element.scrollIntoView({ behavior: "auto", block: "start" });
    };

    restoreHash();
    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, true);
    window.addEventListener("resize", updateActiveSection);
    window.addEventListener("hashchange", restoreHash);
    window.addEventListener("popstate", restoreHash);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateActiveSection, true);
      window.removeEventListener("resize", updateActiveSection);
      window.removeEventListener("hashchange", restoreHash);
      window.removeEventListener("popstate", restoreHash);
    };
  }, [navigationItems]);

  useEffect(() => {
    const mobileNav = document.querySelector<HTMLElement>(
      '[data-documents-mobile-nav="true"]'
    );
    const activeLink = mobileNav?.querySelector<HTMLElement>(
      `[data-documents-section-link="${activeSection}"]`
    );
    if (!mobileNav || !activeLink) return;
    const targetLeft =
      activeLink.offsetLeft -
      mobileNav.clientWidth / 2 +
      activeLink.clientWidth / 2;
    mobileNav.scrollTo({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      left: Math.max(0, targetLeft),
    });
  }, [activeSection]);

  return (
    <div className="min-h-screen w-full max-w-none bg-bg-default pb-24 text-neutral-primary">
      <div className="sticky top-14 z-30 -mx-4 mb-14 lg:hidden">
        <SectionNavigation
          activeSection={activeSection}
          items={navigationItems}
          mobile
          onNavigate={navigateToSection}
        />
      </div>

      <div className="lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block">
          <div className="sticky top-10">
            <SectionNavigation
              activeSection={activeSection}
              items={navigationItems}
              onNavigate={navigateToSection}
            />
          </div>
        </aside>

        <article className="w-full max-w-[840px]">
          <OrgDocumentsMarkdown
            headings={headings}
            linkTargets={linkTargets}
            markdown={markdown}
          />

          <section
            className="scroll-mt-36 mt-16 border-t border-neutral-1000-a10 pt-16 lg:scroll-mt-12"
            id="faq"
          >
            <h2 className="text-[26px] font-normal leading-[1.35] tracking-[-0.025em] text-neutral-primary sm:text-[29px]">
              자주 묻는 질문
            </h2>
            <div className="mt-8 divide-y divide-neutral-1000-a10 border-y border-neutral-1000-a10">
              {FAQ_ITEMS.map((item) => (
                <details className="group py-5" key={item.question}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-[15px] font-medium leading-7 text-neutral-primary outline-none marker:hidden focus-visible:underline">
                    {item.question}
                    <ChevronDown className="size-4 shrink-0 text-neutral-soft transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                  </summary>
                  <p className="mt-3 mr-8 border-l-2 border-neutral-1000-a10 bg-bg-weak px-4 py-3 text-[14px] font-normal leading-7 text-neutral-muted">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>

            <div className="mt-10">
              <p className="text-[15px] font-normal leading-7 text-neutral-muted">
                여기에서 해결되지 않았다면 프로필 메뉴의 문의하기를 열어주세요.
                보고 있던 역할이나 후보자 이름을 같이 남기면 더 빨리 확인할 수
                있습니다.
              </p>
              <MuteButton
                className="mt-5 font-normal focus-visible:ring-neutral-1000-a10 focus-visible:ring-offset-bg-default"
                onClick={() => openCustomCrispWidget()}
                size="lg"
                variant="dark"
              >
                문의하기
                <ArrowRight className="size-4" />
              </MuteButton>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}
