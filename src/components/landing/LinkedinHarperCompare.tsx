import Image from "next/image";
import { ChevronLeft, MoreHorizontal, Plus, Search, Send } from "lucide-react";
import Reveal from "./Animation/Reveal";

type LinkedinMessage = {
  avatarSrc: string;
  sender: string;
  date: string;
  previewLines: string[];
};

const linkedinMessages: LinkedinMessage[] = [
  {
    avatarSrc: "/images/profiles/avatar8.png",
    sender: "Jaeyoung Jeon",
    date: "Mar 29",
    previewLines: [
      "안녕하세요! 좋은 기회가 있어서 연락드렸습니다.",
      "통화하면서 더 자세하게 설명드려도 괜찮을까요?",
    ],
  },
  {
    avatarSrc: "/images/profiles/avatar2.png",
    sender: "Dahlia Russell",
    date: "Apr 2",
    previewLines: [
      "Unique Opportunities for Developers.",
      "Join a Fast-Growing Series B AI Startup",
    ],
  },
  {
    avatarSrc: "/images/profiles/avatar11.png",
    sender: "Harlow Ng (Aurora Labs)",
    date: "May 8",
    previewLines: [
      "Hi Nick! Resurfacing this role - we're scaling and",
      "need the best engineering minds shaping the next wave.",
    ],
  },
];

function LinkedInMark() {
  return (
    <div className="flex items-end justify-center z-20 text-white/90 gap-2 font-inter">
      <span className="font-hedvig text-xl tracking-[-0.065em] font-normal md:text-2xl">
        General Outreach
      </span>
      {/* <span className="mb-1 rounded-[5px] bg-[#0A66C2] px-[5px] py-[2px] text-xl font-bold leading-none tracking-[-0.06em] text-white md:mb-0 md:px-[8px] md:py-[2px] md:text-2xl">
        in
      </span> */}
    </div>
  );
}

function HarperMark() {
  return (
    <div className="flex items-center justify-center z-20 gap-2 text-accenta1/90 md:gap-3 font-inter">
      {/* <Image src="/svgs/logo.svg" alt="Harper" width={22} height={22} /> */}
      <span className="font-hedvig text-xl tracking-[-0.065em] font-normal md:text-2xl">
        Activity-based Approach
      </span>
    </div>
  );
}

