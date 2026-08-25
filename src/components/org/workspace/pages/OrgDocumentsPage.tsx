import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, List } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
  extractOrgDocumentsHeadings,
  OrgDocumentsMarkdown,
  ORG_DOCUMENTS_SECTION_EYEBROWS,
  type OrgDocumentsHeading,
} from "@/components/org/workspace/OrgDocumentsMarkdown";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { openCustomCrispWidget } from "@/lib/feedback/customCrispEvents";
import { buildOrgHref } from "@/lib/org/routes";
import { COMPANY_SERVICE_FAQ_ITEMS } from "@/lib/org/serviceFaq";
import { cn } from "@/lib/utils";

type DocumentNavigationItem = OrgDocumentsHeading & { label: string };

const FAQ_NAVIGATION_ITEM: DocumentNavigationItem = {
  id: "faq",
  label: "자주 묻는 질문",
  level: 2,
  text: "자주 묻는 질문",
};

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
  const activeItemIndex = items.findIndex((item) => item.id === activeSection);
  let activePrimarySectionId = items[0]?.id;
  for (let index = Math.max(0, activeItemIndex); index >= 0; index -= 1) {
    if (items[index]?.level === 2) {
      activePrimarySectionId = items[index].id;
      break;
    }
  }
  const primarySections = items.filter((item) => item.level === 2);

  const getChildren = (section: DocumentNavigationItem) => {
    const sectionIndex = items.findIndex((item) => item.id === section.id);
    const children: DocumentNavigationItem[] = [];
    for (let index = sectionIndex + 1; index < items.length; index += 1) {
      if (items[index].level === 2) break;
      if (items[index].level === 3) children.push(items[index]);
    }
    return children;
  };

  const renderLink = (
    item: DocumentNavigationItem,
    { child = false }: { child?: boolean } = {}
  ) => {
    const active = activeSection === item.id;
    const activeGroup = activePrimarySectionId === item.id;
    return (
      <a
        aria-current={active ? "location" : undefined}
        className={cn(
          "block shrink-0 rounded-sm py-1 text-[13px] leading-5 outline-none transition-colors duration-150 focus-visible:underline motion-reduce:transition-none",
          child && "text-[12.5px] leading-[1.55]",
          active || activeGroup
            ? "font-medium text-[#181717]"
            : "font-normal text-[#77716d] hover:text-[#403f3f]"
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
  };

  return (
    <nav
      aria-label="Documents 목차"
      className={cn(
        mobile
          ? "flex gap-5 overflow-x-auto border-y border-[#ebe7e4] bg-white/95 px-4 py-3 backdrop-blur scrollbar-none"
          : "w-full"
      )}
      data-documents-mobile-nav={mobile ? "true" : undefined}
    >
      {mobile ? null : (
        <div className="mb-4 flex items-center gap-2 text-[13px] font-medium leading-5 text-[#403f3f]">
          <List aria-hidden="true" className="size-3.5" strokeWidth={2} />
          <span>문서 내용</span>
        </div>
      )}
      <div className={cn(mobile ? "contents" : "space-y-1")}>
        {primarySections.map((section) => {
          const children = getChildren(section);
          const expanded = activePrimarySectionId === section.id;
          return (
            <div className={cn(mobile && "contents")} key={section.id}>
              {renderLink(section)}
              {!mobile && expanded && children.length > 0 ? (
                <div className="my-1.5 ml-0.5 space-y-0.5 border-l border-[#e7e3e0] pl-3">
                  {children.map((child) => renderLink(child, { child: true }))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
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
      ...headings
        .filter((heading) => heading.level !== 1)
        .map((heading) => ({ ...heading, label: heading.text })),
      FAQ_NAVIGATION_ITEM,
    ],
    [headings]
  );
  const [activeSection, setActiveSection] = useState(
    navigationItems[0]?.id ?? FAQ_NAVIGATION_ITEM.id
  );
  const [copied, setCopied] = useState(false);
  const copyResetTimerRef = useRef<number | null>(null);
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

  const copyPage = useCallback(async () => {
    const source = document.querySelector<HTMLElement>(
      "[data-documents-copy-source]"
    );
    if (!source || !navigator.clipboard) return;

    const selector = "h1, h2, h3, h4, p, li, figcaption, pre";
    const blocks = Array.from(source.querySelectorAll<HTMLElement>(selector));
    const pageText = blocks
      .filter(
        (element) =>
          !element.closest("[data-documents-copy-exclude]") &&
          !element.parentElement?.closest(selector)
      )
      .map((element) => element.innerText.trim())
      .filter(Boolean)
      .join("\n\n");

    try {
      await navigator.clipboard.writeText(pageText);
      setCopied(true);
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyResetTimerRef.current = null;
      }, 1600);
    } catch {
      setCopied(false);
    }
  }, []);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    let frame = 0;
    const updateActiveSection = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const anchor = Math.min(320, Math.max(140, window.innerHeight * 0.45));
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
    const activeItemIndex = navigationItems.findIndex(
      (item) => item.id === activeSection
    );
    let activePrimarySectionId = navigationItems[0]?.id ?? activeSection;
    for (let index = Math.max(0, activeItemIndex); index >= 0; index -= 1) {
      if (navigationItems[index]?.level === 2) {
        activePrimarySectionId = navigationItems[index].id;
        break;
      }
    }
    const mobileNav = document.querySelector<HTMLElement>(
      '[data-documents-mobile-nav="true"]'
    );
    const activeLink = mobileNav?.querySelector<HTMLElement>(
      `[data-documents-section-link="${activePrimarySectionId}"]`
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
  }, [activeSection, navigationItems]);

  return (
    <div className="min-h-screen w-full max-w-none bg-white pb-28 text-[#181717]">
      <div className="sticky top-12 z-30 -mx-4 -mt-6 mb-12 sm:-mt-9 lg:-mt-10 xl:hidden">
        <SectionNavigation
          activeSection={activeSection}
          items={navigationItems}
          mobile
          onNavigate={navigateToSection}
        />
      </div>

      <div className="xl:grid xl:grid-cols-[minmax(0,600px)_200px] xl:justify-between xl:gap-12 xl:pl-24 2xl:pl-32">
        <article
          className="mx-auto w-full max-w-[680px] xl:mx-0 xl:max-w-[600px]"
          data-documents-copy-source
        >
          <OrgDocumentsMarkdown
            copied={copied}
            headings={headings}
            linkTargets={linkTargets}
            markdown={markdown}
            onCopy={() => void copyPage()}
          />

          <section className="scroll-mt-36 mt-20 xl:scroll-mt-12" id="faq">
            <Text
              as="p"
              className="normal-case text-primary"
              data-documents-copy-exclude
              type="eyebrow"
            >
              {ORG_DOCUMENTS_SECTION_EYEBROWS.faq}
            </Text>
            <h2 className="mt-2 text-[23px] font-medium leading-8 tracking-[-0.025em] text-[#181717] sm:text-[24px]">
              자주 묻는 질문
            </h2>
            <div className="mt-6 divide-y divide-[#e9e6e4] border-y border-[#e9e6e4]">
              {COMPANY_SERVICE_FAQ_ITEMS.map((item) => (
                <details className="group py-4.5" key={item.question}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-[16px] font-medium leading-7 text-[#272321] outline-none marker:hidden focus-visible:underline">
                    {item.question}
                    <ChevronDown className="size-4 shrink-0 text-[#8d8580] transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                  </summary>
                  <p className="mt-3 mr-8 rounded-lg bg-[#f8f6f4] px-4 py-3.5 text-[15px] font-normal leading-[1.7] text-[#504a46]">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>

            <div className="mt-10">
              <p className="text-[16px] font-normal leading-7 text-[#504a46]">
                문의하기를 통해 Harper 팀에 직접 문의를 남겨주시면 최대한 빠르게
                응답드리겠습니다. 보고 있던 역할이나 후보자 이름, 궁금한 내용을
                함께 남겨주시면 더 정확하게 확인할 수 있습니다.
              </p>
              <MuteButton
                className="mt-5 font-normal focus-visible:ring-black/10 focus-visible:ring-offset-white"
                onClick={() => openCustomCrispWidget()}
                size="md"
                variant="dark"
              >
                문의하기
                <ArrowRight className="size-4" />
              </MuteButton>
            </div>
          </section>
        </article>

        <aside className="hidden xl:block">
          <div className="sticky top-10">
            <SectionNavigation
              activeSection={activeSection}
              items={navigationItems}
              onNavigate={navigateToSection}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
