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
    await navigator.clipboard.writeText("chris@matchharper.com");
    showToast({
      message: m.help.emailCopied,
      variant: "white",
    });
  };

  return (
    <div className="mx-auto flex w-full flex-col items-start justify-between gap-8 border-t border-white/20 bg-black px-4 py-10 text-hblack000 md:flex-row md:items-stretch md:gap-0 md:px-8 md:py-8">
      <div className="flex flex-1 flex-col items-start justify-start gap-4 md:gap-6">
        <div className="text-left text-3xl font-semibold font-garamond">
          Harper
        </div>
        <div className="text-[13px] text-hgray700">
          Harper <span className="ml-1">© 2026</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-hgray700">
          <div>Are you looking for talent?</div>
          <div
            onClick={() =>
              onClickStart
                ? onClickStart("click_footer_start")
                : router.push("/")
            }
            className="text-white underline cursor-pointer"
          >
            Start Now
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[13px] text-hgray700">
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
          <Dot size={8} />
          <div
            onClick={() =>
              window.open(
                "https://peat-find-598.notion.site/Refund-policy-2e684af768c6800e8276ccbe16fc8cb4?pvs=74",
                "_blank"
              )
            }
            className="cursor-pointer hover:text-white/90 text-white/80"
          >
            Refund Policy
          </div>
        </div>
      </div>
      <div className="mt-4 flex w-full flex-1 flex-row items-start justify-start gap-8 md:mt-0 md:items-end md:justify-end">
        <div className="flex flex-1 flex-col items-start justify-between gap-4 self-stretch md:items-end">
          <div className="flex w-full flex-col items-start justify-start gap-3 text-xs md:items-end md:text-sm">
            <div className="text-white mb-2">About us</div>
            <div className="flex flex-col items-start justify-start gap-2 md:items-end">
              <div
                onClick={handleContactUs}
                className="cursor-pointer hover:text-white/90 text-white/80"
              >
                {m.companyLanding.footer.contact}
              </div>
              <div
                onClick={() => router.push("/blog")}
                className="cursor-pointer hover:text-white/90 text-white/80"
              >
                blog
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(Footer);
