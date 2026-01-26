"use client";

import { CheckCircle2, ArrowRight, Clock } from "lucide-react";
import React from "react";

type RecruiterCallSummaryProps = {
  // You can pass real data from your backend later
  duration?: string; // e.g. "23분 18초"
  dateString?: string; // e.g. "2025. 12. 05"
  onClickProfile?: () => void;
  onClickFeedback?: () => void;
};

const RecruiterCallSummaryScreen: React.FC<RecruiterCallSummaryProps> = ({
  duration = "23분 18초",
  dateString = "2025. 12. 05",
  onClickProfile,
  onClickFeedback,
}) => {
  return (
    <div className="w-full flex items-start justify-between px-4 flex-col">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-2xl font-semibold text-neutral-900">
            리크루터 콜이 종료되었습니다.
          </h1>
          <p className="mt-3 text-sm md:text-base text-neutral-600 leading-relaxed">
            오늘 이야기해 주신 내용을 바탕으로, Harper가 지금부터 가장 적합한
            기회를 찾기 시작해요.
          </p>
        </div>

        <div className="hidden md:flex w-full flex-row items-center justify-between text-base text-neutral-500">
          <div className="">{dateString}</div>
          <div className="flex flex-row items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{duration}</span>
          </div>
        </div>
      </div>

      {/* Summary card */}
      {/* <div className="mt-6 md:mt-8 bg-neutral-50 border border-neutral-200 rounded-xl p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-medium text-neutral-900">
              오늘 콜에서 정리된 핵심 요약
            </h2>
          </div>

          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-neutral-500">희망 포지션</dt>
              <dd className="text-neutral-900 font-medium mt-0.5">
                ML Engineer / Researcher
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">관심 분야</dt>
              <dd className="text-neutral-900 font-medium mt-0.5">
                Generative AI, Audio, Multi-modal
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">선호 근무 형태</dt>
              <dd className="text-neutral-900 font-medium mt-0.5">
                Remote-first · US time overlap
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">희망 연봉 구간</dt>
              <dd className="text-neutral-900 font-medium mt-0.5">
                150k ~ 200k USD (협의 가능)
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-xs text-neutral-500">
            * 위 정보는 콜에서 말씀해 주신 내용을 기반으로 정리되며, 이후 프로필
            페이지에서 언제든지 수정하실 수 있어요.
          </p>
        </div> */}

      {/* Next steps */}
      <div className="mt-6 md:mt-12">
        <h3 className="text-sm font-medium text-neutral-900 mb-3">
          앞으로 이렇게 진행돼요.
        </h3>
        <ol className="space-y-2 text-sm">
          <li className="flex gap-3">
            <span className="mt-0.5 h-5 w-5 rounded-full border border-neutral-300 text-[11px] flex items-center justify-center">
              1
            </span>
            <div>
              <p className="font-medium text-neutral-900">
                콜 내용 정리 및 프로필 업데이트
              </p>
              <p className="text-neutral-600 text-xs mt-0.5">
                오늘 대화를 기반으로 Harper가 요약을 정리하고, 프로필과 매칭
                기준을 업데이트해요.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 h-5 w-5 rounded-full border border-neutral-300 text-[11px] flex items-center justify-center">
              2
            </span>
            <div>
              <p className="font-medium text-neutral-900">
                잠재적인 회사 후보 탐색
              </p>
              <p className="text-neutral-600 text-xs mt-0.5">
                선호 조건과 경험에 맞는 팀을 우선적으로 탐색하고, 적합한 팀에게
                지원자님을 추천해요.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 h-5 w-5 rounded-full border border-neutral-300 text-[11px] flex items-center justify-center">
              3
            </span>
            <div>
              <p className="font-medium text-neutral-900">
                매칭 결과 안내 및 다음 콜 제안
              </p>
              <p className="text-neutral-600 text-xs mt-0.5">
                기회가 생기면 이메일과 Harper에서 동시에 안내드리고, 필요하다면
                추가 콜도 제안드릴게요.
              </p>
            </div>
          </li>
        </ol>
      </div>

      {/* Actions */}
      <div className="mt-8 w-full flex flex-col md:flex-col md:items-center md:justify-between gap-3">
        <div className="text-sm text-neutral-500">
          콜 요약과 매칭 진행 상황은{" "}
          <span className="font-medium text-neutral-700">이메일</span>과{" "}
          <span className="font-medium text-neutral-700">프로필</span>
          에서 확인하실 수 있어요.
        </div>

        <button
          type="button"
          onClick={onClickProfile}
          className="flex flex-row items-center justify-center gap-2 cursor-pointer hover:opacity-90 rounded-lg bg-brightnavy text-white py-4 w-full"
        >
          저장 후 진행하기
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default RecruiterCallSummaryScreen;
