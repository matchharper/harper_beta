import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import { MuteButton } from "@/components/ui/button";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { openCustomCrispWidget } from "@/lib/feedback/customCrispEvents";
import { buildOrgHref } from "@/lib/org/routes";
import { cn } from "@/lib/utils";

const DOCUMENT_SECTIONS = [
  { id: "getting-started", label: "시작하기" },
  { id: "slack", label: "Slack" },
  { id: "create-a-role", label: "역할 등록" },
  { id: "review-recommendations", label: "추천 확인" },
  { id: "accept-or-decline", label: "수락과 거절" },
  { id: "ask-harper", label: "Harper에게 부탁하기" },
  { id: "pipeline", label: "Pipeline" },
  { id: "faq", label: "자주 묻는 질문" },
] as const;

type DocumentSectionId = (typeof DOCUMENT_SECTIONS)[number]["id"];

function DocumentSection({
  children,
  id,
  introduction,
  title,
}: {
  children: ReactNode;
  id: DocumentSectionId;
  introduction?: ReactNode;
  title: string;
}) {
  return (
    <section
      className="scroll-mt-36 border-b border-black/10 pb-16 last:border-b-0 lg:scroll-mt-12 lg:pb-20"
      id={id}
    >
      <h2 className="text-[26px] font-normal leading-[1.35] tracking-[-0.025em] text-black sm:text-[29px]">
        {title}
      </h2>
      {introduction ? (
        <div className="mt-4 text-[15px] font-normal leading-[1.75] text-black/65">
          {introduction}
        </div>
      ) : null}
      <div className="mt-8 space-y-10">{children}</div>
    </section>
  );
}

function DocumentTopic({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div>
      <h3 className="text-[17px] font-medium leading-7 text-black">{title}</h3>
      <div className="mt-3 space-y-3 text-[15px] font-normal leading-[1.75] text-black/65">
        {children}
      </div>
    </div>
  );
}

function DocumentList({ children }: { children: ReactNode }) {
  return (
    <ul className="list-disc space-y-2.5 pl-[18px] marker:text-black/35 [&>li]:pl-1">
      {children}
    </ul>
  );
}

function DocumentSteps({ children }: { children: ReactNode }) {
  return (
    <ol className="list-decimal space-y-3 pl-[22px] marker:text-black/50 [&>li]:pl-1">
      {children}
    </ol>
  );
}

function DocumentStrong({ children }: { children: ReactNode }) {
  return <strong className="font-medium text-black">{children}</strong>;
}

function DocumentCallout({
  children,
  label = "핵심",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <aside className="border-l-2 border-black bg-black/[0.025] px-4 py-3.5">
      <p className="text-[12px] font-medium leading-5 text-black">{label}</p>
      <div className="mt-1.5 space-y-2 text-[14px] leading-7 text-black/70">
        {children}
      </div>
    </aside>
  );
}

function DocumentCodeBlock({
  children,
  label,
}: {
  children: string;
  label?: string;
}) {
  return (
    <figure>
      {label ? (
        <figcaption className="mb-2 text-[12px] font-medium leading-5 text-black/45">
          {label}
        </figcaption>
      ) : null}
      <pre className="overflow-x-auto bg-black px-4 py-3.5 text-[13px] leading-6 text-white">
        <code className="font-mono whitespace-pre-wrap">{children}</code>
      </pre>
    </figure>
  );
}

function DocumentLink({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <Link
      className="text-black underline decoration-black/30 underline-offset-4 transition-colors hover:decoration-black focus-visible:outline-none focus-visible:decoration-black"
      href={href}
    >
      {children}
    </Link>
  );
}

function DocumentAction({
  children,
  href,
  secondary = false,
}: {
  children: ReactNode;
  href: string;
  secondary?: boolean;
}) {
  return (
    <MuteButton
      asChild
      className={cn(
        "font-normal focus-visible:ring-black/20 focus-visible:ring-offset-white",
        secondary
          ? "border-black/15 bg-white text-black hover:border-black/30 hover:bg-black/[0.03] active:border-black/40 active:bg-black/[0.06]"
          : "border-black bg-black text-white hover:border-black/85 hover:bg-black/85 active:border-black/70 active:bg-black/70"
      )}
      size="lg"
      variant={secondary ? "default" : "dark"}
    >
      <Link href={href}>
        {children}
        <ArrowRight className="size-4" />
      </Link>
    </MuteButton>
  );
}

function DocumentQuote({
  children,
  label = "입력 예시",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <figure className="border-l-2 border-black bg-black/[0.025] px-4 py-3.5">
      <figcaption className="text-[12px] font-medium leading-5 text-black/45">
        {label}
      </figcaption>
      <blockquote className="mt-1.5 space-y-1.5 text-[15px] font-normal leading-7 text-black/75">
        {children}
      </blockquote>
    </figure>
  );
}

