import { useEffect, useState } from "react";
import { useOptionalCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useGmailIntegration } from "@/hooks/career/useGmailIntegration";
import { useCareerT } from "@/i18n/useCareerT";
import {
  assignGmailWaitOfferVariant,
  GMAIL_WAIT_OFFER_EXPERIMENT,
  GMAIL_WAIT_OFFER_EXPOSURE_EVENT,
} from "@/lib/career/gmailWaitOfferExperiment";
import { GmailIntegrationAction } from "./GmailIntegrationAction";
import { decideGmailWaitOffer, readGmailWaitOffer } from "./gmailWaitOfferClaim";

/** Offers Gmail while Harper reads an application form, before the review arrives. */
export function CareerGmailWaitOffer({ replyId, active }: { replyId: string; active: boolean }) {
  const t = useCareerT();
  const user = useOptionalCareerChatPanelContext()?.user ?? null;
  const gmail = useGmailIntegration(user?.id ?? null);
  const logCareerEvent = useCareerLogEvent();
  const variant = user ? assignGmailWaitOfferVariant(user.id) : null;
  // Only a mailbox Gmail can read: gmail.com, a Google-hosted company domain, or a past connection.
  const eligible = gmail.canConnectMailbox;
  // A reply that already owns the offer keeps it without a blank frame when its part moves.
  const [shown, setShown] = useState(() => Boolean(eligible && user && readGmailWaitOffer(user.id)?.replyId === replyId));
  useEffect(() => {
    if (shown || !eligible || !user) return;
    // A connected account is offered nothing; a claimed reply keeps its card to show "연결됨".
    const decision = decideGmailWaitOffer({ userId: user.id, replyId, active, now: Date.now(), writeConnected: gmail.writeConnected });
    if (!decision.show) return;
    // Both sides are recorded at the same moment, so the test compares the same kind of people.
    if (decision.record) logCareerEvent(GMAIL_WAIT_OFFER_EXPOSURE_EVENT, { experiment: GMAIL_WAIT_OFFER_EXPERIMENT, variant });
    setShown(true);
  }, [active, eligible, gmail.writeConnected, logCareerEvent, replyId, shown, user, variant]);
  // Side A is recorded and counted like B but sees no card.
  if (!shown || variant !== "card") return null;
  // A past connection without the Gmail option ticked says which option to tick this time.
  return (
    <GmailIntegrationAction
      description={gmail.status === "permissions_required"
        ? t("career.integrations.gmail.wait_offer_permission_missing", "지난 연결에서 Gmail 접근 항목이 빠졌어요. 다음 Google 화면에서 이 항목을 선택해 주세요.")
        : t("career.integrations.gmail.wait_offer_description", "기다리는 동안 연결해 두면 인증 코드와 회사 답장을 Harper가 챙겨요.")}
    />
  );
}
