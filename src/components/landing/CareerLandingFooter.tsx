import Image from "next/image";
import Link from "next/link";
import type React from "react";

type CareerLandingFooterProps = {
  careerStartHref: string;
  onCareerStartClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

const labelStyle =
  "cursor-pointer text-xs md:text-sm font-medium text-beige900/45 transition duration-300 hover:text-beige900/85";

const blockStyle = "flex flex-col items-start justify-start md:min-w-[140px]";

export default function CareerLandingFooter({
  careerStartHref,
  onCareerStartClick,
}: CareerLandingFooterProps) {
  const openCrispChat = () => {
    if (typeof window === "undefined") return;

    const crispWindow = window as Window & {
      $crisp?: Array<unknown[]>;
    };
    const hasCrispLoader = Boolean(document.getElementById("crisp-loader"));

    if (!crispWindow.$crisp && !hasCrispLoader) {
      window.location.href = "mailto:hello@matchharper.com";
      return;
    }

    crispWindow.$crisp = crispWindow.$crisp ?? [];
    crispWindow.$crisp.push(["do", "chat:show"]);
    crispWindow.$crisp.push(["do", "chat:open"]);
  };

  const liststyle =
    "mt-4 flex flex-col gap-2 md:gap-3 text-xs md:text-sm text-beige900/70";

  return (
    <footer className="border-t border-beige900/10 bg-beige500/35 px-4 py-14 text-[12px] text-beige900 md:px-10 md:py-16">
      <div className="mx-auto max-w-[1160px]">
        <div className="flex flex-col items-start justify-between gap-10 border-b border-beige900/10 pb-10 lg:flex-row">
          <div className="max-w-[360px]">
            <Image src="/svgs/logov2.svg" alt="Harper" width={78} height={36} />
            <p className="font-hedvig mt-5 text-base font-semibold text-beige900/70">
              Get <span className="text-beige900">introduced</span> to your{" "}
              <span className="text-beige900">dream role</span>.
              <br />
              With <span className="text-beige900">Harper</span>.
            </p>
          </div>

          <div className="grid w-full grid-cols-2 gap-8 sm:grid-cols-3 lg:w-auto lg:gap-12">
            <div className={blockStyle}>
              <div className="w-full font-medium uppercase text-beige900">
                For Talent
              </div>
              <div className={`${liststyle}`}>
                <Link
                  href={careerStartHref}
                  className={labelStyle}
                  onClick={onCareerStartClick}
                >
                  시작하기
                </Link>
                <Link href="/#workflow" className={labelStyle}>
                  How it works
                </Link>
                <Link href="/#voices" className={labelStyle}>
                  Success stories
                </Link>
              </div>
            </div>

            <div className={blockStyle}>
              <div className="w-full font-medium uppercase text-beige900">
                For Companies
              </div>
              <div className={`${liststyle}`}>
                <Link href="/company" className={labelStyle}>
                  Harper for Companies
                </Link>
                <a
                  href="https://calendly.com/chris-matchharper/30min"
                  className={labelStyle}
                >
                  Schedule a call
                </a>
              </div>
            </div>

            <div className={blockStyle}>
              <div className="w-full font-medium uppercase text-beige900">
                Company
              </div>
              <div className={`${liststyle}`}>
                <Link href="/blog" className={labelStyle}>
                  Blog
                </Link>
                <a
                  href="https://www.linkedin.com/company/matchharper/"
                  target="_blank"
                  rel="noreferrer"
                  className={labelStyle}
                >
                  LinkedIn
                </a>
                <button
                  type="button"
                  onClick={openCrispChat}
                  className={`${labelStyle} text-left`}
                >
                  문의하기
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 text-[12.5px] text-beige900/45 md:flex-row md:items-center md:justify-between">
          <div>© 2026 Harper. All rights reserved.</div>
        </div>
      </div>
    </footer>
  );
}
