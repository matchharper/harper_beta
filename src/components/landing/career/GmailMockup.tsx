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
import Face from "@/components/common/Face";
import { useMessages, type Locale } from "@/i18n/useMessage";
import { cn } from "@/lib/utils";

type GmailMockupCopy = {
  body: {
    greeting: string;
    paragraphs: string[];
    roleBody: string;
    roleTitle: string;
  };
  inboxLabel: string;
  replyLabel: string;
  forwardLabel: string;
  summaryLabel: string;
  subject: string;
  timeLabel: string;
  toLabel: string;
};

const GMAIL_MOCKUP_COPY: Record<Locale, GmailMockupCopy> = {
  ko: {
    subject: "소개: Chris & Wonderful APAC VP",
    inboxLabel: "받은편지함",
    summaryLabel: "이메일 요약",
    timeLabel: "방금",
    toLabel: "받는사람: me, daniel",
    replyLabel: "답장",
    forwardLabel: "전달",
    body: {
      greeting: "안녕하세요,",
      paragraphs: [
        "두분을 연결시켜드릴 수 있게되어 기쁩니다. Chris는 SF에서 일하고 있는 Forward Deployed Engineer로, 빠르게 성장하는 AI 회사에서 핵심 아키텍처를 구축할 다음 기회를 찾고 있습니다. 싱가포르와 서울 모두 가능해 relocation에도 열려 있습니다.",
        "Chris, Daniel은 APAC 지역 VP로 현재 인재분들을 만나고 있습니다. 다른 절차 없이 연결드려요. Wonderful이 지금 아시아 전역으로 공격적으로 확장하고 있는 만큼, 타이밍이 아주 좋아 보입니다.",
      ],
      roleTitle: "Forward Deployed Engineer · Wonderful (APAC)",
      roleBody:
        "APAC 확장 팀에서 핵심 아키텍처를 맡는 역할입니다. 프리미엄 relocation 패키지와 싱가포르 또는 서울 배치가 가능하며, APAC VP에게 직접 연결됩니다. HR 절차나 공개 공고 없이 진행되는 기회입니다.",
    },
  },
  en: {
    subject: "Intro: Chris & VP of APAC, Wonderful",
    inboxLabel: "Inbox",
    summaryLabel: "Email summary",
    timeLabel: "Now",
    toLabel: "to me",
    replyLabel: "Reply",
    forwardLabel: "Forward",
    body: {
      greeting: "Hi team,",
      paragraphs: [
        "I'm thrilled to introduce Chris to your team at Wonderful. He's a Forward Deployed Engineer based in SF who's looking to build core architecture at a fast-scaling AI company — and he's open to relocating, with both Singapore and Seoul on the table.",
        "I've routed this directly to your VP of APAC to skip the usual queue. Given how aggressively Wonderful is expanding across Asia right now, the timing looks ideal.",
      ],
      roleTitle: "Forward Deployed Engineer · Wonderful (APAC)",
      roleBody:
        "Core architecture role on the APAC expansion team, with a premium relocation package and placement in Singapore or Seoul. Direct line to the VP of APAC — no HR queue, no public listing.",
    },
  },
};

