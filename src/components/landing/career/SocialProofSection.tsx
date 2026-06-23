import Reveal from "@/components/landing/Animation/Reveal";
import Image from "next/image";

const schoolLogos = [
  { src: "/images/logos/sn.png", name: "서울대학교" },
  { src: "/images/logos/kaist.png", name: "KAIST" },
  { src: "/images/logos/stanford.png", name: "Stanford" },
] as const;

const partnerLogos = [
  { key: "a16z2", src: "/svgs/a16z2.svg", width: 100, height: 56 },
  { key: "yc", src: "/svgs/yc.svg", width: 128, height: 26 },
  { key: "wonderful", src: "/images/wonderful.png", width: 154, height: 55 },
  { key: "mistral", src: "/images/mistral.png", width: 142, height: 40 },
  { key: "cohere", src: "/svgs/cohere.svg", width: 124, height: 21 },
  { key: "amazon", src: "/images/logos/amazon.svg", width: 118, height: 36 },
] as const;

export default function SocialProofSection() {
  return (
    <section
      aria-label="Harper social proof"
      className="px-4 py-4 text-center md:px-10 md:py-8"
    >
      <Reveal once delay={0.06}>
        <div className="flex flex-col items-center justify-center gap-5 text-[15px] font-normal tracking-[-0.03em] text-beige900/75 sm:flex-row md:text-base">
          <div>150+ engineers and researchers From</div>
          <div className="flex -space-x-2">
            {schoolLogos.map((school) => (
              <div
                key={school.name}
                className="h-9 w-9 overflow-hidden rounded-full border border-beige900/20 bg-beige500 md:h-10 md:w-10"
              >
                <Image
                  src={school.src}
                  alt={school.name}
                  width={42}
                  height={42}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      <Reveal once delay={0.12} className="mx-auto mt-6 max-w-[900px]">
        <div className="text-base font-medium leading-[1.55] tracking-[-0.03em] text-beige900 md:text-lg">
          Partnering with{" "}
          <span className="text-beige900/50">Most Exciting Tech companies</span>{" "}
          funded by the world&apos;s elite.
        </div>
      </Reveal>
      <Reveal once delay={0.18} className="mx-auto mt-0 w-full max-w-[980px]">
        <div className="hidden items-center justify-center gap-14 md:flex">
          {partnerLogos.map((logo) => (
            <div
              key={logo.key}
              className="flex h-24 min-w-[120px] items-center justify-center"
            >
              <Image
                src={logo.src}
                alt={logo.key}
                width={logo.width}
                height={logo.height}
                className="object-contain opacity-90"
              />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 items-center justify-center gap-x-6 gap-y-7 md:hidden">
          {partnerLogos.map((logo) => (
            <div key={logo.key} className="flex items-center justify-center">
              <Image
                src={logo.src}
                alt={logo.key}
                width={Math.max(84, logo.width - 24)}
                height={Math.round(
                  (logo.height * Math.max(84, logo.width - 24)) / logo.width
                )}
                className="max-w-[38vw] object-contain opacity-90"
              />
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
