import { CheckCircle2 } from "lucide-react";
import { memo } from "react";
import type { CareerCallWrapUp } from "../types";

type Props = {
  data: CareerCallWrapUp;
};

const CareerCallWrapUpCard = ({ data }: Props) => (
  <div className="max-w-[920px] rounded-[8px] border border-beige900/10 bg-white/45">
    <div className="flex items-center gap-2 border-b border-beige900/10 px-5 py-3">
      <CheckCircle2 className="h-4 w-4 text-beige900/50" />
      <span className="text-sm font-medium text-beige900/80">통화 요약</span>
    </div>
    <div className="space-y-4 px-5 py-4 text-sm leading-relaxed text-beige900/80">
      {data.whatWeCovered.length > 0 && (
        <div>
          <p className="mb-1.5 font-medium text-beige900">대화 내용</p>
          <ul className="list-inside list-disc space-y-1 text-beige900/70">
            {data.whatWeCovered.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {data.keyLearnings.length > 0 && (
        <div>
          <p className="mb-1.5 font-medium text-beige900">핵심 파악 사항</p>
          <ul className="list-inside list-disc space-y-1 text-beige900/70">
            {data.keyLearnings.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {data.nextSteps.length > 0 && (
        <div>
          <p className="mb-1.5 font-medium text-beige900">다음 단계</p>
          <ul className="list-inside list-disc space-y-1 text-beige900/70">
            {data.nextSteps.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  </div>
);

export default memo(CareerCallWrapUpCard);
