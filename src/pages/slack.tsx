import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import DocumentPageShell from "@/components/landing/DocumentPageShell";
import { MuteButton } from "@/components/ui/button";
import { normalizeLocale } from "@/i18n/localeResolution";

type Props = { locale: "en" | "ko" };

export const getServerSideProps: GetServerSideProps<Props> = async ({
  query,
}) => ({
  props: {
    // Marketplace links default to English; a language choice stays explicit.
    locale:
      normalizeLocale(Array.isArray(query.lang) ? query.lang[0] : query.lang) ??
      "en",
  },
});

export default function SlackPage({ locale }: Props) {
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const sections = [
    {
      id: "install",
      title: c("Slack 연결하기", "Connect Harper to Slack"),
      intro: c(
        "Harper 회사 계정과 회사 Workspace가 필요해요. 연동을 관리할 권한이 있는 팀원이 연결하며, Slack의 설치 정책에 따라 관리자 승인이 필요할 수 있어요.",
        "You need a Harper company account and company Workspace. A team member with integration management permission connects Slack. Your Slack administrator may also need to approve the installation."
      ),
      steps: [
        c(
          "Harper에 회사 이메일로 로그인하고 회사 Workspace를 열어요. 처음이라면 회사 등록을 완료해 주세요.",
          "Sign in to Harper with your work email and open your company Workspace. Complete company onboarding if this is your first visit."
        ),
        c(
          "Organization → Integrations에서 Slack 연결을 선택해요. 연결할 Slack 워크스페이스와 요청 권한을 확인한 뒤 허용해 주세요.",
          "In Organization → Integrations, choose Connect Slack. Check the Slack workspace and requested permissions, then authorize the connection."
        ),
        c(
          "Harper로 돌아오면 연결 상태를 확인하고 채용에 참여하는 팀원이 있는 채널을 선택해요. 비공개 채널은 먼저 /invite @Harper로 Harper를 초대해 주세요.",
          "Back in Harper, check the connected status and select a channel for the team members involved in hiring. For a private channel, first invite Harper with /invite @Harper."
        ),
        c(
          "채널에서 @Harper를 멘션해 첫 대화를 시작해요. Role별로 사용할 채널과 담당자도 확인해 주세요.",
          "Mention @Harper in the channel to start a conversation. Check the channel and contact person assigned to each Role."
        ),
      ],
    },
    {
      id: "use",
      title: c("채널에서 함께 채용하기", "Work on hiring in your channel"),
      intro: c(
        "새 요청은 @Harper를 멘션하고, 이어지는 이야기는 같은 스레드에서 나눠요. 후보 소개의 스레드에서 답하면 해당 후보자와 Role 맥락을 이어갈 수 있어요.",
        "Mention @Harper for a new request, then continue in the same thread. Reply under a candidate introduction to keep that candidate and Role in context."
      ),
      items: [
        c(
          "Role에 필요한 경험과 채용 배경을 설명하고 채용 기준을 정리해요.",
          "Describe the experience a Role needs and the reasons you are hiring."
        ),
        c(
          "후보자 정보를 검토하고, 제공되는 동작으로 Intro를 요청하거나 연결 여부를 결정해요.",
          "Review candidate information and use the available actions to request an Intro or decide whether to connect."
        ),
        c(
          "회사에 허용된 범위에서 후보자에게 질문을 전달하거나 연결 진행 상황을 확인해요.",
          "Ask Harper to relay a question within your company’s permitted contact scope or check the progress of a connection."
        ),
      ],
      note: c(
        "연결 제안할 후보는 아직 회사에 대한 관심이 확인된 상태가 아니에요. 연결 수락할 후보는 후보자가 Role을 수락하고 회사 결정을 기다리는 상태예요. 실제 화면의 상태를 확인해 주세요.",
        "Suggested candidates have not necessarily expressed interest in your company. Ready to connect means the candidate has accepted the Role and is waiting for the company’s decision. Check the status shown on each candidate."
      ),
    },
    {
      id: "access",
      title: c("공유 범위와 권한", "Access and visibility"),
      intro: c(
        "후보자 정보와 Harper의 답변은 선택한 Slack 채널에 표시될 수 있어요. 채용에 참여하는 팀원만 있는 채널을 선택하고, 채널 참여 권한을 주기적으로 확인해 주세요.",
        "Candidate information and Harper’s replies may appear in the Slack channel you select. Choose a channel limited to team members involved in hiring and review its membership regularly."
      ),
      items: [
        c(
          "채널에 참여하는 것만으로 Harper 회사 계정의 수정 권한이 생기지는 않아요. 후보자 상세 보기와 결정은 연결된 회사 계정의 권한 확인을 거쳐요.",
          "Joining a Slack channel does not grant edit access to a Harper company Workspace. Candidate detail views and decisions are checked against the linked company account’s permissions."
        ),
        c(
          "앱은 멘션과 관련 스레드, 채널 정보, 사용자 식별 정보, 공유한 파일과 지원하는 Harper 링크를 기능 제공에 필요한 범위에서 처리해요. 설치 화면에서 요청 권한을 확인할 수 있어요.",
          "Harper processes mentions and relevant threads, channel information, user identifiers, shared files and supported Harper links as needed for the integration. Review the requested permissions on the installation screen."
        ),
        c(
          "AI 답변·요약·추천에는 오류나 누락이 있을 수 있어요. 중요한 정보를 확인하고 인터뷰와 채용 결정은 팀원이 직접 내려 주세요.",
          "AI responses, summaries and recommendations can contain errors or omissions. Verify important information; your team is responsible for interviews and hiring decisions."
        ),
      ],
    },
    {
      id: "data",
      title: c("Slack 데이터 처리", "How Slack data is handled"),
      intro: c(
        "Harper는 연결된 채널에서의 멘션과 관련 스레드를 바탕으로 답변해요. 관련 대화와 첨부 파일에서 읽은 내용은 회사의 Harper 대화 기록에 저장될 수 있으며, 답변을 만드는 데 필요한 내용은 AI 처리 서비스로 전달될 수 있어요.",
        "Harper responds using mentions and relevant threads in connected channels. Relevant conversations and content extracted from attachments may be stored in your company’s Harper conversation records. Content needed to generate a response may be sent to AI processing services."
      ),
      items: [
        c(
          "워크스페이스·채널 식별 정보는 연결을 유지하고 올바른 대화에 답변하는 데 사용해요. Slack 사용자 정보와 이메일은 회사 계정 및 접근 권한을 확인하는 데 사용해요.",
          "Workspace and channel identifiers maintain the connection and route replies. Slack user information and email addresses help match company accounts and check access."
        ),
        c(
          "채용에 필요한 내용만 공유해 주세요. 주민등록번호, 금융 계정 정보, 건강 정보처럼 채용 대화에 불필요한 민감한 정보는 입력하거나 파일에 포함하지 마세요.",
          "Share only information needed for hiring. Do not include government identification numbers, financial account details, health information or other sensitive information that is unnecessary for the recruiting conversation."
        ),
        c(
          "Slack 연결 해제와 개인정보 삭제는 별개예요. 데이터의 열람·정정·이동·삭제를 요청하려면 아래 지원 연락처로 문의해 주세요.",
          "Disconnecting Slack and deleting personal data are separate actions. Contact support below to request access to, correction of, transfer of or deletion of your personal data."
        ),
      ],
    },
    {
      id: "disconnect",
      title: c("알림 설정과 연결 해제", "Notifications and disconnection"),
      intro: c(
        "Harper의 Integrations에서 연결 채널을 관리하거나 회사 Workspace의 Slack 연결을 해제할 수 있어요. Slack 전체에서 앱을 제거하려면 Slack의 앱 관리에서 Harper를 제거해 주세요.",
        "Manage connected channels or disconnect your company Workspace in Harper’s Integrations. To remove the app from the entire Slack workspace, uninstall Harper in Slack’s app management settings."
      ),
      note: c(
        "연결 해제나 앱 제거만으로 이미 저장된 Harper 대화와 회사 기록이 모두 삭제되지는 않아요. 개인정보 열람·이동·삭제 요청은 아래 연락처로 보내 주세요.",
        "Disconnecting or uninstalling does not automatically erase existing Harper conversations and company records. Contact us below to request access to, transfer of, or deletion of your personal data."
      ),
    },
  ];
  const faqs = [
    [
      c(
        "연결할 수 없거나 관리자 승인이 필요해요",
        "Installation needs approval or fails"
      ),
      c(
        "회사 Workspace의 연동 관리 권한과 Slack의 앱 설치 정책을 확인해 주세요. 취소했거나 연결 요청이 만료됐다면 Harper의 Integrations에서 다시 시작해 주세요.",
        "Check your Harper integration management permission and Slack’s app installation policy. If you cancelled or the connection request expired, start again from Harper’s Integrations."
      ),
    ],
    [
      c("비공개 채널이 목록에 없어요", "My private channel is missing"),
      c(
        "해당 채널에서 /invite @Harper로 초대한 뒤 Harper의 채널 목록을 다시 열어 주세요.",
        "Invite Harper to that channel with /invite @Harper, then reopen the channel list in Harper."
      ),
    ],
    [
      c("Harper가 답하지 않아요", "Harper is not responding"),
      c(
        "Harper가 채널에 참여하고 있고, 그 채널이 Harper의 Integrations에 연결되어 있는지 확인해 주세요. 새 요청은 @Harper를 멘션해 주세요. 현재 대화는 연결된 채널과 관련 스레드에서 이용할 수 있어요.",
        "Check that Harper has joined the channel and that the channel is connected in Harper’s Integrations. Start a new request with @Harper. Recruiting conversations are available in connected channels and their relevant threads."
      ),
    ],
    [
      c(
        "후보자 상세 보기나 결정을 할 수 없어요",
        "I cannot view or act on a candidate"
      ),
      c(
        "Slack 계정의 이메일과 Harper 회사 계정, 해당 Workspace의 접근 권한을 확인해 주세요. 화면에서 재연결을 안내한다면 연동을 관리하는 팀원에게 요청해 주세요.",
        "Check your Slack email, Harper company account and Workspace permissions. If Harper asks you to reconnect Slack, ask the team member who manages the integration."
      ),
    ],
  ];
  return (
    <DocumentPageShell
      audience="company"
      title={c("Slack에서 Harper와 채용하기", "Harper for Slack")}
      description={c(
        "채용 기준부터 후보자 검토와 연결까지, 팀원과 나누는 대화를 Slack에서 이어가세요.",
        "Discuss hiring needs, review candidates and coordinate introductions with your team in Slack."
      )}
      locale={locale}
      contentWidth="reading"
    >
      <Head>
        <link
          rel="canonical"
          href={`https://matchharper.com/slack?lang=${locale}`}
        />
        <meta name="slack-app-id" content="A0BLPDCB4LU" />
      </Head>
      <nav
        aria-label={c("페이지 안내", "On this page")}
        className="mb-10 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm"
      >
        <Link
          href={`/slack?lang=${locale === "en" ? "ko" : "en"}`}
          hrefLang={locale === "en" ? "ko" : "en"}
          className="text-link underline underline-offset-4"
        >
          {locale === "en" ? "한국어" : "English"}
        </Link>
        <a href="#install" className="text-link">
          {c("설치", "Installation")}
        </a>
        <a href="#support" className="text-link">
          {c("지원", "Support")}
        </a>
        <a href="#data" className="text-link">
          {c("데이터 처리", "Data handling")}
        </a>
        <a href={`/privacy?lang=${locale}`} className="text-link">
          {c("개인정보 처리방침", "Privacy policy")}
        </a>
      </nav>
      <div className="mb-12 flex flex-wrap items-center gap-4">
        <MuteButton asChild variant="primary" size="lg">
          <Link href={`/org?lang=${locale}`}>
            {c("Harper Workspace 열기", "Open Harper Workspace")}
          </Link>
        </MuteButton>
        <Link
          href={`/pricing?lang=${locale}`}
          className="text-sm text-link underline underline-offset-4"
        >
          {c("요금제 보기", "View pricing")}
        </Link>
      </div>
      <div className="space-y-12">
        {sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="scroll-mt-8 border-t border-neutral-1000-a05 pt-8"
          >
            <h2 className="text-xl font-medium text-neutral-primary">
              {section.title}
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-neutral-muted">
              {section.intro}
            </p>
            {section.steps && (
              <ol className="mt-5 list-decimal space-y-3 pl-6 text-[15px] leading-7 text-neutral-muted">
                {section.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
            {section.items && (
              <ul className="mt-5 list-disc space-y-3 pl-6 text-[15px] leading-7 text-neutral-muted">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {section.note && (
              <p className="mt-5 rounded-lg bg-bg-weak p-4 text-sm leading-7 text-neutral-muted">
                {section.note}
              </p>
            )}
          </section>
        ))}
        <section
          id="support"
          className="scroll-mt-8 border-t border-neutral-1000-a05 pt-8"
        >
          <h2 className="text-xl font-medium">
            {c("도움이 필요하신가요?", "Get help")}
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-neutral-muted">
            {c(
              "가입이나 로그인 없이 chris@matchharper.com으로 문의할 수 있어요. 설치 문제, 기능 문의, 개인정보 요청을 보내 주세요.",
              "Email chris@matchharper.com for installation help, product questions or privacy requests. You do not need to sign up or sign in to contact us."
            )}
          </p>
          <div className="mt-5">
            <MuteButton asChild size="lg">
              <a href="mailto:chris@matchharper.com?subject=Harper%20for%20Slack%20support">
                {c("이메일로 문의", "Email support")}
              </a>
            </MuteButton>
          </div>
          <p className="mt-4 text-sm leading-7 text-neutral-muted">
            {c(
              "문제 발생 시각과 사용한 기능, 오류 내용을 알려 주시면 도움이 돼요. 비밀번호, 인증 토큰, 이력서 원문 등 불필요한 개인정보는 보내지 마세요.",
              "Include when the issue occurred, the feature you used and the error message. Do not send passwords, authorization tokens, full resumes or unnecessary personal data."
            )}
          </p>
          <div className="mt-7 space-y-6">
            {faqs.map(([question, answer]) => (
              <div key={question}>
                <h3 className="text-base font-medium">{question}</h3>
                <p className="mt-2 text-[15px] leading-7 text-neutral-muted">
                  {answer}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DocumentPageShell>
  );
}
