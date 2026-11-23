import Head from "next/head";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useMessages } from "@/i18n/useMessage";
import { openCustomCrispWidget } from "@/lib/feedback/customCrispEvents";

const CONTACT_EMAIL = "chris@matchharper.com";

const COPY = {
  ko: {
    title: "계정 이용이 제한되었어요",
    body: "비정상적인 이용이 감지되어 이 계정의 이용을 제한했어요. 재검토를 원하시면 아래 버튼으로 문의해 주세요.",
    request: "재검토 요청하기",
    emailPrefix: "메일로 문의하실 때는",
    emailSuffix: "로 보내 주세요.",
  },
  en: {
    title: "Your account has been restricted",
    body: "We detected unusual activity and restricted this account. If you'd like us to review this decision, contact us below.",
    request: "Request a review",
    emailPrefix: "You can also email us at",
    emailSuffix: ".",
  },
};

function AccountRestrictedContent() {
  const { locale } = useMessages();
  const copy = COPY[locale];

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-basement px-6 text-neutral-primary">
      <div className="flex max-w-[420px] flex-col items-center gap-4 text-center">
        <Text as="h1" variant="head1">
          {copy.title}
        </Text>
        <Text tone="muted">{copy.body}</Text>
        <Button
          variant="primary"
          size="lg"
          className="mt-2"
          onClick={openCustomCrispWidget}
        >
          {copy.request}
        </Button>
        <Text variant="caption" tone="muted">
          {copy.emailPrefix}{" "}
          <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          {copy.emailSuffix}
        </Text>
      </div>
    </main>
  );
}

// _app mounts the Crisp widget and the messages provider on this page.
export default function AccountRestrictedPage() {
  return (
    <>
      <Head>
        <title>Harper</title>
        <meta name="robots" content="noindex" />
      </Head>
      <AccountRestrictedContent />
    </>
  );
}