function SectionNavigation({
  activeSection,
  mobile = false,
  onNavigate,
}: {
  activeSection: DocumentSectionId;
  mobile?: boolean;
  onNavigate: (id: DocumentSectionId) => void;
}) {
  return (
    <nav
      aria-label="Documents 목차"
      className={cn(
        mobile
          ? "flex gap-5 overflow-x-auto border-y border-black/10 bg-white/95 px-4 py-3.5 backdrop-blur scrollbar-none"
          : "space-y-1"
      )}
      data-documents-mobile-nav={mobile ? "true" : undefined}
    >
      {DOCUMENT_SECTIONS.map((item) => {
        const active = activeSection === item.id;
        return (
          <a
            aria-current={active ? "location" : undefined}
            className={cn(
              "block shrink-0 py-0.5 text-[13px] font-normal leading-6 outline-none transition-[color,transform] duration-200 focus-visible:underline motion-reduce:transition-none",
              active
                ? "translate-x-1 text-black"
                : "text-black/40 hover:text-black/70",
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

export function OrgDocumentsPage() {
  const { workspace } = useOrgWorkspace();
  const [activeSection, setActiveSection] = useState<DocumentSectionId>(
    DOCUMENT_SECTIONS[0].id
  );
  const orgId = workspace.workspaceId;
  const href = {
    company: buildOrgHref({ orgId, page: "team" }),
    inbox: buildOrgHref({ orgId, page: "inbox" }),
    members: buildOrgHref({ orgId, page: "member" }),
    newRole: buildOrgHref({ orgId, page: "new-role" }),
    pipeline: buildOrgHref({ orgId, page: "jobs", roleId: "all" }),
    slack: buildOrgHref({ orgId, page: "settings" }),
  };

  const navigateToSection = useCallback((id: DocumentSectionId) => {
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
        let next: DocumentSectionId = DOCUMENT_SECTIONS[0].id;
        const firstSection = document.getElementById(DOCUMENT_SECTIONS[0].id);
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
          setActiveSection(DOCUMENT_SECTIONS.at(-1)?.id ?? next);
          return;
        }
        for (const item of DOCUMENT_SECTIONS) {
          const element = document.getElementById(item.id);
          if (element && element.getBoundingClientRect().top <= anchor) {
            next = item.id;
          }
        }
        setActiveSection(next);
      });
    };
    const restoreHash = () => {
      const id = window.location.hash.slice(1) as DocumentSectionId;
      if (!DOCUMENT_SECTIONS.some((item) => item.id === id)) return;
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
  }, []);

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
    <div className="min-h-screen w-full max-w-none bg-white pb-24 text-black">
      <header className="pb-14 lg:grid lg:grid-cols-[144px_minmax(0,1fr)] lg:gap-12 lg:pb-16">
        <div className="max-w-[840px] lg:col-start-2">
          <h1 className="text-[38px] font-normal leading-tight tracking-[-0.04em] text-black sm:text-[44px]">
            Documents
          </h1>
          <p className="mt-5 text-[16px] font-normal leading-8 text-black/60">
            회사 정보를 준비하는 일부터 역할 등록, 후보자 검토, 첫 연결과 이후
            관리까지 Harper를 쓰는 흐름을 한곳에 모았습니다. 처음이라면{" "}
            <DocumentStrong>시작하기 → Slack → 역할 등록</DocumentStrong> 순서로
            읽어보세요. 이미 사용 중이라면 왼쪽 목차에서 필요한 부분으로 바로
            이동할 수 있습니다.
          </p>
        </div>
      </header>

      <div className="sticky top-14 z-30 -mx-4 mb-14 lg:hidden">
        <SectionNavigation
          activeSection={activeSection}
          mobile
          onNavigate={navigateToSection}
        />
      </div>

      <div className="lg:grid lg:grid-cols-[144px_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block">
          <div className="sticky top-10">
            <SectionNavigation
              activeSection={activeSection}
              onNavigate={navigateToSection}
            />
          </div>
        </aside>

        <article className="w-full max-w-[840px] space-y-14 lg:space-y-16">
          <DocumentSection
            id="getting-started"
            introduction={
              <p>
                처음에는{" "}
                <DocumentStrong>
                  회사 정보, 참여할 멤버, Slack 채널, 찾는 역할
                </DocumentStrong>
                만 준비하면 됩니다. 완성된 채용 공고가 없어도 괜찮습니다.
              </p>
            }
            title="시작하기"
          >
            <DocumentTopic title="Harper가 후보자를 소개하는 방식">
              <p>
                Harper는 검색 결과를 그대로 보여주지 않습니다. 역할에 맞는
                사람의 경력을 살펴보고, 후보자에게 회사와 역할을 먼저
                설명합니다.
              </p>
              <DocumentCallout label="연결 대기의 뜻">
                <p>
                  <DocumentStrong>연결 대기</DocumentStrong>는 후보자가 이번
                  역할을 알고, 회사와 대화할 의사를 밝힌 상태입니다. 회사는
                  이때부터 추천 이유와 자료를 읽고 만나볼지 결정하면 됩니다.
                </p>
              </DocumentCallout>
            </DocumentTopic>

            <DocumentTopic title="처음 설정할 것">
              <DocumentSteps>
                <li>
                  <DocumentStrong>회사 정보 확인.</DocumentStrong> 후보자에게
                  설명할 내용이 맞는지{" "}
                  <DocumentLink href={href.company}>회사 정보</DocumentLink>를
                  확인합니다. 회사가 하는 일, 팀의 방향, 일하는 방식이
                  필요합니다.
                </li>
                <li>
                  <DocumentStrong>Slack 연결.</DocumentStrong> 추천 알림을 함께
                  볼 수 있도록{" "}
                  <DocumentLink href={href.slack}>Slack을 연결</DocumentLink>
                  하고, 실제 검토 팀이 있는 채널을 고릅니다.
                </li>
                <li>
                  <DocumentStrong>멤버 초대.</DocumentStrong> 후보자를 함께
                  검토하거나 소개 메일을 받을 사람을{" "}
                  <DocumentLink href={href.members}>멤버로 초대</DocumentLink>
                  합니다. 현업에서 결정을 함께할 동료도 포함하세요.
                </li>
                <li>
                  <DocumentStrong>역할 등록.</DocumentStrong>{" "}
                  <DocumentLink href={href.newRole}>
                    첫 역할을 등록
                  </DocumentLink>
                  하고 맡길 일과 꼭 필요한 경험을 알려줍니다.
                </li>
              </DocumentSteps>
            </DocumentTopic>

            <DocumentTopic title="역할을 등록한 다음">
              <DocumentSteps>
                <li>
                  <DocumentStrong>후보자 탐색.</DocumentStrong> 역할 등록이
                  끝나면 Harper가 후보자를 찾기 시작합니다. 화면을 계속 열어둘
                  필요는 없습니다.
                </li>
                <li>
                  <DocumentStrong>후보자 의사 확인.</DocumentStrong> 적합한
                  사람에게 회사, 역할, 제안 이유를 설명하고 대화할 마음이 있는지
                  확인합니다. 관심이 없는 사람은 검토 목록에 들어오지 않습니다.
                </li>
                <li>
                  <DocumentStrong>연결 대기.</DocumentStrong> 후보자가 만나보고
                  싶다고 답하고 필요한 자료가 준비되면 연결 대기로 들어옵니다.
                  Slack과 <DocumentLink href={href.inbox}>Inbox</DocumentLink>에
                  알림이 오며, 후보자는 회사의 답을 기다립니다.
                </li>
                <li>
                  <DocumentStrong>회사의 결정.</DocumentStrong> 추천 이유와
                  이력서를 보고 수락하거나 거절합니다. 정보가 부족하면 먼저
                  Harper에게 후보자 확인을 부탁할 수 있습니다.
                </li>
              </DocumentSteps>
              <DocumentCallout label="결정 이후">
                <p>
                  <DocumentStrong>수락</DocumentStrong>하면 소개 메일을 보내거나
                  회사가 직접 연락합니다. <DocumentStrong>거절</DocumentStrong>
                  하면 Harper가 후보자에게 이번 연결이 진행되지 않는다고
                  안내합니다. 수락 이후의 전형은{" "}
                  <DocumentLink href={href.pipeline}>Pipeline</DocumentLink>
                  에서 관리하세요.
                </p>
              </DocumentCallout>
            </DocumentTopic>

            <DocumentAction href={href.newRole}>
              첫 역할 등록하기
            </DocumentAction>
          </DocumentSection>

          <DocumentSection
            id="slack"
            introduction={
              <p>
                Slack에서는{" "}
                <DocumentStrong>
                  알림 확인, 후보자 검토, 수락·거절, Harper에게 부탁하기
                </DocumentStrong>
                를 한곳에서 할 수 있습니다.
              </p>
            }
            title="Slack"
          >
            <DocumentTopic title="연결 방법">
              <DocumentSteps>
                <li>
                  <DocumentStrong>Integration 열기.</DocumentStrong>{" "}
                  <DocumentLink href={href.slack}>
                    Organization의 Integration
                  </DocumentLink>
                  으로 이동합니다.
                </li>
                <li>
                  <DocumentStrong>회사 Slack 선택.</DocumentStrong> Slack 연결을
                  누르고 회사에서 사용하는 Slack을 선택합니다. 설치 승인이
                  필요하면 Slack 관리자에게 요청합니다.
                </li>
                <li>
                  <DocumentStrong>알림 채널 추가.</DocumentStrong> 후보자를
                  실제로 검토하고 결정할 사람들이 있는 채널을 고릅니다.
                </li>
                <li>
                  <DocumentStrong>비공개 채널 준비.</DocumentStrong> 아래
                  명령으로 Harper를 먼저 초대한 뒤 채널을 추가합니다.
                </li>
              </DocumentSteps>
              <DocumentCodeBlock label="비공개 채널에서 입력">
                {"/invite @Harper"}
              </DocumentCodeBlock>
              <DocumentCallout label="채널 선택">
                <p>
                  역할마다 담당 팀이 다르면 여러 채널을 연결할 수 있습니다.
                  후보자 정보가 올라오므로{" "}
                  <DocumentStrong>
                    실제 채용에 참여하는 사람만 있는 채널
                  </DocumentStrong>
                  을 권합니다.
                </p>
              </DocumentCallout>
            </DocumentTopic>

            <DocumentTopic title="어떤 알림을 받나요?">
              <DocumentList>
                <li>
                  <DocumentStrong>연결 대기 알림.</DocumentStrong> 후보자가
                  회사와 역할을 이해했고 대화할 의사가 있다는 뜻입니다.
                </li>
                <li>
                  <DocumentStrong>알림에 포함되는 내용.</DocumentStrong> 역할
                  이름, 후보자 정보, 추천 이유를 함께 볼 수 있습니다.
                </li>
                <li>
                  <DocumentStrong>팀의 결정.</DocumentStrong> 답글에서 의견을
                  모으고, Owner나 Admin이 최종 선택합니다.
                </li>
              </DocumentList>
            </DocumentTopic>

            <DocumentTopic title="후보자가 도착하면">
              <DocumentSteps>
                <li>
                  <DocumentStrong>후보자 검토하기</DocumentStrong>를 눌러 추천
                  이유, 경력, 학력, 이력서를 읽습니다.
                </li>
                <li>
                  역할의 핵심 조건과 이어지는 경력, 아직 확인되지 않은 내용을
                  구분해 봅니다.
                </li>
                <li>
                  <DocumentStrong>연결하기</DocumentStrong> 또는{" "}
                  <DocumentStrong>연결받지 않기</DocumentStrong>를 선택합니다.
                  자세한 차이는{" "}
                  <a
                    className="text-black underline decoration-black/30 underline-offset-4 hover:decoration-black"
                    href="#accept-or-decline"
                    onClick={(event) => {
                      event.preventDefault();
                      navigateToSection("accept-or-decline");
                    }}
                  >
                    수락과 거절
                  </a>
                  에 정리했습니다.
                </li>
              </DocumentSteps>
            </DocumentTopic>

            <DocumentTopic title="채널에서 Harper에게 말 걸기">
              <p>
                새 부탁에는 <DocumentStrong>@Harper</DocumentStrong>를 붙입니다.
                알림 아래에서는 답글로 이어서 물어보세요. 여러 역할이나 후보자가
                있다면 이름을 함께 적습니다.
              </p>
              <DocumentCodeBlock label="Slack 요청 예시">
                {
                  "@Harper 지금 먼저 봐야 할 후보자가 누구야?\n@Harper 백엔드 역할의 연결 대기 후보자를 비교해줘.\n@Harper 이 역할은 시스템 설계 경험을 더 중요하게 봐줘."
                }
              </DocumentCodeBlock>
              <DocumentCallout label="후보자에게 연락하는 부탁">
                <p>
                  후보자에게 질문하거나 이력서를 요청할 때는 Harper가 보낼
                  내용을 먼저 보여줍니다.{" "}
                  <DocumentStrong>
                    회사가 확인하기 전에는 발송하지 않습니다.
                  </DocumentStrong>
                </p>
              </DocumentCallout>
            </DocumentTopic>

            <DocumentAction href={href.slack}>Slack 연결하기</DocumentAction>
          </DocumentSection>

          <DocumentSection
            id="create-a-role"
            introduction={
              <p>
                <DocumentStrong>공고 링크·파일</DocumentStrong>을 주거나, 지금
                알고 있는 채용 배경과 찾는 사람을 몇 문장으로 설명하면 됩니다.
              </p>
            }
            title="역할 등록"
          >
            <DocumentTopic title="공고가 있을 때와 없을 때">
              <DocumentList>
                <li>
                  <DocumentStrong>공고가 있다면</DocumentStrong> 링크나 파일을
                  전달하세요. Harper가 역할 이름, 주요 업무, 자격 요건, 근무
                  조건을 먼저 정리합니다. 공고에 없는 실제 우선순위만 덧붙이면
                  됩니다.
                </li>
                <li>
                  <DocumentStrong>공고가 없다면</DocumentStrong> 왜 지금 뽑는지,
                  어떤 문제를 맡길지, 기존 팀에서 어떤 역할을 할지부터 말해
                  주세요. 이 정도만 있어도 시작할 수 있습니다.
                </li>
              </DocumentList>
              <DocumentCallout label="중요한 것">
                <p>
                  문장을 완벽하게 다듬는 것보다{" "}
                  <DocumentStrong>
                    실제 판단 기준을 빠뜨리지 않는 것
                  </DocumentStrong>
                  이 중요합니다. 빠진 내용은 Harper가 이어서 묻습니다.
                </p>
              </DocumentCallout>
            </DocumentTopic>

            <DocumentTopic title="무엇을 알려주면 되나요?">
              <p>
                사람을 뽑는 동료에게 설명하듯 말하면 됩니다. 먼저 아래 정도만
                포함해 주세요.
              </p>
              <DocumentQuote>
                <p>
                  “결제 플랫폼 팀의 백엔드 엔지니어를 찾고 있어. Java와 대규모
                  트래픽 경험이 중요하고, 서울에서 주 2회 함께 일했으면 해.”
                </p>
              </DocumentQuote>
              <p>
                기술 이름이나 연차만 적기보다 왜 그 경험이 필요한지도 같이 말해
                주세요. 예를 들어 “React 5년”보다 “복잡한 상태를 설계하고 제품
                구조를 주도해 본 사람”이 실제 기준에 더 가깝습니다.
              </p>
              <DocumentList>
                <li>
                  <DocumentStrong>맡길 일.</DocumentStrong> 입사 후 가장 먼저
                  맡게 될 일과 기대하는 결과
                </li>
                <li>
                  <DocumentStrong>경험.</DocumentStrong> 반드시 해본 경험과
                  있으면 좋은 경험의 차이
                </li>
                <li>
                  <DocumentStrong>팀.</DocumentStrong> 현재 인원, 함께 일할
                  사람, 채용하는 이유
                </li>
                <li>
                  <DocumentStrong>조건.</DocumentStrong> 근무 지역, 출근 횟수,
                  고용 형태, 보상 범위
                </li>
                <li>
                  <DocumentStrong>제외 기준.</DocumentStrong> 이번 역할에서 맞지
                  않는다고 판단할 분명한 조건
                </li>
              </DocumentList>
              <DocumentCallout label="필수와 선호를 나누세요">
                <p>
                  모든 항목을 처음부터 답할 필요는 없습니다. 다만
                  <DocumentStrong> “있으면 좋다”</DocumentStrong>와
                  <DocumentStrong> “없으면 진행하기 어렵다”</DocumentStrong>를
                  구분해 주세요.
                </p>
              </DocumentCallout>
            </DocumentTopic>

            <DocumentTopic title="Harper가 정리하는 내용">
              <DocumentList>
                <li>역할이 필요한 이유와 맡게 될 일</li>
                <li>반드시 필요한 경험 / 있으면 좋은 경험</li>
                <li>좋은 후보자를 구분할 기준 / 피해야 할 조건</li>
                <li>후보자에게 설명할 회사·팀·역할의 매력</li>
                <li>지역·근무 방식·고용 형태·보상 범위</li>
              </DocumentList>
              <DocumentCallout label="Harper가 다시 묻는 경우">
                <p>
                  빠진 조건이 있거나 내용이 서로 다르면 다시 확인합니다. 예를
                  들어 공고에는 원격 근무, 대화에는 주 2회 출근이라고 되어
                  있다면 현재 기준이 무엇인지 묻습니다.
                </p>
              </DocumentCallout>
            </DocumentTopic>

            <DocumentTopic title="등록하기 전에 확인할 것">
              <DocumentList>
                <li>
                  <DocumentStrong>역할 설명.</DocumentStrong> 후보자에게 보여도
                  되는 이름과 내용인지 확인합니다.
                </li>
                <li>
                  <DocumentStrong>우선순위.</DocumentStrong> 필수 조건과 선호
                  조건이 구분되어 있는지 봅니다.
                </li>
                <li>
                  <DocumentStrong>담당자.</DocumentStrong> 후보자를 검토하고
                  소개 메일을 받을 멤버를 정합니다.
                </li>
                <li>
                  <DocumentStrong>알림.</DocumentStrong> 새 후보자 알림을 받을
                  Slack 채널을 선택합니다.
                </li>
              </DocumentList>
            </DocumentTopic>

            <DocumentTopic title="등록한 뒤 기준을 바꾸려면">
              <p>
                역할 대화에{" "}
                <DocumentStrong>기존 기준에서 무엇이 달라졌는지</DocumentStrong>
                말해 주세요.
              </p>
              <DocumentCodeBlock label="역할 대화 예시">
                {
                  "시니어보다 직접 만드는 사람을 우선해줘.\n핀테크 경험은 이제 필수가 아니야."
                }
              </DocumentCodeBlock>
              <DocumentCallout label="기준을 크게 바꿨다면">
                <p>
                  이미 연결 대기에 있는 후보자는 이전 기준으로 소개되었을 수
                  있습니다. 새 기준으로도 만나볼 사람인지 한 명씩 다시
                  확인하세요.
                </p>
              </DocumentCallout>
              <p>
                회사 전반의 설명이 바뀌었다면 먼저{" "}
                <DocumentLink href={href.company}>회사 정보</DocumentLink>를
                수정하고, 특정 역할의 내용은 역할 대화에 남겨 주세요. 잠깐
                쉬려면
                <DocumentStrong>중단</DocumentStrong>, 더 이상 뽑지 않는다면
                <DocumentStrong> 종료</DocumentStrong>를 선택합니다.
              </p>
            </DocumentTopic>

            <DocumentAction href={href.newRole}>
              새 역할 등록하기
            </DocumentAction>
          </DocumentSection>

          <DocumentSection
            id="review-recommendations"
            introduction={
              <p>
                연결 대기에는{" "}
                <DocumentStrong>
                  회사와 역할 설명을 듣고 대화할 의사를 밝힌 후보자
                </DocumentStrong>
                만 들어옵니다.
              </p>
            }
            title="추천 확인"
          >
            <DocumentTopic title="연결 대기에 오기까지">
              <DocumentSteps>
                <li>
                  <DocumentStrong>탐색.</DocumentStrong> Harper가 역할의 필수
                  조건과 우선순위를 바탕으로 맞는 사람을 찾고, 이력과 경험을
                  살펴봅니다.
                </li>
                <li>
                  <DocumentStrong>역할 설명.</DocumentStrong> 후보자에게 회사가
                  어떤 곳인지, 어떤 일을 맡게 되는지, 왜 이 역할을 제안하는지
                  설명합니다.
                </li>
                <li>
                  <DocumentStrong>의사 확인.</DocumentStrong> 후보자가 관심을
                  보이면 궁금한 점에 답하고, 회사에 소개되어도 괜찮은지
                  확인합니다.
                </li>
                <li>
                  <DocumentStrong>연결 대기.</DocumentStrong> 연결에 필요한
                  확인을 마친 뒤 회사의 결정을 기다리는 연결 대기로 보냅니다.
                </li>
              </DocumentSteps>
              <DocumentCallout>
                <p>
                  연결 대기는 단순 추천 목록이 아닙니다. 후보자가 회사의 답을
                  기다리고 있으므로 검토한 뒤에는{" "}
                  <DocumentStrong>수락 또는 거절</DocumentStrong>로 답해 주세요.
                </p>
              </DocumentCallout>
            </DocumentTopic>

            <DocumentTopic title="프로필에서 볼 것">
              <DocumentList>
                <li>
                  <DocumentStrong>추천 이유</DocumentStrong>와 그 판단의 근거가
                  된 경력
                </li>
                <li>
                  <DocumentStrong>실제로 맡았던 일</DocumentStrong>과 결과, 책임
                  범위
                </li>
                <li>
                  <DocumentStrong>확인되지 않은 내용</DocumentStrong>과 다음
                  대화에서 물어볼 부분
                </li>
                <li>
                  <DocumentStrong>이력서</DocumentStrong>와 지금까지의 진행 기록
                </li>
              </DocumentList>
              <p>
                회사 이름이나 기술 이름 하나보다{" "}
                <DocumentStrong>
                  어떤 문제를 맡았고 본인이 어디까지 책임졌는지
                </DocumentStrong>
                를 보세요. 분명하지 않은 내용은 사실로 단정하지 말고 확인할
                질문으로 남깁니다.
              </p>
            </DocumentTopic>

            <DocumentTopic title="결정 전에 더 확인하고 싶다면">
              <p>
                가능성은 있지만 정보가 부족하다면 Harper에게 질문이나 최신
                이력서 요청을 부탁하세요.
              </p>
              <DocumentCodeBlock label="요청 예시">
                {
                  "@Harper 이 후보자가 결제 장애 대응을 직접 주도했는지, 당시 맡은 범위를 물어봐줘.\n@Harper 최근 경력이 포함된 이력서를 받을 수 있는지 물어봐줘."
                }
              </DocumentCodeBlock>
              <DocumentCallout label="발송 전 확인">
                <p>
                  Harper가 후보자에게 보낼 문장을 먼저 보여줍니다. 회사가
                  확인하면 발송하고, 답변이 오면 요청했던 대화에서 알려줍니다.
                </p>
              </DocumentCallout>
            </DocumentTopic>

            <DocumentTopic title="결정이 쌓이지 않게 해주세요">
              <p>
                팀 안에서 검토할 사람과 최종 결정할 사람을 정하고, 알림이 오면
                의견을 모아주세요. 모든 역할의 대기 항목은{" "}
                <DocumentLink href={href.inbox}>Inbox</DocumentLink>에서 모아볼
                수 있습니다.
              </p>
              <DocumentCallout label="대기 후보자가 5명 이상이면">
                <p>
                  회사가 기존 후보자를 먼저 볼 수 있도록 새 연결이 잠시
                  멈춥니다. 수락하거나 거절해 대기 인원이 줄면 다시 이어집니다.
                </p>
              </DocumentCallout>
            </DocumentTopic>

            <DocumentAction href={href.inbox}>
              연결 대기 확인하기
            </DocumentAction>
          </DocumentSection>

          <DocumentSection
            id="accept-or-decline"
            introduction={
              <p>
                <DocumentStrong>연결하기</DocumentStrong>는 만나보고 싶을 때,
                <DocumentStrong> 연결받지 않기</DocumentStrong>는 이번 역할에서
                진행하지 않을 때 선택합니다.
              </p>
            }
            title="수락과 거절"
          >
            <DocumentTopic title="선택하기 전에">
              <DocumentList>
                <li>
                  <DocumentStrong>만나볼 근거.</DocumentStrong> 모든 조건을
                  완벽하게 충족하지 않아도 됩니다. 대화로 확인할 가치가 있는
                  강점이 있는지 봅니다.
                </li>
                <li>
                  <DocumentStrong>첫 담당자.</DocumentStrong> 소개 메일을 받을
                  사람이나 회사에서 직접 연락할 사람을 정합니다.
                </li>
                <li>
                  <DocumentStrong>수락 이유.</DocumentStrong> 선택 사항이며
                  후보자에게 그대로 전달되지 않습니다. 다음 추천에서 이어서 보고
                  싶은 강점을 짧게 남기면 됩니다.
                </li>
              </DocumentList>
            </DocumentTopic>

            <DocumentCallout label="후보자는 이미 동의했습니다">
              <p>
                연결 대기 후보자는 회사와 역할 설명을 듣고, 이 회사와 대화해도
                좋다고 답한 상태입니다. 수락한 뒤에는 다시 의사를 묻기보다 바로
                첫 연락을 시작하면 됩니다.
              </p>
            </DocumentCallout>

            <div className="grid gap-10 md:grid-cols-2 md:gap-8">
              <DocumentTopic title="연결하기 — 소개 메일을 보낼 때">
                <DocumentSteps>
                  <li>
                    <DocumentStrong>CC로 연결</DocumentStrong>을 선택합니다.
                  </li>
                  <li>
                    메일을 받을 회사 멤버를 고릅니다. 보이지 않는 사람은 먼저{" "}
                    <DocumentLink href={href.members}>멤버로 초대</DocumentLink>
                    합니다.
                  </li>
                  <li>
                    Harper가 후보자에게 메일을 보내고 선택한 멤버를 참조에
                    넣습니다.
                  </li>
                  <li>
                    회사 담당자가 전체 답장으로 인사하고 일정과 다음 순서를
                    안내합니다.
                  </li>
                </DocumentSteps>
              </DocumentTopic>

              <DocumentTopic title="연결하기 — 회사가 직접 연락할 때">
                <DocumentSteps>
                  <li>
                    <DocumentStrong>직접 연락</DocumentStrong>을 선택합니다.
                    Harper는 소개 메일을 보내지 않습니다.
                  </li>
                  <li>
                    후보자는 연결됨으로 이동하고, 첫 연락은 회사가 맡습니다.
                  </li>
                  <li>
                    담당자가 회사와 역할을 다시 짧게 소개하고 첫 대화나 인터뷰
                    일정을 잡습니다.
                  </li>
                  <li>
                    수락만 해두고 연락이 늦어지지 않도록 담당자와 보낼 시점을
                    미리 정합니다.
                  </li>
                </DocumentSteps>
              </DocumentTopic>
            </div>

            <DocumentCallout label="두 방식의 차이">
              <p>
                <DocumentStrong>CC로 연결</DocumentStrong>하면 Harper가 소개
                메일을 보냅니다. <DocumentStrong>직접 연락</DocumentStrong>을
                선택하면 소개 메일 없이 회사가 첫 연락을 전부 맡습니다.
              </p>
            </DocumentCallout>

            <DocumentTopic title="연결받지 않기">
              <DocumentList>
                <li>이번 역할에서 후보자 검토가 끝납니다.</li>
                <li>
                  소개 메일은 발송되지 않고 회사가 따로 연락할 필요도 없습니다.
                </li>
                <li>
                  Harper가 후보자에게 이번 연결이 진행되지 않는다고 안내합니다.
                </li>
              </DocumentList>
              <DocumentCallout label="거절 이유">
                <p>
                  거절 이유는 선택 사항이며 후보자에게 그대로 보내지지 않습니다.
                  <DocumentStrong> “경험 범위가 좁음”</DocumentStrong>,
                  <DocumentStrong>
                    {" "}
                    “이번에는 결제 경험을 우선함”
                  </DocumentStrong>
                  처럼 실제 판단 기준만 남겨주세요.
                </p>
              </DocumentCallout>
            </DocumentTopic>

            <DocumentTopic title="연결한 뒤 진행을 끝낼 때">
              <DocumentSteps>
                <li>후보자의 진행을 종료하면 Harper가 종료 안내를 보냅니다.</li>
                <li>
                  이미 발송된 소개 메일이나 회사가 보낸 연락은 없어지지
                  않습니다.
                </li>
                <li>
                  대화 중이거나 일정이 잡혔다면 회사 담당자도 후보자에게 직접
                  알려야 합니다.
                </li>
                <li>Pipeline을 최종 결과에 맞게 옮겨 마무리합니다.</li>
              </DocumentSteps>
            </DocumentTopic>

            <DocumentAction href={href.inbox}>후보자 검토하기</DocumentAction>
          </DocumentSection>

          <DocumentSection
            id="ask-harper"
            introduction={
              <p>
                명령어를 외울 필요는 없습니다.{" "}
                <DocumentStrong>
                  누구에 관한 부탁인지, 무엇을 원하는지, 왜 필요한지
                </DocumentStrong>
                를 평소 동료에게 말하듯 적어주세요.
              </p>
            }
            title="Harper에게 부탁하기"
          >
            <DocumentTopic title="부탁을 분명하게 쓰는 법">
              <DocumentList>
                <li>
                  <DocumentStrong>대상.</DocumentStrong> 여러 역할을 보는
                  Slack이라면 역할 이름을, 후보자에 관한 부탁이라면 후보자
                  이름을 적습니다.
                </li>
                <li>
                  <DocumentStrong>원하는 결과.</DocumentStrong> 요약, 비교, 추천
                  근거, 인터뷰 질문 중 무엇이 필요한지 말합니다.
                </li>
                <li>
                  <DocumentStrong>확인할 점.</DocumentStrong> 모르는 내용은
                  채우지 말고 따로 나눠달라고 요청할 수 있습니다.
                </li>
              </DocumentList>
            </DocumentTopic>

            <DocumentTopic title="후보자를 이해할 때">
              <p>
                긴 프로필은 역할의 핵심 기준에 맞춰 요약하거나, 같은 기준으로
                여러 후보자를 비교해 달라고 하세요.
              </p>
              <DocumentCodeBlock label="질문 예시">
                {
                  "@Harper 이 후보자를 추천한 이유를 경력 근거와 함께 정리해줘.\n@Harper 연결 대기 세 명의 강점과 확인할 점을 비교해줘.\n@Harper 첫 인터뷰에서 물어볼 질문을 만들어줘."
                }
              </DocumentCodeBlock>
            </DocumentTopic>

            <DocumentTopic title="역할 기준을 바꿀 때">
              <p>
                새 기준과 기존 기준의 차이를 말해 주세요. 더 중요해진 조건뿐
                아니라 더 이상 필수가 아닌 조건도 함께 알려주면 됩니다.
              </p>
              <DocumentCodeBlock label="요청 예시">
                {
                  "@Harper React보다 복잡한 상태 설계 경험을 더 중요하게 봐줘.\n@Harper 이 역할은 잠시 중단해줘.\n@Harper 근무 조건을 서울 주 2회 출근으로 바꿔줘."
                }
              </DocumentCodeBlock>
              <p>
                회사 소개처럼 모든 역할에 공통으로 쓰이는 내용은{" "}
                <DocumentLink href={href.company}>회사 정보</DocumentLink>에서
                바꾸고, 특정 역할의 업무나 조건은 역할 대화에서 바꿔주세요.
                역할을 중단하면 새 추천만 멈추고 이미 검토 중인 후보자는 그대로
                남습니다. 채용이 끝났다면 역할을 종료해 주세요.
              </p>
            </DocumentTopic>

            <DocumentTopic title="후보자에게 질문하거나 이력서를 요청할 때">
              <p>
                회사가 결정하기 전에 꼭 알아야 할 내용을 구체적으로 적거나 최신
                이력서를 요청하세요.
              </p>
              <DocumentCodeBlock label="요청 예시">
                {
                  "@Harper 이 후보자에게 대규모 트래픽을 직접 운영한 범위를 물어봐줘.\n@Harper 최신 이력서를 요청해줘."
                }
              </DocumentCodeBlock>
              <DocumentSteps>
                <li>Harper가 후보자에게 보낼 문장을 먼저 보여줍니다.</li>
                <li>내용을 확인하거나 필요한 부분을 고칩니다.</li>
                <li>
                  회사가 보내도 된다고 확인하면 이메일과 Harper 채팅으로
                  보냅니다.
                </li>
                <li>후보자가 답하면 요청을 시작한 대화에서 알려줍니다.</li>
              </DocumentSteps>
              <DocumentCallout label="답변이 오지 않을 때">
                <p>
                  답변은 후보자의 선택이며 Harper가 자동으로 재촉하지는
                  않습니다. 기다릴지, 가진 정보로 결정할지 회사가 정하면 됩니다.
                </p>
              </DocumentCallout>
            </DocumentTopic>
          </DocumentSection>

          <DocumentSection
            id="pipeline"
            introduction={
              <p>
                연결하기를 선택한 후보자는{" "}
                <DocumentStrong>Pipeline</DocumentStrong>
                에서 첫 대화부터 최종 결정까지 이어서 관리합니다.
              </p>
            }
            title="Pipeline"
          >
            <DocumentTopic title="Pipeline에 들어오는 시점">
              <DocumentCallout label="Inbox와 Pipeline의 차이">
                <p>
                  <DocumentStrong>Inbox</DocumentStrong>는 아직 회사의 결정을
                  기다리는 후보자를 보는 곳입니다.{" "}
                  <DocumentStrong>Pipeline</DocumentStrong>은 회사가 연결을
                  수락한 뒤의 채용 진행을 관리하는 곳입니다.
                </p>
              </DocumentCallout>
              <DocumentSteps>
                <li>연결 대기 후보자를 수락하면 연결됨 단계로 들어옵니다.</li>
                <li>소개 메일 또는 회사의 직접 연락으로 첫 일정을 잡습니다.</li>
                <li>
                  실제 대화가 시작되면 회사의 전형에 맞춰 다음 단계로 옮깁니다.
                </li>
              </DocumentSteps>
            </DocumentTopic>

            <DocumentTopic title="후보자 진행 상태 관리하기">
              <DocumentList>
                <li>
                  <DocumentStrong>단계 준비.</DocumentStrong> 전화 대화, 1차
                  인터뷰, 과제, 최종 인터뷰처럼 회사 전형에 맞게 구성합니다.
                </li>
                <li>
                  <DocumentStrong>단계 이동.</DocumentStrong> 인터뷰나 과제가
                  끝날 때마다 실제로 진행 중인 단계로 옮깁니다.
                </li>
                <li>
                  <DocumentStrong>메모.</DocumentStrong> 확인한 사실, 남은 질문,
                  다음 담당자와 해야 할 일을 함께 남깁니다.
                </li>
                <li>
                  <DocumentStrong>마무리.</DocumentStrong> 채용을 이어가지
                  않거나 최종 결정이 끝나면 결과에 맞게 종료합니다.
                </li>
              </DocumentList>
              <DocumentQuote label="좋은 메모 예시">
                <p>“결제 시스템 장애 대응 범위를 다음 인터뷰에서 확인”</p>
              </DocumentQuote>
            </DocumentTopic>

            <DocumentTopic title="여러 역할을 함께 볼 때">
              <p>
                <DocumentLink href={href.pipeline}>전체 Pipeline</DocumentLink>
                을 열면 모든 역할의 후보자를 한곳에서 볼 수 있습니다. 오래
                머물러 있는 후보자부터{" "}
                <DocumentStrong>다음 담당자와 예정된 일정</DocumentStrong>을
                정리하세요. 역할별로 좁혀볼 수도 있습니다.
              </p>
            </DocumentTopic>

            <DocumentAction href={href.pipeline}>Pipeline 열기</DocumentAction>
          </DocumentSection>

          <DocumentSection id="faq" title="자주 묻는 질문">
            <div className="divide-y divide-black/10 border-y border-black/10">
              {FAQ_ITEMS.map((item) => (
                <details className="group py-5" key={item.question}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-[15px] font-medium leading-7 text-black outline-none marker:hidden focus-visible:underline">
                    {item.question}
                    <ChevronDown className="size-4 shrink-0 text-black/40 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                  </summary>
                  <p className="mt-3 mr-8 border-l-2 border-black/20 bg-black/[0.025] px-4 py-3 text-[14px] font-normal leading-7 text-black/65">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>

            <div>
              <p className="text-[15px] font-normal leading-7 text-black/60">
                여기에서 해결되지 않았다면 프로필 메뉴의 문의하기를 열어주세요.
                보고 있던 역할이나 후보자 이름을 같이 남기면 더 빨리 확인할 수
                있습니다.
              </p>
              <MuteButton
                className="mt-5 border-black bg-black font-normal text-white hover:border-black/85 hover:bg-black/85 active:border-black/70 active:bg-black/70 focus-visible:ring-black/20 focus-visible:ring-offset-white"
                onClick={() => openCustomCrispWidget()}
                size="lg"
                variant="dark"
              >
                문의하기
                <ArrowRight className="size-4" />
              </MuteButton>
            </div>
          </DocumentSection>
        </article>
      </div>
    </div>
  );
}
