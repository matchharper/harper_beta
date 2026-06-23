import React from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { CareerOpportunityType } from "../types";
import { OpportunityType } from "@/lib/opportunityType";
import { getCareerOpportunityInfoCopy } from "../opportunityTypeMeta";
import { useCareerT } from "@/i18n/useCareerT";

const ModalSection = ({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) => (
  <section className="space-y-2.5">
    <h3 className="text-[15px] font-medium leading-6 text-neutral-primary">
      {title}
    </h3>
    {children}
  </section>
);

const Paragraph = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[14px] leading-7 text-neutral-primary/78">{children}</p>
);

const DocumentList = ({ children }: { children: React.ReactNode }) => (
  <ol className="space-y-2.5 pl-5 text-[14px] leading-7 text-neutral-primary/78">
    {children}
  </ol>
);

const DocumentListItem = ({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) => (
  <li className="list-decimal pl-1">
    <span className="font-medium text-neutral-primary">{title}</span>
    <span className="text-neutral-primary/78"> {children}</span>
  </li>
);

const DocumentNote = ({ children }: { children: React.ReactNode }) => (
  <p className="border-l border-neutral-400 pl-4 text-[13px] leading-6 text-neutral-primary/58">
    {children}
  </p>
);

const SectionDivider = () => (
  <div className="h-px w-full bg-neutral-1000-a05" />
);

const HistoryOpportunityInfoModal = ({
  onClose,
  opportunityType,
}: {
  onClose: () => void;
  opportunityType: CareerOpportunityType | null;
}) => {
  const t = useCareerT();

  if (!opportunityType) return null;

  const copy = getCareerOpportunityInfoCopy(opportunityType, t);

  const content = () => {
    if (opportunityType === OpportunityType.IntroRequest) {
      return (
        <div className="space-y-6">
          <ModalSection
            title={t(
              "career.history.history_oppotunity_info_modal.01tamdx",
              "어떤 요청인가요?"
            )}
          >
            <Paragraph>
              {t(
                "career.history.history_oppotunity_info_modal.0q1p4fw",
                "회사 측이 하퍼를 통해 회원님의 프로필을 보고 직접 연결을 요청한 상태입니다. 일반적인 추천보다 회사의 관심이 먼저 확인된 케이스에 가깝습니다."
              )}
            </Paragraph>
            <Paragraph>
              {t(
                "career.history.history_oppotunity_info_modal.1ec32jj",
                "다만 연결을 수락하기 전에는 연락처나 추가 정보가 회사에 전달되지 않습니다. 먼저 회원님의 의사를 확인한 뒤 다음 단계로 넘어갑니다."
              )}
            </Paragraph>
          </ModalSection>

          <SectionDivider />

          <ModalSection
            title={t(
              "career.history.history_oppotunity_info_modal.19qxk26",
              "연결을 수락하면"
            )}
          >
            <DocumentList>
              <DocumentListItem
                title={t(
                  "career.history.history_oppotunity_info_modal.1fhbkg8",
                  "수락 의사를 확인합니다."
                )}
              >
                {t(
                  "career.history.history_oppotunity_info_modal.1jhuftr",
                  "회원님이 괜찮다고 표시한 뒤에만 회사와의 연결 절차를 시작합니다."
                )}
              </DocumentListItem>
              <DocumentListItem
                title={t(
                  "career.history.history_oppotunity_info_modal.0ivukr8",
                  "필요한 연락 정보를 전달합니다."
                )}
              >
                {t(
                  "career.history.history_oppotunity_info_modal.0xzc7b4",
                  "회사 측이 바로 연락할 수 있도록 이메일을 중심으로 연결합니다."
                )}
              </DocumentListItem>
              <DocumentListItem
                title={t(
                  "career.history.history_oppotunity_info_modal.02wru4l",
                  "후속 대화를 이어갑니다."
                )}
              >
                {t(
                  "career.history.history_oppotunity_info_modal.1g5priu",
                  "일정, 역할 범위, 먼저 확인하고 싶은 조건이 있으면 하퍼가 함께 정리합니다."
                )}
              </DocumentListItem>
            </DocumentList>
          </ModalSection>

          <DocumentNote>
            {t(
              "career.history.history_oppotunity_info_modal.0y0d6sb",
              "거절하거나 보류해도 괜찮습니다. 선택 결과는 회사 측에는 부담 없는 방식으로 전달하고, 남겨주신 이유는 다음 연결 요청을 더 잘 거르는 데 사용합니다."
            )}
          </DocumentNote>
        </div>
      );
    }
    if (opportunityType === OpportunityType.ExternalJd) {
      return (
        <div className="space-y-6">
          <ModalSection
            title={t(
              "career.history.history_oppotunity_info_modal.0foa5im",
              "어떤 기회인가요?"
            )}
          >
            <Paragraph>
              {t(
                "career.history.history_oppotunity_info_modal.1myxm8s",
                "하퍼가 회사 채용 페이지, ATS, 공개 포지션에서 확인한 정보를 바탕으로 선별한 기회입니다. 회원님의 경력, 선호 역할, 근무 조건, 피하고 싶은 선택지를 함께 보고 걸러냅니다."
              )}
            </Paragraph>
            <Paragraph>
              {t(
                "career.history.history_oppotunity_info_modal.0cqwlx4",
                "이 타입은 회사와의 직접 연결이 먼저 열려 있는 제안은 아닙니다. 관심이 있다면 공식 JD 링크로 이동해 직접 지원하는 방식입니다."
              )}
            </Paragraph>
          </ModalSection>

          <SectionDivider />

          <ModalSection
            title={t(
              "career.history.history_oppotunity_info_modal.1qugev1",
              "저장하면 하퍼가 활용하는 방식"
            )}
          >
            <DocumentList>
              <DocumentListItem
                title={t(
                  "career.history.history_oppotunity_info_modal.12nroon",
                  "추천 기준이 더 선명해집니다."
                )}
              >
                {t(
                  "career.history.history_oppotunity_info_modal.11hvo3b",
                  "어떤 회사, 역할, 문제 유형에 관심이 있는지 다음 추천에 반영합니다."
                )}
              </DocumentListItem>
              <DocumentListItem
                title={t(
                  "career.history.history_oppotunity_info_modal.09mck3y",
                  "연결 가능성을 찾아봅니다."
                )}
              >
                {t(
                  "career.history.history_oppotunity_info_modal.0zwq8z8",
                  "저장한 회사와 하퍼가 연결할 수 있는 경로가 있는지 내부적으로 확인합니다."
                )}
              </DocumentListItem>
            </DocumentList>
          </ModalSection>

          <DocumentNote>
            {t(
              "career.history.history_oppotunity_info_modal.06bkpp0",
              "저장은 지원이나 프로필 공유가 아닙니다. 관심 표시로만 기록되며, 회사에 회원님 정보가 자동으로 전달되지 않습니다."
            )}
          </DocumentNote>
        </div>
      );
    }
    if (opportunityType === OpportunityType.InternalRecommendation) {
      return (
        <div className="space-y-6">
          <ModalSection
            title={t(
              "career.history.history_oppotunity_info_modal.1qug6jy",
              "어떤 제안인가요?"
            )}
          >
            <Paragraph>
              {t(
                "career.history.history_oppotunity_info_modal.0kiczm5",
                "하퍼가 회사의 채용 니즈를 확인했고, 회원님과 맞을 가능성이 높다고 판단해 먼저 연결 의사를 묻는 추천입니다. 단순히 웹에서 찾은 JD보다 하퍼가 회사와 직접 이어갈 여지가 큰 기회입니다."
              )}
            </Paragraph>
            <Paragraph>
              {t(
                "career.history.history_oppotunity_info_modal.0ntn8vq",
                "연결 수락을 누르기 전에는 회사에 회원님 프로필이나 연락처를 전달하지 않습니다. 먼저 회원님이 이 회사와 이야기해볼 의사가 있는지를 확인합니다."
              )}
            </Paragraph>
          </ModalSection>

          <SectionDivider />

          <ModalSection
            title={t(
              "career.history.history_oppotunity_info_modal.15i7mq0",
              "연결 수락 이후"
            )}
          >
            <DocumentList>
              <DocumentListItem
                title={t(
                  "career.history.history_oppotunity_info_modal.1q6mgg6",
                  "수락 의사를 기록합니다."
                )}
              >
                {t(
                  "career.history.history_oppotunity_info_modal.0xomde1",
                  "회원님이 이 회사와 이야기해볼 의사가 있다고 하퍼가 확인합니다."
                )}
              </DocumentListItem>
              <DocumentListItem
                title={t(
                  "career.history.history_oppotunity_info_modal.1tuk6ef",
                  "추천 맥락을 정리합니다."
                )}
              >
                {t(
                  "career.history.history_oppotunity_info_modal.0al8ecy",
                  "왜 맞는 후보인지, 어떤 경험이 강한지 회사가 이해하기 쉽게 정리합니다."
                )}
              </DocumentListItem>
              <DocumentListItem
                title={t(
                  "career.history.history_oppotunity_info_modal.1raav60",
                  "회사와 다음 단계를 조율합니다."
                )}
              >
                {t(
                  "career.history.history_oppotunity_info_modal.19yfamm",
                  "회사 측 반응, 인터뷰 가능성, 먼저 확인할 조건을 하퍼가 이어서 챙깁니다."
                )}
              </DocumentListItem>
            </DocumentList>
          </ModalSection>

          <DocumentNote>
            {t(
              "career.history.history_oppotunity_info_modal.1ucb8t9",
              "수락 후에도 마음이 바뀌면 하퍼에게 알려주시면 됩니다. 제외됨을 누른 경우에는 맞지 않는 이유를 다음 추천에서 비슷한 기회를 줄이는 데 반영합니다."
            )}
          </DocumentNote>
        </div>
      );
    } else {
      return null;
    }
  };

  return (
    <TalentCareerModal
      open={Boolean(opportunityType)}
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      panelClassName="max-w-[680px] border border-neutral-1000-a05 bg-bg-floating"
      headerClassName="border-neutral-1000-a05 px-5 py-5 sm:px-6"
      bodyClassName="max-h-[72svh] overflow-y-auto bg-bg-floating px-5 py-5 pb-10 sm:px-6"
      closeButtonClassName="right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:border-neutral-400 hover:text-neutral-primary"
    >
      {content()}
    </TalentCareerModal>
  );
};

export default React.memo(HistoryOpportunityInfoModal);
