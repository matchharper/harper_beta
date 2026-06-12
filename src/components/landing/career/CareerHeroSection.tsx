import Reveal from "@/components/landing/Animation/Reveal";
import { Clock, Loader, Lock } from "lucide-react";
import Image from "next/image";
import type React from "react";
import CareerLandingButton from "./CareerLandingButton";

type CareerHeroSectionProps = {
  careerStartHref: string;
  onCareerStartClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

const SectionTag = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-2 inline-flex items-center rounded-lg bg-beige500/80 px-4 py-2 text-[13px] md:text-[15px] font-medium tracking-[-0.03em] text-beige900/80 backdrop-blur-xl">
    {children}
  </div>
);

export default function CareerHeroSection({
  careerStartHref,
  onCareerStartClick,
}: CareerHeroSectionProps) {
  return (
    <section className="flex flex-col items-center justify-center px-4 pb-14 pt-[112px] text-center md:px-10 md:pb-20 md:pt-[20vh]">
      <Reveal once delay={0.06}>
        <SectionTag>탤런트만을 위해 설계된 AI 커리어 agent</SectionTag>
      </Reveal>
      <Reveal once delay={0.18} className="mt-6">
        <h1 className="mx-auto max-w-[980px] font-instrument font-medium text-[30px] leading-[1.1] text-beige900 sm:text-[44px] md:text-[36px]">
          <span className="block">나를 위한 완벽한 기회,</span>
          <span className="mt-1 block">
            이제 <em className="text-beige700">Agent</em>가 찾아옵니다.
          </span>
        </h1>
      </Reveal>
      <Reveal once delay={0.32}>
        <p className="mx-auto mt-8 max-w-[820px] text-sm leading-[1.9] text-beige900/80 md:text-base">
          수많은 채용 공고와 무의미한 이직 제안 사이에서 시간을 낭비하지 마세요.
          <br />
          당신의 기준과 야망을 이해하고, 가장 완벽한 기회만 선별해 가져오는
          나만의 전담 커리어 agent입니다.
        </p>
      </Reveal>
      <Reveal once delay={0.46} className="mt-8">
        <CareerLandingButton
          href={careerStartHref}
          label="Talk to Harper"
          onClick={onCareerStartClick}
        />
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px] text-beige900/80 md:flex-row md:text-sm">
          <div className="flex flex-row items-center gap-2 whitespace-nowrap">
            <Clock className="h-3.5 w-3.5" />
            <span>1시간 이내 첫 매칭</span>
          </div>
          <div className="flex flex-row items-center gap-2 whitespace-nowrap">
            <Loader className="h-3.5 w-3.5" />
            <span>무료</span>
          </div>
          <div className="flex flex-row items-center gap-2 whitespace-nowrap">
            <Lock className="h-3.5 w-3.5" />
            <span>익명 보장</span>
          </div>
        </div>
      </Reveal>

      <Reveal once delay={0.24} className="w-full">
        <div className="mb-4 mt-20 flex w-full items-center justify-center md:mt-28">
          <Image
            src="/images/objects.png"
            alt="objects"
            width={288}
            height={192}
            priority
            className="h-auto w-48 sm:w-64 md:w-72"
          />
        </div>
      </Reveal>
    </section>
  );
}
