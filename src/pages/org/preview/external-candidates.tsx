import Head from "next/head";
import { useState } from "react";
import { MuteButton } from "@/components/ui/button";
import { OrgExternalCandidatesView } from "@/components/org/OrgExternalCandidates";
import { OrgLocaleScope } from "@/i18n/org/OrgLocaleProvider";
import type { OrgLocale } from "@/i18n/org/locale";
import {
  externalCandidatesForCompany,
  type ExternalCandidateRow,
  type ExternalCandidatesResponse,
} from "@/lib/org/agent/externalSourcing";
import { renderExternalConnectEmail, renderExternalConnectLinkReply, renderExternalInvite } from "@/lib/org/agent/externalInvite";
import { renderEmailBodyHtml } from "@/lib/email/bodyFormat";
import { wrapEmailHtml } from "@/lib/email/runtime/format";

// Local-only playground for the Role's "외부 후보" tab and the invitation email.
// Fictional people and companies; no API, database or email is touched. 404 in production.

const ROLE_ID = "00000000-0000-4000-8000-0000000000a1";
const CRITERIA = ["TypeScript 제품 개발", "LLM 에이전트 설계", "고객 문제 정의·해결", "실서비스 배포·운영", "데이터 파이프라인", "작은 팀 리딩"];

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function verdict(levels: string[], reason: string, quotes: Record<number, string> = {}) {
  return {
    overall: "meet", fit: 0.8, reason,
    criteria: CRITERIA.map((name, index) => ({ name, level: levels[index], quote: quotes[index] ?? "" })),
  };
}

const ROWS: (ExternalCandidateRow & { created_at: string })[] = [
  {
    id: "00000000-0000-4000-8000-0000000000c1", name: "김서연", headline: "Founding Engineer at Lumen Labs",
    current_company: "Lumen Labs", location: "Seoul, South Korea", linkedin_url: "https://www.linkedin.com/in/example-seoyeon-kim",
    career_lines: [
      "경력: Founding Engineer · Lumen Labs · 2023-04 ~ 현재 (2년 7개월)",
      "경력: Software Engineer · Nova Commerce · 2020-03 ~ 2023-03 (3년 1개월)",
      "경력: Intern · Pine Studio · 2019-07 ~ 2019-12 (6개월)",
      "학력: BS · 한빛대학교 · 2015~2020",
    ],
    evidence: [
      { criterion: "LLM 에이전트 설계", url: "https://blog.example.com/agent-retries", quote: "" },
      { criterion: "실서비스 배포·운영", url: "https://github.com/example/lumen-deploy", quote: "" },
    ],
    verdict: verdict(["excellent", "excellent", "good", "good", "uncertain", "good"],
      "TypeScript로 B2B 제품을 처음부터 만들었고, 고객사에 LLM 에이전트를 직접 배포·운영한 공개 기록이 있어요.",
      { 0: "Built the customer console in TypeScript and Next.js from day one.", 1: "Designed the tool-calling agent that handles 40k tickets a month." }),
    rank: 1, company_decision: "intro_requested", created_at: daysAgo(2),
    contact: { status: "found", email_kind: "work", source_kind: "self_published", finished_at: daysAgo(2) },
    intro: { status: "invited", created_at: daysAgo(2), invited_at: daysAgo(2), opened_at: daysAgo(1) },
  },
  {
    id: "00000000-0000-4000-8000-0000000000c2", name: "Ethan Park", headline: "Senior ML Engineer at Orbit Health",
    current_company: "Orbit Health", location: "Seongnam, Gyeonggi, South Korea", linkedin_url: "https://www.linkedin.com/in/example-ethan-park",
    career_lines: [
      "경력: Senior ML Engineer · Orbit Health · 2022-01 ~ 현재 (3년 10개월)",
      "경력: ML Engineer · Atlas Mobility · 2018-08 ~ 2021-12 (3년 5개월)",
      "학력: MS · 한결과학기술원 · 2016~2018",
    ],
    evidence: [{ criterion: "데이터 파이프라인", url: "https://talks.example.org/streaming-features", quote: "" }],
    verdict: verdict(["good", "good", "uncertain", "excellent", "excellent", "limited"],
      "대규모 데이터 파이프라인과 모델 서빙 경험이 뚜렷해요. 고객과 직접 일한 기록은 공개 자료에서 확인되지 않았어요.",
      { 3: "Moved model serving to a canary rollout with automatic rollback.", 4: "Owns the streaming feature store used by 12 teams." }),
    rank: 2, company_decision: null, created_at: daysAgo(2),
    contact: { status: "found", email_kind: "work", source_kind: "self_published", finished_at: daysAgo(2) },
    intro: null,
  },
  {
    id: "00000000-0000-4000-8000-0000000000c3", name: "이준호", headline: "Product Engineer",
    current_company: "Fieldnote", location: "Seoul, South Korea", linkedin_url: "https://www.linkedin.com/in/example-junho-lee",
    career_lines: [
      "경력: Product Engineer · Fieldnote · 2021-06 ~ 현재 (4년 5개월)",
      "경력: Frontend Engineer · Brick & Co · 2019-01 ~ 2021-05 (2년 5개월)",
      "학력: - · 새솔대학교 · 2013~2019",
    ],
    evidence: [],
    verdict: verdict(["excellent", "uncertain", "excellent", "good", "limited", "uncertain"],
      "고객 인터뷰부터 출시까지 혼자 맡은 제품 사례가 여러 번 있어요. LLM 경험은 공개 자료로는 확인이 어려워요."),
    rank: 3, company_decision: null, created_at: daysAgo(2),
    contact: { status: "not_found", email_kind: null, source_kind: null, finished_at: daysAgo(1) },
    intro: null,
  },
  {
    id: "00000000-0000-4000-8000-0000000000c4", name: "박민지", headline: "Backend Engineer at Tidepool",
    current_company: "Tidepool", location: "Seoul, South Korea", linkedin_url: "https://www.linkedin.com/in/example-minji-park",
    career_lines: [
      "경력: Backend Engineer · Tidepool · 2022-09 ~ 현재 (3년 2개월)",
      "경력: Software Engineer · Cobalt Pay · 2019-02 ~ 2022-08 (3년 7개월)",
      "학력: BS · 누리대학교 · 2014~2019",
    ],
    evidence: [{ criterion: "실서비스 배포·운영", url: "https://engineering.example.net/zero-downtime", quote: "" }],
    verdict: verdict(["good", "limited", "good", "excellent", "good", "uncertain"],
      "결제 서비스를 무중단으로 옮긴 운영 경험이 뚜렷해요. LLM 관련 공개 기록은 적어요.",
      { 3: "Led the zero-downtime migration of the payments ledger." }),
    rank: 4, company_decision: "intro_requested", created_at: daysAgo(2),
    contact: { status: "found", email_kind: "work", source_kind: "self_published", finished_at: daysAgo(2) },
    intro: { status: "connected", created_at: daysAgo(1), invited_at: daysAgo(1), accepted_at: daysAgo(0), connected_at: daysAgo(0) },
  },
];

