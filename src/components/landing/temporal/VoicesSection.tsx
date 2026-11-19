import Image from "next/image";
import { SectionReveal, TwoLineTitle, useC } from "./primitives";
import { tw } from "./tw";

/** 후기 문구. 한국어·영어를 `c("한글", "English")`로 나란히 적는다. */
function useVoicesCopy() {
  const c = useC();
  return {
    title: [
      c("이미 최고의 인재들이", "Top people are already"),
      c("Harper를 통해 연결되고 있어요.", "getting connected through Harper."),
    ],
    items: [
      {
        quote: c(
          "한국에서는 이런 글로벌 기회가 있다는 것조차 몰랐어요. 그런데 Harper가 CTO를 직접 연결해 줬고, 이제 곧 합류해요.",
          "I didn’t even know global roles like this existed from Korea. Harper connected me straight to the CTO, and I’m joining soon."
        ),
        name: c("익명 요청", "Anonymous"),
        to: "Wonderful",
        role: "Founding Forward Deployed Engineer",
        photo: "/images/person1.png",
      },
      {
        quote: c(
          "Harper가 가볍게 함께해 볼 수 있는 fractional 역할로 YC 창업자 두 명과 바로 이어 줬고, 그게 자연스럽게 이직으로 이어졌어요.",
          "Harper introduced me to two YC founders through a light fractional role first. It turned into a full move without forcing anything."
        ),
        name: "Soyeon L.",
        to: "YC-backed Startup",
        role: "Founding Engineer",
        // 기존 랜딩(`/`)에서도 Soyeon L. 후기에 이 사진을 쓴다.
        photo: "/images/person3.png",
      },
      {
        quote: c(
          "공개된 공고도 없고 잘 모르던 스타트업이었는데, 정말 뛰어난 사람들만 모인 팀을 소개해 줘서 좋았어요.",
          "No public posting and a startup I’d never heard of, but the team Harper introduced me to was exceptional."
        ),
        name: "Patrick",
        to: "High-Growth AI Team",
        role: "Staff Engineer, Infrastructure",
        photo: "/images/person2.png",
      },
    ],
  };
}

export function VoicesSection() {
  const copy = useVoicesCopy();
  return (
    <section id="voices" className="relative pb-24 md:pb-36">
      <div className={tw.shell}>
        <SectionReveal className="max-w-[760px]">
          <TwoLineTitle lines={copy.title} />
        </SectionReveal>
        <ul className="mt-10 grid gap-4 md:mt-14 md:grid-cols-3 md:gap-5">
          {copy.items.map((voice) => (
            <li key={voice.name} className="h-full">
              <SectionReveal className="h-full">
                <figure className="flex h-full flex-col justify-between gap-8 rounded-[22px] bg-white/75 p-7 shadow-[0_0_0_0.5px_rgb(20_30_45/0.08),0_1px_2px_rgb(20_30_45/0.04)] md:p-8">
                  <blockquote className="text-[16px] leading-[1.7] tracking-[-0.01em] text-(--tl-ink) md:text-[17px]">
                    {voice.quote}
                  </blockquote>
                  <figcaption className="flex items-center gap-3 border-t border-black/[0.06] pt-4">
                    <Image
                      src={voice.photo}
                      alt=""
                      width={44}
                      height={44}
                      className="size-11 shrink-0 rounded-full object-cover shadow-[0_0_0_0.5px_rgb(0_0_0/0.1)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium text-(--tl-ink)">
                        {voice.name}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-(--tl-ink-2)">
                        {voice.to} · {voice.role}
                      </span>
                    </span>
                  </figcaption>
                </figure>
              </SectionReveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
