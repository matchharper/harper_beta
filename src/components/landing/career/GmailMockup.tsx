import Image from "next/image";
import {
  Archive,
  ChevronLeft,
  Forward,
  MailCheck,
  MoreHorizontal,
  Reply,
  Sparkles,
  Star,
  Trash2,
  Smile,
  MessageSquare,
  Video,
  Captions,
} from "lucide-react";

function GmailPhoneMockup() {
  return (
    <div className="absolute bottom-[3.6%] right-[4.3%] hidden w-[218px] md:block md:w-[248px] lg:w-[260px]">
      <div className="relative aspect-[434/882]">
        <Image
          src="/svgs/phone.svg"
          alt=""
          fill
          priority
          sizes="260px"
          className="object-contain z-10"
        />

        <div className="absolute left-[4.5%] right-[4.5%] top-[2.2%] bottom-[1.6%] overflow-hidden rounded-[24px] bg-white text-neutral-950 md:rounded-[30px]">
          <GmailStatusBar />

          <div className="relative h-[calc(100%-31px)] overflow-hidden bg-white">
            <GmailTopBar />

            <div className="h-[calc(100%-32px)] overflow-hidden">
              <div className="px-[14px] pb-[92px] pt-[2px]">
                <GmailSubject />

                <div className="mt-[10px]">
                  <GmailSummaryCard />
                </div>

                <div className="mt-[10px]">
                  <GmailSenderRow />
                </div>

                <GmailBody />
              </div>
            </div>

            <GmailReplyActions />
            <GmailBottomNav />
          </div>
        </div>
      </div>
    </div>
  );
}

function GmailStatusBar() {
  return (
    <div className="flex h-[31px] items-center justify-between px-[17px] pt-[4px] text-[11px] font-semibold tracking-[-0.02em] text-black">
      <span>10:08</span>

      <div className="flex items-center gap-[4px]">
        <span className="flex items-end gap-[1.5px]">
          <span className="h-[4px] w-[2px] rounded-[1px] bg-black" />
          <span className="h-[6px] w-[2px] rounded-[1px] bg-black" />
          <span className="h-[8px] w-[2px] rounded-[1px] bg-black" />
          <span className="h-[10px] w-[2px] rounded-[1px] bg-neutral-300" />
        </span>

        <span className="text-[11px] font-semibold leading-none">5G</span>

        <span className="relative h-[10px] w-[18px] rounded-[3px] ring-1 ring-neutral-500">
          <span className="absolute -right-[2px] top-[3px] h-[4px] w-[1.5px] rounded-r-sm bg-neutral-500" />
          <span className="absolute left-[2px] top-[2px] h-[6px] w-[12px] rounded-[2px] bg-black" />
        </span>
      </div>
    </div>
  );
}

function GmailTopBar() {
  const iconSize = "h-[13px] w-[13px]";
  return (
    <div className="flex h-[39px] items-center px-[12px] text-neutral-700">
      <button
        type="button"
        aria-label="Back"
        className="mr-auto flex h-[28px] w-[26px] items-center justify-start"
      >
        <ChevronLeft className={iconSize} strokeWidth={2.6} />
      </button>

      <div className="flex items-center gap-[13px]">
        <button
          type="button"
          aria-label="Gemini"
          className="relative flex h-[20px] w-[20px] items-center justify-center"
        >
          <Sparkles
            className={`${iconSize} fill-neutral-700 text-neutral-700`}
            strokeWidth={1.7}
          />
          <span className="absolute right-[0px] top-[-2px] h-[4px] w-[4px] rounded-full bg-black" />
        </button>

        <Archive className={iconSize} strokeWidth={2.2} />
        <Trash2 className={iconSize} strokeWidth={2.2} />
        <MailCheck className={iconSize} strokeWidth={2.2} />
        <MoreHorizontal className={iconSize} strokeWidth={2.7} />
      </div>
    </div>
  );
}

function GmailSubject() {
  return (
    <div className="grid grid-cols-[1fr_16px] gap-[8px]">
      <h3 className="text-[13px] font-normal leading-[1.4] tracking-[-0.025em] text-[#202124]">
        호진님, Canva 쪽은 Harper가 회사에 전달 진행하겠습니다
        <span className="ml-[5px] inline-flex translate-y-[-2px] rounded-[4px] bg-[#f1f3f4] px-[5px] py-[2px] text-[8px] font-normal leading-none tracking-[-0.02em] text-[#5f6368]">
          받은편지함
        </span>
      </h3>

      <Star
        className="mt-[12px] h-[13px] w-[13px] text-[#8a8d91]"
        strokeWidth={1.9}
      />
    </div>
  );
}

function GmailSummaryCard() {
  return (
    <div className="flex h-[28px] items-center rounded-[12px] bg-[#eef3fb] px-[12px] text-[#5f6368]">
      <div className="flex items-center gap-[8px]">
        <span className="relative flex h-[14px] w-[14px] items-center justify-center">
          <Sparkles className="h-[12px] w-[12px]" strokeWidth={1.9} />
          <span className="absolute -left-[3px] top-[6px] h-[1.5px] w-[6px] rounded-full bg-[#5f6368]" />
          <span className="absolute -left-[3px] top-[10px] h-[1.5px] w-[6px] rounded-full bg-[#5f6368]" />
        </span>

        <span className="text-[10px] font-medium tracking-[-0.02em]">
          이메일 요약
        </span>
      </div>
    </div>
  );
}

