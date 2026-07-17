import Image from "next/image";
import React from "react";
import { useCountryLang } from "@/hooks/useCountryLang";
import { isOverseasCountryLang } from "@/i18n/localeResolution";

type PartnerLogo = {
  src: string;
  name: string;
  width: number;
};

const partnerLogos: PartnerLogo[] = [
  { src: "/images/logos/sn.png", name: "SNU", width: 34 },
  { src: "/images/logos/kai.png", name: "KAIST", width: 40 },
  { src: "/images/logos/cmu.png", name: "CMU", width: 54 },
  { src: "/images/logos/stan.png", name: "Stanford", width: 48 },
  {
    src: "/images/logos/utoronto.svg",
    name: "University of Toronto",
    width: 62,
  },
  { src: "/images/logos/toss.png", name: "Toss", width: 72 },
  { src: "/svgs/cohere.svg", name: "Cohere", width: 82 },
  { src: "/images/logos/amazon.svg", name: "Amazon", width: 72 },
  { src: "/images/logos/naver.svg", name: "Naver", width: 68 },
  { src: "/images/logos/moloco.png", name: "Moloco", width: 90 },
];

const overseasPartnerLogos: PartnerLogo[] = [
  { src: "/images/logos/cmu.png", name: "CMU", width: 56 },
  { src: "/images/logos/stan.png", name: "Stanford", width: 44 },
  { src: "/images/logos/harvard.svg", name: "Harvard", width: 72 },
  {
    src: "/images/logos/utoronto.svg",
    name: "University of Toronto",
    width: 38,
  },
  { src: "/svgs/cohere.svg", name: "Cohere", width: 82 },
  { src: "/images/logos/nvidia.svg", name: "NVIDIA", width: 82 },
  { src: "/images/logos/microsoft.svg", name: "Microsoft", width: 76 },
  { src: "/images/logos/amazon.svg", name: "Amazon", width: 64 },
];

type TalentSocialProofProps = {
  title?: string;
};

const TalentSocialProof = ({
  title = "이곳의 인재들이 신뢰합니다.",
}: TalentSocialProofProps) => {
  const countryLang = useCountryLang();
  const [hasResolvedLogoRegion, setHasResolvedLogoRegion] =
    React.useState(false);
  const logos =
    hasResolvedLogoRegion && isOverseasCountryLang(countryLang)
      ? overseasPartnerLogos
      : partnerLogos;
  const logoLoop = [...logos, ...logos];

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setHasResolvedLogoRegion(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="relative z-10 mx-auto w-full max-w-[1180px] px-4 pb-8 pt-8 text-center md:pb-10 md:pt-10">
      <h2 className="font-sans text-[13px] font-medium text-black/40 sm:text-[14px]">
        {title}
      </h2>

      <div
        className="mt-5 overflow-hidden"
        style={{
          WebkitMaskImage:
            "linear-gradient(90deg, transparent, black 12%, black 88%, transparent)",
          maskImage:
            "linear-gradient(90deg, transparent, black 12%, black 88%, transparent)",
        }}
      >
        <div className="flex w-max animate-[talent-logo-marquee-right_54s_linear_infinite] justify-center items-center gap-10 pr-10 will-change-transform md:gap-32 md:pr-14">
          {logoLoop.map((logo, index) => (
            <span
              key={`${logo.name}-${index}`}
              className="relative block h-8 shrink-0 opacity-55 grayscale transition hover:opacity-80 hover:grayscale-0"
              style={{ width: logo.width }}
            >
              <Image
                src={logo.src}
                alt={logo.name}
                fill
                sizes={`${logo.width}px`}
                className="object-contain"
              />
            </span>
          ))}
        </div>
      </div>

      <style jsx global>{`
        @keyframes talent-logo-marquee-right {
          from {
            transform: translate3d(-50%, 0, 0);
          }
          to {
            transform: translate3d(0, 0, 0);
          }
        }
      `}</style>
    </div>
  );
};

export default React.memo(TalentSocialProof);