type Scene = "results" | "searching" | "empty" | "failed";
type EmailPreview = { key: string; title: string; subject: string; to: string; cc?: string; replyTo: string; html: string };

export default function ExternalCandidatesPlayground({ candidates, emails }: {
  candidates: ExternalCandidatesResponse["candidates"]; emails: EmailPreview[];
}) {
  const [locale, setLocale] = useState<OrgLocale>("ko");
  // Local decisions only: Pass hides the person, Send Intro records a request in this page's state.
  const [people, setPeople] = useState(candidates);
  const [pending, setPending] = useState(false);
  const act = async (update: () => void) => {
    setPending(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    update();
    setPending(false);
  };
  const actions = {
    canManage: true,
    defaultEmail: "me@acme.example",
    members: [
      { email: "me@acme.example", name: "나", userId: "preview-me" },
      { email: "cto@acme.example", name: "CTO", userId: "preview-cto" },
    ],
    pending,
    pass: (candidateId: string) => act(() => setPeople((list) => list.filter((person) => person.id !== candidateId))),
    requestIntro: (candidateId: string) => act(() => setPeople((list) => list.map((person) => person.id === candidateId
      ? { ...person, companyDecision: "intro_requested",
          intro: { status: "requested", requestedAt: new Date().toISOString(), invitedAt: null, openedAt: null, replyType: null } }
      : person))),
  };
  const [scene, setScene] = useState<Scene>("results");
  const finished = { status: "succeeded", startedAt: daysAgo(2), finishedAt: daysAgo(2) };
  const data: ExternalCandidatesResponse = {
    enabled: true,
    search: scene === "searching" ? { status: "running", startedAt: daysAgo(0), finishedAt: null }
      : scene === "failed" ? { status: "failed", startedAt: daysAgo(0), finishedAt: daysAgo(0) } : finished,
    inviteSending: true,
    candidates: scene === "results" || scene === "failed" ? people : [],
  };
  const scenes: Array<[Scene, string]> = [["results", "후보 있음"], ["searching", "검색 중"], ["empty", "후보 없음"], ["failed", "마지막 검색 실패"]];
  return (
    <OrgLocaleScope locale={locale} setLocale={setLocale}>
      <Head>
        <title>Harper · 외부 후보 playground</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className="min-h-screen bg-bg-default px-5 py-6 text-neutral-primary sm:px-10">
        <div className="mx-auto max-w-[1040px]">
          <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg bg-bg-weak px-3 py-2 text-[13px]">
            <span className="mr-2 text-neutral-muted">로컬 playground · 가짜 데이터, 아무것도 저장·발송하지 않아요</span>
            {scenes.map(([value, label]) => (
              <MuteButton key={value} size="sm" variant={scene === value ? "selected" : "default"} onClick={() => setScene(value)}>
                {label}
              </MuteButton>
            ))}
            <MuteButton size="sm" variant="default" onClick={() => setLocale(locale === "ko" ? "en" : "ko")}>
              {locale === "ko" ? "English" : "한국어"}
            </MuteButton>
          </div>

          <OrgExternalCandidatesView data={data} roleId={ROLE_ID} actions={actions} />

          <section className="mt-16 border-t border-neutral-1000-a05 pt-8">
            <h2 className="text-[17px] font-medium">초대 메일 미리보기</h2>
            <p className="mt-1 text-[13px] text-neutral-muted">
              초대는 연결 요청이 확인되면 1통(ORG_EXTERNAL_INVITE_SENDING=on, 09~20시 KST). 하퍼 답장은 관심 답장에 1번, 소개 메일은 본인이 링크에서 연결을 확인하면 1통.
            </p>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {emails.map((email) => (
                <article key={email.key} className="min-w-0 rounded-lg border border-neutral-1000-a05 bg-bg-floating">
                  <header className="space-y-0.5 border-b border-neutral-1000-a05 px-4 py-3 text-[12px] text-neutral-muted">
                    <p className="text-[13px] font-medium text-neutral-primary">{email.title}</p>
                    <p>From: Harper &lt;harper@matchharper.com&gt; · To: {email.to}{email.cc ? ` · Cc: ${email.cc}` : ""}</p>
                    <p className="break-all">Reply-To: {email.replyTo}</p>
                    <p className="text-[14px] text-neutral-primary">{email.subject}</p>
                  </header>
                  <iframe className="h-[420px] w-full rounded-b-lg" sandbox="" srcDoc={email.html} title={email.title} />
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </OrgLocaleScope>
  );
}

export async function getServerSideProps() {
  if (process.env.NODE_ENV === "production") return { notFound: true };
  const appeal = "에이전트를 고객사에 직접 붙여 본 경험이 인상적이었어요. 저희 팀의 첫 프로덕트 엔지니어로 함께 제품 방향을 정하고 싶어요.";
  const unsubscribeUrl = "http://127.0.0.1:3100/api/email/external-unsubscribe?t=preview-token";
  const connectUrl = "http://127.0.0.1:3100/api/email/external-connect?t=preview-token";
  const variants = [
    { key: "ko", title: "한국어 · 회사명 공개", language: "ko" as const, personName: "김서연", companyName: "Acme", addressSource: "people-data.example" },
    { key: "ko-hidden", title: "한국어 · 회사명 비공개 Role · 이메일 출처 미확인", language: "ko" as const, personName: "이준호", companyName: null, addressSource: null },
    { key: "en", title: "English · 회사명 공개", language: "en" as const, personName: "Ethan Park", companyName: "Acme", addressSource: "people-data.example" },
    { key: "en-hidden", title: "English · 회사명 비공개 Role · 이메일 출처 미확인", language: "en" as const, personName: "Ethan Park", companyName: null, addressSource: null },
  ];
  const emails: EmailPreview[] = variants.map((variant) => {
    const { subject, body } = renderExternalInvite({ ...variant, roleName: "Product Engineer", companyAppeal: appeal, unsubscribeUrl, connectUrl });
    return { key: variant.key, title: variant.title, subject, to: "person@example.com",
      replyTo: "candidate+preview-token-000000@reply.matchharper.com", html: wrapEmailHtml(renderEmailBodyHtml(body)) };
  });
  const linkReply = renderExternalConnectLinkReply({ language: "ko", personName: "박민지", companyName: "Acme", connectUrl });
  emails.push({ key: "link-reply", title: "하퍼 답장 · 관심 답장에 1번 (연결 링크)", subject: "Re: Acme Product Engineer 포지션 관련해서 연락드려요",
    to: "person@example.com", replyTo: "candidate+preview-token-000000@reply.matchharper.com", html: wrapEmailHtml(renderEmailBodyHtml(linkReply)) });
  const company = { linkedinUrl: "https://www.linkedin.com/company/acme-example", homepageUrl: "https://acme.example",
    contactName: "이하늘", contactTitle: "Head of Talent" };
  for (const variant of [
    { key: "connect-ko", title: "소개 메일 · 한국어 (본인이 연결 확인 뒤)", language: "ko" as const, personName: "박민지", companyName: "Acme" },
    { key: "connect-en", title: "Introduction · English", language: "en" as const, personName: "Ethan Park", companyName: "Acme" },
  ]) {
    const { subject, body } = renderExternalConnectEmail({ ...variant, roleName: "Product Engineer", companyAppeal: appeal,
      linkedinUrl: "https://www.linkedin.com/in/example-minji-park", company });
    emails.push({ key: variant.key, title: variant.title, subject, to: "person@example.com", cc: "me@acme.example, cto@acme.example",
      replyTo: "person@example.com, me@acme.example, cto@acme.example", html: wrapEmailHtml(renderEmailBodyHtml(body)) });
  }
  return { props: { candidates: externalCandidatesForCompany(ROWS), emails } };
}