function GmailSenderRow() {
  return (
    <div className="grid grid-cols-[28px_1fr_auto] items-start gap-[9px]">
      <div className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[#006c55] text-[16px] font-normal leading-none text-white">
        H
      </div>

      <div className="min-w-0 pt-[2px]">
        <div className="flex min-w-0 items-center gap-[7px]">
          <span className="truncate text-[11px] font-normal leading-none tracking-[-0.02em] text-[#202124]">
            Harper
          </span>
          <span className="shrink-0 text-[10.5px] leading-none tracking-[-0.02em] text-[#5f6368]">
            6월 5일
          </span>
        </div>

        <div className="mt-[6px] flex items-center gap-[3px] text-[9.5px] leading-none tracking-[-0.02em] text-[#3c4043]">
          <span>받는사람: me</span>
          <span className="translate-y-[-1px] text-[9px]">⌄</span>
        </div>
      </div>

      <div className="flex items-center gap-[10px] pt-[2px] text-[#5f6368]">
        <Smile className="h-[15px] w-[15px] text-[#8a8d91]" strokeWidth={2} />
        <Reply className="h-[16px] w-[16px]" strokeWidth={2.2} />
        <MoreHorizontal className="h-[17px] w-[17px]" strokeWidth={2.7} />
      </div>
    </div>
  );
}

function GmailBody() {
  return (
    <div className="mt-[22px] space-y-[12px] text-[11px] font-normal leading-[1.43] tracking-[-0.025em] text-black">
      <p>호진님,</p>

      <p>
        저번에 추천드린 Canva Engineer 역할에 연결을 수락해주신걸 확인했습니다.
        내부 기회라 Harper가 중간에서 회사 쪽에 직접 전달하고 일정 조율까지
        도와드릴게요. 가장 적절한 타이밍에 넘겨드리겠습니다.
        <br />
        바로 매니저한테 전달될 예정이라, 아마 다음주 안에 커피챗 혹은 인터뷰
        일정 안내가 갈 예정이에요.
      </p>

      <p>
        그 사이 Image/TTS에 대한 관심을 이어가면서 multimodal/LLM 쪽으로도 살짝
        넓혀, 이전에 저장하신 Cresta·Ideogram·Cohere와 겹치지 않는 역할 세 개를
        골라봤습니다.
      </p>

      <p>---</p>

      <div>
        <p className="font-semibold text-[#1a73e8] underline underline-offset-[2px]">
          Agentic AI Engineer at 네오사피엔스 (타입캐스트)
        </p>

        <p className="mt-[13px]">
          타입캐스트는 감정 표현 TTS와 AI 아바타로 알려진 서울 회사인데, 지금은
          실시간 음성·영상 AI 캐릭터 플랫폼 Neona를 새로 만들고 있어요.
          STT-LLM-TTS 파이프라인부터 turn-taking, 저지연 스트리밍까지 Voice AI
          쪽 문제를 많이 다룹니다.
        </p>
      </div>
    </div>
  );
}

function GmailReplyActions() {
  const iconSize = "h-[13px] w-[13px]";
  const pill =
    "flex h-[28px] items-center justify-center gap-[7px] rounded-full bg-white text-[10px] font-normal tracking-[-0.02em] text-[#3c4043] ring-1 ring-[#c9cccf]";

  return (
    <div className="absolute bottom-[43px] left-0 right-0 bg-white px-[9px] pb-[7px] pt-[7px]">
      <div className="grid grid-cols-[1fr_1fr_34px] gap-[5px]">
        <button type="button" className={pill}>
          <Reply className={iconSize} strokeWidth={2.2} />
          답장
        </button>

        <button type="button" className={pill}>
          <Forward className={iconSize} strokeWidth={2.2} />
          전달
        </button>

        <button type="button" aria-label="Comment" className={pill}>
          <MessageSquare className={iconSize} strokeWidth={2.1} />
        </button>
      </div>
    </div>
  );
}

function GmailBottomNav() {
  const iconSize = "h-[14px] w-[14px]";
  return (
    <div className="absolute pb-1 bottom-0 left-0 right-0 flex flex-row h-[46px] items-center justify-between bg-[#edf3fb] text-[#3c4043]">
      <button
        type="button"
        aria-label="Mail"
        className="relative flex h-[28px] w-full px-2 items-center justify-center"
      >
        <div className=" rounded-full bg-[#bfe7ff] py-2 px-4">
          <Captions className={iconSize} />

          <span className="absolute right-[4px] top-[-4px] rounded-full bg-[#d93025] px-[5px] py-[2px] text-[9px] font-semibold leading-none text-white">
            99+
          </span>
        </div>
      </button>

      <button
        type="button"
        aria-label="Chat"
        className="relative flex h-[28px] w-full px-2 items-center justify-center"
      >
        <div className="relative">
          <MessageSquare className={iconSize} strokeWidth={2.3} />

          <span className="absolute right-[-12px] top-[-10px] rounded-full bg-[#d93025] px-[5px] py-[2px] text-[9px] font-semibold leading-none text-white">
            1
          </span>
        </div>
      </button>

      <button
        type="button"
        aria-label="Meet"
        className="flex h-[28px] w-full px-2 items-center justify-center"
      >
        <Video className="h-[16px] w-[16px]" strokeWidth={2} />
      </button>
    </div>
  );
}

export default GmailPhoneMockup;
