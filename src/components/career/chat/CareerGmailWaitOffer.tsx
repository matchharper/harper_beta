import { useEffect, useState } from "react";
import { useOptionalCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import { useGmailIntegration } from "@/hooks/career/useGmailIntegration";
import { useCareerT } from "@/i18n/useCareerT";
import { GmailIntegrationAction } from "./GmailIntegrationAction";
import { claimGmailWaitOffer, readGmailWaitOffer } from "./gmailWaitOfferClaim";

/** Offers Gmail while Harper reads an application form, before the review arrives. */
export function CareerGmailWaitOffer({ replyId, active }: { replyId: string; active: boolean }) {
  const t = useCareerT();
  const user = useOptionalCareerChatPanelContext()?.user ?? null;
  const gmail = useGmailIntegration(user?.id ?? null);
  // Only a mailbox Gmail can read: gmail.com, a Google-hosted company domain, or a past connection.
  const eligible = gmail.canConnectMailbox;
  // A reply that already owns the offer keeps it without a blank frame when its part moves.
  const [shown, setShown] = useState(() => Boolean(eligible && user && readGmailWaitOffer(user.id)?.replyId === replyId));
  useEffect(() => {
    if (shown || !eligible || !user) return;
    // A connected account is offered nothing; a claimed reply keeps its card to show "연결됨".
    const owned = readGmailWaitOffer(user.id)?.replyId === replyId;
    if (gmail.writeConnected && !owned) return;
    if (claimGmailWaitOffer({ userId: user.id, replyId, active, now: Date.now() })) setShown(true);
  }, [active, eligible, gmail.writeConnected, replyId, shown, user]);
  if (!shown) return null;
  // A past connection without the Gmail option ticked says which option to tick this time.
  return (
    <GmailIntegrationAction
      description={gmail.status === "permissions_required"
        ? t("career.integrations.gmail.wait_offer_permission_missing", "지난 연결에서 Gmail 접근 항목이 빠졌어요. 다음 Google 화면에서 이 항목을 선택해 주세요.")
        : t("career.integrations.gmail.wait_offer_description", "기다리는 동안 연결해 두면 인증 코드와 회사 답장을 Harper가 챙겨요.")}
    />
  );
}
