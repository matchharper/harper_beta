import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import { useRouter } from "next/router";
import { CardButton, MuteButton } from "@/components/ui/button";
import {
  extractOrgDocumentsHeadings,
  ORG_DOCUMENTS_FAQ_HEADING,
  OrgDocumentsMarkdown,
  splitOrgDocumentsMarkdown,
} from "@/components/org/workspace/OrgDocumentsMarkdown";
import { useOrgSourceT, useOrgT } from "@/i18n/org/OrgLocaleProvider";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { openCustomCrispWidget } from "@/lib/feedback/customCrispEvents";
import { buildOrgHref } from "@/lib/org/routes";
import { COMPANY_SERVICE_FAQ_ITEMS } from "@/lib/org/serviceFaq";

export function OrgDocumentsPage({ markdown }: { markdown: string }) {
  const t = useOrgT();
  const sourceT = useOrgSourceT();
  const router = useRouter();
  const { workspace } = useOrgWorkspace();
  const documentContent = useMemo(
    () => splitOrgDocumentsMarkdown(markdown),
    [markdown]
  );
  const headings = useMemo(
    () => extractOrgDocumentsHeadings(markdown),
    [markdown]
  );
  const sectionHeadings = useMemo(
    () => [
      ...documentContent.sections.map((section) => section.heading),
      ORG_DOCUMENTS_FAQ_HEADING,
    ],
    [documentContent.sections]
  );
  const sectionParam =
    typeof router.query.section === "string" ? router.query.section : "";
  const activeSectionId = sectionHeadings.some(
    (heading) => heading.id === sectionParam
  )
    ? sectionParam
    : "";
  const activeSection = documentContent.sections.find(
    (section) => section.heading.id === activeSectionId
  );
  const [copied, setCopied] = useState(false);
  const copyResetTimerRef = useRef<number | null>(null);
  const pendingHeadingRef = useRef<string | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const orgId = workspace.workspaceId;
  const documentsHref = buildOrgHref({ orgId, page: "documents" });
  const sectionHref = useCallback(
    (id: string) =>
      `${documentsHref}${documentsHref.includes("?") ? "&" : "?"}section=${encodeURIComponent(id)}`,
    [documentsHref]
  );
  const linkTargets = {
    company: buildOrgHref({ orgId, page: "team" }),
    inbox: buildOrgHref({ orgId, page: "inbox" }),
    members: buildOrgHref({ orgId, page: "member" }),
    newRole: buildOrgHref({ orgId, page: "new-role" }),
    pipeline: buildOrgHref({ orgId, page: "jobs", roleId: "all" }),
    slack: buildOrgHref({ orgId, page: "settings" }),
  };

  const navigateToSection = useCallback(
    (id: string) => {
      setCopied(false);
      void router.push(id ? sectionHref(id) : documentsHref, undefined, {
        scroll: false,
        shallow: true,
      });
    },
    [documentsHref, router, sectionHref]
  );

  const navigateToHeading = useCallback(
    (id: string) => {
      const headingIndex = headings.findIndex((heading) => heading.id === id);
      if (headingIndex < 0) return false;
      const parent = headings
        .slice(0, headingIndex + 1)
        .reverse()
        .find((heading) => heading.level === 2);
      if (!parent) return false;
      if (parent.id === activeSectionId) {
        document.getElementById(id)?.scrollIntoView({ block: "start" });
      } else {
        pendingHeadingRef.current = id;
        navigateToSection(parent.id);
      }
      return true;
    },
    [activeSectionId, headings, navigateToSection]
  );

  const copySection = useCallback(async () => {
    const source = articleRef.current;
    if (!source || !navigator.clipboard) return;
    const selector = "h1, h2, h3, h4, p, li, figcaption, pre";
    const blocks = Array.from(source.querySelectorAll<HTMLElement>(selector));
    const sectionText = blocks
      .filter(
        (element) =>
          !element.closest("[data-documents-copy-exclude]") &&
          !element.parentElement?.closest(selector)
      )
      .map((element) => element.innerText.trim())
      .filter(Boolean)
      .join("\n\n");

    try {
      await navigator.clipboard.writeText(sectionText);
      setCopied(true);
      if (copyResetTimerRef.current !== null)
        window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyResetTimerRef.current = null;
      }, 1600);
    } catch {
      setCopied(false);
    }
  }, []);

  useEffect(() => {
    if (!router.isReady || !window.location.hash) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    const headingIndex = headings.findIndex((heading) => heading.id === id);
    if (headingIndex < 0) return;
    const parent = headings
      .slice(0, headingIndex + 1)
      .reverse()
      .find((heading) => heading.level === 2);
    if (!parent || sectionParam) return;
    pendingHeadingRef.current = id;
    void router.replace(sectionHref(parent.id), undefined, {
      scroll: false,
      shallow: true,
    });
  }, [headings, router, router.isReady, sectionHref, sectionParam]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const pendingHeading = pendingHeadingRef.current;
      if (pendingHeading) {
        const element = document.getElementById(pendingHeading);
        if (element) {
          pendingHeadingRef.current = null;
          element.scrollIntoView({ block: "start" });
        }
        return;
      }
      articleRef.current?.closest("main")?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSectionId]);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current !== null)
        window.clearTimeout(copyResetTimerRef.current);
    },
    []
  );

  return (
    <div className="min-h-screen w-full bg-white pb-24 text-neutral-primary">
      <div className="mx-auto w-full max-w-[840px] pt-4 sm:pt-7">
        {!activeSectionId ? (
          <>
            <article ref={articleRef}>
              <OrgDocumentsMarkdown
                copied={copied}
                headings={documentContent.introHeadings}
                linkTargets={linkTargets}
                markdown={documentContent.introMarkdown}
                onCopy={() => void copySection()}
                showCopyButton={false}
              />
            </article>
            <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2">
              {sectionHeadings.map((heading, index) => (
                <CardButton
                  className="min-h-[128px] items-start justify-between gap-5 rounded-xl px-5 py-5"
                  key={heading.id}
                  onClick={() => navigateToSection(heading.id)}
                >
                  <span className="flex flex-col items-start gap-3">
                    <span className="text-xs tabular-nums text-neutral-soft">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-left text-[21px] font-medium leading-7 tracking-[-0.02em] sm:text-[24px] sm:leading-8">
                      {sourceT(heading.text)}
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="mt-auto size-4 shrink-0 text-neutral-muted"
                  />
                </CardButton>
              ))}
            </div>
          </>
        ) : (
          <>
            <MuteButton
              className="mb-7"
              onClick={() => navigateToSection("")}
              size="md"
              variant="transparent"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              {t("workspace.OrgWorkspaceSidebar.04ffd41a", "Documents")}
            </MuteButton>
            {activeSection ? (
              <article ref={articleRef} data-documents-copy-source>
                <OrgDocumentsMarkdown
                  copied={copied}
                  headings={activeSection.headings}
                  linkTargets={linkTargets}
                  markdown={activeSection.markdown}
                  onCopy={() => void copySection()}
                  onNavigate={navigateToHeading}
                />
              </article>
            ) : (
              <article ref={articleRef}>
                <section id="faq">
                  <h2 className="text-[23px] font-medium leading-8 tracking-[-0.025em] sm:text-[24px]">
                    {sourceT(ORG_DOCUMENTS_FAQ_HEADING.text)}
                  </h2>
                  <div className="mt-6 divide-y divide-neutral-1000-a05 border-y border-neutral-1000-a05">
                    {COMPANY_SERVICE_FAQ_ITEMS.filter(
                      (item) => item.showInDocuments !== false
                    ).map((item) => (
                      <details className="group py-6" key={item.question}>
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-[15px] leading-7 outline-none marker:hidden focus-visible:underline">
                          {sourceT(item.question)}
                          <ChevronDown className="size-4 shrink-0 text-neutral-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                        </summary>
                        <p className="mt-3 mr-8 text-[15px] leading-[1.7] text-neutral-muted">
                          {sourceT(item.answer)}
                        </p>
                      </details>
                    ))}
                  </div>
                  <div className="mt-10">
                    <p className="text-[16px] leading-7 text-neutral-muted">
                      {t(
                        "workspace.pages.OrgDocumentsPage.75a8a0b9",
                        "문의하기를 통해 Harper 팀에 직접 문의를 남겨주시면 최대한 빠르게 응답드리겠습니다. 보고 있던 역할이나 후보자 이름, 궁금한 내용을 함께 남겨주시면 더 정확하게 확인할 수 있습니다."
                      )}
                    </p>
                    <MuteButton
                      className="mt-5"
                      onClick={() => openCustomCrispWidget()}
                      size="md"
                      variant="dark"
                    >
                      {t(
                        "workspace.pages.OrgDocumentsPage.b9dd1d00",
                        "문의하기"
                      )}
                      <ArrowRight className="size-4" />
                    </MuteButton>
                  </div>
                </section>
              </article>
            )}
          </>
        )}
      </div>
    </div>
  );
}
