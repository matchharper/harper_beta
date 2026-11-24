import { notFound } from "next/navigation";
import { careerEmailChoiceHref } from "@/lib/email/choiceLinks";
import { renderReplyEmail } from "@/lib/email/runtime/format";
import Preview, { type EmailChoicePreviewCase } from "./Preview";

export const metadata = {
  title: "Email choice buttons preview",
  robots: { index: false, follow: false },
};
// Re-render on every request so edits to the renderer show on reload and through Fast Refresh.
export const dynamic = "force-dynamic";

const REPLY_TO = "reply+preview0token0abc@reply.matchharper.com";

/** Markdown the way Harper writes it; the renderer and link builder are the ones used for real sends. */
const SAMPLES = [
  {
    key: "recommendation",
    label: "정기 추천 메일 (선택지 3개, 꼬리말 포함)",
    subject: "이번 주에 눈여겨볼 기회 2곳",
    footer: true,
    markdown: `호진님, 이번 주에 살펴본 기회 중 두 곳을 먼저 말씀드릴게요.

**Leaflet** — 데이터 플랫폼 팀 백엔드 엔지니어
- 지금 하시는 Kafka 기반 파이프라인 경험과 바로 맞닿아 있어요.
- 연봉 범위가 원하시는 수준보다 조금 높게 공개돼 있어요.

**Northwind** — ML 인프라 엔지니어
- 팀이 작아서 설계부터 맡으실 수 있어요.

어느 쪽부터 이야기를 나눠 볼까요?

[[CAREER_CHOICE_BUTTONS]]
{"choices":["Leaflet부터 자세히 보고 싶어요","Northwind가 더 궁금해요","이번 주는 괜찮아요"]}
[[/CAREER_CHOICE_BUTTONS]]

Harper 드림`,
  },
  {
    key: "reply",
    label: "이메일 답장 (선택지 2개, 꼬리말 없음)",
    subject: "Re: 소개 제안",
    footer: false,
    markdown: `네, 확인했어요. Leaflet 채용 담당자께 소개를 부탁드리기 전에 한 가지만 여쭤볼게요.

이력서는 지난달에 올리신 버전으로 보내 드려도 될까요?

[[CAREER_CHOICE_BUTTONS]]
{"choices":["네, 그 버전으로 보내 주세요","새로 고친 이력서를 올릴게요"]}
[[/CAREER_CHOICE_BUTTONS]]`,
  },
];

const RECIPIENTS = [
  { key: "gmail", label: "Gmail·Outlook·iCloud → 답장 창", address: "hojin@gmail.com" },
  { key: "naver", label: "네이버 등 → 웹 채팅", address: "hojin@naver.com" },
];

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  const cases: EmailChoicePreviewCase[] = SAMPLES.flatMap((sample) =>
    RECIPIENTS.map((recipient) => {
      const email = renderReplyEmail(sample.markdown, {
        footer: sample.footer,
        choiceHref: careerEmailChoiceHref({
          talentId: "00000000-0000-4000-8000-000000000000",
          recipient: recipient.address,
          replyTo: REPLY_TO,
          subject: sample.subject,
        }),
      });
      const hrefs = [...email.html.matchAll(/<a href="([^"]+)"[^>]*>([^<]*)<\/a>/g)]
        .filter((match) => match[1].startsWith("mailto:reply") || match[1].includes("emailReply="))
        .map((match) => ({ href: match[1].replace(/&amp;/g, "&"), label: match[2] }));
      return {
        key: `${sample.key}:${recipient.key}`,
        sample: sample.label,
        recipient: recipient.label,
        subject: sample.subject,
        html: email.html,
        text: email.text,
        hrefs,
      };
    })
  );
  return <Preview cases={cases} />;
}
