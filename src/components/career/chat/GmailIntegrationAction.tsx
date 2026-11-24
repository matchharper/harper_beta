import { useState } from "react";
import Image from "next/image";
import { BadgeCheck } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { useOptionalCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import { useGmailIntegration } from "@/hooks/career/useGmailIntegration";
import { useCareerT } from "@/i18n/useCareerT";
import { PreviewUI } from "./elements/DocumentPreviewCards";

export function GmailIntegrationAction({ capability = "write" }: { capability?: "read" | "write" } = {}) {
  const context = useOptionalCareerChatPanelContext();
  const gmail = useGmailIntegration(context?.user?.id ?? null);
  const t = useCareerT();
  const [error, setError] = useState("");
  const connected = capability === "write" ? gmail.writeConnected : gmail.status === "active";
  return (
    <GmailIntegrationActionContent
      capability={capability}
      connected={connected}
      error={error}
      pending={gmail.pendingAction === "connect"}
      disabled={
        !context?.user || gmail.pendingAction === "connect" || connected
      }
      onConnect={() => {
        setError("");
        void gmail
          .connect({ capability, conversationId: context?.conversationId, source: "chat_card" })
          .catch(() =>
            setError(
              t(
                "career.profile.resume_links.gmail_connect_failed",
                "Gmail 연결을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요."
              )
            )
          );
      }}
    />
  );
}

export function GmailIntegrationActionContent({
  capability = "write",
  connected = false,
  error = "",
  disabled = false,
  pending = false,
  onConnect,
}: {
  capability?: "read" | "write";
  connected?: boolean;
  error?: string;
  disabled?: boolean;
  pending?: boolean;
  onConnect?: () => void;
}) {
  const t = useCareerT();
  return (
    <div className="my-3 w-[320px] max-w-full space-y-2">
      <PreviewUI
        icon={
          <Image src="/images/logos/gmail.svg" alt="" width={24} height={24} />
        }
        title="Gmail"
        description={capability === "read" ? t("career.integrations.gmail.chat_read_description", "연결하면 Harper가 커리어에 필요한 메일을 확인해요.") : t(
          "career.integrations.gmail.chat_description",
          "커리어에 필요한 메일을 확인하고, 요청하신 메일을 대신 작성하거나 보낼 수 있어요."
        )}
        wrapDescription
        trailing={
          connected ? (
            <span
              role="img"
              aria-label={t(
                "career.profile.resume_links.gmail_connected",
                "연결됨"
              )}
            >
              <BadgeCheck
                aria-hidden="true"
                className="size-5 fill-action text-action [&>path:last-child]:fill-none [&>path:last-child]:stroke-white"
              />
            </span>
          ) : (
            <MuteButton
              type="button"
              size="sm"
              variant="dark"
              disabled={disabled || pending}
              aria-busy={pending}
              onClick={onConnect}
            >
              {t("career.integrations.gmail.chat_connect", "연결")}
            </MuteButton>
          )
        }
      />
      {error ? (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}
