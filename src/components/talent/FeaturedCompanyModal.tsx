import { ArrowRight, ArrowUpRight } from "lucide-react";
import React from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import type { FeaturedCompanyProfile } from "./featuredCompanies";

type FeaturedCompanyModalProps = {
  open: boolean;
  company: FeaturedCompanyProfile | null;
  onClose: () => void;
  onStartConversation: () => void;
};

const FeaturedCompanyModal = ({
  open,
  company,
  onClose,
  onStartConversation,
}: FeaturedCompanyModalProps) => {
  if (!company) return null;

  const handleStartConversation = () => {
    onClose();
    onStartConversation();
  };

  return (
    <TalentCareerModal
      open={open}
      onClose={onClose}
      title={company.name}
      description={company.summary}
      panelClassName="max-w-[560px] rounded-[18px] border-0 shadow-[0_20px_56px_rgba(17,24,39,0.14)]"
      headerClassName="border-b-0 px-5 pt-5 pb-2"
      bodyClassName="px-5 py-0"
      footerClassName="border-t-0 px-5 pt-2 pb-5"
      closeButtonClassName="right-4 top-4 h-8 w-8 rounded-md border-0 bg-hblack50/80 text-hblack600 hover:bg-hblack100 hover:text-hblack900"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={handleStartConversation}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-xprimary px-4 text-sm font-normal text-hblack000 transition-opacity hover:opacity-90"
          >
            Harper와 대화 시작
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div className="">
        <a
          href={company.officialUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 mt-1 shrink-0 items-center justify-center gap-1 rounded-full bg-hblack50 px-3.5 text-xs font-medium text-hblack800 transition-colors hover:bg-hblack100 hover:text-hblack1000"
        >
          공식 사이트
          <ArrowUpRight className="h-4 w-4" />
        </a>

        <div className="flex flex-wrap gap-2 mt-8">
          {company.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-sm bg-hblack50 px-3 py-1.5 text-xs font-medium text-hblack700"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-1 text-sm mt-4">
          <div>
            <div>- 팀 규모 : 전 세계 약 450명</div>
          </div>
          <div>
            <div>- 평균 연봉 : 약 $160k ~ $220k (한화 약 2.3억 ~ 3.2억)</div>
          </div>
          <div>
            <div>
              - 최근 투자 유치 금액 : 1300억 <span>(2025.11)</span>
            </div>
          </div>
        </div>

        <div className="h-px bg-hblack100/80 mt-6 mb-2" />
      </div>
    </TalentCareerModal>
  );
};

export default FeaturedCompanyModal;