function GmailPhoneMockup({ className }: { className?: string }) {
  const { locale } = useMessages();
  const copy = GMAIL_MOCKUP_COPY[locale] ?? GMAIL_MOCKUP_COPY.ko;

  return (
    <div
      className={cn(
        "absolute bottom-[3.6%] right-[4.3%] hidden w-[218px] md:block md:w-[248px] lg:w-[260px]",
        className
      )}
    >
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
                <GmailSubject copy={copy} />

                <div className="mt-[10px]">
                  <GmailSummaryCard copy={copy} />
                </div>

                <div className="mt-[10px]">
                  <GmailSenderRow copy={copy} />
                </div>

                <GmailBody copy={copy} />
              </div>
            </div>

            <GmailReplyActions copy={copy} />
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

function GmailSubject({ copy }: { copy: GmailMockupCopy }) {
  return (
    <div className="grid grid-cols-[1fr_16px] gap-[8px]">
      <h3 className="text-[13px] font-normal leading-[1.4] tracking-[-0.025em] text-[#202124]">
        {copy.subject}
        <span className="ml-[5px] inline-flex translate-y-[-2px] rounded-[4px] bg-[#f1f3f4] px-[5px] py-[2px] text-[8px] font-normal leading-none tracking-[-0.02em] text-[#5f6368]">
          {copy.inboxLabel}
        </span>
      </h3>

      <Star
        className="mt-[12px] h-[13px] w-[13px] text-[#8a8d91]"
        strokeWidth={1.9}
      />
    </div>
  );
}

function GmailSummaryCard({ copy }: { copy: GmailMockupCopy }) {
  return (
    <div className="flex h-[28px] items-center rounded-[12px] bg-[#eef3fb] px-[12px] text-[#5f6368]">
      <div className="flex items-center gap-[8px]">
        <span className="relative flex h-[14px] w-[14px] items-center justify-center">
          <Sparkles className="h-[10px] w-[10px]" strokeWidth={1.9} />
          <span className="absolute -left-[3px] top-[6px] h-[1.2px] w-[6px] rounded-full bg-[#5f6368]" />
          <span className="absolute -left-[3px] top-[10px] h-[1.2px] w-[6px] rounded-full bg-[#5f6368]" />
        </span>

        <span className="text-[10px] font-medium tracking-[-0.02em]">
          {copy.summaryLabel}
        </span>
      </div>
    </div>
  );
}

function GmailSenderRow({ copy }: { copy: GmailMockupCopy }) {
  return (
    <div className="grid grid-cols-[28px_1fr_auto] items-start gap-[9px]">
      <Face size={30} />

      <div className="min-w-0 pt-[2px]">
        <div className="flex min-w-0 items-center gap-[7px]">
          <span className="truncate text-[11px] font-normal leading-none tracking-[-0.02em] text-[#202124]">
            Harper
          </span>
          <span className="shrink-0 text-[10.5px] leading-none tracking-[-0.02em] text-[#5f6368]">
            {copy.timeLabel}
          </span>
        </div>

        <div className="mt-[6px] flex items-center gap-[3px] text-[9.5px] leading-none tracking-[-0.02em] text-[#3c4043]">
          <span>{copy.toLabel}</span>
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

function GmailBody({ copy }: { copy: GmailMockupCopy }) {
  return (
    <div className="mt-[22px] space-y-[12px] text-[11px] font-normal leading-[1.43] tracking-[-0.025em] text-black">
      <p>{copy.body.greeting}</p>

      {copy.body.paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}

      <p>---</p>

      <div>
        <p className="font-semibold text-[#1a73e8] underline underline-offset-[2px]">
          {copy.body.roleTitle}
        </p>

        <p className="mt-[13px]">{copy.body.roleBody}</p>
      </div>
    </div>
  );
}

function GmailReplyActions({ copy }: { copy: GmailMockupCopy }) {
  const iconSize = "h-[13px] w-[13px]";
  const pill =
    "flex h-[26px] items-center justify-center gap-[7px] rounded-full bg-white text-[10px] font-normal tracking-[-0.02em] text-[#3c4043] ring-1 ring-[#c9cccf]";

  return (
    <div className="absolute bottom-[43px] left-0 right-0 bg-white px-[9px] pb-[7px] pt-[7px]">
      <div className="grid grid-cols-[1fr_1fr_34px] gap-[5px]">
        <button type="button" className={pill}>
          <Reply className={iconSize} strokeWidth={2.2} />
          {copy.replyLabel}
        </button>

        <button type="button" className={pill}>
          <Forward className={iconSize} strokeWidth={2.2} />
          {copy.forwardLabel}
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