function PhoneFrame({
  children,
  className = "",
  bodyClassName = "",
}: {
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      className={[
        "relative rounded-[28px] border border-black/[0.1] bg-[#F7F7F5] px-3 pb-3 pt-[52px]",
        "shadow-[0_18px_54px_rgba(17,17,17,0.15)] md:rounded-[38px] md:px-[14px] md:pb-[14px] md:pt-[68px]",
        className,
      ].join(" ")}
    >
      <div className="absolute left-1/2 top-[15px] h-[20px] w-[92px] -translate-x-1/2 rounded-full bg-black md:top-[19px] md:h-[24px] md:w-[126px]" />
      <div
        className={[
          "overflow-hidden rounded-[20px] border border-black/[0.1] bg-white md:rounded-[28px]",
          bodyClassName,
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}

function LinkedinInboxPhone() {
  return (
    <div className="absolute bottom-[-108px] left-1/2 z-10 w-[86%] max-w-[480px] -translate-x-1/2 md:bottom-[-58px] md:w-[70%]">
      <PhoneFrame>
        <div className="border-b border-black/[0.1] bg-white px-3 py-3.5 md:px-5 md:py-4.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 flex-1 items-center gap-2 rounded-full bg-[#E7EEF7] px-2 text-[#6A7685] md:h-9 md:px-3">
              <Search className="h-3.5 w-3.5 shrink-0 stroke-[2.3] md:h-4 md:w-4" />
              <span className="text-[10px] font-medium md:text-[12px]">
                Search messages
              </span>
            </div>
            <MoreHorizontal className="h-4 w-4 text-black/35 md:h-5 md:w-5" />
            <Plus className="h-4 w-4 text-black/45 md:h-5 md:w-5" />
          </div>
        </div>

        {linkedinMessages.map((message, index) => (
          <div
            key={message.sender}
            className={[
              "flex items-start gap-2.5 px-3 py-3.5 md:gap-3 md:px-5 md:py-4.5",
              index === 0 ? "" : "border-t border-black/[0.1]",
            ].join(" ")}
          >
            <Image
              src={message.avatarSrc}
              alt={message.sender}
              width={34}
              height={34}
              className="mt-0.5 h-[34px] w-[34px] shrink-0 rounded-full object-cover md:h-[42px] md:w-[42px]"
            />

            <div className="min-w-0 flex-1 text-left">
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="truncate text-[11px] font-semibold leading-none text-[#1F1F1F] md:text-[13px]">
                    {message.sender}
                  </div>
                  <div className="shrink-0 text-[10px] text-hgray500 md:text-[12px]">
                    {message.date}
                  </div>
                </div>
                <div className="mt-1.5 pb-0 md:pb-2 space-y-0.5 text-[11px] leading-[1.3] text-[#2F2F2F] md:text-[11px]">
                  {message.previewLines.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </PhoneFrame>
    </div>
  );
}

function HarperEmailPhone() {
  return (
    <div className="absolute bottom-[-108px] left-1/2 z-10 w-[86%] max-w-[480px] -translate-x-1/2 md:bottom-[-64px] md:w-[70%]">
      <PhoneFrame className="bg-[#F8F8F6]">
        <div className="bg-white">
          <div className="flex items-center justify-between px-2 py-2.5 text-[#191919] md:px-4 md:py-3.5">
            <div className="flex items-center gap-2.5">
              <ChevronLeft className="h-4 w-4 stroke-[2.2] md:h-5 md:w-5" />
              <div className="rounded-[8px] bg-[#1BCB5D] px-1.5 py-0.5 text-[10px] font-semibold text-white md:text-[12px]">
                15
              </div>
            </div>

            <div className="flex items-center gap-3 md:gap-4">
              <Send className="h-3.5 w-3.5 -rotate-[18deg] stroke-[2.2] md:h-4 md:w-4" />
              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-black/80 md:h-7 md:w-7">
                <MoreHorizontal className="h-3.5 w-3.5 stroke-[2.2] md:h-4 md:w-4" />
              </div>
            </div>
          </div>

          <div className="px-3 pb-2 md:px-5 md:pb-4.5">
            <div className="flex items-center gap-2 text-left text-[11px] text-[#232323] md:text-[13px]">
              <span className="shrink-0 text-[13px] md:text-[16px]">To</span>
              <div className="inline-flex items-center gap-2 rounded-full border border-black/20 bg-[#FAFAFA] px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] md:px-2 md:py-1">
                <Image
                  src="/images/profiles/avatar5.png"
                  alt="Sam Kim"
                  width={18}
                  height={18}
                  className="h-[18px] w-[18px] rounded-full object-cover md:h-[22px] md:w-[22px]"
                />
                <span className="font-medium">Sam Kim</span>
              </div>
            </div>
          </div>

          <div className="border-y border-black/[0.1] px-2 py-2 text-left text-[11px] font-normal text-[#232323] md:px-4 md:py-3 md:text-[13px]">
            데이터를 모으는 파이프라인을 설계하신 논문을 봤습니다.
          </div>
          <div className="px-3 py-3.5 text-left text-[11px] leading-[1.55] text-[#1E1E1E] md:px-5 md:py-4.5 md:text-[13px]">
            <p>안녕하세요 Sam,</p>
            <p className="mt-2 md:mt-3.5">
              올해 1월에 작성하신 논문과 코드 베이스{" "}
              <span className="text-[#245BEA] underline underline-offset-2">
                https://github.com/samkim0/augmented-dataset
              </span>{" "}
              를 우연히 살펴봤는데, 데이터를 수집에서 실제 지표 향상까지 만들어
              내신 점이 저희한테 필요한 역량이라고 생각했어요.
            </p>
            <p className="mt-3.5">
              단순히 데이터를 모으는 수준이 아니라, 품질을 고려해 구조화하고
              활용 가능하게 만든 점이 특히 좋았고, 저희가 중요하게 보는 역량과
              잘 맞는다고 느꼈습니다.
            </p>
          </div>
        </div>
      </PhoneFrame>
    </div>
  );
}

function ComparisonCard({
  children,
  logo,
  tone,
}: {
  children: React.ReactNode;
  logo: React.ReactNode;
  tone: "linkedin" | "Harper";
}) {
  return (
    <div
      className={[
        "relative isolate min-h-[320px] overflow-hidden rounded-[24px] px-3 pt-5",
        "md:min-h-[480px] md:rounded-[32px] md:px-4 md:pt-8",
        tone === "linkedin" ? "bg-white/10" : "bg-white/10",
      ].join(" ")}
    >
      <div className="relative z-20 bg-black/50 md:bg-transparent rounded-md p-2 flex justify-center">
        {logo}
      </div>
      <div className="relative flex h-full w-full justify-center">
        {children}
      </div>
    </div>
  );
}

export default function LinkedinHarperCompare() {
  return (
    <section className="relative w-full overflow-hidden px-4 py-16 md:px-8 md:py-24">
      <div className="mx-auto w-full max-w-[1180px]">
        <Reveal>
          <div className="mx-auto max-w-[720px] text-center">
            <h2 className="text-balance text-[22px] font-semibold md:text-4xl">
              {/* 뛰어난 엔지니어들은
              <br />
              LinkedIn 연락에 답하지 않습니다. */}
              자연스러운 대화 주제를 발견하세요.
              {/* <div>활동을 기반으로</div>
              <div className="mt-2">대화를 시작해보세요.</div> */}
            </h2>

            <p className="mx-auto mt-8 max-w-[680px] text-balance text-sm md:text-[17px] font-light text-hgray700">
              일반적인 연락시 응답률은 1~3%에 불과합니다. GitHub 프로젝트와 논문
              내용을 기반으로 대화를 시작하면 응답률은 30%까지 올라갑니다.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="mt-10 grid grid-cols-1 gap-5 xl:mt-14 xl:grid-cols-2 xl:gap-8">
            <ComparisonCard logo={<LinkedInMark />} tone="linkedin">
              <LinkedinInboxPhone />
            </ComparisonCard>

            <ComparisonCard logo={<HarperMark />} tone="Harper">
              <HarperEmailPhone />
            </ComparisonCard>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
