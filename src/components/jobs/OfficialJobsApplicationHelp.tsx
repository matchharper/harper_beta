import { ResponsiveLightTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { OfficialJobsLocale } from "@/lib/officialJobs/copy";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

const APPLICATION_HELP_COPY: Record<
  OfficialJobsLocale,
  {
    body: ReactNode;
    trigger: string;
  }
> = {
  en: {
    trigger: "How does applying work?",
    body: (
      <div className="w-full space-y-2.5">
        <p>Harper offers a new approach to the hiring process.</p>
        <p className="text-primary">
          Compared with applying the traditional way, it helps you pursue more
          opportunities at once and gives you a better chance of moving forward.
        </p>
        <p className="pt-1">How it works</p>
        <ul className="list-decimal space-y-1 pl-4">
          <li>After signing up, share your resume, LinkedIn, or profile.</li>
          <li>
            Have a short conversation with Harper AI so we can understand the
            types of roles you prefer. This is about your preferences, not a
            skills assessment.
          </li>
          <li>We&apos;ll show you opportunities we can connect you with.</li>
          <li>
            When you accept an opportunity, Harper introduces you to the company
            and explains why you could be a strong fit. <br />
            <span className="text-black/50">
              This is available only for companies that have asked Harper for
              hiring support, including the role you&apos;re viewing now.
            </span>
          </li>
        </ul>
        <p className="pt-1">
          If you sign up through this link, we&apos;ll prioritize the role
          you&apos;re viewing now.
          <br />
          After that, you can be connected with more opportunities.
        </p>
      </div>
    ),
  },
  ko: {
    trigger: "지원방식이 궁금하신가요?",
    body: (
      <div className="space-y-2.5 w-full">
        <p>Harper는 새로운 방식의 채용 프로세스를 제공합니다.</p>
        <p className="text-primary">
          기존의 지원 방식에 비해 한번에 더 많은 회사의 기회에 더 높은 확률로
          통과되실 수 있게 합니다.
        </p>
        <p className="pt-1">진행 방식</p>
        <ul className="list-decimal space-y-1 pl-4">
          <li>가입 후 이력서/링크드인 등 정보를 알려주세요.</li>
          <li>
            Harper AI가 간단한 대화를 통해 어떤 역할들을 선호하시는지
            파악합니다. 역량 파악을 확인하기 위한 대화가 아닌, 선호 파악을 위한
            대화입니다.
          </li>
          <li>연결되실 수 있는 기회를 알려드립니다.</li>
          <li>
            수락하신다면 Harper가 회사에게 회원님에 대한 정보와 함께 왜 회원님이
            적합한 인재인지 함께 설명합니다. <br />
            <span className="text-black/50">
              이건 Harper에게 채용을 요청한 회사에 한해 진행되며, 현재 보고 계신
              역할이 포함됩니다.
            </span>
          </li>
        </ul>
        <p className="pt-1">
          우선 현재 링크로 가입시 보고계신 역할에 우선 지원하시게 됩니다.
          <br />그 이후로는 더 많은 기회에 연결되실 수 있습니다.
        </p>
      </div>
    ),
  },
};

type OfficialJobsApplicationHelpProps = {
  className?: string;
  contentClassName?: string;
  locale: OfficialJobsLocale;
  triggerClassName?: string;
};

export default function OfficialJobsApplicationHelp({
  className,
  contentClassName,
  locale,
  triggerClassName,
}: OfficialJobsApplicationHelpProps) {
  const copy = APPLICATION_HELP_COPY[locale] ?? APPLICATION_HELP_COPY.ko;

  return (
    <ResponsiveLightTooltip
      className={className}
      contentClassName={cn(contentClassName)}
      triggerClassName={triggerClassName}
      trigger={
        <>
          <Info className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.8} />
          <span>{copy.trigger}</span>
        </>
      }
    >
      {copy.body}
    </ResponsiveLightTooltip>
  );
}
