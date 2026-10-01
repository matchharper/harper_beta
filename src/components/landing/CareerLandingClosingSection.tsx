import type { ReactNode } from "react";
import Reveal from "@/components/landing/Animation/Reveal";

export const CAREER_LANDING_CLOSING_COPY = {
  ko: {
    title: ["새로운 팀에 합류할 준비가 되셨나요?"],
    desc: "Harper가 다음 커리어로 적합한 역할을 찾고,<br />최종 합류까지 필요한 모든 과정을 도와드립니다.",
    button: "Meet Harper",
    note: "Takes less than 3 minutes to sync your context. 100% encrypted.",
  },
  en: {
    title: ["Put your career", "on Autopilot."],
    desc: "Harper finds your next job and helps you land it",
    button: "Meet your Agent",
    note: "Takes less than 3 minutes to sync your context. 100% encrypted.",
  },
};

export default function CareerLandingClosingSection({
  copy,
  action,
}: {
  copy: { title: readonly string[]; desc?: string; note: string };
  action: ReactNode;
}) {
  return (
    <section id="cta" className="px-4 py-20 md:px-10 md:py-32">
      <div className="mx-auto w-full max-w-[1080px]">
        <Reveal once blur={0} distance={20}>
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <h2 className="text-[28px] font-medium leading-[1.2] text-neutral-primary md:text-[36px]">
              {copy.title.map((line, index) => (
                <span key={line}>
                  {index > 0 && <br />}
                  {line}
                </span>
              ))}
            </h2>
            {copy.desc && (
              <p
                className="mt-2 text-[16px] font-normal leading-[1.45] text-neutral-800 md:text-[18px]"
                dangerouslySetInnerHTML={{ __html: copy.desc }}
              />
            )}
            {action}
            <div className="text-sm italic text-neutral-700">{copy.note}</div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
