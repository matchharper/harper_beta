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
  const titleCss = "mt-2 text-[15px] font-medium leading-6 text-beige900";
  const descCss = "text-[14px] leading-6 text-beige900/85";

  const content = () => {
    if (opportunityType === OpportunityType.IntroRequest) {
      return (
        <>
          <div className={titleCss}>연결을 수락하면 어떻게 되나요?</div>
          <div className={descCss}>
            이 요청은 일반적인 추천과 다릅니다.
            <br />
            <br />
            인재 채용을 진행 중인 회사의 채용 담당자가 회원님의 프로필을 직접
            확인한 뒤, Harper를 통해 연결을 요청한 케이스입니다.
            <br />
            <br />
            수락하시면 회원님의 이메일이 회사 측에 전달되며, 이후 이메일을 통해
            직접 연락이 진행됩니다.
          </div>
        </>
      );
    }
    if (opportunityType === OpportunityType.ExternalJd) {
      return (
        <>
          <div className={titleCss}>그 다음 과정은 어떻게 되나요?</div>
          <div className={descCss}>
            현재 기회의 경우 Harper가 외부의 여러 커리어 기회들을 탐색한 뒤
            회원님에게 추천드리고 싶은 기회를 선별한 것입니다.
            <br />
            <br />
            지원을 원하신다면 외부 링크를 통해 직접 지원하실 수 있습니다.
          </div>
          <div className={titleCss}>저장하면 어떻게 되나요?</div>
          <div className={descCss}>
            해당 기회는 직접 지원이 필요합니다.
            <br />
            다만 저장해두신다면 Harper가 어떻게든 해당 회사와 먼저 연결된 뒤,
            회원님을 연결해드리기 위해 노력하겠습니다.
            <br />
            <br />
            또한 저장한 기회를 기반으로 추천 정확도가 점점 더 높아집니다.
          </div>
        </>
      );
    }
    if (opportunityType === OpportunityType.InternalRecommendation) {
      return (
        <>
          <div className={titleCss}>관심을 표시하면 어떻게 되나요?</div>
          <div className={descCss}>
            현재 추천은 하퍼에게 인재 채용을 요청한 회사들 중 저희가 회원님과
            적합하다고 판단한 기회입니다.
            <br />
            <br />
            관심을 표시하시면 Harper가 회사 측에 회원님을 직접 추천하며, 실제
            연결로 이어질 가능성이 매우 높습니다.
            <br />
            <br />
            저희가 직접 회사 측과 많은 이야기를 나누고 이를 기반으로 한 추천이기
            때문에, 단순한 제안이 아닌 실제로 연결이 성사될 확률이 높은
            추천입니다.
          </div>
          <div className={titleCss}>관심 표시 후, 다시 취소할 수 있나요?</div>
          <div className={descCss}>
            언제든지 취소할 수 있습니다. 부담 없이 편하게 선택해주세요.
          </div>
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
      bodyClassName="bg-beige50 px-5 py-5 pb-12"
      closeButtonClassName="font-geist right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:border-beige900/25 hover:text-beige900"
    >
      <div className="flex flex-col gap-3">{content()}</div>
    </TalentCareerModal>
  );
};

export default React.memo(HistoryOpportunityInfoModal);
