import { cx, opsTheme } from "@/components/ops/theme";
import type { NetworkLeadMessage } from "@/lib/opsNetwork";
import { ChevronLeft, LoaderCircle, MessageSquareText } from "lucide-react";
import { MessageHistoryCard, StructuredSection } from "./shared";
import { BareButton } from "@/components/ui/button";

type MessagesViewProps = {
  error: string | null;
  hasOlderMessages: boolean;
  isLoading: boolean;
  loadingOlderMessages: boolean;
  messages: NetworkLeadMessage[];
  onLoadOlderMessages: () => void;
};

export default function MessagesView({
  error,
  hasOlderMessages,
  isLoading,
  loadingOlderMessages,
  messages,
  onLoadOlderMessages,
}: MessagesViewProps) {
  return (
    <div className="space-y-4">
      {error ? <div className={opsTheme.errorNotice}>{error}</div> : null}

      <StructuredSection icon={MessageSquareText} title="Harper 대화 내역">
        {isLoading && messages.length === 0 ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-neutral-muted">
            아직 불러올 대화 내역이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {hasOlderMessages ? (
              <div className="flex justify-center">
                <BareButton
                  type="button"
                  onClick={onLoadOlderMessages}
                  disabled={loadingOlderMessages}
                  className={cx(opsTheme.buttonSecondary, "h-10 px-4")}
                >
                  {loadingOlderMessages ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <ChevronLeft className="h-4 w-4" />
                  )}
                  이전 20개 더 불러오기
                </BareButton>
              </div>
            ) : null}

            {messages.map((message) => (
              <MessageHistoryCard key={message.id} message={message} />
            ))}
          </div>
        )}
      </StructuredSection>
    </div>
  );
}
