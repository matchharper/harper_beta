import React, { useState } from "react";
import AppLayout from "@/components/layout/app";
import InnerLayout from "@/components/layout/inner";
import { showToast } from "@/components/toast/toast";
import Textarea from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { Loader2 } from "lucide-react";
import { useMessages } from "@/i18n/useMessage";
import { notifyToSlack } from "@/lib/slack";
import { BareButton } from "@/components/ui/button";

const Help = () => {
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { m, locale } = useMessages();

  const { companyUser } = useCompanyUserStore();

  const handleContactUs = () => {
    navigator.clipboard.writeText("chris@matchharper.com");
    showToast({
      message: m.help.emailCopied,
    });
  };

  const handleSubmit = async () => {
    setIsLoading(true);

    await supabase.from("feedback").insert({
      content: feedback,
      user_id: companyUser?.user_id,
    });
    await notifyToSlack(`💬 *Feedback from user: ${companyUser?.name}* (${
      companyUser?.company ?? "회사 정보 없음"
    })

      • *Content*: ${feedback}
      • *Time(Standard Korea Time)*: ${new Date().toLocaleString("ko-KR")}`);
    showToast({
      message: m.help.submitted,
    });
    setFeedback("");
    setIsLoading(false);
  };

  const setLocaleCookie = (next: "ko" | "en") => {
    if (typeof document === "undefined") return;
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000`;
    window.location.reload();
  };

  return (
    <AppLayout initialCollapse={false}>
      <InnerLayout title="Help">
        <div className="flex flex-col items-start w-full justify-between min-h-[75vh]">
          <div className="flex flex-col items-start w-full justify-start mt-12 font-normal">
            <div className="mt-2">{m.help.intro}</div>
            <BareButton
              type="button"
              className="cursor-pointer underline"
              onClick={handleContactUs}
            >
              chris@matchharper.com
            </BareButton>
            <div className="text-neutral-primary mt-16 font-normal text-sm">
              {m.help.prompt}
            </div>
            <Textarea
              placeholder=""
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="mt-4 max-w-[770px] text-[15px] font-normal"
              rows={3}
            />
            <BareButton
              onClick={handleSubmit}
              disabled={isLoading}
              className="px-4 py-2 cursor-pointer mt-4 text-sm bg-black text-neutral-00 rounded-lg font-normal"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                m.help.submit
              )}
            </BareButton>
          </div>
          <div className="flex items-end justify-end w-full">
            <div className="flex items-center gap-3 text-sm text-neutral-muted">
              <BareButton
                onClick={() => setLocaleCookie("ko")}
                className={`transition hover:text-neutral-primary ${locale === "ko" ? "text-neutral-primary font-medium" : ""}`}
              >
                한국어
              </BareButton>
              <span className="text-neutral-soft">|</span>
              <BareButton
                onClick={() => setLocaleCookie("en")}
                className={`transition hover:text-neutral-primary ${locale === "en" ? "text-neutral-primary font-medium" : ""}`}
              >
                English
              </BareButton>
            </div>
          </div>
        </div>
      </InnerLayout>
    </AppLayout>
  );
};

export default Help;
