import { useState } from "react";
import Image from "next/image";
import { BadgeCheck } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { useOptionalCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import { useGmailIntegration } from "@/hooks/career/useGmailIntegration";
import { useCareerT } from "@/i18n/useCareerT";
import { PreviewUI } from "./elements/DocumentPreviewCards";

export function GmailIntegrationAction() {
  const context = useOptionalCareerChatPanelContext();
  const gmail = useGmailIntegration(context?.user?.id ?? null);
  const t = useCareerT();
  const [error, setError] = useState("");
  const connected = gmail.writeConnected;
  return (
    <GmailIntegrationActionContent
      connected={connected}
      error={error}
      pending={gmail.pendingAction === "connect"}
      disabled={
        !context?.user || gmail.pendingAction === "connect" || connected
      }
      onConnect={() => {
        setError("");
        void gmail
          .connect({ capability: "write" })
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
  connected = false,
  error = "",
  disabled = false,
  pending = false,
  onConnect,
}: {
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
        description={t(
          "career.integrations.gmail.chat_description",
          "알아서 일정을 챙기고\n대신 메일도 보내요."
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
