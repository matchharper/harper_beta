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

const Help = () => {
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { m } = useMessages();

  const { companyUser } = useCompanyUserStore();

  const handleContactUs = () => {
    navigator.clipboard.writeText("chris@asksonus.com");
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

  return (
    <AppLayout>
      <InnerLayout title="Help">
        <div className="flex flex-col items-start w-full justify-start mt-12 font-normal">
          <div>{m.help.intro}</div>
          <div className="underline cursor-pointer" onClick={handleContactUs}>
            chris@asksonus.com
          </div>
          <div className="text-hgray800 mt-16 font-normal text-sm">
            {m.help.prompt}
          </div>
          <Textarea
            placeholder=""
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="mt-4 max-w-[770px] text-[15px] font-normal"
            rows={3}
          />
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-4 py-2 cursor-pointer mt-4 text-sm bg-accenta1 text-black rounded-lg font-normal"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              m.help.submit
            )}
          </button>
        </div>
      </InnerLayout>
    </AppLayout>
  );
};

export default Help;
