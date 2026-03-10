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
    <div className="w-full flex flex-col md:flex-row items-start md:items-stretch justify-between border-t border-white/20 py-10 md:py-8 md:px-8 mx-auto px-4 gap-6 md:gap-0 bg-black text-hblack000">
      <div className="flex flex-1 flex-col items-start justify-start gap-4 md:gap-6">
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
                : router.push("/")
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
        <div className="text-[13px] text-hgray700 flex flex-col items-start justify-start gap-0">
          <div>상호명 : 주식회사 하퍼</div>
          <div>대표자명 : HEO HONGBEOM</div>
          <div>사업자등록번호 : 314-86-68621</div>
          <div>
            사업장 주소 : 서울특별시 강남구 논현로10길 30, 505-제이 16(개포동)
          </div>
          <div>유선번호 : 010-7157-7537</div>
        </div>
      </div>
      <div className="flex flex-1 flex-row items-end justify-end gap-8 w-full mt-12 md:mt-0">
        <div className="flex flex-1 flex-col items-end justify-between gap-4 self-stretch">
          <div className="flex flex-row md:flex-col text-xs md:text-sm items-start md:items-end justify-between md:justify-start gap-2 w-full">
            <div className="text-white mb-2">팀에 관하여</div>
            <div className="flex flex-col items-end justify-start gap-2">
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
                블로그
              </div>
            </div>
          </div>
          {/* <div className="flex flex-row items-center gap-4">
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
          </div> */}
        </div>
      </div>
    </div>
  );
};

export default React.memo(Footer);
