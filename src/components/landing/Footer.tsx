import { useMessages } from "@/i18n/useMessage";
import React from "react";
import Link from "next/link";
import { showToast } from "../toast/toast";
import { Dot } from "lucide-react";
import router from "next/router";

const Footer = ({
  onClickStart,
}: {
  onClickStart?: (type: string) => void;
}) => {
  const { m, locale } = useMessages();

  const setLocaleCookie = (next: "ko" | "en") => {
    if (typeof document === "undefined") return;
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000`;
    window.location.reload();
  };

  const handleContactUs = async () => {
    await navigator.clipboard.writeText("chris@asksonus.com");
    showToast({
      message: m.help.emailCopied,
      variant: "white",
    });
  };

  return (
    <div className="flex flex-col md:flex-row items-start md:items-end justify-between border-t border-white/20 py-10 md:py-8 pb-[20vh] w-[100%] md:w-[94%] mx-auto px-4 md:px-0 gap-6 md:gap-0">
      <div className="flex flex-col items-start justify-start gap-4 md:gap-6">
        <div className="text-left text-3xl font-semibold font-garamond">
          Harper
        </div>
        <div className="text-[13px] text-hgray700">
          Harper <span className="ml-1">© 2026</span>
        </div>
        <div className="text-[13px] text-hgray700 flex flex-row items-center gap-2">
          <div>사람을 찾고 계신가요?</div>
          <div
            onClick={() =>
              onClickStart
                ? onClickStart("click_footer_start")
                : router.push("/companies")
            }
            className="text-white underline cursor-pointer"
          >
            시작하기
          </div>
        </div>
        <div className="text-[13px] text-hgray700 flex flex-row items-center gap-1">
          <Link
            href="/terms"
            className="cursor-pointer hover:text-white/90 text-white/80"
          >
            Terms
          </Link>
          <Dot size={8} />
          <Link
            href="/privacy"
            className="cursor-pointer hover:text-white/90 text-white/80"
          >
            Privacy
          </Link>
        </div>
      </div>
      <div className="flex flex-row items-center gap-4">
        <div className="flex items-center gap-2 text-xs md:text-sm font-extralight text-white/80">
          <button
            type="button"
            onClick={() => setLocaleCookie("ko")}
            className={`hover:text-white/90 transition ${locale === "ko" ? "text-white" : ""}`}
          >
            Korean
          </button>
          <span className="text-white/40">|</span>
          <button
            type="button"
            onClick={() => setLocaleCookie("en")}
            className={`hover:text-white/90 transition ${locale === "en" ? "text-white" : ""}`}
          >
            English
          </button>
        </div>
        <div
          onClick={handleContactUs}
          className="text-xs md:text-sm cursor-pointer hover:text-white/90 text-white/80"
        >
          {m.companyLanding.footer.contact}
        </div>
      </div>
    </div>
  );
};

export default React.memo(Footer);
