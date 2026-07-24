import { ChevronDown } from "lucide-react";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import {
  OrgSection,
  OrgSectionHeader,
} from "@/components/org/workspace/OrgSection";

const GUIDE_ITEMS = [
  {
    description:
      "Home의 연결 대기 목록에서 오래 기다린 후보자부터 열고 추천 이유와 경력을 확인하세요.",
    title: "추천 확인",
  },
  {
    description:
      "만나고 싶다면 연결 수락, 맞지 않다면 거절 사유를 남겨 주세요. 구체적인 판단은 다음 추천 품질에 반영됩니다.",
    title: "연결 결정",
  },
  {
    description:
      "연결 후 실제 채용 진행 상태에 맞춰 카드를 옮기고 필요한 인터뷰 칼럼을 추가하세요.",
    title: "Pipeline 관리",
  },
  {
    description:
      "후보자 피드에 인터뷰 관찰과 다음 확인 항목을 기록해 팀이 같은 맥락을 공유하도록 하세요.",
    title: "팀 메모",
  },
] as const;

const FAQ_ITEMS = [
  {
    answer:
      "Harper가 회사와 Role 정보를 바탕으로 적합한 인재를 탐색해 추천합니다. 연결 대기 후보자는 회사의 수락 또는 거절 결정이 필요합니다.",
    question: "연결 대기는 어떤 상태인가요?",
  },
  {
    answer:
      "후보자가 오래 기다리지 않도록 한 Role에 연결 대기가 5명 이상 쌓이면 기존 후보자를 검토할 때까지 새 연결이 잠시 중단됩니다. 대기 후보자를 결정하면 자동으로 다시 시작됩니다.",
    question: "새 추천이 잠시 멈춘 이유는 무엇인가요?",
  },
  {
    answer:
      "수락하면 입력한 회사 담당자 이메일과 후보자를 warm intro 메일로 연결합니다. 이후 일정과 인터뷰는 직접 조율할 수 있습니다.",
    question: "후보자를 수락하면 어떻게 되나요?",
  },
  {
    answer:
      "거절 이유는 후보자에게 그대로 전달되지 않습니다. Harper가 더 적합한 다음 인재를 찾는 기준으로 사용하고, 후보자에게는 적절한 시점에 부드럽게 안내합니다.",
    question: "거절 이유가 후보자에게 보이나요?",
  },
  {
    answer:
      "Owner는 회사 정보, 멤버, 연동과 후보자를 모두 관리합니다. Admin은 후보자와 Jobs를 관리하고, Viewer는 내용을 확인만 할 수 있습니다.",
    question: "Owner, Admin, Viewer는 어떻게 다른가요?",
  },
  {
    answer:
      "후보자 자료는 해당 Organization의 채용 검토를 위해서만 제공됩니다. 이력서나 연락처를 외부에 공유하지 마세요.",
    question: "후보자 이력서를 외부에 공유해도 되나요?",
  },
  {
    answer:
      "Team에서 회사 Pitch와 설명을 최신 상태로 유지하고, Jobs의 각 Role에서 채용 기준과 설명을 수정하세요. Harper는 최신 정보를 다음 추천과 후보자 안내에 사용합니다.",
    question: "추천 기준을 바꾸려면 어디를 수정하나요?",
  },
] as const;

export function OrgHelpPage() {
  return (
    <div className="space-y-8">
      <OrgPageHeader
        description="Harper로 후보자를 검토하고 팀과 채용을 운영하는 방법입니다."
        title="Help"
      />

      <OrgSection>
        <OrgSectionHeader title="Harper Organization" />
        <p className="max-w-3xl text-[14px] font-light leading-6 text-neutral-muted">
          Harper는 채용 공고를 올리고 지원자를 기다리는 도구가 아니라, 회사가
          만나야 할 인재를 먼저 찾아 연결하는 채용 workspace입니다. 팀은 추천
          이유와 경력을 검토하고, 연결 여부와 실제 채용 진행 상태를 한곳에서
          공유할 수 있습니다.
        </p>
      </OrgSection>

      <OrgSection>
        <OrgSectionHeader title="기본 사용 흐름" />
        <div className="divide-y divide-neutral-1000-a05 border-y border-neutral-1000-a05">
          {GUIDE_ITEMS.map((item, index) => {
            return (
              <article
                className="grid gap-2 py-4 sm:grid-cols-[32px_156px_minmax(0,1fr)] sm:items-start"
                key={item.title}
              >
                <span className="text-[12px] font-light text-neutral-soft">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-[14px] font-medium text-neutral-primary">
                  {item.title}
                </h3>
                <p className="text-[13px] font-light leading-6 text-neutral-muted">
                  {item.description}
                </p>
              </article>
            );
          })}
        </div>
      </OrgSection>

      <OrgSection>
        <OrgSectionHeader title="FAQ" />
        <div className="divide-y divide-neutral-1000-a05 border-y border-neutral-1000-a05">
          {FAQ_ITEMS.map((item) => (
            <details className="group py-4" key={item.question}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14px] font-medium text-neutral-primary outline-none marker:hidden">
                {item.question}
                <ChevronDown className="size-3.5 shrink-0 text-neutral-soft transition group-open:rotate-180" />
              </summary>
              <p className="mt-2.5 max-w-3xl pr-8 text-[13px] font-light leading-6 text-neutral-muted">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </OrgSection>
    </div>
  );
}
