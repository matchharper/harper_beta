"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { unsubscribeCrmBroadcast } from "./actions";

const MESSAGES = {
  done: {
    ko: "앞으로 Harper 소식 메일을 보내지 않을게요. 추천 메일은 그대로 받아요. 설정 > 계정에서 다시 켤 수 있어요.",
    en: "You won’t get Harper update emails anymore. Recommendation emails will still arrive. You can turn updates back on in Settings > Account.",
  },
  invalid: {
    ko: "링크가 올바르지 않아요.",
    en: "This link is not valid.",
  },
  error: {
    ko: "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    en: "Something went wrong. Please try again later.",
  },
};

function Message({ en, ko }: { en: string; ko: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Text as="h1" variant="title" className="leading-6">
        {ko}
      </Text>
      <Text tone="muted" className="leading-6">
        {en}
      </Text>
    </div>
  );
}

export default function UnsubscribeForm({
  token,
  userId,
}: {
  token: string;
  userId: string;
}) {
  const [result, submit, pending] = useActionState(unsubscribeCrmBroadcast, null);
  if (result) return <Message {...MESSAGES[result]} />;
  return (
    <form action={submit} className="flex flex-col items-start gap-6">
      <input type="hidden" name="u" value={userId} />
      <input type="hidden" name="t" value={token} />
      <Message
        ko="Harper 소식 메일을 더 받지 않으시겠어요?"
        en="Stop receiving Harper update emails?"
      />
      <Button type="submit" variant="black" size="md" disabled={pending}>
        수신거부 · Unsubscribe
      </Button>
    </form>
  );
}
