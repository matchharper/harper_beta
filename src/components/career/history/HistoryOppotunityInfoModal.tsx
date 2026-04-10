import React from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { CareerOpportunityType } from "../types";
import { OpportunityType } from "@/lib/opportunityType";
import { getCareerOpportunityInfoCopy } from "../opportunityTypeMeta";

const HistoryOpportunityInfoModal = ({
  onClose,
  opportunityType,
}: {
  onClose: () => void;
  opportunityType: CareerOpportunityType | null;
}) => {
  if (!opportunityType) return null;

  const copy = getCareerOpportunityInfoCopy(opportunityType);
  const titleCss = "text-[15px] font-medium leading-6 text-beige900";
  const descCss = "text-sm leading-6 text-beige900/80";

  const content = () => {
    if (opportunityType === OpportunityType.IntroRequest) {
      return (
        <>
          <div className={titleCss}>이건 무슨 뜻인가요?</div>
          <div className={descCss}>
            본 요청은 다른 추천과는 다릅니다. 인재 채용을 원하는 회사의
            채용담당자에게 저희가 회원님을 추천했고, 프로필을 확인한 담당자가
            직접 저희에게 연결을 요청했습니다.
          </div>
        </>
      );
    }
    if (opportunityType === OpportunityType.ExternalJd) {
      return <></>;
    }
    if (opportunityType === OpportunityType.InternalRecommendation) {
      return (
        <>
          <div className={titleCss}>관심을 표시하면 어떻게 되나요?</div>
          <div className={descCss}>
            현재 추천은 하퍼에게 인재 채용을 요청한 회사들 중 저희가 판단했을 때
            회원님과 잘 맞는다고 판단한 기회입니다.
            <br />
            만약 수락하신다면, 하퍼가 객관적인 입장에서 회사 측에 회원님을
            추천합니다.
            <br />
            저희가 직접 회사 측과 많은 이야기를 나누고 이를 기반으로 한 추천이기
            때문에, 단순한 제안이 아닌 실제로 연결이 성사될 확률이 높은
            추천입니다.
          </div>
          <div className={titleCss}>관심 표시 후, 다시 취소할 수 있나요?</div>
          <div className={descCss}>가능합니다.</div>
        </>
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
      panelClassName="max-w-[620px] border border-beige900/10 bg-beige50"
      bodyClassName="bg-beige50 px-5 py-5"
      closeButtonClassName="font-geist right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-beige900/10 bg-white/70 text-beige900/70 transition-colors hover:border-beige900/25 hover:text-beige900"
    >
      <div className="flex flex-col gap-3">{content()}</div>
    </TalentCareerModal>
  );
};

export default React.memo(HistoryOpportunityInfoModal);
